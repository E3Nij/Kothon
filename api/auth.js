const L = require('./_lib');

const USER_RE = /^[\p{L}\p{M}\p{N}._-]+$/u;

module.exports = async (req, res) => {
  try {
    await L.init();

    // GET -> who am I (validates the saved token)
    if (req.method === 'GET') {
      const u = await L.currentUser(req);
      return u ? L.send(res, 200, { user: u }) : L.fail(res, 401, 'সেশন শেষ হয়ে গেছে।');
    }
    if (req.method !== 'POST') return L.fail(res, 405, 'Method not allowed');

    const { action } = req.body || {};
    const username = String((req.body || {}).username || '').trim();
    const password = String((req.body || {}).password || '');

    if (action === 'register') {
      const len = Array.from(username).length;
      if (len < 3 || len > 24 || !USER_RE.test(username)) return L.fail(res, 400, 'ইউজারনেম ৩ থেকে ২৪ অক্ষরের হতে হবে (অক্ষর, সংখ্যা, . _ - চলবে)।');
      if (password.length < 4 || password.length > 200) return L.fail(res, 400, 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      const exists = await L.sql`SELECT 1 FROM users WHERE username_lower = ${username.toLowerCase()}`;
      if (exists.length) return L.fail(res, 409, 'এই ইউজারনেমটি আগে থেকেই নেওয়া আছে।');
      const id = L.newId(), salt = L.newId();
      try {
        await L.sql`INSERT INTO users (id, username, username_lower, salt, hash, created_at)
                    VALUES (${id}, ${username}, ${username.toLowerCase()}, ${salt}, ${L.hashPassword(password, salt)}, ${Date.now()})`;
      } catch (e) { return L.fail(res, 409, 'এই ইউজারনেমটি আগে থেকেই নেওয়া আছে।'); }
      return L.send(res, 200, { token: L.signToken(id), user: { id, username } });
    }

    if (action === 'login') {
      if (!username || !password) return L.fail(res, 400, 'ইউজারনেম ও পাসওয়ার্ড দুটোই দিন।');
      const r = await L.sql`SELECT * FROM users WHERE username_lower = ${username.toLowerCase()}`;
      if (!r.length) return L.fail(res, 401, 'এই ইউজারনেমে কোনো অ্যাকাউন্ট নেই।');
      if (!L.safeEqual(L.hashPassword(password, r[0].salt), r[0].hash)) return L.fail(res, 401, 'পাসওয়ার্ড ভুল হয়েছে।');
      return L.send(res, 200, { token: L.signToken(r[0].id), user: { id: r[0].id, username: r[0].username } });
    }

    return L.fail(res, 400, 'Bad request');
  } catch (e) {
    console.error(e);
    return L.fail(res, 500, 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।');
  }
};
