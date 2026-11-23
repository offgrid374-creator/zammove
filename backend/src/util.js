'use strict';
const crypto = require('crypto');

const now = () => new Date().toISOString();
const r2 = x => Math.round((+x || 0) * 100) / 100;
const A36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rid = p => p + '-' + Array.from({ length: 6 }, () => A36[crypto.randomInt(36)]).join('');
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const randHex = n => crypto.randomBytes(n).toString('hex');
const pin6 = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const norm = t =>
  String(t || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
const peso = n =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const str = (x, max = 300) =>
  String(x == null ? '' : x)
    .trim()
    .slice(0, max);
const isImg = f =>
  typeof f === 'string' &&
  /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(f) &&
  f.length < 2e6;
const img = f => (isImg(f) ? f : '');
const ok = x => ({ ok: true, ...x });
const no = (err, x) => ({ ok: false, err, ...x });
/* Manila wall-clock date/time strings (YYYY-MM-DD + HH:MM) to epoch ms */
const manilaMs = (dt, tm) => new Date(`${dt}T${tm || '00:00'}:00+08:00`).getTime();
const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

/* passwords: scrypt with a per-user salt */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const k = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(key, 'hex');
  return want.length === k.length && crypto.timingSafeEqual(k, want);
}

/* session tokens: base64url(payload).HMAC-SHA256 */
const b64 = b => Buffer.from(b).toString('base64url');
function signToken(payload, secret, ttlMs = 12 * 36e5) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  return body + '.' + b64(crypto.createHmac('sha256', secret).update(body).digest());
}
function readToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  now,
  r2,
  rid,
  sha256,
  randHex,
  pin6,
  norm,
  peso,
  str,
  isImg,
  img,
  ok,
  no,
  manilaMs,
  todayPH,
  hashPassword,
  checkPassword,
  signToken,
  readToken,
};
