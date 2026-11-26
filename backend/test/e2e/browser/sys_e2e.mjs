import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('sys', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const issues = [];
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const W = { phone: [390, 844], tablet: [768, 1024], desktop: [1366, 900] };
const mk = async who => {
  const p = await br.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => issues.push(`[${who}] page error: ${e.message}`));
  p.on('console', m => { if (m.type() == 'error' && !/favicon|tile\.openstreetmap|nominatim|router\.project-osrm|ERR_|Failed to load resource/.test(m.text())) issues.push(`[${who}] console: ${m.text().slice(0, 160)}`); });
  p.on('response', r => { if (r.url().startsWith(B) && r.status() >= 500) issues.push(`[${who}] HTTP ${r.status()} ${r.url().replace(B, '')}`); });
  return p;
};
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error('login ' + em + ': ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const layout = async (p, label) => {
  for (const [w, [vw, vh]] of Object.entries(W)) {
    await p.setViewportSize({ width: vw, height: vh }); await sleep(450);
    const m = await p.evaluate(() => {
      const vw = innerWidth, over = document.documentElement.scrollWidth - vw;
      const wide = [...document.querySelectorAll('#app *')].filter(e => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return r.width > 0 && r.right > vw + 2 && cs.position != 'fixed' && cs.visibility != 'hidden' && !e.closest('.leaflet-container, table, .tw-overflow-x-auto, .zb-prog, svg, [style*="overflow"], .steps') && e.tagName != 'svg';
      }).slice(0, 3).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className == 'string' ? '.' + e.className.split(' ')[0] : '') + '→' + Math.round(e.getBoundingClientRect().right));
      return { over: over > 2 ? over : 0, wide };
    });
    if (m.over || m.wide.length) issues.push(`[layout] ${label} @${w}: ${m.over ? 'page scrolls sideways ' + m.over + 'px; ' : ''}${m.wide.join(', ')}`);
    if (w == 'phone') await p.screenshot({ path: `sys/${label.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true, timeout: 15000 }).catch(() => {});
  }
  await p.setViewportSize({ width: 1366, height: 900 });
};

/* ===== A. every page of every role ===== */
const C = await mk('customer'); await login(C, 'customer@zammove.test', 'customer');
for (const v of ['home', 'book', 'rent', 'bookings', 'track', 'reports', 'settings']) {
  await C.evaluate(v => { location.hash = '#' + v; view = v; render(); }, v); await sleep(800);
  await layout(C, 'customer ' + v);
}
const roles = [['driver2@zammove.test', 'driver', 'Demo1234'], ['owner2@zammove.test', 'owner', 'Demo1234'], ['admin@zammove.test', 'cashier', 'TestPass1'], ['admin@zammove.test', 'admin', 'TestPass1']];
const pages = {};
for (const [em, ws, pw] of roles) {
  const p = await mk(ws); await login(p, em, ws, null, pw); pages[ws] = p;
  const keys = await p.evaluate(ws => [...new Set([...document.querySelectorAll(`[data-a="w-go"][data-w="${ws}"]`)].map(a => a.dataset.p))], ws);
  ok(keys.length > 0, `${ws}: ${keys.length} pages found (${keys.join(', ')})`);
  for (const k of keys) {
    await p.evaluate(([ws, k]) => { S.ws = ws; S.wp[ws] = k; save(); render(); }, [ws, k]); await sleep(800);
    const empty = await p.evaluate(() => (document.getElementById('app').innerText || '').trim().length < 20);
    if (empty) issues.push(`[${ws}] page "${k}" renders empty`);
    await layout(p, `${ws} ${k}`);
  }
}

/* ===== B. one booking all the way to Completed, screens checked at each stage ===== */
const D = await mk('driver-trip'); await login(D, 'driver2@zammove.test', 'driver', 'trip');
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(24), tm: '09:30', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await act(D, 'setAvail', { s: 'Available' });
ok((await act(D, 'accept', { id })).ok, 'booking accepted');
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
ok((await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: due })).ok, 'down payment recorded');
ok((await act(D, 'step', { id, to: 'Items Loaded', note: 'Sofa, 3 boxes, refrigerator' })).ok, 'items loaded');
const pin = (await act(C, 'vNewPin', { id })).pin;
ok((await act(D, 'vVerify', { id, kind: 'pin', input: pin })).ok, 'start PIN verified');
const plate = await D.evaluate(id => ZAPI.refresh().then(() => { const b = S.bk.find(x => x.id == id); return S.vh.find(v => v.id == b.veh).plate; }), id);
ok((await act(D, 'vPlate', { id, input: plate })).ok, 'plate verified');
const items = await D.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).ver.items), id);
const sv = await act(D, 'vSave', { id, count: items.reduce((s, x) => s + (x.q || 1), 0), items: items.map(() => true), frag: items.map(x => (x.fr ? { pad: true, strap: true } : {})) });
if (!sv.ok) { const n = +(sv.err.match(/lists (\d+)/) || [])[1]; if (n) await act(D, 'vSave', { id, count: n, items: items.map(() => true), frag: items.map(x => (x.fr ? { pad: true, strap: true } : {})) }); }
ok((await act(D, 'vDriverConfirm', { id })).ok, 'driver confirmed checklist');
ok((await act(C, 'vCustomerConfirm', { id, reviewed: true })).ok, 'customer confirmed checklist');
ok((await act(D, 'vAuthorize', { id })).ok, 'departure authorized');
await C.evaluate(() => { location.hash = '#track'; view = 'track'; ZAPI.refresh().then(() => render()); }); await sleep(1200);
await layout(C, 'B customer track in transit');
await D.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1000);
await layout(D, 'B driver trip in transit');
ok((await act(D, 'step', { id, to: 'Arrived at Destination' })).ok, 'arrived at destination');
const dpin = (await act(C, 'dNewPin', { id })).pin;
await C.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(1000);
await layout(C, 'B customer delivery PIN');
ok((await act(D, 'dDeliver', { id, input: dpin, note: 'All items delivered in good condition' })).ok, 'delivery confirmed with PIN');
ok((await act(D, 'step', { id, to: 'Awaiting Final Payment' })).ok, 'awaiting final payment');
await C.evaluate(() => { location.hash = '#bookings'; view = 'bookings'; ZAPI.refresh().then(() => render()); }); await sleep(1200);
await layout(C, 'B customer final payment');
const fdue = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'final')), id);
ok((await act(D, 'driverPay', { id, kind: 'final', g: 0, c: fdue, rcv: fdue })).ok, 'final payment recorded');
ok(await C.evaluate(id => ZAPI.refresh().then(() => S.bk.find(x => x.id == id).st == 'Completed'), id), 'booking completed');
await C.evaluate(() => render()); await sleep(800);
await layout(C, 'B customer completed');
ok((await act(C, 'review', { id, r: 5, t: 'Careful with the fridge' })).ok, 'customer left a review');

/* ===== C. the cargo-check pop-up does not follow you to other pages ===== */
const id2 = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(26), tm: '09:30', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
await act(D, 'accept', { id: id2 });
for (const to of ['On the Way to Pickup', 'Awaiting Down Payment']) await act(D, 'step', { id: id2, to });
const due2 = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id2);
await act(D, 'driverPay', { id: id2, kind: 'down', g: 0, c: due2, rcv: due2 });
await act(D, 'step', { id: id2, to: 'Items Loaded', note: 'Sofa, 3 boxes, refrigerator' });
await C.evaluate(() => { location.hash = '#track'; view = 'track'; ZAPI.refresh().then(() => render()); }); await sleep(1500);
const opened = await C.locator('#vzm').count();
await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; render(); }); await sleep(900);
ok(opened == 1 && (await C.locator('#vzm').count()) == 0, `cargo-check pop-up opened on Track (${opened}) and closed when going to Rent`);

/* ===== D. admin panel ===== */
const A = await mk('admin-panel');
await A.goto(B + '/admin/'); await sleep(700);
await A.fill('#em', 'admin@zammove.test'); await A.fill('#pw', 'TestPass1'); await A.click('button[type=submit]'); await sleep(1500);
const navs = await A.locator('nav a, nav button, aside a, aside button').allInnerTexts();
const uniq = [...new Set(navs.map(s => s.split(String.fromCharCode(10))[0].trim()).filter(s => s && s.length < 40))];
ok(uniq.length > 3, 'admin panel: ' + uniq.length + ' sections (' + uniq.join(', ') + ')');
for (const n of uniq) {
  await A.locator('nav a, nav button, aside a, aside button').filter({ hasText: n }).first().click().catch(() => issues.push('[admin-panel] could not open ' + n)); await sleep(700);
  const txt = (await A.innerText('body')).trim();
  if (txt.length < 40) issues.push(`[admin-panel] "${n}" renders empty`);
}
await A.setViewportSize({ width: 390, height: 844 }); await sleep(500);
const aOver = await A.evaluate(() => document.documentElement.scrollWidth - innerWidth);
if (aOver > 2) issues.push('[layout] admin panel @phone scrolls sideways ' + aOver + 'px');

console.log('\n==== ISSUES (' + issues.length + ') ====');
for (const i of [...new Set(issues)]) console.log(i);
fs.writeFileSync('sys/issues.json', JSON.stringify([...new Set(issues)], null, 1));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL STEPS PASSED');
