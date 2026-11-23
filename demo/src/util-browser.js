'use strict';
/* Browser replacement for backend/src/util.js (same exports). Used only by the front-end demo.
   Node's crypto is replaced by the Web Crypto random generator and a small synchronous SHA-256.
   Passwords are hashed with a salted SHA-256: fine for a demo that stores data in the browser,
   NOT a replacement for the server's scrypt. */

const rnd = n => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
const now = () => new Date().toISOString();
const r2 = x => Math.round((+x || 0) * 100) / 100;
const A36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rid = p => p + '-' + Array.from({ length: 6 }, () => A36[rnd(36)]).join('');

/* SHA-256 (UTF-8), returns hex */
function sha256(input) {
  const msg = unescape(encodeURIComponent(String(input)));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = [];
  for (let i = 0; i < msg.length; i++) bytes.push(msg.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 != 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const w = new Array(64);
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3),
        s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25),
        ch = (e & f) ^ (~e & g),
        t1 = (h + S1 + ch + K[i] + w[i]) | 0,
        S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22),
        mj = (a & b) ^ (a & c) ^ (b & c),
        t2 = (S0 + mj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const randHex = n => Array.from({ length: n }, () => rnd(256).toString(16).padStart(2, '0')).join('');
const pin6 = () => String(rnd(1e6)).padStart(6, '0');
const norm = t =>
  String(t || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const str = (x, max = 300) =>
  String(x == null ? '' : x)
    .trim()
    .slice(0, max);
/* the browser demo accepts slightly larger images (uploads are already resized by the page) */
const isImg = f => typeof f === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(f) && f.length < 2e6;
const img = f => (isImg(f) ? f : '');
const ok = x => ({ ok: true, ...x });
const no = (err, x) => ({ ok: false, err, ...x });
const manilaMs = (dt, tm) => new Date(`${dt}T${tm || '00:00'}:00+08:00`).getTime();
const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
function hashPassword(pw) {
  const salt = randHex(16);
  return `demo$${salt}$${sha256(salt + String(pw))}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, key] = String(stored || '').split('$');
  return alg === 'demo' && !!salt && sha256(salt + String(pw)) === key;
}
/* sessions in the demo: the token only names the account and its token version */
const signToken = payload => btoa(JSON.stringify({ em: payload.em, tv: payload.tv || 0 }));
const readToken = token => {
  try {
    return JSON.parse(atob(String(token || '')));
  } catch (e) {
    return null;
  }
};

module.exports = { now, r2, rid, sha256, randHex, pin6, norm, peso, str, isImg, img, ok, no, manilaMs, todayPH, hashPassword, checkPassword, signToken, readToken };
