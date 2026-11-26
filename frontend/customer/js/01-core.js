/**
 * 01-core.js — foundation of the customer app (loaded first, after shared/api.js).
 *
 * Defines the globals every later file uses:
 *   S          read-only copy of the logged-in user's data from the server (replaced after every API response)
 *   HV, RV     vehicle catalogue (hauling types, self-drive fleet) — display copy, refreshed from S.fleet
 *   FLOW, TRK  the booking status order and the statuses where tracking is open
 *   ZPAY       payment helpers (what counts as paid, the 50/50 split)
 *   render()   draws the current view into <main id="app">; later files wrap it
 *   msg, view, sel   UI state (messages, current page, selected vehicle)
 *
 * The original screens (home, book, rent, bookings, track, reports, settings) are defined here;
 * later files replace or extend them. Handlers that change data are skipped here and handled
 * as server actions in 02-upgrade.js.
 */
const $ = s => document.querySelector(s);
/* display copy of the vehicle catalogue; replaced by the server's S.fleet after each response */
const HV = [
  { id: 'tw', n: '3-Wheeler', ic: '', cap: 'Bajaj / Piaggio type · 500 kg · 5 ft bed', base: 600, km: 15 },
  { id: 'pk', n: 'Pickup Truck', ic: '', cap: '1 ton · 8 ft bed', base: 1200, km: 25 },
  { id: 'l3', n: 'L300 Van', ic: '', cap: '1.5 tons · 10 ft', base: 1800, km: 30 },
  { id: 'cv', n: 'Closed Van', ic: '', cap: '3 tons · 14 ft', base: 2500, km: 35 },
  { id: 'w6', n: '6-Wheeler', ic: '', cap: '6 tons · 20 ft', base: 4000, km: 50 },
];
const RV = [
  {
    id: 'r1',
    n: 'Toyota Vios',
    ic: '',
    sp: '5 seats · Automatic',
    day: 1800,
    color: 'Silver Metallic',
    year: 2022,
    trans: 'Automatic',
    fuel: 'Gasoline',
    seats: 5,
    bags: '2 large bags',
    features: ['Air conditioning', 'Bluetooth audio', 'Rear parking camera', 'Dual front airbags'],
    notes: 'Best for city driving and airport runs.',
  },
  {
    id: 'r2',
    n: 'Toyota Hiace',
    ic: '',
    sp: '15 seats · Manual',
    day: 3500,
    color: 'White Pearl',
    year: 2021,
    trans: 'Manual',
    fuel: 'Diesel',
    seats: 15,
    bags: 'Rear cargo area for 10+ bags',
    features: ['Rear air conditioning', 'Sliding side door', 'USB charging'],
    notes: 'Group trips and family outings; long body, park with care.',
  },
  {
    id: 'r3',
    n: 'Isuzu D-Max',
    ic: '',
    sp: '5 seats · 4x4',
    day: 3000,
    color: 'Obsidian Gray',
    year: 2023,
    trans: 'Automatic',
    fuel: 'Diesel',
    seats: 5,
    bags: 'Open cargo bed (no cover)',
    features: ['4x4 drive', 'Hill descent control', 'Tow hitch'],
    notes: 'Rough roads and light cargo; the bed is open to rain.',
  },
];
/* the ONE booking status order, used by customer, driver, admin and API.step (+ terminal 'Cancelled', 'Rejected') */
const FLOW = [
  'Pending',
  'Accepted',
  'On the Way to Pickup',
  'Awaiting Down Payment',
  'Down Payment Confirmed',
  'Items Loaded',
  'In Transit',
  'Arrived at Destination',
  'Delivery Confirmation',
  'Awaiting Final Payment',
  'Completed',
];
/* the ONE list of statuses a customer may cancel from; a 10% fee applies once the driver heads to the pickup
   (same lists as backend/src/domain/constants.js, so the screen never shows a fee the server won't charge) */
const CANCEL_OK = ['Pending', 'No driver found', 'Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'],
  CANCEL_FREE = ['Pending', 'No driver found', 'Accepted'],
  cancelFee = b => (CANCEL_FREE.includes(b.st) ? 0 : Math.round((+b.tot || 0) * 10) / 100);
const TRK = [
  'On the Way to Pickup',
  'Awaiting Down Payment',
  'Down Payment Confirmed',
  'Items Loaded',
  'In Transit',
  'Arrived at Destination',
  'Delivery Confirmation',
];
const PL = [
  ['Tetuan, Zamboanga City', 6.9194, 122.084],
  ['Sta. Maria, Zamboanga City', 6.9312, 122.0749],
  ['Putik, Zamboanga City', 6.9413, 122.0958],
  ['Tumaga, Zamboanga City', 6.9394, 122.0796],
  ['Guiwan, Zamboanga City', 6.929, 122.0923],
  ['Canelar, Zamboanga City', 6.9163, 122.0703],
  ['Pasonanca, Zamboanga City', 6.9478, 122.0727],
  ['Baliwasan, Zamboanga City', 6.9159, 122.0598],
  ['Ayala, Zamboanga City', 6.965, 121.9477],
  ['Mercedes, Zamboanga City', 6.9586, 122.1476],
  ['Zone I (Downtown), Zamboanga City', 6.9062, 122.0718],
  ['Zone IV, Zamboanga City', 6.9053, 122.0758],
  ['Sta. Catalina, Zamboanga City', 6.9091, 122.0868],
  ['Divisoria, Zamboanga City', 6.9461, 122.1028],
  ['Lunzuran, Zamboanga City', 6.9589, 122.0909],
  ['Sinunuc, Zamboanga City', 6.9337, 122.0015],
  ['Talon-Talon, Zamboanga City', 6.9098, 122.1113],
  ['Recodo, Zamboanga City', 6.9544, 121.9598],
  ['Mampang, Zamboanga City', 6.9157, 122.134],
  ['Pasobolong, Zamboanga City', 6.968, 122.1304],
  ['Maasin, Zamboanga City', 6.9712, 122.0062],
  ['Taluksangay, Zamboanga City', 6.951, 122.1821],
  ['Cabatangan, Zamboanga City', 6.9422, 122.0547],
  ['San Roque, Zamboanga City', 6.9306, 122.0463],
  ['Bunguiao, Zamboanga City', 7.1044, 122.1951],
  ['Vitali, Zamboanga City', 7.3704, 122.2879],
  ['Cawit, Zamboanga City', 6.9557, 121.9739],
  ['Zamboanga City Hall', 6.9039, 122.0765],
  ['Fort Pilar Shrine, Zamboanga City', 6.9013, 122.0827],
  ['Paseo del Mar, Zamboanga City', 6.9003, 122.0812],
  ['Zamboanga International Airport', 6.9222, 122.0598],
  ['KCC Mall de Zamboanga', 6.9198, 122.0735],
  ['Ateneo de Zamboanga University', 6.9104, 122.0761],
  ['Western Mindanao State University, Zamboanga City', 6.9135, 122.0615],
  ['Zamboanga City Port', 6.9032, 122.0728],
  ['Pasonanca Park, Zamboanga City', 6.953, 122.073],
  ['Zamboanga City Public Market', 6.9041, 122.0744],
];
const zcBox = (la, lo) => la >= 6.85 && la <= 7.5 && lo >= 121.9 && lo <= 122.4;
/* outside the city even though the name contains "Zamboanga": the provinces and their towns */
const OUTSIDE_ZC = /zamboanga\s+(del\s+sur|del\s+norte|sibugay)|\b(pagadian|dipolog|dapitan|ipil|isabela\s+city|basilan|sulu|jolo|tawi-tawi|molave|tukuran|dumingag|sindangan|liloy|kabasalan|diplahan|labason)\b/;
const inZC = t => {
  t = String(t || '').toLowerCase();
  /* a picked or pinned place carries coordinates: they decide */
  const c = t.match(/\((-?\d+\.\d+), (-?\d+\.\d+)\)/);
  if (c) return zcBox(+c[1], +c[2]);
  if (OUTSIDE_ZC.test(t) && !/zamboanga\s+city/.test(t)) return false;
  if (/zamboanga\s+city/.test(t)) return true;
  if (t.includes('zamboanga') && !OUTSIDE_ZC.test(t)) return true;
  return PL.some(x => t.includes(x[0].split(',')[0].toLowerCase()));
};
const peso = n =>
  '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
/* S is a read-only copy of what the server lets this user see (backend/src/views.js). It is replaced after every server response. */
let S = {
  users: [],
  me: null,
  bk: [],
  rn: [],
  pay: [],
  inc: [],
  rev: [],
  nt: [],
  apps: [],
  vh: [],
  asg: [],
  dp: {},
  rem: [],
  au: [],
  cfg: { coShare: 80, pendMin: 30 },
  ratings: {},
  rnAvail: [],
};
try {
  S.mode = localStorage.getItem('zm_mode') || '';
} catch (e) {}
/* ===== Per-tab session: the login token (shared/api.js), the user and the open workspace live in sessionStorage, so each tab keeps its own login. ===== */
const SESS_KEY = 'zm_session',
  SESS = ['me', 'ws', 'wp'];
const loadSess = () => {
  let x = {};
  try {
    x = JSON.parse(sessionStorage.getItem(SESS_KEY) || '{}');
  } catch (e) {}
  S.me = ZAPI.token() ? x.me || null : null;
  S.ws = x.ws || 'customer';
  S.wp = x.wp || {};
};
loadSess();
/* persist(): only this tab's session and the theme are stored in the browser. All business data lives on the server. */
const persist = () => {
  try {
    sessionStorage.setItem(
      SESS_KEY,
      JSON.stringify({ me: S.me || null, ws: S.ws || 'customer', wp: S.wp || {} })
    );
  } catch (e) {}
  try {
    if (S.mode) localStorage.setItem('zm_mode', S.mode);
  } catch (e) {}
};
const save = () => {
  try {
    persist();
  } catch (e) {}
};
const audit = () => {}; /* audit entries are written by the server */
/* server view -> S, keeping this tab's session and display preferences */
ZAPI.onState = v => {
  const keep = { me: S.me, ws: S.ws, wp: S.wp, mode: S.mode };
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, v, keep);
  if (v.fleet) {
    HV.splice(0, HV.length, ...v.fleet.HV.map(x => ({ ic: '', ...x })));
    RV.splice(0, RV.length, ...v.fleet.RV.map(x => ({ ic: '', ...x })));
  }
  if (S.me) {
    const u = (S.users || []).find(x => x.em == S.me.em);
    if (u) S.me = { name: u.name, em: u.em };
  }
};
ZAPI.onLogout = m => {
  S.me = null;
  S.ws = 'customer';
  save();
  msg = { mode: 'in', auth: m };
  render();
};
/* ===== One payment model, used by every view (customer, driver, cashier, ledger) =====
   record: {id,bid,kind:'down'|'final'|'rental'|'deposit'|'cancel_fee',method,amount,ref,payer,collectedBy,by,status,t,pf}
   status: 'Submitted' (customer proof, NOT counted) | 'Recorded by driver' | 'Verified' (counted) | 'Rejected'.
   Booking down/final payments are confirmed by the collecting driver; rental, deposit and fee payments by a cashier or admin.
   The Admin Panel file keeps an identical copy of OK/counted. */
const ZPAY = {
  OK: ['Recorded by driver', 'Verified'],
  counted: p => !!p && ZPAY.OK.includes(p.status),
  r2: x => Math.round((+x || 0) * 100) / 100,
  half: b => Math.round(Math.round((+b.tot || 0) * 100) / 2) / 100,
  due: (b, k) => (k == 'down' ? ZPAY.half(b) : ZPAY.r2((+b.tot || 0) - ZPAY.half(b))),
  sum: (bid, kind) =>
    ZPAY.r2(
      S.pay
        .filter(p => p.bid == bid && (!kind || p.kind == kind) && ZPAY.counted(p))
        .reduce((s, p) => s + p.amount, 0)
    ),
  pending: (bid, kind) =>
    ZPAY.r2(
      S.pay
        .filter(p => p.bid == bid && (!kind || p.kind == kind) && p.status == 'Submitted')
        .reduce((s, p) => s + p.amount, 0)
    ),
  total: l => ZPAY.r2((l || S.pay).filter(ZPAY.counted).reduce((s, p) => s + p.amount, 0)),
  id: () => 'PY-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
  mk: o => ({ id: ZPAY.id(), t: new Date().toISOString(), payer: '', collectedBy: '', ...o }),
  norm: () => {
    (S.pay = S.pay || []).forEach(p => {
      if (!p.id) p.id = ZPAY.id();
      if (p.by && !p.collectedBy) p.collectedBy = p.by;
      if (p.status == 'Unverified' || p.status == 'Pending collection') p.status = 'Submitted';
    });
  },
};
ZPAY.norm();
let view = (location.hash || '#home').slice(1),
  sel = { v: 'pk', rv: null },
  msg = {};
const VIEWS = ['home', 'book', 'rent', 'bookings', 'track', 'reports', 'settings'];
const I = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    car: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
    truck:
      '<path d="M2 6h12v11H2z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    van: '<path d="M2 7h11l4 4h5v6H2z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    list: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
  },
  VI = { tw: 'box', pk: 'truck', l3: 'van', cv: 'van', w6: 'truck', r1: 'car', r2: 'van', r3: 'truck' };
const ico = (n, z = 18) =>
  `<svg viewBox="0 0 24 24" width="${z}" height="${z}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
const NAMES = {
    home: 'Home',
    book: 'Book',
    rent: 'Rent',
    bookings: 'Bookings',
    track: 'Track',
    reports: 'Report',
  },
  IC = { home: 'home', book: 'box', rent: 'car', bookings: 'list', track: 'pin', reports: 'alert' };
function go(v) {
  view = v;
  location.hash = v;
  render();
}
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (VIEWS.includes(h) && h !== view) {
    view = h;
    render();
  }
});

function est() {
  const v = HV.find(x => x.id === sel.v),
    km = +($('#km')?.value || 0),
    mv = +($('#mv')?.value || 0);
  const dist = km * v.km,
    mov = mv * 500,
    sub = v.base + dist + mov,
    fee = Math.round(sub * 0.05),
    tot = sub + fee;
  return { v, km, mv, dist, mov, fee, tot };
}
const hash = async s =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
const age = d => (Date.now() - new Date(d)) / 31557600000;

function authView(mode) {
  return `<div class="auth card"><h1>${mode == 'up' ? 'Create account' : 'Welcome back'}</h1><p class="mu">${mode == 'up' ? 'Sign up to book hauls and rentals.' : 'Log in to continue.'}</p>
<form id="af" onsubmit="return false" novalidate>
${mode == 'up' ? `<label>Full name</label><input id="fn"><label>Date of birth</label><input id="db" type="date"><label>Phone</label><input id="ph" inputmode="tel" placeholder="09XXXXXXXXX"><label>Complete address</label><input id="ad">` : ''}
<label>Email</label><input id="em" type="email" autocomplete="email"><label>Password</label><input id="pw" type="password" autocomplete="${mode == 'up' ? 'new-password' : 'current-password'}" ${mode == 'up' ? 'oninput="mt()"' : ''}>
${mode == 'up' ? '<div class="meter"><i id="mt" style="width:0"></i></div><div class="mu" style="font-size:12px">8+ characters with a number and a letter.</div>' : ''}
${mode == 'up' ? '<label>Confirm password</label><input id="pw2" type="password" autocomplete="new-password" oninput="mm()"><div class="mu" id="mm" style="font-size:12px;min-height:18px"></div>' : ''}
<div class="err" id="er">${esc(msg.auth || '')}</div><div style="margin-top:12px;display:flex;gap:8px;align-items:center"><button class="btn" data-a="${mode == 'up' ? 'signup' : 'login'}">${mode == 'up' ? 'Create account' : 'Log in'}</button>
<a href="#" class="mu" data-a="swap" data-m="${mode == 'up' ? 'in' : 'up'}">${mode == 'up' ? 'Have an account? Log in' : 'New here? Sign up'}</a></div></form>
<div class="note">Your account is stored on the ZamMove server; passwords are kept only as salted hashes. SMS and email codes are simulated in this prototype.</div></div>`;
}
window.mt = () => {
  const p = $('#pw').value;
  let s = 0;
  if (p.length >= 8) s++;
  if (/\d/.test(p)) s++;
  if (/[a-z]/i.test(p)) s++;
  if (p.length >= 12) s++;
  $('#mt').style.width = s * 25 + '%';
  if ($('#pw2')) mm();
};
window.mm = () => {
  const a = $('#pw').value,
    b = $('#pw2').value,
    m = $('#mm');
  if (!b) {
    m.textContent = '';
    return;
  }
  m.textContent = a == b ? '✓ Passwords match' : 'Passwords do not match';
  m.style.color = a == b ? '#dc2626' : '#dc2626';
};

const WP = [
    [25, 170],
    [85, 125],
    [150, 110],
    [210, 60],
    [270, 35],
  ],
  ST = {
    Accepted: 0,
    'Awaiting Down Payment': 0.26,
    'Down Payment Confirmed': 0.26,
    'Items Loaded': 0.27,
    'Arrived at Destination': 1,
    'Delivery Confirmation': 1,
    'Awaiting Final Payment': 1,
  },
  RNG = { 'On the Way to Pickup': [0, 0.26], 'In Transit': [0.27, 0.98] };
function pos(t) {
  let L = [],
    T = 0;
  for (let i = 1; i < WP.length; i++) {
    const d = Math.hypot(WP[i][0] - WP[i - 1][0], WP[i][1] - WP[i - 1][1]);
    L.push(d);
    T += d;
  }
  let d = Math.max(0, Math.min(1, t)) * T;
  for (let i = 0; i < L.length; i++) {
    if (d <= L[i] || i == L.length - 1) {
      const k = Math.min(1, d / L[i]);
      return [WP[i][0] + (WP[i + 1][0] - WP[i][0]) * k, WP[i][1] + (WP[i + 1][1] - WP[i][1]) * k];
    }
    d -= L[i];
  }
}
function tOf(b) {
  const r = RNG[b.st];
  return r ? r[0] + (r[1] - r[0]) * ((msg.tp || {})[b.id + b.st] || 0) : (ST[b.st] ?? 0);
}
function applyMode() {
  const m = S.mode || 'dark',
    r = m == 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m;
  document.documentElement.setAttribute('data-mode', r);
}
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.mode == 'system') applyMode();
  });
} catch (e) {}
function render() {
  $('#nav').innerHTML = S.me
    ? VIEWS.filter(v => v != 'settings')
        .map(
          v =>
            `<a class="${v == view ? 'on' : ''}" data-a="nav" data-v="${v}"><span class="ic">${ico(IC[v], 20)}</span>${NAMES[v]}</a>`
        )
        .join('')
    : '';
  $('#lo').hidden = !S.me;
  $('#hs').hidden = !S.me;
  $('#hs').classList.toggle('on', view == 'settings');
  const a = $('#app');
  if (!S.me) {
    a.innerHTML = authView(msg.mode || 'up');
    return;
  }
  a.innerHTML = ({ home, book, rent, bookings, track, reports, settings }[view] || home)();
  if (view == 'book') upd();
}
const RT = [
  ['pk', 'Tetuan', 'Sta. Maria', 6],
  ['l3', 'Putik', 'Pasonanca', 8],
  ['cv', 'Guiwan', 'Ayala', 12],
  ['w6', 'Canelar', 'Tumaga', 9],
  ['pk', 'Mercedes', 'Zone I (Downtown)', 3],
];
const stackSvg = () => {
  const P = ['#4c2a85', '#5b34a0', '#2f8f86', '#7c3aed', '#d9d4cc', '#255f78', '#3b1f6b', '#3b9c8d'];
  let r = '';
  for (let c = 0; c < 11; c++)
    for (let k = 0; k < c + 3; k++)
      r += `<rect x='${330 + c * 60}' y='${520 - (k + 1) * 29 - c * 4}' width='57' height='27' rx='2' fill='${P[(c * 3 + k * 5) % 8]}' opacity='${(0.55 + ((c + k) % 3) * 0.15).toFixed(2)}'/>`;
  return `<svg viewBox='0 0 1000 540' preserveAspectRatio='xMaxYMax slice'>${r}</svg>`;
};
function home() {
  const nb = S.bk.filter(b => !['Completed', 'Cancelled', 'Rejected'].includes(b.st)).length,
    done = S.bk.filter(b => b.st == 'Completed').length,
    fn = esc(S.me.name.split(' ')[0]);
  const sec = (e, t, p) => `<div class='sec'><div class='eb'>${e}</div><h2>${t}</h2><p>${p}</p></div>`;
  const F = [
    ['tag', 'Upfront pricing', 'See an itemized estimate before you submit a request.'],
    ['card', '50/50 payments', 'Pay half when the driver arrives at pickup and the rest after delivery.'],
    ['pin', 'Trip tracking', 'Follow your driver on a map once a provider accepts.'],
    ['shield', 'Driver details', 'Review your driver and vehicle information before pickup.'],
  ];
  const Q = [
    [
      'How is the price calculated?',
      'A base fare for the vehicle, a distance charge, optional movers and a 5% service fee. The price is fixed when you submit the booking; you see the full breakdown before you confirm.',
    ],
    [
      'When do I pay?',
      'A 50% down payment is collected when the driver arrives at pickup. The remaining 50% is due after your items are delivered.',
    ],
    [
      'When can I track my trip?',
      'Tracking opens after a driver accepts your booking and ends when the trip is completed or cancelled.',
    ],
    ['Can I cancel a booking?', 'Yes, while it is Pending, Accepted or Awaiting Down Payment.'],
  ];
  const est = r => {
    const v = HV.find(x => x.id == r[0]),
      sub = v.base + r[3] * v.km;
    return sub + Math.round(sub * 0.05);
  };
  return `<section class='hero3'><div class='hbg'>${stackSvg()}</div><div class='hl3'><span class='pill'>Zamboanga City &middot; Hauling and moving</span><h1>Move smarter.<br>Haul anything.</h1><p>Hi ${fn}, book a truck with a driver or rent a vehicle to drive yourself. Clear estimates, 50/50 payments and trip tracking in one place.</p><div class='hbtn'><button class='btn rb' data-a='nav' data-v='book'>Book a haul</button><button class='btn o' data-a='nav' data-v='rent'>Rent a vehicle</button></div></div>
 <div class='hst l'><div class='sp'><span>Haul vehicles</span><b>${HV.length}</b></div><div class='sp'><span>Self-drive</span><b>${RV.length}</b></div></div><div class='hst r'><div class='sp'><span>Active</span><b>${nb}</b></div><div class='sp'><span>Completed</span><b>${done}</b></div></div></section>
 <div class='wg'><div class='ac'><label>Pickup</label><input id='qp' data-a='ac' autocomplete='off' placeholder='Place in Zamboanga City'><div class='sug' id='s-qp' hidden></div></div><div class='ac'><label>Drop-off</label><input id='qd' data-a='ac' autocomplete='off' placeholder='Place in Zamboanga City'><div class='sug' id='s-qd' hidden></div></div><div><label>Date</label><input id='qdt' type='date' min='${new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10)}'></div><div><label>Vehicle</label><select id='qv'>${HV.map(v => `<option value='${v.id}'>${v.n}</option>`).join('')}</select></div><button class='btn rb wfull' data-a='quick'>Get estimate</button></div>
 <div class='rt'>${RT.map((r, i) => {
   const v = HV.find(x => x.id == r[0]);
   return `<div class='card rc' data-a='route' data-id='${i}'><div class='rl'>HAUL &middot; ${v.n.toUpperCase()}</div><b>${r[1]} &rarr; ${r[2]}</b><div class='mu' style='font-size:13px'>About ${r[3]} km &middot; Est. ${peso(est(r))}</div></div>`;
 }).join('')}</div>
 ${recent()}
 ${sec('Our fleet', 'Choose the right vehicle', 'Pick a truck that fits your load. Prices shown are base fares before distance and extras.')}
 <div class='grid g3'>${HV.map(v => `<div class='card vc' data-a='pickgo' data-id='${v.id}'><div class='vi'>${ico(VI[v.id], 28)}</div><b>${v.n}</b><div class='mu' style='font-size:13px'>${v.cap}</div><div class='row' style='align-items:center;margin-top:10px'><span class='pr'>From ${peso(v.base)}</span><span class='tag g'>Select</span></div></div>`).join('')}</div>
 ${sec('Why ZamMove', 'Simple, transparent and reliable', 'Everything you need to plan and follow your move.')}
 <div class='grid g3'>${F.map(f => `<div class='card'><div class='vi'>${ico(f[0], 24)}</div><b>${f[1]}</b><p class='mu' style='margin:6px 0 0;font-size:14px'>${f[2]}</p></div>`).join('')}</div>
 ${sec('Support', 'Frequently asked questions', 'Quick answers about booking, payments and tracking.')}
 <div class='faq' style='max-width:760px;margin:auto'>${Q.map((q, i) => `<details ${i == 2 ? 'open' : ''}><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}</div>
 <div class='cta'><div><h2>Ready to move?</h2><p>Get an estimate and submit your booking in a few minutes.</p></div><button class='btn rb' data-a='nav' data-v='book'>Get started now</button></div>
 <div class='note' style='margin-top:16px'><b>Prototype status.</b> Real: forms, validation, estimates, 50/50 payment rules, status checks, rental overlap checks, reviews. Simulated: provider actions, driver details, map and driver position. Not connected: GCash gateway, live GPS, notifications, uploads, backend.</div>`;
}
function settings() {
  const u = S.users.find(x => x.em == S.me.em) || {},
    m = S.mode || 'dark',
    ok = msg.sok;
  msg.sok = '';
  return `<h1>Settings</h1><p class='mu'>Manage your profile and how ZamMove looks.</p><div class='grid g2' style='margin-top:12px'>
 <div><div class='card'><h2>Appearance</h2><div class='seg'>${[
   ['light', 'Light'],
   ['dark', 'Dark'],
   ['system', 'System'],
 ]
   .map(x => `<button class='sgb ${m == x[0] ? 'on' : ''}' data-a='mode' data-m='${x[0]}'>${x[1]}</button>`)
   .join(
     ''
   )}</div><p class='mu' style='margin:10px 0 0;font-size:14px'>System follows your device setting. Your choice is saved on this device.</p></div>
 <div class='card' style='margin-top:14px'><h2>Data</h2><p class='mu' style='margin:0 0 10px;font-size:14px'>Your bookings, rentals, payments, reports and reviews are saved on the ZamMove server, so you see the same data on any device you log in with.</p></div></div>
 <div class='card'><h2>Profile</h2><label>Full name</label><input id='sn' value='${esc(S.me.name)}'><label>Email</label><input value='${esc(S.me.em)}' disabled><label>Phone</label><input id='sp' value='${esc(u.ph || '')}' inputmode='tel'><label>Address</label><input id='sa' value='${esc(u.ad || '')}'><div id='sme' class='err'></div>${ok ? `<div class='ok'>${ok}</div>` : ''}<div style='display:flex;gap:8px;margin-top:14px;flex-wrap:wrap'><button class='btn rb' data-a='saveprof'>Save changes</button></div></div></div>`;
}
function recent() {
  const l = S.bk.slice().reverse().slice(0, 3);
  return `<div class='card' style='margin-top:14px'><div class='row'><h2 style='margin:0'>Recent activity</h2><a class='mu' data-a='nav' data-v='bookings' style='font-size:13px;font-weight:600;cursor:pointer'>See all</a></div>${l.length ? l.map(b => `<div class='row' style='align-items:center;border-top:1px solid var(--bd);padding:12px 0'><div><b>${esc(b.dr)}</b><div class='mu' style='font-size:13px'>From ${esc(b.pu)} · ${b.dt}</div></div><div style='text-align:right'><b>${peso(b.tot)}</b><div><span class='tag g'>${b.st}</span></div></div></div>`).join('') : `<div class='empty' style='padding:24px'>No bookings yet.<div style='margin-top:10px'><button class='btn' data-a='nav' data-v='book'>Book your first haul</button></div></div>`}</div>`;
}
function book() {
  return `<h1>Book a haul</h1><p class="mu">The price is fixed when you submit. You pay 50% when the driver arrives at pickup and the rest after delivery.</p><div class="grid g2"><div class="card">
<label for="pu">Pickup address</label><div class="ac"><input id="pu" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-pu" hidden></div></div><button type="button" class="btn o sm" style="margin-top:8px" data-a="loc">${ico('pin', 16)} Use my current location</button><div class="mu" id="lm" style="font-size:12px;margin-top:4px"></div><label for="dr">Drop-off address</label><div class="ac"><input id="dr" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-dr" hidden></div></div><button type="button" class="btn o sm" style="margin-top:8px" data-a="loc" data-f="dr" data-m="lm3">${ico('pin', 16)} Use my current location</button><div class="mu" id="lm3" style="font-size:12px;margin-top:4px"></div><div class="mu" style="font-size:12px;margin-top:4px">Service area: Zamboanga City only.</div>
<label>Estimated distance (km)</label><input id="km" type="number" min="1" oninput="upd()" value="10"><div class="mu" style="font-size:12px">Map pin selection and auto distance require a maps API (e.g. Google Maps or Leaflet + routing); enter km manually for now.</div>
<h2 style="margin-top:16px">Vehicle</h2><div class="grid g3" style="gap:8px">${HV.map(v => `<div class="veh ${sel.v == v.id ? 'on' : ''}" data-a="pick" data-id="${v.id}"><div class="vi">${ico(VI[v.id], 26)}</div><b>${v.n}</b><div class="mu" style="font-size:12px">${v.cap}</div><div class="pr">${peso(v.base)} base</div></div>`).join('')}</div>
<div class="grid g2" style="gap:8px"><div><label>Pickup date</label><input id="dt" type="date" min="${new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10)}"></div><div><label>Pickup time</label><input id="tm" type="time"></div></div>
<label>Additional movers (₱500 each)</label><input id="mv" type="number" min="0" max="10" value="0" oninput="upd()">
<label>Items to transport</label><textarea id="it" rows="2"></textarea><label>Special instructions</label><textarea id="si" rows="2" placeholder="Fragile items, stairs, etc."></textarea>
</div>
<div class="card" style="align-self:start;position:sticky;top:70px"><h2>Estimate</h2><div id="ebox"></div><div class="note">50% down payment is collected when the driver arrives at pickup. The balance is due after delivery.</div><div class="err" id="er2" style="margin:0 0 8px">${esc(msg.bk || '')}</div><button class="btn" style="width:100%" data-a="submitbk">Submit booking request</button></div></div>`;
}
window.upd = () => {
  const e = est(),
    b = $('#ebox');
  if (!b) return;
  b.innerHTML = `<div class="row"><span>${e.v.n} base</span><span>${peso(e.v.base)}</span></div><div class="row"><span>Distance ${e.km} km × ${peso(e.v.km)}</span><span>${peso(e.dist)}</span></div><div class="row"><span>Movers × ${e.mv}</span><span>${peso(e.mov)}</span></div><div class="row"><span>Service fee (5%)</span><span>${peso(e.fee)}</span></div><div class="row tot"><span>Estimated total</span><span class="pr">${peso(e.tot)}</span></div><div class="row mu"><span>Down payment (50%)</span><span>${peso(e.tot / 2)}</span></div>`;
};

function rent() {
  const mine = S.rn.slice().reverse();
  return `<h1>Self-drive rental</h1><p class="mu">Rent a vehicle without a driver. Valid license required.</p><div class="grid g2"><div class="card">
<div class="grid g3" style="gap:8px">${RV.map(v => `<div class="veh ${sel.rv == v.id ? 'on' : ''}" data-a="pickr" data-id="${v.id}"><div class="vi">${ico(VI[v.id], 26)}</div><b>${v.n}</b><div class="mu" style="font-size:12px">${v.sp}</div><div class="pr">${peso(v.day)}/day</div></div>`).join('')}</div>
<div class="grid g2" style="gap:8px"><div><label>Start date</label><input id="rs" type="date" min="${new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10)}"></div><div><label>End date</label><input id="re" type="date"></div></div>
<label>Pickup location</label><input id="rp"><label>Return location</label><input id="rr"><label>Driver’s license number</label><input id="rl"><label>License expiry</label><input id="rx" type="date">
<div class="note">License photo upload needs file storage (not connected). Number and expiry are validated.</div><div class="err" id="er">${esc(msg.rn || '')}</div><button class="btn" data-a="submitrn">Submit rental request</button></div>
<div class="card"><h2>Rental history</h2>${mine.length ? mine.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><b>${esc(r.vn)}</b> <span class="tag g">${r.st}</span><div class="mu" style="font-size:13px">${r.s} → ${r.e} (${r.days} days) · ${peso(r.tot)}<br>Balance: ${peso(r.tot)} · Ref ${r.id}</div></div>`).join('') : '<div class="empty">No rentals yet.</div>'}</div></div>`;
}

function bookings() {
  const q = (msg.q || '').toLowerCase(),
    f = msg.f || '';
  let l = S.bk
    .slice()
    .reverse()
    .filter(b => (!f || b.st == f) && (!q || (b.id + b.pu + b.dr).toLowerCase().includes(q)));
  return `<h1>My bookings</h1>${dlog()}<div class="grid g2" style="margin:10px 0"><input placeholder="Search by ref or address" value="${esc(msg.q || '')}" data-a="q"><select data-a="f"><option value="">All statuses</option>${[...FLOW, 'No driver found', 'Rejected', 'Cancelled'].map(s => `<option ${f == s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
 ${l.length ? l.map(bcard).join('') : '<div class="card empty">No bookings found.</div>'}`;
}
function track() {
  const act = S.bk
    .filter(b => !['Cancelled', 'Rejected'].includes(b.st))
    .reverse()
    .sort((a, b) => (a.st == 'Completed') - (b.st == 'Completed'));
  if (!act.length)
    return `<h1>Track</h1><div class='card empty'>No bookings to track yet.<div style='margin-top:12px'><button class='btn' data-a='nav' data-v='book'>Book a haul</button></div></div>`;
  const b = act.find(x => x.id == msg.tid) || act[0],
    i = FLOW.indexOf(b.st),
    live = i >= 1 && b.st != 'Completed',
    [dx, dy] = pos(tOf(b)),
    ini = (b.drv || 'D')
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    pd = k => ZPAY.sum(b.id, k),
    short = t => esc(String(t).split(',')[0]);
  const steps = [
      ['Requested', 'We received your request', 'Pending'],
      ['Accepted', 'A driver confirmed your trip', 'Accepted'],
      ['Driver on the way', 'Heading to your pickup', 'On the Way to Pickup'],
      ['Loading', 'Down payment and loading at pickup', 'Awaiting Down Payment'],
      ['In transit', 'Heading to the drop-off', 'In Transit'],
      ['Delivered', 'Delivery confirmed with your Delivery PIN', 'Delivery Confirmation'],
      ['Completed', 'Paid in full. Thank you!', 'Completed'],
    ].map(x => [x[0], x[1], FLOW.indexOf(x[2])]),
    last = steps.filter(s => i >= s[2]).length - 1;
  const bl = b.bd
    ? [
        ['Base fare', b.bd[0]],
        ['Distance charge (' + b.km + ' km)', b.bd[1]],
        ['Movers x ' + b.mv, b.bd[2]],
        ['Service fee (5%)', b.bd[3]],
      ]
    : [];
  const chip = (x, y, t, w) =>
    `<g transform='translate(${x} ${y})'><rect x='${-w / 2}' y='-7' width='${w}' height='12' rx='6' fill='#17171a' stroke='#3a3a42' stroke-width='.6'/><text y='1.6' text-anchor='middle' font-size='5.5' fill='#fff'>${t}</text></g>`;
  return `<div class='tk'><aside class='card tl2'><h2>Your trips</h2>${act.map(x => `<div class='bi ${x.id == b.id ? 'sel' : ''}' data-a='trk' data-id='${x.id}'><div class='av'>${ico('truck', 20)}</div><div style='flex:1;min-width:0'><b>${x.id}</b><div class='mu' style='font-size:13px'>${short(x.pu)} &rarr; ${short(x.dr)}</div><div class='bs'>${x.st}</div></div></div>`).join('')}</aside>
 <div><div class='mp'><svg viewBox='0 0 600 400' role='img' aria-label='Route map, illustrative'><rect width='600' height='400' fill='#1b1b1f'/><path d='M0 90C120 60 200 150 330 120S520 40 600 70V0H0z' fill='#222228'/><path d='M0 330C140 300 220 380 380 340S540 300 600 350V400H0z' fill='#222228'/><g fill='none' stroke='#2e2e35' stroke-width='12' stroke-linecap='round'><path d='M0 120H600M0 280H600M120 0V400M300 0V400M480 0V400'/></g><g fill='none' stroke='#3a3a42' stroke-width='1.5'><path d='M0 200H600M210 0V400M390 0V400M0 40H600M0 350H600'/></g>
 <g transform='scale(2)'><polyline points='${WP.map(p => p.join(',')).join(' ')}' style='fill:none;stroke:#8b5cf6;stroke-width:2;stroke-dasharray:3 4;stroke-linecap:round'/><circle cx='85' cy='125' r='5' fill='#fff'/><circle cx='85' cy='125' r='2' fill='#0d0d0f'/>${chip(85, 111, 'Pickup', 34)}<circle cx='270' cy='35' r='5' fill='#8b5cf6' stroke='#fff' stroke-width='1.5'/>${chip(268, 50, 'Drop-off', 40)}
 ${live ? `<g id='drv' data-id='${b.id}' style='transform:translate(${dx}px,${dy}px);transition:transform 1.4s linear'><circle r='9' fill='#8b5cf6' opacity='.3'><animate attributeName='r' values='6;11;6' dur='1.8s' repeatCount='indefinite'/></circle><circle r='4.5' fill='#fff' stroke='#8b5cf6' stroke-width='2'/>${chip(0, -13, 'Driver', 30)}</g>` : ''}</g></svg><div class='mchip'>${b.id} &middot; ${b.st}</div></div>
 <div class='mu' style='font-size:13px;margin:8px 4px'>${live ? 'Last updated: <span id="lu">' + new Date().toLocaleTimeString() + '</span>' : b.st == 'Completed' ? 'Trip ended' : 'Tracking opens when a driver accepts'} &middot; ETA needs a routing service</div>
 <div class='note'>Live GPS is <b>not connected</b> yet: the map and driver position shown are placeholders, not real data. Real tracking needs a driver app sending GPS, a backend and a map service.</div>
 <div class='grid g2' style='margin-top:14px'><div class='card'><div class='row'><b>${b.id}</b><span class='tag g'>${b.st}</span></div><div class='row'><span class='mu'>Pickup</span><b style='text-align:right'>${esc(b.pu)}</b></div><div class='row'><span class='mu'>Drop-off</span><b style='text-align:right'>${esc(b.dr)}</b></div><div class='row'><span class='mu'>Schedule</span><span>${b.dt} ${b.tm}</span></div><div class='row tot'><span>Total</span><span class='pr'>${peso(b.tot)}</span></div>
 <div style='margin-top:10px'>${steps.map((s, j) => `<div class='tl'><span class='dot ${j < last ? 'd' : j == last ? 'c' : ''}'></span><div><b>${s[0]}</b><div class='mu' style='font-size:12px'>${s[1]}</div></div></div>`).join('')}</div></div>
 <div>${b.drv ? `<div class='card'><div style='display:flex;align-items:center;gap:12px'><div class='av'>${ini}</div><div style='flex:1'><b>${esc(b.drv)}</b> <span class='tag g'>Sample</span><div class='mu' style='font-size:13px'>4.9 rating (sample)<br>${b.vn} &middot; Plate ABC 1234 (sample)</div></div></div><div style='display:flex;gap:8px;margin-top:12px'><button class='btn o' style='flex:1' data-a='soon'>Call</button><button class='btn' style='flex:1' data-a='soon'>Chat</button></div></div>` : `<div class='card'><b>Waiting for a driver</b><div class='mu'>Driver details and live tracking appear once a provider accepts your booking.</div></div>`}
 <details class='card' style='margin-top:14px'><summary style='cursor:pointer;font-weight:700'>Fare breakdown and payment</summary><div style='margin-top:8px'>${bl.map(x => `<div class='row'><span class='mu'>${x[0]}</span><span>${peso(x[1])}</span></div>`).join('')}<div class='row tot'><span>Estimated total</span><span>${peso(b.tot)}</span></div><div class='row'><span class='mu'>Down payment (50%)</span><span>${peso(pd('down'))} / ${peso(ZPAY.due(b, 'down'))}</span></div><div class='row'><span class='mu'>Final balance (50%)</span><span>${peso(pd('final'))} / ${peso(ZPAY.due(b, 'final'))}</span></div></div></details>
 <div style='display:flex;gap:8px;flex-wrap:wrap;margin-top:14px'><button class='btn o' data-a='nav' data-v='reports'>Report issue</button><button class='btn' data-a='share' data-id='${b.id}'>Share trip</button>${CANCEL_OK.includes(b.st) ? `<button class='btn d' data-a='cancel' data-id='${b.id}'>Cancel</button>` : ''}${b.st == 'Awaiting Down Payment' || b.st == 'Awaiting Final Payment' ? `<button class='btn o' data-a='nav' data-v='bookings'>Go to payment</button>` : ''}</div>
 <div class='mu' id='tm' style='font-size:13px;margin-top:8px'></div>${msg['b' + b.id] ? `<div class='err'>${esc(msg['b' + b.id])}</div>` : ''}</div></div></div></div>`;
}
function dlog() {
  if (!msg.dl) return '';
  return (
    '<div class="card" style="margin:10px 0"><h2>Flow simulation ' +
    (msg.run ? '<span class="tag g">running…</span>' : '<span class="tag">finished</span>') +
    '</h2>' +
    msg.dl
      .map(
        x =>
          '<div class="row" style="border-bottom:1px solid var(--bd)"><b>' +
          x[0] +
          '</b><span class="mu" style="text-align:right">' +
          x[1] +
          '</span></div>'
      )
      .join('') +
    '</div>'
  );
}
function bcard(b) {
  const i = FLOW.indexOf(b.st),
    paid = S.pay.filter(p => p.bid == b.id),
    pd = k => ZPAY.sum(b.id, k),
    rv = S.rev.find(r => r.bid == b.id);
  const dpm = b.st == 'Awaiting Down Payment',
    fpm = b.st == 'Awaiting Final Payment';
  return `<div class="card" style="margin-bottom:14px"><div class="row"><div><b>${b.id}</b> <span class="tag ${b.st == 'Cancelled' || b.st == 'Rejected' ? 'r' : 'g'}">${b.st}</span></div><b class="pr">${peso(b.tot)}</b></div>
 <div class="mu">${esc(b.pu)} → ${esc(b.dr)}<br>${b.vn} · ${b.dt} ${b.tm} · ${b.mv} mover${b.mv == 1 ? '' : 's'} · Driver: ${b.drv ? esc(b.drv) + ' (★4.8)' : 'not assigned yet'}</div>
 ${i >= 0 ? `<div class="steps">${FLOW.map((s, j) => `<span class="st ${j <= i ? 'd' : ''}">${s}</span>`).join('')}</div>` : ''}
 <div class="row mu"><span>Down: ${peso(pd('down'))} / ${peso(ZPAY.due(b, 'down'))}</span><span>Final: ${peso(pd('final'))} / ${peso(ZPAY.due(b, 'final'))}</span></div>
 ${b.st == 'No driver found' ? `<div class="note">No driver accepted this booking in time. Re-submit it to try again, or cancel it at no charge.</div>` : ''}${TRK.includes(b.st) ? `<div class="note">Tracking is open. Tap Track to see the trip map and driver details.</div>` : ''}
 ${paid.length ? `<div style="font-size:13px">${paid.map(p => `<div class="row"><span>${p.ref} · ${p.kind} · ${p.method}</span><span>${peso(p.amount)} <span class="tag">${p.status}</span></span></div>`).join('')}</div>` : ''}
 ${dpm || fpm ? payform(b, dpm ? 'down' : 'final') : ''}
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
 ${i >= 1 && b.st != 'Completed' ? `<button class="btn sm" data-a="trk" data-id="${b.id}">${ico('pin', 15)} Track</button>` : ''}
 ${b.st == 'No driver found' ? `<button class="btn sm" data-a="resub" data-id="${esc(b.id)}">Re-submit</button>` : ''}${CANCEL_OK.includes(b.st) ? `<button class="btn d sm" data-a="cancel" data-id="${b.id}">Cancel booking${cancelFee(b) ? ' (' + peso(cancelFee(b)) + ' fee)' : ''}</button>` : ''}
 
 </div>
 ${b.st == 'Completed' ? (rv ? `<div class="note">Your review: ${'★'.repeat(rv.r)} ${esc(rv.t)}</div>` : `<div style="margin-top:10px"><b>Rate driver</b><div class="stars" id="s${b.id}">${[1, 2, 3, 4, 5].map(n => `<button data-a="star" data-id="${b.id}" data-n="${n}">☆</button>`).join('')}</div><input id="rt${b.id}" placeholder="Write a review"><div class="err">${esc(msg['r' + b.id] || '')}</div><button class="btn sm" style="margin-top:6px" data-a="review" data-id="${b.id}">Submit review</button></div>`) : ''}
 ${msg['b' + b.id] ? `<div class="err">${esc(msg['b' + b.id])}</div>` : ''}</div>`;
}
function payform(b, k) {
  const need = ZPAY.due(b, k),
    left = ZPAY.r2(need - ZPAY.sum(b.id, k)),
    sub = S.pay.find(p => p.bid == b.id && p.kind == k && p.status == 'Submitted');
  if (left <= 0.005) return '';
  return `<div class="note" style="margin-top:10px"><b>${k == 'down' ? '50% down payment' : 'Remaining balance'}: ${peso(left)}</b>
 <div class="mu" style="font-size:12px;margin:4px 0 8px">${k == 'down' ? 'Collected when the driver arrives at pickup.' : 'Collected after delivery.'} Pay the driver in cash, or send it by GCash and submit the reference here so the driver can confirm it. Nothing counts as paid until the driver confirms it.</div>
 ${
   sub
     ? `<div>GCash reference <b>${esc(sub.ref)}</b> for ${peso(sub.amount)} submitted. Waiting for the driver to confirm it.</div>`
     : `<div class="grid g3" style="gap:8px"><div><label>GCash amount</label><input id="pg${b.id}" type="number" min="0" step="0.01" value="${left}"></div><div><label>GCash reference no.</label><input id="pr${b.id}" inputmode="numeric" placeholder="10–13 digits"></div></div>
 <button class="btn sm" style="margin-top:8px" data-a="pay" data-id="${b.id}" data-k="${k}">Submit GCash proof</button>`
 }</div>`;
}

function reports() {
  const mine = S.inc.slice().reverse();
  return `<h1>Report an incident</h1><div class="grid g2"><div class="card">
<label>Related booking</label><select id="ib">${
    S.bk
      .filter(b => FLOW.indexOf(b.st) >= FLOW.indexOf('On the Way to Pickup'))
      .map(b => `<option ${msg.ib == b.id ? 'selected' : ''}>${esc(b.id)}</option>`)
      .join('') || '<option value="">No active booking</option>'
  }</select>
<label for="ic">Category</label><select id="ic"><option value="">Choose a category</option><option>Vehicle accident</option><option>Damaged items</option><option>Missing items</option><option>Driver conduct</option><option>Delay</option><option>Other</option></select>
<label>When did it happen?</label><input id="iw" type="datetime-local"><label>Description</label><textarea id="id" rows="4"></textarea><div class="mu" style="font-size:12px">Photo evidence upload requires file storage (not connected).</div>
<div class="err" id="er">${esc(msg.inc || '')}</div><button class="btn" data-a="submitinc">Submit report</button></div>
<div class="card"><h2>Your reports</h2>${mine.length ? mine.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><b>${r.cat}</b> <span class="tag">${r.st}</span><div class="mu" style="font-size:13px">${r.bid} · ${esc(r.d)}<br>Admin notified: simulated (no notification service).</div></div>`).join('') : '<div class="empty">No reports.</div>'}</div></div>`;
}

const val = id => ($('#' + id)?.value || '').trim(),
  rid = p => p + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]');
  if (!t || t.tagName == 'INPUT' || t.tagName == 'SELECT') return;
  e.preventDefault();
  const a = t.dataset.a,
    id = t.dataset.id;
  /* these change data, so they are server actions handled in 02-upgrade.js; the old browser-side versions below never run */
  if (
    [
      'signup',
      'login',
      'submitbk',
      'submitrn',
      'pay',
      'review',
      'cancel',
      'adv',
      'rej',
      'submitinc',
      'demo',
      'saveprof',
      'resetdo',
    ].includes(a)
  )
    return;
  if (a == 'nav') return go(t.dataset.v);
  if (a == 'sg') {
    $('#' + t.dataset.f).value = t.dataset.v;
    $('#s-' + t.dataset.f).hidden = true;
    return;
  }
  if (a == 'loc') {
    const tf = t.dataset.f || 'pu',
      mid = t.dataset.m || 'lm',
      M = () => $('#' + mid) || {};
    if (!navigator.geolocation) {
      M().textContent = 'Location is not supported by this browser. Type the address instead.';
      return;
    }
    if (window.isSecureContext === false) {
      M().textContent =
        'Location only works on https:// or localhost, not when the file is opened directly. Host the page (or run a local server) or type the address.';
      return;
    }
    M().textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(
      p => {
        const la = p.coords.latitude,
          lo = p.coords.longitude;
        if (!zcBox(la, lo)) {
          M().textContent =
            'Your detected location (' +
            la.toFixed(3) +
            ', ' +
            lo.toFixed(3) +
            ') is outside the Zamboanga City service area. Choose a place from the suggestions instead.';
          return;
        }
        let n = null,
          dm = 1e9;
        PL.forEach(x => {
          const d = (x[1] - la) ** 2 + (x[2] - lo) ** 2;
          if (d < dm) {
            dm = d;
            n = x;
          }
        });
        const near = n && dm < 0.05 ? 'Near ' + n[0] + ' · ' : '';
        const f = $('#' + tf);
        if (f) f.value = near + 'Current location (' + la.toFixed(5) + ', ' + lo.toFixed(5) + ')';
        if (typeof autoKm == 'function') autoKm();
        if (window.mapUpd) mapUpd();
        M().textContent = 'Location filled in. Add your street or landmark so the driver can find you.';
      },
      er => {
        M().textContent =
          er.code == 1
            ? 'Location permission was denied. Allow it in your browser settings or type the address.'
            : er.code == 3
              ? 'Locating timed out. Try again or type the address.'
              : 'Could not get your location. Please type the address.';
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
    return;
  }
  if (a == 'swap') {
    msg = { mode: t.dataset.m };
    return render();
  }
  if (a == 'mode') {
    S.mode = t.dataset.m;
    save();
    applyMode();
    return render();
  }
  if (a == 'saveprof') {
    const n = val('sn'),
      ph = val('sp'),
      ad = val('sa');
    let er = '';
    if (n.length < 3) er = 'Enter your full name.';
    else if (!/^(09|\+639)\d{9}$/.test(ph)) er = 'Enter a valid PH mobile number.';
    else if (ad.length < 8) er = 'Enter your complete address.';
    if (er) {
      $('#sme').textContent = er;
      return;
    }
    const u = S.users.find(x => x.em == S.me.em);
    if (u) {
      u.name = n;
      u.ph = ph;
      u.ad = ad;
    }
    S.me.name = n;
    save();
    audit('profile updated');
    msg.sok = 'Profile saved.';
    return render();
  }
  if (a == 'quick') {
    const p = val('qp'),
      d = val('qd'),
      dt = val('qdt'),
      v = val('qv');
    if (v) sel.v = v;
    go('book');
    $('#pu').value = p;
    $('#dr').value = d;
    if (dt) $('#dt').value = dt;
    upd();
    return;
  }
  if (a == 'route') {
    const r = RT[+id];
    sel.v = r[0];
    go('book');
    $('#pu').value = r[1] + ', Zamboanga City';
    $('#dr').value = r[2] + ', Zamboanga City';
    $('#km').value = r[3];
    upd();
    return;
  }
  if (a == 'chip') {
    $('#qd').value = t.dataset.v;
    return;
  }
  if (a == 'pickgo') {
    sel.v = id;
    go('book');
    return;
  }
  if (a == 'trk') {
    msg.tid = id;
    return go('track');
  }
  if (a == 'soon') {
    $('#tm').textContent = 'Calling and chat need a telephony/chat service, which is not connected yet.';
    return;
  }
  if (a == 'share') {
    const q = S.bk.find(x => x.id == id),
      tx = 'Tracking my ZamMove trip ' + q.id + ': ' + q.pu + ' → ' + q.dr + ' (' + q.st + ')';
    try {
      if (navigator.share) await navigator.share({ text: tx });
      else {
        await navigator.clipboard.writeText(tx);
        $('#tm').textContent = 'Trip summary copied. A live tracking link for friends needs a backend.';
      }
    } catch (x) {
      $('#tm').textContent = 'Sharing is not available in this browser.';
    }
    return;
  }
  if (a == 'out') {
    ZAPI.logout();
    S.me = null;
    S.ws = 'customer';
    msg = {};
    save();
    return render();
  }
  if (a == 'demo') {
    if (msg.run) return;
    msg.run = true;
    msg.dl = [];
    const sl = ms => new Promise(r => setTimeout(r, ms)),
      L = (x, y) => {
        msg.dl.push([x, y]);
        render();
      },
      v = HV[1],
      sub = v.base + 12 * v.km + 2 * 500,
      tot = sub + Math.round(sub * 0.05),
      h = tot / 2,
      g = Math.round(tot / 4);
    const b = {
      id: rid('BK'),
      pu: 'Tetuan, Zamboanga City',
      dr: 'Sta. Maria, Zamboanga City',
      dt: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
      tm: '09:00',
      it: 'Sofa, bed frame, 10 boxes',
      vid: v.id,
      vn: v.n,
      mv: 2,
      tot,
      km: 12,
      bd: [v.base, 12 * v.km, 1000, tot - sub],
      st: 'Pending',
      drv: '',
    };
    S.bk.push(b);
    view = 'bookings';
    location.hash = 'bookings';
    L('1. Customer submits request', 'Estimate ' + peso(tot) + ' · status Pending');
    await sl(1500);
    b.st = 'Accepted';
    b.drv = 'Juan D. (demo)';
    L('2. Provider accepts, driver assigned', 'Accepted · tracking not open yet');
    await sl(1500);
    b.st = 'On the Way to Pickup';
    L('3. Driver heads to pickup', 'Tracking window open (live map not connected)');
    await sl(1500);
    b.st = 'Awaiting Down Payment';
    L('4. Driver arrives at pickup', 'Down payment due: ' + peso(h));
    await sl(1500);
    S.pay.push(
      {
        bid: b.id,
        kind: 'down',
        method: 'GCash',
        amount: g,
        ref: 'DEMO' + rid('G'),
        status: 'Demo (simulated)',
      },
      { bid: b.id, kind: 'down', method: 'Cash', amount: h - g, ref: rid('CSH'), status: 'Demo (simulated)' }
    );
    b.st = 'Down Payment Confirmed';
    L(
      '4. Hybrid down payment recorded',
      'GCash ' + peso(g) + ' + Cash ' + peso(h - g) + ' · simulated, no gateway'
    );
    await sl(1500);
    for (const s of ['Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation']) {
      if (s == 'In Transit') {
        const r = await ZMVER.api.sim(b.id);
        L(
          '5. Pre-departure verification',
          r.ok
            ? 'Start PIN, vehicle plate, cargo checklist and both confirmations completed (simulated parties, real checks)'
            : 'Stopped: ' + r.err
        );
        if (!r.ok) {
          msg.run = false;
          render();
          return;
        }
      } else b.st = s;
      L('5. ' + s, TRK.includes(s) ? 'Tracking window open (live map not connected)' : '');
      await sl(1200);
    }
    b.st = 'Awaiting Final Payment';
    L('6. Delivery confirmed', 'Balance due: ' + peso(h));
    await sl(1500);
    S.pay.push({
      bid: b.id,
      kind: 'final',
      method: 'Cash',
      amount: h,
      ref: rid('CSH'),
      status: 'Demo (simulated)',
    });
    b.st = 'Completed';
    L('7. Final payment recorded, booking completed', 'You can now rate the driver below');
    audit('demo flow ' + b.id);
    msg.run = false;
    render();
    return;
  }
  if (a == 'pick') {
    sel.v = id;
    document.querySelectorAll('[data-a=pick]').forEach(x => x.classList.toggle('on', x.dataset.id == id));
    upd();
    return;
  }
  if (a == 'pickr') {
    sel.rv = id;
    document.querySelectorAll('[data-a=pickr]').forEach(x => x.classList.toggle('on', x.dataset.id == id));
    return;
  }
  if (a == 'signup') {
    const u = {
      name: val('fn'),
      dob: val('db'),
      ph: val('ph'),
      ad: val('ad'),
      em: val('em').toLowerCase(),
      pw: val('pw'),
    };
    let er = '';
    if (u.name.length < 3) er = 'Enter your full name.';
    else if (!u.dob || age(u.dob) < 18) er = 'You must be 18 or older.';
    else if (!/^(09|\+639)\d{9}$/.test(u.ph)) er = 'Enter a valid PH mobile number.';
    else if (u.ad.length < 8) er = 'Enter your complete address.';
    else if (!/^\S+@\S+\.\S+$/.test(u.em)) er = 'Enter a valid email.';
    else if (u.pw.length < 8 || !/\d/.test(u.pw) || !/[a-z]/i.test(u.pw))
      er = 'Password needs 8+ characters with letters and a number.';
    else if (u.pw !== val('pw2')) er = 'Passwords do not match.';
    else if (S.users.some(x => x.em == u.em)) er = 'Email already registered.';
    if (er) {
      msg.auth = er;
      $('#er').textContent = er;
      return;
    }
    const n = { ...u, pw: await hash(u.pw) };
    S.users.push(n);
    S.me = { name: n.name, em: n.em };
    audit('signup ' + n.em);
    msg = {};
    view = 'home';
    return render();
  }
  if (a == 'login') {
    const em = val('em').toLowerCase(),
      h = await hash(val('pw')),
      u = S.users.find(x => x.em == em && x.pw == h);
    if (!u) {
      msg.auth = 'Invalid email or password.';
      return render();
    }
    S.me = { name: u.name, em: u.em };
    audit('login ' + em);
    msg = {};
    return render();
  }
  if (a == 'submitbk') {
    const e = est(),
      d = { pu: val('pu'), dr: val('dr'), dt: val('dt'), tm: val('tm'), it: val('it') };
    let er = '';
    if (d.pu.length < 5 || d.dr.length < 5) er = 'Pickup and drop-off addresses are required.';
    else if (!inZC(d.pu))
      er =
        'Pickup address must be within Zamboanga City. Choose a suggestion or add Zamboanga City to the address.';
    else if (!inZC(d.dr))
      er =
        'Drop-off address must be within Zamboanga City. Choose a suggestion or add Zamboanga City to the address.';
    else if (
      String(d.pu || '')
        .trim()
        .toLowerCase() ==
      String(d.dr || '')
        .trim()
        .toLowerCase()
    )
      er = 'Pickup and drop-off must be different places.';
    else if (e.km < 1) er = 'Enter the distance in km.';
    else if (!d.dt || !d.tm) er = 'Choose a pickup date and time.';
    else if (new Date(d.dt + 'T' + d.tm) < new Date()) er = 'Schedule must be in the future.';
    else if (d.it.length < 3) er = 'Describe the items to transport.';
    if (er) {
      msg.bk = er;
      const x = $('#er2');
      x.textContent = er;
      x.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    S.bk.push({
      id: rid('BK'),
      cu: (S.me && S.me.em) || '',
      ...d,
      vid: e.v.id,
      vn: e.v.n,
      mv: e.mv,
      tot: e.tot,
      km: e.km,
      bd: [e.v.base, e.dist, e.mov, e.fee],
      st: 'Pending',
      drv: '',
    });
    msg = {};
    audit('booking created');
    view = 'bookings';
    location.hash = 'bookings';
    return render();
  }
  if (a == 'submitrn') {
    const v = RV.find(x => x.id == sel.rv),
      s = val('rs'),
      e2 = val('re'),
      l = val('rl'),
      x = val('rx');
    let er = '';
    if (!v) er = 'Select a vehicle.';
    else if (!s || !e2 || e2 < s) er = 'Choose valid start and end dates.';
    else if (val('rp').length < 4 || val('rr').length < 4) er = 'Enter pickup and return locations.';
    else if (l.length < 6) er = 'Enter your license number.';
    else if (!x || x < e2) er = 'Your license must be valid through the rental period.';
    else if (
      S.rn.some(r => r.vid == v.id && !['Cancelled', 'Rejected'].includes(r.st) && s <= r.e && e2 >= r.s)
    )
      er = 'Vehicle unavailable for those dates (overlap).';
    if (er) {
      msg.rn = er;
      $('#er').textContent = er;
      return;
    }
    const days = Math.round((new Date(e2) - new Date(s)) / 864e5) + 1;
    S.rn.push({ id: rid('RN'), vid: v.id, vn: v.n, s, e: e2, days, tot: days * v.day, st: 'Pending' });
    msg = {};
    audit('rental requested');
    return render();
  }
  const b = S.bk.find(x => x.id == id);
  if (a == 'cancel') {
    if (
      !['Pending', 'Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'].includes(b.st) ||
      (b.cu && S.me && b.cu != S.me.em)
    ) {
      toast('This booking can no longer be cancelled here. Report an incident or contact support.');
      return render();
    }
    b.st = 'Cancelled';
    audit('cancel ' + id);
    return render();
  }
  if (a == 'rej') {
    b.st = 'Rejected';
    return render();
  }
  if (a == 'adv') {
    const i = FLOW.indexOf(b.st),
      n = FLOW[i + 1];
    msg['b' + id] = '';
    if (!n || b.st == 'Pending') {
      msg['b' + id] =
        'Blocked: only an approved driver with an active vehicle assignment can accept a booking, and finished bookings cannot advance.';
      return render();
    }
    if (b.st == 'Awaiting Down Payment' && ZPAY.sum(id, 'down') < ZPAY.due(b, 'down') - 0.005)
      msg['b' + id] = 'Blocked: the 50% down payment has not been recorded.';
    else if (b.st == 'Awaiting Final Payment' && ZPAY.sum(id, 'final') < ZPAY.due(b, 'final') - 0.005)
      msg['b' + id] = 'Blocked: the final balance has not been recorded.';
    else {
      b.st = n;
      audit(id + ' → ' + n);
    }
    return render();
  }
  if (a == 'pay') {
    const k = t.dataset.k,
      r = val('pr' + id),
      g = ZPAY.r2(val('pg' + id));
    msg['b' + id] = '';
    const left = b ? ZPAY.r2(ZPAY.due(b, k) - ZPAY.sum(id, k)) : 0;
    if (!b || (b.cu && S.me && b.cu != S.me.em))
      msg['b' + id] = 'Only the customer who made this booking can submit a payment.';
    else if (b.st != (k == 'down' ? 'Awaiting Down Payment' : 'Awaiting Final Payment'))
      msg['b' + id] = 'This payment is not due yet.';
    else if (!(g > 0) || g > left + 0.005)
      msg['b' + id] = 'Enter a GCash amount from ₱0.01 to ' + peso(left) + '.';
    else if (!/^\d{10,13}$/.test(r)) msg['b' + id] = 'Enter the GCash reference number (10–13 digits).';
    else if (S.pay.some(p => p.ref == r && p.status != 'Rejected'))
      msg['b' + id] = 'This GCash reference was already submitted.';
    else if (S.pay.some(p => p.bid == id && p.kind == k && p.status == 'Submitted'))
      msg['b' + id] =
        'You already submitted a GCash proof for this payment. Wait for the driver to confirm it.';
    else {
      S.pay.push(
        ZPAY.mk({
          bid: id,
          kind: k,
          method: 'GCash',
          amount: g,
          ref: r,
          payer: (S.me && S.me.em) || '',
          status: 'Submitted',
        })
      );
      audit('gcash proof ' + id);
    }
    return render();
  }
  if (a == 'star') {
    const n = +t.dataset.n;
    msg['n' + id] = n;
    [...t.parentNode.children].forEach((x, i) => (x.textContent = i < n ? '★' : '☆'));
    return;
  }
  if (a == 'review') {
    const n = msg['n' + id];
    if (!n) {
      msg['r' + id] = 'Choose a star rating.';
      return render();
    }
    if (!b || b.st != 'Completed' || (b.cu && b.cu != S.me.em)) return;
    if (S.rev.some(r => r.bid == id)) return;
    S.rev.push({ bid: id, by: S.me.em, r: n, t: val('rt' + id) || 'No comment' });
    audit('review ' + id);
    return render();
  }
  if (a == 'submitinc') {
    const d = { bid: val('ib'), cat: val('ic'), w: val('iw'), d: val('id') };
    if (!d.bid) msg.inc = 'Reports must be linked to a booking in progress.';
    else if (!d.w) msg.inc = 'Enter the date and time.';
    else if (d.d.length < 10) msg.inc = 'Describe what happened (10+ characters).';
    else {
      S.inc.push({ ...d, st: 'Submitted' });
      msg.inc = '';
      audit('incident ' + d.bid);
    }
    return render();
  }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.ac')) document.querySelectorAll('.sug').forEach(s => (s.hidden = true));
});
document.addEventListener('input', e => {
  const a = e.target.dataset.a;
  if (a == 'ac') {
    const q = e.target.value.trim().toLowerCase(),
      b = $('#s-' + e.target.id);
    if (!q) {
      b.hidden = true;
      return;
    }
    const r = PL.filter(x => x[0].toLowerCase().includes(q))
      .sort((x, y) => y[0].toLowerCase().startsWith(q) - x[0].toLowerCase().startsWith(q))
      .slice(0, 6);
    b.innerHTML = r.length
      ? r
          .map(
            x =>
              '<div data-a="sg" data-f="' +
              e.target.id +
              '" data-v="' +
              esc(x[0]) +
              '">' +
              esc(x[0]) +
              '</div>'
          )
          .join('')
      : '<div class="mu">No match in Zamboanga City. Try a barangay or landmark.</div>';
    b.hidden = false;
    return;
  }
  if (a == 'q') {
    msg.q = e.target.value;
    const p = e.target.selectionStart;
    render();
    const i = document.querySelector('[data-a=q]');
    i.focus();
    i.setSelectionRange(p, p);
  }
});
document.addEventListener('change', e => {
  const a = e.target.dataset.a;
  if (a == 'f') {
    msg.f = e.target.value;
    render();
  }
  if (a == 'tsel') {
    msg.tid = e.target.value;
    render();
  }
});
setInterval(() => {
  const m = $('#drv');
  if (!m || view != 'track') return;
  const b = S.bk.find(x => x.id == m.dataset.id),
    r = b && RNG[b.st];
  if (!r) return;
  const k = b.id + b.st;
  msg.tp = msg.tp || {};
  msg.tp[k] = Math.min(1, (msg.tp[k] || 0) + 0.05);
  const p = pos(r[0] + (r[1] - r[0]) * msg.tp[k]);
  m.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px)';
  const lu = $('#lu');
  if (lu) lu.textContent = new Date().toLocaleTimeString();
}, 1500);
applyMode();
if (!VIEWS.includes(view)) view = 'home';
render();
