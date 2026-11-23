/**
 * 02-upgrade.js — customer features on top of 01-core.
 *
 * - Every customer action that changes data calls the server (ZAPI.act / ZAPI.auth): signup, login,
 *   password reset, account verification, profile, booking, GCash proof, cancel, review, incident,
 *   rental request, rental payment and cancellation.
 * - Extends the screens: booking map picker and photo, payment history and receipts, rental details
 *   and "Before you rent", the driver and vehicle card on bookings and Track, incident reports.
 */
const DC = { ZAM10: 0.1, WELCOME: 0.05 },
  DEP = 5000, // minimum rental deposit; each vehicle can ask more (S.rentList[].dep)
  RF = ['Pending', 'Approved', 'Active', 'Returned', 'Completed'],
  IS = ['Submitted', 'Under review', 'Resolved'],
  DRV = [
    { n: 'Juan Dela Cruz', ph: '09171230001', c: 'White', pl: 'ABC 1234', r: 4.8 },
    { n: 'Ramon Santos', ph: '09171230002', c: 'Silver', pl: 'XYZ 5678', r: 4.7 },
    { n: 'Ali Hassan', ph: '09171230003', c: 'Blue', pl: 'DEF 9012', r: 4.9 },
  ],
  MD = {
    tw: 'Bajaj RE / Piaggio Ape cargo',
    pk: 'Isuzu D-Max Pickup',
    l3: 'Mitsubishi L300',
    cv: 'Isuzu Elf Closed Van',
    w6: 'Fuso Fighter 6-Wheeler',
  };
const drvOf = b => {
  if (b.drvUser) {
    const u = S.users.find(x => x.em == b.drvUser) || {},
      v = (S.vh || []).find(x => x.id == b.veh) || {};
    return {
      n: u.name || b.drv || 'Driver',
      ph: u.ph || '',
      c: ((v.brand || '') + ' ' + (v.model || '')).trim(),
      pl: v.plate || '',
      r: 'New',
      em: b.drvUser,
    };
  }
  return DRV[[...b.id].reduce((s, c) => s + c.charCodeAt(0), 0) % 3];
};
const rt = d => {
  const r = d.em && (S.ratings || {})[d.em];
  return r
    ? r.avg.toFixed(1) + ' (' + r.n + ' review' + (r.n > 1 ? 's' : '') + ')'
    : d.em
      ? 'No reviews yet'
      : d.r + ' (sample)';
};
const toast = t => {
  let d = $('#toast');
  if (!d) {
    d = document.createElement('div');
    d.id = 'toast';
    document.body.appendChild(d);
  }
  d.textContent = t;
  d.className = 'on';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (d.className = ''), 2600);
};
const img = (f, cb) => {
  if (!f) return cb('');
  const r = new FileReader();
  r.onload = () => {
    const i = new Image();
    i.onload = () => {
      const k = Math.min(1, 420 / i.width),
        c = document.createElement('canvas');
      c.width = i.width * k;
      c.height = i.height * k;
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.55));
    };
    i.onerror = () => cb('');
    i.src = r.result;
  };
  r.readAsDataURL(f);
};
const pimg = id => new Promise(r => img($('#' + id)?.files[0], r));
const coord = t => {
  const x = PL.find(p => p[0] == t);
  if (x) return [x[1], x[2]];
  const m = (t || '').match(/\((-?\d+\.\d+), (-?\d+\.\d+)\)/);
  return m ? [+m[1], +m[2]] : null;
};
const hv = (a, b) => {
  const r = Math.PI / 180,
    x = (b[0] - a[0]) * r,
    y = (b[1] - a[1]) * r,
    h = Math.sin(x / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const autoKm = () => {
  const k = $('#km');
  if (!k) return;
  const a = coord(val('pu')),
    b = coord(val('dr')),
    n = a && b ? (window.ZMAP && ZMAP.km(a, b)) || Math.max(1, Math.ceil(hv(a, b) * 1.3)) : 0; // road km from OpenStreetMap routing when known
  if (+k.value != n) {
    k.value = n;
    upd();
  }
};
setInterval(() => {
  if (view == 'book') autoKm();
}, 700);
const needV = () => {
  const u = S.users.find(x => x.em == S.me.em);
  return u && !u.ver ? 'Verify your account first (see the banner on Home).' : '';
};
const done = b => ['Completed', 'Cancelled', 'Rejected'].includes(b.st),
  dur = k => Math.ceil(2 + k / 20) * 36e5,
  t0 = b => new Date(b.dt + 'T' + b.tm).getTime();
const when = t => (t ? new Date(t).toLocaleString() : '—');

est = function () {
  const v = HV.find(x => x.id === sel.v),
    km = +($('#km')?.value || 0),
    mv = +($('#mv')?.value || 0),
    dist = Math.round(km * v.km * 100) / 100,
    mov = mv * 500,
    sub = v.base + dist + mov,
    fee = Math.round(sub * 0.05),
    disc = Math.round(sub * (DC[val('dc').toUpperCase()] || 0)),
    tot = sub + fee - disc;
  return { v, km, mv, dist, mov, fee, disc, tot };
};
window.upd = function () {
  const e = est(),
    b = $('#ebox'),
    c = val('dc');
  if (!b) return;
  b.innerHTML = `<div class="row"><span>${e.v.n} base</span><span>${peso(e.v.base)}</span></div><div class="row"><span>Distance ${e.km} km × ${peso(e.v.km)}</span><span>${peso(e.dist)}</span></div><div class="row"><span>Movers × ${e.mv}</span><span>${peso(e.mov)}</span></div><div class="row"><span>Service fee (5%)</span><span>${peso(e.fee)}</span></div>${e.disc ? `<div class="row"><span>Discount (${esc(c.toUpperCase())})</span><span>−${peso(e.disc)}</span></div>` : ''}<div class="row tot"><span>Estimated total</span><span class="pr">${peso(e.tot)}</span></div><div class="row mu"><span>Down payment (50%)</span><span>${peso(e.tot / 2)}</span></div>${c && !e.disc ? '<div class="err">Invalid discount code.</div>' : ''}`;
};

/* auth: terms, show password, forgot password, verification */
const _av = authView;
authView = function (m) {
  if (m == 'fg')
    return `<div class="auth card"><h1>Reset password</h1><p class="mu">${msg.fc ? 'Enter the code and a new password.' : 'Enter your account email and date of birth.'}</p><form onsubmit="return false" novalidate>${msg.fc ? `<label>Verification code</label><input id="fcd" inputmode="numeric"><label>New password</label><input id="np" type="password" autocomplete="new-password"><label class="chk"><input type="checkbox" data-a="showpw"> Show password</label>` : `<label>Email</label><input id="em" type="email"><label>Date of birth</label><input id="fdb" type="date">`}<div class="err">${esc(msg.auth || '')}</div>${msg.fm ? `<div class="ok">${msg.fm}</div>` : ''}<div style="margin-top:12px;display:flex;gap:8px;align-items:center"><button class="btn" data-a="${msg.fc ? 'fgset' : 'fgsend'}">${msg.fc ? 'Set new password' : 'Send code'}</button><a href="#" class="mu" data-a="swap" data-m="in">Back to log in</a></div></form><div class="note">Demo: no email or SMS service is connected, so the code is shown here instead of being sent.</div></div>`;
  const sp =
    '<label class="chk"><input type="checkbox" data-a="showpw"> Show password</label>' +
    (m == 'up'
      ? '<label class="chk"><input type="checkbox" id="tc"> I agree to the Terms of Service and Privacy Policy</label>'
      : '<a href="#" class="mu" data-a="forgot" style="font-size:14px">Forgot password?</a>');
  return _av(m).replace('<div class="err" id="er">', sp + '<div class="err" id="er">');
};
const vbox = () => {
  const u = S.users.find(x => x.em == S.me.em);
  if (!u || u.ver) return '';
  return `<div class="card" style="margin-bottom:14px"><h2>Verify your account</h2><p class="mu" style="margin:0 0 8px">Enter the 6-digit code sent to ${esc(u.ph || 'your phone')} and ${esc(u.em)}.</p><div class="note">Demo: no SMS or email service is connected, so your code is <b>${esc(u.code || '(ask staff)')}</b>. Bookings and rentals unlock after verification.</div><div style="display:flex;gap:8px"><input id="vc" inputmode="numeric" placeholder="6-digit code" style="max-width:200px"><button class="btn" data-a="verify">Verify</button></div><div class="err">${esc(msg.vm || '')}</div></div>`;
};
const _home = home;
home = () => vbox() + _home();

/* booking: map picker, auto distance, photo, discount, confirm step */
const mapSvg = () => {
  const X = l => 10 + ((l - 121.99) / 0.18) * 380,
    Y = l => 250 - ((l - 6.89) / 0.16) * 240;
  return `<div class="mp" style="margin-top:10px"><svg viewBox="0 0 400 260" role="img" aria-label="Zamboanga City location picker" style="background:var(--s2)"><g style="fill:var(--ac2)">${PL.map((p, i) => (p[1] > 6.89 && p[1] < 7.05 && p[2] > 121.99 && p[2] < 122.17 ? `<circle data-a="mp" data-id="${i}" cx="${X(p[2]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="6" style="cursor:pointer;stroke:var(--s);stroke-width:1.5"><title>${esc(p[0])}</title></circle>` : '')).join('')}</g></svg></div><div class="mu" style="font-size:12px;margin-top:4px">Map picker: tap a pin to set pickup, then drop-off (hover or long-press for the name).</div>`;
};
const _bk = book;
book = () =>
  _bk()
    .replace(
      /<label>Estimated distance \(km\)<\/label>.*?for now\.<\/div>/s,
      '<label>Distance (km, automatic)</label><input id="km" type="number" readonly value="0"><div class="mu" style="font-size:12px">Road distance from OpenStreetMap routing (OSRM). If routing is unavailable, a straight-line estimate × 1.3 is used.</div>' +
        mapSvg()
    )
    .replace(
      'placeholder="Fragile items, stairs, etc."></textarea>',
      'placeholder="Fragile items, stairs, etc."></textarea><label>Cargo photo (optional)</label><input id="cp" type="file" accept="image/*"><label>Discount code</label><input id="dc" placeholder="Enter a code if you have one" autocomplete="off" oninput="upd()"><label class="chk"><input type="checkbox" id="lc"> I confirm the pickup and drop-off locations</label>'
    );

/* bookings: Active / Past / Payments, date filter, payment history, receipts */
const receipt = p =>
  `<div class="card rcpt" style="margin-bottom:14px"><h2>ZamMove payment receipt</h2>${[
    ['Reference', p.ref],
    ['Booking / rental', p.bid],
    ['Type', p.kind],
    ['Method', p.method],
    ['Date', when(p.t)],
    ['Status', p.status],
    ['Amount', peso(p.amount)],
  ]
    .map(x => `<div class="row"><span class="mu">${x[0]}</span><b>${esc(x[1])}</b></div>`)
    .join(
      ''
    )}${p.pf ? `<img src="${p.pf}" alt="Proof of payment" style="max-width:160px;border-radius:12px">` : ''}<div class="mu" style="font-size:12px">Prototype receipt, not an official receipt.</div><div class="noprint" style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" data-a="prt">Print</button><button class="btn o sm" data-a="rcx">Close</button></div></div>`;
const pays = () => {
  const l = S.pay.slice().reverse(),
    rc = S.pay.find(p => p.ref == msg.rc);
  return (
    (rc ? receipt(rc) : '') +
    `<div class="card"><div class="row"><h2 style="margin:0">Payment history</h2><b class="pr">${peso(ZPAY.total(l))} confirmed</b></div><div class="note">A GCash proof you submit stays <b>Submitted</b> until the driver (bookings) or a cashier (rentals and deposits) confirms it. Only confirmed payments count as paid. Customers cannot confirm their own payments.</div>${l.length ? l.map(p => `<div class="row" style="border-top:1px solid var(--bd);align-items:center"><div><b>${esc(p.ref)}</b><div class="mu" style="font-size:13px">${p.bid} · ${p.kind} · ${p.method} · ${when(p.t)}</div></div><div style="text-align:right"><b>${peso(p.amount)}</b><div><span class="tag">${p.status}</span> <a class="mu" data-a="rc" data-id="${esc(p.ref)}" style="cursor:pointer;font-size:13px">Receipt</a></div></div></div>`).join('') : '<div class="empty">No payments yet.</div>'}</div>`
  );
};
bookings = function () {
  const tab = msg.bt || 'act',
    q = (msg.q || '').toLowerCase(),
    f = msg.f || '',
    d = msg.df || '';
  const l = S.bk
    .slice()
    .reverse()
    .filter(
      b =>
        (tab == 'act') != done(b) &&
        (!f || b.st == f) &&
        (!q || (b.id + b.pu + b.dr).toLowerCase().includes(q)) &&
        (!d || b.dt == d)
    );
  return (
    `<h1>My bookings</h1>${dlog()}<div class="seg" style="margin:10px 0">${[
      ['act', 'Active'],
      ['past', 'Past'],
      ['pay', 'Payments'],
    ]
      .map(
        x => `<button class="sgb ${tab == x[0] ? 'on' : ''}" data-a="bt" data-v="${x[0]}">${x[1]}</button>`
      )
      .join('')}</div>` +
    (tab == 'pay'
      ? pays()
      : `<div class="note">Cancellation policy: free while Pending; a 10% fee of the total applies once a driver has accepted. Completed trips cannot be cancelled.</div><div class="grid g3" style="margin:10px 0"><input placeholder="Search by ref or address" value="${esc(msg.q || '')}" data-a="q"><select data-a="f"><option value="">All statuses</option>${[...FLOW, 'No driver found', 'Rejected', 'Cancelled'].map(s => `<option ${f == s ? 'selected' : ''}>${s}</option>`).join('')}</select><input type="date" data-a="df" value="${d}" aria-label="Filter by pickup date"></div>${l.length ? l.map(bcard).join('') : '<div class="card empty">No bookings found.</div>'}`)
  );
};
const _bc = bcard;
bcard = function (b) {
  const d = b.drv ? drvOf(b) : null,
    x = `<div class="mu" style="font-size:13px;margin-top:6px">Booked on ${b.cr ? new Date(b.cr).toLocaleDateString() : '—'} · Pickup ${b.dt}${b.si ? '<br>Instructions: ' + esc(b.si) : ''}${b.disc ? '<br>Discount applied: −' + peso(b.disc) : ''}${b.cf ? '<br>Cancellation fee: ' + peso(b.cf) : ''}</div>${b.ph ? `<img src="${b.ph}" alt="Cargo photo" style="max-width:140px;border-radius:12px;margin-top:8px">` : ''}`;
  return _bc(b)
    .replace('(★4.8)', d ? '(★' + rt(d) + ')' : '')
    .replace('<div class="row mu"><span>Down: ', x + '<div class="row mu"><span>Down: ')
    .replace(
      /<input id="rt([^"]+)" placeholder="Write a review">/,
      '<input id="rt$1" placeholder="Driver comment"><input id="sv$1" placeholder="Service feedback (app, pricing, support)" style="margin-top:6px">'
    );
};
const _pf = payform;
payform = (b, k) =>
  _pf(b, k).replace(
    '<button class="btn sm"',
    '<label>Proof of payment (photo, optional)</label><input type="file" accept="image/*" id="pp' +
      b.id +
      '"><button class="btn sm"'
  );
const _tr = track;
track = function () {
  const h = _tr(),
    b =
      S.bk
        .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
        .reverse()
        .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed'))
        .find(x => x.id == msg.tid) ||
      S.bk
        .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
        .reverse()
        .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed'))[0];
  if (!b || !b.drv) return h;
  const d = drvOf(b);
  return h
    .replace('<b>' + esc(b.drv) + '</b>', '<b>' + d.n + '</b>')
    .replace(
      /4\.9 rating \(sample\)<br>[^<]*?Plate ABC 1234 \(sample\)/,
      rt(d) +
        '<br>' +
        (b.drvUser ? b.vn : MD[b.vid] || b.vn) +
        ' · ' +
        d.c +
        ' · Plate ' +
        d.pl +
        '<br>' +
        d.ph
    )
    .replace(
      "<button class='btn o' style='flex:1' data-a='soon'>Call</button>",
      `<a class='btn o' style='flex:1' href='tel:${d.ph}'>Call</a>`
    );
};

/* driver and vehicle details for the customer, once a driver has accepted (public profile only) */
const drvCard = (b, plain) => {
  if (!b.drvUser) return '';
  const u = S.users.find(x => x.em == b.drvUser) || {},
    v = (S.vh || []).find(x => x.id == b.veh) || {},
    r = (S.ratings || {})[b.drvUser],
    live = !done(b),
    ty = HV.find(h => h.id == (v.type || b.vid)) || {},
    row = (k, x) => `<div class="vz-i"><span class="mu">${k}</span><span>${x}</span></div>`;
  return `<div class="${plain ? '' : 'vz-bc'}"><b>Your driver and vehicle</b><div style="display:flex;gap:12px;align-items:center;margin:10px 0 6px"><span class="zav">${esc(initials(u.name || b.drv))}</span><div style="flex:1;min-width:0"><b style="font-weight:600">${esc(u.name || b.drv)}</b> <span class="tag g">Verified driver</span>
 <div class="mu" style="font-size:13px">${r ? '★ ' + r.avg.toFixed(1) + ' (' + r.n + ' review' + (r.n > 1 ? 's' : '') + ')' : 'No reviews yet'} · ${u.trips || 0} completed trip${u.trips == 1 ? '' : 's'}${u.since ? ' · Driver since ' + new Date(u.since).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : ''}</div></div>${live && u.ph ? `<a class="btn o sm" href="tel:${esc(u.ph)}">Call</a>` : ''}</div>
 ${live && u.ph ? row('Phone', `<span class="n">${esc(u.ph)}</span>`) : ''}${row('Vehicle', esc([v.brand, v.model].filter(Boolean).join(' ') || b.vn) + (v.year ? ' (' + esc(v.year) + ')' : ''))}${row('Plate number', `<b class="n">${esc(v.plate || '—')}</b>`)}${row('Color', esc(v.color || 'Not recorded'))}${row('Type · capacity', esc((ty.n || b.vn) + (v.cap || ty.cap ? ' · ' + (v.cap || ty.cap) : '')))}
 ${v.desc ? `<p class="mu" style="font-size:13px;margin:6px 0 0">Owner’s note: ${esc(v.desc)}</p>` : ''}${live ? '<p class="mu" style="font-size:12px;margin:6px 0 0">Check the plate and color before loading. The driver also verifies the plate in the app before departure.</p>' : ''}</div>`;
};
const _bcD = bcard;
bcard = function (b) {
  const h = _bcD(b);
  return b.drvUser && !['Cancelled', 'Rejected'].includes(b.st)
    ? h.replace(
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">',
        drvCard(b) + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
      )
    : h;
};
const _trD = track;
track = function () {
  const h = _trD(),
    act = S.bk
      .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
      .reverse()
      .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed')),
    b = act.find(x => x.id == msg.tid) || act[0];
  if (!b || !b.drvUser) return h;
  return h.replace(
    /<div class='card'><div style='display:flex;align-items:center;gap:12px'><div class='av'>[\s\S]*?data-a='soon'>Chat<\/button><\/div><\/div>/,
    `<div class='card'>${drvCard(b, true)}</div>`
  );
};
/* self-drive vehicle details and what to know before renting */
const rvd = () => {
  const v = RV.find(x => x.id == sel.rv);
  if (!v)
    return '<p class="mu" style="margin-top:12px">Select a vehicle to see its color, year, features and rental notes.</p>';
  const row = (k, x) =>
    `<div class="vz-i"><span class="mu">${k}</span><span style="text-align:right">${esc(x)}</span></div>`;
  return `<div class="vz-g" style="margin-top:12px"><b>${esc(v.n)} details</b>${row('Color', v.color || '—')}${row('Model year', v.year || '—')}${row('Transmission', v.trans || '—')}${row('Fuel', v.fuel || '—')}${row('Seats', v.seats || '—')}${row('Luggage', v.bags || '—')}${row('Daily rate', peso(v.day))}${(v.features || []).length ? row('Features', v.features.join(' · ')) : ''}${v.notes ? `<p class="mu" style="margin:8px 0 0;font-size:14px">${esc(v.notes)}</p>` : ''}</div>
 <div class="vz-g"><b>Before you rent</b><ul style="margin:6px 0 0;padding-left:20px;color:var(--tx2);font-size:14px;line-height:1.6"><li>Your driver’s license must be valid until the return date. Bring it and the ID you upload here.</li><li>A refundable deposit of ${peso(DEP)} is paid before release and returned after the return inspection.</li><li>Pickup and return are within Zamboanga City only.</li><li>Staff approve the request before release. You can cancel while it is Pending or Approved.</li><li>At pickup, check that the color and condition match this listing and point out any existing damage to staff.</li></ul></div>`;
};
/* incidents */
const _rp = reports;
reports = function () {
  S.inc.forEach(r => {
    r.id = r.id || rid('IN');
  });
  const h = _rp(),
    i = h.indexOf('<div class="card"><h2>Your reports</h2>'),
    mine = S.inc.slice().reverse();
  return (
    h
      .slice(0, i)
      .replace('<option>Other</option>', '<option>Missing items</option><option>Other</option>')
      .replace(
        /<div class="mu" style="font-size:12px">Photo evidence.*?<\/div>/,
        '<label>Severity</label><select id="isv"><option>Low</option><option>Medium</option><option>High</option></select><label>Photo evidence (optional)</label><input id="ip" type="file" accept="image/*">'
      ) +
    `<div class="card"><h2>Your reports</h2>${mine.length ? mine.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><b>${r.cat}</b> <span class="tag ${r.sev == 'High' ? 'r' : ''}">${r.sev || 'Low'}</span> <span class="tag g">${r.st}</span><div class="mu" style="font-size:13px">${r.id} · ${r.bid} · ${esc(r.d)}<br>The ZamMove team reviews every report and updates its status here.</div>${r.ph ? `<img src="${r.ph}" alt="Evidence" style="max-width:120px;border-radius:10px;margin-top:6px">` : ''}</div>`).join('') : '<div class="empty">No reports.</div>'}</div></div></div>`
  );
};

/* self-drive rental */
const rpaid = r => ZPAY.sum(r.id),
  rpend = r => ZPAY.pending(r.id),
  rbal = r => ZPAY.r2(r.tot + DEP - rpaid(r)),
  ua = () => {
    const l = (S.rnAvail || []).filter(
      r => r.vid == sel.rv && ['Pending', 'Approved', 'Active'].includes(r.st)
    );
    return sel.rv
      ? `<div class="note">${l.length ? 'Unavailable dates: ' + l.map(r => r.s + ' → ' + r.e).join(', ') : 'No booked dates for this vehicle yet.'}</div>`
      : '';
  };
rent = function () {
  const mine = S.rn.slice().reverse(),
    today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  return `<h1>Self-drive rental</h1><p class="mu">Rent a vehicle without a driver. Pickup and return are limited to Zamboanga City. A refundable deposit of ${peso(DEP)} applies.</p><div class="grid g2"><div class="card">
<div class="grid g3" style="gap:8px">${RV.map(v => `<div class="veh ${sel.rv == v.id ? 'on' : ''}" data-a="pickr" data-id="${v.id}"><div class="vi">${ico(VI[v.id], 26)}</div><b>${v.n}</b><div class="mu" style="font-size:12px">${v.sp}</div><div class="pr">${peso(v.day)}/day</div></div>`).join('')}</div><div id="ua">${ua()}</div><div id="rvd">${rvd()}</div>
<div class="grid g2" style="gap:8px"><div><label>Start date</label><input id="rs" type="date" min="${today}"></div><div><label>End date</label><input id="re" type="date" min="${today}"></div></div>
<label>Pickup location</label><div class="ac"><input id="rp" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rp" hidden></div></div><button type="button" class="btn o sm" style="margin-top:8px" data-a="loc" data-f="rp" data-m="lm2">${ico('pin', 16)} Use my current location</button><div class="mu" id="lm2" style="font-size:12px;margin-top:4px"></div><label>Return location</label><div class="ac"><input id="rr" data-a="ac" autocomplete="off" placeholder="Search a place in Zamboanga City"><div class="sug" id="s-rr" hidden></div></div><label>Driver’s license number</label><input id="rl"><label>License expiry</label><input id="rx" type="date">
<label>Photo of valid ID</label><input id="ri" type="file" accept="image/*"><label>Photo of driver’s license</label><input id="rlp" type="file" accept="image/*">
<div class="note">Total = daily rate × days + ${peso(DEP)} refundable deposit. Staff approve the request before the vehicle is released.</div><div class="err" id="er">${esc(msg.rn || '')}</div><button class="btn" data-a="submitrn">Submit rental request</button></div>
<div class="card"><h2>Rental history</h2>${
    mine.length
      ? mine
          .map(r => {
            const bal = rbal(r),
              i = RF.indexOf(r.st),
              stop = ['Cancelled'].includes(r.st);
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><b>${esc(r.vn)}</b> <span class="tag ${stop ? 'r' : 'g'}">${r.st}</span><div class="mu" style="font-size:13px">${r.s} → ${r.e} (${r.days} days) · Ref ${r.id}<br>Rental ${peso(r.tot)} + deposit ${peso(DEP)} · Verified paid ${peso(rpaid(r))}${rpend(r) ? ' · ' + peso(rpend(r)) + ' waiting for cashier' : ''} · <b>Balance ${peso(Math.max(0, bal))}</b></div>${stop ? '' : `<div class="steps">${RF.map((s, j) => `<span class="st ${j <= i ? 'd' : ''}">${s}</span>`).join('')}</div>`}
${!stop && r.st != 'Completed' && bal - rpend(r) > 0.005 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><input id="rpa${r.id}" type="number" placeholder="Amount" style="flex:1;min-width:100px"><select id="rpm${r.id}" style="flex:1;min-width:100px"><option>GCash</option><option>Cash</option></select><input id="rpr${r.id}" inputmode="numeric" placeholder="GCash ref (GCash only)" style="flex:1;min-width:140px"><button class="btn sm" data-a="rnpay" data-id="${r.id}">Submit payment</button></div><div class="mu" style="font-size:12px">The first ${peso(DEP)} goes to the deposit. A payment counts once a cashier verifies it.</div>` : ''}
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${['Pending', 'Approved'].includes(r.st) ? `<button class="btn d sm" data-a="rncan" data-id="${r.id}">Cancel</button>` : ''}</div>${r.st == 'Completed' ? '<div class="ok">Completed. Deposit refunded (simulated).</div>' : ''}${msg['e' + r.id] ? `<div class="err">${esc(msg['e' + r.id])}</div>` : ''}</div>`;
          })
          .join('')
      : '<div class="empty">No rentals yet.</div>'
  }</div></div>`;
};

/* profile stats, my reviews, help and terms */
const _st = settings;
settings = function () {
  const my = S.rev.slice().reverse(),
    dn = S.bk.filter(b => b.st == 'Completed').length,
    sp = ZPAY.total(),
    av = my.length ? (my.reduce((s, r) => s + r.r, 0) / my.length).toFixed(1) : '—';
  return (
    _st() +
    `<div class="grid g2" style="margin-top:14px"><div class="card"><h2>My activity</h2><div class="row"><span>Bookings</span><b>${S.bk.length}</b></div><div class="row"><span>Completed</span><b>${dn}</b></div><div class="row"><span>Rentals</span><b>${S.rn.length}</b></div><div class="row"><span>Amount paid (confirmed)</span><b>${peso(sp)}</b></div><div class="row"><span>My average rating given</span><b>${av}${my.length ? ' ★' : ''}</b></div></div>
<div class="card"><h2>My reviews</h2>${
      my.length
        ? my
            .map(r => {
              const b = S.bk.find(x => x.id == r.bid),
                d = b && b.drv ? drvOf(b) : null;
              return `<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><b>${'★'.repeat(r.r)}${'☆'.repeat(5 - r.r)}</b> ${d ? d.n : ''}<div class="mu" style="font-size:13px">${r.bid} · ${esc(r.t)}${r.sv ? '<br>Service: ' + esc(r.sv) : ''}</div></div>`;
            })
            .join('')
        : '<div class="empty" style="padding:16px">No reviews yet.</div>'
    }</div></div>
<div class="faq" style="margin-top:14px"><details><summary>Cancellation policy</summary><p>Free while a booking is Pending. After a driver accepts, a 10% fee of the total applies. Rental requests can be cancelled before they become Active.</p></details></div>`
  );
};

/* handlers (capture phase, run before the base handlers). Anything that changes data is a server action (backend/src/domain). */
const MY = new Set([
  'bt',
  'rc',
  'rcx',
  'prt',
  'mp',
  'verify',
  'forgot',
  'fgsend',
  'fgset',
  'rncan',
  'rnpay',
  'submitinc',
  'submitrn',
  'login',
  'signup',
  'cancel',
  'review',
  'pay',
  'submitbk',
  'saveprof',
]);
const busyBtn = t => {
  t.disabled = true;
  t.classList.add('is-busy');
  return () => {
    t.disabled = false;
    t.classList.remove('is-busy');
  };
};
document.addEventListener(
  'click',
  async e => {
    const t = e.target.closest('[data-a]');
    if (!t || t.tagName == 'INPUT' || t.tagName == 'SELECT') return;
    const a = t.dataset.a,
      id = t.dataset.id;
    if (a == 'pickr')
      return setTimeout(() => {
        const u = $('#ua');
        if (u) u.innerHTML = ua();
        const d = $('#rvd');
        if (d) d.innerHTML = rvd();
      });
    if (!MY.has(a)) return;
    e.stopPropagation();
    e.preventDefault();
    if (a == 'bt') {
      msg.bt = t.dataset.v;
      return render();
    }
    if (a == 'rc') {
      msg.rc = id;
      return render();
    }
    if (a == 'rcx') {
      msg.rc = '';
      return render();
    }
    if (a == 'prt') return window.print();
    if (a == 'mp') {
      const p = PL[+id],
        pu = $('#pu'),
        dr = $('#dr');
      if (!pu.value || dr.value) {
        pu.value = p[0];
        dr.value = '';
        toast('Pickup: ' + p[0]);
      } else {
        dr.value = p[0];
        toast('Drop-off: ' + p[0]);
      }
      return autoKm();
    }
    if (a == 'forgot') {
      msg = { mode: 'fg' };
      return render();
    }
    if (a == 'fgsend') {
      const em = val('em').toLowerCase(),
        r = await ZAPI.auth('forgot', { em, dob: val('fdb') });
      if (!r.ok) {
        msg.auth = r.err;
        return render();
      }
      msg.fe = em;
      msg.fc = 1;
      msg.auth = '';
      msg.fm = 'Demo code (no SMS or email service is connected): ' + r.demoCode;
      return render();
    }
    if (a == 'fgset') {
      const r = await ZAPI.auth('reset', { em: msg.fe, code: val('fcd'), pw: val('np') });
      if (!r.ok) {
        msg.auth = r.err;
        return render();
      }
      msg = { mode: 'in' };
      toast('Password updated. Please log in.');
      return render();
    }
    if (a == 'login') {
      const r = await ZAPI.auth('login', { em: val('em'), pw: val('pw') });
      if (!r.ok) {
        msg.auth = r.err;
        return render();
      }
      S.me = r.me;
      S.ws = 'customer';
      msg = {};
      save();
      return render();
    }
    if (a == 'signup') {
      const er = m => {
        msg.auth = m;
        const x = $('#er');
        if (x) x.textContent = m;
      };
      if (!$('#tc')?.checked) return er('Please accept the Terms and Privacy Policy.');
      if (val('pw') !== val('pw2')) return er('Passwords do not match.');
      const r = await ZAPI.auth('signup', {
        name: val('fn'),
        dob: val('db'),
        ph: val('ph'),
        ad: val('ad'),
        em: val('em'),
        pw: val('pw'),
        terms: true,
      });
      if (!r.ok) return er(r.err);
      S.me = r.me;
      S.ws = 'customer';
      msg = {};
      view = 'home';
      save();
      return render();
    }
    if (a == 'verify') {
      const r = await ZAPI.act('verifyAccount', { code: val('vc') });
      msg.vm = r.ok ? '' : r.err;
      if (r.ok) toast('Account verified');
      return render();
    }
    if (a == 'saveprof') {
      const r = await ZAPI.act('saveProfile', { name: val('sn'), ph: val('sp'), ad: val('sa') });
      if (!r.ok) {
        $('#sme').textContent = r.err;
        return;
      }
      S.me = r.me;
      save();
      msg.sok = 'Profile saved.';
      return render();
    }
    if (a == 'cancel') {
      const b = S.bk.find(x => x.id == id);
      if (!b) return;
      const fee = cancelFee(b);
      if (fee && msg.cf != id) {
        msg.cf = id;
        toast('A cancellation fee of ' + peso(fee) + ' applies. Tap Cancel again to confirm.');
        return;
      }
      msg.cf = 0;
      const r = await ZAPI.act('cancelBooking', { id });
      if (!r.ok) toast(r.err);
      else toast('Booking cancelled');
      return render();
    }
    if (a == 'review') {
      const n = msg['n' + id];
      if (!n) {
        msg['r' + id] = 'Choose a star rating.';
        return render();
      }
      const r = await ZAPI.act('review', { id, r: n, t: val('rt' + id), sv: val('sv' + id) });
      msg['r' + id] = r.ok ? '' : r.err;
      if (r.ok) toast('Thanks for your review');
      return render();
    }
    if (a == 'pay') {
      const done = busyBtn(t),
        pf = await pimg('pp' + id),
        r = await ZAPI.act('submitProof', {
          id,
          kind: t.dataset.k,
          amount: val('pg' + id),
          ref: val('pr' + id),
          pf,
        });
      done();
      msg['b' + id] = r.ok ? '' : r.err;
      if (r.ok) toast('GCash proof submitted');
      return render();
    }
    if (a == 'submitbk') {
      const er = m => {
        msg.bk = m;
        const x = $('#er2');
        if (x) {
          x.textContent = m;
          x.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };
      if (!$('#lc') || !$('#lc').checked) return er('Please confirm the pickup and drop-off locations.');
      const done = busyBtn(t),
        ph = await pimg('cp'),
        r = await ZAPI.act('createBooking', {
          pu: val('pu'),
          dr: val('dr'),
          dt: val('dt'),
          tm: val('tm'),
          vid: sel.v,
          mv: +(($('#mv') || {}).value || 0),
          it: val('it'),
          si: val('si'),
          dc: val('dc'),
          ph,
        });
      done();
      if (!r.ok) return er(r.err);
      msg = {};
      toast('Booking request submitted');
      view = 'bookings';
      location.hash = 'bookings';
      return render();
    }
    if (a == 'submitinc') {
      const sev = val('isv'),
        done = busyBtn(t),
        ph = await pimg('ip'),
        r = await ZAPI.act('createIncident', {
          bid: val('ib'),
          cat: val('ic'),
          sev,
          w: val('iw'),
          d: val('id'),
          ph,
        });
      done();
      msg.inc = r.ok ? '' : r.err;
      if (r.ok) {
        msg.ib = '';
        toast(sev == 'High' ? 'High severity report submitted. Staff were notified.' : 'Report submitted');
      }
      return render();
    }
    if (a == 'submitrn') {
      const done = busyBtn(t),
        ip = await pimg('ri'),
        lp = await pimg('rlp'),
        r = await ZAPI.act('createRental', {
          vid: sel.rv,
          s: val('rs'),
          e: val('re'),
          pu: val('rp'),
          rt: val('rr'),
          lic: val('rl'),
          exp: val('rx'),
          ip,
          lp,
        });
      done();
      if (!r.ok) {
        msg.rn = r.err;
        const x = $('#er');
        if (x) x.textContent = r.err;
        return;
      }
      msg = {};
      toast('Rental request submitted');
      return render();
    }
    if (a == 'rncan') {
      const r = await ZAPI.act('rentalCancel', { id });
      toast(r.ok ? 'Rental cancelled' : r.err);
      return render();
    }
    if (a == 'rnpay') {
      const r = await ZAPI.act('rentalPay', {
        id,
        amount: val('rpa' + id),
        method: val('rpm' + id),
        ref: val('rpr' + id),
      });
      msg['e' + id] = r.ok ? '' : r.err;
      if (r.ok) toast('Payment submitted. It counts once a cashier verifies it.');
      return render();
    }
  },
  true
);
document.addEventListener('change', e => {
  const a = e.target.dataset.a;
  if (a == 'showpw')
    ['pw', 'pw2', 'np'].forEach(i => {
      const x = $('#' + i);
      if (x) x.type = e.target.checked ? 'text' : 'password';
    });
  if (a == 'df') {
    msg.df = e.target.value;
    render();
  }
});
render();
