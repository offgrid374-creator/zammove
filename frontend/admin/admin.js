'use strict';
/* ZamMove Admin panel. Every change is a server action (backend/src/domain); S is this staff member's view
   from the server. Styled with the customer app's design system (../customer/css), so both look alike. */
const SK = 'zm_admin_me';
const $ = s => document.querySelector(s),
  esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
let S = {},
  me = ZAPI.token() ? sessionStorage.getItem(SK) : null,
  page = 'dash',
  sub = {}, // chosen sub-page per section
  sel = null, // user shown on the Users page
  pre = {}, // values to pre-fill (e.g. the vehicle chosen from the Vehicles page)
  uq = '',
  uf = 'all',
  aq = 'open',
  flash = null,
  lmsg = '';
const load = () => {
  ['users', 'apps', 'vh', 'asg', 'bk', 'pay', 'rem', 'inc', 'au', 'rn'].forEach(k => (S[k] = S[k] || []));
  S.cfg = S.cfg || {};
  S.dp = S.dp || {};
  S.fleet = S.fleet || {};
};
ZAPI.onState = v => {
  S = v;
  load();
};
ZAPI.onLogout = m => {
  me = null;
  S = {};
  sessionStorage.removeItem(SK);
  lmsg = m;
  render();
};

/* ---------- helpers ---------- */
const PAYOK = ['Recorded by driver', 'Verified'],
  counted = p => !!p && PAYOK.includes(p.status),
  r2 = x => Math.round((+x || 0) * 100) / 100;
const U = em => S.users.find(u => u.em == em),
  nm = em => (U(em) || {}).name || em || '—',
  cu = () => me && U(me),
  lv = () => (cu() || {}).adm || '',
  isC = () => !!(cu() || {}).cash,
  full = () => ['super', 'admin'].includes(lv());
const okr = (u, t) => !!u && (u.roles || []).some(r => r.t == t && r.st == 'approved');
const peso = n =>
    '₱' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ts = t =>
    String(t || '')
      .slice(0, 16)
      .replace('T', ' '),
  day = t => String(t || '').slice(0, 10) || '—',
  today = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const ini = n =>
  String(n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0].toUpperCase())
    .join('');
const vOf = id => S.vh.find(v => v.id == id),
  vName = v => (v ? `${v.brand || ''} ${v.model || ''}`.trim() : '—'),
  vLabel = v => (v ? `${vName(v)} · ${v.plate || ''}` : '—'),
  types = () => [...(S.fleet.HV || []), ...(S.fleet.RT || [])],
  typeN = id => (types().find(x => x.id == id) || {}).n || id || '',
  rentOnly = v => (S.fleet.RT || []).some(x => x.id == v.type),
  activeAsg = vid => S.asg.find(a => a.vehicle == vid && a.st == 'Active'),
  asgOfDrv = em => S.asg.find(a => a.driver == em && a.st == 'Active'),
  drivers = () => S.users.filter(u => okr(u, 'driver') && u.status != 'suspended'),
  haulers = () => S.vh.filter(v => v.approval == 'Approved' && !rentOnly(v));
const GOOD = /^(Approved|approved|Verified|Resolved|Completed|Active|Closed|Recorded by driver|Available|Returned)$/,
  BAD = /Reject|rejected|Discrepancy|Cancel|suspended|revoked|Expired|Declined|Ended/,
  WAIT = /Pending|pending|Submitted|Awaiting|Under|Open|Waiting|Interview|Orientation|Requested/;
const tag = s => `<span class="tag ${GOOD.test(s) ? 'g' : BAD.test(s) ? 'r' : WAIT.test(s) ? 'w' : ''}">${esc(s)}</span>`;
const tbl = (h, r, empty = 'Nothing here yet.') =>
  r.length
    ? `<div class="ad-tw"><table class="wss"><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${r.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`
    : `<div class="empty">${empty}</div>`;
const btn = (a, l, at = '', c = '') => `<button class="btn sm ${c}" data-a="${a}" ${at}>${l}</button>`,
  inp = (id, ph, t = 'text', v = '') =>
    `<input id="f-${id}" type="${t}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" value="${esc(v)}">`,
  val = id => ((document.getElementById('f-' + id) || {}).value || '').trim();
const card = (title, body, x = '') =>
  `<section class="card" ${x}>${title ? `<h2>${title}</h2>` : ''}${body}</section>`;
const tile = (l, v, go) =>
  `<div class="tile" ${go ? `data-a="go" data-p="${go}" role="button" tabindex="0" style="cursor:pointer"` : ''}><span>${l}</span><b>${v}</b></div>`;
const userLink = em =>
  U(em) ? `<button class="ad-link" data-a="user" data-e="${esc(em)}">${esc(nm(em))}</button>` : esc(em || '—');
const roleTags = u =>
  `<span class="ad-tags">${[
    ...(u.adm ? [u.adm == 'super' ? 'Owner admin' : u.adm == 'admin' ? 'Administrator' : 'Secondary admin'] : []),
    ...(u.cash ? ['Cashier'] : []),
  ]
    .map(x => `<span class="tag g">${x}</span>`)
    .join('')}${(u.roles || [])
    .map(r => `<span class="tag ${r.st == 'approved' ? 'g' : r.st == 'pending' ? 'w' : 'r'}">${r.t == 'owner' ? 'Owner' : 'Driver'}${r.st == 'approved' ? '' : ' · ' + esc(r.st)}</span>`)
    .join('')}${!u.adm && !u.cash && !(u.roles || []).length ? '<span class="tag">Customer</span>' : ''}${u.status == 'suspended' ? '<span class="tag r">Suspended</span>' : ''}</span>`;
const expired = d => !!d && d < today();
const dateCell = d => (d ? (expired(d) ? `<span class="ad-bad">${esc(d)} (expired)</span>` : esc(d)) : '—');
/* franchise (hauling) and insurance: short status for tables, full lines for approval cards */
const legalShort = v => {
  const L = v.legal || {},
    one = (n, d) => (!d ? `<span class="ad-bad">${n} missing</span>` : expired(d) ? `<span class="ad-bad">${n} expired</span>` : `${n} ✓`);
  return [one('CTPL', L.insExp), ...(rentOnly(v) ? [] : [one('CPC', L.cpcExp)])].join(' · ');
};
const legalLines = v => {
  const L = v.legal || {};
  return `<dl class="ad-kv" style="margin-top:10px"><dt>CTPL insurance</dt><dd>${L.ins ? esc(L.ins) + ' · until ' + dateCell(L.insExp) : '<span class="ad-bad">missing</span>'}</dd>${rentOnly(v) ? '' : `<dt>LTFRB franchise (CPC)</dt><dd>${L.cpc ? esc(L.cpc) + ' · until ' + dateCell(L.cpcExp) : '<span class="ad-bad">missing</span>'}</dd>`}</dl>`;
};

/* ---------- actions ---------- */
const RQ = (n, p) => ZAPI.act(n, p);

/* ---------- navigation ---------- */
const IC = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5',
  car: 'M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5h-3M6 18H3v-5h18M7 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0M13 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 10v.01M18 14v.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
const ic = k =>
  `<span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k]}"/></svg></span>`;
/* [id, label, icon, who may see it, sub-pages [id, label, who]] ; who: a = any staff, f = full admin, s = admin or secondary, c = admin or cashier, S = owner admin */
const SECTIONS = [
  ['dash', 'Overview', 'home', 'a'],
  ['users', 'Users', 'users', 'f'],
  ['apps', 'Applications', 'doc', 'f'],
  ['fleet', 'Fleet', 'car', 'f', [['veh', 'Vehicles', 'f'], ['asg', 'Assignments', 'f']]],
  ['ops', 'Operations', 'list', 's', [['bk', 'Bookings', 's'], ['rn', 'Rentals', 'f'], ['inc', 'Incidents', 's']]],
  ['money', 'Money', 'cash', 'c', [['rem', 'Remittances', 'c'], ['pay', 'Payments', 'c'], ['sum', 'Settlements', 'c']]],
  ['sys', 'System', 'gear', 'f', [['set', 'Settings', 'f'], ['staff', 'Staff', 'S'], ['log', 'Audit log', 'f']]],
];
/* labels for the phone's bottom bar */
const SHORT = { dash: 'Home', apps: 'Apps', ops: 'Ops', money: 'Money', sys: 'System' };
const allow = g => {
  const l = lv();
  return g == 'a'
    ? !!(l || isC())
    : g == 'f'
      ? full()
      : g == 's'
        ? !!l
        : g == 'c'
          ? full() || isC()
          : g == 'S'
            ? l == 'super'
            : false;
};
/* things waiting for staff, per section (shown as a count on the tab) */
const todo = () => ({
  apps: S.apps.filter(a => !['Approved', 'Rejected'].includes(a.st)).length,
  veh: S.vh.filter(v => v.approval == 'Pending Approval').length,
  asg: S.asg.filter(a => ['Pending Admin Review', 'Pending Activation'].includes(a.st)).length,
  inc: S.inc.filter(c => c.st == 'Submitted').length,
  rem: S.rem.filter(r => ['Submitted', 'Discrepancy'].includes(r.st)).length,
  pay:
    S.pay.filter(p => p.status == 'Submitted' && p.kind != 'down' && p.kind != 'final').length +
    S.pay.filter(p => ['refund', 'deposit_refund'].includes(p.kind) && p.status == 'Due').length,
  bk: S.bk.filter(b => b.st == 'Interrupted').length,
});
const secCount = s => {
  const t = todo();
  return s[4] ? s[4].filter(x => allow(x[2])).reduce((n, x) => n + (t[x[0]] || 0), 0) : t[s[0]] || 0;
};
const subOf = s => {
  const l = (s[4] || []).filter(x => allow(x[2]));
  return l.find(x => x[0] == sub[s[0]]) ? sub[s[0]] : (l[0] || [])[0];
};
const goPage = id => {
  /* a section id, or a sub-page id (then its section is opened) */
  const s = SECTIONS.find(x => x[0] == id || (x[4] || []).some(y => y[0] == id));
  if (!s) return;
  page = s[0];
  if (s[0] != id) sub[s[0]] = id;
  if (page != 'users') sel = null;
};

/* ---------- pages ---------- */
const P = {};
const head = (t, sub2) => `<div class="ad-head"><div><h1>${t}</h1>${sub2 ? `<p class="mu" style="margin:0">${sub2}</p>` : ''}</div></div>`;
const msg = () =>
  flash ? `<div class="vz-m ${flash.good ? 'good' : 'bad'}" role="status" aria-live="polite" style="margin-top:14px">${esc(flash.t)}</div>` : '';

P.dash = () => {
  const t = todo(),
    att = [
      ['apps', t.apps, 'role applications to review', 'f'],
      ['veh', t.veh, 'vehicles waiting for approval', 'f'],
      ['asg', S.asg.filter(a => a.st == 'Pending Admin Review').length, 'assignment requests from owners', 'f'],
      ['asg', S.asg.filter(a => a.st == 'Pending Activation').length, 'signed assignments to activate', 'f'],
      ['bk', t.bk, 'interrupted trips to decide', 'f'],
      ['inc', t.inc, 'new incident reports', 's'],
      ['rem', t.rem, 'driver remittances to verify', 'c'],
      ['pay', t.pay, 'payments to verify and refunds to send', 'c'],
    ].filter(x => allow(x[3]));
  const dr = S.users.filter(u => okr(u, 'driver')),
    ow = S.users.filter(u => okr(u, 'owner')),
    both = S.users.filter(u => okr(u, 'driver') && okr(u, 'owner'));
  const live = S.bk.filter(b => b.drvUser && !['Completed', 'Cancelled', 'Rejected', 'Pending'].includes(b.st));
  return `${head('Overview', new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}
<div class="tiles ad-6" style="margin-top:16px">${tile('Users', S.users.length, full() ? 'users' : '')}${tile('Drivers', dr.length, full() ? 'users' : '')}${tile('Vehicle owners', ow.length, full() ? 'users' : '')}${tile('Owner-drivers', both.length, full() ? 'users' : '')}${tile('Approved vehicles', S.vh.filter(v => v.approval == 'Approved').length, full() ? 'veh' : '')}${tile('Trips in progress', live.length, lv() ? 'bk' : '')}</div>
<div class="ad-grid">${card(
    'Needs your attention',
    att.some(x => x[1])
      ? `<div class="ad-att">${att
          .map(
            x =>
              `<button data-a="go" data-p="${x[0]}"><b class="${x[1] ? '' : 'z'}">${x[1]}</b><span class="${x[1] ? '' : 'z'}">${x[2]}</span><span class="go" aria-hidden="true">›</span></button>`
          )
          .join('')}</div>`
      : '<div class="empty">All caught up. Nothing is waiting for you.</div>'
  )}${card(
    'Trips in progress',
    tbl(
      ['Booking', 'Driver', 'Status'],
      live.slice(0, 8).map(b => [`<span class="n">${esc(b.id)}</span>`, userLink(b.drvUser), tag(b.st)]),
      'No trips are in progress.'
    )
  )}</div>`;
};

/* ----- users ----- */
const USER_FILTERS = [
  ['all', 'All'],
  ['customer', 'Customers'],
  ['driver', 'Drivers'],
  ['owner', 'Owners'],
  ['both', 'Owner-drivers'],
  ['pending', 'Pending roles'],
  ['staff', 'Staff'],
  ['suspended', 'Suspended'],
];
const userMatch = u => {
  const roles = u.roles || [];
  const f = {
    all: true,
    customer: !u.adm && !u.cash && !roles.some(r => r.st == 'approved'),
    driver: okr(u, 'driver'),
    owner: okr(u, 'owner'),
    both: okr(u, 'driver') && okr(u, 'owner'),
    pending: roles.some(r => r.st == 'pending'),
    staff: !!(u.adm || u.cash),
    suspended: u.status == 'suspended',
  }[uf];
  const q = uq.toLowerCase();
  return f && (!q || [u.name, u.em, u.ph].some(x => String(x || '').toLowerCase().includes(q)));
};
P.users = () => {
  if (sel && U(sel)) return userPage(U(sel));
  const l = S.users.filter(userMatch).sort((a, b) => String(b.cr || '').localeCompare(String(a.cr || '')));
  return `${head('Users', 'Everyone with a ZamMove account. Open a person to see their roles, documents, vehicles, trips and history.')}${msg()}
<div class="ad-row" style="margin-top:16px"><input id="f-uq" type="search" placeholder="Search name, email or phone" aria-label="Search users" value="${esc(uq)}"><select id="f-uf" aria-label="Filter users">${USER_FILTERS.map(f => `<option value="${f[0]}" ${uf == f[0] ? 'selected' : ''}>${f[1]} (${S.users.filter(u => { const o = uf; uf = f[0]; const m = userMatch(u); uf = o; return m; }).length})</option>`).join('')}</select></div>
${card(
  '',
  tbl(
    ['Person', 'Roles', 'Vehicles', 'Joined', ''],
    l.map(u => [
      `<div class="ad-user"><span class="zav">${esc(ini(u.name))}</span><span><b style="font-weight:600">${esc(u.name)}</b><small>${esc(u.em)}</small></span></div>`,
      roleTags(u),
      String(S.vh.filter(v => v.owner == u.em).length || '—'),
      `<span class="n">${day(u.cr)}</span>`,
      btn('user', 'View', `data-e="${esc(u.em)}"`, 'o'),
    ]),
    'No users match.'
  ),
  'style="margin-top:12px"'
)}`;
};
const userPage = u => {
  const em = u.em,
    isDrv = okr(u, 'driver'),
    isOwn = okr(u, 'owner'),
    dx = u.dx || {},
    apps = S.apps.filter(a => a.user == em).reverse(),
    vhs = S.vh.filter(v => v.owner == em),
    asg = S.asg.filter(a => a.driver == em).reverse(),
    cur = asgOfDrv(em),
    bkC = S.bk.filter(b => b.cu == em),
    bkD = S.bk.filter(b => b.drvUser == em),
    rn = S.rn.filter(r => r.cu == em),
    flags = (u.flags || []).filter(f => f.open),
    ev = S.au
      .filter(a => a.who == em || (a.data && (a.data.user == em || a.data.driver == em)))
      .slice(-15)
      .reverse(),
    self = !!full() && em != me;
  const kv = rows =>
    `<dl class="ad-kv">${rows
      .filter(r => r)
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('')}</dl>`;
  /* vehicles this driver could be put on: approved hauling vehicles (their own first) */
  const vOpts = haulers()
    .sort((a, b) => (b.owner == em) - (a.owner == em))
    .map(v => {
      const a = activeAsg(v.id);
      return `<option value="${v.id}" ${pre.vehicle == v.id ? 'selected' : ''}>${esc(vLabel(v))}${v.owner == em ? ' · their own' : ' · ' + esc(nm(v.owner))}${a ? ' · driven by ' + esc(a.driver == em ? 'them' : nm(a.driver)) : ''}</option>`;
    })
    .join('');
  const drvOpts = v =>
    drivers()
      .filter(d => d.em == v.owner || !asgOfDrv(d.em))
      .sort((a, b) => (b.em == v.owner) - (a.em == v.owner))
      .map(d => `<option value="${esc(d.em)}">${esc(d.name)}${d.em == v.owner ? ' (the owner)' : ''}</option>`)
      .join('');
  const roleRows = (u.roles || []).length
    ? (u.roles || [])
        .map(
          r =>
            `<div class="ad-row" style="justify-content:space-between"><span><b style="font-weight:600">${r.t == 'owner' ? 'Vehicle owner' : 'Driver'}</b> ${tag(r.st)}<br><small class="mu">${r.st == 'approved' ? 'Approved ' + day(r.at) + (r.via ? ' · with ' + esc(r.via) : '') : r.st == 'revoked' ? 'Revoked ' + day(r.revokedAt) + ': ' + esc(r.reason || '') : ''}</small></span>${self && r.st == 'approved' ? `<span class="ad-row" style="margin:0;flex:1 1 260px">${inp('rv-' + r.t, 'Reason to revoke')}${btn('revoke', 'Revoke', `data-e="${esc(em)}" data-r="${r.t}"`, 'o')}</span>` : ''}</div>`
        )
        .join('')
    : '<div class="empty">Customer only: no driver or owner role.</div>';
  return `<button class="ad-link" data-a="users-all">← All users</button>${msg()}
<section class="card" style="margin-top:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span class="zav lg">${esc(ini(u.name))}</span><div style="flex:1;min-width:220px"><h1 style="margin:0">${esc(u.name)}</h1><div class="mu">${esc(em)} · ${esc(u.ph || 'no phone')}</div><div style="margin-top:6px">${roleTags(u)}</div></div></section>
<div class="ad-grid">
<div class="ad-col">${card(
    'Profile',
    kv([
      ['Phone', esc(u.ph || '—')],
      ['Address', esc(u.ad || '—')],
      ['Birth date', esc(u.dob || '—')],
      ['Joined', day(u.cr)],
      ['Account', u.ver ? 'Verified' : 'Not verified'],
      ['Status', u.status == 'suspended' ? `<span class="ad-bad">Suspended</span> ${esc((u.susp || {}).reason || '')}` : 'Active'],
      u.demo ? ['Note', 'Example account'] : null,
    ]) +
      (self && u.adm != 'super'
        ? `<div class="ad-row">${inp('st', u.status == 'suspended' ? 'Reason to reactivate' : 'Reason to suspend')}${btn('ustat', u.status == 'suspended' ? 'Reactivate' : 'Suspend', `data-e="${esc(em)}" data-s="${u.status == 'suspended' ? 'active' : 'suspended'}"`, u.status == 'suspended' ? '' : 'd')}</div>`
        : '')
  )}${card('Roles', roleRows)}${
    isDrv || dx.lic || u.lic
      ? card(
          'Driver documents',
          kv([
            ['License no.', esc(u.lic || '—')],
            ['License valid until', dateCell(dx.lic)],
            ['NBI/police clearance until', dateCell(dx.clr)],
            ['Availability', esc((S.dp[em] || {}).avail || '—')],
            ['Renewals uploaded', String((u.dxh || []).length)],
            ['Company money on hand', (S.drvCash || {})[em] ? peso(Math.max(0, S.drvCash[em].held)) + ' of ' + peso(S.drvCash[em].cap) + (S.drvCash[em].overdue ? ' <span class="ad-bad">overdue</span>' : '') : '—'],
            ['Late / no-show strikes', String((u.strikes || []).length)],
          ])
        )
      : ''
  }${
    flags.length
      ? card(
          'Open flags',
          flags.map(f => `<p style="margin:0 0 8px">${tag(f.kind)} ${esc(f.note)}<br><small class="mu">${ts(f.t)} by ${esc(nm(f.by))}</small></p>`).join('')
        )
      : ''
  }</div>
<div class="ad-col">${
    isDrv
      ? card(
          'Assign a vehicle',
          `${cur ? `<p style="margin:0 0 6px">Now drives <b style="font-weight:600">${esc(vLabel(vOf(cur.vehicle)))}</b>${cur.self ? ' (their own)' : ''}.</p>` : '<p class="mu" style="margin:0 0 6px">Not driving any vehicle now.</p>'}${
            u.status == 'suspended'
              ? '<div class="empty">Reactivate the account to assign a vehicle.</div>'
              : vOpts
                ? `<div class="ad-row"><select id="f-av" aria-label="Vehicle">${vOpts}</select></div><div class="ad-row">${inp('ap', 'Share % (' + (S.cfg.drvPct || 20) + ')', 'number')}${inp('an', 'Note (optional)')}${btn('assign', 'Assign', `data-e="${esc(em)}"`)}</div><p class="mu n" style="margin:8px 0 0">Their own vehicle: they become its driver at once. Someone else’s: the driver accepts, both sign the agreement, then you activate it under Fleet → Assignments.</p>`
                : '<div class="empty">No approved hauling vehicles yet.</div>'
          }`
        )
      : ''
  }${card(
    'Vehicles owned',
    vhs.length
      ? tbl(
          ['Vehicle', 'Approval', 'Driver', ''],
          vhs.map(v => {
            const a = activeAsg(v.id),
              canAssign = self && v.approval == 'Approved' && !rentOnly(v) && !a;
            return [
              `${esc(vName(v))}<br><small class="mu n">${esc(v.plate)} · ${esc(typeN(v.type))}</small>`,
              tag(v.approval),
              a ? (a.driver == em ? 'Themselves' : userLink(a.driver)) : rentOnly(v) ? '<span class="mu">Rental only</span>' : '—',
              canAssign && drvOpts(v)
                ? `<span class="ad-row" style="margin:0"><select id="f-vd-${v.id}" aria-label="Driver for ${esc(v.plate)}">${drvOpts(v)}</select>${btn('assignv', 'Assign', `data-id="${v.id}"`, 'o')}</span>`
                : '',
            ];
          })
        )
      : `<div class="empty">${isOwn ? 'No vehicles registered yet.' : 'No vehicles.'}</div>`
  )}${card(
    'Assignments as a driver',
    tbl(
      ['Vehicle', 'How', 'Status', 'Since'],
      asg.map(a => [esc(vLabel(vOf(a.vehicle))), esc(a.mode || ''), tag(a.st), `<span class="n">${day((a.hist[0] || {}).t || a.cr)}</span>`]),
      'No assignments.'
    )
  )}</div></div>
<div class="ad-grid">${card(
    'Applications',
    apps.length
      ? apps
          .map(
            a =>
              `<div style="padding:8px 0;border-top:1px solid var(--s2)"><b style="font-weight:600">${a.role == 'owner' ? 'Vehicle owner' : 'Driver'}</b> ${tag(a.st)} <small class="mu n">${esc(a.id)} · ${day((a.hist[0] || {}).t)}</small>${a.info && a.info.license ? `<div class="mu n">License ${esc(a.info.license)} · valid until ${esc(a.info.licExp || '—')}</div>` : ''}<div class="wsa" style="margin-top:6px">${docBtns('app', a.id, a.docs)}</div></div>`
          )
          .join('')
      : '<div class="empty">No applications.</div>'
  )}${card(
    'Trips and rentals',
    `<div class="tiles" style="margin-bottom:12px">${tile('As customer', bkC.length)}${tile('Trips driven', bkD.filter(b => b.st == 'Completed').length)}${tile('Rentals', rn.length)}</div>${tbl(
      ['Booking', 'Role', 'Status', 'Fare'],
      [...bkC.map(b => [b, 'Customer']), ...bkD.map(b => [b, 'Driver'])]
        .sort((x, y) => String(y[0].cr || '').localeCompare(String(x[0].cr || '')))
        .slice(0, 8)
        .map(([b, r]) => [`<span class="n">${esc(b.id)}</span>`, r, tag(b.st), peso(b.tot)]),
      'No bookings.'
    )}`
  )}${card(
    'Recent activity',
    ev.length ? ev.map(a => `<div class="ad-ev"><span class="n">${ts(a.t)}</span> · ${esc(a.evt)}${a.who != em ? ' (by ' + esc(nm(a.who)) + ')' : ''}</div>`).join('') : '<div class="empty">No recorded activity.</div>'
  )}</div>`;
};

/* ----- applications ----- */
const docBtns = (kind, id, docs, photo) =>
  (docs || []).map((d, j) => btn('doc', esc(d.name), `data-k="${kind}" data-id="${id}" data-j="${j}"`, 'o')).join('') +
  (photo ? btn('doc', 'Vehicle photo', `data-k="vph" data-id="${id}"`, 'o') : '');
P.apps = () => {
  const open = a => !['Approved', 'Rejected'].includes(a.st);
  const l = S.apps
    .filter(a => (aq == 'open' ? open(a) : a.st == (aq == 'approved' ? 'Approved' : 'Rejected')))
    .slice()
    .reverse();
  const segs = [
    ['open', 'To review', S.apps.filter(open).length],
    ['approved', 'Approved', S.apps.filter(a => a.st == 'Approved').length],
    ['rejected', 'Rejected', S.apps.filter(a => a.st == 'Rejected').length],
  ];
  return `${head('Applications', 'Driver and vehicle owner applications: verify documents, interview, orientation, then approve.')}${msg()}
<div class="seg ad-sub">${segs.map(s => `<button class="sgb ${aq == s[0] ? 'on' : ''}" data-a="aq" data-q="${s[0]}">${s[1]} (${s[2]})</button>`).join('')}</div>
${
  l.length
    ? l
        .map(a => {
          const u = U(a.user) || {},
            i = a.info || {},
            s = a.st,
            id = a.id;
          return `<section class="card" style="margin-top:12px"><div class="ad-head" style="align-items:center"><div class="ad-user"><span class="zav">${esc(ini(u.name))}</span><span><b style="font-weight:600">${userLink(a.user)}</b> · ${a.role == 'owner' ? 'Vehicle owner' : 'Driver'}<small>${esc(a.user)} · ${esc(i.phone || u.ph || '')} · ${esc(i.address || u.ad || '')}</small></span></div>${tag(s)}</div>
${i.license ? `<p class="mu n" style="margin:10px 0 0">License ${esc(i.license)} · valid until ${dateCell(i.licExp)} · clearance until ${dateCell(i.clrExp)}</p>` : ''}${(a.rec || []).length ? `<p class="mu n" style="margin:6px 0 0">Recommended by a vehicle owner (${a.rec.length} request${a.rec.length > 1 ? 's' : ''} waiting for this application).</p>` : ''}
<div class="wsa">${docBtns('app', id, a.docs) || '<span class="mu">No documents uploaded.</span>'}</div>${a.iv ? `<p class="mu" style="margin:8px 0 0">Interview: ${esc(a.iv.when)} at ${esc(a.iv.where)}</p>` : ''}${a.req && s == 'Awaiting Additional Documents' ? `<p class="mu" style="margin:8px 0 0">Requested from the applicant: ${esc(a.req)}</p>` : ''}
${
  open(a)
    ? `<div class="ad-row">${s == 'Pending Review' ? btn('app', 'Start verification', `data-id="${id}" data-x="verify"`) : ''}${['Under Verification', 'Awaiting Additional Documents'].includes(s) ? `<input id="f-${id}-w" type="datetime-local" aria-label="Interview date and time">${inp(id + '-p', 'Interview place')}${btn('app', 'Schedule interview', `data-id="${id}" data-x="interview"`)}` : ''}</div>${['Under Verification', 'Interview Scheduled'].includes(s) ? `<div class="ad-row">${inp(id + '-n', 'What is needed from the applicant')}${btn('app', 'Request document', `data-id="${id}" data-x="request"`, 'o')}</div>` : ''}<div class="ad-row">${s == 'Interview Scheduled' ? btn('app', 'Interview held: to orientation', `data-id="${id}" data-x="orient"`) : ''}${s == 'For Orientation' && !a.orient ? btn('app', 'Mark orientation completed', `data-id="${id}" data-x="orientdone"`) : ''}${s == 'For Orientation' && a.orient ? btn('app', 'Approve role', `data-id="${id}" data-x="approve"`) : ''}</div><div class="ad-row">${inp(id + '-r', 'Reason for rejection')}${btn('app', 'Reject', `data-id="${id}" data-x="reject"`, 'd')}</div>`
    : `<p class="mu n" style="margin:10px 0 0">${esc(s)} ${day((a.hist[a.hist.length - 1] || {}).t)}</p>`
}</section>`;
        })
        .join('')
    : `<div class="card empty" style="margin-top:12px">${aq == 'open' ? 'No applications waiting.' : 'None yet.'}</div>`
}`;
};

/* ----- fleet ----- */
P.veh = () => {
  const pend = S.vh.filter(v => v.approval == 'Pending Approval');
  return `${msg()}<h2 style="margin-top:18px">Waiting for approval</h2>${
    pend.length
      ? pend
          .map(v => {
            const o = U(v.owner) || {};
            return `<section class="card" style="margin-top:12px"><div class="ad-head" style="align-items:center"><div><b style="font-weight:600;font-size:18px">${esc(vName(v))}</b> <span class="n">${esc(v.plate)}</span><div class="mu n">${esc(typeN(v.type))} · ${esc(v.color || 'color not recorded')}${v.year ? ' · ' + esc(v.year) : ''} · registration until ${dateCell(v.regExp)}</div></div>${tag(v.approval)}</div>
<p style="margin:10px 0 0">Registered by ${userLink(v.owner)} ${roleTags(o)}${okr(o, 'owner') ? '' : '<br><small class="mu">Not an owner yet: approving this vehicle also makes them a vehicle owner.</small>'}${v.selfReq ? '<br><small class="mu">They will drive it themselves: approving sets them as its driver.</small>' : ''}</p>
${legalLines(v)}<div class="wsa">${docBtns('veh', v.id, v.docs, v.photo)}${(v.legal || {}).insDoc ? btn('doc', 'Insurance', `data-k="ins" data-id="${v.id}"`, 'o') : ''}${(v.legal || {}).cpcDoc ? btn('doc', 'Franchise', `data-k="cpc" data-id="${v.id}"`, 'o') : ''}</div><div class="ad-row">${btn('veh', 'Approve', `data-id="${v.id}" data-x="approve"`)}${inp(v.id + '-r', 'Reason for rejection')}${btn('veh', 'Reject', `data-id="${v.id}" data-x="reject"`, 'd')}</div></section>`;
          })
          .join('')
      : '<div class="card empty" style="margin-top:12px">No vehicles waiting.</div>'
  }<h2 style="margin-top:22px">All vehicles</h2>${card(
    '',
    tbl(
      ['Vehicle', 'Owner', 'Driver', 'Approval', 'Status', ''],
      S.vh.map(v => {
        const a = activeAsg(v.id);
        return [
          `${esc(vName(v))}<br><small class="mu n">${esc(v.plate)} · ${esc(typeN(v.type))}</small><br><small>${legalShort(v)}</small>`,
          userLink(v.owner),
          a ? (a.driver == v.owner ? userLink(a.driver) + ' <small class="mu">(owner)</small>' : userLink(a.driver)) : rentOnly(v) ? '<span class="mu">Rental only</span>' : '—',
          tag(v.approval),
          tag(v.status || ''),
          v.approval == 'Approved' && !rentOnly(v) ? btn('pickv', a ? 'Reassign' : 'Assign driver', `data-id="${v.id}"`, 'o') : '',
        ];
      })
    ),
    'style="margin-top:12px"'
  )}`;
};
P.asg = () => {
  const by = st => S.asg.filter(a => st.includes(a.st)).reverse();
  const pend = by(['Pending Admin Review']),
    act = by(['Pending Activation']),
    prog = by(['Waiting for Application', 'Awaiting Driver', 'Awaiting Agreement']),
    live = by(['Active']),
    hist = by(['Ended', 'Cancelled', 'Rejected', 'Declined']);
  const vs = haulers();
  const v0 = vOf(pre.vehicle) || vs[0];
  const dOpts = drivers()
    .map(d => `<option value="${esc(d.em)}">${esc(d.name)}${asgOfDrv(d.em) ? ' · drives ' + esc((vOf(asgOfDrv(d.em).vehicle) || {}).plate || '') : ' · free'}${okr(d, 'owner') ? ' · owner-driver' : ''}</option>`)
    .join('');
  const who = a => {
    const v = vOf(a.vehicle);
    return `${userLink(a.driver)} → ${esc(vLabel(v))}<br><small class="mu">${esc(a.mode || '')}${a.by ? ' · by ' + esc(nm(a.by)) : ''}${a.note ? ' · ' + esc(a.note) : ''}${a.terms ? ' · driver share ' + a.terms.pct + '%' : ''}</small>`;
  };
  const issues = a => {
    const u = U(a.driver) || {},
      v = vOf(a.vehicle) || {},
      dx = u.dx || {},
      l = [];
    if (expired(dx.lic)) l.push('license expired ' + dx.lic);
    if (expired(dx.clr)) l.push('clearance expired ' + dx.clr);
    if (expired(v.regExp)) l.push('registration expired ' + v.regExp);
    return l;
  };
  return `${msg()}${card(
    'Assign a vehicle to a driver',
    vs.length && dOpts
      ? `<div class="wsf"><div><label for="f-av">Vehicle</label><select id="f-av">${vs.map(v => { const a = activeAsg(v.id); return `<option value="${v.id}" ${v0 && v0.id == v.id ? 'selected' : ''}>${esc(vLabel(v))} · ${esc(nm(v.owner))}${a ? ' · driven by ' + esc(nm(a.driver)) : ' · no driver'}</option>`; }).join('')}</select></div><div><label for="f-ad">Driver</label><select id="f-ad">${dOpts}</select></div><div><label for="f-ap">Driver share %</label>${inp('ap', 'default ' + (S.cfg.drvPct || 20), 'number')}</div><div><label for="f-an">Note (optional)</label>${inp('an', 'e.g. covers weekday trips')}</div></div><div class="wsa">${btn('assign', 'Assign')}</div><p class="mu n" style="margin:10px 0 0">If the driver owns the vehicle, they become its driver at once. Otherwise the driver accepts the offer, driver and owner sign the agreement, and you activate it below.</p>`
      : '<div class="empty">You need an approved hauling vehicle and an approved driver first.</div>',
    'style="margin-top:18px"'
  )}
<div class="ad-grid">${card(
    `Owner requests to approve${pend.length ? `<span class="nb">${pend.length}</span>` : ''}`,
    pend.length
      ? pend.map(a => `<div style="padding:10px 0;border-top:1px solid var(--s2)">${who(a)}<div class="ad-row">${btn('asg', 'Approve', `data-id="${a.id}" data-x="approve"`)}${inp(a.id + '-r', 'Reason for rejection')}${btn('asg', 'Reject', `data-id="${a.id}" data-x="reject"`, 'd')}</div></div>`).join('')
      : '<div class="empty">No requests waiting.</div>'
  )}${card(
    `Signed, ready to activate${act.length ? `<span class="nb">${act.length}</span>` : ''}`,
    act.length
      ? act
          .map(a => {
            const is = issues(a);
            return `<div style="padding:10px 0;border-top:1px solid var(--s2)">${who(a)}${a.ag ? `<br><small class="mu">Agreement ${esc(a.ag.terms.no)} signed by both</small>` : ''}${is.length ? `<p class="ad-bad" style="margin:6px 0 0">Cannot activate: ${esc(is.join('; '))}</p>` : ''}<div class="ad-row">${btn('activate', 'Activate', `data-id="${a.id}" ${is.length ? 'disabled' : ''}`)}</div></div>`;
          })
          .join('')
      : '<div class="empty">Nothing to activate.</div>'
  )}</div>
${card(
  'In progress',
  tbl(
    ['Driver and vehicle', 'Status', 'Cancel'],
    prog.map(a => [who(a), tag(a.st), `<span class="ad-row" style="margin:0">${inp(a.id + '-e', 'Reason (10+ characters)')}${btn('end', 'Cancel', `data-id="${a.id}"`, 'o')}</span>`]),
    'Nothing in progress.'
  ),
  'style="margin-top:14px"'
)}${card(
    'Active assignments',
    tbl(
      ['Driver and vehicle', 'Since', 'End'],
      live.map(a => [who(a), `<span class="n">${day((a.hist[a.hist.length - 1] || {}).t || a.cr)}</span>`, `<span class="ad-row" style="margin:0">${inp(a.id + '-e', 'Reason (10+ characters)')}${btn('end', 'End', `data-id="${a.id}"`, 'o')}</span>`]),
      'No active assignments.'
    ),
    'style="margin-top:14px"'
  )}${card(
    'History',
    tbl(['Driver and vehicle', 'Status', 'Date'], hist.slice(0, 40).map(a => [who(a), tag(a.st), `<span class="n">${day((a.hist[a.hist.length - 1] || {}).t)}</span>`]), 'No closed assignments.'),
    'style="margin-top:14px"'
  )}`;
};

/* ----- operations ----- */
let bq = '';
P.bk = () => {
  const q = bq.toLowerCase(),
    l = S.bk
      .filter(b => !q || [b.id, b.pu, b.dr, nm(b.cu), nm(b.drvUser), b.st].some(x => String(x || '').toLowerCase().includes(q)))
      .slice()
      .reverse();
  const ints = S.bk.filter(b => b.st == 'Interrupted'),
    live = S.bk.filter(b => b.drvUser && !['Completed', 'Cancelled', 'Rejected', 'Pending', 'No driver found', 'Interrupted'].includes(b.st));
  const paid = b => r2(S.pay.filter(p => p.bid == b.id && counted(p)).reduce((s, p) => s + p.amount, 0));
  const intCard = ints.length
    ? card(
        `Interrupted trips<span class="nb">${ints.length}</span>`,
        ints
          .map(b => {
            const got = paid(b),
              dOpts = drivers()
                .filter(d => d.em != b.drvUser)
                .map(d => `<option value="${esc(d.em)}">${esc(d.name)}</option>`)
                .join('');
            return `<div style="padding:12px 0;border-top:1px solid var(--s2)"><b style="font-weight:600" class="n">${esc(b.id)}</b> · ${userLink(b.cu)} · driver ${userLink(b.drvUser)} <span class="tag r">stopped at ${esc((b.int || {}).from || '')}</span><p style="margin:6px 0">${esc((b.int || {}).why || '')}</p><p class="mu n" style="margin:0">Collected so far: ${peso(got)} of ${peso(b.tot)}.</p>${inp(b.id + '-why', 'Decision and reason (10+ characters)')}<div class="ad-row">${btn('tres', 'Resume the trip', `data-id="${b.id}" data-x="resume"`, 'o')}${got > 0 ? '' : `<select id="f-${b.id}-drv" aria-label="New driver">${dOpts}</select>${btn('tres', 'Give to this driver', `data-id="${b.id}" data-x="reassign"`)}`}</div><div class="ad-row"><label for="f-${b.id}-ref" style="flex:none">Refund to the customer (₱)</label>${inp(b.id + '-ref', 'Refund to the customer (₱)', 'number', got ? String(got) : '0')}${btn('tres', 'Close the trip', `data-id="${b.id}" data-x="close"`, 'd')}</div></div>`;
          })
          .join(''),
        'style="margin-top:18px"'
      )
    : '';
  const stopCard = live.length
    ? card(
        'Stop a trip in progress',
        `<p class="mu" style="margin-top:0">For a breakdown, an accident or a dispute the driver could not report. The trip waits for your decision above.</p><div class="ad-row"><select id="f-stopb" aria-label="Trip">${live.map(b => `<option value="${esc(b.id)}">${esc(b.id)} · ${esc(nm(b.drvUser))} · ${esc(b.st)}</option>`).join('')}</select>${inp('stopw', 'What happened (10+ characters)')}${btn('tstop', 'Stop trip', '', 'd')}</div>`,
        'style="margin-top:14px"'
      )
    : '';
  return `${msg()}${intCard}${stopCard}<div class="ad-row" style="margin-top:18px"><input id="f-bq" type="search" placeholder="Search booking, place, person or status" aria-label="Search bookings" value="${esc(bq)}"></div>${card(
    '',
    tbl(
      ['Booking', 'Route', 'Customer', 'Driver', 'Status', 'Fare', 'Timeline'],
      l.map(b => [
        `<span class="n">${esc(b.id)}</span><br><small class="mu">${esc(b.dt || '')} ${esc(b.tm || '')}</small>`,
        esc((b.pu || '') + ' → ' + (b.dr || '')),
        b.cu ? userLink(b.cu) : '—',
        b.drvUser ? userLink(b.drvUser) : '—',
        tag(b.st),
        peso(b.tot),
        `<details><summary>${(b.ev || []).length} events</summary>${(b.ev || []).map(e => `<div class="ad-ev">${ts(e.t)} ${esc(e.to)}${e.note ? ': ' + esc(e.note) : ''}</div>`).join('')}</details>`,
      ]),
      'No bookings.'
    ),
    'style="margin-top:12px"'
  )}`;
};
P.rn = () =>
  `<p class="mu" style="margin:18px 0 0">Self-drive rentals are approved by the vehicle owner. This list is for reference.</p>${card(
    '',
    tbl(
      ['Rental', 'Vehicle', 'Renter', 'Owner', 'Dates', 'Status'],
      S.rn
        .slice()
        .reverse()
        .map(r => [`<span class="n">${esc(r.id)}</span>`, esc(vLabel(vOf(r.veh)) || r.vn || ''), userLink(r.cu), userLink(r.owner), `<span class="n">${esc(r.s || '')} → ${esc(r.e || '')}</span>`, tag(r.st || '')]),
      'No rentals.'
    ),
    'style="margin-top:12px"'
  )}`;
const ICT = {
    start: ['Submitted'],
    evidence: ['Under review', 'Statement recorded'],
    statement: ['Under review', 'Evidence requested'],
    decide: ['Under review', 'Evidence requested', 'Statement recorded'],
    close: ['Decision recorded'],
  },
  ICL = { start: 'Start review', evidence: 'Request evidence', statement: 'Record statement', decide: 'Record decision', close: 'Close case' };
P.inc = () =>
  `<p class="mu" style="margin:18px 0 0">Reports are reviewed before any decision. Nobody is blamed or penalized from an initial report alone.</p>${msg()}${
    S.inc.length
      ? S.inc
          .slice()
          .reverse()
          .map(
            c =>
              `<section class="card" style="margin-top:12px"><div class="ad-head" style="align-items:center"><div><b style="font-weight:600">${esc(c.id)}</b> · ${esc(c.cat || '')} · severity ${esc(c.sev || '')}<div class="mu n">Booking ${esc(c.bid || '—')} · reported by ${userLink(c.by)}</div></div>${tag(c.st)}</div><p style="margin:10px 0">${esc(c.d || '')}</p>${(c.log || []).map(l => `<div class="ad-ev">${ts(l.t)} ${esc(l.act)} by ${esc(nm(l.by))}${l.note ? ': ' + esc(l.note) : ''}</div>`).join('')}${c.decision ? `<p><b>Decision:</b> ${esc(c.decision)}</p>` : ''}${
                full() && c.st != 'Closed'
                  ? `<textarea id="f-${c.id}-n" rows="2" style="width:100%;margin-top:10px" placeholder="Note, evidence request or finding" aria-label="Case note"></textarea><div class="wsa">${btn('inc', 'Add note', `data-id="${c.id}" data-x="note"`, 'o')}${Object.keys(ICT)
                      .filter(k => ICT[k].includes(c.st))
                      .map(k => btn('inc', ICL[k], `data-id="${c.id}" data-x="${k}"`))
                      .join('')}</div>`
                  : ''
              }</section>`
          )
          .join('')
      : '<div class="card empty" style="margin-top:12px">No incident reports.</div>'
  }`;

/* ----- money ----- */
const gross = b => r2(S.pay.filter(p => p.bid == b.id && p.by && counted(p)).reduce((s, p) => s + p.amount, 0));
const dueOf = b => r2(Math.max(0, gross(b) - ((b.split || {}).drv || 0)));
P.rem = () => {
  const q = S.rem.filter(r => r.st == 'Submitted'),
    d = S.rem.filter(r => r.st == 'Discrepancy'),
    row = (r, res) => [
      userLink(r.drv),
      esc(r.week),
      peso(r.due),
      esc(r.method) + ' · ' + esc(r.ref) + (r.diff ? `<br><small>Received ${peso(r.recv)} (${r.diff > 0 ? '+' : '-'}${peso(Math.abs(r.diff))})</small>` : ''),
      res
        ? `<span class="ad-row" style="margin:0">${inp(r.id + '-a', 'Extra received', 'number')}${inp(r.id + '-n', 'Resolution note')}${btn('res', 'Resolve', `data-id="${r.id}"`)}</span>`
        : `<span class="ad-row" style="margin:0">${inp(r.id + '-a', 'Amount received', 'number')}${inp(r.id + '-n', 'Note (optional)')}${btn('ver', 'Verify', `data-id="${r.id}"`)}</span>`,
    ];
  return `${msg()}<div class="tiles" style="margin-top:18px">${tile('Awaiting verification', q.length)}${tile('Discrepancies', d.length)}${tile('Verified', S.rem.filter(r => ['Verified', 'Resolved'].includes(r.st)).length)}</div>
${card('Awaiting verification', tbl(['Driver', 'Week', 'Expected', 'Driver reported', 'Action'], q.map(r => row(r, 0)), 'Nothing to verify.'), 'style="margin-top:14px"')}${card('Discrepancies', tbl(['Driver', 'Week', 'Expected', 'Details', 'Action'], d.map(r => row(r, 1)), 'No discrepancies.'), 'style="margin-top:14px"')}${card('History', tbl(['Driver', 'Week', 'Due', 'Received', 'Status'], S.rem.filter(r => ['Verified', 'Resolved'].includes(r.st)).map(r => [userLink(r.drv), esc(r.week), peso(r.due), peso(r.recv), tag(r.st)]), 'No history yet.'), 'style="margin-top:14px"')}`;
};
const PH = ['Date', 'Booking / rental', 'Kind', 'Method', 'Amount', 'Reference', 'Payer', 'Collected by', 'Status'],
  okImg = f => typeof f == 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(f);
P.pay = () => {
  const q = S.pay.filter(p => p.status == 'Submitted' && p.kind != 'down' && p.kind != 'final');
  const refunds = S.pay.filter(p => ['refund', 'deposit_refund'].includes(p.kind) && p.status == 'Due');
  const refundCard = card(
    'Refunds to send',
    tbl(
      ['Booking / rental', 'Kind', 'To', 'Amount', 'Send'],
      refunds.map(p => [
        esc(p.bid),
        p.kind == 'deposit_refund' ? 'Rental deposit' : 'Closed trip',
        userLink(p.to),
        `<b>${peso(p.amount)}</b>`,
        `<span class="ad-row" style="margin:0"><select id="f-${p.id}-rm" aria-label="Method"><option>GCash</option><option>Cash</option></select>${inp(p.id + '-rr', 'GCash reference')}${btn('refund', 'Mark as sent', `data-id="${esc(p.id)}"`)}</span>`,
      ]),
      'No refunds waiting.'
    ),
    'style="margin-top:18px"'
  );
  return `${msg()}${refundCard}${card(
    'Waiting for verification',
    `<p class="mu" style="margin-top:0">Rental payments, deposits and cancellation fees submitted by customers (a verified cancellation fee is credited to the driver). Check each against the GCash account or the cash received. Booking payments are confirmed by the driver who collects them.</p>${tbl(
      ['Date', 'Rental', 'Kind', 'Method', 'Amount', 'Reference', 'Payer', 'Action'],
      q.map(p => [
        day(p.t),
        esc(p.bid),
        esc(p.kind),
        esc(p.method),
        peso(p.amount),
        esc(p.ref) + (okImg(p.pf) ? `<br><img src="${p.pf}" alt="Proof of payment" style="max-width:90px;border-radius:8px">` : ''),
        p.payer ? userLink(p.payer) : '—',
        `<span class="ad-row" style="margin:0">${inp(p.id + '-pn', 'Note (required to reject)')}${btn('payv', 'Verify', `data-id="${esc(p.id)}" data-x="1"`)}${btn('payv', 'Reject', `data-id="${esc(p.id)}" data-x="0"`, 'd')}</span>`,
      ]),
      'Nothing to verify.'
    )}`,
    'style="margin-top:18px"'
  )}${card(
    'Payment ledger',
    `<div class="ad-head" style="align-items:center"><p class="mu" style="margin:0">Only “Recorded by driver” and “Verified” count as paid: ${peso(S.pay.filter(counted).reduce((s, p) => s + p.amount, 0))}.</p>${btn('csv', 'Download CSV', '', 'o')}</div>${tbl(
      PH,
      S.pay
        .slice()
        .reverse()
        .map(p => [day(p.t), esc(p.bid), esc(p.kind), esc(p.method), peso(p.amount), esc(p.ref), p.payer ? userLink(p.payer) : '—', p.collectedBy ? userLink(p.collectedBy) : '—', tag(p.status || '')])
    )}`,
    'style="margin-top:14px"'
  )}`;
};
P.sum = () => {
  const ds = [...new Set(S.bk.filter(b => b.drvUser && gross(b)).map(b => b.drvUser))];
  return `<p class="mu" style="margin:18px 0 0">What each driver collected from customers, what they owe ZamMove after keeping their own share (ZamMove passes the owner’s share on), and what they have remitted.</p>${card(
    '',
    tbl(
      ['Driver', 'Collected', 'Owed to ZamMove', 'Remitted', 'Outstanding', 'Status'],
      ds.map(d => {
        const bs = S.bk.filter(b => b.drvUser == d),
          g = bs.reduce((s, b) => s + gross(b), 0),
          due = r2(bs.reduce((s, b) => s + dueOf(b), 0)),
          rc = S.rem.filter(r => r.drv == d && ['Verified', 'Resolved'].includes(r.st)).reduce((s, r) => s + r.recv, 0),
          out = r2(due - rc);
        const c = (S.drvCash || {})[d] || {};
        return [
          userLink(d),
          peso(g),
          peso(due),
          peso(rc),
          out > 0 ? `<b style="font-weight:600">${peso(out)}</b>` : peso(out),
          c.overdue ? tag('Overdue: blocked') : c.held >= c.cap ? tag('Over limit: blocked') : tag('Active'),
        ];
      }),
      'No collections yet.'
    ),
    'style="margin-top:12px"'
  )}`;
};

/* ----- system ----- */
P.set = () => {
  const comm = S.cfg.comm == null ? 15 : S.cfg.comm,
    drv = S.cfg.drvPct || 20;
  return `${msg()}${card(
    'Money split for every trip',
    `<p class="mu" style="margin-top:0">From each fare (after the ${'5%'} service fee, which ZamMove keeps): ZamMove takes its commission, the driver gets their share, the vehicle owner gets the rest. An owner can agree a different driver share per assignment.</p><div class="wsf"><div><label for="f-comm">ZamMove commission %</label>${inp('comm', '15', 'number', comm)}</div><div><label for="f-drv">Default driver share %</label>${inp('drv', '20', 'number', drv)}</div><div><label>Owner gets</label><p style="margin:10px 0 0;font-size:18px;font-weight:600">${Math.max(0, 100 - comm - drv)}%</p></div></div><div class="wsa">${btn('split', 'Save')}</div>`,
    'style="margin-top:18px"'
  )}${card(
    'Fares per vehicle type',
    `<p class="mu" style="margin-top:0">Used for every new booking (existing bookings keep their price). Customers also pay ₱500 per helper and the 5% service fee.</p>${tbl(
      ['Vehicle type', 'Base fare (₱)', 'Per km (₱)'],
      (S.fleet.HV || []).map(v => [esc(v.n), inp('rb-' + v.id, 'base', 'number', v.base), inp('rk-' + v.id, 'per km', 'number', v.km)])
    )}<div class="wsa">${btn('rates', 'Save fares')}</div>`,
    'style="margin-top:14px"'
  )}${card(
    'Driver cash limit',
    `<p class="mu" style="margin-top:0">Drivers collect fares in cash or by GCash and remit weekly. A driver who holds more company money than this, or has an overdue remittance, cannot accept new jobs until they remit.</p><div class="ad-row">${inp('cap', 'Limit in ₱', 'number', S.cfg.cashCap || 5000)}${btn('cash', 'Save limit')}</div>`,
    'style="margin-top:14px"'
  )}`;
};
P.staff = () => {
  const l = S.users.filter(u => u.adm || u.cash),
    lbl = u => [u.adm == 'super' ? 'Owner admin' : u.adm == 'admin' ? 'Administrator' : u.adm == 'sub' ? 'Secondary admin' : '', u.cash ? 'Cashier' : ''].filter(Boolean).join(' + ');
  return `${msg()}${card(
    'Appoint staff',
    `<div class="ad-row">${inp('se', 'Email of a registered account', 'email')}<select id="f-sr" aria-label="Staff role"><option value="admin">Administrator</option><option value="sub">Secondary admin (bookings and incidents only)</option><option value="cash">Cashier</option></select>${btn('stf', 'Appoint')}</div>`,
    'style="margin-top:18px"'
  )}${card(
    'Staff and administrators',
    tbl(
      ['Name', 'Email', 'Role', ''],
      l.map(u => [
        userLink(u.em),
        esc(u.em),
        lbl(u),
        u.adm == 'super'
          ? ''
          : (u.adm ? btn('unstf', 'Revoke admin', `data-e="${esc(u.em)}" data-k="adm"`, 'o') : '') + ' ' + (u.cash ? btn('unstf', 'Revoke cashier', `data-e="${esc(u.em)}" data-k="cash"`, 'o') : ''),
      ])
    ),
    'style="margin-top:14px"'
  )}`;
};
let lq = '';
P.log = () => {
  const q = lq.toLowerCase(),
    l = S.au
      .slice()
      .reverse()
      .filter(a => !q || [a.who, a.evt, JSON.stringify(a.data || {})].some(x => String(x || '').toLowerCase().includes(q)))
      .slice(0, 300);
  return `<div class="ad-row" style="margin-top:18px"><input id="f-lq" type="search" placeholder="Search person, event or details" aria-label="Search the audit log" value="${esc(lq)}"></div>${card(
    '',
    tbl(['Time', 'Who', 'Event', 'Details'], l.map(a => [`<span class="n">${ts(a.t)}</span>`, userLink(a.who), esc(a.evt), `<small class="mu">${esc(JSON.stringify(a.data || {})).slice(0, 140)}</small>`]), 'No matching events.'),
    'style="margin-top:12px"'
  )}`;
};

/* ---------- shell ---------- */
const TITLES = {
  fleet: ['Fleet', 'Vehicles, approvals and who drives what.'],
  ops: ['Operations', 'Bookings, rentals and incident cases.'],
  money: ['Money', 'Remittances from drivers, payments and settlements.'],
  sys: ['System', 'Settings, staff and the audit log.'],
};
const loginView = m =>
  `<section class="card ad-login"><div class="logo"><span class="lm"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h12v11H2z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></span>ZamMove<span class="ad-badge">Admin</span></div><h1>Staff sign in</h1><p class="mu" style="margin:0">For administrators, secondary admins and cashiers.</p>${m ? `<div class="vz-m bad" role="alert" style="margin-top:14px">${esc(m)}</div>` : ''}<form data-a="login-form"><label for="em">Email</label><input id="em" type="email" autocomplete="username" required><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required><button class="btn" type="submit">Sign in</button></form><p class="mu n" style="margin:16px 0 0">The owner admin account is created once in the ZamMove app (#owner-setup). Other staff are appointed under System → Staff. <a href="../customer/">Open the ZamMove app</a></p></section>`;
const render = () => {
  load();
  const a = $('#app'),
    hd = $('#hd');
  if (me && ZAPI.token() && !S.users.length) {
    a.innerHTML = '<p class="mu" style="padding:24px">Loading…</p>';
    return;
  }
  if (!me || !cu() || !(lv() || isC())) {
    me = null;
    sessionStorage.removeItem(SK);
    hd.hidden = true;
    a.innerHTML = loginView(lmsg);
    return;
  }
  const secs = SECTIONS.filter(s => allow(s[3]));
  if (!secs.find(s => s[0] == page)) page = secs[0][0];
  hd.hidden = false;
  $('#nav').innerHTML = secs
    .map(s => {
      const n = secCount(s);
      return `<a href="#" class="${s[0] == page ? 'on' : ''}" data-a="nav" data-p="${s[0]}" ${s[0] == page ? 'aria-current="page"' : ''}>${ic(s[2])}<span class="ad-l">${s[1]}</span><span class="ad-s" aria-hidden="true">${SHORT[s[0]] || s[1]}</span>${n ? `<span class="nb" aria-label="${n} waiting">${n}</span>` : ''}</a>`;
    })
    .join('');
  const u = cu(),
    role = (lv() == 'super' ? 'Owner admin' : lv() == 'admin' ? 'Administrator' : lv() == 'sub' ? 'Secondary admin' : 'Cashier') + (lv() && isC() ? ' + Cashier' : '');
  $('#who').innerHTML = `<details class="wsm" id="wsm"><summary><span class="zav" style="width:28px;height:28px;font-size:12px">${esc(ini(u.name))}</span><span class="ad-who-name"><small>${esc(role)}</small> ${esc(u.name)}</span></summary><div class="wsp"><div class="mu n" style="padding:6px 8px">${esc(u.em)}</div><a class="btn o sm" href="../customer/" style="text-align:center;text-decoration:none">Open the ZamMove app</a><button class="btn sm" data-a="out">Sign out</button></div></details>`;
  const s = secs.find(x => x[0] == page);
  let body;
  if (s[4]) {
    const cur = subOf(s),
      subs = s[4].filter(x => allow(x[2])),
      t = todo();
    body = `${head(...TITLES[s[0]])}<div class="seg ad-sub" role="tablist">${subs.map(x => `<button class="sgb ${x[0] == cur ? 'on' : ''}" role="tab" aria-selected="${x[0] == cur}" data-a="sub" data-s="${s[0]}" data-p="${x[0]}">${x[1]}${t[x[0]] ? `<span class="nb">${t[x[0]]}</span>` : ''}</button>`).join('')}</div>${P[cur]()}`;
  } else body = P[page]();
  a.innerHTML = body;
};
const showDoc = (k, id, j) => {
  load();
  let f = '';
  if (k == 'app') f = ((S.apps.find(x => x.id == id) || {}).docs || [])[j]?.file;
  else if (k == 'veh') f = ((vOf(id) || {}).docs || [])[j]?.file;
  else if (k == 'ins' || k == 'cpc') f = ((vOf(id) || {}).legal || {})[k + 'Doc'];
  else f = (vOf(id) || {}).photo;
  const m = $('#mod');
  m.innerHTML = okImg(f) ? `<img alt="Document" src="${f}">` : '<div class="card">No preview available for this file.</div>';
  m.hidden = false;
};
document.addEventListener('keydown', e => {
  if (e.key == 'Escape') $('#mod').hidden = true;
  if (e.key == 'Enter' && e.target.matches && e.target.matches('.tile[data-a]')) e.target.click();
});
/* search boxes filter as you type (keep focus and caret) */
document.addEventListener('input', e => {
  const id = e.target.id,
    set = { 'f-uq': v => (uq = v), 'f-bq': v => (bq = v), 'f-lq': v => (lq = v) }[id];
  if (!set) return;
  set(e.target.value);
  const pos = e.target.selectionStart;
  render();
  const n = document.getElementById(id);
  if (n) {
    n.focus();
    try {
      n.setSelectionRange(pos, pos);
    } catch (x) {}
  }
});
document.addEventListener('change', e => {
  if (e.target.id == 'f-uf') {
    uf = e.target.value;
    render();
  }
});
document.addEventListener('submit', async e => {
  if (!e.target.matches('[data-a="login-form"]')) return;
  e.preventDefault();
  const r = await ZAPI.auth('login', { em: $('#em').value, pw: $('#pw').value });
  if (!r.ok) {
    lmsg = r.err;
    return render();
  }
  const u = (S.users || []).find(x => x.em == r.me.em) || {};
  if (!(u.adm || u.cash)) {
    ZAPI.logout();
    S = {};
    lmsg = 'Incorrect email or password, or this account has no staff access.';
    return render();
  }
  me = r.me.em;
  sessionStorage.setItem(SK, me);
  page = 'dash';
  flash = null;
  lmsg = '';
  render();
});
const scrollTop = () => window.scrollTo({ top: 0 });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a,
    id = t.dataset.id,
    x = t.dataset.x;
  if (a == 'close') {
    if (e.target.id == 'mod') $('#mod').hidden = true;
    return;
  }
  if (!me) return;
  if (t.tagName == 'A' && t.getAttribute('href') == '#') e.preventDefault();
  const nav = fn => {
    fn();
    flash = null;
    render();
    scrollTop();
  };
  if (a == 'nav') return nav(() => goPage(t.dataset.p));
  if (a == 'sub') return nav(() => (sub[t.dataset.s] = t.dataset.p));
  if (a == 'go') return nav(() => goPage(t.dataset.p));
  if (a == 'user') return nav(() => ((page = 'users'), (sel = t.dataset.e), (pre = {})));
  if (a == 'users-all') return nav(() => (sel = null));
  if (a == 'aq') return nav(() => (aq = t.dataset.q));
  if (a == 'pickv') return nav(() => (goPage('asg'), (pre = { vehicle: id })));
  if (a == 'out') {
    ZAPI.logout();
    me = null;
    S = {};
    sessionStorage.removeItem(SK);
    return render();
  }
  if (a == 'doc') return showDoc(t.dataset.k, id, +t.dataset.j);
  if (a == 'csv') {
    if (!(full() || isC())) return;
    const q = v => '"' + String(v).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""') + '"',
      rows = [PH, ...S.pay.slice().reverse().map(p => [day(p.t), p.bid, p.kind, p.method, p.amount, p.ref, p.payer || '', p.collectedBy || '', p.status || ''])],
      l = document.createElement('a');
    l.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    l.download = 'zammove-ledger.csv';
    l.click();
    return;
  }
  let r, done = 'Saved.';
  if (a == 'app') r = RQ('appAction', { id, act: x, note: val(id + '-n'), reason: val(id + '-r'), when: val(id + '-w'), where: val(id + '-p') });
  else if (a == 'veh') (r = RQ('vehicleDecision', { id, act: x, reason: val(id + '-r') })), (done = x == 'approve' ? 'Vehicle approved.' : 'Vehicle rejected.');
  else if (a == 'asg') (r = RQ('assignDecision', { id, act: x, reason: val(id + '-r') })), (done = x == 'approve' ? 'Approved: the driver can now accept the vehicle.' : 'Request rejected.');
  else if (a == 'activate') (r = RQ('assignActivate', { id })), (done = 'Assignment activated.');
  else if (a == 'end') (r = RQ('assignEnd', { id, reason: val(id + '-e') })), (done = 'Assignment closed.');
  else if (a == 'assign') {
    const driver = t.dataset.e || val('ad'),
      vehicle = val('av');
    r = RQ('adminAssignVehicle', { vehicle, driver, pct: val('ap'), note: val('an') }).then(j => {
      if (j.ok) {
        done = j.self ? 'Done: the owner now drives their own vehicle.' : 'Offer sent: the driver accepts, both sign, then activate it here.';
        pre = {};
      }
      return j;
    });
  } else if (a == 'assignv') {
    r = RQ('adminAssignVehicle', { vehicle: id, driver: val('vd-' + id) }).then(j => {
      if (j.ok) done = j.self ? 'Done: the owner now drives their own vehicle.' : 'Offer sent to the driver.';
      return j;
    });
  } else if (a == 'ustat') (r = RQ('userStatus', { em: t.dataset.e, status: t.dataset.s, reason: val('st') })), (done = t.dataset.s == 'suspended' ? 'Account suspended.' : 'Account reactivated.');
  else if (a == 'revoke') (r = RQ('roleRevoke', { em: t.dataset.e, role: t.dataset.r, reason: val('rv-' + t.dataset.r) })), (done = 'Role revoked.');
  else if (a == 'ver') r = RQ('remitVerify', { id, recv: val(id + '-a'), note: val(id + '-n') });
  else if (a == 'res') r = RQ('remitResolve', { id, note: val(id + '-n'), adj: val(id + '-a') });
  else if (a == 'inc') r = RQ('incidentCase', { id, act: x, note: val(id + '-n') });
  else if (a == 'payv') r = RQ('payVerify', { id, ok: x == '1', note: val(id + '-pn') });
  else if (a == 'split') r = RQ('cfgSplit', { comm: val('comm'), drvPct: val('drv') });
  else if (a == 'tres') (r = RQ('tripResolve', { id, act: x, driver: val(id + '-drv'), refund: val(id + '-ref'), reason: val(id + '-why') })), (done = 'Decision recorded.');
  else if (a == 'tstop') (r = RQ('tripInterrupt', { id: val('stopb'), reason: val('stopw') })), (done = 'Trip stopped. Decide it under Interrupted trips.');
  else if (a == 'refund') (r = RQ('refundPaid', { id, method: val(id + '-rm'), ref: val(id + '-rr') })), (done = 'Refund recorded as sent.');
  else if (a == 'rates')
    (r = RQ('cfgRates', { rates: Object.fromEntries((S.fleet.HV || []).map(v => [v.id, { base: val('rb-' + v.id), km: val('rk-' + v.id) }])) })), (done = 'Fares saved.');
  else if (a == 'cash') (r = RQ('cfgCash', { cap: val('cap') })), (done = 'Cash limit saved.');
  else if (a == 'stf') r = RQ('staffAdd', { em: val('se'), role: val('sr') || ($('#f-sr') || {}).value });
  else if (a == 'unstf') r = RQ('staffRevoke', { em: t.dataset.e, k: t.dataset.k });
  if (r) {
    t.disabled = true;
    r = await r;
    flash = r.ok ? { t: done, good: true } : { t: r.err || 'Something went wrong.' };
    render();
  }
});
/* another tab changed the data: refresh, unless the user is typing (then offer a refresh chip) */
const busyTyping = () => {
  const a = document.activeElement;
  return !!a && (['TEXTAREA', 'SELECT'].includes(a.tagName) || (a.tagName == 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'file', 'range', 'reset'].includes(a.type)));
};
setInterval(async () => {
  if (!me || !ZAPI.token() || document.hidden) return;
  const v0 = ZAPI.version(),
    j = await ZAPI.refresh();
  if (!j.ok || j.state.version === v0) return;
  if (!busyTyping() && !($('#wsm') && $('#wsm').open)) {
    const c = $('#zsync');
    if (c) c.remove();
    return render();
  }
  if ($('#zsync')) return;
  const c = document.createElement('button');
  c.id = 'zsync';
  c.type = 'button';
  c.textContent = 'Data updated – refresh';
  c.className = 'btn';
  c.onclick = () => {
    c.remove();
    render();
  };
  document.body.appendChild(c);
}, 10000);
render();
if (me && ZAPI.token()) ZAPI.refresh().then(render);
