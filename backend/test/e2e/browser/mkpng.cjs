const z = require('zlib');
const t = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  t[n] = c >>> 0;
}
const crc = b => {
  let c = 0xffffffff;
  for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const ch = (ty, d) => {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(ty), d]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
const w = 40, h = 30, raw = Buffer.alloc((w * 3 + 1) * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 40; raw[i + 1] = 140; raw[i + 2] = 120; }
const ih = Buffer.alloc(13);
ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
require('fs').writeFileSync(__dirname + '/car.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', z.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
console.log('png ok');
