/* End-to-end test through the real UI against a running backend.
   Start the server first:  STORE=memory ALLOW_TEST_SEED=1 TOKEN_SECRET=e2e PORT=3100 node server.js
   Then:                     node test/e2e/e2e.mjs   (needs playwright-core and a local Chrome; set CHROME to its path) */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:3100',
  APP = BASE + '/customer/',
  ADMIN = BASE + '/admin/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = 'Passw0rd1',
  future = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const api = async (path, body, token) =>
  (
    await fetch(BASE + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  ).json();
const u = (name, em, x = {}) => ({
  name,
  em,
  ph: '09170000000',
  ad: 'Tetuan, Zamboanga City',
  dob: '1990-01-01',
  ver: true,
  roles: [],
  ...x,
});

const br = await chromium.launch({ executablePath: CHROME });
const ctx = await br.newContext();
await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const errs = [];
const page = async () => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() == 'error' && !/fonts|ERR_|net::|Failed to load resource/.test(m.text()))
      errs.push(m.text());
  });
  return p;
};
const click = async (p, s, ms = 600) => {
  await p.click(s);
  await sleep(ms);
};
const uiLogin = async (p, em) => {
  await p.goto(APP + '?v=' + Date.now());
  await sleep(400);
  await click(p, '[data-a="swap"][data-m="in"]', 200);
  await p.fill('#em', em);
  await p.fill('#pw', PW);
  await click(p, '[data-a="login"]', 900);
};
const go = async (p, hash, ws, wp) => {
  await p.evaluate(
    ([ws, wp]) => {
      if (ws) {
        S.ws = ws;
        if (wp) S.wp[ws] = wp;
        save();
      }
    },
    [ws, wp]
  );
  await p.evaluate(h => {
    location.hash = h;
  }, hash);
  await sleep(300);
  await p.evaluate(() => render());
  await sleep(300);
};
const st = async em => {
  const l = await api('/auth/login', { em, pw: PW });
  return l.state;
};
const bk = async (em, id) => (await st(em)).bk.find(b => b.id == id);

try {
  // 1. owner setup through the UI on an empty server, only once
  await api('/test/seed', { data: { users: [] } });
  const t0 = await page();
  await t0.goto(APP + '#owner-setup');
  await sleep(500);
  await t0.fill('#sa-n', 'Ada Owner');
  await t0.fill('#sa-e', 'owner@t.ph');
  await t0.fill('#sa-p', 'Owner12345');
  await t0.fill('#sa-p2', 'Owner12345');
  await click(t0, '[data-a="sa-setup"]', 900);
  ok((await t0.evaluate(() => S.me && S.me.em)) == 'owner@t.ph', 'owner admin created through #owner-setup');
  ok(
    (await api('/auth/owner-setup', { name: 'X', em: 'x@t.ph', pw: '0123456789' })).ok === false,
    'a second owner setup is refused by the server'
  );
  await t0.close();

  // seed the fleet
  await api('/test/seed', {
    passwords: Object.fromEntries(['a@t.ph', 'd1@t.ph', 'o@t.ph', 'b@t.ph'].map(e => [e, PW])),
    data: {
      users: [
        u('Ada Admin', 'a@t.ph', { adm: 'super' }),
        u('Dina Driver', 'd1@t.ph', { roles: [{ t: 'driver', st: 'approved' }] }),
        u('Olga Owner', 'o@t.ph', { roles: [{ t: 'owner', st: 'approved' }] }),
        u('Bea Other', 'b@t.ph'),
      ],
      vh: [
        {
          id: 'V1',
          owner: 'o@t.ph',
          type: 'l3',
          brand: 'Mitsubishi',
          model: 'L300',
          plate: 'AAA 1111',
          approval: 'Approved',
          status: 'Available',
          docs: [],
          hist: [],
        },
      ],
      asg: [{ id: 'S1', vehicle: 'V1', driver: 'd1@t.ph', st: 'Active', hist: [] }],
      dp: { 'd1@t.ph': { avail: 'Available' } },
    },
  });

  // 2. signup + account verification through the UI
  const c = await page();
  await c.goto(APP);
  await sleep(400);
  await click(c, '[data-a="swap"][data-m="up"]', 300);
  for (const [k, v] of [
    ['fn', 'Carla Cust'],
    ['db', '1990-03-03'],
    ['ph', '09171112222'],
    ['em', 'carla@t.ph'],
    ['ad', 'Tetuan, Zamboanga City'],
    ['pw', PW],
    ['pw2', PW],
  ])
    await c.fill('#' + k, v);
  await c.check('#tc');
  await click(c, '[data-a="signup"]', 1000);
  ok(
    (await c.evaluate(() => S.me && S.me.em)) == 'carla@t.ph',
    'customer signed up through the form (password hashed on the server)'
  );
  const code = await c.evaluate(() => (S.users.find(x => x.em == 'carla@t.ph') || {}).code);
  await c.fill('#vc', code);
  await click(c, '[data-a="verify"]', 800);
  ok(
    await c.evaluate(() => S.users.find(x => x.em == 'carla@t.ph').ver === true),
    'account verified with the code'
  );

  // 3. booking through the form; price and distance come from the server
  await go(c, '#book');
  await c.fill('#pu', 'Tetuan, Zamboanga City');
  await c.fill('#dr', 'Putik, Zamboanga City');
  await c.click('[data-a="pick"][data-id="l3"]');
  await c.fill('#dt', future(30));
  await c.fill('#tm', '09:00');
  await c.fill('#it', 'Sofa, 3 boxes');
  await c.check('#lc');
  await sleep(800);
  await click(c, '[data-a="submitbk"]', 1200);
  const cv = await c.evaluate(() => S.bk.map(b => ({ id: b.id, tot: b.tot, st: b.st })));
  ok(
    cv.length == 1 && cv[0].tot == 1985 && cv[0].st == 'Pending',
    'booking created on the server (₱1,985 for 3 km)'
  );
  const id = cv[0].id;

  // 4. driver in a second tab, at the same time
  const d = await page();
  await uiLogin(d, 'd1@t.ph');
  ok(
    (await d.evaluate(() => S.me.em)) == 'd1@t.ph' && (await c.evaluate(() => S.me.em)) == 'carla@t.ph',
    'two tabs, two different users, side by side'
  );
  ok(
    await d.evaluate(i => {
      const b = S.bk.find(x => x.id == i);
      return !!b && !b.cu;
    }, id),
    'driver sees the open request without customer details'
  );
  await go(d, '#home', 'driver', 'req');
  await click(d, `[data-a="w-acc"][data-id="${id}"]`, 900);
  await go(d, '#home', 'driver', 'trip');
  await click(d, `[data-a="w-st"][data-to="On the Way to Pickup"]`);
  await click(d, `[data-a="w-st"][data-to="Awaiting Down Payment"]`);

  // 5. customer submits GCash proof, driver confirms it: counted once
  await c.reload();
  await sleep(800);
  await go(c, '#bookings');
  await c.fill('#pr' + id, '1234567890');
  await click(c, `[data-a="pay"][data-id="${id}"]`, 1000);
  await d.reload();
  await sleep(800);
  await go(d, '#home', 'driver', 'trip');
  ok((await d.inputValue('#r-' + id)) == '1234567890', 'driver form pre-filled from the customer proof');
  await click(d, `[data-a="w-pay"][data-id="${id}"]`, 1000);
  const pays = (await st('d1@t.ph')).pay.filter(p => p.bid == id);
  ok(
    pays.length == 1 && pays[0].status == 'Recorded by driver',
    'one payment record, confirmed by the driver'
  );

  // 6. pre-departure verification
  await d.fill('#n-' + id, 'Sofa and 3 boxes');
  await click(d, `[data-a="w-st"][data-to="Items Loaded"]`);
  await go(c, '#track');
  await sleep(1200);
  await go(c, '#track');
  const spin = (await c.locator('#vz .vz-pin').innerText()).replace(/\s/g, '');
  ok(/^\d{6}$/.test(spin), 'customer sees the Start PIN on Track');
  ok((await c.locator('#vz [data-a="vz-ver"]').count()) == 0, 'customer has no driver controls');
  await d.reload();
  await sleep(800);
  await go(d, '#home', 'driver', 'trip');
  await d.fill('#vz-pi', spin);
  await click(d, '[data-a="vz-ver"][data-k="pin"]', 900);
  await d.fill('#vz-pl', 'AAA1111');
  await click(d, '[data-a="vz-plate"]', 900);
  await d.fill('#vz-n', '4');
  await d.check('#vz-it0');
  await d.check('#vz-it1');
  await click(d, '[data-a="vz-save"]', 900);
  await click(d, '[data-a="vz-dconf"]', 900);
  await go(c, '#track');
  await c.reload();
  await sleep(900);
  await go(c, '#track');
  await c.check('#vz-rv');
  await click(c, '[data-a="vz-cconf"]', 900);
  await d.reload();
  await sleep(800);
  await go(d, '#home', 'driver', 'trip');
  await click(d, '[data-a="vz-auth"]', 1000);
  ok((await bk('d1@t.ph', id)).st == 'In Transit', 'departure authorized: In Transit');

  // 7. delivery PIN, final payment
  await click(d, `[data-a="w-st"][data-to="Arrived at Destination"]`, 900);
  await c.reload();
  await sleep(900);
  await go(c, '#track');
  await sleep(1200);
  await go(c, '#track');
  const dpin = (await c.locator('#dz .vz-pin').innerText()).replace(/\s/g, '');
  await d.reload();
  await sleep(800);
  await go(d, '#home', 'driver', 'trip');
  await d.fill('#vz-dpi', dpin);
  await d.fill('#vz-dnt', 'All items delivered, no damage');
  await click(d, '[data-a="dz-deliver"]', 1000);
  await click(d, `[data-a="w-st"][data-to="Awaiting Final Payment"]`, 900);
  const due = await d.evaluate(
    i =>
      ZPAY.due(
        S.bk.find(b => b.id == i),
        'final'
      ),
    id
  );
  await d.fill('#c-' + id, String(due));
  await click(d, `[data-a="w-pay"][data-id="${id}"]`, 1000);
  ok((await bk('d1@t.ph', id)).st == 'Completed', 'delivered with the Delivery PIN and completed');

  // 8. isolation and secrets
  const b = await page();
  await uiLogin(b, 'b@t.ph');
  const bv = await b.evaluate(() => ({
    bk: S.bk.length,
    pay: S.pay.length,
    nt: S.nt.length,
    users: S.users.map(x => x.em),
  }));
  ok(
    bv.bk == 0 && bv.pay == 0 && bv.nt == 0 && !bv.users.includes('carla@t.ph'),
    "another customer sees none of Carla's data"
  );
  const raw = JSON.stringify(await c.evaluate(() => S));
  ok(!raw.includes('scrypt$') && !/"pw":/.test(raw), 'no password hashes reach the browser');
  ok(
    await c.evaluate(() => Object.keys(localStorage).every(k => k == 'zm_mode')),
    'no business data in browser storage'
  );
  const forged = await c.evaluate(() =>
    fetch('/api/act/staffAdd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ZAPI.token() },
      body: JSON.stringify({ em: 'carla@t.ph', role: 'admin' }),
    }).then(r => r.json())
  );
  ok(forged.ok === false, 'a customer calling an admin action directly is refused');

  // 9. Admin Panel
  const a = await page();
  await a.goto(ADMIN);
  await sleep(400);
  await a.fill('#em', 'b@t.ph');
  await a.fill('#pw', PW);
  await click(a, '[data-a="login"]', 900);
  ok(/no staff access/.test(await a.locator('body').innerText()), 'Admin Panel refuses a non-staff account');
  await a.fill('#em', 'a@t.ph');
  await a.fill('#pw', PW);
  await click(a, '[data-a="login"]', 900);
  await click(a, '[data-a="nav"][data-p="pay"]', 500);
  const at = await a.locator('body').innerText();
  ok(
    (at.match(/1234567890/g) || []).length == 1 && /Recorded by driver/.test(at),
    'Admin Panel ledger shows the payment once'
  );
  await click(a, '[data-a="nav"][data-p="set"]', 300);
  await a.fill('#rate', '75');
  await click(a, '[data-a="cfg"]', 700);
  ok((await st('a@t.ph')).cfg.coShare == 75, 'Admin Panel setting saved on the server');

  // 10. public tracking by reference, logged out
  const pub = await page();
  await pub.goto(APP);
  await sleep(400);
  await click(pub, '[data-a="pst"][data-t="track"]', 200);
  await pub.fill('#hp-r', id);
  await click(pub, '[data-a="psgo"]', 1200);
  ok(
    /Completed/.test(await pub.locator('#ps-res').innerText()),
    'logged-out "Track a trip" reads the status from the server'
  );
  ok(errs.length == 0, 'no page errors ' + errs.join(' | '));
} catch (e) {
  console.error(e);
  fails++;
}
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
