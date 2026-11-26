import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('disc', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(1100);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const shot = (p, n) => p.screenshot({ path: 'disc/' + n + '.png', animations: 'disabled', timeout: 12000 }).catch(() => {});
const discOf = (p, id) => p.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).ver.disc), id);

const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(16), tm: '13:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
const D = await br.newPage({ viewport: { width: 1366, height: 900 } }); D.on('pageerror', e => errs.push('D ' + e.message));
await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZPAY.due(S.bk.find(x => x.id == id), 'down'), id);
await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
await act(D, 'step', { id, to: 'Items Loaded', note: 'Sofa, 3 boxes, refrigerator' });
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => { location.hash = '#track'; view = 'track'; render(); }); await sleep(1800);
const pin = await C.evaluate(id => JSON.parse(sessionStorage.getItem('zmpin:' + id)).pin, id);

await D.evaluate(() => ZAPI.refresh()); await D.evaluate(() => render()); await sleep(1800);
await D.fill('#vz-pi', pin); await D.keyboard.press('Enter'); await sleep(1400);
/* one typo: a warning only */
await D.fill('#vz-pl', 'DEM 1O02'); await D.keyboard.press('Enter'); await sleep(1300);
ok(/does not match/.test(await D.innerText('#vzm')) && /enter it again/i.test(await D.innerText('#vzm')), 'first wrong plate: the driver is asked to check and enter it again');
ok((await discOf(D, id)).length == 0, 'first wrong plate: nothing is reported');
await shot(D, '1-first-typo');
/* second mismatch: reported */
await D.fill('#vz-pl', 'DEM 1003'); await D.keyboard.press('Enter'); await sleep(1300);
ok(/administrator was notified/.test(await D.innerText('#vzm')), 'second wrong plate: the driver is told an administrator was notified');
const d1 = await discOf(D, id);
ok(d1.length == 1 && d1[0].status == 'open' && /DEM1O02, DEM1003/.test(d1[0].note), 'second wrong plate: reported with both entries');

/* the admin sees it on Overview and Verification */
const A = await br.newPage({ viewport: { width: 1366, height: 900 } }); A.on('pageerror', e => errs.push('A ' + e.message));
await A.goto(B + '/admin/'); await sleep(700);
await A.fill('#em', 'admin@zammove.test'); await A.fill('#pw', 'TestPass1'); await A.click('button[type=submit]'); await sleep(1500);
ok(/Discrepancy to resolve: Vehicle plate mismatch/.test(await A.innerText('#app')), 'admin Overview lists "Discrepancy to resolve: Vehicle plate mismatch"');
await A.locator('nav, aside').getByText('Verification', { exact: true }).first().click(); await sleep(900);
await A.click(`[data-a="zad-ver"][data-id="${id}"]`).catch(() => {}); await sleep(600);
const vt = await A.innerText('#app');
ok(/Discrepancies/.test(vt) && /Vehicle plate mismatch/.test(vt) && (await A.locator(`[data-a="zad-resolve"][data-id="${id}"]`).count()) == 1, 'admin Verification shows the discrepancy with a Resolve form');
await shot(A, '2-admin-open');

/* the driver enters the correct plate: the report closes by itself */
const plate = await D.evaluate(id => { const b = S.bk.find(x => x.id == id); return S.vh.find(v => v.id == b.veh).plate; }, id);
await D.fill('#vz-pl', plate); await D.keyboard.press('Enter'); await sleep(1400);
const d2 = await discOf(D, id);
ok(d2[0].status == 'resolved' && d2[0].resBy == 'system' && /correct plate/.test(d2[0].res), 'correct plate: the report is resolved automatically');
ok(/Cargo checklist/.test(await D.innerText('#vzm')), 'the driver continues to the cargo checklist');
await A.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(800);
ok(/Resolution:.*correct plate/.test((await A.innerText('#app')).replace(/\n/g, ' ')) && /automatic/.test(await A.innerText('#app')), 'admin Verification shows it resolved (automatic)');

/* count: a different count asks for a recount, then is reported, then the admin resolves it */
const items = await D.evaluate(id => S.bk.find(x => x.id == id).ver.items, id);
const tick = async () => { for (let i = 0; i < items.length; i++) { await D.check('#vz-it' + i); if (items[i].fr) { await D.check('#vz-pd' + i); await D.check('#vz-st' + i); } } };
await D.fill('#vz-n', '4'); await tick(); await D.click('[data-a="vz-save"]'); await sleep(1400);
ok(/Recount: you entered 4 pieces but the booking lists 5/.test(await D.innerText('#vzm')), 'first different count: the driver is asked to recount');
ok((await discOf(D, id)).filter(x => x.status == 'open').length == 0, 'first different count: nothing is reported');
await D.click('[data-a="vz-save"]'); await sleep(1400);
ok((await discOf(D, id)).some(x => x.status == 'open' && x.type == 'Missing items'), 'same count saved again: reported as Missing items');
ok(/An administrator was notified/.test(await D.innerText('#vzm')), 'the driver sees that it was reported');
await shot(D, '3-count-reported');
await A.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900);
const cd = (await discOf(A, id)).find(x => x.status == 'open');
await A.fill(`#f-${id}-rs-${cd.id}`, 'Called the customer: the refrigerator goes on a second trip.');
await A.fill(`#f-${id}-rm-${cd.id}`, '4');
await shot(A, '4-admin-resolve-form');
await A.click(`[data-a="zad-resolve"][data-id="${id}"][data-d="${cd.id}"]`); await sleep(1300);
const d3 = (await discOf(A, id)).find(x => x.id == cd.id);
ok(d3.status == 'resolved' && /second trip/.test(d3.res), 'admin resolved it from the Verification page');
ok(await A.evaluate(id => S.bk.find(x => x.id == id).ver.mcOver, id) == 4, 'the booked count was corrected to 4');
ok(/resolved\. The driver can continue/.test(await A.innerText('#app')), 'admin sees a confirmation');
await shot(A, '5-admin-resolved');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
