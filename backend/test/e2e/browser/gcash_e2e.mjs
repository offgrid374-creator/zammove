import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('gc', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const page = async () => { const p = await br.newPage({ viewport: { width: 1366, height: 900 } }); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error('login ' + em + ': ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(1100);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const refresh = async p => { await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900); };
const toRent = async (p, ws) => { await p.evaluate(ws => { if (ws == 'customer') { location.hash = '#rent'; view = 'rent'; } else { S.wp[ws] = 'rent'; location.hash = '#rent'; } save(); render(); }, ws); await sleep(900); };

const C = await page();
await login(C, 'customer@zammove.test', 'customer');
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; c.getContext('2d').fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg'); });
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, jpg]));
const veh = await C.evaluate(() => (S.rentList || [])[0]);
const id = (await act(C, 'createRental', { veh: veh.id, s: day(53), e: day(53), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: day(400), ip: jpg, lp: jpg })).id;
const owner = await C.evaluate(id => S.rn.find(r => r.id == id).owner, id);
const O = await page();
await login(O, owner, 'owner', 'rent');
await act(O, 'rentalDecision', { id, act: 'approve' });
await act(O, 'rentalSign', { id, how: 'paper', photo: jpg });

/* 1. owner adds their GCash on the Rentals page */
await toRent(O, 'owner');
ok(/Your GCash for rental payments/.test(await O.innerText('#app')), 'owner sees the GCash card');
await O.fill('#fx-gcn', '0917 555 1234'); await O.fill('#fx-gcm', 'Maria Alvarez');
await O.click('[data-a="fx-gc"]'); await sleep(1200);
ok(await O.evaluate(() => ZAPI.refresh().then(() => (S.users.find(u => u.em == S.me.em) || {}).gcash?.no == '09175551234')), 'owner GCash saved');
await O.locator('.fx-gc').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'gc/1-owner-gcash.png' });

/* 2. renter pays: sees the owner's GCash */
await refresh(C); await toRent(C, 'customer');
const ptxt = await C.innerText('#app');
ok(/0917 555 1234/.test(ptxt) && /Maria Alvarez/.test(ptxt), 'renter sees the owner GCash number and name');
const r0 = await C.evaluate(id => S.rn.find(x => x.id == id), id), dep = +r0.dep || 2000;
await C.fill(`#rpa${id}`, String(dep)); await C.selectOption(`#rpm${id}`, 'GCash'); await C.fill(`#rpr${id}`, String(Date.now()).slice(-11));
await C.locator(`[data-a="rnpay"][data-id="${id}"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'gc/2-renter-pay.png' });
await C.click(`[data-a="rnpay"][data-id="${id}"]`); await sleep(1300);
ok((await act(C, 'rentalPay', { id, amount: r0.tot, method: 'Cash' })).ok, 'renter also pays the fee in cash');

/* 3. owner confirms both; the cashier does not see them */
await refresh(O); await toRent(O, 'owner');
ok((await O.locator('[data-a="fx-pv"][data-ok="1"]').count()) == 2, 'owner can confirm both the GCash and the cash payment');
ok(/Confirm GCash received/.test(await O.innerText('.fx-pays')), 'GCash row says Confirm GCash received');
await O.locator('.fx-pays').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'gc/3-owner-confirm.png' });
const A = await page();
await login(A, 'admin@zammove.test', 'cashier', 'pv', 'TestPass1');
await A.evaluate(() => { S.wp.cashier = 'pv'; render(); }); await sleep(600);
ok(!(await A.innerText('#app')).includes(id), 'cashier Payments to verify does not list rental payments made to the owner');
for (let i = 0; i < 2; i++) { await O.locator('[data-a="fx-pv"][data-ok="1"]').first().click(); await sleep(1300); }
ok(await O.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id).every(p => p.status == 'Verified' && p.coll == S.me.em)), id), 'owner confirmed both on screen');

/* 4. release, return, complete (API) */
await refresh(O);
ok((await act(O, 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH })).ok, 'released');
ok((await act(C, 'rentalReturn', { id, odo: 1080, fuel: 'Full', ph: PH, loc: { lat: 6.9413, lng: 122.0958, acc: 10 } })).ok, 'renter returned');
await act(O, 'rentalDecision', { id, act: 'return', match: true });
ok((await act(O, 'rentalDecision', { id, act: 'complete' })).ok, 'completed');

/* 5. owner refunds the deposit; renter confirms */
await refresh(O); await toRent(O, 'owner');
await O.locator('summary', { hasText: 'History' }).click().catch(() => {}); await sleep(300);
const rf = await O.evaluate(id => S.pay.find(p => p.bid == id && p.kind == 'deposit_refund'), id);
ok(rf && rf.from == owner && rf.status == 'Due', 'a deposit refund is due from the owner');
await O.locator(`#fx-rfr-${rf.id}`).scrollIntoViewIfNeeded(); await O.screenshot({ path: 'gc/4-owner-refund.png' });
await O.fill(`#fx-rfr-${rf.id}`, '5551234567'); await O.click(`[data-a="fx-rf"][data-id="${rf.id}"]`); await sleep(1300);
await refresh(C); await C.evaluate(() => { location.hash = '#home'; view = 'home'; render(); }); await sleep(800);
ok(/Deposit refund of .* Confirm it/s.test(await C.innerText('#app')), 'renter home asks to confirm the refund');
await toRent(C, 'customer');
await C.locator(`[data-a="fx-rfa"][data-id="${rf.id}"][data-ok="1"]`).scrollIntoViewIfNeeded(); await C.screenshot({ path: 'gc/5-renter-refund.png' });
await C.click(`[data-a="fx-rfa"][data-id="${rf.id}"][data-ok="1"]`); await sleep(1200);
ok(await C.evaluate(id => ZAPI.refresh().then(() => S.pay.find(p => p.id == id).status == 'Paid'), rf.id), 'renter confirmed the refund');

/* 6. owner remits the commission; cashier verifies */
await O.evaluate(() => { S.wp.owner = 'earn'; save(); }); await refresh(O);
const bal = await O.evaluate(() => S.ownerBal);
console.log('INFO owner balance', JSON.stringify(bal));
if (-bal.due - (bal.sent || 0) > 0.005) {
  ok((await O.locator('[data-a="zo-orm"]').count()) == 1, 'owner earnings show Remit to ZamMove');
  await O.locator('[data-a="zo-orm"]').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'gc/6-owner-remit.png' });
  await O.fill('#zo-or', '4441234567'); await O.click('[data-a="zo-orm"]'); await sleep(1300);
  await refresh(A); await A.evaluate(() => { S.wp.cashier = 'pv'; render(); }); await sleep(600);
  ok(/rental commission/.test(await A.innerText('#app')), 'cashier sees the owner remittance to verify');
  await A.screenshot({ path: 'gc/7-cashier.png' });
  const rmId = await A.evaluate(() => S.pay.find(p => p.kind == 'owner_remit' && p.status == 'Submitted').id);
  await A.click(`[data-a="w-pv"][data-id="${rmId}"][data-ok="1"]`); await sleep(1300);
  const b2 = await O.evaluate(() => ZAPI.refresh().then(() => S.ownerBal));
  ok(b2.due >= -0.005, 'after the cashier verifies, the owner owes nothing (' + b2.due + ')');
} else ok(true, 'owner has other earnings covering the commission (due ' + bal.due + ')');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
