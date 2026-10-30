// Shared helpers for all API routes (files starting with "_" are not exposed as routes)
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const SECRET = process.env.AUTH_SECRET || crypto.createHash('sha256').update('kothon:' + (DB_URL || '')).digest('hex');
const sql = DB_URL ? neon(DB_URL) : null;
const CATS = ['poetry', 'stories', 'novels', 'articles', 'literature'];

let ready = null;
function init() {
  if (!sql) throw new Error('DATABASE_URL is not set');
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, username_lower TEXT UNIQUE NOT NULL,
        salt TEXT NOT NULL, hash TEXT NOT NULL, created_at BIGINT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY, author_id TEXT NOT NULL, author_name TEXT NOT NULL, title TEXT NOT NULL,
        category TEXT NOT NULL, body TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', video TEXT NOT NULL DEFAULT '',
        has_cover BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL, updated_at BIGINT)`;
      await sql`CREATE TABLE IF NOT EXISTS covers (post_id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const newId = () => crypto.randomBytes(9).toString('base64url');

function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(uid) {
  const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  const s = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  return p + '.' + s;
}
function readToken(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [p, s] = t.split('.');
  if (!p || !s) return null;
  const good = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (!safeEqual(s, good)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() ? d.uid : null;
  } catch (e) { return null; }
}
async function currentUser(req) {
  const uid = readToken(req);
  if (!uid) return null;
  const r = await sql`SELECT id, username FROM users WHERE id = ${uid}`;
  return r[0] || null;
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
const fail = (res, status, error) => send(res, status, { error });

function shapePost(r) {
  return {
    id: r.id, authorId: r.author_id, authorName: r.author_name, title: r.title, category: r.category,
    body: r.body, text: r.text, video: r.video,
    cover: r.has_cover ? '/api/cover?id=' + encodeURIComponent(r.id) + '&v=' + (r.updated_at || r.created_at) : '',
    createdAt: Number(r.created_at), updatedAt: r.updated_at == null ? null : Number(r.updated_at)
  };
}

module.exports = { sql, init, CATS, newId, hashPassword, safeEqual, signToken, currentUser, send, fail, shapePost };
