'use strict';
/**
 * admin-ui.js — admin panel redesign from Figma ("NEW SCREENS: build these", I01–I12).
 *
 *   Layout   Left sidebar with grouped pages (Operations, Fleet & rentals, People, Money, System)
 *            instead of the top tabs. Every existing page stays; Live map and Verification are new.
 *   I01      Overview: today's numbers, live map, "Needs a decision" (oldest first, with one action
 *            each) and "On the road" with each trip's last location update.
 *   I02      Bookings: a banner per booking nobody accepted with a driver picker and Assign (the server
 *            already had adminAssign; the panel had no button for it), All / Live / Waiting / Delivered
 *            tabs, Download CSV. Interrupted trips and "Stop a trip" stay above the table.
 *   I03      Live map: every driver sharing location, with the last update and "Call driver".
 *   I04      Verification: pre-departure checks per trip (Start PIN, plate, cargo checklist, customer
 *            confirmation), with Call driver, Waive customer confirmation and Stop trip.
 *   I05/I05c Applications: stage tabs, applicant list and detail, and a confirm dialog before rejecting.
 *   I06–I12  Vehicles, rentals, incidents, payments, settings, staff and audit log keep their content and
 *            actions and get the new look (admin-ui.css); payments and the audit log get Download CSV.
 *
 * admin.js still owns the data, the actions and render(); this file adds pages to P, regroups
 * SECTIONS and handles its own buttons (zad-*), so every existing action keeps working.
 */
(() => {
  /* ---------- helpers ---------- */
  const hm = t => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
  const place = s => esc(String(s || '').split(',')[0]);
  const ago = t => {
    const s = Math.max(0, (Date.now() - new Date(t)) / 1000);
    return s < 60 ? Math.round(s) + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d';
  };
  const fmtWhen = b => {
    const d = new Date(b.dt + 'T' + (b.tm || '00:00'));
    return isNaN(d) ? esc(b.dt + ' ' + (b.tm || '')) : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  };
  const mono = s => `<span class="zad-mono">${esc(s)}</span>`;
  const dot = (t, tone = '') => `<span class="zad-dot ${tone ? 'z-' + tone : ''}">${t}</span>`;
  const evAt = (b, st) => ((b.ev || []).find(x => x.to == st) || {}).t || '';
  const lastEv = b => (b.ev || [])[(b.ev || []).length - 1] || {};
  const isToday = t => t && String(t).slice(0, 10) == today();
  const LIVE = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'];
  const TRACK = ['On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded', 'In Transit', 'Arrived at Destination'];
  const DONE = ['Completed'];
  const plateOf = b => (vOf(b.veh) || {}).plate || '—';
  const gpsAge = b => (b.gps && b.gps.t ? (Date.now() - new Date(b.gps.t)) / 1000 : null);
  const signal = b => {
    const a = gpsAge(b);
    if (a == null) return dot('Not sharing yet', 'mute');
    return a > 120 ? dot('Signal lost ' + ago(b.gps.t), 'warn') : dot(ago(b.gps.t) + ' ago', 'ok');
  };
  const DOING = {
    Accepted: 'Accepted, not left yet',
    'On the Way to Pickup': 'Going to pickup',
    'Awaiting Down Payment': 'At pickup, collecting down payment',
    'Down Payment Confirmed': 'Loading',
    'Items Loaded': 'Pre-departure checks',
    'In Transit': b => 'In transit to ' + place(b.dr),
    'Arrived at Destination': b => 'Arrived in ' + place(b.dr),
    'Delivery Confirmation': 'Delivered, collecting balance',
    'Awaiting Final Payment': 'Collecting balance',
  };
  const doing = b => {
    const d = DOING[b.st];
    return typeof d == 'function' ? d(b) : d || esc(b.st);
  };
  const waiting = () => S.bk.filter(b => !b.drvUser && ['Pending', 'No driver found'].includes(b.st));
  const verQueue = () =>
    S.bk
      .filter(b => b.st == 'Items Loaded' || (b.st == 'Down Payment Confirmed' && b.drvUser) || (b.ver && b.ver.auth && isToday(b.ver.auth.t)))
      .slice()
      .reverse();
  const openDisc = b => ((b.ver && b.ver.disc) || []).filter(d => d.status == 'open');
  /* on hold: an open discrepancy, or checks still running 15 minutes after loading */
  const verHold = b => b.st == 'Items Loaded' && (openDisc(b).length > 0 || Date.now() - new Date(evAt(b, 'Items Loaded') || Date.now()) > 15 * 6e4);

  /* ---------- CSV ---------- */
  const csv = (name, head, rows) => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const blob = new Blob(['﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zammove-${name}-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 500);
  };
  const CSV = {
    bk: () =>
      csv(
        'bookings',
        ['Booking', 'Date', 'Time', 'Pickup', 'Drop-off', 'Customer', 'Driver', 'Vehicle', 'Fare', 'Status'],
        S.bk.map(b => [b.id, b.dt, b.tm, b.pu, b.dr, nm(b.cu), b.drvUser ? nm(b.drvUser) : '', b.vn, b.tot, b.st])
      ),
    pay: () =>
      csv(
        'payments',
        ['Date', 'Ref', 'Kind', 'Method', 'Amount', 'Reference / receipt', 'Payer', 'Collected by', 'Status'],
        S.pay.map(p => [day(p.t), p.bid, p.kind, p.method, p.amount, p.ref, nm(p.payer), p.by ? nm(p.by) : '', p.status])
      ),
    log: () => csv('audit-log', ['Time', 'Who', 'What happened', 'Details'], (S.au || []).map(l => [ts(l.t), l.who || '', l.evt || '', JSON.stringify(l.data || {})])),
  };
  const csvBtn = k => `<button class="btn o sm zad-csv" data-a="zad-csv" data-k="${k}">Download CSV</button>`;

  /* ---------- sidebar: flat pages in groups ---------- */
  const GROUPS = [
    ['Operations', [['dash', 'Overview', 'home', 'a'], ['bk', 'Bookings', 'list', 's'], ['map', 'Live map', 'car', 's'], ['ver', 'Verification', 'doc', 's'], ['inc', 'Incidents', 'list', 's']]],
    ['Fleet & rentals', [['rn', 'Rentals', 'car', 'f'], ['veh', 'Vehicles', 'car', 'f'], ['asg', 'Assignments', 'car', 'f']]],
    ['People', [['apps', 'Applications', 'doc', 'f'], ['users', 'Users', 'users', 'f'], ['staff', 'Staff', 'users', 'S']]],
    ['Money', [['pay', 'Payments', 'cash', 'c'], ['rem', 'Remittances', 'cash', 'c'], ['sum', 'Settlements', 'cash', 'c'], ['rep', 'Reports', 'list', 'c']]],
    ['System', [['set', 'Settings', 'gear', 'f'], ['cat', 'Catalog & fuel', 'car', 'f'], ['fix', 'Corrections', 'gear', 'f'], ['log', 'Audit log', 'list', 'f']]],
  ];
  const GROUP_OF = Object.fromEntries(GROUPS.flatMap(g => g[1].map(x => [x[0], g[0]])));
  SECTIONS.splice(0, SECTIONS.length, ...GROUPS.flatMap(g => g[1]));
  const _todo = todo;
  window.zadCounts = () => ({ ..._todo(), bk: _todo().bk + waiting().length, ver: S.bk.filter(verHold).length });
  /* page ids moved from sub-tabs to the sidebar: remember the right one */
  if (!SECTIONS.some(s => s[0] == page)) page = 'dash';
  const decorateNav = () => {
    const nav = document.getElementById('nav');
    if (!nav || nav.dataset.zad == nav.innerHTML.length) return;
    nav.querySelectorAll('.zad-grp').forEach(x => x.remove());
    let last = '';
    nav.querySelectorAll('a[data-p]').forEach(a => {
      const g = GROUP_OF[a.dataset.p];
      if (g && g != last) a.insertAdjacentHTML('beforebegin', `<span class="zad-grp" aria-hidden="true">${g}</span>`);
      last = g;
      const n = window.zadCounts()[a.dataset.p];
      const nb = a.querySelector('.nb');
      if (n && !nb) a.insertAdjacentHTML('beforeend', `<span class="nb" aria-label="${n} waiting">${n}</span>`);
      else if (nb && n) nb.textContent = n;
    });
    nav.dataset.zad = nav.innerHTML.length;
  };

  /* ---------- map (Leaflet, same tiles as the customer app) ---------- */
  const ZC = [6.9214, 122.079];
  let maps = {};
  const mountMaps = () => {
    document.querySelectorAll('.zad-map[data-map]').forEach(el => {
      if (el.dataset.ready) return;
      el.dataset.ready = 1;
      if (!window.L) {
        el.innerHTML = '<div class="zad-maperr">The map could not load (no connection to the map service). The list below still updates.</div>';
        return;
      }
      try {
        const m = L.map(el, { zoomControl: true, attributionControl: true }).setView(ZC, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
        const pts = [];
        S.bk
          .filter(b => TRACK.includes(b.st) && b.gps && b.gps.lat)
          .forEach(b => {
            const lost = gpsAge(b) > 120;
            const icon = L.divIcon({ className: '', html: `<span class="zad-pin${lost ? ' warn' : ''}">🚚 ${esc(b.id)}</span>`, iconSize: null });
            L.marker([b.gps.lat, b.gps.lng], { icon }).addTo(m).bindTooltip(`${esc(nm(b.drvUser))} · ${esc(plateOf(b))}`);
            pts.push([b.gps.lat, b.gps.lng]);
          });
        if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
        else if (pts.length) m.setView(pts[0], 14);
        maps[el.dataset.map] = m;
      } catch (e) {
        el.innerHTML = '<div class="zad-maperr">The map could not load. The list below still updates.</div>';
      }
    });
  };

  /* ---------- I01 Overview ---------- */
  const decisions = () => {
    const l = [];
    waiting().forEach(b => l.push({ t: b.cr || evAt(b, 'Pending'), h: b.st == 'No driver found' ? 'No driver found' : 'No driver has accepted', s: `${b.id} · ${place(b.pu)} → ${place(b.dr)}`, a: 'Assign', p: 'bk', hot: 1, g: 's' }));
    S.bk.filter(b => b.st == 'Interrupted').forEach(b => l.push({ t: lastEv(b).t, h: 'Trip stopped, needs a decision', s: `${b.id} · ${nm(b.drvUser)}`, a: 'Decide', p: 'bk', hot: 1, g: 's' }));
    S.bk.filter(verHold).forEach(b => l.push({ t: evAt(b, 'Items Loaded'), h: openDisc(b).length ? 'Discrepancy to resolve: ' + esc(openDisc(b)[0].type) : b.ver && b.ver.chk && !b.ver.chk.done ? 'Cargo checklist incomplete' : 'Pre-departure checks on hold', hot: openDisc(b).length ? 1 : 0, s: `${b.id} · ${nm(b.drvUser)}`, a: 'Check', p: 'ver', g: 's' }));
    (S.rem || []).filter(r => ['Submitted', 'Discrepancy'].includes(r.st)).forEach(r => l.push({ t: r.t || r.at || r.sub, h: r.st == 'Discrepancy' ? 'Remittance discrepancy' : 'Cash remittance to verify', s: `${peso(r.due || 0)} · ${nm(r.drv)}`, a: 'Verify', p: 'rem', g: 'c' }));
    (S.inc || []).filter(c => c.kind == 'change' && c.st == 'Submitted').forEach(c => l.push({ t: c.t || (c.log && c.log[0] && c.log[0].t), h: 'Wrong change reported', s: `${c.id} · ${c.bid} · ${peso(c.amt || 0)} from ${nm(c.driver)}`, a: 'Decide', p: 'pay', g: 'c' }));
    (S.inc || []).filter(c => c.kind == 'accident' && !['Closed', 'Withdrawn'].includes(c.st) && !c.decision).forEach(c => l.push({ t: c.t, h: `EMERGENCY: accident${c.hurt == 'yes' ? ', someone hurt' : ''}`, s: `${c.id} · ${c.bid} · ${nm(c.by)}`, a: 'Open', p: 'inc', hot: 1, g: 's' }));
    (S.inc || []).filter(c => c.kind != 'change' && c.kind != 'accident' && c.st == 'Submitted').forEach(c => l.push({ t: c.t || (c.log && c.log[0] && c.log[0].t), h: `${esc(c.cat || 'Incident')} reported`, s: `${c.id}${c.bid ? ' · ' + c.bid : ''}`, a: 'Review', p: 'inc', g: 's' }));
    (S.apps || []).filter(a => !['Approved', 'Rejected'].includes(a.st)).forEach(a => l.push({ t: (a.hist && a.hist[0] && a.hist[0].t) || a.t, h: `${a.role == 'owner' ? 'Vehicle owner' : 'Driver'} application`, s: `${a.id} · ${nm(a.user)}`, a: 'Review', p: 'apps', g: 'f' }));
    S.vh.filter(v => v.approval == 'Pending Approval').forEach(v => l.push({ t: v.t || v.cr, h: 'Vehicle to approve', s: `${v.plate || ''} · ${nm(v.owner)}`, a: 'Approve', p: 'veh', g: 'f' }));
    return l.filter(x => allow(x.g)).sort((a, c) => (!a.t) - (!c.t) || ((a.t || '') < (c.t || '') ? -1 : 1));
  };
  const roadRows = l =>
    l.length
      ? l
          .map(b => {
            const leg2 = ['Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'].includes(b.st),
              ix = LIVE.indexOf(b.st),
              pct = Math.max(8, Math.min(100, Math.round(((leg2 ? ix - 4 : ix) / (leg2 ? 4 : 4)) * 100))),
              lost = gpsAge(b) > 120,
              from = leg2 ? place(b.pu) : 'Driver',
              to = leg2 ? place(b.dr) : place(b.pu) + ' pickup',
              left = leg2 ? evAt(b, 'In Transit') : evAt(b, 'On the Way to Pickup');
            return `<div class="zad-road"><div><b>${mono(b.id)}</b><span>${esc(nm(b.drvUser))} · ${mono(plateOf(b))}</span>${signal(b)}</div><div class="zad-leg"><div class="zad-legh"><span>${left ? 'Left ' + hm(left) : esc(doing(b))}</span><span class="${lost ? 'warn' : ''}">${lost ? 'Last seen ' + hm(b.gps.t) : esc(b.st)}</span></div><div class="zad-bar${lost ? ' warn' : ''}"><i style="width:${pct}%"></i><em style="left:${pct}%">🚚</em></div><div class="zad-legh mu"><span>${from}</span><span>${to}</span></div></div></div>`;
          })
          .join('')
      : '<div class="empty">No trips are on the road.</div>';
  P.dash = () => {
    const now = new Date(),
      today_ = S.bk.filter(b => isToday(b.cr)),
      road = S.bk.filter(b => b.drvUser && LIVE.includes(b.st)),
      deliv = S.bk.filter(b => isToday(evAt(b, 'Delivery Confirmation') || evAt(b, 'Completed'))),
      coll = r2(S.pay.filter(p => counted(p) && isToday(p.t) && !/refund|payout/.test(p.kind)).reduce((s, p) => s + p.amount, 0)),
      dec = decisions();
    const dl = dec.length
      ? `<ul class="zad-dec">${dec
          .slice(0, 8)
          .map(x => `<li><b class="${x.hot ? 'hot' : ''}">${x.t ? ago(x.t) : '—'}</b><div><span>${x.h}</span><small>${esc(x.s)}</small></div><button class="zad-act" data-a="go" data-p="${x.p}">${x.a}</button></li>`)
          .join('')}</ul>`
      : '<div class="empty">All caught up. Nothing is waiting for you.</div>';
    return `<div class="zad-top"><h1>Overview</h1><span class="mu">${now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} · ${hm(now)}</span></div><p class="zad-sum"><b>${today_.length}</b> booking${today_.length == 1 ? '' : 's'} today · <b>${road.length}</b> on the road · <b>${deliv.length}</b> delivered · <b>${peso(coll)}</b> collected</p>${msg()}
<div class="zad-grid"><div class="zad-col">${lv() ? `<section class="card zad-mapc"><div class="zad-map" data-map="dash"></div></section>` : ''}<section class="card"><div class="zad-ch"><h2>On the road</h2>${lv() ? '<a href="#" data-a="go" data-p="map">Live map →</a>' : ''}</div>${roadRows(road)}</section></div><section class="card"><h2>Needs a decision</h2>${dl}</section></div>`;
  };

  /* ---------- I03 Live map ---------- */
  P.map = () => {
    const l = S.bk.filter(b => b.drvUser && TRACK.includes(b.st)),
      sharing = l.filter(b => b.gps && gpsAge(b) < 600).length;
    return `<div class="zad-top"><h1>Live map</h1><span class="mu">${sharing} driver${sharing == 1 ? '' : 's'} sharing</span></div>${msg()}<section class="card zad-mapc"><div class="zad-map big" data-map="live"></div></section><section class="card zad-tbl">${tbl(
      ['Booking', 'Driver', 'Plate', 'Doing', 'Last update', ''],
      l.map(b => {
        const d = U(b.drvUser) || {};
        return [mono(b.id), esc(d.name || b.drvUser), mono(plateOf(b)), esc(doing(b)), signal(b), d.ph ? `<a class="zad-act" href="tel:${esc(d.ph)}">Call driver</a>` : ''];
      }),
      'No driver is on a trip right now.'
    )}</section><p class="mu zad-foot">Sharing starts at pickup and stops by itself at delivery.</p>`;
  };

  /* ---------- I04 Verification ---------- */
  let verSel = null;
  const checks = b => {
    const v = b.ver || {},
      c = v.chk,
      items = v.items || [],
      miss = c && c.items ? items.filter((x, i) => !c.items[i]).map(x => x.n || x.name || '') : [],
      cust = U(b.cu) || {};
    const row = (h, s, st) => `<li><div><b>${h}</b><small>${s}</small></div>${st}</li>`;
    const PASS = dot('Passed', 'mute'),
      WAIT = dot('Waiting', 'wait'),
      BAD = t => dot(t, 'bad');
    return `<ul class="zad-chk">${row('Start PIN', v.pinOk ? `Given by customer at ${hm(v.pinOk.t)}` : 'The driver asks the customer for it after loading', v.pinOk ? PASS : WAIT)}${row(
      'Vehicle plate',
      v.plate ? (v.plate.match ? `Matches ${esc(plateOf(b))}` : `Entered ${esc(v.plate.entered)}, assigned ${esc(plateOf(b))}`) : 'Not checked yet',
      v.plate ? (v.plate.match ? PASS : BAD('Mismatch')) : WAIT
    )}${row(
      'Driver cargo checklist',
      c ? (c.done ? `${c.count} pieces counted, every item ticked` : `${miss.length} of ${items.length} items not ticked${miss.length ? ': ' + esc(miss.join(', ')) : ''}`) : 'Not saved yet',
      c ? (c.done ? PASS : BAD('Incomplete')) : WAIT
    )}${row(
      'Customer confirmation',
      v.cconf ? `Confirmed at ${hm(v.cconf.t)}` : v.exc ? `Waived by ${esc(nm(v.exc.by))}: ${esc(v.exc.reason)}` : `Waiting for ${esc(String(cust.name || 'the customer').split(' ')[0])} to confirm the list`,
      v.cconf || v.exc ? PASS : WAIT
    )}${(v.disc || []).filter(d => d.status == 'open').length ? row('Discrepancy', 'Departure is blocked until it is resolved below', BAD('Open')) : ''}</ul>`;
  };
  /* discrepancies: what was reported, and the resolution (an administrator's, or automatic when the driver corrected it) */
  const discBox = b => {
    const L = (b.ver && b.ver.disc) || [];
    if (!L.length) return '';
    return `<h3 class="zad-h3">Discrepancies</h3>${L.slice()
      .reverse()
      .map(d => {
        const op = d.status == 'open',
          who = d.by == 'system' ? 'the system' : esc(nm(d.by));
        return `<div class="zad-disc${op ? ' open' : ''}"><div class="zad-ch"><b>${esc(d.type)}</b>${op ? dot('Open', 'bad') : dot('Resolved', 'mute')}</div><p class="zad-line">${esc(d.note || '')}</p><p class="mu zad-line">${esc(d.id)} · reported ${hm(d.t)} by ${who}</p>${
          op
            ? full()
              ? `<div class="ad-row"><input id="f-${esc(b.id)}-rs-${esc(d.id)}" placeholder="What you checked and decided, e.g. called the customer: a lamp was added" aria-label="Resolution">${/items/i.test(d.type) ? `<input id="f-${esc(b.id)}-rm-${esc(d.id)}" type="number" min="0" placeholder="Correct booked count (optional)" aria-label="Correct booked count" style="max-width:240px">` : ''}<button class="btn sm" data-a="zad-resolve" data-id="${esc(b.id)}" data-d="${esc(d.id)}">Resolve</button></div><p class="mu zad-line">Call the driver or the customer first. ${d.auto == 'plate' ? 'If the driver enters the correct plate, this closes by itself.' : d.auto == 'count' ? 'If the driver recounts the booked number, this closes by itself.' : ''}</p>`
              : '<p class="mu zad-line">An administrator resolves it.</p>'
            : `<p class="zad-line"><b>Resolution:</b> ${esc(d.res || '')} <span class="mu">(${d.resBy == 'system' ? 'automatic' : esc(nm(d.resBy))}, ${hm(d.resT)})</span></p>`
        }</div>`;
      })
      .join('')}`;
  };
  P.ver = () => {
    const l = verQueue();
    if (!l.length) return `<div class="zad-top"><h1>Verification</h1></div>${msg()}<div class="card empty">No trip is in pre-departure checks right now.</div>`;
    const b = l.find(x => x.id == verSel) || l[0],
      v = b.ver || {},
      d = U(b.drvUser) || {},
      veh = vOf(b.veh) || {},
      canWaive = full() && v.pinOk && v.chk && v.chk.done && !v.cconf && !v.exc && b.st == 'Items Loaded';
    const st = x => (x.ver && x.ver.auth ? dot('Passed ' + hm(x.ver.auth.t), 'mute') : verHold(x) ? dot('On hold', 'wait') : x.st == 'Items Loaded' ? dot('In progress', 'ok') : dot('Not started', 'mute'));
    return `<div class="zad-top"><h1>Verification</h1></div>${msg()}<div class="zad-split"><section class="card zad-list"><table class="zad-mini"><thead><tr><th>Trip</th><th>Check</th></tr></thead><tbody>${l
      .map(x => `<tr class="${x.id == b.id ? 'on' : ''}"><td><button data-a="zad-ver" data-id="${esc(x.id)}">${mono(x.id)}</button></td><td>${st(x)}</td></tr>`)
      .join('')}</tbody></table></section><section class="card zad-detail"><div class="zad-ch"><h2>${mono(b.id)} <span class="mu">pre-departure</span></h2>${verHold(b) ? dot('On hold ' + ago(evAt(b, 'Items Loaded')), 'wait') : v.auth ? dot('Departure authorized', 'ok') : ''}</div><p class="mu zad-line">${esc(d.name || '')} · ${esc(String(veh.color || '').toLowerCase())} ${esc(veh.model || b.vn)} · ${mono(plateOf(b))} · ${place(b.pu)} → ${place(b.dr)} · customer ${esc(nm(b.cu))}</p>${checks(b)}${discBox(b)}${
      b.st == 'Items Loaded' && lv()
        ? `<div class="zad-acts">${d.ph ? `<a class="btn sm" href="tel:${esc(d.ph)}">Call driver</a>` : ''}${canWaive ? `<details class="zad-more"><summary class="btn o sm">Waive customer confirmation</summary><div class="ad-row"><input id="f-${esc(b.id)}-exc" placeholder="Why (at least 10 characters), e.g. customer confirmed by phone" aria-label="Reason"><button class="btn sm" data-a="zad-waive" data-id="${esc(b.id)}">Waive</button></div></details>` : ''}<details class="zad-more"><summary class="btn o sm zad-danger">Stop trip</summary><div class="ad-row"><input type="hidden" id="f-stopb" value="${esc(b.id)}"><input id="f-stopw" placeholder="What happened (10+ characters)" aria-label="What happened"><button class="btn sm d" data-a="tstop">Stop trip</button></div></details></div>`
        : ''
    }</section></div>`;
  };

  /* ---------- I02 Bookings ---------- */
  let bt = 'all';
  const _bk = P.bk;
  P.bk = () => {
    /* keep the interrupted-trip decisions and "Stop a trip" from the old page */
    const tpl = document.createElement('template');
    tpl.innerHTML = _bk();
    const cards = [...tpl.content.querySelectorAll('section.card')].filter(c => c.querySelector('h2'));
    const keep = cards.map(c => c.outerHTML).join('');
    const w = waiting();
    const free = d => !S.bk.some(b => b.drvUser == d.em && LIVE.includes(b.st));
    const dOpts = drivers()
      .map(d => {
        const a = asgOfDrv(d.em),
          v = a ? vOf(a.vehicle) : null;
        return `<option value="${esc(d.em)}">${esc(d.name)}${v ? ' · ' + esc(v.model || '') : ' · no vehicle'} · ${free(d) ? 'free now' : 'on a trip'}</option>`;
      })
      .join('');
    const banners = full()
      ? w
          .map(b => {
            const t = b.cr || evAt(b, 'Pending');
            return `<section class="card zad-wait"><span class="zad-dot z-bad"><b>Waiting ${t ? ago(t) : ''}</b></span><span>${mono(b.id)} ${place(b.pu)} → ${place(b.dr)} · ${fmtWhen(b)} · ${esc(b.vn)} · ${b.st == 'No driver found' ? 'no driver found' : 'no driver accepted'}</span><select id="f-as-${esc(b.id)}" aria-label="Driver for ${esc(b.id)}">${dOpts}</select><button class="btn sm" data-a="zad-assign" data-id="${esc(b.id)}">Assign</button></section>`;
          })
          .join('')
      : '';
    const T = {
      all: () => true,
      live: b => LIVE.includes(b.st),
      wait: b => ['Pending', 'No driver found'].includes(b.st),
      done: b => DONE.includes(b.st),
    };
    const cnt = k => S.bk.filter(T[k]).length;
    const q = bq.toLowerCase();
    const l = S.bk
      .filter(T[bt] || T.all)
      .filter(b => !q || [b.id, b.pu, b.dr, nm(b.cu), nm(b.drvUser), b.st].some(x => String(x || '').toLowerCase().includes(q)))
      .slice()
      .reverse();
    const stCell = b => {
      if (b.st == 'Completed') return `<span class="mu">Delivered ${new Date(evAt(b, 'Completed') || b.cr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>`;
      if (['Pending', 'No driver found'].includes(b.st)) return dot(`No driver, ${ago(b.cr || evAt(b, 'Pending'))}`, 'bad');
      if (TRACK.includes(b.st) && gpsAge(b) > 120) return dot('Signal lost ' + ago(b.gps.t), 'warn');
      if (b.st == 'Items Loaded' && verHold(b)) return dot('Checks on hold', 'warn');
      if (['Cancelled', 'Rejected', 'Interrupted'].includes(b.st)) return dot(esc(b.st), 'bad');
      return dot(esc(b.st), 'ok');
    };
    const tabs = [
      ['all', 'All'],
      ['live', 'Live'],
      ['wait', 'Waiting'],
      ['done', 'Delivered'],
    ]
      .map(x => `<button class="zad-tab${bt == x[0] ? ' on' : ''}" data-a="zad-bt" data-v="${x[0]}" aria-pressed="${bt == x[0]}">${x[1]} ${cnt(x[0])}</button>`)
      .join('');
    return `<div class="zad-top"><h1>Bookings</h1>${csvBtn('bk')}</div>${msg()}${banners}${keep}<div class="zad-tabs">${tabs}<input id="f-bq" type="search" placeholder="Search booking, place, person or status" aria-label="Search bookings" value="${esc(bq)}"></div><section class="card zad-tbl">${tbl(
      ['Booking', 'Route', 'Customer', 'Driver', 'Fare', 'Status'],
      l.map(b => [
        `<details class="zad-ev"><summary>${mono(b.id)}</summary>${(b.ev || []).map(e => `<div class="ad-ev">${ts(e.t)} ${esc(e.to)}${e.note ? ': ' + esc(e.note) : ''}</div>`).join('')}</details>`,
        `${place(b.pu)} → ${place(b.dr)}`,
        b.cu ? userLink(b.cu) : '—',
        b.drvUser ? userLink(b.drvUser) : '—',
        `<b class="zad-amt">${peso(b.tot)}</b>`,
        stCell(b),
      ]),
      'No bookings.'
    )}</section>`;
  };

  /* ---------- I05 / I05c Applications ---------- */
  let apSt = 'Under Verification',
    apSel = null,
    apRej = null;
  /* interview guide: answers being typed live here until saved, so a background refresh never loses them */
  const ivDraft = {};
  const IVR = [['pass', 'Pass', 'ok'], ['concern', 'Concern', 'wait'], ['fail', 'Fail', 'bad']];
  const ivQs = a => (((S.rules || {}).IVQ || {})[a.role] || []);
  const ivState = a =>
    ivDraft[a.id] || { ans: JSON.parse(JSON.stringify((a.ivr && a.ivr.ans) || {})), sum: (a.ivr && a.ivr.sum) || '' };
  const ivCount = (a, d) => {
    const Q = ivQs(a),
      done = Q.filter(q => (d.ans[q.id] || {}).r).length,
      fail = Q.filter(q => (d.ans[q.id] || {}).r == 'fail').length;
    return `${done} of ${Q.length} answered${fail ? ` · <b class="zad-ivf">${fail} failed</b>` : ''}`;
  };
  const ivGuide = a => {
    const Q = ivQs(a),
      edit = a.st == 'Interview Scheduled';
    if (!Q.length || (!edit && !a.ivr)) return '';
    const d = ivState(a),
      saved = a.ivr ? `Saved ${day(a.ivr.t)} ${hm(a.ivr.t)} by ${esc(nm(a.ivr.by))}` : 'Not saved yet';
    const rows = Q.map((q, i) => {
      const x = d.ans[q.id] || { r: '', n: '' },
        opts = q.opts || [],
        pick = opts.find(o => o.id == x.a);
      if (!edit) {
        const R = IVR.find(r => r[0] == x.r),
          said = [pick && pick.t, x.n && 'Other: ' + x.n].filter(Boolean).join(' · ');
        return `<li><div><b>${i + 1}. ${esc(q.q)}</b><small>${said ? esc(said) : 'No answer recorded'}</small></div>${R ? dot(R[1], R[2]) : dot('No result', 'mute')}</li>`;
      }
      const tone = r => (IVR.find(z => z[0] == r) || [])[2] || '';
      return `<li class="zad-ivq"><fieldset><legend><b>${i + 1}. ${esc(q.q)}</b><small>${esc(q.hint)}</small></legend>${
        opts.length
          ? `<span class="zad-ivk">Applicant\u2019s answer</span><div class="zad-ivo" role="radiogroup">${opts
              .map(o => `<label class="${x.a == o.id ? 'on' : ''}"><input type="radio" name="iva-${esc(a.id)}-${q.id}" value="${o.id}" data-iv="${esc(a.id)}" data-q="${q.id}" data-ivo="1" ${x.a == o.id ? 'checked' : ''}><i class="z-${tone(o.r)}" aria-hidden="true"></i>${esc(o.t)}</label>`)
              .join('')}</div>`
          : ''
      }<span class="zad-ivk">Result${opts.length ? ' <em>(set by the answer; change it if needed)</em>' : ''}</span><div class="zad-seg" role="radiogroup">${IVR.map(
        ([v, l, t]) =>
          `<label class="${x.r == v ? 'on z-' + t : ''}"><input type="radio" name="iv-${esc(a.id)}-${q.id}" value="${v}" data-iv="${esc(a.id)}" data-q="${q.id}" ${x.r == v ? 'checked' : ''}>${l}</label>`
      ).join('')}</div><input type="text" class="zad-ivn" data-iv="${esc(a.id)}" data-q="${q.id}" maxlength="400" aria-label="Other answer for question ${i + 1}" placeholder="${ivPh(x)}" value="${esc(x.n || '')}"></fieldset></li>`;
    }).join('');
    const sum = edit
      ? `<label class="zad-ivs" for="iv-sum-${esc(a.id)}">Overall impression (optional)</label><textarea id="iv-sum-${esc(a.id)}" rows="2" data-iv="${esc(a.id)}" data-sum="1" placeholder="e.g. Experienced, calm, knows the city well.">${esc(d.sum)}</textarea>`
      : d.sum
        ? `<p class="zad-line"><b>Overall:</b> ${esc(d.sum)}</p>`
        : '';
    return `<section class="zad-iv-g"><div class="zad-ch"><h3>Interview guide</h3><span class="mu" data-ivc="${esc(a.id)}">${ivCount(a, d)}</span></div>${
      edit
        ? '<p class="mu zad-line">Ask each question and tap the answer closest to what the applicant said; it sets the result. Type in the small field only when the answer is unusual. Every question needs a result, and any Fail stops the applicant at this stage.</p>'
        : ''
    }<ol class="zad-chk zad-ivl">${rows}</ol>${sum}${
      edit
        ? `<div class="zad-acts"><button class="btn sm o" data-a="zad-ivs" data-id="${esc(a.id)}">Save interview notes</button><span class="mu" data-ivsaved="${esc(a.id)}">${ivDraft[a.id] ? 'Unsaved changes' : saved}</span></div>`
        : `<p class="mu zad-line">${saved}</p>`
    }</section>`;
  };
  /* the "other answer" field asks for a reason only when a Concern or Fail has no picked answer */
  const ivPh = x => ((x.r == 'fail' || x.r == 'concern') && !x.a ? 'Required: what did they say?' : 'Other answer or detail (optional)');
  const ivPaint = (fs, x) => {
    const tone = (IVR.find(z => z[0] == x.r) || [])[2];
    fs.querySelectorAll('.zad-seg label').forEach(l => {
      const inp = l.querySelector('input');
      inp.checked = inp.value == x.r;
      l.className = inp.checked ? 'on z-' + tone : '';
    });
    fs.querySelectorAll('.zad-ivo label').forEach(l => (l.className = l.querySelector('input').value == x.a ? 'on' : ''));
    const n = fs.querySelector('.zad-ivn');
    if (n) n.placeholder = ivPh(x);
  };
  /* typing in the guide: keep the draft, and update the look without redrawing the page */
  const ivInput = e => {
    const el = e.target.closest && e.target.closest('[data-iv]');
    if (!el) return;
    const a = S.apps.find(x => x.id == el.dataset.iv);
    if (!a) return;
    const d = (ivDraft[a.id] = ivState(a));
    if (el.dataset.sum) d.sum = el.value;
    else {
      const x = (d.ans[el.dataset.q] = d.ans[el.dataset.q] || { r: '', n: '' });
      if (el.type == 'radio' && el.dataset.ivo) {
        const o = ((ivQs(a).find(q => q.id == el.dataset.q) || {}).opts || []).find(o => o.id == el.value);
        if (o) Object.assign(x, { a: o.id, r: o.r }); // the answer suggests the result
        ivPaint(el.closest('fieldset'), x);
      } else if (el.type == 'radio') {
        x.r = el.value;
        ivPaint(el.closest('fieldset'), x);
      } else x.n = el.value;
    }
    const c = document.querySelector(`[data-ivc="${a.id}"]`),
      s = document.querySelector(`[data-ivsaved="${a.id}"]`);
    if (c) c.innerHTML = ivCount(a, d);
    if (s) s.textContent = 'Unsaved changes';
  };
  document.addEventListener('input', ivInput);
  document.addEventListener('change', ivInput);
  const ivSave = async id => {
    const a = S.apps.find(x => x.id == id),
      d = a && ivState(a);
    if (!d) return { ok: false, err: 'Application not found.' };
    const j = await RQ('appAction', { id, act: 'ivsave', ans: d.ans, sum: d.sum });
    if (j.ok) delete ivDraft[id];
    return j;
  };
  const STAGES = [
    ['Waiting for Owner', 'Waiting for owner'],
    ['Pending Review', 'Pending review'],
    ['Under Verification', 'Under verification'],
    ['Interview Scheduled', 'Interview'],
    ['Awaiting Additional Documents', 'Waiting for documents'],
    ['For Orientation', 'For orientation'],
    ['Approved', 'Approved'],
    ['Rejected', 'Rejected'],
  ];
  const rejDlg = a => {
    const u = U(a.user) || {},
      id = a.id,
      fname = esc(String(u.name || 'the applicant').split(' ')[0]);
    return `<div class="zad-ov" role="presentation"><div class="zad-dlg" role="alertdialog" aria-modal="true" aria-labelledby="zad-rh"><h3 id="zad-rh">Reject ${esc(u.name || 'this')}’s application?</h3><p>${fname} gets a notice with your reason and can apply again later.</p><label for="f-${id}-r">Reason (${fname} will see this)</label><input id="f-${id}-r" placeholder="e.g. Barangay clearance not submitted within 7 days"><div class="zad-acts end"><button class="btn o sm" data-a="zad-rej-x">Keep reviewing</button>${btn('app', 'Reject application', `data-id="${id}" data-x="reject"`, 'd')}</div></div></div>`;
  };
  const since = a => (a.hist && a.hist.length ? a.hist[a.hist.length - 1].t : a.t);
  P.apps = () => {
    const by = s => S.apps.filter(a => a.st == s);
    if (!by(apSt).length && apSt != 'Approved') {
      const firstOpen = STAGES.find(s => !['Approved', 'Rejected'].includes(s[0]) && by(s[0]).length);
      if (firstOpen) apSt = firstOpen[0];
    }
    const l = by(apSt).slice().reverse(),
      a = l.find(x => x.id == apSel) || l[0];
    const tabs = STAGES.map(s => `<button class="zad-tab${apSt == s[0] ? ' on' : ''}" data-a="zad-ap" data-v="${s[0]}">${s[1]} ${by(s[0]).length}</button>`).join('');
    let detail = '';
    if (a) {
      const u = U(a.user) || {},
        i = a.info || {},
        id = a.id,
        s = a.st,
        open = !['Approved', 'Rejected'].includes(s),
        fname = esc(String(u.name || 'the applicant').split(' ')[0]);
      const docs = (a.docs || []).map((d, j) => `<li><div><b>${esc(d.name)}</b><small>${d.t ? 'Uploaded ' + day(d.t) : 'Uploaded'}</small></div><span class="zad-r"><button class="zad-act" data-a="doc" data-k="app" data-id="${esc(id)}" data-j="${j}">View</button>${dot('Received', 'mute')}</span></li>`).join('');
      const req = a.req && s == 'Awaiting Additional Documents' ? `<li><div><b>${esc(a.req)}</b><small>Requested from the applicant</small></div>${dot('Missing', 'bad')}</li>` : '';
      const acts = open
        ? `<div class="zad-acts">${s == 'Pending Review' ? btn('app', 'Start verification', `data-id="${id}" data-x="verify"`) : ''}${
            ['Under Verification', 'Awaiting Additional Documents'].includes(s)
              ? `<div class="ad-row zad-iv"><input id="f-${id}-p" placeholder="Interview place, e.g. ZamMove office" aria-label="Interview place"><input id="f-${id}-w" type="datetime-local" aria-label="Interview date and time">${btn('app', 'Schedule interview', `data-id="${id}" data-x="interview"`)}</div>`
              : ''
          }${s == 'Interview Scheduled' ? `<button class="btn sm" data-a="zad-ivo" data-id="${esc(id)}">Interview passed: to orientation</button>` : ''}${s == 'For Orientation' && !a.orient ? btn('app', 'Mark orientation completed', `data-id="${id}" data-x="orientdone"`) : ''}${s == 'For Orientation' && a.orient ? btn('app', 'Approve role', `data-id="${id}" data-x="approve"`) : ''}<details class="zad-more"><summary class="btn o sm">More actions ▾</summary><div class="zad-menu">${
            ['Under Verification', 'Interview Scheduled'].includes(s) ? `<div class="ad-row"><input id="f-${id}-n" placeholder="What is needed, e.g. barangay clearance" aria-label="Document to request">${btn('app', 'Request document', `data-id="${id}" data-x="request"`, 'o')}</div>` : ''
          }<button class="btn sm d" data-a="zad-rej" data-id="${esc(id)}">Reject application…</button></div></details></div>`
        : `<p class="mu">${esc(s)} ${day(since(a))}${a.reason ? ' · ' + esc(a.reason) : ''}</p>`;
      detail = `<section class="card zad-detail"><div class="zad-ch"><h2>${esc(u.name || a.user)}</h2>${open ? dot(`${esc(STAGES.find(x => x[0] == s)[1])} ${ago(since(a))}`, 'wait') : tag(s)}</div><p class="mu zad-line">Wants to ${a.role == 'owner' ? 'list vehicles' : 'drive'} · ${mono(id)} · applied ${a.hist && a.hist[0] ? new Date(a.hist[0].t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}${i.license ? ' · license ' + mono(i.license) : ''} · ${esc(i.phone || u.ph || '')}</p>${i.license ? `<p class="mu zad-line">License valid until ${dateCell(i.licExp)} · clearance until ${dateCell(i.clrExp)}</p>` : ''}${a.iv ? `<p class="zad-line">Interview: <b>${esc(a.iv.when)}</b> at <b>${esc(a.iv.where)}</b></p>` : ''}<ul class="zad-chk">${docs || '<li><div><b>No documents uploaded</b><small>Ask the applicant to upload them</small></div></li>'}${req}</ul>${ivGuide(a)}${acts}</section>`;
    }
    /* the reject dialog sits outside the cards so it covers the whole page */
    const rej = a && apRej == a.id ? rejDlg(a) : '';
    return `<div class="zad-top"><h1>Applications</h1></div>${msg()}<div class="zad-tabs">${tabs}</div><div class="zad-split"><section class="card zad-list"><table class="zad-mini"><thead><tr><th>Applicant</th><th>Waiting</th></tr></thead><tbody>${
      l.length
        ? l.map(x => `<tr class="${a && x.id == a.id ? 'on' : ''}"><td><button data-a="zad-aps" data-id="${esc(x.id)}">${esc(nm(x.user))} · ${x.role == 'owner' ? 'owner' : 'driver'}</button></td><td>${['Approved', 'Rejected'].includes(x.st) ? `<span class="mu">${day(since(x))}</span>` : dot(ago(since(x)), 'wait')}</td></tr>`).join('')
        : '<tr><td colspan="2" class="mu">Nobody at this stage.</td></tr>'
    }</tbody></table></section>${detail}</div>${rej}`;
  };

  /* ---------- I06–I12: same content, new look; CSV where the design has it ---------- */
  const titled = (id, title, extra = '') => {
    const f = P[id];
    P[id] = () => `<div class="zad-top"><h1>${title}</h1>${extra}</div>${f()}`;
  };
  titled('veh', 'Vehicles');
  titled('asg', 'Assignments');
  titled('rn', 'Rentals');
  titled('inc', 'Incidents');
  titled('pay', 'Payments'); // the payment ledger already has its own Download CSV
  titled('rem', 'Remittances');
  titled('sum', 'Settlements');
  titled('log', 'Audit log', csvBtn('log'));
  titled('set', 'Settings');
  titled('staff', 'Staff');
  /* Users already prints its own heading */

  /* ---------- actions ---------- */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="zad-"]');
      if (!t || !me) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      if (a == 'zad-csv') return CSV[t.dataset.k] && CSV[t.dataset.k]();
      if (a == 'zad-bt') return (bt = t.dataset.v), (flash = null), render();
      if (a == 'zad-ver') return (verSel = id), render();
      if (a == 'zad-ap') return (apSt = t.dataset.v), (apSel = null), (apRej = null), (flash = null), render();
      if (a == 'zad-aps') return (apSel = id), (apRej = null), render();
      if (a == 'zad-rej') {
        apRej = id;
        render();
        return setTimeout(() => document.getElementById('f-' + id + '-r')?.focus(), 30);
      }
      if (a == 'zad-rej-x') return (apRej = null), render();
      let r, done;
      if (a == 'zad-ivs') {
        r = ivSave(id);
        done = 'Interview notes saved.';
      }
      if (a == 'zad-ivo') {
        r = (async () => {
          if (ivDraft[id]) {
            const s = await ivSave(id);
            if (!s.ok) return s;
          }
          return RQ('appAction', { id, act: 'orient' });
        })();
        done = 'Interview recorded. The applicant moves to orientation.';
      }
      if (a == 'zad-assign') {
        const drv = (document.getElementById('f-as-' + id) || {}).value;
        r = RQ('adminAssign', { id, driver: drv });
        done = `${id} assigned to ${nm(drv)}.`;
      }
      if (a == 'zad-resolve') {
        const dd = t.dataset.d,
          fv = k => ((document.getElementById(`f-${id}-${k}-${dd}`) || {}).value || '').trim();
        r = RQ('vResolve', { id, disc: dd, res: fv('rs'), mc: fv('rm') });
        done = `${dd} resolved. The driver can continue the checks.`;
      }
      if (a == 'zad-waive') {
        r = RQ('vException', { id, reason: (document.getElementById('f-' + id + '-exc') || {}).value || '' });
        done = 'Customer confirmation waived. The driver can authorize departure.';
      }
      if (!r) return;
      t.disabled = true;
      const j = await r;
      flash = j.ok ? { t: done, good: true } : { t: j.err || 'Something went wrong.' };
      render();
    },
    true
  );
  /* closing the reject dialog after a successful reject, and Escape */
  document.addEventListener('keydown', e => {
    if (e.key == 'Escape' && apRej) (apRej = null), render();
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a="app"][data-x="reject"]');
      if (t) setTimeout(() => (apRej = null), 0);
    },
    true
  );

  /* ---------- after every render: sidebar groups, counts, maps ---------- */
  const tick = () => {
    decorateNav();
    mountMaps();
    document.documentElement.classList.toggle('zad-on', !!document.getElementById('hd') && !document.getElementById('hd').hidden);
  };
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
  render();
  tick();
})();
