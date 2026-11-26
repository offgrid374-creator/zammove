import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('cat', { recursive: true });
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
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
};

/* ---- 1. admin panel: Catalog & fuel ---- */
const A = await mk();
await A.goto(B + '/admin/'); await sleep(700);
await A.fill('#em', 'admin@zammove.test'); await A.fill('#pw', 'TestPass1'); await A.click('button[type=submit]'); await sleep(1500);
await A.locator('nav a, nav button, aside a, aside button').filter({ hasText: 'Catalog & fuel' }).first().click(); await sleep(900);
const at = await A.innerText('body');
ok(/Fuel price/i.test(at) && /Brands and models/i.test(at) && /Fuel types/i.test(at) && (await A.locator('input[value="Hybrid"]').count()) == 1, 'admin Catalog page shows fuel price, brands and models, fuel types incl. Hybrid');
if (!(await A.evaluate(() => S.cfg.cat.brands.some(b => b.n == 'Kia')))) { await A.fill('#zc-nb', 'Kia'); await A.click('[data-a="zcat"][data-k="brand"][data-x="add"]'); await sleep(1200); }
await A.locator('.zc-brand', { hasText: 'Kia' }).locator('summary').click(); await sleep(300);
await A.fill('#zc-mn-new-kia', 'K2500'); await A.selectOption('#zc-mt-new-kia', 'pk'); await A.fill('#zc-ms-new-kia', '3'); await A.selectOption('#zc-mf-new-kia', 'Diesel');
await A.click('[data-a="zcat"][data-k="model"][data-x="add"][data-b="kia"]'); await sleep(1200);
ok(await A.evaluate(() => ZAPI.refresh().then(() => (S.cfg.cat.brands.find(b => b.n == 'Kia') || { models: [] }).models.some(m => m.n == 'K2500'))), 'admin added brand Kia with model K2500');
await A.locator('.zc-brand', { hasText: 'Kia' }).locator('summary').click().catch(() => {}); await sleep(300);
await A.screenshot({ path: 'cat/1-admin-catalog.png', fullPage: false });

/* ---- 2. owner: registration form dropdowns, fuel request ---- */
const O = await mk(); await login(O, 'owner1@zammove.test', 'owner', 'veh');
await O.evaluate(() => { const d = [...document.querySelectorAll('details')].find(x => /Register a vehicle/.test(x.textContent)); if (d) d.open = true; }); await sleep(300);
ok((await O.locator('select#w-vb').count()) == 1, 'brand is a dropdown');
await O.selectOption('#w-vb', 'Kia'); await sleep(300);
const models = await O.locator('#w-vm option').allInnerTexts();
ok(models.includes('K2500') && !models.includes('L300'), 'model list shows only Kia models: ' + models.join(', '));
await O.selectOption('#w-vm', 'K2500'); await sleep(200);
ok((await O.inputValue('#w-vfu')) == 'Diesel', 'choosing a model fills its fuel');
ok((await O.locator('#w-vfu option', { hasText: 'Hybrid' }).count()) == 1, 'Hybrid is a fuel option');
await O.selectOption('#w-vb', '__other'); await sleep(200);
ok(await O.locator('#w-vb-o').isVisible(), '"Other (not listed)" shows a text box for a new brand');
await O.locator('#w-vb').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'cat/2-owner-register.png' });
await O.locator('.zc-fuel summary').click(); await sleep(200);
await O.fill('#zc-fp', '68.5'); await O.fill('#zc-fw', 'Diesel is 68.50 at the Tetuan station this week');
await O.click('[data-a="zc-fuel"]'); await sleep(1200);
ok(await O.evaluate(() => ZAPI.refresh().then(() => (S.fuelReqs || []).some(x => x.st == 'Pending' && x.price == 68.5))), 'owner sent a fuel price request');
await A.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900);
ok(/Fuel price requests from owners \(1\)/.test(await A.innerText('body')), 'admin sees the request');
const rid = await A.evaluate(() => S.fuelReqs.find(x => x.st == 'Pending').id);
await A.click(`[data-a="zcat-req"][data-id="${rid}"][data-x="1"]`); await sleep(1300);
const k = await A.evaluate(() => ZAPI.refresh().then(() => [S.cfg.fuel.price, S.cfg.fuelK]));
ok(k[0] == 68.5 && Math.abs(k[1] - 68.5 / 60) < 0.001, 'approved: fuel price 68.5, per-km factor ' + k[1].toFixed(3));

/* ---- 3. customer: rental filters ---- */
const C = await mk(390, 844); await login(C, 'customer@zammove.test', 'customer');
await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; render(); }); await sleep(900);
const total = await C.evaluate(() => S.rentList.length);
/* filters: who drives → vehicle type → that type's details */
const ty = await C.evaluate(() => S.rentList[0].type);
await C.click(`[data-a="zf-chip"][data-k="type"][data-v="${ty}"]`); await sleep(500);
ok((await C.locator('.zf-bar select[data-rf="brand"]').count()) == 1, 'rental page shows filters after choosing a type');
const brand = await C.evaluate(() => S.rentList[0].brand);
await C.selectOption('select[data-rf="brand"]', brand); await sleep(600);
const shown = await C.evaluate(() => document.querySelectorAll('.fx-model').length);
const expect = await C.evaluate(([b, t]) => new Set(S.rentList.filter(u => u.brand == b && u.type == t).map(u => u.brand + ' ' + u.model)).size, [brand, ty]);
ok(shown == expect && /of \d+ vehicle/.test(await C.innerText('.zf-n')), `brand filter shows ${shown} model card(s) for ${brand} (of ${total} vehicles)`);
await C.locator('.zf-bar').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'cat/3-rent-filters.png' });
await C.click('[data-a="zf-clear"]'); await sleep(400);

/* ---- 4. customer: booking preferences ---- */
await C.setViewportSize({ width: 1366, height: 900 });
await C.evaluate(() => { location.hash = '#book'; view = 'book'; render(); }); await sleep(1200);
await C.click('[data-a="pick"][data-id="l3"]'); await sleep(800);
ok((await C.locator('#zk-pref details').count()) == 1, 'booking form shows "Preferences (optional)"');
await C.locator('#zk-pref summary').click(); await sleep(200);
const drv = await C.locator('select[data-pf="driver"] option').allInnerTexts();
ok(drv.length > 1, 'drivers can be chosen: ' + drv.slice(1).join(' | '));
await C.locator('#zk-pref').scrollIntoViewIfNeeded(); await C.screenshot({ path: 'cat/4-book-pref.png' });
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
