const L = require('./_lib');

// Serves a post's cover image as a real image so browsers can cache it.
module.exports = async (req, res) => {
  try {
    await L.init();
    const id = String((req.query || {}).id || '');
    const r = await L.sql`SELECT data FROM covers WHERE post_id = ${id}`;
    const m = r.length && /^data:(image\/[a-z]+);base64,(.+)$/s.exec(r[0].data);
    if (!m) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(Buffer.from(m[2], 'base64'));
  } catch (e) { console.error(e); res.statusCode = 500; res.end(); }
};
