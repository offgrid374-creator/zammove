import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('vzm', { recursive: true });
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
const shot = (p, n) => p.screenshot({ path: 'vzm/' + n + '.png', animations: 'disabled', timeout: 12000 }).catch(e => console.log('(shot skipped ' + n + ')'));
fs.writeFileSync('vzm/p.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

/* a trip at "Items Loaded" */
const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
const b = await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(15), tm: '11:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' });
const id = b.id; ok(b.ok, 'booking ' + id);
const D = await br.newPage({ viewport: { width: 1366, height: 900 } }); D.on('pageerror', e => errs.push('D ' + e.message));
await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZPAY.due(S.bk.find(x => x.id == id), 'down'), id);
await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
await act(D, 'step', { id, to: 'Items Loaded', note: '1 sofa, 3 boxes, 1 refrigerator; all in good condition' });

/* the customer opens Track: the PIN pop-up opens by itself */
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => { location.hash = '#track'; view = 'track'; render(); }); await sleep(2000);
ok(await C.locator('#vzm').count() == 1, 'CUSTOMER: the verification pop-up opens by itself on Track');
ok(await C.locator('#vz.vzs').count() == 1, 'CUSTOMER: the page keeps a short summary card');
const ct = await C.innerText('#vzm');
ok(/Verified driver/.test(ct) && /DEM \d+/.test(ct) && /Call 09/.test(ct), 'CUSTOMER: driver name, plate and phone are shown');
ok(/Mitsubishi|L300/.test(ct), 'CUSTOMER: the vehicle is shown');
ok(/Sofa/.test(ct) && /refrigerator/i.test(ct) && /Fragile/.test(ct), 'CUSTOMER: booked items with the fragile tag');
ok(/Give the driver your Start PIN/.test(ct) && await C.locator('.vzm-digits').count() == 1 && await C.locator('.vzm-qr svg').count() == 1, 'CUSTOMER: big PIN digits and QR code');
ok(/Waiting for the driver/.test(ct), 'CUSTOMER: says it is waiting for the driver checklist');
ok(await C.locator('[data-a="vz-cconf"]').isDisabled(), 'CUSTOMER: Confirm cargo stays disabled until the checklist is saved');
await shot(C, '1-customer-pin');
const pin = await C.evaluate(id => JSON.parse(sessionStorage.getItem('zmpin:' + id)).pin, id);
ok(/^\d{6}$/.test(pin), 'a 6-digit PIN was issued');
/* closing and reopening */
await C.keyboard.press('Escape'); await sleep(300);
ok(await C.locator('#vzm').count() == 0, 'Escape closes the pop-up');
await C.evaluate(() => render()); await sleep(600);
ok(await C.locator('#vzm').count() == 0, 'it does not reopen by itself after being closed');
await C.click('[data-a="vz-open"]'); await sleep(500);
ok(await C.locator('#vzm').count() == 1, 'the summary card button reopens it');

/* the driver: the pop-up opens by itself at step 1 */
await D.evaluate(() => ZAPI.refresh()); await D.evaluate(() => { S.wp.driver = 'trip'; render(); }); await sleep(2000);
ok(await D.locator('#vzm').count() == 1, 'DRIVER: the pop-up opens by itself on the trip page');
ok(await D.locator('.vzm-st li').count() == 4, 'DRIVER: four-step progress bar');
ok(/Ask Carla for the Start PIN/.test(await D.innerText('#vzm')), 'DRIVER: step 1 asks for the customer’s PIN');
ok(await D.locator('.vzm-st li.sel').innerText().then(t => /Start PIN/.test(t)), 'DRIVER: step 1 is selected');
ok(await D.locator('.vzm-st li:nth-child(3) button').isDisabled(), 'DRIVER: later steps are locked until the earlier ones are done');
await shot(D, '2-driver-step1');
/* wrong PIN: the error stays visible and the typed value is kept */
await D.fill('#vz-pi', '000000'); await D.keyboard.press('Enter'); await sleep(1500);
ok(/PIN|incorrect|wrong|attempt/i.test(await D.innerText('#vz-m')), 'DRIVER: a wrong PIN shows an error in the pop-up: ' + (await D.innerText('#vz-m')).slice(0, 80));
ok((await D.inputValue('#vz-pi')) == '000000', 'DRIVER: the typed PIN is kept after the error');
await shot(D, '3-driver-wrong-pin');
await D.fill('#vz-pi', '12ab'); ok((await D.inputValue('#vz-pi')) == '12', 'DRIVER: the PIN field accepts digits only');
await D.fill('#vz-pi', pin);
await D.keyboard.press('Enter'); await sleep(1500);
ok(await D.evaluate(id => ZAPI.refresh().then(() => !!S.bk.find(x => x.id == id).ver.pinOk), id), 'DRIVER: PIN verified (Enter works)');
ok(/Ask|Check the vehicle/.test(await D.innerText('#vzm')) && /Check the vehicle/.test(await D.innerText('#vzm')), 'DRIVER: moved on to step 2 by itself');
const plate = await D.evaluate(id => { const b = S.bk.find(x => x.id == id); return S.vh.find(v => v.id == b.veh).plate; }, id);
ok((await D.innerText('.vzm-plate')).includes(plate), 'DRIVER: the assigned plate is shown big');
await D.fill('#vz-pl', plate); await D.keyboard.press('Enter'); await sleep(1500);
ok(/Cargo checklist/.test(await D.innerText('#vzm')), 'DRIVER: moved on to the cargo checklist');
ok(await D.locator('[data-a="vz-dconf"]').isDisabled(), 'DRIVER: confirm stays disabled until the checklist is saved');
await shot(D, '4-driver-cargo');
const items = await D.evaluate(id => S.bk.find(x => x.id == id).ver.items, id);
await D.fill('#vz-n', String(items.reduce((s, x) => s + (+x.q || 1), 0)));
for (let i = 0; i < items.length; i++) { await D.check('#vz-it' + i); if (items[i].fr) { await D.check('#vz-pd' + i); await D.check('#vz-st' + i); } }
await D.setInputFiles('#vz-ph', 'vzm/p.png');
await D.click('[data-a="vz-save"]'); await sleep(1500);
ok(await D.evaluate(id => ZAPI.refresh().then(() => !!S.bk.find(x => x.id == id).ver.chk), id), 'DRIVER: checklist saved');
ok(/Cargo checklist/.test(await D.innerText('#vzm')), 'DRIVER: stays on the checklist after saving (needs the confirm)');
ok(await D.locator('[data-a="vz-dconf"]').isEnabled(), 'DRIVER: Confirm checklist and vehicle is now enabled');
await D.click('[data-a="vz-dconf"]'); await sleep(1500);
ok(/Customer confirmation and departure/.test(await D.innerText('#vzm')) && /Waiting for Carla/.test(await D.innerText('#vzm')), 'DRIVER: step 4 waits for the customer');
ok(await D.locator('[data-a="vz-auth"]').isDisabled(), 'DRIVER: Authorize stays disabled');
await shot(D, '5-driver-waiting');
await D.setViewportSize({ width: 390, height: 844 }); await sleep(500); await shot(D, '5b-driver-phone'); await D.setViewportSize({ width: 1366, height: 900 }); await sleep(300);

/* the customer sees the checklist and confirms */
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1200);
const ct2 = await C.innerText('#vzm');
ok(/Pieces loaded\s*5 of 5/.test(ct2.replace(/\n/g, ' ')) || /5 of 5/.test(ct2), 'CUSTOMER: the driver’s checklist result appears (5 of 5)');
ok(await C.locator('.vzm-t2').count() >= 3, 'CUSTOMER: items the driver ticked are marked');
ok(await C.locator('img.vzm-ph').count() == 1, 'CUSTOMER: the driver’s cargo photo is shown');
ok(/PIN verified by the driver/.test(ct2), 'CUSTOMER: the PIN card now says it was verified');
await shot(C, '6-customer-checklist');
await C.setViewportSize({ width: 390, height: 844 }); await sleep(500); await shot(C, '6b-customer-phone'); await C.setViewportSize({ width: 1366, height: 900 }); await sleep(300);
ok(await C.locator('[data-a="vz-cconf"]').isDisabled(), 'CUSTOMER: Confirm cargo stays locked until "I reviewed" is ticked');
await C.check('#vz-rv'); await sleep(200);
ok(await C.locator('[data-a="vz-cconf"]').isEnabled(), 'CUSTOMER: ticking the box unlocks Confirm cargo');
await C.click('[data-a="vz-cconf"]'); await sleep(1500);
ok(await C.evaluate(id => ZAPI.refresh().then(() => !!S.bk.find(x => x.id == id).ver.cconf), id), 'CUSTOMER: confirmed the cargo');
ok(/You confirmed the cargo/.test(await C.innerText('#vzm')), 'CUSTOMER: the pop-up shows the confirmation');

/* the driver authorizes */
await D.evaluate(() => ZAPI.refresh()); await D.evaluate(() => render()); await sleep(1500);
ok(/Carla confirmed the cargo/.test(await D.innerText('#vzm')), 'DRIVER: sees the customer’s confirmation without refreshing');
ok(await D.locator('[data-a="vz-auth"]').isEnabled(), 'DRIVER: Authorize departure is enabled');
await shot(D, '7-driver-ready');
await D.click('[data-a="vz-auth"]'); await sleep(2000);
ok(await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).st), id) == 'In Transit', 'DRIVER: departure authorized: In Transit');
ok(await D.locator('#vzm').count() == 0, 'DRIVER: the pop-up closes by itself');
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1200);
ok(await C.locator('#vzm').count() == 0, 'CUSTOMER: the pop-up closes by itself too');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
