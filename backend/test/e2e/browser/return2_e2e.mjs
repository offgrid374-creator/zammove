import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('ret2', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const page = async (opt = {}) => { const ctx = await br.newContext({ viewport: { width: 1366, height: 900 }, ...opt }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error('login ' + em + ': ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(1100);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const go = async (p, v) => { await p.evaluate(v => { location.hash = '#' + v; view = v; render(); }, v); await sleep(900); };
const refresh = async p => { await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900); };

/* the renter's phone is about 0.2 km from Putik (the agreed return point) */
const C = await page({ geolocation: { latitude: 6.9425, longitude: 122.0975 }, permissions: ['geolocation'] });
await login(C, 'customer@zammove.test', 'customer');
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#37a'; g.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg'); });
const buf = Buffer.from(jpg.split(',')[1], 'base64');
const fresh = { name: 'p.jpg', mimeType: 'image/jpeg', buffer: buf };
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, jpg]));
const veh = await C.evaluate(() => (S.rentList || [])[0]);
const cr = await act(C, 'createRental', { veh: veh.id, s: day(11), e: day(11), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: day(400), ip: jpg, lp: jpg });
if (!cr.ok) throw new Error(cr.err);
const id = cr.id;
const owner = await C.evaluate(id => S.rn.find(r => r.id == id).owner, id);
const O = await page();
await login(O, owner, 'owner', 'rent');
await act(O, 'rentalDecision', { id, act: 'approve' });
await act(O, 'rentalSign', { id, how: 'paper', photo: jpg });
await C.evaluate(() => ZAPI.refresh());
const r0 = await C.evaluate(id => S.rn.find(x => x.id == id), id), dep = +r0.dep || 2000;
ok((await act(C, 'rentalPay', { id, amount: dep, method: 'GCash', ref: String(Date.now()).slice(-12) })).ok, 'renter pays the deposit by GCash');
ok((await act(C, 'rentalPay', { id, amount: r0.tot, method: 'Cash' })).ok, 'renter pays the rental fee in cash');

/* 1. owner confirms the cash on screen; GCash waits for the cashier */
await refresh(O); await O.evaluate(() => { location.hash = '#rent'; render(); }); await sleep(900);
const box = O.locator('.fx-pays');
ok(/GCash goes to ZamMove: a cashier verifies it/.test(await box.innerText()), 'owner: GCash shown as waiting for the cashier');
await box.scrollIntoViewIfNeeded(); await O.screenshot({ path: 'ret2/1-owner-pays.png' });
await O.locator('[data-a="fx-pv"][data-ok="1"]').first().click(); await sleep(1300);
const cash = await O.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.bid == id && p.method == 'Cash')), id);
ok(cash.status == 'Verified' && cash.coll == owner, 'owner confirmed the cash on screen (held by the owner)');
const A = await page();
await login(A, 'admin@zammove.test', 'cashier', 'pv', 'TestPass1');
for (const pid of await A.evaluate(id => S.pay.filter(p => p.bid == id && p.status == 'Submitted').map(p => p.id), id)) await act(A, 'payVerify', { id: pid, ok: true });
await refresh(O);
ok((await act(O, 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok, 'released');

/* 2. renter returns: location recorded; one photo file is three days old */
await refresh(C); await go(C, 'rent');
await C.locator('.fx-ret summary', { hasText: 'Return the vehicle' }).click(); await sleep(300);
ok(/records the time and your phone’s location/.test(await C.innerText('.fx-ret')), 'renter is told location and time are recorded');
await C.fill(`#fx-rodo-${id}`, '1090'); await C.selectOption(`#fx-rfl-${id}`, 'Full');
await C.evaluate(([id, jpg]) => {
  const bin = atob(jpg.split(',')[1]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  for (const k of ['front', 'back', 'left', 'right', 'odo', 'fuel']) {
    const dt = new DataTransfer(); dt.items.add(new File([u], k + '.jpg', { type: 'image/jpeg', lastModified: k == 'left' ? Date.now() - 3 * 864e5 : Date.now() }));
    document.getElementById(`fx-rhp-${k}-${id}`).files = dt.files;
  }
}, [id, jpg]);
await C.click(`[data-a="fx-ret"][data-id="${id}"]`); await sleep(2200);
const rq = await C.evaluate(id => ZAPI.refresh().then(() => S.rn.find(x => x.id == id).rq), id);
ok(rq && rq.loc && rq.loc.km != null && rq.loc.km < 1, 'return location recorded near the return point: ' + JSON.stringify(rq && rq.loc));
ok(rq && rq.flags.some(f => /Older photo files: Left side/.test(f)), 'the old photo file is flagged: ' + (rq && rq.flags.join('; ')));
await refresh(C); await go(C, 'rent');
ok(/is accepted as you submitted it/.test(await C.innerText('#app')), 'renter sees the owner deadline');

/* 3. owner sees location, flags and deadline */
await refresh(O); await O.evaluate(() => { location.hash = '#rent'; render(); }); await sleep(900);
const q = await O.innerText('.fx-rq');
ok(/km from the agreed return point/.test(q) && /Open in Maps/.test(q), 'owner sees where it was submitted');
ok(/Check before you accept/.test(q) && /Left side/.test(q), 'owner sees the flag');
ok(/Check it by/.test(q), 'owner sees the deadline');
await O.locator('.fx-rq').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'ret2/2-owner-check.png' });
await O.click(`[data-a="fx-rd"][data-id="${id}"][data-match="1"]`); await sleep(1400);
ok((await act(O, 'rentalDecision', { id, act: 'complete' })).ok, 'owner completes the rental');

/* 4. the cash offset: owner earnings + cashier */
await O.evaluate(() => { S.ws = 'owner'; S.wp.owner = 'earn'; save(); }); await refresh(O);
const et = await O.innerText('#app');
ok(/Rental money you collected/.test(et), 'owner earnings explain the cash they collected');
await O.screenshot({ path: 'ret2/3-owner-earnings.png', fullPage: false });
const bal = await O.evaluate(() => S.ownerBal);
await A.evaluate(() => { S.ws = 'cashier'; S.wp.cashier = 'own'; save(); }); await refresh(A);
const pages = ['sum', 'inc', 'led', 'queue', 'pv'];
let found = false;
for (const pg of pages) { await A.evaluate(pg => { S.wp.cashier = pg; render(); }, pg); await sleep(500); if ((await A.locator(`[data-a="zo-remit"][data-em="${owner}"]`).count()) || (await A.locator(`[data-a="zo-pay"][data-em="${owner}"]`).count())) { found = true; break; } }
console.log('INFO owner balance', JSON.stringify(bal));
if (bal.due < 0) {
  ok(found && (await A.locator(`[data-a="zo-remit"][data-em="${owner}"]`).count()) == 1, 'cashier sees the owner owes ZamMove, with a Received form');
  await A.locator(`[data-a="zo-remit"][data-em="${owner}"]`).scrollIntoViewIfNeeded(); await A.screenshot({ path: 'ret2/4-cashier.png' });
  await A.click(`[data-a="zo-remit"][data-em="${owner}"]`); await sleep(1300);
  ok((await O.evaluate(() => ZAPI.refresh().then(() => S.ownerBal.due))) >= -0.005, 'after the cashier records it, the owner owes nothing');
} else ok(found, 'cashier sees the owner balance (owner has other earnings: due ' + bal.due + ')');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
