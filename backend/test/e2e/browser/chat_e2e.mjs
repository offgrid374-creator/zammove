import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('chat', { recursive: true });
const B = 'http://localhost:3100', sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(400); } }
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errs = [];
const mk = async w => { const p = await br.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
const login = async (p, em, ws, wp) => {
  await p.goto(B + '/customer/'); await sleep(900);
  const r = await p.evaluate(em => ZAPI.auth('login', { em, pw: 'Demo1234' }), em);
  await p.evaluate(([me, ws, wp]) => { S.me = me; S.ws = ws; S.wp = S.wp || {}; if (wp) S.wp[ws] = wp; save(); }, [r.me, ws, wp]);
  await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(800);
};
const act = (p, n, x) => p.evaluate(([n, x]) => ZAPI.act(n, x), [n, x]);
const refresh = async p => { await p.evaluate(() => ZAPI.refresh().then(() => render())); await sleep(900); };
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);

/* ---- trip: customer (phone) ↔ driver (desktop) ---- */
const C = await mk(390), D = await mk(1366);
await login(C, 'customer@zammove.test', 'customer');
await login(D, 'driver2@zammove.test', 'driver', 'trip');
const bid = (await act(C, 'createBooking', { pu: 'Tetuan, Zamboanga City', dr: 'Putik, Zamboanga City', dt: day(4), tm: '10:00', vid: 'l3', mv: 0, it: 'Sofa x1, boxes x3', sz: 'M' })).id;
ok(!!bid, 'booking created ' + bid);
ok((await C.locator('#zc-fab').count()) == 0, 'no chat button before a driver accepts');
await act(D, 'setAvail', { s: 'Available' });
ok((await act(D, 'accept', { id: bid })).ok, 'driver accepted');
await refresh(D);
ok((await D.locator('.zc-inline', { hasText: 'Chat with customer' }).count()) == 1, 'driver: “Chat with customer” on the Active trip page');
await D.locator('.zc-inline', { hasText: 'Chat with customer' }).click(); await sleep(800);
ok((await D.locator('#zc-panel').count()) == 1, 'driver: chat panel opens');
await D.locator('.zc-q', { hasText: 'On my way' }).click(); await sleep(1200);
const qt = await D.innerText('#zc-msgs'); if (!/On my way/.test(qt)) console.log('DEBUG msgs:', JSON.stringify(qt), 'toast:', await D.evaluate(() => [...document.querySelectorAll('.toast,#toast,[role=status]')].map(e => e.innerText).join('|')), 'server:', JSON.stringify(await D.evaluate(id => fetch('/api/chat/b/' + id + '?since=0', { headers: { Authorization: 'Bearer ' + ZAPI.token() } }).then(r => r.json()).then(j => j.msgs.map(m => m.x)), bid)));
ok(/On my way/.test(qt), 'driver: quick reply sent');
await refresh(C);
const n = await C.evaluate(() => (document.querySelector('#zc-fab .zc-fn') || {}).textContent);
ok(n == '1', 'customer: chat button shows 1 unread (' + n + ')');
await C.screenshot({ path: 'chat/1-customer-fab.png' });
await C.click('#zc-fab'); await sleep(1200);
ok(/On my way/.test(await C.innerText('#zc-msgs')), 'customer: sees the driver’s message');
await C.fill('#zc-in', 'The gate is blue, I will wait outside.'); await C.press('#zc-in', 'Enter'); await sleep(1200);
await C.screenshot({ path: 'chat/2-customer-chat.png' });
await sleep(3500); // driver panel refreshes every 3 s
ok(/gate is blue/.test(await D.innerText('#zc-msgs')), 'driver: receives the reply without reloading');
ok(/Seen/.test(await D.innerText('#zc-msgs')), 'driver: “Seen” under the message once the customer read it');
ok(await D.evaluate(() => !document.querySelector('.zc-inline .zc-n')), 'driver: the Chat button drops its unread count after reading');
await D.screenshot({ path: 'chat/3-driver-chat.png' });
await refresh(C);
ok(await C.evaluate(() => !(document.querySelector('#zc-fab .zc-fn'))), 'customer: unread cleared after reading');
/* typing slowly through several refreshes while the driver keeps sending: nothing is lost, focus stays */
await C.click('#zc-in');
const sentence = 'Please bring a dolly, the stairs are narrow and the sofa is heavy.';
const typing = C.type('#zc-in', sentence, { delay: 150 }); // about 10 seconds = three refreshes
for (const x of ['Noted', 'Arriving soon']) { await sleep(3000); await act(D, 'chatSend', { k: 'b', id: bid, x }); }
await typing; await sleep(3500);
ok((await C.inputValue('#zc-in')) == sentence, 'customer: a slowly typed sentence is complete after refreshes');
ok(await C.evaluate(() => document.activeElement && document.activeElement.id == 'zc-in'), 'customer: the message box keeps the focus');
ok(/Arriving soon/.test(await C.innerText('#zc-msgs')), 'customer: new messages still appear while typing');
await C.press('#zc-in', 'Enter'); await sleep(1200);
ok(/stairs are narrow/.test(await C.innerText('#zc-msgs')) && (await C.inputValue('#zc-in')) == '', 'customer: the full sentence is sent and the box cleared');
await C.click('[data-zc="close"]').catch(() => {}); await sleep(300);
/* customer Track page button */
await C.evaluate(() => { location.hash = '#track'; view = 'track'; render(); }); await sleep(1000);
ok((await C.locator('.zc-inline', { hasText: 'Chat with driver' }).count()) >= 1, 'customer: “Chat with driver” on Track');

/* ---- rental: renter ↔ owner ---- */
const O = await mk(1366);
let veh = null;
for (const em of ['owner1@zammove.test', 'owner2@zammove.test']) { await login(O, em, 'owner', 'rent'); veh = await O.evaluate(() => (S.vh || []).find(v => v.owner == S.me.em && v.rent && v.rent.on !== false)); if (veh) break; }
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const rid = (await act(C, 'createRental', { veh: veh.id, s: day(20), e: day(21), pt: '09:00', rtm: '17:00', pu: 'Tetuan, Zamboanga City', rt: 'Tetuan, Zamboanga City', lic: 'N01-23-456789', exp: '2030-01-01', ip: IMG, lp: IMG })).id;
await C.evaluate(() => { location.hash = '#rent'; view = 'rent'; ZAPI.refresh().then(() => render()); }); await sleep(1200);
const rb = C.locator('.zc-inline', { hasText: 'Chat with owner' });
ok((await rb.count()) >= 1, 'renter: “Chat with owner” on the rental card');
await rb.first().click(); await sleep(900);
await C.fill('#zc-in', 'Hi! Is a child seat available?'); await C.click('.zc-send'); await sleep(1200);
await refresh(O);
ok((await O.locator('.zc-inline', { hasText: 'Chat with renter' }).count()) >= 1, 'owner: “Chat with renter” on the rental card');
await O.locator('.zc-inline', { hasText: 'Chat with renter' }).first().click(); await sleep(1200);
ok(/child seat/.test(await O.innerText('#zc-msgs')), 'owner: sees the renter’s question');
await O.fill('#zc-in', 'Yes, I will bring one.'); await O.press('#zc-in', 'Enter'); await sleep(1200);
await O.screenshot({ path: 'chat/4-owner-rental.png' });
/* the list shows both conversations for the customer */
await C.click('[data-zc="close"]').catch(() => {}); await sleep(300);
await refresh(C);
await C.click('#zc-fab'); await sleep(800);
ok((await C.locator('.zc-th').count()) == 2, 'customer: list shows the trip and the rental');
await C.screenshot({ path: 'chat/5-customer-list.png' });
/* outsiders cannot read */
const res = await fetch(`${B}/api/chat/b/${bid}?since=0`, { headers: { Authorization: 'Bearer ' + (await O.evaluate(() => ZAPI.token())) } });
ok(res.status == 403, 'the vehicle owner cannot read the trip chat (403)');
ok(!(await C.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'phone: no sideways scroll');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
await br.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
