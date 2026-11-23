/* ===== 09-workspaces.js — Driver, Vehicle Owner, Cashier and Admin console workspaces, account hub, staff and owner setup (loaded last) =====
   Accounts hold several roles. Every action goes through ZW.api, which checks the acting user's approved roles and ownership. */
(() => {
  S.apps = S.apps || [];
  S.vh = S.vh || [];
  S.asg = S.asg || [];
  S.dp = S.dp || {};
  S.au = S.au || [];
  S.ws = S.ws || 'customer';
  S.wp = S.wp || {};
  const NOW = () => new Date().toISOString(),
    U = em => S.users.find(u => u.em == em),
    no = e => ({ ok: false, err: e }),
    yes = x => ({ ok: true, ...x });
  const rl = (u, t) => (t == 'customer' ? { t, st: 'approved' } : ((u && u.roles) || []).find(r => r.t == t)),
    okr = (u, t) => {
      const r = rl(u, t);
      return !!r && r.st == 'approved';
    },
    acct = u => !!u && u.status != 'suspended';
  const au = (who, evt, data) => S.au.push({ t: NOW(), who, evt, data: data || null }),
    fmt = t => (t ? new Date(t).toLocaleString() : '—'),
    norm = t =>
      String(t || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
  const ADM = {
      role: 'admin',
      get id() {
        return (S.me && S.me.em) || 'UNKNOWN';
      },
    },
    isA = a => !!(a && a.role == 'admin' && ['super', 'admin'].includes((U(a.id) || {}).adm));
  const DOCS = {
    driver: [
      'Professional driver’s license',
      'Government-issued ID',
      'NBI or police clearance',
      'Proof of address',
    ],
    owner: ['Government-issued ID', 'Proof of address', 'Business permit (if any)'],
  };
  const ST = [
    'Pending Review',
    'Under Verification',
    'Interview Scheduled',
    'Awaiting Additional Documents',
    'For Orientation',
    'Approved',
    'Rejected',
  ];
  const vOf = id => S.vh.find(v => v.id == id),
    asgOf = em => S.asg.find(a => a.driver == em && a.st == 'Active'),
    vAsg = id => S.asg.find(a => a.vehicle == id && a.st == 'Active'),
    dAv = em => (S.dp[em] || {}).avail || 'Unavailable';
  const ROAD = ['Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation'],
    onRoad = (em, ex) => S.bk.some(b => b.drvUser == em && b.id != ex && ROAD.includes(b.st));
  const tripOf = em => S.bk.filter(b => b.drvUser == em && !done(b)),
    ovl = (a, b) => {
      const x = t0(a),
        y = t0(b);
      return x < y + dur(b.km || 10) && y < x + dur(a.km || 10);
    };
  const vOper = v => !!v && v.approval == 'Approved' && v.status == 'Available';
  /* booking eligibility: the 7 rules, evaluated again at accept time */
  const chk = (em, b) => {
    const u = U(em),
      as = asgOf(em),
      v = as && vOf(as.vehicle);
    return [
      ['Your driver account is approved and active', okr(u, 'driver') && acct(u)],
      ['You have an approved vehicle assignment', !!as],
      ['Your vehicle is approved and operational', vOper(v)],
      [
        'Your vehicle is free for this schedule',
        !!v && !S.bk.some(x => x.id != b.id && x.veh == v.id && !done(x) && ovl(x, b)),
      ],
      [
        'You are set to Available and not in the middle of a trip',
        dAv(em) == 'Available' && !onRoad(em, b.id),
      ],
      [
        'Your vehicle type matches the booking (' + (HV.find(h => h.id == b.vid) || { n: b.vid }).n + ')',
        !!v && v.type == b.vid,
      ],
      [
        'You have no conflicting booking',
        !S.bk.some(x => x.id != b.id && x.drvUser == em && !done(x) && ovl(x, b)),
      ],
    ];
  };
  /* Every rule runs on the server (backend/src/domain/*). These are thin calls returning {ok, err};
   the server identifies the user from the login token, never from the email passed here. */
  const RQ = (n, p) => ZAPI.act(n, p);
  const API = {
    apply: (em, d) => RQ('apply', d),
    upload: (em, id, docs) => RQ('uploadDoc', { id, docs }),
    adm: (a, id, act, d = {}) => RQ('appAction', { id, act, ...d }),
    avail: (em, s) => RQ('setAvail', { s }),
    addVehicle: (em, d) => RQ('addVehicle', d),
    selfAssign: (em, vehicle) => RQ('selfAssign', { vehicle }),
    vehStatus: (em, id, s) => RQ('vehStatus', { id, s }),
    reqAsg: (em, d) => RQ('reqAssign', d),
    admAsg: (a, id, act, reason) => RQ('assignDecision', { id, act, reason }),
    admVeh: (a, id, act, reason) => RQ('vehicleDecision', { id, act, reason }),
    accept: (em, id) => RQ('accept', { id }),
    decline: (em, id) => RQ('decline', { id }),
  };
  /* capacity: usable vehicles of a type = approved, not in maintenance, with an approved driver assigned.
   A new booking fits if one of them has no overlapping booking (unassigned overlapping bookings of the type also take a vehicle). */
  const fleetOf = type =>
    S.vh.filter(
      v =>
        v.type == type &&
        v.approval == 'Approved' &&
        v.status != 'Maintenance' &&
        (() => {
          const a = vAsg(v.id),
            u = a && U(a.driver);
          return !!u && okr(u, 'driver') && acct(u) && dAv(u.em) != 'Temporarily Suspended';
        })()
    );
  const capFree = p => {
    const all = window.ZM_ALLBK || S.bk,
      V = fleetOf(p.vid),
      O = all.filter(
        x => x.id != p.id && x.vid == p.vid && !done(x) && x.st != 'No driver found' && ovl(x, p)
      ),
      busy = new Set(O.filter(x => x.veh).map(x => x.veh));
    return V.filter(v => !busy.has(v.id)).length - O.filter(x => !x.veh).length;
  };
  /* type name for any vehicle type, including rental-only passenger types */
  const vtN = t => ([...HV, ...((S.fleet || {}).RT || [])].find(h => h.id == t) || { n: t }).n;
  window.ZW = { api: API, chk, ADM, ok: okr, vOf, asgOf, capFree, fleetOf };
  /* ---------- UI ---------- */
  const IC = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    car: 'M3 16v-5l2-5h14l2 5v5M3 16h18M7 19h.01M17 19h.01',
    users:
      'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    doc: 'M6 3h9l4 4v14H6zM14 3v5h5',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c0-4 4-6 8-6s8 2 8 6',
    inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
    pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  };
  const ic = k =>
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k]}"/></svg>`;
  const WL = {
    customer: 'Customer',
    driver: 'Driver',
    owner: 'Vehicle Owner',
    account: 'Account overview',
    admin: 'Admin console',
  };
  const NAV = {
    account: [
      ['overview', 'Overview', 'home'],
      ['apply', 'Apply for a role', 'doc'],
      ['status', 'Applications', 'list'],
    ],
    driver: [
      ['dash', 'Dashboard', 'home'],
      ['req', 'Requests', 'inbox'],
      ['veh', 'My vehicles', 'car'],
    ],
    owner: [
      ['dash', 'Dashboard', 'home'],
      ['veh', 'Vehicles', 'car'],
      ['drv', 'Drivers', 'users'],
    ],
    admin: [
      ['apps', 'Applications', 'list'],
      ['veh', 'Vehicles', 'car'],
      ['asg', 'Assignments', 'users'],
      ['log', 'Audit log', 'shield'],
    ],
  };
  const cu = () => U(S.me && S.me.em),
    canWS = w =>
      w == 'customer' ||
      w == 'account' ||
      (w == 'admin' && !!(cu() || {}).adm) ||
      (w == 'cashier' && (!!(cu() || {}).cash || ['super', 'admin'].includes((cu() || {}).adm))) ||
      okr(cu(), w);
  const oper = u => ['driver', 'owner'].filter(t => okr(u, t));
  const stTag = s =>
    `<span class="tag ${['Approved', 'Available', 'Active', 'approved'].includes(s) ? 'g' : ['Rejected', 'Maintenance', 'rejected'].includes(s) ? 'r' : ''}">${esc(s)}</span>`;
  const tl = cur =>
    `<div class="wstl">${ST.filter(s => s != 'Rejected' || cur == 'Rejected')
      .map(s => {
        const i = ST.indexOf(s),
          c = ST.indexOf(cur);
        return `<div class="${s == cur ? 'on' : i < c && cur != 'Rejected' ? 'past' : ''}"><i></i>${s}</div>`;
      })
      .join('')}</div>`;
  const chkH = c =>
    `<div class="wsc">${c.map(x => `<span class="${x[1] ? 'ok' : ''}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><${x[1] ? 'path d="M5 12l5 5 9-10"' : 'circle cx="12" cy="12" r="8"'}/></svg>${x[0]}</span>`).join('')}</div>`;
  const msgH = () =>
    `<div class="vz-m ${ZWm.good ? 'good' : 'bad'}" role="status" aria-live="polite" style="${ZWm.t ? '' : 'display:none'}">${esc(ZWm.t || '')}</div>`;
  let ZWm = {};
  const nm = em => {
    const u = U(em);
    return u ? esc(u.name) : esc(em || '—');
  };
  /* hub */
  const hub = () => {
    const u = cu(),
      op = oper(u),
      apps = S.apps.filter(a => a.user == u.em);
    const role = (t, lbl, desc) => {
      const r = rl(u, t),
        a = apps.filter(x => x.role == t).slice(-1)[0];
      return `<div class="card wsb"><h2>${lbl}</h2><p class="mu">${desc}</p>${r ? stTag(a && r.st != 'approved' ? a.st : r.st == 'approved' ? 'Approved' : r.st) : '<span class="tag">Not applied</span>'}${r && r.st == 'approved' ? `<button class="btn sm" data-a="w-ws" data-w="${t}">Open ${lbl} workspace</button>` : r && r.st == 'pending' ? `<button class="btn o sm" data-a="w-go" data-w="account" data-p="status">View application</button>` : `<button class="btn o sm" data-a="w-go" data-w="account" data-p="apply">Apply</button>`}</div>`;
    };
    const mine = S.vh.filter(v => v.owner == u.em),
      trips = tripOf(u.em),
      open = S.bk.filter(b => b.st == 'Pending' && !b.drvUser).length,
      pend =
        S.asg.filter(a => a.by == u.em && a.st == 'Pending Admin Review').length +
        mine.filter(v => v.approval == 'Pending Approval').length;
    return `<h1>Your account</h1><div class="card" style="margin-top:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="zav lg">${initials(u.name)}</div><div style="flex:1;min-width:200px"><b style="font-size:18px;font-weight:500">${esc(u.name)}</b><div class="mu">${esc(u.em)} · ${esc(u.ph || 'No phone')}</div></div><span class="tag ${u.ver ? 'g' : ''}">${u.ver ? 'Account verified' : 'Not verified'}</span></div>
 <span class="grp">Your roles</span><div class="wsr"><div class="card wsb"><h2>Customer</h2><p class="mu">Book hauls and rentals.</p>${stTag('Approved')}<button class="btn o sm" data-a="w-ws" data-w="customer">Open Customer workspace</button></div>${role('driver', 'Driver', 'Accept bookings, run trips, collect payments.')}${role('owner', 'Vehicle Owner', 'Register vehicles and manage assignments.')}</div>
 ${
   op.length
     ? `<span class="grp">${op.length > 1 ? 'Combined overview (Owner-Driver)' : 'Overview'}</span><div class="tiles">${op.includes('driver') ? `<div class="tile"><span>Active trips</span><b>${trips.length}</b></div><div class="tile"><span>Open booking requests</span><b>${open}</b></div>` : ''}${op.includes('owner') ? `<div class="tile"><span>My vehicles</span><b>${mine.length}</b></div><div class="tile"><span>Pending approvals</span><b>${pend}</b></div>` : ''}</div>
 ${op.length > 1 ? `<p class="mu" style="margin-top:12px">One account, two workspaces. A vehicle you own and drive appears once, in both. Earnings, collections and remittances arrive in the next milestone and will be kept separate.</p>` : ''}`
     : `<div class="note" style="margin-top:16px">Driver and Vehicle Owner workspaces unlock only after an administrator approves your application.</div>`
 }`;
  };
  /* applicant pages */
  const apply = () => {
    const u = cu(),
      lab = (t, req) => t + (req ? ' <span class="mu" aria-hidden="true">*</span>' : '');
    /* owner documents also asked for drivers (ID, proof of address): uploaded once when applying for both */
    const docField = (r, n, i) =>
      `<div data-shared="${r == 'owner' && DOCS.driver.includes(n) ? 1 : ''}"><label for="w-d-${r}${i}">${lab(esc(n), !n.includes('(if any)'))}</label><input type="file" id="w-d-${r}${i}" accept="image/*"></div>`;
    return `<h1>Apply for a role</h1><p class="mu">An administrator reviews every application, meets you for an interview and gives an orientation before activating a role. You can apply as a driver, a vehicle owner, or both at once (for example if you drive your own vehicle). Required documents can be changed by the company.</p>${msgH()}<div class="card" style="margin-top:12px"><span class="p-lb">Roles (choose one or both)</span><div class="wsa" style="margin-top:4px">${[
      ['driver', 'Driver'],
      ['owner', 'Vehicle Owner'],
    ]
      .map(
        r =>
          `<label class="p-ck"><input type="checkbox" id="w-r-${r[0]}" ${rl(u, r[0]) && ['approved', 'pending'].includes(rl(u, r[0]).st) ? 'disabled' : ''}><span>${r[1]}${rl(u, r[0]) ? ' (' + rl(u, r[0]).st + ')' : ''}</span></label>`
      )
      .join('')}</div>
 <p class="mu n" data-apnone style="margin:10px 0 0">Choose a role above to see what to fill in.</p>
 <div class="wsf" style="margin-top:16px"><div><label for="w-ph">${lab('Phone', 1)}</label><input id="w-ph" value="${esc(u.ph || '')}"></div><div><label for="w-ad">${lab('Address', 1)}</label><input id="w-ad" value="${esc(u.ad || '')}"></div><div data-apx="driver"><label for="w-lc">${lab('Driver’s license no.', 1)}</label><input id="w-lc"></div><div data-apx="driver"><label for="w-lx">${lab('License valid until', 1)}</label><input id="w-lx" type="date"></div><div data-apx="driver"><label for="w-cx">${lab('NBI/police clearance valid until', 1)}</label><input id="w-cx" type="date"></div></div>
 ${['driver', 'owner'].map(r => `<div data-aps="${r}"><span class="grp">${r == 'driver' ? 'Driver' : 'Vehicle Owner'} documents (photos)</span>${r == 'owner' ? '<p class="mu n" data-apnote style="margin:0 0 8px">Your Government-issued ID and Proof of address from the driver documents count for both roles.</p>' : ''}<div class="wsf">${DOCS[r].map((n, i) => docField(r, n, i)).join('')}</div></div>`).join('')}
 <p class="mu n" style="margin:12px 0 0"><span aria-hidden="true">*</span> required</p>
 <div class="wsa"><button class="btn" data-a="w-apply">Submit application</button></div></div>`;
  };
  /* show only what the ticked roles need */
  const syncApply = () => {
    if (!$('#w-r-driver')) return;
    const on = r => !!($('#w-r-' + r) && $('#w-r-' + r).checked),
      show = (el, v) => (el.style.display = v ? '' : 'none');
    document.querySelectorAll('#app [data-apx]').forEach(el => show(el, on(el.dataset.apx)));
    document.querySelectorAll('#app [data-aps]').forEach(el => show(el, on(el.dataset.aps)));
    document.querySelectorAll('#app [data-shared="1"]').forEach(el => show(el, !on('driver')));
    document.querySelectorAll('#app [data-apnote]').forEach(el => show(el, on('driver') && on('owner')));
    const none = ['driver', 'owner'].every(r => $('#w-r-' + r).disabled);
    document.querySelectorAll('#app [data-apnone]').forEach(el => {
      show(el, !on('driver') && !on('owner'));
      el.textContent = none
        ? 'You have applied for both roles. Follow their progress under Applications.'
        : 'Choose a role above to see what to fill in.';
    });
    const btn = $('[data-a="w-apply"]');
    if (btn) btn.disabled = !on('driver') && !on('owner');
  };
  /* an error must not wipe the form: keep what was entered (photos too) and put it back after the redraw */
  let apDraft = null;
  const keepApply = () => {
    const f = { em: S.me && S.me.em, v: {} };
    document.querySelectorAll('#app input[id^="w-"]').forEach(i => {
      f.v[i.id] = i.type == 'checkbox' ? i.checked : i.type == 'file' ? [...(i.files || [])] : i.value;
    });
    return f;
  };
  const restoreApply = () => {
    if (!apDraft || !$('#w-r-driver') || apDraft.em != (S.me && S.me.em)) return;
    for (const [id, v] of Object.entries(apDraft.v)) {
      const i = document.getElementById(id);
      if (!i || i.disabled) continue;
      if (i.type == 'checkbox') i.checked = v;
      else if (i.type == 'file') {
        if (!v.length) continue;
        try {
          const dt = new DataTransfer();
          v.forEach(f => dt.items.add(f));
          i.files = dt.files;
        } catch (e) {}
      } else i.value = v;
    }
  };
  document.addEventListener('change', e => {
    if (e.target && e.target.id && e.target.id.startsWith('w-r-')) syncApply();
  });
  const status = () => {
    const u = cu(),
      l = S.apps.filter(a => a.user == u.em).reverse();
    return `<h1>Applications</h1>${msgH()}${
      l.length
        ? l
            .map(
              a => `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><h2 style="font-size:20px">${a.role == 'driver' ? 'Driver' : 'Vehicle Owner'} application</h2>${stTag(a.st)}</div><span class="mu n">${a.id} · submitted ${fmt(a.hist[0].t)}</span>${tl(a.st)}
 ${a.st == 'Interview Scheduled' ? `<div class="note"><b>Interview:</b> ${fmt(a.iv.when)} at ${esc(a.iv.where)}. Bring the original documents.</div>` : ''}${a.st == 'For Orientation' ? `<div class="note">Orientation: ${a.orient ? 'completed. Waiting for final approval.' : 'pending. An administrator will brief you on company policies, safety and operations.'}</div>` : ''}${a.st == 'Approved' ? `<div class="note">Approved. Your ${a.role} workspace is active.</div>` : ''}${a.st == 'Rejected' ? `<div class="note">Not approved: ${esc((a.hist.slice(-1)[0] || {}).note || '')}</div>` : ''}
 ${a.st == 'Awaiting Additional Documents' ? `<div class="note"><b>Requested:</b> ${esc(a.req)}</div><div class="wsf"><div><label for="w-x-${a.id}">Upload document</label><input type="file" id="w-x-${a.id}" accept="image/*"></div></div><div class="wsa"><button class="btn sm" data-a="w-up" data-id="${a.id}">Submit requested document</button></div>` : ''}</div>`
            )
            .join('')
        : '<div class="card empty" style="margin-top:12px">No applications yet.</div>'
    }`;
  };
  /* driver pages */
  const dDash = () => {
    const u = cu(),
      as = asgOf(u.em),
      v = as && vOf(as.vehicle),
      av = dAv(u.em),
      open = S.bk.filter(b => b.st == 'Pending' && !b.drvUser && !(b.declined || []).includes(u.em)),
      el = open.filter(b => chk(u.em, b).every(x => x[1])),
      tr = tripOf(u.em);
    return `<h1>Driver dashboard</h1>${msgH()}<div class="tiles" style="margin-top:12px"><div class="tile"><span>Availability</span><b style="font-size:24px">${av}</b></div><div class="tile"><span>Eligible requests</span><b>${el.length}</b></div><div class="tile"><span>Active trips</span><b>${tr.length}</b></div></div>
 <div class="wsr" style="margin-top:12px"><div class="card"><h2 style="font-size:20px">Availability</h2><p class="mu">You can only receive requests while Available.</p><div class="wsa">${['Available', 'Unavailable'].map(s => `<button class="btn ${av == s ? '' : 'o'} sm" data-a="w-av" data-s="${s}" ${av == s ? 'aria-pressed="true"' : ''}>${s}</button>`).join('')}</div>${av == 'Temporarily Suspended' ? '<p class="vz-e">Your account is suspended. Contact an administrator.</p>' : ''}</div>
 <div class="card"><h2 style="font-size:20px">Assigned vehicle</h2>${v ? `<p><b style="font-weight:500">${esc(v.brand)} ${esc(v.model)}</b> · <span class="n">${esc(v.plate)}</span></p><p class="mu">${vtN(v.type)} · owner ${nm(v.owner)}</p>${stTag(v.status)}` : `<p class="mu">No approved vehicle assignment yet. Ask a vehicle owner to request one, or wait for an administrator.</p>`}</div></div>
 ${tr.length ? `<div class="card" style="margin-top:12px"><h2 style="font-size:20px">Active trips</h2>${tr.map(b => `<div class="row"><span><b style="font-weight:500">${b.id}</b> · ${sh(b.pu)} to ${sh(b.dr)}</span>${stTag(b.st)}</div>`).join('')}<p style="margin-top:8px"><button class="btn sm" data-a="w-go" data-w="driver" data-p="trip">Open active trip</button></p></div>` : ''}`;
  };
  const dReq = () => {
    const u = cu(),
      l = S.bk.filter(b => b.st == 'Pending' && !b.drvUser && !(b.declined || []).includes(u.em));
    return `<h1>Booking requests</h1><p class="mu">Open bookings from customers. The first eligible driver to accept gets the booking.</p>${msgH()}${
      l.length
        ? l
            .map(b => {
              const c = chk(u.em, b),
                all = c.every(x => x[1]),
                hv = HV.find(h => h.id == b.vid) || { n: b.vid };
              return `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><b class="n">${b.id}</b>${b.demo ? '<span class="tag">Demo booking</span>' : ''}<span class="tag g">${hv.n}</span></div>
 <div style="font-family:var(--display);font-size:22px;font-weight:700;margin:8px 0 2px">${sh(b.pu)} to ${sh(b.dr)}</div><div class="mu n">${b.dt} at ${b.tm} · about ${b.km} km · ~${Math.ceil(2 + b.km / 20)} h</div>
 <div class="wss-w" style="margin-top:12px"><div class="vz-i"><span class="mu">Cargo</span><span>${esc(b.it || '—')}</span></div><div class="vz-i"><span class="mu">Movers requested</span><span class="n">${b.mv || 0}</span></div>${b.si ? `<div class="vz-i"><span class="mu">Instructions</span><span>${esc(b.si)}</span></div>` : ''}<div class="vz-i"><span class="mu">Booking price</span><span class="n">${peso(b.tot)}</span></div><div class="vz-i"><span class="mu">Your share</span><span>${b.share ? `<b>${peso(b.share.amt)}</b> <span class="mu">(${b.share.pct}% of the fare after the service fee)</span>` : '—'}</span></div><div class="vz-i"><span class="mu">Customer details</span><span class="mu">Shared after you accept</span></div></div>${all ? '' : chkH(c)}
 <div class="wsa"><button class="btn sm" data-a="w-acc" data-id="${b.id}" ${all ? '' : 'disabled'}>Accept booking</button><button class="btn o sm" data-a="w-dec" data-id="${b.id}">Decline</button></div></div>`;
            })
            .join('')
        : '<div class="card empty" style="margin-top:12px">No open booking requests right now.</div>'
    }`;
  };
  const dVeh = () => {
    const u = cu(),
      h = S.asg.filter(a => a.driver == u.em).reverse(),
      mine = S.vh.filter(v => v.owner == u.em);
    const own = mine.length
      ? `<div class="card" style="margin-top:12px"><h2 style="font-size:20px">My own vehicles</h2><table class="wss"><tr><th>Vehicle</th><th>Approval</th><th>Driver</th><th></th></tr>${mine
          .map(v => {
            const a = vAsg(v.id);
            return `<tr><td>${esc(v.brand)} ${esc(v.model)} <span class="n">${esc(v.plate)}</span></td><td>${stTag(v.approval)}</td><td>${a ? (a.driver == u.em ? 'You' : esc(nm(a.driver))) : v.approval == 'Pending Approval' && v.selfReq ? '<span class="mu">You, once approved</span>' : '—'}</td><td>${okr(u, 'owner') ? selfH(v, a) : ''}</td></tr>`;
          })
          .join('')}</table>${okr(u, 'owner') ? '<p class="mu n" style="margin:10px 0 0">Manage availability, rentals and other drivers in Workspace → Vehicle Owner.</p>' : ''}</div>`
      : '';
    return `<h1>My vehicles</h1><p class="mu">Drive a vehicle assigned to you, or register your own and drive it yourself.</p>${msgH()}${own}<div class="card" style="margin-top:12px"><h2 style="font-size:20px">Assignments</h2>${
      h.length
        ? `<table class="wss"><tr><th>Vehicle</th><th>Owner</th><th>Status</th><th>Since</th></tr>${h
            .map(a => {
              const v = vOf(a.vehicle) || {};
              return `<tr><td>${esc(v.brand || '')} ${esc(v.model || '')} <span class="n">${esc(v.plate || '')}</span></td><td>${v.owner == u.em ? 'You' : nm(v.owner)}</td><td>${stTag(a.st)}</td><td class="n">${fmt(a.hist[a.hist.length - 1].t)}</td></tr>`;
            })
            .join('')}</table>`
        : '<div class="empty">No assignments yet.</div>'
    }</div>${vehForm(mine.length || h.length, true)}`;
  };
  /* owner pages */
  const oDash = () => {
    const u = cu(),
      m = S.vh.filter(v => v.owner == u.em),
      as = S.asg.filter(a => a.st == 'Active' && m.some(v => v.id == a.vehicle));
    return `<h1>Vehicle owner dashboard</h1><div class="tiles" style="margin-top:12px"><div class="tile"><span>Registered vehicles</span><b>${m.length}</b></div><div class="tile"><span>Approved</span><b>${m.filter(v => v.approval == 'Approved').length}</b></div><div class="tile"><span>Pending approval</span><b>${m.filter(v => v.approval == 'Pending Approval').length}</b></div><div class="tile"><span>Assigned drivers</span><b>${as.length}</b></div></div>
 <div class="card" style="margin-top:12px"><h2 style="font-size:20px">Your vehicles</h2>${
   m
     .map(v => {
       const a = vAsg(v.id);
       return `<div class="row"><span><b style="font-weight:500">${esc(v.brand)} ${esc(v.model)}</b> <span class="n mu">${esc(v.plate)}</span><br><small class="mu">${a ? 'Driver: ' + nm(a.driver) : 'No driver assigned'}</small></span><span>${stTag(v.approval == 'Approved' ? v.status : v.approval)}</span></div>`;
     })
     .join('') || '<div class="empty">No vehicles yet.</div>'
 }</div>`;
  };
  /* vehicle registration: approved owners and approved drivers (a driver becomes the owner on approval) */
  const vehForm = (has, forDriver) => {
    const u = cu(),
      drv = okr(u, 'driver'),
      open = !has;
    const selfBox = drv
      ? `<label class="p-ck" style="margin-top:14px"><input type="checkbox" id="w-vself" ${forDriver ? 'checked' : ''}><span>I will drive this vehicle myself (hauling types). You become its driver as soon as it is approved.</span></label>`
      : '';
    const note = okr(u, 'owner')
      ? ''
      : '<p class="mu n" style="margin:10px 0 0">When an administrator approves the vehicle, you also become a vehicle owner and get the Vehicle Owner workspace.</p>';
    return `<details class="card" style="margin-top:12px" ${open ? 'open' : ''}><summary style="cursor:pointer;font-weight:500;min-height:44px;display:flex;align-items:center">Register a vehicle</summary><div class="wsf"><div><label for="w-vt">Type</label><select id="w-vt"><optgroup label="Hauling (takes bookings with a driver)">${HV.map(h => `<option value="${h.id}">${h.n}</option>`).join('')}</optgroup><optgroup label="Rental only (passenger)">${((S.fleet || {}).RT || []).map(h => `<option value="${h.id}">${h.n}</option>`).join('')}</optgroup></select></div><div><label for="w-vs">Seats (incl. driver)</label><input id="w-vs" type="number" min="1" max="30" placeholder="e.g. 3"></div><div><label for="w-vtr">Transmission</label><select id="w-vtr"><option>Manual</option><option>Automatic</option></select></div><div><label for="w-vfu">Fuel</label><select id="w-vfu"><option>Diesel</option><option>Gasoline</option><option>Electric</option></select></div><div><label for="w-vb">Brand</label><input id="w-vb"></div><div><label for="w-vm">Model</label><input id="w-vm"></div><div><label for="w-vp">Plate number</label><input id="w-vp"></div><div><label for="w-vx">Registration expires</label><input id="w-vx" type="date"></div><div><label for="w-vc">Color (as on the OR/CR)</label><input id="w-vc" placeholder="e.g. White"></div><div><label for="w-vy">Model year</label><input id="w-vy" type="number" min="1990" placeholder="e.g. 2021"></div><div><label for="w-vd">Notes for customers (optional)</label><input id="w-vd" placeholder="e.g. tarpaulin cover, rope and straps included"></div><div><label for="w-vf">OR/CR document (photo)</label><input id="w-vf" type="file" accept="image/*"></div><div><label for="w-vi">Vehicle photo (optional)</label><input id="w-vi" type="file" accept="image/*"></div></div>${selfBox}<div class="wsa"><button class="btn" data-a="w-vadd">Submit for admin verification</button></div>${note}</details>`;
  };
  /* owner-drivers drive their own vehicle in one step; owners without a driver role are told how */
  const selfH = (v, a) => {
    const u = cu();
    if (v.approval != 'Approved' || !HV.some(x => x.id == v.type) || (a && a.driver == u.em)) return '';
    if (!okr(u, 'driver'))
      return a ? '' : `<p class="mu n" style="margin:8px 0 0">Want to drive it yourself? <a href="#" data-a="w-go" data-w="account" data-p="apply">Apply for the driver role</a>.</p>`;
    return a
      ? `<p class="mu n" style="margin:8px 0 0">To drive it yourself, first end ${esc(nm(a.driver))}’s assignment on the Drivers page.</p>`
      : `<div class="wsa"><button class="btn sm" data-a="w-self" data-id="${v.id}">Drive it myself</button></div>`;
  };
  const oVeh = () => {
    const u = cu(),
      m = S.vh.filter(v => v.owner == u.em);
    return `<h1>Vehicles</h1>${msgH()}${
      m
        .map(v => {
          const a = vAsg(v.id);
          return `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><h2 style="font-size:20px">${esc(v.brand)} ${esc(v.model)}</h2>${stTag(v.approval)}</div><div class="mu n">${v.id} · ${esc(v.plate)} · ${vtN(v.type)} · ${v.cap} · ${esc(v.color || 'color not recorded')}${v.year ? ' · ' + esc(v.year) : ''} · registration until ${v.regExp}</div><div class="vz-i"><span class="mu">Driver</span><span>${a ? (a.driver == u.em ? 'You (owner-driver)' : nm(a.driver)) : 'None'}</span></div>${selfH(v, a)}<div class="vz-i"><span class="mu">Operational status</span><span>${stTag(v.status)}</span></div>
 ${v.approval == 'Approved' ? `<div class="wsa">${['Available', 'Unavailable', 'Maintenance'].map(s => `<button class="btn ${v.status == s ? '' : 'o'} sm" data-a="w-vs" data-id="${v.id}" data-s="${s}">${s}</button>`).join('')}</div>` : `<p class="mu">${v.approval == 'Rejected' ? 'Rejected: ' + esc((v.hist.slice(-1)[0] || {}).note || '') : 'Waiting for admin verification. The vehicle cannot receive bookings yet.'}</p>`}</div>`;
        })
        .join('') || '<div class="card empty" style="margin-top:12px">No vehicles yet.</div>'
    }
 ${vehForm(m.length)}`;
  };
  const oDrv = () => {
    const u = cu(),
      m = S.vh.filter(v => v.owner == u.em && v.approval == 'Approved'),
      pool = S.users.filter(x => okr(x, 'driver') && !asgOf(x.em)),
      rq = S.asg
        .filter(a => m.some(v => v.id == a.vehicle) || S.vh.some(v => v.id == a.vehicle && v.owner == u.em))
        .reverse();
    const vs = `<option value="">Choose vehicle</option>${m.map(v => `<option value="${v.id}">${esc(v.brand)} ${esc(v.model)} · ${esc(v.plate)}</option>`).join('')}`;
    return `<h1>Drivers</h1><p class="mu">Assignments take effect only after an administrator approves them.</p>${msgH()}
 <div class="card" style="margin-top:12px"><h2 style="font-size:20px">Driver pool</h2><p class="mu">Approved drivers without a vehicle.</p>${pool.length ? `<table class="wss"><tr><th>Driver</th><th>Status</th><th></th></tr>${pool.map(d => `<tr><td>${esc(d.name)}<br><small class="mu">${esc(d.em)}</small></td><td>${stTag(dAv(d.em))}</td><td><button class="btn o sm" data-a="w-asg" data-d="${esc(d.em)}" data-m="assign">Assign…</button></td></tr>`).join('')}</table>` : '<div class="empty">No drivers in the pool.</div>'}</div>
 <div class="card" style="margin-top:12px"><h2 style="font-size:20px">Assign or recommend a driver</h2><div class="wsf"><div><label for="w-av">Vehicle</label><select id="w-av">${vs}</select></div><div><label for="w-ae">Driver email</label><input id="w-ae" type="email" placeholder="registered email"></div><div><label for="w-an">Note (optional)</label><input id="w-an"></div></div><div class="wsa"><button class="btn sm" data-a="w-asg" data-m="assign">Assign approved driver</button><button class="btn o sm" data-a="w-asg" data-m="recommend">Recommend a driver</button></div></div>
 <div class="card" style="margin-top:12px"><h2 style="font-size:20px">Requests and history</h2>${
   rq.length
     ? `<table class="wss"><tr><th>Vehicle</th><th>Driver</th><th>Type</th><th>Status</th></tr>${rq
         .map(a => {
           const v = vOf(a.vehicle) || {};
           return `<tr><td class="n">${esc(v.plate || '')}</td><td>${nm(a.driver)}</td><td>${esc(a.mode)}</td><td>${stTag(a.st)}</td></tr>`;
         })
         .join('')}</table>`
     : '<div class="empty">No requests yet.</div>'
 }</div>`;
  };
  /* admin console (demo) */
  const aApps = () => {
    const l = S.apps.slice().reverse();
    return `<h1>Applications</h1><div class="wsdm">Prototype admin console. In production this is the separate Admin Panel with its own login.</div>${msgH()}${
      l
        .map(a => {
          const u = U(a.user) || {};
          const f = (act, lbl, cls = '') =>
              `<button class="btn ${cls} sm" data-a="w-ad" data-act="${act}" data-id="${a.id}">${lbl}</button>`,
            fin = ['Approved', 'Rejected'].includes(a.st);
          return `<div class="card" style="margin-top:12px"><div class="row" style="padding-top:0"><b>${esc(u.name || a.user)} · ${a.role}</b>${stTag(a.st)}</div><div class="mu n">${a.id} · ${a.docs.length} document(s) · license ${esc(a.info.license || '—')}${a.info.licExp ? ' (valid until ' + esc(a.info.licExp) + ')' : ''}${a.info.clrExp ? ' · clearance valid until ' + esc(a.info.clrExp) : ''}</div>${window.ZDR ? ZDR.recNote(a) : ''}${tl(a.st)}
 ${fin ? '' : `<div class="wsa">${a.st == 'Pending Review' ? f('verify', 'Start verification') : ''}${['Under Verification', 'Awaiting Additional Documents'].includes(a.st) ? `<input id="w-iw-${a.id}" type="datetime-local" style="max-width:220px"><input id="w-ip-${a.id}" placeholder="Interview place" style="max-width:220px">${f('interview', 'Schedule interview')}` : ''}${['Under Verification', 'Interview Scheduled'].includes(a.st) ? `<input id="w-rq-${a.id}" placeholder="Document needed" style="max-width:220px">${f('request', 'Request document', 'o')}` : ''}${a.st == 'Interview Scheduled' ? f('orient', 'Interview held: move to orientation') : ''}${a.st == 'For Orientation' && !a.orient ? f('orientdone', 'Mark orientation completed') : ''}${a.st == 'For Orientation' && a.orient ? f('approve', 'Approve role') : ''}<input id="w-rj-${a.id}" placeholder="Reason to reject" style="max-width:220px">${f('reject', 'Reject', 'd')}</div>`}</div>`;
        })
        .join('') || '<div class="card empty" style="margin-top:12px">No applications.</div>'
    }`;
  };
  const aVeh = () => {
    const l = S.vh.filter(v => v.approval == 'Pending Approval');
    return `<h1>Vehicle approvals</h1><div class="wsdm">Prototype admin console.</div>${msgH()}${l.map(v => `<div class="card" style="margin-top:12px"><b>${esc(v.brand)} ${esc(v.model)}${v.year ? ' (' + esc(v.year) + ')' : ''}</b> <span class="n">${esc(v.plate)}</span> · ${esc(v.color || 'color not recorded')} · ${esc(vtN(v.type) || v.type)} · ${nm(v.owner)}<div class="wsa"><button class="btn sm" data-a="w-av2" data-act="approve" data-id="${v.id}">Approve</button><input id="w-vr-${v.id}" placeholder="Reason to reject" style="max-width:220px"><button class="btn d sm" data-a="w-av2" data-act="reject" data-id="${v.id}">Reject</button></div></div>`).join('') || '<div class="card empty" style="margin-top:12px">No vehicles waiting.</div>'}`;
  };
  const aAsg = () => {
    const l = S.asg.filter(a => a.st == 'Pending Admin Review');
    return `<h1>Assignment requests</h1><div class="wsdm">Prototype admin console.</div>${msgH()}${
      l
        .map(a => {
          const v = vOf(a.vehicle) || {};
          return `<div class="card" style="margin-top:12px"><b>${esc(v.brand || '')} ${esc(v.model || '')}</b> <span class="n">${esc(v.plate || '')}</span> ← ${nm(a.driver)}<div class="mu">${esc(a.mode)} by ${nm(a.by)}${a.note ? ' · ' + esc(a.note) : ''}</div><div class="wsa"><button class="btn sm" data-a="w-aa" data-act="approve" data-id="${a.id}">Approve</button><input id="w-ar-${a.id}" placeholder="Reason to reject" style="max-width:220px"><button class="btn d sm" data-a="w-aa" data-act="reject" data-id="${a.id}">Reject</button></div></div>`;
        })
        .join('') || '<div class="card empty" style="margin-top:12px">No requests waiting.</div>'
    }`;
  };
  const aDemo = () =>
    `<h1>Demo data and accounts</h1><div class="wsdm">Labeled demonstration data. Password for all demo accounts: Demo1234. Switching accounts here skips the password so you can show each role quickly.</div>${msgH()}<div class="card"><button class="btn" data-a="w-seed">Load demo accounts, vehicles and open bookings</button></div><div class="card" style="margin-top:12px"><h2 style="font-size:20px">Switch account (demo)</h2><table class="wss"><tr><th>Name</th><th>Roles</th><th></th></tr>${S.users.map(x => `<tr><td>${esc(x.name)}<br><small class="mu">${esc(x.em)}</small></td><td>${['customer', ...(x.roles || []).map(r => (r.st == 'approved' ? r.t : r.t + ' (' + r.st + ')'))].join(', ')}</td><td>${x.em == S.me.em ? '<span class="tag g">Current</span>' : `<button class="btn o sm" data-a="w-su" data-e="${esc(x.em)}">Use</button>`}</td></tr>`).join('')}</table></div>`;
  const aLog = () =>
    `<h1>Audit log</h1><div class="card" style="margin-top:12px"><table class="wss"><tr><th>Time</th><th>Actor</th><th>Event</th></tr>${S.au
      .slice(-60)
      .reverse()
      .map(
        x =>
          `<tr><td class="n">${fmt(x.t)}</td><td>${esc(x.who)}</td><td>${esc(x.evt)}<br><small class="mu n">${esc(x.data ? JSON.stringify(x.data) : '')}</small></td></tr>`
      )
      .join('')}</table></div>`;
  const PG = {
    account: { overview: hub, apply, status },
    driver: { dash: dDash, req: dReq, veh: dVeh },
    owner: { dash: oDash, veh: oVeh, drv: oDrv },
    admin: { apps: aApps, veh: aVeh, asg: aAsg, demo: aDemo, log: aLog },
  };
  const sw = () => {
    const u = cu(),
      w = S.ws || 'customer';
    const it = (k, l, d, dis) =>
        `<button class="wsi ${w == k ? 'on' : ''}" data-a="w-ws" data-w="${k}" ${dis ? 'disabled' : ''}><span><b>${l}</b><small>${d}</small></span></button>`,
      rr = t => {
        const r = rl(u, t);
        return r ? (r.st == 'approved' ? 'Approved' : r.st) : 'Not applied';
      };
    return `<details class="wsm" id="wsm"><summary>${ic('users')}<span><small>Workspace</small> ${WL[w]}</span></summary><div class="wsp">${it('customer', 'Customer', 'Book hauls and rentals')}${it('driver', 'Driver Workspace', okr(u, 'driver') ? 'Trips, requests, vehicle' : rr('driver'), !okr(u, 'driver'))}${it('owner', 'Vehicle Owner Workspace', okr(u, 'owner') ? 'Vehicles and assignments' : rr('owner'), !okr(u, 'owner'))}${it('account', 'Account overview', 'Roles, applications' + (oper(u).length > 1 ? ', combined view' : ''))}${u.cash || u.adm == 'super' || u.adm == 'admin' ? it('cashier', 'Cashier workspace', 'Remittances, ledger, settlements') : ''}${u.adm ? `<div class="wsd">Administration</div>${it('admin', 'Admin console', 'Applications, vehicles, administrators')}` : ''}</div></details>`;
  };
  const _r6 = render;
  render = function () {
    _r6();
    if (!S.me || !cu()) return;
    /* wait for the server view before drawing the workspace switcher */ const bar =
      document.querySelector('.bar');
    let s = $('#wsw');
    if (!s) {
      s = document.createElement('div');
      s.id = 'wsw';
      bar.insertBefore(s, $('#bl') || $('#hs'));
    }
    const open = $('#wsm') && $('#wsm').open;
    s.innerHTML = sw();
    if (open) $('#wsm').open = true;
    const w = S.ws || 'customer';
    if (w == 'customer') return;
    if (!canWS(w)) {
      S.ws = 'customer';
      return render();
    }
    const pg = PG[w],
      cur = pg[S.wp[w]] ? S.wp[w] : Object.keys(pg)[0];
    $('#nav').innerHTML = NAV[w]
      .filter(n => navOK(n, w))
      .map(
        n =>
          `<a class="${n[0] == cur ? 'on' : ''}" data-a="w-go" data-w="${w}" data-p="${n[0]}"><span class="ic">${ic(n[2])}</span>${n[1]}</a>`
      )
      .join('');
    $('#app').innerHTML = pg[cur]();
    restoreApply();
    syncApply();
  };
  /* handlers */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="w-"]');
      if (!t || !S.me) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        me = S.me.em,
        A = ADM,
        d = t.dataset;
      const fin = async (r, ok) => {
        r = await r;
        if (r.ok && r._m) ok = r._m;
        ZWm = { t: r.ok ? ok : r.err, good: r.ok };
        if (r.ok) toast(ok);
        render();
      };
      if (a == 'w-ws') {
        if (!canWS(d.w)) return;
        S.ws = d.w;
        ZWm = {};
        save();
        $('#wsm') && ($('#wsm').open = false);
        return render();
      }
      if (a == 'w-go') {
        S.ws = d.w;
        S.wp[d.w] = d.p;
        ZWm = {};
        save();
        return render();
      }
      if (a == 'w-apply') {
        apDraft = keepApply();
        const roles = ['driver', 'owner'].filter(r => $('#w-r-' + r) && $('#w-r-' + r).checked),
          docs = {};
        for (const r of roles) {
          docs[r] = [];
          for (let i = 0; i < DOCS[r].length; i++) docs[r][i] = await pimg('w-d-' + r + i);
        }
        const r = await API.apply(me, {
          roles,
          phone: val('w-ph'),
          address: val('w-ad'),
          license: val('w-lc'),
          licExp: val('w-lx'),
          clrExp: val('w-cx'),
          docs,
        });
        if (r.ok) apDraft = null;
        return fin(
          r,
          roles.length > 1
            ? 'Application submitted for both roles. An administrator will review it.'
            : 'Application submitted. An administrator will review it.'
        );
      }
      if (a == 'w-up')
        return fin(API.upload(me, d.id, [{ file: await pimg('w-x-' + d.id) }]), 'Document submitted.');
      if (a == 'w-ad') {
        const id = d.id;
        return fin(
          API.adm(A, id, d.act, {
            when: val('w-iw-' + id),
            where: val('w-ip-' + id),
            note: val('w-rq-' + id),
            reason: val('w-rj-' + id),
          }),
          'Done.'
        );
      }
      if (a == 'w-av') return fin(API.avail(me, d.s), 'Availability: ' + d.s);
      if (a == 'w-acc') return fin(API.accept(me, d.id), 'Booking accepted. It is now yours.');
      if (a == 'w-dec') return fin(API.decline(me, d.id), 'Booking declined.');
      if (a == 'w-vadd')
        return fin(
          API.addVehicle(me, {
            type: val('w-vt'),
            brand: val('w-vb'),
            model: val('w-vm'),
            plate: val('w-vp'),
            regExp: val('w-vx'),
            desc: val('w-vd'),
            color: val('w-vc'),
            year: val('w-vy'),
            doc: await pimg('w-vf'),
            photo: await pimg('w-vi'),
            seats: val('w-vs'),
            trans: val('w-vtr'),
            fuel: val('w-vfu'),
            self: !!($('#w-vself') && $('#w-vself').checked),
          }).then(r => {
            if (r.ok && r.ownerOnApproval)
              r = { ...r, _m: 'Vehicle submitted. When an administrator approves it, you also become its owner.' };
            return r;
          }),
          'Vehicle submitted for verification.'
        );
      if (a == 'w-self')
        return fin(API.selfAssign(me, d.id), 'You are now the driver of this vehicle. Set yourself Available to get bookings.');
      if (a == 'w-vs') return fin(API.vehStatus(me, d.id, d.s), 'Vehicle status updated.');
      if (a == 'w-asg') {
        if (d.d) $('#w-ae').value = d.d;
        return fin(
          API.reqAsg(me, { vehicle: val('w-av'), driver: val('w-ae'), mode: d.m, note: val('w-an') }),
          'Request sent to an administrator for approval.'
        );
      }
      if (a == 'w-av2')
        return fin(API.admVeh(A, d.id, d.act, val('w-vr-' + d.id)), 'Vehicle ' + d.act + 'd.');
      if (a == 'w-aa')
        return fin(API.admAsg(A, d.id, d.act, val('w-ar-' + d.id)), 'Assignment ' + d.act + 'd.');
      if (a == 'w-seed' || a == 'w-su') {
        toast('Demo account tools were removed.');
        return;
      }
      if (false) {
        await API.seed();
        ZWm = { t: 'Demo data loaded.', good: true };
        return render();
      }
      if (a == 'w-su') {
        const u = U(d.e);
        S.me = { name: u.name, em: u.em };
        S.ws = 'customer';
        ZWm = {};
        save();
        toast('Now using ' + u.name + ' (demo switch)');
        return render();
      }
    },
    true
  );
  document.addEventListener('click', e => {
    const m = $('#wsm');
    if (m && m.open && !e.target.closest('#wsm')) m.open = false;
  });

  /* ===== Owner admin + administrator management ===== */
  let saMsg = '',
    saF = { n: '', e: '' };
  const gv = id => (document.getElementById(id) || {}).value || '',
    hasSuper = () => S.users.some(u => u.adm == 'super'),
    isSup = () => (cu() || {}).adm == 'super';
  const needSetup = () => !S.me && location.hash == '#owner-setup';
  const setupHTML = () =>
    `<div class="auth card"><h1>Owner admin setup</h1><p class="mu">Create the owner administrator account. The server closes this screen permanently once it is used.</p><div class="note">If the server has an <b>OWNER_SETUP_CODE</b> set in backend/.env, enter it below. Without one, whoever opens this page first becomes the owner, so set the code before going live.</div>${saMsg ? `<div class="note">${esc(saMsg)}</div>` : ''}<label>Full name</label><input id="sa-n" autocomplete="name" value="${esc(saF.n)}"><label>Email</label><input id="sa-e" type="email" autocomplete="username" value="${esc(saF.e)}"><label>Password (at least 10 characters)</label><input id="sa-p" type="password" autocomplete="new-password"><label>Confirm password</label><input id="sa-p2" type="password" autocomplete="new-password"><label>Setup code (if the server requires one)</label><input id="sa-c" autocomplete="off"><button class="btn" data-a="sa-setup">Create owner admin</button></div>`;
  const aAdmins = () => {
    if (!isSup())
      return '<h1>Administrators</h1><div class="note">Only the owner admin can manage administrators.</div>';
    const l = S.users.filter(u => u.adm);
    return `<h1>Administrators</h1>${saMsg ? `<div class="note">${esc(saMsg)}</div>` : ''}<label>Appoint an administrator (email of a registered account)</label><input id="sa-new" type="email"><button class="btn sm" data-a="w-sa-add">Appoint</button><table class="tbl" style="margin-top:12px"><tr><th>Name</th><th>Email</th><th>Level</th><th></th></tr>${l.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.em)}</td><td>${u.adm == 'super' ? 'Owner' : 'Admin'}</td><td>${u.adm == 'super' ? '' : `<button class="btn o sm" data-a="w-sa-rm" data-e="${esc(u.em)}">Revoke</button>`}</td></tr>`).join('')}</table>`;
  };
  NAV.admin.push(['admins', 'Administrators', 'shield']);
  PG.admin.admins = aAdmins;
  delete PG.admin.demo;
  const _r7 = render;
  render = function () {
    _r7();
    if (needSetup()) {
      const a = $('#app');
      if (a) a.innerHTML = setupHTML();
    }
  };
  window.addEventListener('hashchange', () => render());
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a="sa-setup"],[data-a="w-sa-add"],[data-a="w-sa-rm"]');
      if (!t) return;
      const a = t.dataset.a;
      if (a == 'sa-setup') {
        if (hasSuper()) {
          saMsg = 'Setup is already complete.';
          return render();
        }
        const n = gv('sa-n').trim(),
          em = gv('sa-e').trim().toLowerCase(),
          p = gv('sa-p'),
          p2 = gv('sa-p2');
        saF = { n, e: em };
        if (p !== p2) {
          saMsg = 'Passwords do not match.';
          return render();
        }
        const r = await ZAPI.auth('owner-setup', { name: n, em, pw: p, code: gv('sa-c') });
        if (!r.ok) {
          saMsg = r.err;
          return render();
        }
        S.me = r.me;
        S.ws = 'admin';
        saMsg = '';
        saF = { n: '', e: '' };
        save();
        location.hash = '';
        return render();
      }
      if (!S.me || !isSup()) return;
      if (a == 'w-sa-add-old') {
        const em = gv('sa-new').trim().toLowerCase(),
          u = U(em);
        if (!u) saMsg = 'No registered account has that email. They must register first.';
        else if (u.adm) saMsg = 'That account is already an administrator.';
        else {
          u.adm = 'admin';
          au(S.me.em, 'admin appointed', { user: em });
          saMsg = 'Appointed ' + em + ' as administrator.';
        }
        save();
        return render();
      }
      if (a == 'w-sa-rm-old') {
        const u = U(t.dataset.e);
        if (u && u.adm == 'admin') {
          delete u.adm;
          au(S.me.em, 'admin revoked', { user: u.em });
          saMsg = 'Revoked administrator access for ' + u.em + '.';
        }
        save();
        render();
      }
    },
    true
  );
  const navOK = (n, w) => {
    if (w != 'admin') return true;
    const L = (cu() || {}).adm,
      k = n[0];
    return L == 'sub'
      ? ['dash', 'bk', 'map', 'inc'].includes(k)
      : k == 'admins'
        ? L == 'super'
        : k == 'set'
          ? ['super', 'admin'].includes(L)
          : true;
  };
  /* ===== Trip execution, finance, staff roles, incidents, admin ops ===== */
  const nowI = () => new Date().toISOString(),
    fin2 = async (r, ok) => {
      r = await r;
      ZWm = { t: r.ok ? ok : r.err, good: r.ok };
      if (r.ok) toast(ok);
      render();
    };
  S.cfg = S.cfg || { coShare: 80 };
  S.rem = S.rem || [];
  S.inc = S.inc || [];
  S.wp = S.wp || {};
  {
    const c = document.createElement('style');
    c.textContent =
      '.zt{width:100%;border-collapse:collapse}.zt td,.zt th{padding:8px 10px;border-bottom:1px solid var(--bd,#ddd);text-align:left;font-size:14px;vertical-align:top}.zw{overflow-x:auto}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:10px}.wsa{flex-wrap:wrap}.zw input,.zc input,.zc select,.zc textarea{max-width:100%}#zban{background:#fff4d6;color:#5a4300;font-size:12px;padding:6px 12px;text-align:center}';
    document.head.appendChild(c);
    const b = document.createElement('div');
    b.id = 'zban';
    b.textContent = 'Prototype: SMS/email and the GCash gateway are not connected.';
    document.body.prepend(b);
  }
  const canCash = u => !!u && (!!u.cash || u.adm == 'super' || u.adm == 'admin'),
    me = () => (S.me || {}).em,
    halfC = b => Math.round(ZPAY.half(b) * 100),
    half = b => ZPAY.half(b),
    paid = (b, k) => ZPAY.sum(b.id, k),
    gross = b =>
      ZPAY.r2(S.pay.filter(p => p.bid == b.id && p.by && ZPAY.counted(p)).reduce((s, p) => s + p.amount, 0)),
    rate = () => +S.cfg.coShare || 0,
    dueOf = g => Math.round((g * rate()) / 100);
  const wk = t => {
      const d = new Date(t),
        x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
      return x.toISOString().slice(0, 10);
    },
    remBks = em => S.bk.filter(b => b.drvUser == em && b.st == 'Completed' && !b.rem);
  const ev = (b, em, to, note) => {
      (b.ev = b.ev || []).push({ t: nowI(), by: em, from: b.st, to, note: note || '' });
      b.st = to;
    },
    mine = (em, id) => {
      const b = S.bk.find(x => x.id == id);
      return b && b.drvUser == em ? b : null;
    };
  Object.assign(API, {
    step: (em, id, to, note) => RQ('step', { id, to, note }),
    pay: (em, id, kind, g, c, ref) => RQ('driverPay', { id, kind, g, c, ref }),
    payv: (a, id, ok, note) => RQ('payVerify', { id, ok, note }),
    remit: (em, week, method, ref) => RQ('remit', { week, method, ref }),
    verify: (a, id, recv, note) => RQ('remitVerify', { id, recv, note }),
    resolve: (a, id, note, adj) => RQ('remitResolve', { id, note, adj }),
    case: (a, id, act, note) => RQ('incidentCase', { id, act, note }),
    reset: (a, typed) => RQ('reset', { typed }),
    resubmit: (em, id) => RQ('resubmit', { id }),
    adminAssign: (a, id, em) => RQ('adminAssign', { id, driver: em }),
    cfgPend: (a, v) => RQ('cfgPend', { min: v }),
    cfg: (a, r) => RQ('cfgRate', { rate: r }),
    staffAdd: (em, role) => RQ('staffAdd', { em, role }),
    staffRevoke: (em, k) => RQ('staffRevoke', { em, k }),
  });
  const ICT = {
      start: ['Submitted'],
      evidence: ['Under review', 'Statement recorded'],
      statement: ['Under review', 'Evidence requested'],
      decide: ['Under review', 'Evidence requested', 'Statement recorded'],
      close: ['Decision recorded'],
    },
    ICTo = {
      start: 'Under review',
      evidence: 'Evidence requested',
      statement: 'Statement recorded',
      decide: 'Decision recorded',
      close: 'Closed',
    },
    ICL = {
      start: 'Start review',
      evidence: 'Request evidence',
      statement: 'Record statement',
      decide: 'Record decision',
      close: 'Close case',
    };
  const tbl = (h, r) =>
      r.length
        ? `<div class="zw"><table class="zt"><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${r.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`
        : '<p class="mu">Nothing here yet.</p>',
    btn = (a, l, at, c = '') => `<button class="btn ${c} sm" data-a="${a}" ${at}>${l}</button>`,
    tile = (l, v) => `<div class="tile"><span>${l}</span><b>${v}</b></div>`,
    route = b => `${esc(b.pu || '')} → ${esc(b.dr || '')}`,
    wz = (u, l) =>
      `<a class="btn o sm" target="_blank" rel="noopener" href="https://waze.com/ul?q=${encodeURIComponent(u || '')}&navigate=yes">${l}</a>`;
  const stepUI = b => {
    const id = b.id,
      s = b.st,
      a = `data-id="${id}"`,
      go = (to, l) => btn('w-st', l, `${a} data-to="${to}"`),
      nt = p => `<textarea id="n-${id}" rows="2" style="width:100%" placeholder="${p}"></textarea>`,
      pf = k => {
        const sp = S.pay.find(
          p => p.bid == id && p.kind == k && p.method == 'GCash' && p.status == 'Submitted'
        );
        return `${sp ? `<div class="note">The customer submitted GCash reference <b>${esc(sp.ref)}</b> for ${peso(sp.amount)}. Check that it arrived, then record it below (pre-filled).</div>` : ''}<p>Collect <b>${peso(ZPAY.due(b, k))}</b> (${k == 'down' ? '50% before loading' : 'remaining 50% after delivery'}). GCash + Cash must add up exactly.</p><div class="wsa"><input id="g-${id}" type="number" min="0" placeholder="GCash amount" value="${sp ? sp.amount : ''}"><input id="c-${id}" type="number" min="0" placeholder="Cash amount" value="${sp ? ZPAY.r2(ZPAY.due(b, k) - sp.amount) || '' : ''}"><input id="r-${id}" placeholder="GCash ref (10-13 digits)" value="${sp ? esc(sp.ref) : ''}"></div>${btn('w-pay', 'Record payment', `${a} data-k="${k}"`)}`;
      };
    return s == 'Accepted'
      ? go('On the Way to Pickup', 'Heading to pickup')
      : s == 'On the Way to Pickup'
        ? go('Awaiting Down Payment', "I've arrived at pickup")
        : s == 'Awaiting Down Payment'
          ? pf('down')
          : s == 'Down Payment Confirmed'
            ? nt('Cargo loaded: items, count, condition') + go('Items Loaded', 'Cargo loaded')
            : s == 'Items Loaded'
              ? b.id == (tripOf(me()).find(x => x.st == 'Items Loaded') || {}).id &&
                window.ZMVER &&
                ZMVER.panel
                ? '<p class="mu">Ask the customer for their Start PIN or QR code, check the plate and cargo, then authorize departure.</p>' +
                  ZMVER.panel(b, 'driver')
                : '<p class="mu">Finish the pre-departure verification of your other loaded trip first.</p>'
              : s == 'In Transit'
                ? go('Arrived at Destination', 'Arrived at destination')
                : s == 'Arrived at Destination'
                  ? b.id == (tripOf(me()).find(x => x.st == 'Arrived at Destination') || {}).id &&
                    window.ZMVER &&
                    ZMVER.dpanel
                    ? '<p class="mu">Ask the customer to check the items and give you their Delivery PIN.</p>' +
                      ZMVER.dpanel(b, 'driver')
                    : '<p class="mu">Confirm the delivery of your other trip first.</p>'
                  : s == 'Delivery Confirmation'
                    ? go('Awaiting Final Payment', 'Request final payment')
                    : s == 'Awaiting Final Payment'
                      ? pf('final')
                      : '';
  };
  const dTrip = () => {
    const l = tripOf(me());
    return `<h1>Active trip</h1>${msgH()}${l.length ? l.map(b => `<div class="card zc" style="margin-top:12px"><h2 style="font-size:20px">${esc(b.id)} · ${route(b)}</h2><p class="mu">${esc(b.dt || '')} ${esc(b.tm || '')} · ${esc(b.it || '')} · fare ${peso(b.tot)} · ${stTag(b.st)}</p><p>${wz(b.pu, 'Navigate to pickup')} ${wz(b.dr, 'Navigate to drop-off')}</p>${window.ZGPS ? ZGPS.driverBox(b) : ''}${stepUI(b)}</div>`).join('') : '<p class="mu">No active trip. Accepted bookings appear here.</p>'}`;
  };
  const dEarn = () => {
    const em = me(),
      all = S.bk.filter(b => b.drvUser == em && b.st == 'Completed'),
      g = all.reduce((s, b) => s + gross(b), 0),
      un = remBks(em),
      cur = wk(nowI()),
      weeks = [...new Set(un.map(b => wk(b.cd)))].sort(),
      rl = S.rem
        .filter(r => r.drv == em)
        .slice()
        .reverse();
    return `<h1>Earnings & remittance</h1>${msgH()}<div class="tiles">${tile('Completed trips', all.length)}${tile('Collected from customers', peso(g))}${tile('Your share (' + (100 - rate()) + '%)', peso(g - dueOf(g)))}${tile('Owed to ZamMove (' + rate() + '%)', peso(dueOf(un.reduce((s, b) => s + gross(b), 0))))}</div><p class="mu">The rate is set by administrators and applied to money you collected. Owner compensation is not configured.</p><h2>Weekly remittance</h2>${
      weeks.length
        ? weeks
            .map(w => {
              const l = un.filter(b => wk(b.cd) == w),
                gr = l.reduce((s, b) => s + gross(b), 0);
              return `<div class="card zc" style="margin-top:8px"><b>Week of ${w}</b> · ${l.length} trips · collected ${peso(gr)} · remit <b>${peso(dueOf(gr))}</b>${w >= cur ? '<p class="mu">This week has not ended. You can remit after it closes.</p>' : `<div class="wsa"><select id="m-${w}"><option>Cash</option><option>GCash</option></select><input id="q-${w}" placeholder="Receipt / reference"><button class="btn sm" data-a="w-rm" data-w="${w}">Submit remittance</button></div>`}</div>`;
            })
            .join('')
        : '<p class="mu">No completed trips waiting for remittance.</p>'
    }<h2>Remittance history</h2>${tbl(
      ['Week', 'Due', 'Received', 'Status'],
      rl.map(r => [
        r.week,
        peso(r.due),
        r.recv == null ? '—' : peso(r.recv),
        stTag(r.st) + (r.diff ? ` (${r.diff > 0 ? '+' : '-'}${peso(Math.abs(r.diff))})` : ''),
      ])
    )}<h2>Trip history</h2>${tbl(
      ['Booking', 'Route', 'Collected'],
      S.bk.filter(b => b.drvUser == em && done(b)).map(b => [esc(b.id), route(b), peso(gross(b))])
    )}`;
  };
  const oHist = () => {
    const ids = S.vh.filter(v => v.owner == me()).map(v => v.id),
      l = S.bk.filter(b => ids.includes(b.veh));
    return `<h1>Trip history</h1><p class="mu">Trips on your vehicles. Owner compensation is not configured yet, so no owner earnings are shown.</p>${tbl(
      ['Booking', 'Vehicle', 'Driver', 'Status', 'Collected'],
      l.map(b => [
        esc(b.id),
        esc((vOf(b.veh) || {}).plate || ''),
        esc(nm(b.drvUser)),
        stTag(b.st),
        peso(gross(b)),
      ])
    )}`;
  };
  const cQueue = () => {
    const q = S.rem.filter(r => r.st == 'Submitted'),
      d = S.rem.filter(r => r.st == 'Discrepancy'),
      row = (r, res) => [
        esc(nm(r.drv)),
        r.week,
        peso(r.due),
        esc(r.method) +
          ' · ' +
          esc(r.ref) +
          (r.diff ? `<br>Received ${peso(r.recv)} (${r.diff > 0 ? '+' : '-'}${peso(Math.abs(r.diff))})` : ''),
        res
          ? `<input id="nt-${r.id}" placeholder="Resolution note">` +
            btn('w-cr', 'Resolve', `data-id="${r.id}"`)
          : `<input id="rv-${r.id}" type="number" placeholder="Amount received"><input id="nt-${r.id}" placeholder="Note (optional)">` +
            btn('w-cv', 'Verify', `data-id="${r.id}"`),
      ];
    return `<h1>Remittance queue</h1>${msgH()}<div class="tiles">${tile('Awaiting verification', q.length)}${tile('Discrepancies', d.length)}${tile('Verified', S.rem.filter(r => r.st == 'Verified').length)}</div><h2>Awaiting verification</h2><div class="zc">${tbl(
      ['Driver', 'Week', 'Expected', 'Driver reported', 'Action'],
      q.map(r => row(r, 0))
    )}</div><h2>Discrepancies</h2><div class="zc">${tbl(
      ['Driver', 'Week', 'Expected', 'Details', 'Action'],
      d.map(r => row(r, 1))
    )}</div>`;
  };
  const PH = [
      'Date',
      'Booking / rental',
      'Kind',
      'Method',
      'Amount',
      'Reference',
      'Payer',
      'Collected by',
      'Status',
    ],
    payRows = () => S.pay.slice().reverse(),
    okImg = f => typeof f == 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(f);
  const cLed = () =>
    `<h1>Payment ledger</h1><p class="mu">Every payment record: customer GCash proofs, driver collections, rental payments and deposits. Only <b>Recorded by driver</b> and <b>Verified</b> rows count as paid (${peso(ZPAY.total())} so far). Kept separate from driver earnings, owner compensation and ZamMove revenue.</p>${btn('w-csv', 'Download CSV', '')}${tbl(
      PH,
      payRows().map(p => [
        (p.t || '').slice(0, 10),
        esc(p.bid),
        esc(p.kind),
        esc(p.method),
        peso(p.amount),
        esc(p.ref),
        p.payer ? nm(p.payer) : '—',
        p.collectedBy ? nm(p.collectedBy) : '—',
        stTag(p.status),
      ])
    )}`;
  const cPay = () => {
    const l = S.pay.filter(p => p.status == 'Submitted' && p.kind != 'down' && p.kind != 'final');
    return `<h1>Payments to verify</h1>${msgH()}<p class="mu">Rental payments and deposits submitted by customers. Check each one against the GCash account or the cash received before verifying. Booking payments are confirmed by the driver who collects them.</p>${tbl(
      ['Date', 'Rental', 'Kind', 'Method', 'Amount', 'Reference', 'Payer', 'Action'],
      l.map(p => [
        (p.t || '').slice(0, 10),
        esc(p.bid),
        esc(p.kind),
        esc(p.method),
        peso(p.amount),
        esc(p.ref) +
          (okImg(p.pf)
            ? `<br><img src="${p.pf}" alt="Proof of payment" style="max-width:90px;border-radius:6px">`
            : ''),
        p.payer ? nm(p.payer) : '—',
        `<input id="pn-${p.id}" placeholder="Note (required to reject)"><div class="wsa">${btn('w-pv', 'Verify', `data-id="${esc(p.id)}" data-ok="1"`)}${btn('w-pv', 'Reject', `data-id="${esc(p.id)}" data-ok="0"`, 'd')}</div>`,
      ])
    )}`;
  };
  const cSum = () => {
    const ds = [...new Set(S.bk.filter(b => b.drvUser && gross(b)).map(b => b.drvUser))];
    return `<h1>Driver settlements</h1><p class="mu">Remittance rate: ${rate() || 'not configured'}%. Due = collected x rate. Outstanding = due minus remittances verified or resolved.</p>${tbl(
      ['Driver', 'Collected', 'Due to ZamMove', 'Received', 'Outstanding'],
      ds.map(d => {
        const g = S.bk.filter(b => b.drvUser == d).reduce((s, b) => s + gross(b), 0),
          rc = S.rem
            .filter(r => r.drv == d && ['Verified', 'Resolved'].includes(r.st))
            .reduce((s, r) => s + r.recv, 0);
        return [esc(nm(d)), peso(g), peso(dueOf(g)), peso(rc), peso(dueOf(g) - rc)];
      })
    )}`;
  };
  const aDash = () => {
    const bs = S.bk;
    return `<h1>Overview</h1><div class="tiles">${tile('Users', S.users.length)}${tile('Applications pending', S.apps.filter(a => !['Approved', 'Rejected'].includes(a.st)).length)}${tile('Bookings', bs.length)}${tile('Active trips', bs.filter(b => b.drvUser && !done(b)).length)}${tile('Completed', bs.filter(b => b.st == 'Completed').length)}${tile('Open incidents', S.inc.filter(c => c.st != 'Closed').length)}${tile('Remittances to verify', S.rem.filter(r => ['Submitted', 'Discrepancy'].includes(r.st)).length)}</div>`;
  };
  const aWait = () => {
    if (!isA(ADM)) return '';
    const q = S.bk.filter(b => !b.drvUser && ['No driver found', 'Pending'].includes(b.st)),
      ds = S.users.filter(u => okr(u, 'driver'));
    return `<h2>Waiting for a driver</h2>${msgH()}<p class="mu">Bookings without a driver. "No driver found" means nobody accepted within ${S.cfg.pendMin} minutes. Assigning runs the same eligibility rules as a driver accepting.</p>${tbl(
      ['Booking', 'When', 'Vehicle type', 'Status', 'Assign a driver'],
      q.map(b => [
        esc(b.id),
        esc(b.dt + ' ' + b.tm),
        esc(b.vn || b.vid),
        stTag(b.st),
        ds.length
          ? `<select id="as-${esc(b.id)}">${ds.map(u => `<option value="${esc(u.em)}">${esc(u.name)}${chk(u.em, b).every(c => c[1]) ? '' : ' (not eligible)'}</option>`).join('')}</select> ${btn('w-asn', 'Assign', `data-id="${esc(b.id)}"`)}`
          : '<span class="mu">No approved drivers</span>',
      ])
    )}<h2>All bookings</h2>`;
  };
  const aBk = () =>
    `<h1>Bookings</h1>${aWait()}${tbl(
      ['Booking', 'Route', 'Customer', 'Driver', 'Status', 'Fare', 'Timeline'],
      S.bk
        .slice()
        .reverse()
        .map(b => [
          esc(b.id),
          route(b),
          esc(b.cu ? nm(b.cu) : '—'),
          esc(b.drvUser ? nm(b.drvUser) : '—'),
          stTag(b.st),
          peso(b.tot),
          `<details><summary>${(b.ev || []).length} events</summary>${(b.ev || []).map(e => `<div class="mu">${esc(e.t.slice(0, 16).replace('T', ' '))} ${esc(e.to)}${e.note ? ': ' + esc(e.note) : ''}</div>`).join('')}</details>`,
        ])
    )}`;
  const aPay = () => cLed();
  const aVer = () => {
    const l = S.bk
        .filter(b => b.drv && (b.st == 'Items Loaded' || b.ver))
        .slice()
        .reverse(),
      sel =
        l.find(b => b.id == S.wp.vzb) ||
        l.find(b => b.st == 'Items Loaded' || b.st == 'Arrived at Destination') ||
        l[0];
    return `<h1>Trip verification</h1><p class="mu">Pre-departure and delivery records. Resolve cargo discrepancies, waive an unavailable customer's confirmation or Delivery PIN with a reason, or suspend a vehicle.</p>${l.length ? `<div class="wsa">${l.map(b => `<button class="btn ${sel && sel.id == b.id ? '' : 'o'} sm" data-a="w-vzsel" data-id="${esc(b.id)}">${esc(b.id)} · ${esc(b.st)}</button>`).join('')}</div>${sel ? (window.ZMVER.dpanel(sel, 'admin') || '') + (window.ZMVER.panel(sel, 'admin') || '<p class="mu">No pre-departure record for this booking yet.</p>') : ''}` : '<p class="mu">No bookings have reached loading yet.</p>'}`;
  };
  const aInc = () => {
    const full = isA(ADM);
    return `<h1>Incident cases</h1>${msgH()}<p class="mu">Reports are reviewed before any decision. Nobody is blamed or penalized from an initial report alone.</p>${
      S.inc.length
        ? S.inc
            .slice()
            .reverse()
            .map(
              c =>
                `<div class="card zc" style="margin-top:10px"><b>${esc(c.id)}</b> · booking ${esc(c.bid || '—')} · ${esc(c.cat || '')} · severity ${esc(c.sev || '')} · ${stTag(c.st)}<p>${esc(c.w || '')}</p>${(c.log || []).map(l => `<div class="mu">${esc(l.t.slice(0, 16).replace('T', ' '))} ${esc(l.act)} by ${esc(nm(l.by))}${l.note ? ': ' + esc(l.note) : ''}</div>`).join('')}${c.decision ? `<p><b>Decision:</b> ${esc(c.decision)}</p>` : ''}${
                  full && c.st != 'Closed'
                    ? `<textarea id="in-${c.id}" rows="2" style="width:100%" placeholder="Note / evidence request / finding"></textarea><div class="wsa">${btn('w-ic', 'Add note', `data-id="${c.id}" data-x="note" `, 'o')}${Object.keys(
                        ICT
                      )
                        .filter(k => ICT[k].includes(c.st))
                        .map(k => btn('w-ic', ICL[k], `data-id="${c.id}" data-x="${k}"`))
                        .join('')}</div>`
                    : ''
                }</div>`
            )
            .join('')
        : '<p class="mu">No incident reports.</p>'
    }`;
  };
  const aSet = () =>
    `<h1>Settings</h1>${msgH()}<div class="card zc"><h2 style="font-size:20px">Money split per trip</h2><p class="mu">The customer’s 5% service fee goes to ZamMove. Of the rest of the fare, ZamMove keeps its commission, the driver gets his share (from his driver agreement, or this default), and the vehicle owner gets the remainder. Drivers remit everything except their share each week; the cashier pays owners. Completed trips keep the split they had.</p><div class="wsf"><div><label for="cfg-comm">ZamMove commission (%)</label><input id="cfg-comm" type="number" min="0" max="50" value="${S.cfg.comm == null ? 15 : S.cfg.comm}"></div><div><label for="cfg-drv">Default driver share (%)</label><input id="cfg-drv" type="number" min="5" max="90" value="${S.cfg.drvPct || 20}"></div></div><div class="wsa"><button class="btn sm" data-a="zo-split">Save money split</button></div></div><div class="card zc" style="margin-top:12px"><h2 style="font-size:20px">Driver response time</h2><p class="mu">Minutes a new booking waits for a driver before it is marked "No driver found". The customer can then re-submit or cancel at no charge, and admins can assign a driver.</p><div class="wsa"><input id="cfg-pend" type="number" min="5" max="1440" value="${S.cfg.pendMin || 30}"><button class="btn sm" data-a="w-cfgp">Save</button></div></div>${isSup() ? `<div class="card zc" style="margin-top:12px"><h2 style="font-size:20px">Reset prototype data</h2><p class="mu">Deletes every booking, rental, payment, incident, review, remittance and notification for <b>all users</b>. Accounts, vehicles, assignments, applications and settings stay. This cannot be undone.</p><div class="wsa"><input id="rst-c" placeholder="Type RESET to confirm" autocomplete="off"><button class="btn d sm" data-a="w-rst">Reset data</button></div></div>` : ''}`;
  const aAdmins2 = () => {
    if (!isSup()) return '<h1>Staff</h1><div class="note">Only the owner admin can manage staff.</div>';
    const l = S.users.filter(u => u.adm || u.cash),
      lv = u =>
        [
          u.adm == 'super' ? 'Owner' : u.adm == 'admin' ? 'Admin' : u.adm == 'sub' ? 'Secondary admin' : '',
          u.cash ? 'Cashier' : '',
        ]
          .filter(Boolean)
          .join(' + ');
    return `<h1>Staff & administrators</h1>${saMsg ? `<div class="note">${esc(saMsg)}</div>` : ''}<label>Email of a registered account</label><input id="sa-new" type="email"><label>Role</label><select id="sa-lv"><option value="admin">Administrator</option><option value="sub">Secondary admin (view bookings and incidents only)</option><option value="cash">Cashier</option></select><button class="btn sm" data-a="w-sa-add">Appoint</button>${tbl(
      ['Name', 'Email', 'Role', ''],
      l.map(u => [
        esc(u.name),
        esc(u.em),
        lv(u),
        u.adm == 'super'
          ? ''
          : [
              u.adm ? btn('w-sa-rm', 'Revoke admin role', `data-e="${esc(u.em)}" data-k="adm"`, 'o') : '',
              u.cash ? btn('w-sa-rm', 'Revoke cashier', `data-e="${esc(u.em)}" data-k="cash"`, 'o') : '',
            ].join(' '),
      ])
    )}`;
  };
  WL.cashier = 'Cashier';
  NAV.driver.splice(2, 0, ['trip', 'Active trip', 'car'], ['earn', 'Earnings & remittance', 'doc']);
  NAV.owner.push(['hist', 'Trip history', 'list']);
  NAV.cashier = [
    ['queue', 'Remittance queue', 'inbox'],
    ['pv', 'Payments to verify', 'inbox'],
    ['led', 'Ledger', 'doc'],
    ['sum', 'Settlements', 'list'],
  ];
  NAV.admin.unshift(['dash', 'Overview', 'home']);
  NAV.admin.push(
    ['bk', 'Bookings', 'list'],
    ['ver', 'Verification', 'shield'],
    ['map', 'Live map', 'home'],
    ['pay', 'Payments', 'doc'],
    ['inc', 'Incidents', 'inbox'],
    ['set', 'Settings', 'doc']
  );
  {
    const O = ['dash', 'bk', 'map', 'ver', 'apps', 'veh', 'asg', 'pay', 'inc', 'log', 'set', 'admins'];
    NAV.admin.sort((a, b) => O.indexOf(a[0]) - O.indexOf(b[0]));
  }
  NAV.admin.find(n => n[0] == 'admins')[1] = 'Staff';
  Object.assign(PG.driver, { trip: dTrip, earn: dEarn });
  PG.owner.hist = oHist;
  PG.cashier = { queue: cQueue, pv: cPay, led: cLed, sum: cSum };
  Object.assign(window.ZW, { NAV, PG, vtN }); // 11-fleet.js adds the Rentals pages
  const aMap = () =>
    `<h1>Live map</h1><p class="mu">Active trips whose drivers are sharing their location. Positions update about every 10 seconds.</p>${window.ZGPS ? ZGPS.fleetBlock() : ''}`;
  Object.assign(PG.admin, {
    map: aMap,
    dash: aDash,
    bk: aBk,
    ver: aVer,
    pay: aPay,
    inc: aInc,
    set: aSet,
    admins: aAdmins2,
  });
  const _r8 = render;
  render = function () {
    if (S.me) {
      S.wp = S.wp || {};
      if (S.ws == 'admin') {
        const ok = NAV.admin.filter(n => navOK(n, 'admin')).map(n => n[0]);
        if (ok.length && !ok.includes(S.wp.admin)) S.wp.admin = ok[0];
      }
      if (S.ws == 'cashier' && !S.wp.cashier) S.wp.cashier = 'queue';
    }
    _r8();
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="w-"]');
      if (!t || !S.me) return;
      const a = t.dataset.a,
        id = t.dataset.id,
        m = me(),
        v = x => gv(x + '-' + id);
      if (a == 'w-vzsel') {
        S.wp.vzb = id;
        save();
        return render();
      }
      if (a == 'w-asn') return fin2(API.adminAssign(m, id, gv('as-' + id)), 'Driver assigned.');
      if (a == 'w-cfgp') return fin2(API.cfgPend(m, gv('cfg-pend')), 'Response time saved.');
      if (a == 'w-st') return fin2(API.step(m, id, t.dataset.to, v('n')), 'Trip updated.');
      if (a == 'w-pay') return fin2(API.pay(m, id, t.dataset.k, v('g'), v('c'), v('r')), 'Payment recorded.');
      if (a == 'w-pv')
        return fin2(
          API.payv(m, id, t.dataset.ok == '1', gv('pn-' + id)),
          t.dataset.ok == '1' ? 'Payment verified.' : 'Payment rejected.'
        );
      if (a == 'w-rm')
        return fin2(
          API.remit(m, t.dataset.w, gv('m-' + t.dataset.w), gv('q-' + t.dataset.w)),
          'Remittance submitted for verification.'
        );
      if (a == 'w-cv') return fin2(API.verify(m, id, v('rv'), v('nt')), 'Remittance checked.');
      if (a == 'w-cr') return fin2(API.resolve(m, id, v('nt')), 'Discrepancy resolved.');
      if (a == 'w-ic') return fin2(API.case(m, id, t.dataset.x, v('in')), 'Case updated.');
      if (a == 'w-cfg') return fin2(API.cfg(m, gv('cfg-rate')), 'Rate saved.');
      if (a == 'w-rst') return fin2(API.reset(m, gv('rst-c')), 'Prototype data was reset.');
      if (a == 'w-csv') {
        if (!canCash(cu())) return;
        const q = x =>
            '"' +
            String(x)
              .replace(/^[=+\-@]/, "'$&")
              .replace(/"/g, '""') +
            '"',
          rows = [
            PH,
            ...payRows().map(p => [
              (p.t || '').slice(0, 10),
              p.bid,
              p.kind,
              p.method,
              p.amount,
              p.ref,
              p.payer || '',
              p.collectedBy || '',
              p.status,
            ]),
          ],
          l = document.createElement('a');
        l.href = URL.createObjectURL(
          new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' })
        );
        l.download = 'zammove-ledger.csv';
        l.click();
        return;
      }
      if (!isSup()) return;
      if (a == 'w-sa-add') {
        const em = gv('sa-new').trim().toLowerCase(),
          lv = gv('sa-lv') || 'admin',
          r = await API.staffAdd(em, lv);
        saMsg = r.ok ? 'Appointed ' + em + ' (' + lv + ').' : r.err;
        return render();
      }
      if (a == 'w-sa-rm') {
        const k = t.dataset.k || 'adm',
          r = await API.staffRevoke(t.dataset.e, k);
        saMsg = r.ok ? 'Revoked ' + k + ' access for ' + t.dataset.e + '.' : r.err;
        return render();
      }
    },
    true
  );

  /* ===== customer data isolation, message reset ===== */
  /* In the Customer workspace every list is cut down to the logged-in customer's own records for the duration of the render.
   (The server already sends only this user's records; this is a second safety net.) */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a="resub"]');
      if (!t || !S.me) return;
      e.stopPropagation();
      e.preventDefault();
      const r = await API.resubmit(S.me.em, t.dataset.id);
      toast(r.ok ? 'Booking re-submitted to drivers.' : r.err);
      render();
    },
    true
  );
  let _vk = '';
  const _r9 = render;
  render = function () {
    const F = { bk: S.bk, rn: S.rn, pay: S.pay, inc: S.inc, rev: S.rev },
      all = F.bk,
      w = S.ws || 'customer',
      k = (S.me && S.me.em) + '|' + w + '|' + ((S.wp || {})[w] || '');
    if (k !== _vk) {
      _vk = k;
      ZWm = {};
      saMsg = '';
    }
    window.ZM_ALLBK = all;
    window.ZM_FULL = F;
    if (S.me && w == 'customer') {
      const em = S.me.em,
        mb = all.filter(b => b.cu && b.cu == em),
        mr = (F.rn || []).filter(r => r.cu == em),
        ids = new Set([...mb, ...mr].map(x => x.id));
      S.bk = mb;
      S.rn = mr;
      S.pay = (F.pay || []).filter(p => p.payer == em || ids.has(p.bid));
      S.inc = (F.inc || []).filter(c => c.by == em);
      S.rev = (F.rev || []).filter(r => r.by == em || (!r.by && ids.has(r.bid)));
    }
    try {
      _r9();
    } finally {
      Object.assign(S, F);
      window.ZM_ALLBK = null;
      window.ZM_FULL = null;
    }
    document.querySelectorAll('.tag.g').forEach(t => {
      if (t.textContent.trim() == 'Sample') {
        const tx = t.parentElement ? t.parentElement.textContent : '';
        if (S.bk.some(b => b.drvUser && tx.includes(nm(b.drvUser)))) t.remove();
      }
    });
  };

  /* ===== live sync with other tabs (e.g. the Admin Panel) ===== */
  /* another tab changed the shared data: take the new data but keep THIS tab's login; never re-render under someone who is typing */
  const busyTyping = () => {
    const a = document.activeElement;
    return (
      !!a &&
      (['TEXTAREA', 'SELECT'].includes(a.tagName) ||
        (a.tagName == 'INPUT' &&
          !['button', 'submit', 'checkbox', 'radio', 'file', 'range', 'reset'].includes(a.type)))
    );
  };
  const syncChip = () => {
    if ($('#zsync')) return;
    const c = document.createElement('button');
    c.id = 'zsync';
    c.type = 'button';
    c.textContent = 'Data updated – refresh';
    c.style.cssText =
      'position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:60;border:0;border-radius:999px;padding:10px 16px;background:var(--pri,#111);color:var(--onpri,#fff);font:inherit;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2)';
    c.onclick = () => {
      c.remove();
      render();
    };
    document.body.appendChild(c);
  };
  /* live updates: poll the server; never re-render under someone who is typing */
  setInterval(async () => {
    if (!ZAPI.token() || document.hidden) return;
    const sig = () =>
      JSON.stringify(S, (k, v) => (k == 'gps' || k == 'trail' || k == 'version' ? undefined : v));
    const v0 = ZAPI.version(),
      s0 = sig(),
      j = await ZAPI.refresh();
    if (!j.ok || j.state.version === v0) return;
    if (sig() === s0) return window.ZGPS && ZGPS.update(); // only GPS positions moved
    if (busyTyping()) syncChip();
    else {
      const c = $('#zsync');
      if (c) c.remove();
      render();
    }
  }, 10000);
  /* first load: fetch this user's view from the server */
  if (!ZAPI.token() && S.me) {
    S.me = null;
    save();
  }
  ZAPI.refresh().then(() => render()); /* logged out: public view (vehicle catalogue) */
  render();
})();
