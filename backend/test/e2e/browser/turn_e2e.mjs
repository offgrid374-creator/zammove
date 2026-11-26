import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('turn', { recursive: true });
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

const C = await mk(390, 844); await login(C, 'customer@zammove.test', 'customer');
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
const owner = await D.evaluate(() => { const a = S.asg.find(x => x.driver == S.me.em && x.st == 'Active'); return a ? (S.vh.find(v => v.id == a.vehicle) || {}).owner : ''; });
const O = await mk(); await login(O, owner, 'owner', 'drv');
await act(O, 'ownerGcash', { no: '09175551234', name: 'Maria Alvarez' });

/* a new booking, paid half by GCash to the owner and half in cash */
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(44), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; ZAPI.refresh().then(() => render()); }); await sleep(1100);
await C.click(`[data-a="zb-pm"][data-id="${id}"][data-m="gcash"]`); await sleep(500);
ok(/Send GCash to the vehicle owner: 0917 555 1234 \(Maria Alvarez\)/.test(await C.innerText('#app')), 'customer is told to send GCash to the owner’s number');
await C.locator('.zb-payto').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'turn/1-customer-gcash.png' });
const down = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
await act(C, 'payDeclare', { id, kind: 'down', g: down, c: 0, ref: String(Date.now()).slice(-11) });
const ref = await C.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.bid == id && p.status == 'Submitted').ref), id);
ok((await act(D, 'driverPay', { id, kind: 'down', g: down, c: 0, ref })).ok, 'driver recorded the GCash down payment');
/* finish the trip quickly: steps and verification through the API */
await act(D, 'step', { id, to: 'Items Loaded', note: 'Sofa, 3 boxes, refrigerator' });
const pin = (await act(C, 'vNewPin', { id })).pin;
await act(D, 'vVerify', { id, kind: 'pin', input: pin });
const plate = await D.evaluate(id => ZAPI.refresh().then(() => { const b = S.bk.find(x => x.id == id); return S.vh.find(v => v.id == b.veh).plate; }), id);
await act(D, 'vPlate', { id, input: plate });
const items = await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).ver.items), id);
await act(D, 'vSave', { id, count: 5, items: items.map(() => true), frag: items.map(x => (x.fr ? { pad: true, strap: true } : {})) });
await act(D, 'vDriverConfirm', { id }); await act(C, 'vCustomerConfirm', { id, reviewed: true }); await act(D, 'vAuthorize', { id });
await act(D, 'step', { id, to: 'Arrived at Destination' });
const dp = (await act(C, 'dNewPin', { id })).pin;
await act(D, 'dDeliver', { id, input: dp, note: 'All items fine' });
await act(D, 'step', { id, to: 'Awaiting Final Payment' });
const fin = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'final')), id);
ok((await act(D, 'driverPay', { id, kind: 'final', g: 0, c: fin, rcv: fin })).ok, 'driver collected the balance in cash; trip completed');

/* ---- driver: turn over ---- */
await D.evaluate(() => { S.wp.driver = 'earn'; ZAPI.refresh().then(() => render()); }); await sleep(1300);
const T = await D.evaluate(() => S.turn);
ok(/Turn over to your owner/.test(await D.innerText('#app')) && /You owe/.test(await D.innerText('#app')), `driver sees what they owe their owner (₱${T.bal})`);
await D.locator('#zt2-drv').scrollIntoViewIfNeeded(); await D.screenshot({ path: 'turn/2-driver-turnover.png' });
await D.click('[data-a="zt2-send"]'); await sleep(1300);
ok(await D.evaluate(() => ZAPI.refresh().then(() => (S.pay || []).some(p => p.kind == 'turnover' && p.status == 'Submitted'))), 'driver recorded the turnover');

/* ---- owner: confirm, then the weekly remittance covers ZamMove's portion ---- */
await O.evaluate(() => { S.wp.owner = 'drv'; ZAPI.refresh().then(() => render()); }); await sleep(1300);
ok(/Money from drivers/.test(await O.innerText('#app')), 'owner sees money from drivers');
await O.locator('#zt2-own').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'turn/3-owner-confirm.png' });
const tid = await O.evaluate(() => S.pay.find(p => p.kind == 'turnover' && p.status == 'Submitted').id);
await O.click(`[data-a="zt2-ok"][data-id="${tid}"][data-ok="1"]`); await sleep(1300);
const after = await O.evaluate(() => ZAPI.refresh().then(() => [S.pay.find(p => p.kind == 'turnover').status, (S.drvBal || []).find(d => d.em.startsWith('driver2')), S.ownerBal]));
ok(after[0] == 'Verified' && Math.abs(after[1].bal) < 0.01, 'owner confirmed; the driver is even');
ok(after[2].tripsOwed > 0 && after[2].due < 0, `owner owes ZamMove ₱${after[2].tripsOwed} for the trip (balance ${after[2].due})`);
await O.evaluate(() => { S.wp.owner = 'earn'; render(); }); await sleep(1100);
ok(/fee and commission from trips on your vehicles/.test(await O.innerText('#app')) && (await O.locator('[data-a="zo-orm"]').count()) == 1, 'owner Earnings explains it and offers "Remit to ZamMove"');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
