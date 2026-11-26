import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('de', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async (w = 1366, h = 900) => { const p = await br.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error(r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);

/* ---- 1. signup asks for the barangay ---- */
const N = await mk(390, 844);
await N.goto(B + '/customer/'); await sleep(900);
await N.evaluate(() => { msg = { mode: 'up' }; render(); }); await sleep(800);
ok((await N.locator('#su-brgy').count()) == 1, 'signup form shows a barangay dropdown');
await N.locator('#su-brgy').scrollIntoViewIfNeeded(); await N.screenshot({ path: 'de/1-signup.png' });
const su = await N.evaluate(() => ZAPI.auth('signup', { name: 'Nina Nuevo', dob: '1995-01-01', ph: '09171239999', ad: 'Purok 2, Putik, Zamboanga City', em: 'nina' + Date.now() + '@t.ph', pw: 'Passw0rd!x', terms: true, brgy: 'Putik, Zamboanga City' }));
ok(su.ok, 'signup with a barangay ' + (su.err || ''));

/* ---- 2. reservation from the booking form ---- */
const C = await mk(); await login(C, 'customer@zammove.test', 'customer');
await C.evaluate(() => { location.hash = '#book'; view = 'book'; render(); }); await sleep(1100);
await C.click('[data-a="pick"][data-id="l3"]'); await sleep(600);
await C.check('#zx-res'); await sleep(400);
ok((await C.locator('#zx-rdt').count()) == 1, 'ticking "Pick it up again later" shows the pick-up date');
await C.fill('#zx-rdt', day(56)); await C.dispatchEvent('#zx-rdt', 'change'); await C.fill('#zx-rtm', '16:00'); await C.dispatchEvent('#zx-rtm', 'change');
await C.locator('#zx-res-box').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'de/2-reservation.png' });
const r1 = await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(53), tm: '09:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' });
ok(r1.ok, 'reservation booked ' + (r1.err || ''));
const pk = await C.evaluate(id => ZAPI.refresh().then(() => S.bk.find(b => b.id == id).pkg), r1.id);
ok(pk && pk.days == 4 && pk.ret, `reservation: ${pk && pk.days} days held, pick-up ${pk && pk.ret}`);
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; render(); }); await sleep(900);
ok(/Reservation: we drop off/.test(await C.innerText('#app')) && /Prepaid pick-up of reservation/.test(await C.innerText('#app')), 'booking cards explain the reservation and the prepaid pick-up');

/* ---- 3. add another vehicle or drop-off to the same move ---- */
await C.click(`[data-a="zx-more"][data-id="${r1.id}"]`); await sleep(1200);
ok(/Adding to booking/.test(await C.innerText('#app')), 'the booking form says it adds to the existing booking');
ok((await C.inputValue('#dt')) == day(53), 'the date is pre-filled from the first booking');
const r2 = await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Sta. Maria, Zamboanga City', dt: day(53), tm: '09:00', vid: 'l3', mv: 0, it: 'Two cabinets and a bed frame', sz: 'S' });
ok(r2.ok, 'second booking created ' + (r2.err || ''));
const g = await C.evaluate(([a, b]) => ZAPI.refresh().then(() => [S.bk.find(x => x.id == a).grp, S.bk.find(x => x.id == b).grp]), [r1.id, r2.id]);
ok(g[0] && g[0] == g[1], 'both bookings are in one group ' + g[0]);

/* ---- 4. delivery QR ---- */
const bid = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(58), tm: '09:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id: bid });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id: bid, to });
const due = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), bid);
await act(D, 'driverPay', { id: bid, kind: 'down', g: 0, c: due, rcv: due });
await act(D, 'step', { id: bid, to: 'Items Loaded', note: 'Sofa, 3 boxes, refrigerator' });
const pin = (await act(C, 'vNewPin', { id: bid })).pin;
await act(D, 'vVerify', { id: bid, kind: 'pin', input: pin });
const plate = await D.evaluate(id => ZAPI.refresh().then(() => { const b = S.bk.find(x => x.id == id); return S.vh.find(v => v.id == b.veh).plate; }), bid);
await act(D, 'vPlate', { id: bid, input: plate });
const items = await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).ver.items), bid);
const sv = await act(D, 'vSave', { id: bid, count: 5, items: items.map(() => true), frag: items.map(x => (x.fr ? { pad: true, strap: true } : {})) });
await act(D, 'vDriverConfirm', { id: bid }); await act(C, 'vCustomerConfirm', { id: bid, reviewed: true });
const au = await act(D, 'vAuthorize', { id: bid });
await act(D, 'step', { id: bid, to: 'Arrived at Destination' });
await C.evaluate(() => { location.hash = '#track'; view = 'track'; ZAPI.refresh().then(() => render()); }); await sleep(2200);
ok((await C.locator('.dz-qrc svg').count()) == 1, 'customer sees the delivery QR code' + (au.ok ? '' : ' (authorize: ' + au.err + ')'));
await C.locator('.dz-qr').scrollIntoViewIfNeeded().catch(() => {}); await C.screenshot({ path: 'de/3-delivery-qr.png' });
await D.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1200);
ok((await D.locator('[data-a="dz-scan"]').count()) == 1, 'driver sees "Scan QR"');

/* ---- 5. rental with a driver ---- */
const O = await mk(); await login(O, 'owner2@zammove.test', 'owner', 'rent');
const vid = await O.evaluate(() => (S.vh.find(v => v.owner == S.me.em && v.rent && v.rent.on) || {}).id);
await act(O, 'vehRent', { id: vid, on: true, day: 2800, drv: 900 });
await C.evaluate(() => ZAPI.refresh());
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d').fillRect(0, 0, 32, 32); return c.toDataURL('image/jpeg'); });
const rr = await act(C, 'createRental', { veh: vid, s: day(65), e: day(66), pu: 'Tetuan, Zamboanga City', ip: jpg, withDrv: true });
ok(rr.ok, 'rental with a driver requested with a valid ID only ' + (rr.err || ''));
await O.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900);
ok((await O.locator(`#fx-dsel-${rr.id}`).count()) == 1, 'owner chooses the driver before approving');
await O.selectOption(`#fx-dsel-${rr.id}`, { index: 1 });
await O.click(`[data-a="fx-rd"][data-id="${rr.id}"][data-x="approve"]`); await sleep(1300);
const wd = await O.evaluate(id => ZAPI.refresh().then(() => S.rn.find(r => r.id == id)), rr.id);
ok(wd.st == 'Approved' && wd.withDrv && wd.withDrv.name, 'approved with driver ' + (wd.withDrv || {}).name);
await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; ZAPI.refresh().then(() => render()); }); await sleep(1100);
ok(/With a driver: .* drives for you/.test(await C.innerText('#app')), 'renter sees who drives');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
