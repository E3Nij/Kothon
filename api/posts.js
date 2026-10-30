const L = require('./_lib');

// Validates input; returns { error } or { v } (cleaned fields). cover: '' | data URL | existing /api/cover URL
function clean(b) {
  b = b || {};
  const title = String(b.title || '').trim();
  const body = String(b.body || '');
  const text = String(b.text || '').slice(0, 300000);
  const video = String(b.video || '').trim();
  const cover = String(b.cover || '');
  if (!title || title.length > 120) return { error: 'শিরোনাম ১ থেকে ১২০ অক্ষরের হতে হবে।' };
  if (!L.CATS.includes(b.category)) return { error: 'বিভাগ ঠিক নয়।' };
  if (!body.trim() || body.length > 400000) return { error: 'লেখার অংশ খালি বা অতিরিক্ত বড়।' };
  if (video.length > 500) return { error: 'ভিডিও লিংক অনেক বড়।' };
  if (cover && !cover.startsWith('/api/cover') && !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(cover)) return { error: 'ছবিটি সঠিক নয়।' };
  if (cover.length > 1500000) return { error: 'ছবিটি অনেক বড়।' };
  return { v: { title, category: b.category, body, text, video, cover } };
}

async function saveCover(id, cover) {
  if (cover === '') { await L.sql`DELETE FROM covers WHERE post_id = ${id}`; return false; }
  if (cover.startsWith('/api/cover')) return true; // unchanged
  await L.sql`INSERT INTO covers (post_id, data) VALUES (${id}, ${cover})
              ON CONFLICT (post_id) DO UPDATE SET data = EXCLUDED.data`;
  return true;
}

module.exports = async (req, res) => {
  try {
    await L.init();

    if (req.method === 'GET') {
      const rows = await L.sql`SELECT * FROM posts ORDER BY created_at DESC LIMIT 3000`;
      return L.send(res, 200, { posts: rows.map(L.shapePost) });
    }

    const user = await L.currentUser(req);
    if (!user) return L.fail(res, 401, 'লেখা প্রকাশ করতে লগইন করুন।');
    const id = String((req.query || {}).id || '');

    if (req.method === 'POST') {
      const c = clean(req.body);
      if (c.error) return L.fail(res, 400, c.error);
      const v = c.v, pid = L.newId(), now = Date.now();
      const hasCover = v.cover && !v.cover.startsWith('/api/cover') ? await saveCover(pid, v.cover) : false;
      await L.sql`INSERT INTO posts (id, author_id, author_name, title, category, body, text, video, has_cover, created_at)
                  VALUES (${pid}, ${user.id}, ${user.username}, ${v.title}, ${v.category}, ${v.body}, ${v.text}, ${v.video}, ${hasCover}, ${now})`;
      const r = await L.sql`SELECT * FROM posts WHERE id = ${pid}`;
      return L.send(res, 200, { post: L.shapePost(r[0]) });
    }

    const found = await L.sql`SELECT * FROM posts WHERE id = ${id}`;
    if (!found.length) return L.fail(res, 404, 'লেখাটি পাওয়া যায়নি।');
    if (found[0].author_id !== user.id) return L.fail(res, 403, 'অন্যের লেখা পরিবর্তন করা যায় না।'); // ownership enforced on the server

    if (req.method === 'PUT') {
      const c = clean(req.body);
      if (c.error) return L.fail(res, 400, c.error);
      const v = c.v, hasCover = await saveCover(id, v.cover);
      await L.sql`UPDATE posts SET title=${v.title}, category=${v.category}, body=${v.body}, text=${v.text},
                  video=${v.video}, has_cover=${hasCover}, updated_at=${Date.now()} WHERE id = ${id}`;
      const r = await L.sql`SELECT * FROM posts WHERE id = ${id}`;
      return L.send(res, 200, { post: L.shapePost(r[0]) });
    }

    if (req.method === 'DELETE') {
      await L.sql`DELETE FROM covers WHERE post_id = ${id}`;
      await L.sql`DELETE FROM posts WHERE id = ${id}`;
      return L.send(res, 200, { deleted: true });
    }

    return L.fail(res, 405, 'Method not allowed');
  } catch (e) {
    console.error(e);
    return L.fail(res, 500, 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।');
  }
};
