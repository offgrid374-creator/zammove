import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('mny', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async (w = 1366, h = 900) => { const ctx = await br.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error(r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(700);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);

/* a trip on owner2's vehicle with the down payment collected */
const C = await mk(); await login(C, 'customer@zammove.test', 'customer');
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(75), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due });
const owner = await D.evaluate(id => { const b = S.bk.find(x => x.id == id); return (S.vh.find(v => v.id == b.veh) || {}).owner; }, id);

/* ---- 1. the owner gives a discount ---- */
const O = await mk(); await login(O, owner, 'owner', 'dash');
await O.evaluate(() => { S.wp.owner = 'dash'; ZAPI.refresh().then(() => render()); }); await sleep(1300);
ok(/Give a discount/.test(await O.innerText('#app')), 'owner dashboard offers "Give a discount" for the open trip');
await O.fill(`#zm-da-${id}`, '300'); await O.fill(`#zm-dw-${id}`, 'Family friend');
await O.locator('#zm-disc').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'mny/1-owner-discount.png' });
await O.click(`[data-a="zm-disc"][data-id="${id}"]`); await sleep(1300);
ok(await O.evaluate(id => ZAPI.refresh().then(() => (S.bk.find(b => b.id == id).odisc || {}).amt == 300), id), 'discount saved (₱300)');

/* ---- 2. the customer sees the discount and the payment history ---- */
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; ZAPI.refresh().then(() => render()); }); await sleep(1200);
const ct = await C.innerText('#app');
ok(/Owner discount: −₱300\.00/.test(ct), 'customer card shows the owner discount');
ok(/Payment history \(1\)/.test(ct), 'customer card has the payment history');
await C.locator('.zb-led summary').first().click(); await sleep(200);
await C.locator('.zb-led').first().scrollIntoViewIfNeeded(); await C.screenshot({ path: 'mny/2-customer-ledger.png' });

/* ---- 3. owner earnings and reports ---- */
await O.evaluate(() => { S.wp.owner = 'earn'; render(); }); await sleep(1200);
ok(/Earned today/.test(await O.innerText('#app')) && /Unpaid balances/.test(await O.innerText('#app')), 'owner earnings show today and the chosen dates');
await O.selectOption('#zrep-own [data-k="r"]', 'recv'); await sleep(500);
await O.fill('#zrep-own [data-k="from"]', day(-1)); await O.dispatchEvent('#zrep-own [data-k="from"]', 'change');
await O.fill('#zrep-own [data-k="to"]', day(120)); await O.dispatchEvent('#zrep-own [data-k="to"]', 'change'); await sleep(400);
ok((await O.innerText('#zrep-own')).includes(id), 'receivables report lists the trip with its unpaid balance');
await O.selectOption('#zrep-own [data-k="r"]', 'disc'); await sleep(400);
ok(/Family friend/.test(await O.innerText('#zrep-own')), 'discount report shows the discount and reason');
await O.locator('#zrep-own').scrollIntoViewIfNeeded(); await O.screenshot({ path: 'mny/3-owner-reports.png' });
const [dl] = await Promise.all([O.waitForEvent('download', { timeout: 5000 }).catch(() => null), O.click('#zrep-own [data-zrep-a="csv"]')]);
ok(dl && /zammove-disc-.*\.csv$/.test(dl.suggestedFilename()), 'Download CSV gives ' + (dl ? dl.suggestedFilename() : 'nothing'));
const [pop] = await Promise.all([O.waitForEvent('popup', { timeout: 5000 }).catch(() => null), O.click('#zrep-own [data-zrep-a="print"]')]);
ok(pop && /Discounts/.test(await pop.content()), 'Print opens a printable page');
if (pop) await pop.close();

/* ---- 4. admin panel reports ---- */
const A = await mk();
await A.goto(B + '/admin/'); await sleep(700);
await A.fill('#em', 'admin@zammove.test'); await A.fill('#pw', 'TestPass1'); await A.click('button[type=submit]'); await sleep(1500);
await A.locator('nav a, nav button, aside a, aside button').filter({ hasText: 'Reports' }).first().click(); await sleep(900);
ok((await A.locator('#zrep-adm').count()) == 1, 'admin panel has Reports');
await A.fill('#zrep-adm [data-k="from"]', '2026-01-01'); await A.dispatchEvent('#zrep-adm [data-k="from"]', 'change'); await sleep(300);
const st = await A.innerText('#zrep-adm');
ok(/Cash sales/i.test(st) && /GCash sales/i.test(st) && /Total received/i.test(st), 'sales report shows cash, GCash and total');
await A.fill('#zrep-adm [data-k="q"]', id); await sleep(400);
ok((await A.locator('#zrep-adm tbody tr').count()) >= 1 && (await A.innerText('#zrep-adm tbody')).includes(id), 'search narrows the report to the booking');
await A.screenshot({ path: 'mny/4-admin-reports.png' });

/* ---- 5. cashier income reports ---- */
const K = await mk(); await login(K, 'admin@zammove.test', 'cashier', 'inc', 'TestPass1');
await K.evaluate(() => { S.wp.cashier = 'inc'; render(); }); await sleep(1000);
ok((await K.locator('#zrep-cash').count()) == 1, 'cashier Income page has the reports');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
