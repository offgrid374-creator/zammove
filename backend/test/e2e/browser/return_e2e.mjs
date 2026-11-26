import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('ret', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
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

/* a real small JPEG for the file inputs */
const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg'); });
fs.writeFileSync('ret/p.jpg', Buffer.from(jpg.split(',')[1], 'base64'));
const PH = Object.fromEntries(['front', 'back', 'left', 'right', 'odo', 'fuel'].map(k => [k, jpg]));

/* set up an active rental (starts today) */
const veh = await C.evaluate(() => (S.rentList || [])[0]);
const cr = await act(C, 'createRental', { veh: veh.id, s: day(55), e: day(56), pu: 'Tetuan, Zamboanga City', rt: 'Putik, Zamboanga City', lic: 'N01-23-456789', exp: day(400), ip: jpg, lp: jpg });
if (!cr.ok) throw new Error(cr.err);
const id = cr.id;
const owner = await C.evaluate(id => S.rn.find(r => r.id == id).owner, id);
const O = await br.newPage({ viewport: { width: 1366, height: 900 } }); O.on('pageerror', e => errs.push('O ' + e.message));
await login(O, owner, 'owner', 'rent');
await act(O, 'rentalDecision', { id, act: 'approve' });
await act(O, 'rentalSign', { id, how: 'paper', photo: jpg });
const due = await C.evaluate(id => { const r = S.rn.find(x => x.id == id); return r.tot + (+r.dep || 2000); }, id);
await C.evaluate(() => ZAPI.refresh());
const pay = await act(C, 'rentalPay', { id, amount: due, method: 'Cash' }); if (!pay.ok) throw new Error(pay.err);
const A = await br.newPage(); A.on('pageerror', e => errs.push('A ' + e.message));
await login(A, 'admin@zammove.test', 'cashier', 'pv', 'TestPass1');
for (const pid of await A.evaluate(id => S.pay.filter(p => p.bid == id && p.status == 'Submitted').map(p => p.id), id)) await act(A, 'payVerify', { id: pid, ok: true });
await refresh(O);
const rel = await act(O, 'rentalDecision', { id, act: 'release', odo: 1000, fuel: 'Full', ph: PH });
ok(rel.ok, 'set-up: vehicle released ' + (rel.err || ''));

/* 1. renter: Return the vehicle */
await refresh(C); await go(C, 'rent');
const sum = C.locator('.fx-ret summary', { hasText: 'Return the vehicle' });
ok((await sum.count()) == 1, 'renter sees a Return the vehicle button');
await sum.click(); await sleep(300);
await C.fill(`#fx-rodo-${id}`, '1150'); await C.selectOption(`#fx-rfl-${id}`, '3/4');
for (const k of ['front', 'back', 'left', 'right', 'odo']) await C.setInputFiles(`#fx-rhp-${k}-${id}`, 'ret/p.jpg');
await C.fill(`#fx-rnote-${id}`, 'Parked at Putik, keys with the guard');
await C.click(`[data-a="fx-ret"][data-id="${id}"]`); await sleep(1300);
ok(/return photos/.test(await C.innerText(`#fx-rer-${id}`)), 'missing photo: error shown, form kept: ' + (await C.innerText(`#fx-rer-${id}`)));
ok((await C.inputValue(`#fx-rodo-${id}`)) == '1150', 'the odometer value is still filled in');
await C.locator(`#fx-rhp-fuel-${id}`).scrollIntoViewIfNeeded();
await C.screenshot({ path: 'ret/1-renter-form.png' });
await C.setInputFiles(`#fx-rhp-fuel-${id}`, 'ret/p.jpg');
await C.click(`[data-a="fx-ret"][data-id="${id}"]`); await sleep(1500);
const txt = await C.innerText('#app');
ok(/Return submitted · waiting for the owner/.test(txt), 'renter: waiting for the owner after submitting');
ok(!/Share location/.test(txt) || !(await C.locator('#rt-box').count()), 'renter: location sharing box is gone');
await C.locator('.fx-wait').first().scrollIntoViewIfNeeded(); await C.screenshot({ path: 'ret/2-renter-waiting.png' });
await go(C, 'home');
ok(/Return submitted/.test(await C.innerText('#app')), 'home card says Return submitted');

/* 2. owner: notified, checks, asks for a retake */
await refresh(O);
ok(await O.evaluate(() => S.nt.some(n => /Vehicle returned by the renter/.test(n.h))), 'owner was notified');
await O.evaluate(() => { location.hash = '#rent'; render(); }); await sleep(900);
ok(/The renter returned the vehicle/.test(await O.innerText('#app')), 'owner sees the renter return with photos');
await O.locator('.fx-rq').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'ret/3-owner-check.png' });
await O.locator('.fx-rq summary', { hasText: 'Ask the renter' }).click();
await O.fill(`#fx-rtn-${id}`, 'The odometer photo is blurry');
await O.click(`[data-a="fx-rd"][data-id="${id}"][data-x="retake"]`); await sleep(1300);
ok(/Waiting for new photos/.test(await O.innerText('#app')), 'owner: waiting for new photos');
await refresh(C); await go(C, 'rent');
ok(/asked you to submit the return again/.test(await C.innerText('#app')) && (await C.locator(`#fx-rodo-${id}`).isVisible()), 'renter: sees the owner request with the form open');
await C.fill(`#fx-rodo-${id}`, '1151'); await C.selectOption(`#fx-rfl-${id}`, '3/4');
for (const k of ['front', 'back', 'left', 'right', 'odo', 'fuel']) await C.setInputFiles(`#fx-rhp-${k}-${id}`, 'ret/p.jpg');
await C.click(`[data-a="fx-ret"][data-id="${id}"]`); await sleep(1500);

/* 3. owner: everything matches */
await refresh(O);
await O.click(`[data-a="fx-rd"][data-id="${id}"][data-match="1"]`); await sleep(1500);
const r = await O.evaluate(id => ZAPI.refresh().then(() => S.rn.find(x => x.id == id)), id);
ok(r.st == 'Returned' && r.back.odo == 1151 && r.back.cu && r.back.cu.ok, 'owner marked it returned with the renter readings');
await O.screenshot({ path: 'ret/4-owner-returned.png' });
await refresh(C); await go(C, 'rent');
ok(!/Check the return record/.test(await C.innerText('#app')), 'renter is not asked to confirm their own return record');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
