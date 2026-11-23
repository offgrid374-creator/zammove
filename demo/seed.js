/* ZamMove front-end demo: the example data loaded the first time the demo opens (and after "Reset demo").
   Every name, plate, phone number and photo is fictional; the photos are drawn on a canvas.
   Dates are relative to the moment the demo is seeded. Generated from the Figma capture data. */
window.ZM_SEED = function () {
  const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10),
    iso = h => new Date(Date.now() - h * 36e5).toISOString();
  const IMG = (() => {
  const cv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c.toDataURL('image/jpeg', 0.85); };
  const avatar = (bg, skin, shirt) => cv(240, 240, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = shirt; g.beginPath(); g.ellipse(120, 250, 95, 80, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = skin; g.fillRect(104, 140, 32, 40); g.beginPath(); g.ellipse(120, 105, 46, 54, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b1d16'; g.beginPath(); g.ellipse(120, 70, 50, 30, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(70, 66, 100, 14);
  });
  const card = (title, color) => cv(420, 264, (g, w, h) => {
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, w, h); g.fillStyle = color; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.fillText(title, 18, 35);
    g.fillStyle = '#c9ced6'; g.fillRect(18, 74, 110, 136); g.fillStyle = '#9aa3b0'; g.beginPath(); g.arc(73, 125, 28, 0, 7); g.fill(); g.fillRect(43, 160, 60, 40);
    g.fillStyle = '#556070'; g.font = '16px Arial'; ['JUAN M. DELA CRUZ', 'N01-23-456789', 'Valid until 2028-12-31', 'SAMPLE ONLY'].forEach((t, i) => g.fillText(t, 148, 100 + i * 30));
  });
  /* handover photos of the Pearl White L300 (ZAM 5150) and a damage close-up, drawn as samples */
  const tag = (g, w, h, dark) => { g.fillStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.55)'; g.fillRect(w - 104, h - 28, 98, 22); g.fillStyle = '#fff'; g.font = 'bold 12px Arial'; g.fillText('SAMPLE PHOTO', w - 97, h - 12); };
  const scene = f => cv(480, 360, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#dbe7f1'); sky.addColorStop(0.55, '#eef2f5'); sky.addColorStop(0.56, '#9aa1a8'); sky.addColorStop(1, '#7d848b'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8e8e0'; g.lineWidth = 4; for (let x = -40; x < w; x += 120) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 60, 200); g.stroke(); }
    f(g, w, h); tag(g, w, h);
  });
  const wheel = (g, x, y, r) => { g.fillStyle = '#1f2328'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill(); };
  const BODY = '#f3f2ec', EDGE = '#c9c8c0', GLASS = '#4b5a6a';
  const side = flip => scene((g, w) => {
    g.save(); if (flip) { g.translate(w, 0); g.scale(-1, 1); }
    g.fillStyle = BODY; g.strokeStyle = EDGE; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, 270); g.lineTo(40, 150); g.quadraticCurveTo(44, 110, 90, 104); g.lineTo(440, 100); g.lineTo(440, 270); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = GLASS; g.beginPath(); g.moveTo(58, 160); g.quadraticCurveTo(62, 122, 96, 118); g.lineTo(150, 118); g.lineTo(150, 165); g.closePath(); g.fill();
    g.fillRect(162, 118, 70, 47); g.fillStyle = '#e1e0d9'; g.fillRect(250, 112, 186, 120);
    g.strokeStyle = '#b5b4ac'; g.beginPath(); g.moveTo(156, 115); g.lineTo(156, 262); g.moveTo(240, 115); g.lineTo(240, 262); g.stroke();
    g.fillStyle = '#d97706'; g.fillRect(42, 205, 10, 14);
    wheel(g, 110, 272, 34); wheel(g, 370, 272, 34);
    g.restore();
  });
  const front = scene(g => {
    g.fillStyle = BODY; g.strokeStyle = EDGE; g.lineWidth = 3; g.beginPath(); g.moveTo(110, 290); g.lineTo(100, 120); g.quadraticCurveTo(240, 88, 380, 120); g.lineTo(370, 290); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = GLASS; g.beginPath(); g.moveTo(122, 185); g.lineTo(118, 132); g.quadraticCurveTo(240, 106, 362, 132); g.lineTo(358, 185); g.closePath(); g.fill();
    g.fillStyle = '#fef9c3'; g.fillRect(124, 205, 52, 22); g.fillRect(304, 205, 52, 22); g.fillStyle = '#3f4650'; g.fillRect(190, 205, 100, 30);
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.fillRect(190, 248, 100, 28); g.strokeRect(190, 248, 100, 28); g.fillStyle = '#111'; g.font = 'bold 17px Arial'; g.fillText('ZAM 5150', 199, 268);
    wheel(g, 140, 300, 20); wheel(g, 340, 300, 20);
  });
  const back = scene(g => {
    g.fillStyle = BODY; g.strokeStyle = EDGE; g.lineWidth = 3; g.fillRect(105, 110, 270, 180); g.strokeRect(105, 110, 270, 180);
    g.strokeStyle = '#b5b4ac'; g.beginPath(); g.moveTo(240, 112); g.lineTo(240, 288); g.stroke();
    g.fillStyle = '#b91c1c'; g.fillRect(110, 150, 18, 60); g.fillRect(352, 150, 18, 60);
    g.fillStyle = '#d6d5ce'; g.fillRect(120, 290, 240, 14);
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.fillRect(190, 236, 100, 28); g.strokeRect(190, 236, 100, 28); g.fillStyle = '#111'; g.font = 'bold 17px Arial'; g.fillText('ZAM 5150', 199, 256);
    wheel(g, 140, 305, 18); wheel(g, 340, 305, 18);
  });
  const dash = draw => cv(480, 360, (g, w, h) => {
    const bg = g.createRadialGradient(240, 180, 40, 240, 180, 300); bg.addColorStop(0, '#2a3038'); bg.addColorStop(1, '#0d1014'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    draw(g); tag(g, w, h, true);
  });
  const odo = km => dash(g => {
    g.strokeStyle = '#7dd3fc'; g.lineWidth = 6; g.beginPath(); g.arc(240, 190, 130, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    g.fillStyle = '#cbd5e1'; g.font = '16px Arial'; g.fillText('km/h', 222, 140);
    g.fillStyle = '#05080b'; g.fillRect(150, 215, 180, 48); g.strokeStyle = '#475569'; g.lineWidth = 2; g.strokeRect(150, 215, 180, 48);
    g.fillStyle = '#a7f3d0'; g.font = 'bold 34px Courier New'; g.fillText(km, 162, 251); g.font = '14px Arial'; g.fillStyle = '#94a3b8'; g.fillText('ODO  km', 205, 285);
    g.strokeStyle = '#f97316'; g.lineWidth = 5; g.beginPath(); g.moveTo(240, 190); g.lineTo(175, 120); g.stroke();
  });
  const fuel = lvl => dash(g => {
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 8; g.beginPath(); g.arc(240, 230, 140, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = '#e2e8f0'; g.font = 'bold 26px Arial'; g.fillText('E', 118, 210); g.fillText('F', 345, 210);
    const a = Math.PI * (1.15 + 0.7 * lvl); g.strokeStyle = '#ef4444'; g.lineWidth = 6; g.beginPath(); g.moveTo(240, 230); g.lineTo(240 + Math.cos(a) * 125, 230 + Math.sin(a) * 125); g.stroke();
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(240, 230, 12, 0, 7); g.fill(); g.fillStyle = '#94a3b8'; g.font = '16px Arial'; g.fillText('FUEL', 220, 280);
  });
  const damage = cv(480, 360, (g, w, h) => {
    const p = g.createLinearGradient(0, 0, w, h); p.addColorStop(0, '#f6f5ef'); p.addColorStop(1, '#dad9d2'); g.fillStyle = p; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#bdbcb4'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 120); g.lineTo(w, 110); g.moveTo(330, 0); g.lineTo(330, h); g.stroke();
    g.fillStyle = '#9ca3af'; g.fillRect(350, 170, 60, 16);
    g.strokeStyle = '#6b6a64'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(120, 205); g.bezierCurveTo(170, 196, 220, 214, 280, 200); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(130, 212); g.lineTo(250, 210); g.stroke();
    g.strokeStyle = '#dc2626'; g.lineWidth = 4; g.beginPath(); g.ellipse(200, 206, 105, 40, 0, 0, 7); g.stroke();
    g.fillStyle = '#dc2626'; g.font = 'bold 18px Arial'; g.fillText('new scratch, left door', 112, 290);
    tag(g, w, h);
  });
  const quote = cv(360, 460, (g, w, h) => {
    g.fillStyle = '#fffdf7'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'bold 20px Arial'; g.fillText('JM AUTO PAINT', 24, 44); g.font = '13px Arial'; g.fillStyle = '#555'; g.fillText('Sta. Maria, Zamboanga City (sample)', 24, 66);
    g.fillStyle = '#111'; g.font = 'bold 15px Arial'; g.fillText('QUOTATION', 24, 108); g.font = '14px Arial';
    [['Repaint left door panel', '3,200'], ['Polish and clear coat', '900'], ['Labor', '400']].forEach(([a, b], i) => { g.fillText(a, 24, 148 + i * 30); g.fillText(b, 270, 148 + i * 30); });
    g.fillRect(24, 240, 312, 2); g.font = 'bold 16px Arial'; g.fillText('TOTAL  PHP 4,500', 150, 270);
  });
  const L = side(false), Rt = side(true);
  return { car: { front, back, left: L, right: Rt, odo: odo('052310'), fuel: fuel(0.75) }, carBack: { front, back, left: L, right: Rt, odo: odo('052480'), fuel: fuel(0.72) }, damage, quote, leo: avatar(['#bbf7d0', '#86efac'], '#b07a52', '#7c2d12'), dina: avatar(['#c7d2fe', '#a5b4fc'], '#c68e62', '#0f766e'), ramon: avatar(['#fde68a', '#fcd34d'], '#a8724b', '#1e3a8a'), id: card('NATIONAL ID · SAMPLE', '#1d4ed8'), lic: card("DRIVER'S LICENSE · SAMPLE", '#0f766e') };
})();
/* ---------- example data ---------- */
const u = (name, em, ph, x = {}) => ({ name, em, ph, ad: 'Tetuan, Zamboanga City', dob: '1990-01-01', ver: true, roles: [], cr: iso(2000), ...x });
const DR = { t: 'driver', st: 'approved', at: '2026-03-02T00:00:00Z' }, OW = { t: 'owner', st: 'approved' };
const users = [
  u('Carla Mendoza', 'carla@zammove.ph', '09171234501'), u('Bea Santos', 'bea@zammove.ph', '09171234502'), u('Jun Alvarez', 'jun@zammove.ph', '09171234503'),
  u('Dina Reyes', 'dina@zammove.ph', '09171234504', { roles: [DR], photo: IMG.dina }), u('Ramon Cruz', 'ramon@zammove.ph', '09171234505', { roles: [DR], photo: IMG.ramon }),
  u('Olga Navarro', 'olga@zammove.ph', '09171234506', { roles: [OW] }), u('Ada Villanueva', 'ada@zammove.ph', '09171234507', { adm: 'super' }),
  u('Kim Bautista', 'kim@zammove.ph', '09171234508', { cash: true }), u('Leo Garcia', 'leo@zammove.ph', '09171234511', { roles: [DR], photo: IMG.leo }), u('Ana Lim', 'ana@zammove.ph', '09171234509', { roles: [{ t: 'driver', st: 'pending' }] }),
];
const V = (id, type, brand, model, plate, color, year, x = {}) => ({ id, owner: 'olga@zammove.ph', type, brand, model, plate, color, year, approval: 'Approved', status: 'Available', regExp: day(400), legal: { ins: 'CTPL-' + plate.replace(/\D/g, ''), insExp: day(300), cpc: 'CPC-2025-' + plate.replace(/\D/g, ''), cpcExp: day(600) }, docs: [{ name: 'OR/CR', file: IMG.id }], hist: [], seats: 3, trans: 'Manual', fuel: 'Diesel', ...x });
const vh = [
  V('VH-L300A', 'l3', 'Mitsubishi', 'L300', 'ZAM 4521', 'White', 2021, { cap: '1.5 tons · 10 ft', desc: 'Moving blankets and straps on board' }),
  V('VH-L300B', 'l3', 'Mitsubishi', 'L300', 'ZAM 7810', 'Silver', 2022, { cap: '1.5 tons · 10 ft', desc: 'Tarpaulin cover' }),
  V('VH-L300C', 'l3', 'Mitsubishi', 'L300', 'ZAM 3307', 'Blue', 2020, { cap: '1.5 tons · 10 ft', desc: 'Rubber floor mat, rope included', rent: { on: true, day: 2200, dep: 6000 } }),
  V('VH-L300D', 'l3', 'Mitsubishi', 'L300', 'ZAM 5150', 'Pearl White', 2023, { cap: '1.5 tons · 10 ft', desc: 'Newest unit, dual aircon', rent: { on: true, day: 2500, dep: 8000 } }),
  V('VH-VIOS1', 'sd', 'Toyota', 'Vios', 'ZAM 2024', 'Red Mica', 2023, { cap: '4–5 passengers · trunk for 2–3 bags', seats: 5, trans: 'Automatic', fuel: 'Gasoline', desc: 'Bluetooth audio, rear camera', rent: { on: true, day: 1800, dep: 5000 } }),
  V('VH-HIACE', 'mv', 'Toyota', 'Hiace', 'ZAM 8890', 'White Pearl', 2021, { cap: '10–15 passengers', seats: 15, desc: 'Rear aircon, sliding door', rent: { on: true, day: 3500, dep: 10000 } }),
  V('VH-HILUX', 'pk', 'Toyota', 'Hilux', 'ZAM 6612', 'Gray', 2022, { cap: '1 ton · 8 ft bed', seats: 5, desc: 'Open bed, tie-down hooks', rent: { on: true, day: 2800, dep: 7000 } }),
  V('VH-L300E', 'l3', 'Mitsubishi', 'L300', 'ZAM 3388', 'White', 2022, { cap: '1.5 tons · 10 ft', desc: 'Moving blankets, dolly and straps' }),
  V('VH-6WHL', 'w6', 'Isuzu', 'Forward', 'ZAM 9902', 'Silver', 2020, { cap: '6 tons · 20 ft', approval: 'Pending Approval', status: 'Unavailable' }),
];
const ev = list => list.map(([to, h, by, note]) => ({ t: iso(h), by, from: '', to, note: note || '' }));
const items = 'Sofa, 3 boxes, Refrigerator';
const trail = [[6.9172, 122.0731], [6.9185, 122.0742], [6.9201, 122.0755], [6.9214, 122.0768], [6.9230, 122.0779]].map((p, i) => [...p, Date.now() - (5 - i) * 60000]);
const data = {
  users, vh,
  asg: [{ id: 'AS-1', vehicle: 'VH-L300A', driver: 'dina@zammove.ph', by: 'olga@zammove.ph', mode: 'Owner assignment', st: 'Active', hist: [{ st: 'Active', t: iso(900), by: 'ada@zammove.ph' }] },
    { id: 'AS-3', vehicle: 'VH-L300E', driver: 'leo@zammove.ph', by: 'olga@zammove.ph', mode: 'Owner assignment', st: 'Active', hist: [{ st: 'Active', t: iso(700), by: 'ada@zammove.ph' }] },
    { id: 'AS-2', vehicle: 'VH-L300B', driver: 'ramon@zammove.ph', by: 'olga@zammove.ph', mode: 'Owner assignment', st: 'Active', hist: [{ st: 'Active', t: iso(800), by: 'ada@zammove.ph' }] }],
  dp: { 'dina@zammove.ph': { avail: 'Available' }, 'ramon@zammove.ph': { avail: 'Available' }, 'leo@zammove.ph': { avail: 'Available' } },
  bk: [
    { id: 'BK-7Q2M4X', cu: 'carla@zammove.ph', pu: 'Tetuan, Zamboanga City', dr: 'Pasonanca, Zamboanga City', dt: day(0), tm: '09:00', it: items, si: 'Fridge is fragile, 2nd floor', vid: 'l3', vn: 'L300 Van', mv: 1, km: 4, tot: 2541, bd: [1800, 120, 500, 121], st: 'Items Loaded', drvUser: 'dina@zammove.ph', drv: 'Dina Reyes', veh: 'VH-L300A', cr: iso(30),
      ev: ev([['Pending', 30, 'carla@zammove.ph', 'Booking requested'], ['Accepted', 29, 'dina@zammove.ph'], ['On the Way to Pickup', 3, 'dina@zammove.ph'], ['Awaiting Down Payment', 2, 'dina@zammove.ph'], ['Down Payment Confirmed', 1.5, 'dina@zammove.ph', 'Down payment GCash + Cash'], ['Items Loaded', 1, 'dina@zammove.ph', 'Sofa, 3 boxes, fridge wrapped']]) },
    { id: 'BK-5MW8RT', cu: 'bea@zammove.ph', pu: 'Sta. Maria, Zamboanga City', dr: 'Tumaga, Zamboanga City', dt: day(0), tm: '10:30', it: 'Washing machine, 5 boxes, electric fan', vid: 'l3', vn: 'L300 Van', mv: 1, km: 5, tot: 2672, bd: [1800, 150, 500, 127], st: 'On the Way to Pickup', drvUser: 'ramon@zammove.ph', drv: 'Ramon Cruz', veh: 'VH-L300B', cr: iso(20),
      gps: { lat: 6.923, lng: 122.0779, acc: 12, spd: 8.3, hdg: 200, t: new Date(Date.now() - 15000).toISOString(), ms: Date.now() - 15000, inArea: true }, trail, gpsStart: iso(0.1),
      wz: 'https://waze.com/ul?ll=6.9172,122.0731&navigate=yes',
      ev: ev([['Pending', 20, 'bea@zammove.ph', 'Booking requested'], ['Accepted', 19, 'ramon@zammove.ph'], ['On the Way to Pickup', 0.2, 'ramon@zammove.ph']]) },
    { id: 'BK-3HD8LK', cu: 'carla@zammove.ph', pu: 'Guiwan, Zamboanga City', dr: 'Ayala, Zamboanga City', dt: day(-6), tm: '13:00', it: '6 boxes, study table', vid: 'l3', vn: 'L300 Van', mv: 0, km: 9, tot: 2174, bd: [1800, 270, 0, 104], st: 'Completed', drvUser: 'dina@zammove.ph', drv: 'Dina Reyes', veh: 'VH-L300A', cr: iso(170), cd: iso(140), pod: { t: iso(141), via: 'delivery PIN', note: 'All 7 pieces delivered, no damage' },
      ev: ev([['Pending', 170, 'carla@zammove.ph'], ['Accepted', 169, 'dina@zammove.ph'], ['In Transit', 143, 'dina@zammove.ph'], ['Delivery Confirmation', 141, 'dina@zammove.ph'], ['Completed', 140, 'dina@zammove.ph', 'Final payment Cash']]) },
    { id: 'BK-2PL6NV', cu: 'jun@zammove.ph', pu: 'Canelar, Zamboanga City', dr: 'Divisoria, Zamboanga City', dt: day(-10), tm: '08:00', it: 'Office chairs, 2 desks', vid: 'l3', vn: 'L300 Van', mv: 0, km: 6, tot: 2079, bd: [1800, 180, 0, 99], st: 'Completed', drvUser: 'ramon@zammove.ph', drv: 'Ramon Cruz', veh: 'VH-L300B', cr: iso(260), cd: iso(240), ev: ev([['Pending', 260, 'jun@zammove.ph'], ['Completed', 240, 'ramon@zammove.ph']]) },
    { id: 'BK-9KX2PQ', cu: 'jun@zammove.ph', pu: 'Putik, Zamboanga City', dr: 'Lunzuran, Zamboanga City', dt: day(3), tm: '10:00', it: 'Bed frame, mattress, 4 boxes', vid: 'l3', vn: 'L300 Van', mv: 2, km: 7, tot: 3150, bd: [1800, 210, 1000, 140], st: 'Pending', drv: '', cr: iso(0.1), ev: ev([['Pending', 0.1, 'jun@zammove.ph']]) },
  ],
  pay: [
    { id: 'PY-1', bid: 'BK-7Q2M4X', kind: 'down', method: 'GCash', amount: 1000, ref: '7012345678901', payer: 'carla@zammove.ph', status: 'Recorded by driver', by: 'dina@zammove.ph', collectedBy: 'dina@zammove.ph', t: iso(1.5) },
    { id: 'PY-2', bid: 'BK-7Q2M4X', kind: 'down', method: 'Cash', amount: 270.5, ref: 'CSH-A1', payer: 'carla@zammove.ph', status: 'Recorded by driver', by: 'dina@zammove.ph', collectedBy: 'dina@zammove.ph', t: iso(1.5) },
    { id: 'PY-3', bid: 'BK-3HD8LK', kind: 'down', method: 'Cash', amount: 1087, ref: 'CSH-B1', payer: 'carla@zammove.ph', status: 'Recorded by driver', by: 'dina@zammove.ph', collectedBy: 'dina@zammove.ph', t: iso(150) },
    { id: 'PY-4', bid: 'BK-3HD8LK', kind: 'final', method: 'Cash', amount: 1087, ref: 'CSH-B2', payer: 'carla@zammove.ph', status: 'Recorded by driver', by: 'dina@zammove.ph', collectedBy: 'dina@zammove.ph', t: iso(140) },
    { id: 'PY-5', bid: 'BK-2PL6NV', kind: 'down', method: 'GCash', amount: 1039.5, ref: '7033344455566', payer: 'jun@zammove.ph', status: 'Recorded by driver', by: 'ramon@zammove.ph', collectedBy: 'ramon@zammove.ph', t: iso(250) },
    { id: 'PY-6', bid: 'BK-2PL6NV', kind: 'final', method: 'Cash', amount: 1039.5, ref: 'CSH-C2', payer: 'jun@zammove.ph', status: 'Recorded by driver', by: 'ramon@zammove.ph', collectedBy: 'ramon@zammove.ph', t: iso(240) },
    { id: 'PY-7', bid: 'RN-5TV8WQ', kind: 'deposit', method: 'GCash', amount: 5000, ref: '7098765432109', payer: 'carla@zammove.ph', status: 'Submitted', t: iso(5) },
  ],
  rn: [
    { id: 'RN-5TV8WQ', cu: 'carla@zammove.ph', veh: 'VH-VIOS1', vid: 'VH-VIOS1', vt: 'sd', owner: 'olga@zammove.ph', vn: 'Toyota Vios', day: 1800, s: day(5), e: day(7), days: 3, tot: 5400, dep: 5000, st: 'Approved', pu: 'Zone I (Downtown), Zamboanga City', rt: 'Zone I (Downtown), Zamboanga City', lic: 'N01-23-456789', exp: day(700), ip: IMG.id, lp: IMG.lic, cr: iso(26), hist: [{ st: 'Pending', t: iso(26), by: 'carla@zammove.ph' }, { st: 'Approved', t: iso(20), by: 'olga@zammove.ph' }] },
    { id: 'RN-8JD3KA', cu: 'jun@zammove.ph', veh: 'VH-L300C', vid: 'VH-L300C', vt: 'l3', owner: 'olga@zammove.ph', vn: 'Mitsubishi L300', day: 2200, s: day(12), e: day(13), days: 2, tot: 4400, dep: 6000, st: 'Pending', pu: 'Putik, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N04-21-998877', exp: day(500), ip: IMG.id, lp: IMG.lic, cr: iso(2), hist: [{ st: 'Pending', t: iso(2), by: 'jun@zammove.ph' }] },
  ],
  inc: [{ id: 'IN-4RT6YB', by: 'carla@zammove.ph', bid: 'BK-7Q2M4X', cat: 'Delay', sev: 'Medium', w: iso(2).slice(0, 16), d: 'Driver arrived 40 minutes late; no message beforehand.', st: 'Under review', t: iso(2), log: [{ t: iso(1.8), by: 'ada@zammove.ph', act: 'start', note: '' }] }],
  rev: [{ id: 'RV-1', bid: 'BK-3HD8LK', by: 'carla@zammove.ph', r: 5, t: 'Careful with the furniture and on time.', cr: iso(139) },
    { id: 'RV-2', bid: 'BK-2PL6NV', by: 'jun@zammove.ph', r: 5, t: 'Very polite, helped carry the desks upstairs.', cr: iso(239) }],
  rem: [{ id: 'RM-1', drv: 'dina@zammove.ph', week: day(-13), bks: ['BK-3HD8LK'], gross: 2174, rate: 80, due: 1739.2, method: 'GCash', ref: '7055512345678', st: 'Submitted', t: iso(20) }],
  apps: [{ id: 'AP-8HJ2KD', user: 'ana@zammove.ph', role: 'driver', st: 'Under Verification', info: { phone: '09171234509', address: 'Putik, Zamboanga City', license: 'N02-19-112233' }, docs: [{ name: 'Professional driver’s license', file: IMG.lic }, { name: 'Government-issued ID', file: IMG.id }], req: '', iv: null, orient: false, hist: [{ st: 'Pending Review', t: iso(48), by: 'ana@zammove.ph' }, { st: 'Under Verification', t: iso(24), by: 'ada@zammove.ph' }] }],
  nt: [
    { id: 'NT-1', to: 'carla@zammove.ph', t: iso(1), h: 'Booking BK-7Q2M4X', b: 'Status is now Items Loaded.', r: false },
    { id: 'NT-2', to: 'carla@zammove.ph', t: iso(1.5), h: 'Payment confirmed', b: '₱1,270.50 down payment for BK-7Q2M4X was recorded by your driver.', r: false },
    { id: 'NT-3', to: 'carla@zammove.ph', t: iso(20), h: 'Rental RN-5TV8WQ', b: 'Approved. Read and sign the rental contract and pay the full ₱10,400.00 before pickup.', r: false },
    { id: 'NT-4', to: 'carla@zammove.ph', t: iso(29), h: 'Booking accepted', b: 'BK-7Q2M4X was accepted by Dina Reyes.', r: true },
    { id: 'NT-5', to: 'olga@zammove.ph', t: iso(2), h: 'New rental request', b: 'RN-8JD3KA: Mitsubishi L300 (ZAM 3307).', r: false },
  ],
  au: [
    { id: 'AU-1', t: iso(1), who: 'dina@zammove.ph', evt: 'trip Items Loaded', data: { bk: 'BK-7Q2M4X' } },
    { id: 'AU-2', t: iso(2), who: 'jun@zammove.ph', evt: 'rental requested', data: { id: 'RN-8JD3KA' } },
    { id: 'AU-3', t: iso(20), who: 'olga@zammove.ph', evt: 'rental approve', data: { id: 'RN-5TV8WQ' } },
    { id: 'AU-4', t: iso(24), who: 'ada@zammove.ph', evt: 'application verify', data: { app: 'AP-8HJ2KD' } },
  ],
};
  return data;
};
