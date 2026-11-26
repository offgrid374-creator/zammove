import { chromium } from 'playwright-core';
import fs from 'fs';
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const [rid, owner] = fs.readFileSync('probe/rental.txt', 'utf8').trim().split(' ');
fs.writeFileSync('probe/p.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error(em + ' ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(1000);
};
const R = p => p.evaluate(id => ZAPI.refresh().then(() => S.rn.find(x => x.id == id)), rid);
const sign = async (p, who) => {
  await p.click(`[data-a="zct-open"][data-id="${rid}"]`); await sleep(1000);
  const name = await p.evaluate(() => S.me.name);
  await p.fill('#ct-name', name);
  await p.locator('#ct-pad').scrollIntoViewIfNeeded(); await sleep(300);
  const pad = await p.locator('#ct-pad').boundingBox();
  await p.mouse.move(pad.x + 20, pad.y + pad.height / 2); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(pad.x + 20 + i * 15, pad.y + pad.height / 2 + (i % 2 ? -18 : 18));
  await p.mouse.up();
  await p.check('#ct-agree');
  await p.click('[data-a="zct-sign"]'); await sleep(1500);
  const r = await R(p);
  ok(!!(r.ct && r.ct.sg && r.ct.sg[who]), (who == 'cu' ? 'renter' : 'owner') + ' signed the contract on screen (typed name + drawn signature)');
  await p.screenshot({ path: 'probe/after-sign-' + who + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
  if (await p.locator('#fx-modal').count()) { await p.locator('#fx-modal [data-a="fx-close"]').first().click().catch(() => {}); await sleep(600); }
  ok(!(await p.locator('#fx-modal').count()), 'the contract window closes with its Close button');
};

/* 1. renter signs */
const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; render(); }); await sleep(1200);
await sign(C, 'cu');
await C.screenshot({ path: 'probe/r7-after-renter-sign.png', fullPage: true, animations: 'disabled', timeout: 15000 }).catch(() => {});

/* 2. owner signs */
const O = await br.newPage({ viewport: { width: 1366, height: 900 } }); O.on('pageerror', e => errs.push('O ' + e.message));
await login(O, owner, 'owner', 'rent');
await sign(O, 'ow');

/* 3. renter pays the rental and the deposit */
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1000);
const r0 = await R(C);
const bal = await C.evaluate(id => { const r = S.rn.find(x => x.id == id); return r.tot + (r.dep || 0); }, rid);
await C.fill('#rpa' + rid, String(bal));
await C.selectOption('#rpm' + rid, 'GCash').catch(() => {});
await C.fill('#rpr' + rid, '7012398765' + String(Math.floor(Math.random() * 900) + 100));
await C.click(`[data-a="rnpay"][data-id="${rid}"]`); await sleep(1500);
const pays = await C.evaluate(id => S.pay.filter(p => p.bid == id).map(p => p.kind + ':' + p.amount + ':' + p.status), rid);
ok(pays.length >= 1 && pays.every(p => p.endsWith('Submitted')), 'renter submitted the payment on screen: ' + pays.join(', '));

/* 4. cashier verifies (admin acting as cashier) */
const A = await br.newPage(); A.on('pageerror', e => errs.push('A ' + e.message));
await login(A, 'admin@zammove.test', 'cashier', 'pv', 'TestPass1');
const pids = await A.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id && p.status == 'Submitted').map(p => p.id)), rid);
for (const pid of pids) await A.evaluate(pid => ZAPI.act('payVerify', { id: pid, ok: true }), pid);
ok(pids.length && (await A.evaluate(id => ZAPI.refresh().then(() => S.pay.filter(p => p.bid == id).every(p => p.status == 'Verified')), rid)), 'cashier verified the payments');

/* 5. owner releases the vehicle with readings and the 6 handover photos */
await O.evaluate(() => ZAPI.refresh()); await O.evaluate(() => render()); await sleep(1200);
const hp = ['front', 'back', 'left', 'right', 'odo', 'fuel'];
await O.fill('#fx-odo-' + rid, '45210');
await O.selectOption('#fx-fl-' + rid, 'Full').catch(e => console.log('fuel select', e.message));
for (const k of hp) await O.setInputFiles(`#fx-hp-${k}-${rid}`, 'probe/p.png').catch(e => console.log('no photo field', k));
await O.click(`[data-a="fx-rd"][data-id="${rid}"][data-x="release"]`); await sleep(1500);
ok((await R(O)).st == 'Active', 'owner released the vehicle on screen: rental is Active');

/* 6. renter confirms the handover record */
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1200);
await C.click(`[data-a="fx-ck"][data-id="${rid}"][data-ok="1"]`).catch(e => console.log('no confirm button'));
await sleep(1200);
const r6 = await R(C);
ok(!!(r6.chk && r6.chk.out) || !!(r6.out && r6.out.ok != null) || JSON.stringify(r6).includes('"ok":true'), 'renter confirmed the handover record');

/* 7. return and complete */
await O.evaluate(() => ZAPI.refresh()); await O.evaluate(() => render()); await sleep(1200);
await O.fill('#fx-odo-' + rid, '45390');
await O.selectOption('#fx-fl-' + rid, '3/4').catch(() => {});
for (const k of hp) await O.setInputFiles(`#fx-hp-${k}-${rid}`, 'probe/p.png').catch(() => {});
await O.click(`[data-a="fx-rd"][data-id="${rid}"][data-x="return"]`); await sleep(1500);
ok((await R(O)).st == 'Returned', 'owner recorded the return on screen');
await O.evaluate(() => render()); await sleep(800);
await O.click(`[data-a="fx-rd"][data-id="${rid}"][data-x="complete"]`).catch(e => console.log('no complete button')); await sleep(1500);
const done = await R(O);
ok(done.st == 'Completed' && done.settle && done.settle.refund > 0, 'rental completed; deposit refund of ₱' + (done.settle || {}).refund + ' queued for the cashier');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
