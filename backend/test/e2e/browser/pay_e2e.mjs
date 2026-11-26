import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('pay', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push(e.message));
await login(C, 'customer@zammove.test', 'customer');
const b = await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(11), tm: '14:00', vid: 'l3', mv: 0, it: 'Sofa and 4 boxes', sz: 'M' });
ok(b.ok, 'booking ' + (b.err || b.id));
const D = await br.newPage(); D.on('pageerror', e => errs.push(e.message));
await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' });
await act(D, 'accept', { id: b.id });
await act(D, 'step', { id: b.id, to: 'On the Way to Pickup' });
await act(D, 'step', { id: b.id, to: 'Awaiting Down Payment' });

await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; render(); }); await sleep(1200);
const due = await C.evaluate(id => ZPAY.due(S.bk.find(x => x.id == id), 'down'), b.id);
const opts = await C.$$eval(`[data-a="zb-pm"][data-id="${b.id}"]`, l => l.map(x => x.textContent));
ok(opts.join('|') == 'Cash|GCash|Cash + GCash', 'customer sees the three choices: ' + opts.join(', '));
ok(/Hand ₱[\d,.]+ in cash to/.test(await C.innerText('.zb-cash')), 'Cash (default): instructions to hand the cash to the driver');
await C.click(`[data-a="zb-pm"][data-id="${b.id}"][data-m="gcash"]`); await sleep(500);
ok((await C.getAttribute('#pg' + b.id, 'readonly')) !== null && +(await C.inputValue('#pg' + b.id)) == due, 'GCash: the full amount, with a reference field');
await C.click(`[data-a="zb-pm"][data-id="${b.id}"][data-m="both"]`); await sleep(500);
await C.fill('#pg' + b.id, '500');
const split = await C.innerText('#zb-split-' + b.id);
const rest = Math.round((due - 500) * 100) / 100;
ok(split.includes(rest.toLocaleString('en-PH', { minimumFractionDigits: 2 })), 'Cash + GCash: the cash part updates live: ' + split);
await C.locator('.zb-pay').first().scrollIntoViewIfNeeded();
await C.screenshot({ path: 'pay/1-both.png', animations: 'disabled', timeout: 8000 }).catch(() => {});
await C.fill('#pr' + b.id, '7012398765432');
await C.click(`[data-a="pay"][data-id="${b.id}"]`); await sleep(1200);
const proof = await C.evaluate(id => S.pay.find(p => p.bid == id && p.status == 'Submitted'), b.id);
ok(proof && proof.amount == 500 && proof.method == 'GCash', 'the GCash part was submitted (₱500)');
await C.evaluate(() => render()); await sleep(500);
ok(/Hand the other .+ in cash to/.test(await C.innerText('#app')), 'after submitting, the customer is reminded of the cash part');
await C.screenshot({ path: 'pay/2-waiting.png', animations: 'disabled', timeout: 8000 }).catch(() => {});

/* the driver records both parts: the GCash part with its reference, the rest in cash */
const r = await act(D, 'driverPay', { id: b.id, kind: 'down', g: 500, ref: '7012398765432', c: rest, rcv: Math.ceil(rest / 100) * 100 });
ok(r.ok, 'driver recorded GCash ₱500 + cash ₱' + rest + ' ' + (r.err || ''));
await C.evaluate(() => ZAPI.refresh()); await sleep(300);
ok(await C.evaluate(id => S.bk.find(x => x.id == id).st, b.id) == 'Down Payment Confirmed', 'the down payment is complete');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
