import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('ppl', { recursive: true });
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

/* ---- 1. a customer applies to drive for owner1 ---- */
const C = await mk(); await login(C, 'customer@zammove.test', 'account', 'apply');
await C.evaluate(() => { S.ws = 'account'; S.wp.account = 'apply'; save(); render(); }); await sleep(900);
await C.check('#w-r-driver'); await sleep(500);
ok((await C.locator('#w-emp').count()) == 1, 'the application form asks which vehicle owner you will drive for');
const owners = await C.locator('#w-emp option').allInnerTexts();
const o1 = owners.find(x => /Lito Reyes/.test(x));
ok(!!o1, 'owner list includes Lito Reyes: ' + owners.slice(1).join(' | '));
await C.selectOption('#w-emp', { label: o1 });
const jpg = await C.evaluate(() => { const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d').fillRect(0, 0, 32, 32); return c.toDataURL('image/jpeg'); });
fs.writeFileSync('ppl/p.jpg', Buffer.from(jpg.split(',')[1], 'base64'));
await C.locator('#w-emp').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'ppl/1-apply.png' });
const emp = await C.inputValue('#w-emp');
const ar = await act(C, 'apply', { roles: ['driver'], phone: '09171234567', address: 'Tetuan, Zamboanga City', license: 'N01-99-123456', licExp: day(500), clrExp: day(300), docs: { driver: [jpg, jpg, jpg, jpg] }, employer: emp });
ok(ar.ok, 'application submitted to the owner ' + (ar.err || ''));

/* ---- 2. owner1 approves it and registers a helper ---- */
const O = await mk(); await login(O, 'owner1@zammove.test', 'owner', 'drv');
await O.evaluate(() => { S.wp.owner = 'drv'; ZAPI.refresh().then(() => render()); }); await sleep(1200);
const ot = await O.innerText('#app');
ok(/Driver applications/.test(ot) && /Carla Mendoza|customer/i.test(ot), 'owner sees the driver application');
const appId = await O.evaluate(() => (S.apps.find(a => a.st == 'Waiting for Owner') || {}).id);
await O.locator('#zp-owner').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'ppl/2-owner-drivers.png' });
await O.click(`[data-a="zp-app"][data-id="${appId}"][data-ok="1"]`); await sleep(1300);
ok(await O.evaluate(id => ZAPI.refresh().then(() => S.apps.find(a => a.id == id).st == 'Pending Review'), appId), 'owner approved: the application goes to ZamMove review');
await O.locator('.zp-add summary').click(); await sleep(200);
await O.fill('#zp-hn', 'Pedro Cruz'); await O.fill('#zp-hp', '09171112222'); await O.setInputFiles('#zp-hi', 'ppl/p.jpg');
await O.click('[data-a="zp-help"][data-x="add"]'); await sleep(1300);
ok(await O.evaluate(() => ZAPI.refresh().then(() => ((S.users.find(u => u.em == S.me.em) || {}).helpers || []).some(x => x.name == 'Pedro Cruz'))), 'owner registered helper Pedro Cruz');

/* ---- 3. a booking with one helper: the driver names Pedro; the customer sees it ---- */
const drvEm = await O.evaluate(() => (S.myDrivers || []).find(e => e != S.me.em));
console.log('INFO owner1 driver:', drvEm ? drvEm.replace(/@.*/, '@…') : 'none');
const D = await mk(); await login(D, drvEm, 'driver', 'trip');
const vid = await D.evaluate(() => { const a = S.asg.find(x => x.driver == S.me.em && x.st == 'Active'); return a ? (S.vh.find(v => v.id == a.vehicle) || {}).type : ''; });
const bid = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(31), tm: '10:00', vid, mv: 1, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'S' })).id;
await act(D, 'setAvail', { s: 'Available' });
const acc = await act(D, 'accept', { id: bid });
ok(acc.ok, 'driver accepted the booking ' + (acc.err || ''));
await D.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1300);
ok(/Helpers for/.test(await D.innerText('#app')), 'driver is asked to name the helper');
await D.locator(`input[data-crew="${bid}"]`, { hasText: '' }).first().scrollIntoViewIfNeeded().catch(() => {});
await D.locator(`label:has(input[data-crew="${bid}"])`, { hasText: 'Pedro Cruz' }).locator('input').check();
await D.screenshot({ path: 'ppl/3-driver-helpers.png' });
await D.click(`[data-a="zp-crew"][data-id="${bid}"]`); await sleep(1300);
ok(await D.evaluate(id => ZAPI.refresh().then(() => (S.bk.find(b => b.id == id).helpers || []).map(x => x.name).join() == 'Pedro Cruz'), bid), 'helper saved on the booking');
await C.evaluate(() => { S.ws = 'customer'; location.hash = '#bookings'; view = 'bookings'; save(); ZAPI.refresh().then(() => render()); }); await sleep(1300);
ok(/Helpers: Pedro Cruz/.test(await C.innerText('#app')), 'customer sees "Helpers: Pedro Cruz"');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
