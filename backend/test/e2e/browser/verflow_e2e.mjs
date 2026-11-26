import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('probe', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const id = fs.readFileSync('probe/booking.txt', 'utf8').trim();
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(1000);
};
const st = p => p.evaluate(id => (ZAPI.refresh().then(() => S.bk.find(x => x.id == id).st)), id);
const C = await br.newPage({ viewport: { width: 1366, height: 900 } }); C.on('pageerror', e => errs.push('C ' + e.message));
await login(C, 'customer@zammove.test', 'customer');
await C.evaluate(() => { location.hash = '#track'; view = 'track'; render(); }); await sleep(1500);
await C.click('[data-a="vz-pin"]'); await sleep(1500);
const pin = await C.evaluate(id => { const v = sessionStorage.getItem('zmpin:' + id); return v ? JSON.parse(v).pin : ''; }, id);
ok(pin.length == 6, 'customer sees a 6-digit Start PIN');

const D = await br.newPage({ viewport: { width: 1366, height: 900 } }); D.on('pageerror', e => errs.push('D ' + e.message));
await login(D, 'driver2@zammove.test', 'driver', 'trip');
const vz = s => D.locator(`.ztd:has-text("${id}") ${s}`).first();
await vz('#vz-pi').fill(pin); await vz('[data-a="vz-ver"]:not([data-k="qr"])').click(); await sleep(1200);
ok(await D.evaluate(id => S.bk.find(x => x.id == id).ver.pinOk, id), 'driver verified the Start PIN on screen');
const plate = await D.evaluate(id => { const b = S.bk.find(x => x.id == id); return (S.vh.find(v => v.id == b.veh) || {}).plate; }, id);
await vz('#vz-pl').fill(plate); await vz('[data-a="vz-plate"]').click(); await sleep(1200);
ok(await D.evaluate(id => (S.bk.find(x => x.id == id).ver.plate || {}).match, id), 'driver verified the plate (' + plate + ')');
ok(await vz('#vz-n').count() == 1, 'the cargo checklist appears after PIN and plate');
const items = await D.evaluate(id => S.bk.find(x => x.id == id).ver.items, id);
await vz('#vz-n').fill(String(items.reduce((s, x) => s + (+x.q || 1), 0)));
for (let i = 0; i < items.length; i++) {
  await vz('#vz-it' + i).check();
  if (items[i].fr) { await vz('#vz-pd' + i).check().catch(() => {}); await vz('#vz-st' + i).check().catch(() => {}); }
}
await vz('[data-a="vz-save"]').click(); await sleep(1200);
ok(await D.evaluate(id => !!S.bk.find(x => x.id == id).ver.chk, id), 'driver saved the cargo checklist (' + items.map(x => x.n + (x.fr ? ' [fragile]' : '')).join(', ') + ')');
await vz('[data-a="vz-dconf"]').click(); await sleep(1200);
ok(await D.evaluate(id => !!S.bk.find(x => x.id == id).ver.dconf, id), 'driver confirmation recorded');
await D.screenshot({ path: 'probe/v-driver-after-checklist.png', fullPage: true, animations: 'disabled', timeout: 15000 }).catch(() => {});

await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1200);
await C.check('#vz-rv'); await C.click('[data-a="vz-cconf"]'); await sleep(1200);
ok(await C.evaluate(id => !!S.bk.find(x => x.id == id).ver.cconf, id), 'customer confirmed the cargo on screen');

await D.evaluate(() => ZAPI.refresh()); await D.evaluate(() => render()); await sleep(1200);
const authBtn = vz('[data-a="vz-auth"]');
ok(await authBtn.isEnabled().catch(() => false), 'Authorize Departure is enabled once every check passes');
await authBtn.click(); await sleep(1500);
ok(await st(D) == 'In Transit', 'departure authorized: the trip is In Transit');

/* delivery: arrive, customer shows the Delivery PIN, driver enters it */
await D.evaluate(() => render()); await sleep(800);
const arr = await D.evaluate(id => ZAPI.act('step', { id, to: 'Arrived at Destination' }), id);
ok(arr.ok, 'arrived at destination ' + (arr.err || ''));
await C.evaluate(() => ZAPI.refresh()); await C.evaluate(() => render()); await sleep(1500);
await C.click('[data-a="dz-pin"]').catch(() => {}); await sleep(1000);
const dpin = await C.evaluate(id => Object.keys(sessionStorage).filter(k => k.endsWith(id) && !k.startsWith('zmpin:')).map(k => sessionStorage.getItem(k))[0] || '', id);
console.log('delivery pin keys', await C.evaluate(() => Object.keys(sessionStorage).join(',')));
ok(dpin.length == 6, 'customer sees a 6-digit Delivery PIN');
await D.evaluate(() => ZAPI.refresh()); await D.evaluate(() => render()); await sleep(1200);
const dIds = await D.evaluate(() => [...document.querySelectorAll('[id^="vz-d"]')].map(e => e.id + ':' + e.tagName).join(' '));
console.log('delivery fields:', dIds);
await D.fill('#vz-dpi', dpin).catch(e => console.log('no #vz-dpi'));
await D.fill('#vz-dnt', 'All 5 pieces delivered in good condition').catch(() => {});
await D.click('[data-a="dz-deliver"]').catch(e => console.log('no deliver button')); await sleep(1500);
const s2 = await st(D);
ok(['Delivery Confirmation', 'Awaiting Final Payment'].includes(s2), 'delivery confirmed with the Delivery PIN (' + s2 + ')');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
