import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('guide', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async w => { const p = await br.newPage({ viewport: { width: w, height: 900 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); }, [r.me, ws, wp]);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(800);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);

for (const w of [1366, 390]) {
  const C = await mk(w);
  await login(C, 'customer@zammove.test', 'customer');
  /* ---- book form ---- */
  await C.evaluate(() => { location.hash = '#book'; view = 'book'; render(); }); await sleep(1300);
  const steps0 = await C.evaluate(() => [...document.querySelectorAll('.rv-step .zg-st')].map(i => i.className.replace('zg-st ', '')));
  ok(steps0.length == 4 && steps0[1] == 'ok' && steps0.filter(s => s == 'todo').length == 3, `${w}: book steps start as ! ✓ ! ! (${steps0})`);
  ok((await C.locator('label.zg-req[for="pu"]').count()) == 1 && (await C.locator('label.zg-req[for="it"]').count()) == 1, `${w}: required fields marked with *`);
  await C.click('#it'); await C.click('#tm'); await sleep(500);
  ok(/List what you are moving/.test(await C.innerText('#app')), `${w}: leaving “items” empty shows a hint under it`);
  await C.fill('#pu', 'Tetuan, Zamboanga City'); await C.fill('#dr', 'Putik, Zamboanga City');
  await C.evaluate(() => document.querySelectorAll('.sug').forEach(s => (s.hidden = true)));
  await C.fill('#dt', day(5)); await C.fill('#tm', '10:00'); await C.fill('#it', 'Sofa x1, boxes x3');
  await C.selectOption('#z7-sz', { index: 1 }); await sleep(1500);
  const steps1 = await C.evaluate(() => [...document.querySelectorAll('.rv-step .zg-st')].map(i => i.className.replace('zg-st ', '')));
  ok(steps1.every(s => s == 'ok'), `${w}: all steps ✓ once filled (${steps1})`);
  ok(!/List what you are moving/.test(await C.innerText('#app')), `${w}: the hint disappears once fixed`);
  ok(/Load size chosen/.test(await C.innerText('#rv-check')), `${w}: checklist includes the load size`);
  await C.locator('.rv-step').first().scrollIntoViewIfNeeded(); await C.screenshot({ path: `guide/${w}-book.png` });
  /* ---- rent form ---- */
  await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; render(); }); await sleep(900);
  ok((await C.locator('h2 .zg-st.todo').count()) >= 1, `${w}: rent step 1 shows ! before dates`);
  await C.fill('#fx-s', day(12)); await C.locator('#fx-s').dispatchEvent('change'); await sleep(300);
  await C.fill('#fx-e', day(13)); await C.locator('#fx-e').dispatchEvent('change'); await sleep(500);
  await C.locator('[data-a="fx-model"]').first().click(); await sleep(500);
  await C.locator('[data-a="fx-unit"]').first().click(); await sleep(800);
  ok((await C.locator('#zg-rcheck').count()) == 1, `${w}: rental form has a “Before you submit” list`);
  const rtxt = await C.innerText('#zg-rcheck');
  ok(/3 of \d+/.test(rtxt), `${w}: dates, vehicle and unit counted as done (${rtxt.split('\n')[1]})`);
  await C.locator('#zg-rcheck').scrollIntoViewIfNeeded(); await C.screenshot({ path: `guide/${w}-rent.png` });
  ok(!(await C.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${w}: no sideways scroll`);
  await C.close();
}

/* ---- badges + next step: the customer gets an approved rental to sign and pay ---- */
const C = await mk(1366); await login(C, 'customer@zammove.test', 'customer');
const O = await mk(1366);
let veh = null;
for (const em of ['owner1@zammove.test', 'owner2@zammove.test']) { await login(O, em, 'owner', 'dash'); veh = await O.evaluate(() => (S.vh || []).find(v => v.owner == S.me.em && v.rent && v.rent.on !== false)); if (veh) break; }
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const req = await act(C, 'createRental', { veh: veh.id, s: day(20), e: day(21), pt: '09:00', rtm: '17:00', pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City', lic: 'N01-23-456789', exp: '2030-01-01', ip: IMG, lp: IMG });
await O.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900);
ok((await O.locator('[data-a="w-go"][data-p="rent"] .zg-badge').count()) >= 1, 'owner: red badge on Rentals for the new request');
ok(/Next step:.*New rental request/.test(await O.innerText('body')), 'owner: next-step banner names the request');
await O.screenshot({ path: 'guide/owner-badge.png' });
await O.click('[data-zg-next="rent"]'); await sleep(900);
ok(await O.evaluate(() => S.wp.owner == 'rent'), 'owner: “Open” goes to Rentals');
await act(O, 'rentalDecision', { id: req.id, act: 'approve' });
await C.evaluate(() => { location.hash = '#home'; view = 'home'; ZAPI.refresh().then(() => render()); }); await sleep(1000);
ok((await C.locator('[data-a="nav"][data-v="rent"] .zg-badge').count()) >= 1 && await C.evaluate(() => document.querySelectorAll('.zg-badge').length == 1), 'customer: red badge on Rent after approval');
ok(/Next step:.*sign the contract/.test(await C.innerText('body')), 'customer: next-step banner says to sign the contract');
await C.screenshot({ path: 'guide/customer-next.png' });
await C.click('[data-zg-hide]'); await sleep(400);
ok(!(await C.locator('#zg-next').count()) || !/sign the contract/.test(await C.innerText('#zg-next')), 'customer: the banner can be hidden');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
