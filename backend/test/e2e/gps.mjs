/* Live GPS end-to-end test: a simulated driver phone shares its location; the customer and admin see it on the map.
   Start the server:  STORE=memory ALLOW_TEST_SEED=1 TOKEN_SECRET=e2e PORT=3100 node server.js
   Then:               node test/e2e/gps.mjs   (needs playwright-core, Chrome and internet for the map tiles) */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:3100',
  APP = BASE + '/customer/',
  PW = 'Passw0rd1',
  OUT = process.argv[2] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = d => new Date(Date.now() + d * 864e5 + 8 * 36e5).toISOString().slice(0, 10);
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const u = (name, em, x = {}) => ({
  name,
  em,
  ph: '09171112222',
  ad: 'Tetuan, Zamboanga City',
  dob: '1990-01-01',
  ver: true,
  roles: [],
  ...x,
});
const users = [
  u('Carla Mendoza', 'carla@t.ph'),
  u('Ben Torres', 'ben@t.ph', { roles: [{ t: 'driver', st: 'approved' }] }),
  u('Ada Admin', 'ada@t.ph', { adm: 'super' }),
];
await fetch(BASE + '/api/test/seed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    passwords: Object.fromEntries(users.map(x => [x.em, PW])),
    data: {
      users,
      vh: [
        {
          id: 'VH-L1',
          owner: 'ada@t.ph',
          type: 'l3',
          brand: 'Mitsubishi',
          model: 'L300',
          plate: 'DEM 1002',
          color: 'White',
          year: 2021,
          approval: 'Approved',
          status: 'Available',
          docs: [],
          hist: [],
        },
      ],
      asg: [{ id: 'AS-1', vehicle: 'VH-L1', driver: 'ben@t.ph', st: 'Active', hist: [] }],
      dp: { 'ben@t.ph': { avail: 'Available' } },
      bk: [
        {
          id: 'BK-GPS001',
          cu: 'carla@t.ph',
          pu: 'Tetuan, Zamboanga City',
          dr: 'Pasonanca, Zamboanga City',
          dt: day(0),
          tm: '09:00',
          it: 'Sofa, 3 boxes',
          vid: 'l3',
          vn: 'L300 Van',
          mv: 0,
          km: 4,
          tot: 2100,
          st: 'On the Way to Pickup',
          drvUser: 'ben@t.ph',
          drv: 'Ben Torres',
          veh: 'VH-L1',
          cr: new Date().toISOString(),
        },
      ],
    },
  }),
});
const br = await chromium.launch({
  executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errs = [];
const page = async (ctx, em) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() == 'error' && !/tile|ERR_|net::|Failed to load resource/.test(m.text())) errs.push(m.text());
  });
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await p.evaluate(
    async ([em, pw]) => {
      const r = await ZAPI.auth('login', { em, pw });
      S.me = r.me;
      S.ws = 'customer';
      save();
      render();
    },
    [em, PW]
  );
  await sleep(800);
  return p;
};
const view = async (p, h, ws, wp) => {
  await p.evaluate(
    ([h, ws, wp]) => {
      S.ws = ws || 'customer';
      if (wp) S.wp[S.ws] = wp;
      save();
      location.hash = h;
      render();
      scrollTo(0, 0);
    },
    [h, ws, wp]
  );
  await sleep(900);
};
const bk = async () => {
  const l = await (
    await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ em: 'ada@t.ph', pw: PW }),
    })
  ).json();
  return l.state.bk.find(b => b.id == 'BK-GPS001');
};

// driver's phone: geolocation granted, starts near Tetuan
const phone = await br.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 6.933, longitude: 122.079, accuracy: 15 },
});
const d = await page(phone, 'ben@t.ph');
await view(d, '#home', 'driver', 'trip');
ok(
  (await d.locator('#gpsbox').count()) == 1 && /Not sharing/.test(await d.locator('#gpsbox').innerText()),
  'driver sees the Live location box (not sharing yet)'
);
await d.click('[data-a="gps-start"]');
await sleep(2500);
let b = await bk();
ok(b.gps && Math.abs(b.gps.lat - 6.933) < 1e-4 && b.gps.acc == 15, 'phone position reached the server');
ok(
  /Sharing/.test(await d.locator('#gpsbox').innerText()) &&
    /Last sent/.test(await d.locator('#gps-msg').innerText()),
  'driver box shows Sharing and the last send'
);

// customer: live map on Track
const desk = await br.newContext({ viewport: { width: 1280, height: 900 } });
const c = await page(desk, 'carla@t.ph');
await c.evaluate(() => {
  msg.tid = 'BK-GPS001';
});
await view(c, '#track');
await sleep(2500);
ok(
  (await c.locator('#zmap.leaflet-container').count()) == 1,
  'customer Track page shows a real map (Leaflet)'
);
ok((await c.locator('.leaflet-tile-loaded').count()) > 0, 'OpenStreetMap tiles loaded');
const tips = await c.locator('.leaflet-tooltip').allInnerTexts();
ok(
  tips.some(t => /Pickup/.test(t)) &&
    tips.some(t => /Drop-off/.test(t)) &&
    tips.some(t => /Driver · Ben Torres/.test(t)),
  'map shows pickup, drop-off and the driver'
);
let info = await c.locator('#zmap-info').innerText();
ok(
  /Live · updated/.test(info) && /to the pickup/.test(info) && /±15 m/.test(info),
  'info line: live, accuracy, distance and minutes to the pickup'
);
ok(
  !/not connected/i.test(await c.locator('#app').innerText()),
  'the old "GPS not connected" placeholder is gone'
);
await c
  .locator('#zmap')
  .screenshot({ path: OUT + '/gps-customer-map.png', timeout: 15000 })
  .catch(() => console.log('(screenshot skipped)'));

// driver moves; customer marker moves without a page re-render
await c.evaluate(() => {
  window.__mapEl = document.getElementById('zmap');
  window.__before = document.getElementById('zmap-info').textContent;
});
await sleep(4500);
await phone.setGeolocation({ latitude: 6.93, longitude: 122.08, accuracy: 10 });
await sleep(2500);
b = await bk();
ok(Math.abs(b.gps.lat - 6.93) < 1e-4 && b.trail.length >= 2, 'new position and trail on the server');
await sleep(11000);
const same = await c.evaluate(() => document.getElementById('zmap') === window.__mapEl);
info = await c.locator('#zmap-info').innerText();
ok(same && /±10 m/.test(info), 'customer map updated in place (no page reload) with the new position');

// pause sharing
await d.click('[data-a="gps-stop"]');
await sleep(1500);
b = await bk();
ok(!!b.gps.off, 'driver paused sharing');
await sleep(11000);
ok(
  /paused location sharing/.test(await c.locator('#zmap-info').innerText()),
  'customer sees that sharing is paused'
);

// admin live map
const a = await page(desk, 'ada@t.ph');
await view(a, '#home', 'admin', 'map');
await sleep(1500);
ok(
  (await a.locator('#zmap.leaflet-container').count()) == 1 &&
    /BK-GPS001/.test(await a.locator('#zmap-info').innerText()),
  'admin Live map lists the trip'
);
ok(errs.length == 0, 'no page errors ' + errs.join(' | '));
await br.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
