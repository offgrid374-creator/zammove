import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('rec', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async (w = 1366, h = 900) => { const p = await br.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error(r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const refresh = async p => { await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900); };

const C = await mk(); await login(C, 'customer@zammove.test', 'customer');
/* ---- 1. edit addresses before a driver accepts ---- */
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(46), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; ZAPI.refresh().then(() => render()); }); await sleep(1100);
await C.locator('.zb-led summary', { hasText: 'Wrong address' }).first().click(); await sleep(200);
await C.fill(`#zr2-dr-${id}`, 'Sta. Maria, Zamboanga City');
await C.locator(`[data-a="zr2-edit"][data-id="${id}"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'rec/1-edit.png' });
await C.click(`[data-a="zr2-edit"][data-id="${id}"]`); await sleep(1300);
ok(await C.evaluate(id => S.bk.find(b => b.id == id).dr == 'Sta. Maria, Zamboanga City', id), 'customer edited the drop-off before acceptance');

/* ---- 2. driver taps a step by mistake: Undo ---- */
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
await act(D, 'step', { id, to: 'On the Way to Pickup' });
await refresh(D);
ok((await D.locator('.zu-bar [data-a="zu-undo"]').count()) >= 1, 'an Undo bar appears after the step');
await D.screenshot({ path: 'rec/2-undo-bar.png' });
await D.locator(`.zu-bar [data-a="zu-undo"][data-id="${id}"]`).click(); await sleep(1300);
ok(await D.evaluate(id => S.bk.find(b => b.id == id).st == 'Accepted', id), 'Undo put the trip back to Accepted');

/* ---- 3. a payment entered wrong: driver proposes, customer approves ---- */
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
await refresh(D);
await D.locator('summary', { hasText: 'Entered a payment wrong' }).click(); await sleep(200);
await D.fill(`#zr2-g-${id}-down`, '100'); await D.fill(`#zr2-c-${id}-down`, String(Math.round((due - 100) * 100) / 100)); await D.fill(`#zr2-r-${id}-down`, '1000'); await D.fill(`#zr2-f-${id}-down`, '1231231234'); await D.fill(`#zr2-w-${id}-down`, 'Customer paid 100 by GCash');
await D.click(`[data-a="zr2-fix"][data-id="${id}"][data-k="down"]`); await sleep(1300);
await refresh(C);
ok(/Your driver asks to correct the down payment/.test(await C.innerText('#app')), 'customer sees the correction to approve');
await C.locator(`[data-a="zr2-ans"][data-id="${id}"][data-ok="1"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'rec/3-correction.png' });
await C.click(`[data-a="zr2-ans"][data-id="${id}"][data-ok="1"]`); await sleep(1300);
ok(await C.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id && p.status == 'Recorded by driver').map(p => p.method).sort().join() == 'Cash,GCash'), id), 'correction applied: GCash + cash');

/* ---- 4. admin Corrections: step the trip back ---- */
const A = await mk();
await A.goto(B + '/admin/'); await sleep(700);
await A.fill('#em', 'admin@zammove.test'); await A.fill('#pw', 'TestPass1'); await A.click('button[type=submit]'); await sleep(1500);
await A.locator('nav a, nav button, aside a, aside button').filter({ hasText: 'Corrections' }).first().click(); await sleep(800);
await A.fill('#zf-q', id); await A.click('[data-a="zfix-find"]'); await sleep(600);
ok((await A.locator(`[data-a="zfix"][data-k="cancel"][data-id="${id}"]`).count()) == 1, 'admin finds the booking with correction actions');
await A.screenshot({ path: 'rec/4-admin-fix.png' });
const vp = await A.evaluate(id => S.pay.find(p => p.bid == id && p.method == 'Cash').id, id);
await A.fill('#zf-why', 'Duplicate cash record entered by the driver');
await A.click(`[data-a="zfix"][data-k="void-pay"][data-id="${vp}"]`); await sleep(1300);
ok(await A.evaluate(id => ZAPI.refresh().then(() => S.bk.find(b => b.id == id).st == 'Awaiting Down Payment'), id), 'voiding the payment stepped the trip back to the down payment');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
