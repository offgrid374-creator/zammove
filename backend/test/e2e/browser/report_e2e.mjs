import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('rep', { recursive: true });
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
const shot = (p, n) => p.screenshot({ path: 'rep/' + n + '.png', animations: 'disabled', timeout: 12000 }).catch(() => {});
const go = async (p, v) => { await p.evaluate(v => { location.hash = '#' + v; view = v; render(); }, v); await sleep(900); };

const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
await go(C, 'home');
const before = await C.locator('#zr-fab').count();
const cb = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(51), tm: '11:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })); const id = cb.id; if (!id) throw new Error(cb.err);
const D = await br.newPage({ viewport: { width: 1366, height: 900 } }); D.on('pageerror', e => errs.push('D ' + e.message));
await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
await act(D, 'step', { id, to: 'On the Way to Pickup' });

/* customer */
await C.evaluate(() => ZAPI.refresh().then(() => render())); await go(C, 'home');
ok((await C.locator('#zr-fab').count()) == 1, 'customer: the Report a problem button appears during a trip' + (before ? ' (was already there before: other live trips)' : ''));
const homeTxt = await C.innerText('#app');
ok(!/Accident or emergency on BK/.test(homeTxt), 'customer: no emergency form on the page');
await shot(C, '1-customer-home');
await C.click('#zr-fab'); await sleep(500);
ok(await C.locator('.zr[role=dialog]').isVisible(), 'customer: the pop-up opens');
const opts = await C.locator('.zr-opt b').allInnerTexts();
ok(opts.join('|') == 'Accident or emergency|Problem with the trip', 'customer options: ' + opts.join(', '));
if ((await C.locator('#zr-trip').count()) == 1) await C.selectOption('#zr-trip', id), await sleep(300);
await shot(C, '2-customer-choose');
await C.click('.zr-opt:has-text("Problem with the trip")'); await sleep(300);
await C.click('[data-a="zr-send"]'); await sleep(900);
ok(/./.test(await C.innerText('#zr-err')) && (await C.locator('.zr').count()) == 1, 'customer: an empty report shows an error and keeps the pop-up open: ' + (await C.innerText('#zr-err')));
await C.selectOption('#zr-cat', 'Delay'); await C.fill('#zr-d', 'The driver has not moved for 40 minutes and does not answer calls.');
await shot(C, '3-customer-form');
await C.click('[data-a="zr-send"]'); await sleep(1300);
ok((await C.locator('#zr').count()) == 0, 'customer: the pop-up closes after sending');
const incs = await C.evaluate(id => ZAPI.refresh().then(() => (S.inc || S.incidents || []).filter(x => x.bid == id)), id);
ok(incs.length == 1 && incs[0].cat == 'Delay', 'customer: the report was filed (' + incs.length + ')');
/* Esc and background click */
await C.click('#zr-fab'); await sleep(300); await C.keyboard.press('Escape'); await sleep(300);
ok((await C.locator('#zr').count()) == 0, 'Esc closes the pop-up');
await C.click('#zr-fab'); await sleep(300); await C.mouse.click(10, 10); await sleep(300);
ok((await C.locator('#zr').count()) == 0, 'clicking the background closes it');
/* Track page Report issue */
await go(C, 'track'); await sleep(600);
const ri = C.locator('#app [data-a="nav"][data-v="reports"]').first();
if (await ri.count()) { await ri.click(); await sleep(500); ok((await C.locator('.zr').count()) == 1 && (await C.evaluate(() => view)) == 'track', 'Track page Report issue opens the pop-up'); await C.keyboard.press('Escape'); }
else ok(false, 'Track page has a Report issue button');
/* hidden on pages that are not about the trip */
await go(C, 'profile');
ok((await C.locator('#zr-fab').count()) == 0, 'customer: the button is hidden on the profile page');

/* driver */
await D.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1500);
ok((await D.locator('#zr-fab').count()) == 1, 'driver: the button appears');
const dt = await D.innerText('#app');
ok(!/Report a breakdown or a problem/.test(dt) && !/Report the customer \(non-payment/.test(dt), 'driver: the report forms are gone from Trip tools');
await shot(D, '4-driver-trip');
const ns = D.locator(`[data-a="ztd-noshow"][data-id="${id}"]`);
if (await ns.count()) {
  await ns.click(); await sleep(500);
  ok(/did not come out/.test(await D.inputValue('#zr-d')) && (await D.inputValue('#zr-cat')) == 'Customer conduct', 'driver: Report no-show opens the pop-up pre-filled');
  await D.keyboard.press('Escape'); await sleep(300);
} else console.log('INFO no-show button not shown yet (wait time not reached)');
await D.click('#zr-fab'); await sleep(400);
if ((await D.locator('#zr-trip').count()) == 1) await D.selectOption('#zr-trip', id), await sleep(300);
const dopts = await D.locator('.zr-opt b').allInnerTexts();
ok(dopts.join('|') == 'Accident or emergency|Breakdown, cannot continue|Report the customer', 'driver options: ' + dopts.join(', '));
await shot(D, '5-driver-choose');
await D.click('.zr-opt:has-text("Breakdown")'); await sleep(300);
await D.fill('#zr-d', 'Flat tire on the bridge'); await D.click('[data-a="zr-send"]'); await sleep(1400);
const st = await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).st), id);
ok(st == 'Interrupted' && (await D.locator('#zr').count()) == 0, 'driver: breakdown stops the trip (' + st + ')');
await D.click('#zr-fab'); await sleep(400);
if ((await D.locator('#zr-trip').count()) == 1) await D.selectOption('#zr-trip', id), await sleep(300);
ok(!(await D.locator('.zr-opt b').allInnerTexts()).includes('Breakdown, cannot continue'), 'driver: breakdown option hidden once the trip is stopped');
await D.click('.zr-opt:has-text("Accident")'); await sleep(300);
await D.check('input[name="zr-hurt"][value="no"]', { force: true }); await D.fill('#zr-d', 'Minor bump while parked, no one hurt');
await shot(D, '6-driver-emergency');
await D.click('[data-a="zr-send"]'); await sleep(1500);
ok((await D.locator('#zr').count()) == 0, 'driver: emergency report sent (pop-up closed) ' + (await D.locator('#zr-err').innerText().catch(() => '')));
/* mobile */
const M = await br.newPage({ viewport: { width: 390, height: 844 } }); M.on('pageerror', e => errs.push('M ' + e.message));
await login(M, 'customer@zammove.test', 'customer'); await go(M, 'home');
const fb = await M.locator('#zr-fab').boundingBox().catch(() => null);
ok(fb && fb.x + fb.width <= 390 && fb.y + fb.height < 844 - 60, 'mobile: the button sits above the bottom bar ' + JSON.stringify(fb));
await shot(M, '7-mobile');
if (fb) { await M.click('#zr-fab'); await sleep(400); await shot(M, '8-mobile-open'); }
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
