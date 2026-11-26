import { chromium } from 'playwright-core';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
fs.mkdirSync('p12', { recursive: true });
const SP = process.env.SPW, DATA = SP + '\\e2e-data.json', BE = process.env.BEW;
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
let srv;
const start = async () => {
  srv = spawn('node', ['server.js'], { cwd: BE, env: { ...process.env, PORT: '3100', STORE: 'file', DATA_FILE: DATA }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/health'); return; } catch { await sleep(300); } }
};
const stop = async () => { srv.kill(); await sleep(1200); };
await start();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async () => { const p = await br.newPage({ viewport: { width: 1366, height: 900 } }); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error('login ' + em + ': ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const refresh = async p => { await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(800); };
const rentPage = async (p, ws) => { await p.evaluate(ws => { if (ws == 'customer') { location.hash = '#rent'; view = 'rent'; } else S.wp[ws] = 'rent'; save(); render(); }, ws); await sleep(900); };

const C = await mk(); await login(C, 'customer@zammove.test', 'customer');
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; c.getContext('2d').fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg'); });
fs.writeFileSync('p12/p.jpg', Buffer.from(jpg.split(',')[1], 'base64'));
const vehs = await C.evaluate(() => S.rentList.map(v => v.id));

/* ---- 1. change dates while pending, then cancel a paid rental (free) ---- */
const id1 = (await act(C, 'createRental', { veh: vehs[0], s: day(30), e: day(31), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: day(400), ip: jpg, lp: jpg })).id;
await refresh(C); await rentPage(C, 'customer');
await C.locator(`#fx-ce-${id1}`).evaluate(e => e.closest('details').open = true);
await C.fill(`#fx-cs-${id1}`, day(32)); await C.fill(`#fx-ce-${id1}`, day(33));
await C.click(`[data-a="fx-chg"][data-id="${id1}"]`); await sleep(1200);
ok(await C.evaluate(([id, d]) => ZAPI.refresh().then(() => S.rn.find(r => r.id == id).s == d), [id1, day(32)]), 'renter changed the dates of a pending request on screen');
const owner1 = await C.evaluate(id => S.rn.find(r => r.id == id).owner, id1);
const O = await mk(); await login(O, owner1, 'owner', 'rent');
await act(O, 'rentalDecision', { id: id1, act: 'approve' });
await act(O, 'ownerGcash', { no: '09175551234', name: 'Owner Name' });
await C.evaluate(() => ZAPI.refresh());
const r1 = await C.evaluate(id => S.rn.find(x => x.id == id), id1);
await act(C, 'rentalPay', { id: id1, amount: r1.tot + (+r1.dep || 2000), method: 'Cash' });
for (const pid of await O.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id && p.status == 'Submitted').map(p => p.id)), id1)) await act(O, 'payVerify', { id: pid, ok: true });
await refresh(C); await rentPage(C, 'customer');
await C.click(`[data-a="fx-cxl"][data-id="${id1}"]`); await sleep(400);
const ct = await C.innerText('.fx-cxlb');
ok(/Free: you cancel at least 48 hours before pickup/.test(ct), 'cancel confirm says it is free and the owner refunds all');
await C.locator('.fx-cxlb').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'p12/1-cancel-confirm.png' });
await C.click(`.fx-cxlb [data-a="rncan"]`); await sleep(1400);
await refresh(C); await rentPage(C, 'customer');
ok(/The owner refunds .* within 48 hours/.test(await C.innerText('#app')), 'renter sees the refund coming from the owner');
await refresh(O); await rentPage(O, 'owner');
await O.locator('summary', { hasText: 'History' }).click().catch(() => {}); await sleep(300);
ok(/Refund to the renter/.test(await O.innerText('#app')), 'owner sees "Refund to the renter" with the form');

/* ---- 2. approved: ask the owner for new dates; owner accepts on screen ---- */
const id2 = (await act(C, 'createRental', { veh: vehs[0], s: day(40), e: day(40), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: day(400), ip: jpg, lp: jpg })).id;
await act(O, 'rentalDecision', { id: id2, act: 'approve' });
await refresh(C); await rentPage(C, 'customer');
await C.locator(`#fx-ce-${id2}`).evaluate(e => e.closest('details').open = true);
await C.fill(`#fx-cs-${id2}`, day(41)); await C.fill(`#fx-ce-${id2}`, day(42)); await C.fill(`#fx-cw-${id2}`, 'My move was moved to Friday');
await C.click(`[data-a="fx-chg"][data-id="${id2}"]`); await sleep(1200);
await refresh(O); await rentPage(O, 'owner');
ok(/Date change request/.test(await O.innerText('#app')), 'owner sees the date change request');
await O.locator(`[data-a="fx-cha"][data-id="${id2}"][data-ok="1"]`).scrollIntoViewIfNeeded(); await O.screenshot({ path: 'p12/2-owner-change.png' });
await O.click(`[data-a="fx-cha"][data-id="${id2}"][data-ok="1"]`); await sleep(1200);
ok(await O.evaluate(([id, d]) => ZAPI.refresh().then(() => { const r = S.rn.find(x => x.id == id); return r.s == d && r.days == 2 && r.ct.amend.length == 1; }), [id2, day(41)]), 'owner accepted: new dates, contract amended');

/* ---- 3. owner marks a GCash payment not received; renter contests; cashier decides ---- */
await act(C, 'rentalPay', { id: id2, amount: 1000, method: 'GCash', ref: String(Date.now()).slice(-11) });
const pay = await O.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.bid == id && p.status == 'Submitted')), id2);
await act(O, 'payVerify', { id: pay.id, ok: false, note: 'Nothing arrived in my GCash' });
await refresh(C); await rentPage(C, 'customer');
ok(/marked .* as not received/.test(await C.innerText('#app')), 'renter sees the payment marked as not received');
await C.fill(`#fx-pdn-${pay.id}`, 'Sent by GCash at 3:10 PM to the owner number');
await C.setInputFiles(`#fx-pdf-${pay.id}`, 'p12/p.jpg');
await C.click(`[data-a="fx-pd"][data-id="${pay.id}"]`); await sleep(1300);
const A = await mk();
const SPd = JSON.parse(fs.readFileSync(DATA)); // the admin password is set before the server started
await login(A, 'admin@zammove.test', 'cashier', 'pv', 'TestPass1');
await A.evaluate(() => { S.wp.cashier = 'pv'; render(); }); await sleep(700);
ok(/Money disputes \(1\)/.test(await A.innerText('#app')), 'cashier sees the money dispute');
await A.screenshot({ path: 'p12/3-cashier-dispute.png' });
await A.fill(`#md-${pay.id}`, 'GCash receipt matches the owner number and time');
await A.click(`[data-a="w-md"][data-id="${pay.id}"][data-ok="1"]`); await sleep(1300);
ok(await A.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.id == id).status == 'Verified'), pay.id), 'cashier decided: the payment counts');

/* ---- 4. booking: change date or time on screen ---- */
const bid = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(22), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; render(); }); await refresh(C);
await C.click(`[data-a="zb-rs"][data-id="${bid}"]`); await sleep(400);
await C.fill(`#zb-rsd-${bid}`, day(23)); await C.fill(`#zb-rst-${bid}`, '15:30');
await C.locator(`[data-a="zb-rs-go"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'p12/4-reschedule.png' });
await C.click(`[data-a="zb-rs-go"][data-id="${bid}"]`); await sleep(1300);
ok(await C.evaluate(([id, d]) => ZAPI.refresh().then(() => { const b = S.bk.find(x => x.id == id); return b.dt == d && b.tm == '15:30'; }), [bid, day(23)]), 'customer changed the booking date and time on screen');

/* ---- 5. no-show: driver marks it; customer disputes on screen ---- */
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id: bid });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id: bid, to });
/* backdate the arrival by 20 minutes in the scratch data, then restart the scratch server */
await stop();
const d = JSON.parse(fs.readFileSync(DATA));
const bk = Object.values(d.bookings).find(b => b.id == bid);
bk.ev[bk.ev.length - 1].t = new Date(Date.now() - 20 * 6e4).toISOString();
fs.writeFileSync(DATA, JSON.stringify(d));
await start();
await D.reload(); await sleep(1200); await D.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1500);
const nsb = D.locator(`[data-a="ztd-noshow"][data-id="${bid}"]`);
ok(/Mark as no-show/.test(await nsb.innerText()), 'driver sees "Mark as no-show"');
D.once('dialog', dlg => dlg.accept());
await nsb.click(); await sleep(1500);
ok(await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(b => b.id == id).st == 'Cancelled'), bid), 'driver marked the no-show; the booking closed');
await C.reload(); await sleep(1200);
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; render(); }); await refresh(C);
await C.locator('button, a', { hasText: 'Past' }).first().click().catch(() => {}); await sleep(600);
ok(/Closed as a no-show/.test(await C.innerText('#app')), 'customer sees "Closed as a no-show"');
await C.fill(`#zb-nsd-${bid}`, 'I was at the gate; the driver went to the wrong street');
await C.locator(`[data-a="zb-nsd"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'p12/5-noshow-dispute.png' });
await C.click(`[data-a="zb-nsd"][data-id="${bid}"]`); await sleep(1300);
ok(await C.evaluate(id => ZAPI.refresh().then(() => !!S.pay.find(p => p.bid == id && p.kind == 'cancel_fee').disp), bid), 'customer disputed the no-show on screen');

ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); await stop(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
