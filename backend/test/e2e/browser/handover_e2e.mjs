import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('ho', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const TET = { latitude: 6.9194, longitude: 122.084, accuracy: 20 };
const mk = async w => {
  const ctx = await br.newContext({ viewport: { width: w, height: 900 }, geolocation: TET, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  return p;
};
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); }, [r.me, ws, wp]);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const go = async (p, fn) => { await p.evaluate(fn); await sleep(900); };
const renterPage = p => go(p, () => ZAPI.refresh().then(() => { location.hash = '#rent'; view = 'rent'; render(); }));
const ownerPage = p => go(p, () => ZAPI.refresh().then(() => { S.ws = 'owner'; S.wp.owner = 'rent'; render(); }));
const IMG = 'data:image/png;base64,iVBORw0KGgo=';

/* a pickup 1.5–11 hours from now inside 6 AM – 8 PM (Manila) */
const slot = () => {
  const now = Date.now();
  for (let d = 0; d < 2; d++)
    for (let m = 6 * 60; m <= 20 * 60; m += 30) {
      const day = new Date(now + 8 * 36e5 + d * 864e5).toISOString().slice(0, 10),
        hh = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'),
        t = new Date(`${day}T${hh}:00+08:00`).getTime();
      if (t > now + 1.5 * 36e5 && t < now + 11.9 * 36e5) return { day, hh, next: new Date(t + 864e5 + 8 * 36e5).toISOString().slice(0, 10) };
    }
};
const { day, hh, next } = slot();

const O = await mk(1366);
let veh = null;
for (const em of ['owner1@zammove.test', 'owner2@zammove.test']) {
  await login(O, em, 'owner', 'rent');
  veh = await O.evaluate(() => (S.vh || []).find(v => v.owner == S.me.em && v.rent && v.rent.on !== false));
  if (veh) break;
}
const C = await mk(390);
await login(C, 'customer@zammove.test', 'customer');
await renterPage(C);
ok((await C.locator('#fx-pt').count()) == 1 && (await C.locator('#fx-rt').count()) == 1, 'Rent page: pickup and return time pickers');
await C.screenshot({ path: 'ho/0-times.png' });
const req = await act(C, 'createRental', { veh: veh.id, s: day, e: next, pt: hh, rtm: '17:00', pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City', lic: 'N01-23-456789', exp: '2030-01-01', ip: IMG, lp: IMG });
ok(req.ok, 'rental requested for ' + day + ' ' + hh + ' ' + (req.err || ''));
const id = req.id;
const say = (k, r) => !r.ok && console.log('  ' + k + ':', r.err);
say('approve', await act(O, 'rentalDecision', { id, act: 'approve' }));
say('sign', await act(O, 'rentalSign', { id, how: 'paper', photo: IMG }));
const bal = await C.evaluate(id => ZAPI.refresh().then(() => { const r = S.rn.find(x => x.id == id); return r.tot + r.dep; }), id);
say('pay', await act(C, 'rentalPay', { id, amount: bal, method: 'Cash' }));
for (const pid of await O.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id && p.status == 'Submitted').map(p => p.id)), id)) say('verify', await act(O, 'payVerify', { id: pid, ok: true }));

/* renter: pickup check */
await renterPage(C);
ok(/Pickup check/.test(await C.innerText('#app')), 'renter sees the pickup check');
await C.locator(`[data-a="zh-loc"][data-id="${id}"]`).click(); await sleep(1300);
await C.locator(`[data-a="zh-code"][data-id="${id}"]`).click(); await sleep(1300);
const pin = (await C.locator('.zh-code b.n').innerText()).replace(/\s/g, '');
ok(/^\d{6}$/.test(pin) && (await C.locator('.zh-qr svg').count()) == 1, 'renter shows a Release code with QR');
await C.locator('.zh-code').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'ho/1-renter-code.png' });

/* owner: location + code */
await ownerPage(O);
await O.locator(`[data-a="zh-loc"][data-id="${id}"][data-st="out"]`).click(); await sleep(1300);
await O.fill(`#zh-in-${id}-out`, pin);
await O.locator(`[data-a="zh-ver"][data-id="${id}"]`).click(); await sleep(1300);
ok(/Confirmed .* \(PIN\)/.test(await O.innerText('#app')), 'owner confirmed the Release code');

/* renter: plate */
await renterPage(C);
await C.fill(`#zh-pl-${id}`, veh.plate.toLowerCase());
await C.locator(`[data-a="zh-plate"][data-id="${id}"]`).click(); await sleep(1300);
ok(/Plate matches/.test(await C.innerText('#app')), 'renter confirmed the plate');

/* owner: record */
await ownerPage(O);
await O.fill(`#fx-odo-${id}`, '52000');
for (const k of ['front', 'back', 'left', 'right', 'odo', 'fuel']) await O.setInputFiles(`#fx-hp-${k}-${id}`, 'car.png');
await O.locator('.zh').first().scrollIntoViewIfNeeded(); await O.screenshot({ path: 'ho/2-owner-record.png' });
await O.locator(`[data-a="fx-rd"][data-id="${id}"][data-x="release"]`).click(); await sleep(1800);
ok(/Waiting for the renter to confirm your record/.test(await O.innerText('#app')), 'owner record sent to the renter');

/* renter: confirm */
await renterPage(C);
await C.locator(`[data-a="zh-ok"][data-id="${id}"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'ho/3-renter-confirm.png' });
await C.locator(`[data-a="zh-ok"][data-id="${id}"]`).click(); await sleep(1400);
ok(await C.evaluate(id => S.rn.find(r => r.id == id).st == 'Active', id), 'rental Active after both confirm');

/* return */
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, IMG]));
say('return', await act(C, 'rentalReturn', { id, odo: 52150, fuel: 'Full', ph: PH, note: 'Clean', loc: { lat: TET.latitude, lng: TET.longitude, acc: 20 } }));
await renterPage(C);
await C.locator(`[data-a="zh-loc"][data-id="${id}"][data-st="back"]`).click(); await sleep(1200);
await C.locator(`[data-a="zh-code"][data-id="${id}"][data-st="back"]`).click(); await sleep(1300);
const rpin = (await C.locator('.zh-code b.n').innerText()).replace(/\s/g, '');
await ownerPage(O);
ok(/Return check/.test(await O.innerText('#app')), 'owner sees the return check');
await O.locator(`[data-a="zh-loc"][data-id="${id}"][data-st="back"]`).click(); await sleep(1200);
await O.fill(`#zh-in-${id}-back`, rpin);
await O.locator(`[data-a="zh-ver"][data-id="${id}"][data-st="back"]`).click(); await sleep(1300);
await O.screenshot({ path: 'ho/4-owner-return.png' });
await O.locator(`[data-a="fx-rd"][data-id="${id}"][data-x="return"][data-match="1"]`).click(); await sleep(1500);
ok(await O.evaluate(id => ZAPI.refresh().then(() => S.rn.find(r => r.id == id).st == 'Returned'), id), 'owner received it with the Return code and marked it returned');
await renterPage(C);
await C.screenshot({ path: 'ho/5-renter-returned.png', fullPage: true });
ok(!(await C.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'phone: no sideways scroll');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
