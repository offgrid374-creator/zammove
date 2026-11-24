/**
 * 21-home.js — customer home, payments, settings mode and the header mode badge, from Figma
 * ("NEW SCREENS: build these", E00–E07).
 *
 *   E01   Customer home: a hero about the trip in progress (or "Book your first haul"), the live map,
 *         a street illustration, Recent activity, "Start something new" and "Your trips".
 *   E01c  Offline: a dark bar with the time the screen was last updated and "Try again"; buttons that
 *         need the server say so.
 *   E04   Payments tab: confirmed / waiting totals and one table of every payment.
 *   E07   Settings → Mode: Customer / Driver / Car owner cards, with what each needs.
 *   Header: the workspace menu shows as a "Customer mode · Switch" badge (blue for driver, orange
 *         for car owner); the menu itself is unchanged.
 *
 * The UPDATED screens (D01–D03 rentals, E02, E03, E05, E06) only change buttons and status colours;
 * that lives in css/home.css.
 */
(() => {
  const hm = t => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const day = t => {
    if (!t) return '';
    const d = new Date(t),
      n = new Date(),
      y = new Date(n.getTime() - 864e5);
    return d.toDateString() == n.toDateString()
      ? hm(t)
      : d.toDateString() == y.toDateString()
        ? 'Yesterday'
        : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };
  const fmtWhen = b => {
    const d = new Date(b.dt + 'T' + (b.tm || '00:00'));
    return isNaN(d) ? esc(b.dt + ' ' + (b.tm || '')) : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  };
  const place = s => esc(String(s || '').split(',')[0]);
  const first = n => esc(String(n || '').split(' ')[0]);
  const pill = (t, tone) => `<span class="zb-pill ${tone}">${esc(t)}</span>`;
  const drvU = b => (b.drvUser && S.users.find(u => u.em == b.drvUser)) || null;
  const vehOf = b => (S.vh || []).find(v => v.id == b.veh) || {};
  const lastEv = b => (b.ev || [])[(b.ev || []).length - 1] || {};
  const evAt = (b, st) => ((b.ev || []).find(x => x.to == st) || {}).t || '';

  /* ---------- offline (E01c) ---------- */
  let lastSync = Date.now();
  const offline = () => typeof navigator != 'undefined' && navigator.onLine === false;
  const offBar = () =>
    offline()
      ? `<div class="zh-off" role="status"><span><i aria-hidden="true"></i><b>You’re offline.</b> Showing your account as of ${new Date(lastSync).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false })}. It updates when you reconnect.</span><button data-a="zh-retry">Try again</button></div>`
      : '';
  window.addEventListener('offline', () => render());
  window.addEventListener('online', () => {
    render();
    toast('Back online.');
  });

  /* ---------- statuses in plain words ---------- */
  const ST = {
    Pending: ['Looking for a driver', 'wait'],
    'No driver found': ['No driver found', 'bad'],
    Accepted: ['Driver assigned', 'ok'],
    'On the Way to Pickup': ['On the way', 'ok'],
    'Awaiting Down Payment': ['Pay down payment', 'wait'],
    'Down Payment Confirmed': ['Loading', 'ok'],
    'Items Loaded': ['Give Start PIN', 'wait'],
    'In Transit': ['In transit', 'ok'],
    'Arrived at Destination': ['Give Delivery PIN', 'wait'],
    'Delivery Confirmation': ['Delivered', 'ok'],
    'Awaiting Final Payment': ['Pay the balance', 'wait'],
    Completed: ['Completed', 'mute'],
    Cancelled: ['Cancelled', 'bad'],
    Rejected: ['Rejected', 'bad'],
    Interrupted: ['Trip stopped', 'bad'],
  };
  const stPill = st => pill(...(ST[st] || [st, 'mute']));

  /* the booking the hero talks about: one in progress first, then the next upcoming one */
  const LIVE = ['On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'];
  const heroBk = () => {
    const act = (S.bk || []).filter(b => !done(b));
    return act.find(b => LIVE.includes(b.st)) || act.sort((a, c) => (a.dt + a.tm < c.dt + c.tm ? -1 : 1))[0];
  };
  const items = b => {
    const s = String(b.it || '').trim();
    return s && s.length <= 48 ? s.toLowerCase().replace(/,\s*(?=[^,]*$)/, ' and ') : 'items';
  };
  const heroText = b => {
    const u = drvU(b),
      dn = esc(u ? u.name : 'Your driver'),
      v = vehOf(b),
      veh = [String(v.color || '').toLowerCase(), v.brand, v.model].filter(Boolean).join(' '),
      your = `Your ${esc(items(b))}`;
    const plate = v.plate ? `, plate <b>${esc(v.plate)}</b>` : '';
    switch (b.st) {
      case 'Pending':
        return [`We’re finding a driver for your move to ${place(b.dr)}`, `Nearby ${esc(b.vn)} drivers have been notified for ${fmtWhen(b)}. You’ll get a notice when someone accepts.`];
      case 'No driver found':
        return [`No driver accepted your move to ${place(b.dr)}`, 'Send it to drivers again, or book another time or a bigger vehicle.'];
      case 'Accepted':
      case 'On the Way to Pickup':
        return [`<b>${dn}</b> is heading to ${place(b.pu)}`.replace(/<\/?b>/g, ''), `${dn} drives ${veh ? (/^[aeiou]/.test(veh) ? 'an ' : 'a ') + esc(veh) : 'a ' + esc(b.vn)}${plate}. Have your items ready.`];
      case 'Awaiting Down Payment':
        return [`${dn.replace(/<[^>]+>/g, '')} is at your pickup`, `Pay the down payment so loading can start.`];
      case 'Down Payment Confirmed':
      case 'Items Loaded':
        return [`${your} are being loaded`, b.st == 'Items Loaded' ? 'Check the plate and give your Start PIN so the trip can start.' : `${dn} is loading and checking your items.`];
      case 'In Transit':
        return [`${your} are on the way to ${place(b.dr)}`, `<b>${dn}</b> picked them up at ${hm(evAt(b, 'In Transit'))} in ${veh ? (/^[aeiou]/.test(veh) ? 'an ' : 'a ') + esc(veh) : 'a ' + esc(b.vn)}${plate}.`];
      case 'Arrived at Destination':
      case 'Delivery Confirmation':
        return [`${your} arrived in ${place(b.dr)}`, b.st == 'Arrived at Destination' ? 'Check everything, then give your Delivery PIN.' : 'Delivery confirmed. The balance is next.'];
      case 'Awaiting Final Payment':
        return [`${your} arrived in ${place(b.dr)}`, 'Pay the balance to finish the trip.'];
    }
    return [`Your trip to ${place(b.dr)}`, ''];
  };

  const ART_ON = () => typeof ART == 'object' && ART;
  const truck = (id, x, y, w) => (ART_ON() && ART[id] ? `<svg x="${x}" y="${y}" width="${w}" height="${w / 2}" viewBox="0 0 200 100">${ART[id]}</svg>` : '');
  const band = () =>
    `<div class="zh-band" aria-hidden="true"><svg viewBox="0 0 1440 130" preserveAspectRatio="xMidYMax slice" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${truck('l3', 96, 22, 210)}${truck('cv', 420, 34, 190)}${truck('w6', 730, 6, 250)}${truck('l3', 1086, 46, 170)}<path d="M0 109H1440"/><path stroke-width="1.5" d="M80 120H140M260 120H320M440 120H500M620 120H680M800 120H860M980 120H1040M1160 120H1220M1340 120H1400"/></svg></div>`;

  const hero = () => {
    const b = heroBk(),
      off = offline();
    if (!b) {
      const any = (S.bk || []).length;
      return `<section class="zh-hero"><div class="zh-in"><div class="zh-copy"><h1>${any ? 'Book your next haul' : 'Book your first haul'} in Zamboanga City</h1><p>Pick a van or truck, see the price first, pay half when the driver arrives.</p><div class="zb-acts"><button class="zb-btn pri" data-a="nav" data-v="book">Book a haul</button><button class="zb-btn sec" data-a="nav" data-v="rent">Rent a vehicle</button></div></div></div>${band()}</section>`;
    }
    const [h, p] = heroText(b),
      u = drvU(b),
      last = lastEv(b).t,
      [lbl, tone] = ST[b.st] || [b.st, 'mute'];
    const map = window.ZGPS && LIVE.includes(b.st) && b.drvUser ? `<div class="zh-map">${ZGPS.trackBlock(b)}</div>` : '';
    return `<section class="zh-hero"><div class="zh-in${map ? '' : ' solo'}"><div class="zh-copy">${pill((off ? 'Last known · ' : '') + lbl + (last ? ' · ' + hm(last) : ''), off ? 'mute' : tone)}<h1>${h}</h1>${p ? `<p>${p}</p>` : ''}<div class="zb-acts">${off ? '<button class="zb-btn sec" disabled>Track trip (offline)</button>' : `<button class="zb-btn pri" data-a="trk" data-id="${esc(b.id)}">Track trip</button>`}${u && u.ph && !['Pending', 'No driver found'].includes(b.st) ? `<a class="zb-btn sec" href="tel:${esc(u.ph)}">Call driver</a>` : `<button class="zb-btn sec" data-a="nav" data-v="bookings">My bookings</button>`}</div></div>${map}</div>${band()}</section>`;
  };

  /* recent activity: booking steps and payments, newest first */
  const ACT = {
    Pending: b => [`Booking sent, ${b.id}`, `${place(b.pu)} → ${place(b.dr)} · ${esc(b.vn)}`],
    Accepted: b => [`${esc((drvU(b) || {}).name || 'A driver')} accepted ${b.id}`, fmtWhen(b)],
    'On the Way to Pickup': b => ['Driver heading to your pickup', `${esc((drvU(b) || {}).name || '')} · ${place(b.pu)}`],
    'Awaiting Down Payment': b => ['Driver arrived at your pickup', `Down payment ${peso(ZPAY.due(b, 'down'))} is due`],
    'Items Loaded': b => [`Items loaded, ${b.id}`, 'Give your Start PIN to begin the trip'],
    'In Transit': b => [`Departure authorized, ${b.id}`, 'Start PIN, plate check and cargo checklist all passed'],
    'Arrived at Destination': b => [`Arrived in ${place(b.dr)}`, 'Check your items and give your Delivery PIN'],
    'Delivery Confirmation': b => [`Delivered, ${b.id}`, 'Confirmed with your Delivery PIN'],
    Completed: b => [`Haul ${b.id} completed`, `${place(b.pu)} → ${place(b.dr)} · ${peso(b.tot)} paid in full`],
    Cancelled: b => [`Booking ${b.id} cancelled`, b.cf ? `${peso(b.cf)} cancellation fee` : 'No fee charged'],
    'No driver found': b => [`No driver found for ${b.id}`, 'Try again or book another time'],
  };
  /* an older step no longer asks for anything: say what happened instead */
  const PAST = {
    Pending: ['Sent', 'mute'],
    'Awaiting Down Payment': ['Arrived', 'ok'],
    'Items Loaded': ['Loaded', 'ok'],
    'Arrived at Destination': ['Arrived', 'ok'],
    'No driver found': ['No driver', 'mute'],
  };
  const KIND = { down: 'Down payment', final: 'Balance', deposit: 'Rental deposit', rent: 'Rental', cancel_fee: 'Cancellation fee', deposit_refund: 'Deposit returned', refund: 'Refund' };
  const activity = () => {
    const rows = [];
    (S.bk || []).forEach(b =>
      (b.ev || []).forEach(e => {
        if (ACT[e.to]) rows.push({ t: e.t, h: ACT[e.to](b)[0], s: ACT[e.to](b)[1], p: e.to == b.st ? stPill(b.st) : PAST[e.to] ? pill(...PAST[e.to]) : stPill(e.to) });
      })
    );
    (S.pay || [])
      .filter(p => (S.bk || []).some(b => b.id == p.bid) || p.payer == S.me.em || p.to == S.me.em)
      .forEach(p => {
        if (!['down', 'final', 'deposit', 'deposit_refund', 'refund'].includes(p.kind)) return;
        const ok = ZPAY.counted(p);
        rows.push({
          t: p.t || p.at,
          h: `${KIND[p.kind] || 'Payment'} ${peso(p.amount)} ${p.status == 'Submitted' ? 'sent' : ok ? 'confirmed' : esc(String(p.status || '').toLowerCase())}`,
          s: `${p.method ? 'Paid by ' + esc(p.method) : ''}${p.bid ? ' · ' + esc(p.bid) : ''}`.replace(/^ · /, ''),
          p: p.status == 'Submitted' ? pill('Waiting', 'wait') : ok ? pill('Paid', 'ok') : p.status == 'Rejected' ? pill('Rejected', 'bad') : pill(p.status || '', 'mute'),
        });
      });
    const l = rows.filter(r => r.t).sort((a, c) => (a.t < c.t ? 1 : -1)).slice(0, 5);
    return `<section class="zt-card zh-act"><div class="zt-h"><h2>Recent activity</h2><a href="#" data-a="nav" data-v="bookings">See all</a></div>${
      l.length
        ? `<ul>${l.map(r => `<li><span class="n">${day(r.t)}</span><div><b>${r.h}</b><small>${r.s}</small></div>${r.p}</li>`).join('')}</ul>`
        : '<p class="mu">Your bookings, payments and rentals will show here, newest first.</p>'
    }</section>`;
  };
  const startNew = () => {
    const hv = typeof HV != 'undefined' ? HV : [],
      rv = typeof RV != 'undefined' ? RV : [],
      minHaul = hv.length ? Math.min(...hv.map(v => v.base)) : 0,
      minRent = rv.length ? Math.min(...rv.map(v => v.day)) : 0,
      row = (h, s, a, v) => `<button class="zh-go" data-a="${a}" data-v="${v}"><span><b>${h}</b><small>${s}</small></span><i aria-hidden="true">→</i></button>`;
    return `<section class="zt-card zh-new"><h2>Start something new</h2>${row('Book a haul', `Van or truck with a driver${minHaul ? ', from ' + m0(minHaul) : ''}`, 'nav', 'book')}${row('Rent a vehicle', `Self-drive${minRent ? ', from ' + m0(minRent) + ' a day' : ''}`, 'nav', 'rent')}${row('Report a problem', 'Damage, delay or payment issue', 'nav', 'reports')}</section>`;
  };
  const yourTrips = () => {
    const l = (S.bk || []).slice().reverse().slice(0, 3);
    if (!l.length) return '';
    return `<section class="zt-card zh-trips"><h2>Your trips</h2><ul>${l.map(b => `<li><button data-a="trk" data-id="${esc(b.id)}"><span><b class="n">${esc(b.id)}</b><small>${place(b.pu)} → ${place(b.dr)}</small></span>${stPill(b.st)}</button></li>`).join('')}</ul></section>`;
  };

  /* ---------- E01 home ---------- */
  home = function () {
    return `${vbox()}<div class="zh">${hero()}<div class="zh-grid"><div>${activity()}</div><div class="zh-side">${startNew()}${yourTrips()}</div></div></div>`;
  };

  /* ---------- E04 payments tab ---------- */
  const PST = p =>
    p.status == 'Submitted'
      ? pill(p.kind == 'deposit' ? 'Waiting for owner' : 'Waiting for driver', 'wait')
      : ZPAY.counted(p)
        ? p.kind == 'deposit_refund' || p.kind == 'refund'
          ? pill('Refunded', 'ok')
          : pill('Confirmed', 'ok')
        : p.status == 'Rejected'
          ? pill('Rejected', 'bad')
          : p.status == 'Due'
            ? pill(p.kind == 'deposit_refund' ? 'Refund due' : 'Due', 'wait')
            : pill(p.status || '—', 'mute');
  const payTab = () => {
    const mine = (S.pay || []).filter(p => p.payer == S.me.em || p.to == S.me.em || (S.bk || []).some(b => b.id == p.bid) || (S.rn || []).some(r => r.id == p.bid && r.cu == S.me.em));
    const okSum = mine.filter(p => ZPAY.counted(p) && !/refund/.test(p.kind)).reduce((s, p) => s + (+p.amount || 0), 0),
      waitSum = mine.filter(p => p.status == 'Submitted').reduce((s, p) => s + (+p.amount || 0), 0);
    const rows = mine.slice().sort((a, c) => ((a.t || '') < (c.t || '') ? 1 : -1));
    return `<div class="zh-tiles"><div class="ok"><span>Confirmed payments</span><b class="n">${peso(okSum)}</b></div><div class="wait"><span>Waiting for confirmation</span><b class="n">${peso(waitSum)}</b></div></div>${
      rows.length
        ? `<div class="zt-card zh-pay"><table><thead><tr><th>Date</th><th>Booking / rental</th><th>What</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.t ? new Date(p.t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}</td><td><b class="n">${esc(p.bid || '—')}</b></td><td>${KIND[p.kind] || esc(p.kind || '')}</td><td>${esc(p.method || '—')}</td><td><b class="n">${peso(p.amount)}</b></td><td>${PST(p)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="zb-card zb-empty"><h2>No payments yet</h2><p>Down payments, balances and rental deposits show here once you pay.</p></div>`
    }`;
  };
  const _bookings = bookings;
  bookings = function () {
    if ((msg.bt || 'act') != 'pay') return _bookings();
    const tabs = [
      ['act', 'Active'],
      ['past', 'Past'],
      ['pay', 'Payments'],
    ]
      .map(x => `<button class="zb-tab${x[0] == 'pay' ? ' on' : ''}" data-a="bt" data-v="${x[0]}" aria-pressed="${x[0] == 'pay'}">${x[1]}</button>`)
      .join('');
    return `<div class="zb-page"><h1>My bookings</h1><div class="zb-tabs">${tabs}</div>${payTab()}</div>`;
  };

  /* ---------- E07 settings → mode ---------- */
  const me = () => S.users.find(u => u.em == S.me.em) || {};
  const role = t => (me().roles || []).find(r => r.t == t);
  const inProgress = () => (S.bk || []).find(b => ['Items Loaded', 'In Transit', 'Arrived at Destination'].includes(b.st));
  const modeCard = (w, name, dot, desc) => {
    const cur = (S.ws || 'customer') == w,
      r = w == 'customer' ? { st: 'approved' } : role(w),
      busy = inProgress();
    let tag = '',
      act = '';
    if (cur) tag = pill('Current mode', 'ok');
    else if (r && r.st == 'approved') {
      tag = pill('Approved' + (r.at ? ' ' + new Date(r.at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''), 'ok');
      act = busy && w != 'customer' ? '<button class="zb-btn sec" disabled>Switch after delivery</button>' : `<button class="zb-btn sec" data-a="w-ws" data-w="${w}">Switch to ${name.toLowerCase()} mode</button>`;
    } else if (r && r.st == 'pending') tag = pill('Application under review', 'wait');
    else if (r && r.st == 'rejected') {
      tag = pill('Not approved', 'bad');
      act = `<button class="zb-btn sec" data-a="w-ws" data-w="account">See why</button>`;
    } else {
      tag = pill('Not applied', 'mute');
      act = `<button class="zb-btn sec" data-a="w-ws" data-w="account">Apply as ${name.toLowerCase()}</button><p class="zh-fine">An admin reviews your application, then meets you for an interview and orientation.</p>`;
    }
    return `<div class="zh-mode${cur ? ' on' : ''}"><span class="zh-dot ${dot}"><i></i></span><h3>${name}</h3><p>${desc}</p>${tag}${act}</div>`;
  };
  const modePanel = () => {
    const w = S.ws || 'customer',
      busy = inProgress(),
      what = { customer: 'You book hauls and rent vehicles.', driver: 'You accept haul requests and drive trips.', owner: 'You list vehicles and assign drivers.', account: 'You see your roles and applications.' }[w] || '';
    const label = { customer: 'Customer mode', driver: 'Driver mode', owner: 'Car owner mode', account: 'Account overview' }[w] || w;
    return `<section class="zh-modes" id="mode"><div class="zh-now"><i aria-hidden="true"></i>You are using ZamMove in <b>${label}</b>. ${what}</div><h2>Switch mode</h2><p class="mu">Switching changes your menu and home screen. Your bookings, rentals and payments stay on your account.</p><div class="zh-mgrid">${modeCard('customer', 'Customer', 'g', 'Book hauls and rent self-drive vehicles.')}${modeCard('driver', 'Driver', 'b', 'Accept haul requests, drive trips and earn per trip.')}${modeCard('owner', 'Car owner', 'o', 'List your vehicles for rent and assign drivers.')}</div>${busy && ['driver', 'owner'].some(t => (role(t) || {}).st == 'approved') ? `<p class="zh-warn">You can’t switch while you have a trip in progress. <b>${esc(busy.id)}</b> must be delivered first.</p>` : ''}</section>`;
  };
  const layoutSettings = () => {
    const app = $('#app');
    if (!app || app.querySelector('.zh-modes')) return;
    const h1 = app.querySelector('h1');
    if (h1) h1.insertAdjacentHTML('afterend', modePanel());
    else app.insertAdjacentHTML('afterbegin', modePanel());
  };

  /* ---------- header: "Customer mode · Switch" badge ---------- */
  const BADGE = { customer: ['Customer mode', 'g'], driver: ['Driver mode', 'b'], owner: ['Car owner mode', 'o'], account: ['Account overview', 'm'], admin: ['Admin mode', 'm'], cashier: ['Cashier mode', 'm'] };
  const badge = () => {
    const sm = document.querySelector('#wsm > summary');
    if (!sm || !S.me) return;
    const [t, c] = BADGE[S.ws || 'customer'] || [S.ws, 'm'];
    /* staff workspaces have a long menu: the badge drops the "Switch" word there (as in Figma F01 / H01) */
    const html = `<span class="zh-badge ${c}"><i aria-hidden="true"></i><b>${esc(t)}</b>${(S.ws || 'customer') == 'customer' ? '<u>Switch</u>' : ''}</span>`;
    if (sm.dataset.zh != t) {
      sm.innerHTML = html;
      sm.dataset.zh = t;
      sm.setAttribute('aria-label', `${t}. Switch mode`);
    }
  };

  /* ---------- actions ---------- */
  window.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a="zh-retry"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (offline()) return toast('Still offline. Check your data or Wi-Fi.');
      render();
    },
    true
  );

  /* ---------- render hook ---------- */
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    try {
      if (!offline()) lastSync = Date.now();
      if (S.me) {
        badge();
        if (view == 'settings' && (S.ws || 'customer') == 'customer') layoutSettings();
        const app = $('#app'),
          old = app && app.querySelector(':scope > .zh-off'),
          bar = offBar();
        if (old) old.remove();
        if (app && bar) app.insertAdjacentHTML('afterbegin', bar);
      }
    } catch (e) {
      console.error('[zammove] home layer', e);
    }
    return out;
  };
  render();
})();
