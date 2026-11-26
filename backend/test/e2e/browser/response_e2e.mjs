/* Clicks Book and Rent like a user and times how long until the page reacts (toast / error / new card). */
import { chromium } from 'playwright-core';
import fs from 'fs';
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
fs.mkdirSync('ux', { recursive: true });
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [], slow = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() == 'error' && errs.push('console: ' + m.text()));
const reqT = new Map();
p.on('request', r => reqT.set(r, Date.now()));
p.on('requestfinished', r => { const t = Date.now() - (reqT.get(r) || Date.now()); if (r.url().includes('/api/') && t > 800) slow.push(`${t} ms ${r.method()} ${r.url().replace(B, '')}`); });
p.on('requestfailed', r => r.url().includes('/api/') && slow.push('FAILED ' + r.url().replace(B, '') + ' ' + (r.failure() || {}).errorText));
p.on('dialog', d => d.accept());
await p.goto(B + '/customer/'); await sleep(900);
const r = await p.evaluate(() => ZAPI.auth('login', { em: 'customer@zammove.test', pw: 'Demo1234' }));
await p.evaluate(me => { S.me = me; S.ws = 'customer'; save(); }, r.me);
await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
const res = [];
/* time from click until a toast/err text appears or the url/view changes */
const react = async (label, click) => {
  const before = await p.evaluate(() => [view, document.body.innerText.length]);
  const t = Date.now();
  await click();
  let what = 'nothing visible';
  for (let i = 0; i < 300; i++) {
    const s = await p.evaluate(() => {
      const t = [...document.querySelectorAll('.toast, #toast, [role=status], .err, .p-err')].map(e => e.innerText.trim()).filter(Boolean).join(' | ');
      return { t, v: view };
    });
    if (s.t) { what = s.t.slice(0, 140); break; }
    if (s.v != before[0]) { what = 'moved to ' + s.v; break; }
    await sleep(50);
  }
  res.push({ label, ms: Date.now() - t, response: what });
};

/* ---- booking through the form ---- */
await p.evaluate(() => { location.hash = '#book'; view = 'book'; render(); }); await sleep(800);
const fill = async (sel, v) => { const e = p.locator(sel).first(); if (await e.count()) await e.fill(v); };
await fill('#pu', 'Tetuan, Zamboanga City'); await fill('#dr', 'Putik, Zamboanga City');
await p.evaluate(() => { document.querySelectorAll('.sug').forEach(s => (s.hidden = true)); });
const day = new Date(Date.now() + 5 * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
await fill('#dt', day); await fill('#tm', '10:00');
await fill('#it', 'Sofa x1, boxes x3');
await p.selectOption('#z7-sz', { index: 1 }); await sleep(1500);
await p.screenshot({ path: 'ux/book-before.png', fullPage: false });
if (await p.locator('#lc').count()) await p.check('#lc'); const bookBtn = p.locator('[data-a="submitbk"]').first();
console.log('book button found:', await bookBtn.count(), await bookBtn.innerText().catch(() => ''));
await react('Book: submit booking', () => bookBtn.click());
await p.screenshot({ path: 'ux/book-after.png' });

/* ---- rental request through the form ---- */
await p.evaluate(() => { location.hash = '#rent'; view = 'rent'; render(); }); await sleep(800);
const s = new Date(Date.now() + 9 * 864e5 + 8 * 36e5).toISOString().slice(0, 10), e2 = new Date(Date.now() + 10 * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
await p.fill('#fx-s', s); await p.locator('#fx-s').dispatchEvent('change'); await sleep(300);
await p.fill('#fx-e', e2); await p.locator('#fx-e').dispatchEvent('change'); await sleep(500);
await p.locator('[data-a="fx-model"]').first().click(); await sleep(600);
await p.locator('[data-a="fx-unit"]').first().click(); await sleep(600);
await fill('#rp', 'Tetuan, Zamboanga City'); await fill('#rr', 'Tetuan, Zamboanga City');
await p.evaluate(() => { document.querySelectorAll('.sug').forEach(s => (s.hidden = true)); });
await fill('#rl', 'N01-23-456789'); await fill('#rx', '2030-01-01');
for (const id of ['ri', 'rlp']) if (await p.locator('#' + id).count()) await p.setInputFiles('#' + id, 'car.png');
await p.screenshot({ path: 'ux/rent-before.png', fullPage: true });
await react('Rent: submit rental request', () => p.locator('[data-a="fx-req"]').click());
await sleep(500);
await p.screenshot({ path: 'ux/rent-after.png', fullPage: true });
console.table(res);
console.log('created:', JSON.stringify(await p.evaluate(() => ZAPI.refresh().then(() => ({ bookings: S.bk.filter(b => b.cu == S.me.em).map(b => b.id + ' ' + b.st), rentals: S.rn.filter(r => r.cu == S.me.em).map(r => r.id + ' ' + r.st) })))));
console.log('slow API calls:', slow.length ? '\n  ' + slow.join('\n  ') : 'none');
console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
await br.close();
