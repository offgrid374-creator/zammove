import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('cf', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async () => { const p = await br.newPage({ viewport: { width: 1366, height: 900 } }); p.on('pageerror', e => errs.push(e.message)); return p; };
const login = async (p, em, ws, wp, pw = 'Demo1234') => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(([em, pw]) => ZAPI.auth('login', { em, pw }), [em, pw]);
  if (!r.ok) throw new Error('login ' + em + ': ' + r.err);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); render(); }, [r.me, ws, wp]); await sleep(900);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(600);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const go = async (p, v) => { await p.evaluate(v => { location.hash = '#' + v; view = v; ZAPI.refresh().then(() => render()); }, v); await sleep(1100); };
const inc = (p, id) => p.evaluate(id => ZAPI.refresh().then(() => S.inc.find(c => c.id == id)), id);

/* ---- 1. your existing case: withdraw it on the Report page ---- */
const em = fs.readFileSync('jj.txt', 'utf8').trim();
const J = await mk(); await login(J, em, 'customer', null, 'TestPass1');
await go(J, 'reports');
const card = J.locator('.z7-it', { hasText: 'IN-KTHC4Y' });
ok((await card.locator('summary', { hasText: 'Withdraw this report' }).count()) == 1, 'IN-KTHC4Y shows "Withdraw this report"');
await card.locator('summary', { hasText: 'Withdraw this report' }).click();
await J.fill('#z7-wd-IN-KTHC4Y', 'There was no change to give; I paid the exact amount');
await card.scrollIntoViewIfNeeded(); await J.screenshot({ path: 'cf/1-withdraw.png' });
await J.click('[data-a="z23-wd"][data-id="IN-KTHC4Y"]'); await sleep(1300);
ok((await inc(J, 'IN-KTHC4Y')).st == 'Withdrawn', 'IN-KTHC4Y withdrawn');
await J.evaluate(() => render()); await sleep(600);
ok(/Withdrawn/.test(await J.locator('.z7-it', { hasText: 'IN-KTHC4Y' }).innerText()), 'the card now says Withdrawn with the reason');

/* ---- 2. report pop-up: review step, then confirm; second one discarded ---- */
const C = await mk(); await login(C, 'customer@zammove.test', 'customer');
const id = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(28), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3, refrigerator x1', sz: 'M' })).id;
const D = await mk(); await login(D, 'driver2@zammove.test', 'driver', 'trip');
await act(D, 'setAvail', { s: 'Available' }); await act(D, 'accept', { id });
await act(D, 'step', { id, to: 'On the Way to Pickup' });
await go(C, 'home');
const openReport = async () => {
  await C.click('#zr-fab'); await sleep(400);
  if (await C.locator('#zr-trip').count()) await C.selectOption('#zr-trip', id), await sleep(300);
  await C.click('.zr-opt:has-text("Problem with the trip")'); await sleep(300);
  await C.selectOption('#zr-cat', 'Delay'); await C.fill('#zr-d', 'The driver has not moved for 40 minutes.');
  await C.click('[data-a="zr-send"]'); await sleep(1300);
};
await openReport();
ok(/Check your report before sending/.test(await C.innerText('.zr')), 'after Send, the pop-up shows the review step');
await C.screenshot({ path: 'cf/2-review.png' });
const draftId = await C.evaluate(id => ZAPI.refresh().then(() => (S.inc.filter(c => c.bid == id && c.st == 'Unconfirmed').pop() || {}).id), id);
ok(!!draftId, 'it is saved as an unsent draft');
await D.evaluate(() => ZAPI.refresh());
ok(!(await D.evaluate(id => S.inc.some(c => c.id == id), draftId)), 'the driver cannot see the draft');
await C.click('[data-a="zr-ok"]'); await sleep(1300);
ok((await inc(C, draftId)).st == 'Submitted', 'Confirm and send: the report is sent');
ok(await D.evaluate(id => ZAPI.refresh().then(() => S.inc.some(c => c.id == id)), draftId), 'now the driver sees it');
await openReport();
const d2 = await C.evaluate(id => ZAPI.refresh().then(() => (S.inc.filter(c => c.bid == id && c.st == 'Unconfirmed').pop() || {}).id), id);
await C.click('[data-a="zr-dm"]'); await sleep(1200);
ok((await inc(C, d2)).st == 'Withdrawn', 'Discard: the second report never goes out');

/* ---- 3. a draft left on the Report page: confirm or dismiss buttons ---- */
await openReport();
const d3 = await C.evaluate(id => ZAPI.refresh().then(() => (S.inc.filter(c => c.bid == id && c.st == 'Unconfirmed').pop() || {}).id), id);
await C.keyboard.press('Escape'); await sleep(300);
await go(C, 'reports');
const dc = C.locator('.z7-it', { hasText: d3 });
ok(/Not sent yet/.test(await dc.innerText()) && (await dc.locator('[data-a="z23-ok"]').count()) == 1 && (await dc.locator('[data-a="z23-dm"]').count()) == 1, 'an unsent draft shows Confirm and send / Dismiss on the Report page');
await dc.scrollIntoViewIfNeeded(); await C.screenshot({ path: 'cf/3-draft-card.png' });
await dc.locator('[data-a="z23-dm"]').click(); await sleep(1200);
ok((await inc(C, d3)).st == 'Withdrawn' && !(await C.locator('.z7-it', { hasText: d3 }).count()), 'Dismiss removes it');

/* ---- 4. wrong change is a draft too: no flag until confirmed ---- */
for (const to of ['Awaiting Down Payment']) await act(D, 'step', { id, to });
const due = await D.evaluate(id => ZAPI.refresh().then(() => ZPAY.due(S.bk.find(x => x.id == id), 'down')), id);
await act(D, 'driverPay', { id, kind: 'down', g: 0, c: due, rcv: 2000 });
await go(C, 'reports');
await C.locator('details.z7-chgw > summary').click(); await sleep(300);
await C.locator(`.z7-chgw summary`, { hasText: 'Got the wrong change? Report it' }).first().click(); await sleep(300);
await C.fill(`#z7-ca-${id}`, '100'); await C.fill(`#z7-cg-${id}`, '2000'); await C.fill(`#z7-cd-${id}`, 'I gave 2000 and got back 100 less.');
await C.click(`[data-a="z7-chg"][data-id="${id}"]`); await sleep(1300);
const cc = await C.evaluate(id => ZAPI.refresh().then(() => S.inc.find(c => c.kind == 'change' && c.bid == id)), id);
ok(cc && cc.st == 'Unconfirmed', 'wrong change saved as a draft');
const flagged = await D.evaluate(id => ZAPI.refresh().then(() => ((S.users.find(u => u.em == S.me.em) || {}).flags || []).some(f => f.inc == id)), cc.id);
ok(!flagged, 'the driver is not flagged by a draft');
await C.evaluate(() => render()); await sleep(500);
await C.locator('details.z7-chgw').evaluate(d => (d.open = true));
await C.screenshot({ path: 'cf/4-change-draft.png', fullPage: true });
await C.click(`[data-a="z7-cdm"][data-id="${cc.id}"]`); await sleep(1200);
ok((await inc(C, cc.id)).st == 'Withdrawn', 'wrong-change draft dismissed');

ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
