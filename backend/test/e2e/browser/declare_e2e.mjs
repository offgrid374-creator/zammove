import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('dcl', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async (w = 1366, h = 900) => { const p = await br.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);

const C = await mk(390, 844); await login(C, 'customer@zammove.test', 'customer');
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(57), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await C.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
const cash = Math.round((due - 100) * 100) / 100;

/* 1. customer: Cash + GCash, GCash ₱100, hands over ₱1,000 more than the cash part */
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; render(); }); await sleep(900);
await C.click(`[data-a="zb-pm"][data-id="${id}"][data-m="both"]`); await sleep(400);
await C.fill(`#pg${id}`, '100'); await C.dispatchEvent(`#pg${id}`, 'input'); await sleep(200);
ok(Number(await C.inputValue(`#pc${id}`)) == cash, `cash part follows the GCash part (₱${cash})`);
await C.fill(`#pr${id}`, '7012398765432');
await C.fill(`#cg${id}`, String(cash + 1000)); await C.dispatchEvent(`#cg${id}`, 'input'); await sleep(200);
ok(/Your change: ₱1,000\.00/.test(await C.innerText(`#zb-chg-${id}`)), 'customer sees the change they should get (₱1,000)');
await C.locator(`[data-a="zb-decl"][data-id="${id}"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'dcl/1-customer-hybrid.png' });
await C.click(`[data-a="zb-decl"][data-id="${id}"]`); await sleep(1300);
const decl = await C.evaluate(id => ZAPI.refresh().then(() => S.bk.find(b => b.id == id).decl.down), id);
ok(decl && decl.g == 100 && decl.c == cash && decl.cg == cash + 1000 && decl.chg == 1000, 'declaration saved: GCash 100, cash part, cash handed, change 1,000');
await C.evaluate(() => render()); await sleep(600);
ok(/You told .*GCash.*Cash you hand over.*Change to get back/s.test(await C.innerText('.zb-decl')), 'customer sees a summary of what they told the driver');
await C.locator('.zb-decl').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'dcl/2-customer-told.png' });

/* 2. driver: sees the declaration, pre-filled; a different cash amount is blocked */
await D.evaluate(() => { S.wp.driver = 'trip'; ZAPI.refresh().then(() => render()); }); await sleep(1300);
const drvTxt = await D.innerText('#app');
ok(/The customer says they pay/.test(drvTxt) && /give back ₱1,000\.00 change/.test(drvTxt), 'driver sees the declaration with the expected change');
ok(Number(await D.inputValue(`#g-${id}`)) == 100 && Number(await D.inputValue(`#rv-${id}`)) == cash + 1000, 'driver form is pre-filled from the declaration');
await D.fill(`#rv-${id}`, String(cash + 500));
await D.click(`[data-a="w-pay"][data-id="${id}"]`); await sleep(1300);
ok(/does not match what the customer declared/.test(await D.innerText('#app')), 'a different cash amount is blocked with an explanation');
ok(await D.locator(`details.zd-force[open]`).count() == 1, '"What I received is different" opens');
await D.screenshot({ path: 'dcl/3-driver-mismatch.png' });
await D.fill(`#why-${id}`, 'The customer handed ₱500 less than they said');
await D.click(`[data-a="w-payf"][data-id="${id}"]`); await sleep(1400);
const tx = await D.evaluate(id => ZAPI.refresh().then(() => (S.pay.find(p => p.bid == id && p.status == 'Recorded by driver') || {}).tx), id);
ok(tx && tx.match === false && tx.rcv == cash + 500 && /500 less/.test(tx.why), 'recorded with the note; the transaction is marked as differing');

/* 3. the receipt shows the whole transaction and both versions */
await C.evaluate(() => { msg.bt = 'pay'; render(); }); await sleep(500);
const ref = await C.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.bid == id && p.method == 'Cash' && p.status == 'Recorded by driver').ref), id);
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; msg.bt = 'pay'; msg.rc = ''; render(); }); await sleep(900);
await C.click(`[data-a="rc"][data-id="${ref}"]`); await sleep(700);
const rc = await C.innerText('.rcpt');
ok(/Amount due/.test(rc) && /Paid by GCash/.test(rc) && /Cash handed over/.test(rc) && /Change given back/.test(rc), 'receipt lists due, GCash, cash handed and change');
ok(/Customer declared/.test(rc) && /Driver recorded/.test(rc) && /Amounts differ/.test(rc) && /500 less/.test(rc), 'receipt shows both versions, the difference and the driver’s note');
await C.locator('.rcpt').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'dcl/4-receipt.png' });
ok(await C.evaluate(() => S.nt.some(n => /differs from what you declared/.test(n.b))), 'the customer was told it differs');

ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
