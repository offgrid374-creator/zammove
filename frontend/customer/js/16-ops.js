/**
 * 16-ops.js — operations pages for owners, drivers, admins and cashiers (loaded last). Tailwind classes (tw-).
 *
 * Money model (server: backend/src/domain/helpers.js splitOf): per completed trip, the 5% service fee and ZamMove's
 * commission go to ZamMove, the driver keeps his agreed share, and the owner gets the rest. Drivers remit
 * everything except their share; the cashier pays owners.
 *
 * Owner:   Fleet map (every vehicle: on a trip, rented, idle), Earnings and payouts, KPI dashboard, report a driver.
 * Driver:  road route map on the active trip (here → pickup → drop-off), upcoming jobs, hand back a job,
 *          earnings and remittance on the split.
 * Admin:   visual KPI overview, Users (search, suspend / reactivate, revoke roles, flags), money split setting.
 * Cashier: Income dashboard (monthly KPIs, daily chart, where the money goes, owner payouts), settlements with
 *          overdue detection and flags, ledger with filters.
 */
(() => {
  /* ---------------- data helpers ---------------- */
  const PAYOK = ['Recorded by driver', 'Verified'];
  const TRACK = [
    'On the Way to Pickup',
    'Awaiting Down Payment',
    'Down Payment Confirmed',
    'Items Loaded',
    'In Transit',
    'Arrived at Destination',
  ];
  const me = () => (S.me || {}).em;
  /* element ids built from an email: '@' and '.' break the CSS selectors that val() uses */
  const key = x => String(x).replace(/[^A-Za-z0-9_-]/g, '_');
  const U = em => (S.users || []).find(u => u.em == em) || {};
  const V = id => (S.vh || []).find(v => v.id == id) || {};
  const r2 = x => Math.round((+x || 0) * 100) / 100;
  const ph = t => new Date(new Date(t).getTime() + 8 * 36e5).toISOString();
  const monthOf = t => (t ? ph(t).slice(0, 7) : '');
  const thisMonth = () => ph(Date.now()).slice(0, 7);
  const prevMonth = m => {
    const [y, mo] = m.split('-').map(Number);
    return mo == 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  };
  const mLabel = m =>
    new Date(m + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const fmtD = t => (t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—');
  const ago = t => {
    const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000));
    return s < 60
      ? s + ' s ago'
      : s < 3600
        ? Math.round(s / 60) + ' min ago'
        : s < 86400
          ? Math.round(s / 3600) + ' h ago'
          : Math.round(s / 86400) + ' d ago';
  };
  const gross = b =>
    r2(
      (S.pay || [])
        .filter(p => p.bid == b.id && p.by && PAYOK.includes(p.status))
        .reduce((s, p) => s + p.amount, 0)
    );
  const split = b =>
    b.split || { fare: b.tot, fee: 0, pool: b.tot, pct: 0, drv: 0, zc: 0, own: 0, zam: 0, owner: '' };
  const dueFor = b => r2(Math.max(0, gross(b) - split(b).drv));
  const done = b => b.st == 'Completed';
  const payT = p => p.ct || p.vt || p.t;
  /* owner balance from the server: payable only once ZamMove has the money (drivers' remittances verified,
     rentals completed); "waiting" is earned but not yet payable */
  const ownerBal = em =>
    (S.ownerBals && S.ownerBals[em]) ||
    (S.ownerBal && S.me && S.me.em == em ? S.ownerBal : null) || { earned: 0, earnedTrips: 0, earnedRent: 0, waiting: 0, paid: 0, due: 0 };
  /* the Monday of a trip's week (same rule as the server: Manila time) */
  const wk = t => {
    const d = new Date(new Date(t).getTime() + 8 * 36e5),
      x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  /* remittance is due 3 days after the week ends */
  const GRACE = 3;
  const overdueDays = b =>
    Math.floor(
      (Date.now() - (new Date(wk(b.cd) + 'T00:00:00+08:00').getTime() + (7 + GRACE) * 864e5)) / 864e5
    );

  /* ---------------- Tailwind building blocks ---------------- */
  let msg = { t: '', good: true };
  const msgBox = () =>
    msg.t
      ? `<div role="status" aria-live="polite" class="tw-mt-4 tw-rounded-xl tw-px-4 tw-py-3 tw-text-sm tw-font-medium tw-ring-1 ${msg.good ? 'tw-bg-emerald-50 tw-text-emerald-800 tw-ring-emerald-200' : 'tw-bg-rose-50 tw-text-rose-800 tw-ring-rose-200'}">${esc(msg.t)}</div>`
      : '';
  const head = (title, sub, right = '') =>
    `<div class="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3"><div class="tw-flex tw-flex-col tw-gap-2"><span class="vinta-stripe"></span><h1 class="tw-m-0">${title}</h1>${sub ? `<p class="tw-m-0 tw-max-w-3xl tw-text-slate-500">${sub}</p>` : ''}</div>${right}</div>${msgBox()}`;
  const section = (title, sub, body, extra = '') =>
    `<section class="tw-mt-8"><div class="tw-mb-3 tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-2"><div><h2 class="tw-m-0 tw-text-xl">${title}</h2>${sub ? `<p class="tw-m-0 tw-mt-1 tw-text-sm tw-text-slate-500">${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
  const panel = (body, cls = '') =>
    `<div class="tw-rounded-2xl tw-bg-white tw-p-5 tw-shadow-card tw-ring-1 tw-ring-slate-900/5 ${cls}">${body}</div>`;
  const empty = t =>
    `<div class="tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-300 tw-bg-white/60 tw-px-5 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">${t}</div>`;
  const kpi = (label, value, note = '', tone = 'tw-text-slate-900', go = '') =>
    `<div class="tw-rounded-2xl tw-bg-white tw-p-4 tw-ring-1 tw-ring-slate-900/5 ${go ? 'tw-cursor-pointer hover:tw-ring-harbor-300' : ''}" ${go}><div class="tw-text-xs tw-font-medium tw-text-slate-500">${label}</div><div class="tw-mt-1 tw-font-display tw-text-2xl tw-font-bold tw-tabular-nums ${tone}">${value}</div>${note ? `<div class="tw-mt-1 tw-text-xs tw-text-slate-500">${note}</div>` : ''}</div>`;
  const grid = (cells, cols = 'lg:tw-grid-cols-4') =>
    `<div class="tw-mt-6 tw-grid tw-grid-cols-2 tw-gap-3 ${cols}">${cells.join('')}</div>`;
  const pill = (text, tone = 'slate') => {
    const T = {
      slate: 'tw-bg-slate-100 tw-text-slate-600 tw-ring-slate-200',
      green: 'tw-bg-emerald-50 tw-text-emerald-800 tw-ring-emerald-200',
      amber: 'tw-bg-amber-50 tw-text-amber-800 tw-ring-amber-200',
      red: 'tw-bg-rose-50 tw-text-rose-700 tw-ring-rose-200',
      blue: 'tw-bg-sky-50 tw-text-sky-800 tw-ring-sky-200',
      teal: 'tw-bg-harbor-50 tw-text-harbor-800 tw-ring-harbor-200',
    }[tone];
    return `<span class="tw-inline-flex tw-items-center tw-gap-1.5 tw-whitespace-nowrap tw-rounded-full tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-semibold tw-ring-1 tw-ring-inset ${T}"><span class="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-current tw-opacity-70"></span>${esc(text)}</span>`;
  };
  const btn = (a, label, attrs = '', kind = 'primary') => {
    const k = {
      primary: 'tw-bg-harbor-700 tw-text-white hover:tw-bg-harbor-800 tw-shadow-sm',
      outline: 'tw-bg-white tw-text-slate-800 tw-ring-1 tw-ring-inset tw-ring-slate-300 hover:tw-bg-slate-50',
      danger: 'tw-bg-white tw-text-rose-700 tw-ring-1 tw-ring-inset tw-ring-rose-300 hover:tw-bg-rose-50',
    }[kind];
    return `<button type="button" class="tw-inline-flex tw-min-h-[38px] tw-cursor-pointer tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border-0 tw-px-3.5 tw-text-sm tw-font-semibold tw-transition ${k}" data-a="${a}" ${attrs}>${label}</button>`;
  };
  const table = (heads, rows, right = []) =>
    rows.length
      ? `<div class="tw-overflow-x-auto"><table class="tw-w-full tw-border-collapse tw-text-sm"><thead><tr>${heads.map((h, i) => `<th class="tw-whitespace-nowrap tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-px-3 tw-py-2 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wider tw-text-slate-500 ${right.includes(i) ? 'tw-text-right' : 'tw-text-left'}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="hover:tw-bg-slate-50/70">${r.map((c, i) => `<td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5 tw-align-top ${right.includes(i) ? 'tw-text-right tw-tabular-nums' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '';
  const go = (w, p) => `data-a="w-go" data-w="${w}" data-p="${p}" role="button" tabindex="0"`;

  /* ---------------- charts (dataviz skill: thin marks, rounded data ends, recessive axes, hover + table view) ---------------- */
  const SERIES = { brand: '#137266', s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a' }; // s1..s3: validated categorical slots
  /* vertical bars, one series: data [{ label, value, tip }] */
  const barChart = (data, { fmt = x => x, h = 180, color = SERIES.brand, title = '' } = {}) => {
    if (!data.length) return empty('No data yet.');
    const W = 640,
      pad = { l: 44, r: 8, t: 10, b: 26 },
      max = Math.max(1, ...data.map(d => d.value)),
      step = (W - pad.l - pad.r) / data.length,
      bw = Math.max(4, step - 4),
      y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    const ticks = [...new Set([0, Math.round(max / 2), max])]; // whole, distinct ticks
    const every = Math.ceil(data.length / 8);
    return `<figure class="tw-m-0"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}" class="zo-chart tw-block tw-h-auto tw-w-full">${ticks
      .map(
        t =>
          `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0" stroke-width="1"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#64748b">${esc(fmt(t))}</text>`
      )
      .join('')}${data
      .map((d, i) => {
        const x = pad.l + i * step + 2,
          top = y(d.value),
          hh = Math.max(0, h - pad.b - top),
          r = Math.min(4, hh / 2, bw / 2);
        const path =
          hh > 0
            ? `M${x},${h - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${h - pad.b} Z`
            : '';
        return `<g class="zo-bar" data-tip="${esc(d.tip || d.label + ': ' + fmt(d.value))}"><rect x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${h - pad.t - pad.b}" fill="transparent"/>${path ? `<path d="${path}" fill="${color}"/>` : ''}${i % every == 0 ? `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#64748b">${esc(d.label)}</text>` : ''}</g>`;
      })
      .join(
        ''
      )}<line x1="${pad.l}" x2="${W - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="#cbd5e1" stroke-width="1"/></svg><details class="tw-mt-2 tw-text-xs tw-text-slate-500"><summary class="tw-cursor-pointer">Show as table</summary>${table(
      ['', 'Value'],
      data.map(d => [esc(d.label), esc(fmt(d.value))]),
      [1]
    )}</details></figure>`;
  };
  /* horizontal bars, one series */
  const hBars = (data, fmt = x => x) => {
    const max = Math.max(1, ...data.map(d => d.value));
    return `<div class="tw-flex tw-flex-col tw-gap-3">${data
      .map(
        d =>
          `<div class="zo-bar" data-tip="${esc(d.label + ': ' + fmt(d.value))}"><div class="tw-mb-1 tw-flex tw-justify-between tw-text-sm"><span class="tw-text-slate-700">${esc(d.label)}</span><b class="tw-tabular-nums tw-text-slate-900">${esc(fmt(d.value))}</b></div><div class="tw-h-2.5 tw-rounded-full tw-bg-slate-100"><div class="tw-h-2.5 tw-rounded-full" style="width:${(d.value / max) * 100}%;background:${SERIES.brand}"></div></div></div>`
      )
      .join('')}</div>`;
  };
  /* one stacked bar with a legend that names each part (identity never by colour alone) */
  const stack = parts => {
    const tot = parts.reduce((s, p) => s + p.value, 0);
    if (!tot) return empty('No completed trips in this period.');
    return `<div><div class="tw-flex tw-h-4 tw-gap-[2px] tw-overflow-hidden tw-rounded-md">${parts
      .filter(p => p.value > 0)
      .map(
        p =>
          `<div class="zo-bar" data-tip="${esc(p.label + ': ' + peso(p.value) + ' (' + Math.round((p.value / tot) * 100) + '%)')}" style="width:${(p.value / tot) * 100}%;background:${p.color}"></div>`
      )
      .join('')}</div><ul class="tw-m-0 tw-mt-3 tw-grid tw-list-none tw-gap-2 tw-p-0">${parts
      .map(
        p =>
          `<li class="tw-flex tw-items-center tw-gap-2 tw-text-sm"><span class="tw-h-3 tw-w-3 tw-flex-none tw-rounded-sm" style="background:${p.color}"></span><span class="tw-text-slate-600">${esc(p.label)}</span><b class="tw-ml-auto tw-tabular-nums tw-text-slate-900">${peso(p.value)}</b><span class="tw-w-10 tw-text-right tw-text-xs tw-text-slate-500">${Math.round((p.value / tot) * 100)}%</span></li>`
      )
      .join('')}</ul></div>`;
  };
  const tip = document.createElement('div');
  tip.className = 'zo-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('mouseover', e => {
    const b = e.target.closest && e.target.closest('.zo-bar');
    if (!b) return (tip.hidden = true);
    tip.textContent = b.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('mousemove', e => {
    if (!tip.hidden) {
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px';
      tip.style.top = e.clientY - 36 + 'px';
    }
  });

  /* ---------------- maps (Leaflet + OpenStreetMap) ---------------- */
  const maps = {};
  const tiles = map =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  /* the Active trip layout moved a route map to the top: fit it again at its new size */
  window.addEventListener('zm-refit', () => {
    Object.values(maps).forEach(m => {
      if (!m.el.isConnected) return;
      m.map.invalidateSize();
      m.fitted = '';
    });
    drawRoutes();
  });
  const mountMap = (id, draw) => {
    const el = document.getElementById(id);
    const m = maps[id];
    if (!el) {
      if (m) {
        m.map.remove();
        delete maps[id];
      }
      return null;
    }
    if (!window.L) return null;
    if (m && m.el === el) {
      draw(m);
      return m;
    }
    if (m) m.map.remove();
    const map = L.map(el, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
      [6.9214, 122.079],
      13
    );
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    tiles(map);
    const x = (maps[id] = { map, el, layers: L.layerGroup().addTo(map), fitted: '' });
    draw(x);
    return x;
  };
  const dot = (layers, ll, color, label, r = 9) =>
    L.circleMarker(ll, { radius: r, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
      .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] })
      .addTo(layers);

  /* ======================= OWNER ======================= */
  const myVeh = () => (S.vh || []).filter(v => v.owner == me());
  const vehState = v => {
    const trip = (S.bk || []).find(b => b.veh == v.id && TRACK.includes(b.st));
    const rent = (S.rn || []).find(r => r.veh == v.id && r.st == 'Active');
    const next = (S.bk || [])
      .filter(b => b.veh == v.id && b.st == 'Accepted')
      .sort((a, b) => (a.dt + a.tm > b.dt + b.tm ? 1 : -1))[0];
    const asg = (S.asg || []).find(a => a.vehicle == v.id && a.st == 'Active');
    const pos = trip && trip.gps ? trip.gps : rent && rent.gps ? rent.gps : null;
    const st =
      v.approval != 'Approved'
        ? ['Not approved', 'slate']
        : v.status == 'Maintenance'
          ? ['Maintenance', 'amber']
          : trip
            ? ['On a trip', 'teal']
            : rent
              ? ['Rented out', 'blue']
              : next
                ? ['Booked', 'amber']
                : ['Idle', 'slate'];
    return { trip, rent, next, asg, pos, st };
  };
  const ownerFleet = () => {
    const vs = myVeh().map(v => ({ v, s: vehState(v) }));
    const live = vs.filter(x => x.s.pos);
    const rows = vs.map(({ v, s }) => {
      const who = s.trip
        ? U(s.trip.drvUser).name || s.trip.drv
        : s.rent
          ? 'Renter: ' + (U(s.rent.cu).name || s.rent.cu)
          : s.asg
            ? U(s.asg.driver).name || s.asg.driver
            : '—';
      const what = s.trip
        ? `${esc(s.trip.id)} · ${esc(s.trip.st)}`
        : s.rent
          ? `${esc(s.rent.id)} · return ${esc(s.rent.e)}`
          : s.next
            ? `Next: ${esc(s.next.dt)} ${esc(s.next.tm)}`
            : '';
      return [
        `<b class="tw-text-slate-900">${esc(v.brand)} ${esc(v.model)}</b><div class="tw-font-mono tw-text-xs tw-text-slate-500">${esc(v.plate)} · ${esc(v.color || '')}</div>`,
        pill(s.st[0], s.st[1]),
        esc(who),
        what || '<span class="tw-text-slate-400">—</span>',
        s.pos
          ? `${s.pos.inArea === false ? pill('Outside Zamboanga City', 'red') + ' ' : ''}${s.pos.off ? 'paused · ' : ''}${ago(s.pos.t)} · <a href="https://www.google.com/maps?q=${s.pos.lat},${s.pos.lng}" target="_blank" rel="noopener">Google Maps</a>`
          : '<span class="tw-text-slate-400">No live location</span>',
      ];
    });
    const counts = ['On a trip', 'Rented out', 'Booked', 'Idle'].map(k => [
      k,
      vs.filter(x => x.s.st[0] == k).length,
    ]);
    return `<div class="tw-pb-10">${head('Fleet map', 'Every vehicle you own: where it is during a trip or rental, who is driving it and what is next. Locations come from the driver’s or renter’s phone while a trip or rental is active.')}
${grid(counts.map(([k, n]) => kpi(k, n)))}
<div class="tw-mt-6">${panel(`<div id="fl-map" class="zmap" style="height:440px"></div><div class="tw-mt-3 tw-flex tw-flex-wrap tw-gap-4 tw-text-xs tw-text-slate-500"><span><i class="zo-dot" style="background:#137266"></i>Hauling trip</span><span><i class="zo-dot" style="background:#2a78d6"></i>Rental</span><span><i class="zo-dot" style="background:#94a3b8"></i>Paused or no recent signal</span><span><i class="zo-dot" style="background:#dc2626"></i>Outside Zamboanga City</span></div>${live.length ? '' : '<p class="tw-m-0 tw-mt-2 tw-text-sm tw-text-slate-500">None of your vehicles is sharing a location right now. Positions appear while a driver or renter shares location during a trip or rental.</p>'}`)}</div>
${section('All vehicles', '', panel(table(['Vehicle', 'Status', 'Driver or renter', 'Trip or rental', 'Location'], rows) || empty('You have no vehicles yet.')))}</div>`;
  };
  const drawFleet = m => {
    m.layers.clearLayers();
    const pts = [];
    myVeh().forEach(v => {
      const s = vehState(v);
      if (!s.pos) return;
      const stale = s.pos.off || Date.now() - (s.pos.ms || new Date(s.pos.t).getTime()) > 300000;
      const color = s.pos.inArea === false ? '#dc2626' : stale ? '#94a3b8' : s.trip ? '#137266' : '#2a78d6';
      dot(m.layers, [s.pos.lat, s.pos.lng], color, `${v.plate} · ${s.trip ? 'trip' : 'rental'}`);
      pts.push([s.pos.lat, s.pos.lng]);
    });
    const k = pts.map(p => p.join()).join('|');
    if (m.fitted != k) {
      m.fitted = k;
      if (pts.length > 1) m.map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
      else if (pts.length) m.map.setView(pts[0], 15);
      else m.map.setView([6.9214, 122.079], 12);
    }
  };
  const ownerEarn = () => {
    const em = me(),
      trips = (S.bk || [])
        .filter(b => done(b) && split(b).owner == em)
        .sort((a, b) => (a.cd < b.cd ? 1 : -1)),
      bal = ownerBal(em),
      m = thisMonth(),
      month = trips.filter(b => monthOf(b.cd) == m).reduce((s, b) => s + split(b).own, 0),
      last = trips.filter(b => monthOf(b.cd) == prevMonth(m)).reduce((s, b) => s + split(b).own, 0),
      payouts = (S.pay || [])
        .filter(p => p.kind == 'owner_payout' && p.to == em)
        .slice()
        .reverse();
    const perVeh = myVeh()
      .map(v => ({
        label: v.plate,
        value: r2(trips.filter(b => b.veh == v.id).reduce((s, b) => s + split(b).own, 0)),
      }))
      .filter(x => x.value > 0);
    return `<div class="tw-pb-10">${head('Earnings', 'Your share of every completed trip on your vehicles, and the payouts ZamMove has sent you.')}
${grid([kpi('This month (trips)', peso(month), last ? `${month >= last ? '▲' : '▼'} vs ${peso(last)} last month` : mLabel(m)), kpi('Waiting for remittance', peso(bal.waiting || 0), 'Payable once the driver remits'), kpi('Paid to you', peso(bal.paid), 'Rentals: ' + peso(bal.earnedRent || 0) + ' earned'), (bal.due < -0.005 ? kpi('You owe ZamMove', peso(-bal.due), 'Rental commission · remit weekly', 'tw-text-red-700') : kpi('Payable now', peso(bal.due), 'ZamMove pays this to you', bal.due > 0 ? 'tw-text-harbor-700' : 'tw-text-slate-900'))])}
${bal.held || bal.heldOpen || bal.tripsOwed || bal.due < 0 ? `<div class="tw-mb-4 tw-rounded-xl tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-p-4 tw-text-sm tw-text-slate-700"><b class="tw-text-slate-900">Rental money you collected</b><br>${peso(bal.held || 0)} from completed rentals is deducted from your payouts${bal.heldOpen ? `, and ${peso(bal.heldOpen)} from rentals still in progress is deducted when they are completed` : ''}. Renters, and your drivers through their turnovers, pay you directly. ZamMove’s fee and commission from trips on your vehicles (${peso(bal.tripsOwed || 0)}) and from completed rentals (plus any deposit you have not refunded yet) are in your hands.${bal.settled ? ' You have remitted ' + peso(bal.settled) + ' so far.' : ''}${bal.sent ? ` ${peso(bal.sent)} you sent is waiting for the cashier to verify.` : ''}${-bal.due - (bal.sent || 0) > 0.005 ? `<br><b class="tw-text-red-700">Remit ${peso(-bal.due - (bal.sent || 0))} to ZamMove this week.</b> Send it to ZamMove’s GCash or pay the cashier in cash, then record it here.<div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2"><input id="zo-oa" type="number" min="1" value="${r2(-bal.due - (bal.sent || 0))}" class="tw-min-h-[40px]" style="width:8rem" aria-label="Amount"><select id="zo-om" class="tw-min-h-[40px]" style="width:7rem" aria-label="Method"><option>GCash</option><option>Cash</option></select><input id="zo-or" inputmode="numeric" placeholder="GCash ref" class="tw-min-h-[40px]" style="width:10rem" aria-label="Reference">${btn('zo-orm', 'Remit to ZamMove')}</div>` : ''}</div>` : ''}
${perVeh.length > 0 ? section('Earnings per vehicle', 'All time', panel(hBars(perVeh, peso))) : ''}
${section('How each fare is split', '', panel(`<p class="tw-m-0 tw-text-sm tw-text-slate-600">The customer’s 5% service fee goes to ZamMove. Of the rest, ZamMove keeps a ${S.cfg.comm == null ? 15 : S.cfg.comm}% commission, the driver gets the share in his driver agreement (default ${S.cfg.drvPct || 20}%), and you get the remainder. Each trip keeps the split it had when it was completed.</p>`))}
${section(
  'Completed trips',
  trips.length + ' trip' + (trips.length == 1 ? '' : 's'),
  panel(
    table(
      ['Date', 'Booking', 'Vehicle', 'Driver', 'Fare', 'Driver', 'ZamMove', 'Your share'],
      trips.map(b => [
        fmtD(b.cd),
        esc(b.id),
        esc(V(b.veh).plate || b.veh),
        esc(b.drv || ''),
        peso(split(b).fare),
        `${peso(split(b).drv)} <span class="tw-text-xs tw-text-slate-400">${split(b).pct}%</span>`,
        peso(split(b).zam),
        `<b>${peso(split(b).own)}</b>`,
      ]),
      [4, 5, 6, 7]
    ) || empty('No completed trips yet.')
  )
)}
${(() => {
  const rs = (S.rn || []).filter(r => r.owner == me() && r.split);
  return rs.length
    ? section(
        'Rental income',
        rs.length + ' completed rental' + (rs.length == 1 ? '' : 's'),
        panel(
          table(
            ['Rental', 'Vehicle', 'Rental fee', 'ZamMove', 'Deposit kept', 'Your share'],
            rs.map(r => [esc(r.id), esc(r.vn || ''), peso(r.split.fee), peso(r.split.zc) + ` <span class="tw-text-xs tw-text-slate-400">${r.split.comm}%</span>`, peso(r.split.kept || 0), `<b>${peso(r.split.own + (r.split.kept || 0))}</b>`]),
            [2, 3, 4, 5]
          )
        )
      )
    : '';
})()}
${section(
  'Payouts',
  '',
  panel(
    table(
      ['Date', 'Method', 'Reference', 'Amount'],
      payouts.map(p => [fmtD(p.vt || p.t), esc(p.method), esc(p.ref), `<b>${peso(p.amount)}</b>`]),
      [3]
    ) || empty('No payouts yet.')
  )
)}</div>`;
  };
  /* owner dashboard: money and live status first */
  const ownerDashTop = () => {
    const vs = myVeh().map(v => vehState(v)),
      bal = ownerBal(me()),
      m = thisMonth(),
      month = (S.bk || [])
        .filter(b => done(b) && split(b).owner == me() && monthOf(b.cd) == m)
        .reduce((s, b) => s + split(b).own, 0);
    return `<div class="tw-mb-2">${grid([
      kpi('Earned this month', peso(month), mLabel(m), 'tw-text-slate-900', go('owner', 'earn')),
      kpi(
        bal.due < -0.005 ? 'You owe ZamMove' : 'Payable now',
        peso(Math.abs(bal.due)),
        bal.due < -0.005 ? 'Remit this week · open Earnings' : 'Open Earnings',
        bal.due > 0 ? 'tw-text-harbor-700' : bal.due < -0.005 ? 'tw-text-red-700' : 'tw-text-slate-900',
        go('owner', 'earn')
      ),
      kpi(
        'On a trip now',
        vs.filter(s => s.trip).length,
        'Open Fleet map',
        'tw-text-slate-900',
        go('owner', 'fleet')
      ),
      kpi(
        'Rented out now',
        vs.filter(s => s.rent).length,
        'Open Fleet map',
        'tw-text-slate-900',
        go('owner', 'fleet')
      ),
    ])}</div>`;
  };
  /* owner: report a driver */
  const reportForm = () => {
    const mine = myVeh().map(v => v.id),
      drivers = [...new Set((S.asg || []).filter(a => mine.includes(a.vehicle)).map(a => a.driver))],
      reps = (S.inc || [])
        .filter(c => c.kind == 'owner-report' && c.by == me())
        .slice()
        .reverse();
    if (!drivers.length) return '';
    const cats = [
      'Reckless driving',
      'Vehicle damage',
      'Unremitted collections',
      'Misconduct',
      'Unauthorized use',
      'Other',
    ];
    const sel = (id, opts, ph) =>
      `<select id="${id}" class="tw-min-h-[44px] tw-w-full tw-text-sm"><option value="">${ph}</option>${opts}</select>`;
    const trips = (S.bk || [])
      .filter(b => mine.includes(b.veh) && b.drvUser)
      .slice(-30)
      .reverse();
    return section(
      'Report a driver',
      'For a problem with a driver of your vehicle. ZamMove reviews every report; to remove the driver now, end the assignment above.',
      panel(`<div class="tw-grid tw-gap-4 sm:tw-grid-cols-2 lg:tw-grid-cols-4">
<label class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">Driver${sel('zo-rd', drivers.map(d => `<option value="${esc(d)}">${esc(U(d).name || d)}</option>`).join(''), 'Choose a driver')}</label>
<label class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">What happened${sel('zo-rc', cats.map(c => `<option>${c}</option>`).join(''), 'Choose')}</label>
<label class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">Severity<select id="zo-rs" class="tw-min-h-[44px] tw-w-full tw-text-sm"><option>Medium</option><option>Low</option><option>High</option></select></label>
<label class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">Related trip (optional)${sel('zo-rb', trips.map(b => `<option value="${esc(b.id)}">${esc(b.id)} · ${esc(b.drv || '')} · ${esc(b.dt)}</option>`).join(''), 'None')}</label></div>
<label class="tw-mt-4 tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">Describe what happened<textarea id="zo-rdesc" rows="3" class="tw-w-full tw-text-sm" placeholder="What, when and where. Mention customers or photos that can confirm it."></textarea></label>
<div class="tw-mt-4">${btn('zo-report', 'Send report to ZamMove')}</div>
${
  reps.length
    ? `<div class="tw-mt-5">${table(
        ['Case', 'Driver', 'What', 'Status'],
        reps.map(c => [
          esc(c.id),
          esc(U(c.driver).name || c.driver),
          esc(c.cat) + ' ' + pill(c.sev, c.sev == 'High' ? 'red' : c.sev == 'Medium' ? 'amber' : 'slate'),
          pill(c.st, c.st == 'Closed' ? 'green' : c.st == 'Withdrawn' ? 'slate' : 'blue'),
        ])
      )}</div>`
    : ''
}`)
    );
  };

  /* ======================= DRIVER ======================= */
  const myTrips = () =>
    (S.bk || []).filter(b => b.drvUser == me() && !['Completed', 'Cancelled', 'Rejected'].includes(b.st));
  const upcoming = () => {
    const l = myTrips()
      .filter(b => b.st == 'Accepted')
      .sort((a, b) => (a.dt + a.tm > b.dt + b.tm ? 1 : -1));
    return section(
      'Upcoming jobs',
      'Accepted bookings you have not started yet.',
      l.length
        ? `<div class="tw-grid tw-gap-3 lg:tw-grid-cols-2">${l
            .map(b => {
              const id = esc(b.id);
              return panel(`<div class="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-2"><div><b class="tw-text-slate-900">${esc(b.dt)} · ${esc(b.tm)}</b><div class="tw-text-sm tw-text-slate-600">${esc(String(b.pu).split(',')[0])} → ${esc(String(b.dr).split(',')[0])}</div><div class="tw-text-xs tw-text-slate-500">${id} · ${esc(b.vn || '')} · ${esc(b.it || '')}</div></div>${b.split ? `<div class="tw-text-right"><div class="tw-text-xs tw-text-slate-500">Your share</div><b class="tw-tabular-nums">${peso(b.split.drv)}</b></div>` : ''}</div>
<div class="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">${btn('w-go', 'Open trip', 'data-w="driver" data-p="trip"')}</div>
<details class="tw-mt-3"><summary class="tw-cursor-pointer tw-text-sm tw-font-medium tw-text-slate-500">Can’t make it? Hand the job back</summary><div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2"><input id="zo-hb-${id}" placeholder="Reason for the customer" class="tw-min-h-[38px] tw-flex-1 tw-text-sm" style="min-width:200px">${btn('zo-hb', 'Hand back', `data-id="${id}"`, 'danger')}</div><p class="tw-m-0 tw-mt-1 tw-text-xs tw-text-slate-500">Only before you head to the pickup. The booking reopens for other drivers and the customer is told.</p></details>`);
            })
            .join('')}</div>`
        : empty('No upcoming jobs. Accept a booking under Requests.')
    );
  };
  /* road route for the active trip: here → pickup → drop-off */
  const here = { pos: null, asked: false };
  const askHere = () => {
    if (here.asked || !navigator.geolocation || window.isSecureContext === false) return;
    here.asked = true;
    navigator.geolocation.getCurrentPosition(
      p => {
        here.pos = [p.coords.latitude, p.coords.longitude];
        routes.key = {};
        drawRoutes();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };
  const stopsOf = b => {
    const pu = coord(b.pu),
      dr = coord(b.dr),
      me0 =
        b.gps && !b.gps.off
          ? [b.gps.lat, b.gps.lng]
          : here.pos && zcBox(here.pos[0], here.pos[1])
            ? here.pos
            : null;
    const before = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'].includes(b.st);
    const loaded = ['In Transit', 'Arrived at Destination'].includes(b.st);
    if (!pu || !dr) return null;
    if (before)
      return {
        pts: me0 ? [me0, pu, dr] : [pu, dr],
        names: me0 ? ['You', 'Pickup', 'Drop-off'] : ['Pickup', 'Drop-off'],
      };
    if (loaded)
      return { pts: me0 ? [me0, dr] : [pu, dr], names: me0 ? ['You', 'Drop-off'] : ['Pickup', 'Drop-off'] };
    return { pts: [pu, dr], names: ['Pickup', 'Drop-off'] };
  };
  const routes = { key: {}, data: {} };
  const dirUrl = pts =>
    `https://www.google.com/maps/dir/?api=1&origin=${pts[0].join(',')}&destination=${pts[pts.length - 1].join(',')}${
      pts.length > 2
        ? '&waypoints=' +
          pts
            .slice(1, -1)
            .map(p => p.join(','))
            .join('|')
        : ''
    }&travelmode=driving`;
  const drawRoutes = () => {
    if (!(S.ws == 'driver' && (S.wp || {}).driver == 'trip')) return;
    /* the trip cards, and the route maps the Active trip layout (20-driver-trip) already moved to the top */
    const spots = [...document.querySelectorAll('#app .card.zc')]
      .map(card => {
        const h2 = card.querySelector('h2');
        return { card, h2, id: h2 && (h2.textContent.match(/BK-[A-Z0-9]+/) || [])[0] };
      })
      .concat([...document.querySelectorAll('#app .ztd-map [id^="dr-map-"]')].map(el => ({ card: el.closest('.ztd-map'), id: el.id.slice(7), moved: true })));
    spots.forEach(({ card, h2, id, moved }) => {
      const b = id && (S.bk || []).find(x => x.id == id);
      if (!b) return;
      if (!moved && !card.querySelector('.zo-route')) {
        const nav = [...card.querySelectorAll('p')].find(p => /Navigate to/.test(p.textContent));
        const html = `<div class="zo-route tw-my-3 tw-rounded-2xl tw-bg-slate-50 tw-p-3 tw-ring-1 tw-ring-slate-200"><div class="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2"><b class="tw-text-slate-900">Best route</b><span id="dr-legs-${id}" class="tw-text-sm tw-text-slate-600">Finding the fastest road route…</span></div><div id="dr-map-${id}" class="zmap" style="height:320px"></div><div class="tw-mt-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2" id="dr-go-${id}"></div></div>${b.st == 'Accepted' ? `<details class="tw-mb-3"><summary class="tw-cursor-pointer tw-text-sm tw-font-medium tw-text-slate-500">Can’t make it? Hand the job back</summary><div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2"><input id="zo-hb-${id}" placeholder="Reason for the customer" class="tw-min-h-[38px] tw-flex-1 tw-text-sm" style="min-width:200px"><button type="button" class="btn d sm" data-a="zo-hb" data-id="${id}">Hand back</button></div></details>` : ''}`;
        if (nav) nav.insertAdjacentHTML('afterend', html);
        else h2.insertAdjacentHTML('afterend', html);
      }
      const s = stopsOf(b);
      const legsEl = document.getElementById('dr-legs-' + id);
      if (!s) {
        if (legsEl) legsEl.textContent = 'Pickup or drop-off has no map location.';
        return;
      }
      const key = s.pts.map(p => p.map(x => (+x).toFixed(4)).join(',')).join(';');
      const goEl = document.getElementById('dr-go-' + id);
      if (goEl && !goEl.dataset.k) {
        goEl.dataset.k = 1;
        goEl.innerHTML = `<a class="btn sm" href="${dirUrl(s.pts)}" target="_blank" rel="noopener">Start navigation (Google Maps)</a><a class="btn o sm" href="https://waze.com/ul?ll=${s.pts[s.pts.length > 2 ? 1 : s.pts.length - 1].join(',')}&navigate=yes" target="_blank" rel="noopener">Waze to next stop</a><span class="tw-text-xs tw-text-slate-500">${here.pos || b.gps ? '' : 'Allow location (or share live location) to route from where you are.'}</span>`;
      }
      if (routes.key[id] != key) {
        routes.key[id] = key;
        const q = ['a', 'b', 'c', 'd']
          .slice(0, s.pts.length)
          .map((k, i) => `${k}=${s.pts[i][0].toFixed(5)},${s.pts[i][1].toFixed(5)}`)
          .join('&');
        fetch((window.ZM_API_BASE || '/api') + '/geo/route?' + q)
          .then(r => r.json())
          .then(r => {
            routes.data[id] = { ...s, route: r.ok ? r.route : null };
            if (!r.ok || !r.route) setTimeout(() => delete routes.key[id], 20000); // the public routing service can blip: retry
            drawRoutes();
          })
          .catch(() => {
            routes.data[id] = { ...s, route: null };
            setTimeout(() => delete routes.key[id], 20000);
            drawRoutes();
          });
      }
      const d = routes.data[id];
      mountMap('dr-map-' + id, m => {
        m.layers.clearLayers();
        const cur = d || { ...s, route: null };
        if (cur.route) {
          L.polyline(cur.route.line, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(m.layers);
          L.polyline(cur.route.line, { color: '#0f5c53', weight: 5 }).addTo(m.layers);
        }
        cur.pts.forEach((p, i) =>
          dot(
            m.layers,
            p,
            cur.names[i] == 'You' ? '#2a78d6' : cur.names[i] == 'Pickup' ? '#111827' : '#ea580c',
            cur.names[i],
            8
          )
        );
        const k2 = (cur.route ? 'r' : 's') + key;
        if (m.fitted != k2) {
          m.fitted = k2;
          m.map.fitBounds(cur.route ? cur.route.line : cur.pts, { padding: [40, 40], maxZoom: 16 });
        }
      });
      if (legsEl && d) {
        legsEl.innerHTML = d.route
          ? d.route.legs
              .map(
                (l, i) =>
                  `${i ? ' · then ' : ''}<b>${l.km.toFixed(1)} km</b> (${l.min} min) to ${esc(d.names[i + 1].toLowerCase())}`
              )
              .join('') + ` · total ${d.route.min} min`
          : 'Road routing is unavailable; use the navigation buttons.';
      }
    });
  };
  /* driver earnings on the split */
  const driverEarn = () => {
    const em = me(),
      all = (S.bk || []).filter(b => b.drvUser == em && done(b)).sort((a, b) => (a.cd < b.cd ? 1 : -1)),
      un = all.filter(b => !b.rem && b.flow != 'owner'), // newer trips are settled with the owner (turnover), not remitted to ZamMove
      cur = wk(Date.now()),
      weeks = [...new Set(un.map(b => wk(b.cd)))].sort(),
      rl = (S.rem || [])
        .filter(r => r.drv == em)
        .slice()
        .reverse(),
      m = thisMonth(),
      share = all.reduce((s, b) => s + split(b).drv, 0),
      monthShare = all.filter(b => monthOf(b.cd) == m).reduce((s, b) => s + split(b).drv, 0),
      owe = un.reduce((s, b) => s + dueFor(b), 0),
      late = un.filter(b => overdueDays(b) > 0);
    return `<div class="tw-pb-10">${head('Earnings & remittance', 'Your share of each trip. New trips: hand the rest to your vehicle owner (Turn over, below). Older trips from before the change: remit to ZamMove weekly.')}
${late.length ? `<div class="tw-mt-4 tw-rounded-xl tw-bg-rose-50 tw-px-4 tw-py-3 tw-text-sm tw-text-rose-800 tw-ring-1 tw-ring-rose-200"><b>Remittance overdue:</b> ${late.length} trip${late.length > 1 ? 's' : ''} from a week that ended more than ${GRACE} days ago. Remit now to avoid a flag on your account.</div>` : ''}
${grid([kpi('This month (your share)', peso(monthShare), mLabel(m)), kpi('All-time share', peso(share), all.length + ' completed trips'), kpi('To remit to ZamMove (older trips)', peso(owe), un.length + ' trip' + (un.length == 1 ? '' : 's') + ' not remitted', owe > 0 ? 'tw-text-amber-700' : 'tw-text-slate-900'), kpi('Remittances', rl.length, rl.filter(r => r.st == 'Verified' || r.st == 'Resolved').length + ' verified')])}
${section(
  'Weekly remittance',
  '',
  weeks.length
    ? `<div class="tw-grid tw-gap-3">${weeks
        .map(w => {
          const l = un.filter(b => wk(b.cd) == w),
            g = l.reduce((s, b) => s + gross(b), 0),
            sh = l.reduce((s, b) => s + split(b).drv, 0),
            due = l.reduce((s, b) => s + dueFor(b), 0),
            od = Math.max(...l.map(overdueDays));
          return panel(
            `<div class="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2"><div><b>Week of ${w}</b> ${od > 0 ? pill(od + ' day' + (od > 1 ? 's' : '') + ' overdue', 'red') : ''}<div class="tw-text-sm tw-text-slate-600">${l.length} trip${l.length > 1 ? 's' : ''} · collected ${peso(g)} · your share ${peso(sh)}</div></div><div class="tw-text-right"><div class="tw-text-xs tw-text-slate-500">Remit</div><b class="tw-font-display tw-text-xl tw-tabular-nums">${peso(due)}</b></div></div>${w >= cur ? '<p class="tw-m-0 tw-mt-2 tw-text-sm tw-text-slate-500">This week has not ended. You can remit after it closes.</p>' : `<div class="wsa tw-mt-3"><select id="m-${w}"><option>Cash</option><option>GCash</option></select><input id="q-${w}" placeholder="Receipt / reference"><button class="btn sm" data-a="w-rm" data-w="${w}">Submit remittance</button></div>`}`
          );
        })
        .join('')}</div>`
    : empty('Nothing to remit. Completed trips appear here.')
)}
${section(
  'Remittance history',
  '',
  panel(
    table(
      ['Week', 'Due', 'Received', 'Status'],
      rl.map(r => [
        esc(r.week),
        peso(r.due),
        r.recv == null ? '—' : peso(r.recv),
        pill(
          r.st,
          ['Verified', 'Resolved'].includes(r.st) ? 'green' : r.st == 'Discrepancy' ? 'red' : 'amber'
        ),
      ]),
      [1, 2]
    ) || empty('No remittances yet.')
  )
)}
${section(
  'Completed trips',
  '',
  panel(
    table(
      ['Date', 'Booking', 'Collected', 'Your share', 'To remit'],
      all.map(b => [
        fmtD(b.cd),
        esc(b.id),
        peso(gross(b)),
        `<b>${peso(split(b).drv)}</b> <span class="tw-text-xs tw-text-slate-400">${split(b).pct}%</span>`,
        b.rem ? '<span class="tw-text-slate-400">remitted</span>' : peso(dueFor(b)),
      ]),
      [2, 3, 4]
    ) || empty('No completed trips yet.')
  )
)}</div>`;
  };

  /* ======================= ADMIN ======================= */
  const roleOf = u => (u.roles || []).filter(r => r.st == 'approved').map(r => r.t);
  const adminDash = () => {
    const bk = S.bk || [],
      m = thisMonth(),
      pm = prevMonth(m),
      doneM = bk.filter(b => done(b) && monthOf(b.cd) == m),
      doneP = bk.filter(b => done(b) && monthOf(b.cd) == pm),
      rev = doneM.reduce((s, b) => s + split(b).zam, 0),
      revP = doneP.reduce((s, b) => s + split(b).zam, 0),
      fares = doneM.reduce((s, b) => s + split(b).fare, 0),
      rentals = (S.pay || [])
        .filter(
          p => ['rental', 'deposit'].includes(p.kind) && p.status == 'Verified' && monthOf(payT(p)) == m
        )
        .reduce((s, p) => s + p.amount, 0),
      owed = bk.filter(b => done(b) && !b.rem).reduce((s, b) => s + dueFor(b), 0);
    const days = [...Array(14)].map((_, i) => {
      const d = ph(Date.now() - (13 - i) * 864e5).slice(0, 10);
      return {
        label: d.slice(5).replace('-', '/'),
        value: bk.filter(b => b.cr && ph(b.cr).slice(0, 10) == d).length,
        tip: `${d}: ${bk.filter(b => b.cr && ph(b.cr).slice(0, 10) == d).length} bookings`,
      };
    });
    const us = S.users || [];
    const roles = [
      { label: 'Customers', value: us.filter(u => !u.adm && !u.cash).length },
      { label: 'Drivers', value: us.filter(u => roleOf(u).includes('driver')).length },
      { label: 'Vehicle owners', value: us.filter(u => roleOf(u).includes('owner')).length },
      { label: 'Staff', value: us.filter(u => u.adm || u.cash).length },
    ];
    const act = [
      [
        'Applications to review',
        (S.apps || []).filter(a => !['Approved', 'Rejected'].includes(a.st)).length,
        'apps',
      ],
      ['Vehicles to approve', (S.vh || []).filter(v => v.approval == 'Pending Approval').length, 'veh'],
      [
        'Assignments to act on',
        (S.asg || []).filter(a => ['Pending Admin Review', 'Pending Activation'].includes(a.st)).length,
        'asg',
      ],
      [
        'Payments to verify',
        (S.pay || []).filter(p => p.status == 'Submitted' && !['down', 'final'].includes(p.kind)).length,
        'pay',
      ],
      ['Open incidents', (S.inc || []).filter(c => !['Closed', 'Withdrawn'].includes(c.st)).length, 'inc'],
      ['Flagged users', us.filter(u => (u.flags || []).some(f => f.open)).length, 'users'],
      ['Suspended accounts', us.filter(u => u.status == 'suspended').length, 'users'],
    ];
    const delta = revP
      ? `${rev >= revP ? '▲' : '▼'} ${Math.abs(Math.round(((rev - revP) / revP) * 100))}% vs ${mLabel(pm)}`
      : mLabel(m);
    return `<div class="tw-pb-10">${head('Overview', 'ZamMove at a glance: money this month, activity, users and what needs your attention.')}
${grid([kpi('ZamMove revenue', peso(rev), delta, 'tw-text-harbor-700'), kpi('Trip fares completed', peso(fares), doneM.length + ' trips in ' + mLabel(m)), kpi('Rental payments verified', peso(rentals), 'rental fees and deposits'), kpi('Still with drivers', peso(owed), 'not yet remitted', owed > 0 ? 'tw-text-amber-700' : 'tw-text-slate-900', go('cashier', 'sum'))])}
${section('Needs your attention', '', `<div class="tw-grid tw-grid-cols-2 tw-gap-3 sm:tw-grid-cols-3 lg:tw-grid-cols-7">${act.map(([k, n, p]) => `<div class="tw-cursor-pointer tw-rounded-2xl tw-bg-white tw-p-4 tw-ring-1 ${n ? 'tw-ring-amber-300' : 'tw-ring-slate-900/5'} hover:tw-ring-harbor-300" ${go('admin', p)}><div class="tw-font-display tw-text-2xl tw-font-bold ${n ? 'tw-text-amber-700' : 'tw-text-slate-400'}">${n}</div><div class="tw-mt-1 tw-text-xs tw-font-medium tw-text-slate-600">${k}</div></div>`).join('')}</div>`)}
<div class="tw-mt-8 tw-grid tw-gap-4 lg:tw-grid-cols-3"><div class="lg:tw-col-span-2">${panel(`<h2 class="tw-m-0 tw-text-lg">Bookings per day</h2><p class="tw-m-0 tw-mb-3 tw-text-sm tw-text-slate-500">Last 14 days, by the day the booking was made</p>${barChart(days, { title: 'Bookings per day, last 14 days' })}`)}</div>${panel(`<h2 class="tw-m-0 tw-text-lg">Users by role</h2><p class="tw-m-0 tw-mb-4 tw-text-sm tw-text-slate-500">${us.length} accounts</p>${hBars(roles)}<div class="tw-mt-4">${btn('w-go', 'Manage users', 'data-w="admin" data-p="users"', 'outline')}</div>`)}</div>
${section('Trips this month', '', grid([kpi('Completed', doneM.length), kpi('In progress', bk.filter(b => TRACK.includes(b.st)).length), kpi('Waiting for a driver', bk.filter(b => b.st == 'Pending').length), kpi('Cancelled', bk.filter(b => b.st == 'Cancelled' && monthOf(b.cr) == m).length)]).replace('tw-mt-6 ', ''))}</div>`;
  };
  const UF = { q: '', role: '', st: '', open: '' };
  const adminUsers = () => {
    const q = UF.q.toLowerCase();
    const list = (S.users || []).filter(u => {
      if (q && !`${u.name} ${u.em} ${u.ph || ''}`.toLowerCase().includes(q)) return false;
      const rs = roleOf(u);
      if (UF.role == 'customer' && (rs.length || u.adm || u.cash)) return false;
      if (['driver', 'owner'].includes(UF.role) && !rs.includes(UF.role)) return false;
      if (UF.role == 'staff' && !(u.adm || u.cash)) return false;
      if (UF.st == 'suspended' && u.status != 'suspended') return false;
      if (UF.st == 'flagged' && !(u.flags || []).some(f => f.open)) return false;
      return true;
    });
    const row = u => {
      const rs = (u.roles || []).filter(r => ['approved', 'revoked', 'pending'].includes(r.st));
      const open = (u.flags || []).filter(f => f.open);
      const id = esc(u.em);
      const isOpen = UF.open == u.em;
      const detail = isOpen
        ? `<tr><td colspan="6" class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-bg-slate-50 tw-p-4"><div class="tw-grid tw-gap-4 lg:tw-grid-cols-3">
<div><b class="tw-text-sm">Account</b><p class="tw-m-0 tw-mt-1 tw-text-sm tw-text-slate-600">${esc(u.ph || '')} · ${esc(u.ad || '')}<br>Joined ${fmtD(u.cr)}${u.susp && u.status == 'suspended' ? `<br><span class="tw-text-rose-700">Suspended ${fmtD(u.susp.t)}: ${esc(u.susp.reason)}</span>` : ''}</p>
${u.adm == 'super' || u.em == me() ? '<p class="tw-m-0 tw-mt-2 tw-text-xs tw-text-slate-500">This account cannot be suspended here.</p>' : `<div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2"><input id="zo-ur-${key(id)}" placeholder="Reason (the user sees it)" class="tw-min-h-[38px] tw-flex-1 tw-text-sm" style="min-width:160px">${u.status == 'suspended' ? btn('zo-ust', 'Reactivate', `data-em="${id}" data-s="active"`) : btn('zo-ust', 'Suspend', `data-em="${id}" data-s="suspended"`, 'danger')}</div>`}</div>
<div><b class="tw-text-sm">Roles</b><div class="tw-mt-2 tw-flex tw-flex-col tw-gap-2">${rs.length ? rs.map(r => `<div class="tw-flex tw-flex-wrap tw-items-center tw-gap-2">${pill(r.t == 'owner' ? 'Vehicle owner' : 'Driver', r.st == 'approved' ? 'green' : r.st == 'pending' ? 'amber' : 'red')}<span class="tw-text-xs tw-text-slate-500">${esc(r.st)}</span>${r.st == 'approved' ? btn('zo-rr', 'Revoke', `data-em="${id}" data-r="${r.t}"`, 'danger') : ''}</div>`).join('') : '<span class="tw-text-sm tw-text-slate-500">Customer only. Driver and owner roles are granted through Applications.</span>'}</div><p class="tw-m-0 tw-mt-2 tw-text-xs tw-text-slate-500">Revoking uses the reason typed under Account. Revoking the driver role ends his vehicle assignment; revoking the owner role stops his rentals.</p></div>
<div><b class="tw-text-sm">Flags</b>${
            (u.flags || []).length
              ? `<div class="tw-mt-2 tw-flex tw-flex-col tw-gap-2">${(u.flags || [])
                  .slice()
                  .reverse()
                  .map(
                    f =>
                      `<div class="tw-rounded-xl tw-bg-white tw-p-3 tw-text-sm tw-ring-1 tw-ring-slate-200">${pill(f.kind, f.open ? 'red' : 'slate')} <span class="tw-text-xs tw-text-slate-500">${fmtD(f.t)} by ${esc(U(f.by).name || f.by)}</span><div class="tw-mt-1 tw-text-slate-700">${esc(f.note)}</div>${f.open ? `<div class="tw-mt-2 tw-flex tw-gap-2"><input id="zo-fn-${esc(f.id)}" placeholder="How it was resolved" class="tw-min-h-[34px] tw-flex-1 tw-text-xs">${btn('zo-fr', 'Resolve', `data-em="${id}" data-id="${esc(f.id)}"`, 'outline')}</div>` : `<div class="tw-mt-1 tw-text-xs tw-text-slate-500">Resolved: ${esc(f.rnote || '')}</div>`}</div>`
                  )
                  .join('')}</div>`
              : '<p class="tw-m-0 tw-mt-1 tw-text-sm tw-text-slate-500">No flags.</p>'
          }</div></div></td></tr>`
        : '';
      return `<tr class="hover:tw-bg-slate-50/70"><td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5"><b class="tw-text-slate-900">${esc(u.name || '')}</b><div class="tw-text-xs tw-text-slate-500">${esc(u.em)}</div></td><td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5"><div class="tw-flex tw-flex-wrap tw-gap-1">${u.adm ? pill(u.adm == 'super' ? 'Owner admin' : u.adm == 'sub' ? 'Secondary admin' : 'Admin', 'teal') : ''}${u.cash ? pill('Cashier', 'teal') : ''}${roleOf(
        u
      )
        .map(r => pill(r == 'owner' ? 'Owner' : 'Driver', 'blue'))
        .join(
          ''
        )}${!u.adm && !u.cash && !roleOf(u).length ? pill('Customer') : ''}</div></td><td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5">${u.status == 'suspended' ? pill('Suspended', 'red') : u.ver === false ? pill('Not verified', 'amber') : pill('Active', 'green')}</td><td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5">${open.length ? pill(open.length + ' open', 'red') : '<span class="tw-text-slate-400">—</span>'}</td><td class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-100 tw-px-3 tw-py-2.5 tw-text-right">${btn('zo-uo', isOpen ? 'Close' : 'Manage', `data-em="${id}"`, 'outline')}</td></tr>${detail}`;
    };
    const sel = (id, v, opts) =>
      `<select id="${id}" class="tw-min-h-[42px] tw-text-sm" style="width:auto;min-width:10rem">${opts.map(([k, l]) => `<option value="${k}" ${v == k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="tw-pb-10">${head('Users', 'Every account in ZamMove. Suspend or reactivate accounts, remove driver or owner roles, and handle flags from the cashier. Every action is written to the audit log.')}
<div class="tw-mt-6 tw-flex tw-flex-wrap tw-items-center tw-gap-2"><input id="zo-uq" value="${esc(UF.q)}" placeholder="Search name, email or phone" class="tw-min-h-[42px] tw-text-sm" style="flex:1 1 220px;width:auto">${sel(
      'zo-urole',
      UF.role,
      [
        ['', 'All roles'],
        ['customer', 'Customers'],
        ['driver', 'Drivers'],
        ['owner', 'Vehicle owners'],
        ['staff', 'Staff'],
      ]
    )}${sel('zo-ust2', UF.st, [
      ['', 'Any status'],
      ['flagged', 'Flagged'],
      ['suspended', 'Suspended'],
    ])}<span class="tw-text-sm tw-text-slate-500">${list.length} of ${(S.users || []).length}</span></div>
<div class="tw-mt-4">${panel(list.length ? `<div class="tw-overflow-x-auto"><table class="tw-w-full tw-border-collapse tw-text-sm"><thead><tr>${['User', 'Roles', 'Status', 'Flags', ''].map(h => `<th class="tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-px-3 tw-py-2 tw-text-left tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wider tw-text-slate-500">${h}</th>`).join('')}</tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : empty('No users match.'))}</div></div>`;
  };

  /* ======================= CASHIER ======================= */
  let IM = thisMonth();
  const months = () => {
    const s = new Set([thisMonth()]);
    (S.pay || []).forEach(p => payT(p) && s.add(monthOf(payT(p))));
    (S.bk || []).forEach(b => b.cd && s.add(monthOf(b.cd)));
    return [...s].sort().reverse();
  };
  const owners = () => (S.users || []).filter(u => roleOf(u).includes('owner'));
  const cashIncome = () => {
    const m = IM,
      pay = S.pay || [],
      bk = S.bk || [];
    const collected = pay.filter(
      p => ['down', 'final'].includes(p.kind) && PAYOK.includes(p.status) && monthOf(payT(p)) == m
    );
    const doneM = bk.filter(b => done(b) && monthOf(b.cd) == m);
    const zam = doneM.reduce((s, b) => s + split(b).zam, 0),
      drv = doneM.reduce((s, b) => s + split(b).drv, 0),
      own = doneM.reduce((s, b) => s + split(b).own, 0);
    const rentals = pay
      .filter(p => ['rental', 'deposit'].includes(p.kind) && p.status == 'Verified' && monthOf(payT(p)) == m)
      .reduce((s, p) => s + p.amount, 0);
    const outDrivers = bk.filter(b => done(b) && !b.rem).reduce((s, b) => s + dueFor(b), 0);
    const owedOwners = owners().reduce((s, u) => s + Math.max(0, ownerBal(u.em).due), 0);
    const [y, mo] = m.split('-').map(Number),
      nd = new Date(y, mo, 0).getDate();
    const daily = [...Array(nd)].map((_, i) => {
      const d = `${m}-${String(i + 1).padStart(2, '0')}`,
        v = r2(collected.filter(p => ph(payT(p)).slice(0, 10) == d).reduce((s, p) => s + p.amount, 0));
      return { label: String(i + 1), value: v, tip: `${d}: ${peso(v)}` };
    });
    const sumCol = collected.reduce((s, p) => s + p.amount, 0);
    return `<div class="tw-pb-10">${head(
      'Income',
      'Money in and out for the month: what customers paid, what ZamMove keeps, what drivers still hold and what owners are owed.',
      `<label class="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium tw-text-slate-600">Month <select id="zo-im" class="tw-min-h-[42px] tw-text-sm">${months()
        .map(x => `<option value="${x}" ${x == m ? 'selected' : ''}>${mLabel(x)}</option>`)
        .join('')}</select></label>`
    )}
${grid([kpi('Collected from customers', peso(sumCol), collected.length + ' trip payments'), kpi('ZamMove revenue', peso(zam), 'service fees + commission', 'tw-text-harbor-700'), kpi('Rental payments verified', peso(rentals), 'rental fees and deposits'), kpi('Still with drivers', peso(outDrivers), 'all months, not remitted', outDrivers > 0 ? 'tw-text-amber-700' : 'tw-text-slate-900', go('cashier', 'sum'))])}
<div class="tw-mt-6 tw-grid tw-gap-4 lg:tw-grid-cols-3"><div class="lg:tw-col-span-2">${panel(`<h2 class="tw-m-0 tw-text-lg">Trip payments per day</h2><p class="tw-m-0 tw-mb-3 tw-text-sm tw-text-slate-500">${mLabel(m)} · recorded by drivers or verified</p>${barChart(daily, { fmt: v => (v >= 1000 ? '₱' + Math.round(v / 100) / 10 + 'k' : '₱' + v), title: 'Trip payments per day' })}`)}</div>${panel(
      `<h2 class="tw-m-0 tw-text-lg">Where the trip money goes</h2><p class="tw-m-0 tw-mb-4 tw-text-sm tw-text-slate-500">${doneM.length} trips completed in ${mLabel(m)}</p>${stack(
        [
          { label: 'ZamMove', value: r2(zam), color: SERIES.s1 },
          { label: 'Drivers', value: r2(drv), color: SERIES.s2 },
          { label: 'Owners', value: r2(own), color: SERIES.s3 },
        ]
      )}`
    )}</div>
${section(
  'Owner payouts',
  `Owed to owners now: ${peso(owedOwners)}. Pay owners after their drivers’ remittances are verified.`,
  panel(
    owners().length
      ? table(
          ['Owner', 'Payable earned', 'Paid', 'Balance', 'Record a payout'],
          owners().map(u => {
            const b = ownerBal(u.em),
              id = esc(u.em);
            return [
              `<b>${esc(u.name)}</b><div class="tw-text-xs tw-text-slate-500">${esc(u.em)}</div>`,
              peso(b.earned) + (b.waiting ? `<div class="tw-text-xs tw-text-slate-500">+ ${peso(b.waiting)} waiting for remittance</div>` : ''),
              peso(b.paid),
              `<b class="${b.due > 0 ? 'tw-text-harbor-700' : b.due < 0 ? 'tw-text-red-700' : ''}">${b.due < 0 ? 'Owes ' + peso(-b.due) : peso(b.due)}</b>${b.held || b.heldOpen ? `<div class="tw-text-xs tw-text-slate-500">rental cash held ${peso((b.held || 0) + (b.heldOpen || 0))}</div>` : ''}`,
              b.due > 0
                ? `<div class="tw-flex tw-flex-wrap tw-justify-end tw-gap-2"><input id="zo-pa-${key(id)}" type="number" min="1" value="${b.due}" class="tw-min-h-[36px] tw-text-sm" style="width:7.5rem" aria-label="Amount"><select id="zo-pm-${key(id)}" class="tw-min-h-[36px] tw-text-sm" style="width:6.5rem" aria-label="Method"><option>GCash</option><option>Cash</option></select><input id="zo-pr-${key(id)}" placeholder="GCash ref" class="tw-min-h-[36px] tw-text-sm" style="width:9.5rem" aria-label="Reference">${btn('zo-pay', 'Pay', `data-em="${id}"`)}</div>`
                : b.due < 0
                  ? `<div class="tw-flex tw-flex-wrap tw-justify-end tw-gap-2"><input id="zo-ra-${key(id)}" type="number" min="1" value="${-b.due}" class="tw-min-h-[36px] tw-text-sm" style="width:7.5rem" aria-label="Amount received"><select id="zo-rm-${key(id)}" class="tw-min-h-[36px] tw-text-sm" style="width:6.5rem" aria-label="Method"><option>Cash</option><option>GCash</option></select><input id="zo-rr-${key(id)}" placeholder="GCash ref" class="tw-min-h-[36px] tw-text-sm" style="width:9.5rem" aria-label="Reference">${btn('zo-remit', 'Received', `data-em="${id}"`)}</div>`
                  : '<span class="tw-text-slate-400">Nothing owed</span>',
            ];
          }),
          [1, 2, 3, 4]
        )
      : empty('No vehicle owners yet.')
  )
)}</div>`;
  };
  const FK = ['Unremitted money', 'Payment discrepancy', 'Fraud suspicion', 'Other violation'];
  const cashSettle = () => {
    const bk = S.bk || [];
    const drivers = (S.users || []).filter(
      u => roleOf(u).includes('driver') || bk.some(b => b.drvUser == u.em)
    );
    const rows = drivers
      .map(u => {
        const all = bk.filter(b => b.drvUser == u.em && done(b)),
          un = all.filter(b => !b.rem),
          col = all.reduce((s, b) => s + gross(b), 0),
          share = all.reduce((s, b) => s + split(b).drv, 0),
          rems = (S.rem || []).filter(r => r.drv == u.em),
          recv = rems
            .filter(r => ['Verified', 'Resolved'].includes(r.st))
            .reduce((s, r) => s + (r.recv || 0), 0),
          pend = rems.filter(r => ['Submitted', 'Discrepancy'].includes(r.st)).reduce((s, r) => s + r.due, 0),
          owe = un.reduce((s, b) => s + dueFor(b), 0) + pend,
          od = un.length ? Math.max(...un.map(overdueDays)) : -1;
        return { u, all, col, share, recv, owe, od, un };
      })
      .filter(x => x.all.length || (x.u.flags || []).length);
    const flagged = (S.users || []).filter(u => (u.flags || []).some(f => f.open));
    const flagBox = (u, x) => {
      const id = esc(u.em);
      return `<details class="tw-mt-1"><summary class="tw-cursor-pointer tw-text-xs tw-font-semibold tw-text-rose-700">Flag</summary><div class="tw-mt-2 tw-flex tw-flex-col tw-gap-2" style="min-width:min(260px,100%)"><select id="zo-fk-${key(id)}" class="tw-min-h-[36px] tw-text-sm" aria-label="Reason">${FK.map(k => `<option>${k}</option>`).join('')}</select><input id="zo-fnote-${key(id)}" class="tw-min-h-[36px] tw-text-sm" aria-label="Note" value="${x && x.owe > 0 ? esc(`Owes ${peso(x.owe)}${x.od > 0 ? ', ' + x.od + ' days overdue' : ''}.`) : ''}" placeholder="What and how much">${btn('zo-flag', 'Flag user', `data-em="${id}"`, 'danger')}</div></details>`;
    };
    return `<div class="tw-pb-10">${head('Driver settlements', `What each driver collected, his share, and what he still has to remit. Remittance is due ${GRACE} days after each week ends; after that it shows as overdue. Flag a driver who does not remit; an administrator can suspend the account.`)}
${grid([kpi('Still with drivers', peso(rows.reduce((s, x) => s + x.owe, 0))), kpi('Overdue drivers', rows.filter(x => x.od > 0).length, 'past the ' + GRACE + '-day grace', rows.some(x => x.od > 0) ? 'tw-text-rose-700' : 'tw-text-slate-900'), kpi('Received (verified)', peso(rows.reduce((s, x) => s + x.recv, 0))), kpi('Flagged users', flagged.length, '', flagged.length ? 'tw-text-rose-700' : 'tw-text-slate-900')])}
${section(
  'Drivers',
  '',
  panel(
    table(
      ['Driver', 'Collected', 'Driver share', 'Received', 'Still owes', 'Status', ''],
      rows.map(x => [
        `<b>${esc(x.u.name)}</b><div class="tw-text-xs tw-text-slate-500">${esc(x.u.em)}</div>`,
        peso(x.col),
        peso(x.share),
        peso(x.recv),
        `<b>${peso(x.owe)}</b>`,
        `${x.od > 0 ? pill(x.od + ' days overdue', 'red') : x.owe > 0 ? pill('Due', 'amber') : pill('Settled', 'green')}${x.u.status == 'suspended' ? ' ' + pill('Suspended', 'red') : ''}${(x.u.flags || []).some(f => f.open) ? ' ' + pill('Flagged', 'red') : ''}`,
        flagBox(x.u, x),
      ]),
      [1, 2, 3, 4]
    ) || empty('No completed trips yet.')
  )
)}
${section(
  'Flagged users',
  'Open flags. Resolve a flag once the money is settled or the issue is closed.',
  flagged.length
    ? `<div class="tw-grid tw-gap-3 lg:tw-grid-cols-2">${flagged
        .map(u =>
          panel(
            `<b>${esc(u.name)}</b> <span class="tw-text-xs tw-text-slate-500">${esc(u.em)}</span>${u.status == 'suspended' ? ' ' + pill('Suspended', 'red') : ''}${(
              u.flags || []
            )
              .filter(f => f.open)
              .map(
                f =>
                  `<div class="tw-mt-3 tw-rounded-xl tw-bg-rose-50/60 tw-p-3 tw-text-sm tw-ring-1 tw-ring-rose-200">${pill(f.kind, 'red')} <span class="tw-text-xs tw-text-slate-500">${fmtD(f.t)}</span><div class="tw-mt-1">${esc(f.note)}</div><div class="tw-mt-2 tw-flex tw-gap-2"><input id="zo-fn-${esc(f.id)}" placeholder="How it was resolved" class="tw-min-h-[34px] tw-flex-1 tw-text-xs">${btn('zo-fr', 'Resolve', `data-em="${esc(u.em)}" data-id="${esc(f.id)}"`, 'outline')}</div></div>`
              )
              .join('')}`
          )
        )
        .join('')}</div>`
    : empty('No flagged users.')
)}
${section(
  'Flag another user',
  'For customers or owners too, e.g. a rental payment that bounced.',
  panel(
    `<div class="tw-flex tw-flex-wrap tw-items-end tw-gap-3"><label class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">User<select id="zo-fu" class="tw-min-h-[42px] tw-text-sm"><option value="">Choose</option>${(
      S.users || []
    )
      .filter(u => u.em != me() && !u.adm)
      .map(u => `<option value="${esc(u.em)}">${esc(u.name)} · ${esc(u.em)}</option>`)
      .join('')}</select></label>${flagBox({ em: '__any' })}</div>`
  )
)}</div>`;
  };
  const LF = { m: '', kind: '', st: '', q: '' };
  const cashLedger = () => {
    const rows = (S.pay || [])
      .filter(
        p =>
          (!LF.m || monthOf(payT(p)) == LF.m) &&
          (!LF.kind || p.kind == LF.kind) &&
          (!LF.st || p.status == LF.st)
      )
      .filter(
        p =>
          !LF.q ||
          `${p.bid} ${p.ref} ${p.payer} ${p.to || ''} ${U(p.payer).name || ''}`
            .toLowerCase()
            .includes(LF.q.toLowerCase())
      )
      .sort((a, b) => (payT(a) < payT(b) ? 1 : -1));
    const inTot = rows
        .filter(p => p.kind != 'owner_payout' && PAYOK.includes(p.status))
        .reduce((s, p) => s + p.amount, 0),
      outTot = rows.filter(p => p.kind == 'owner_payout').reduce((s, p) => s + p.amount, 0);
    const kinds = [...new Set((S.pay || []).map(p => p.kind))],
      sts = [...new Set((S.pay || []).map(p => p.status))];
    const sel = (id, v, opts, all) =>
      `<select id="${id}" class="tw-min-h-[42px] tw-text-sm" style="width:auto;min-width:10rem"><option value="">${all}</option>${opts.map(o => `<option value="${esc(o[0])}" ${v == o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    const kindName = k =>
      ({
        down: 'Down payment',
        final: 'Final payment',
        rental: 'Rental fee',
        deposit: 'Deposit',
        owner_payout: 'Owner payout',
        cancel_fee: 'Cancellation fee',
      })[k] || k;
    return `<div class="tw-pb-10">${head('Payment ledger', 'Every payment in and out. Money in counts only when Recorded by driver or Verified; owner payouts are money out.', btn('w-csv', 'Download CSV', '', 'outline'))}
<div class="tw-mt-6 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${sel(
      'zo-lm',
      LF.m,
      months().map(m => [m, mLabel(m)]),
      'All months'
    )}${sel(
      'zo-lk',
      LF.kind,
      kinds.map(k => [k, kindName(k)]),
      'All kinds'
    )}${sel(
      'zo-ls',
      LF.st,
      sts.map(s => [s, s]),
      'Any status'
    )}<input id="zo-lq" value="${esc(LF.q)}" placeholder="Search booking, reference or name" class="tw-min-h-[42px] tw-text-sm" style="flex:1 1 200px;width:auto"></div>
${grid([kpi('Rows', rows.length), kpi('Money in (counted)', peso(inTot), '', 'tw-text-harbor-700'), kpi('Owner payouts', peso(outTot)), kpi('Waiting to verify', rows.filter(p => p.status == 'Submitted').length)])}
<div class="tw-mt-4">${panel(
      table(
        ['Date', 'Booking / rental', 'Kind', 'Method', 'Reference', 'From / to', 'Status', 'Amount'],
        rows.map(p => [
          fmtD(payT(p)),
          esc(p.bid || '—'),
          esc(kindName(p.kind)),
          esc(p.method),
          `<span class="tw-font-mono tw-text-xs">${esc(p.ref)}</span>`,
          p.kind == 'owner_payout'
            ? 'to ' + esc(U(p.to).name || p.to)
            : esc(U(p.payer).name || p.payer || '') +
              (p.collectedBy
                ? `<div class="tw-text-xs tw-text-slate-500">collected by ${esc(U(p.collectedBy).name || p.collectedBy)}</div>`
                : ''),
          pill(p.status, PAYOK.includes(p.status) ? 'green' : p.status == 'Rejected' ? 'red' : 'amber'),
          `<b class="${p.kind == 'owner_payout' ? 'tw-text-slate-500' : ''}">${p.kind == 'owner_payout' ? '−' : ''}${peso(p.amount)}</b>`,
        ]),
        [7]
      ) || empty('No payments match.')
    )}</div></div>`;
  };

  /* ---------------- register pages ---------------- */
  if (window.ZW && ZW.NAV && ZW.PG) {
    const N = ZW.NAV,
      P = ZW.PG,
      ins = (list, after, item) => {
        if (list.some(n => n[0] == item[0])) return;
        const i = list.findIndex(n => n[0] == after);
        list.splice(i < 0 ? list.length : i + 1, 0, item);
      };
    /* owner */
    const oi = N.owner.findIndex(n => n[0] == 'rmap');
    if (oi >= 0) N.owner.splice(oi, 1); // the Fleet map shows rentals too
    ins(N.owner, 'dash', ['fleet', 'Fleet map', 'pin']);
    ins(N.owner, 'fleet', ['earn', 'Earnings', 'doc']);
    P.owner.fleet = ownerFleet;
    P.owner.earn = ownerEarn;
    const oDash = P.owner.dash;
    P.owner.dash = () => oDash().replace(/(<h1[^>]*>[^<]*<\/h1>)/, '$1' + ownerDashTop());
    const oDrv = P.owner.drv;
    P.owner.drv = () => oDrv() + reportForm();
    const oHist = P.owner.hist;
    if (oHist)
      P.owner.hist = () =>
        oHist().replace(
          'Owner compensation is not configured yet, so no owner earnings are shown.',
          'Your share of each completed trip is on the Earnings page.'
        );
    /* driver */
    const dDash = P.driver.dash;
    P.driver.dash = () => dDash() + upcoming();
    P.driver.earn = driverEarn;
    /* admin */
    P.admin.dash = adminDash;
    ins(N.admin, 'dash', ['users', 'Users', 'users']);
    P.admin.users = adminUsers;
    /* cashier */
    if (P.cashier && N.cashier) {
      N.cashier.unshift(['inc', 'Income', 'home']);
      P.cashier.inc = cashIncome;
      P.cashier.sum = cashSettle;
      P.cashier.led = cashLedger;
      const s = N.cashier.find(n => n[0] == 'sum');
      if (s) s[1] = 'Settlements & flags';
    }
  }

  /* ---------------- events ---------------- */
  const after = async (p, okText) => {
    const r = await p;
    msg = { t: r.ok ? okText : r.err, good: !!r.ok };
    if (r.ok) toast(okText);
    render();
    return r;
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="zo-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        em = t.dataset.em,
        id = t.dataset.id;
      if (a == 'zo-split')
        return after(
          ZAPI.act('cfgSplit', { comm: val('cfg-comm'), drvPct: val('cfg-drv') }),
          'Money split saved'
        );
      if (a == 'zo-report')
        return after(
          ZAPI.act('ownerReport', {
            driver: val('zo-rd'),
            cat: val('zo-rc'),
            sev: val('zo-rs'),
            bid: val('zo-rb'),
            d: val('zo-rdesc'),
          }),
          'Report sent to ZamMove'
        );
      if (a == 'zo-hb')
        return after(
          ZAPI.act('handBack', { id, reason: val('zo-hb-' + id) }),
          'Job handed back. The customer was told.'
        );
      if (a == 'zo-uo') {
        UF.open = UF.open == em ? '' : em;
        return render();
      }
      if (a == 'zo-ust')
        return after(
          ZAPI.act('userStatus', { em, status: t.dataset.s, reason: val('zo-ur-' + key(em)) }),
          t.dataset.s == 'suspended' ? 'Account suspended' : 'Account reactivated'
        );
      if (a == 'zo-rr')
        return after(
          ZAPI.act('roleRevoke', { em, role: t.dataset.r, reason: val('zo-ur-' + key(em)) }),
          'Role revoked'
        );
      if (a == 'zo-fr')
        return after(ZAPI.act('flagResolve', { em, id, note: val('zo-fn-' + id) }), 'Flag resolved');
      if (a == 'zo-flag') {
        const who = em == '__any' ? val('zo-fu') : em;
        return after(
          ZAPI.act('userFlag', { em: who, kind: val('zo-fk-' + key(em)), note: val('zo-fnote-' + key(em)) }),
          'User flagged. Administrators were notified.'
        );
      }
      if (a == 'zo-orm')
        return after(ZAPI.act('ownerRemitSend', { amount: val('zo-oa'), method: val('zo-om'), ref: val('zo-or') }), 'Remittance sent. The cashier verifies it.');
      if (a == 'zo-remit')
        return after(
          ZAPI.act('ownerRemit', { owner: em, amount: val('zo-ra-' + key(em)), method: val('zo-rm-' + key(em)), ref: val('zo-rr-' + key(em)) }),
          'Payment from the owner recorded'
        );
      if (a == 'zo-pay')
        return after(
          ZAPI.act('ownerPayout', {
            owner: em,
            amount: val('zo-pa-' + key(em)),
            method: val('zo-pm-' + key(em)),
            ref: val('zo-pr-' + key(em)),
          }),
          'Payout recorded'
        );
    },
    true
  );
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id == 'zo-im') {
      IM = e.target.value;
      return render();
    }
    if (id == 'zo-urole' || id == 'zo-ust2') {
      UF[id == 'zo-urole' ? 'role' : 'st'] = e.target.value;
      return render();
    }
    if (['zo-lm', 'zo-lk', 'zo-ls'].includes(id)) {
      LF[{ 'zo-lm': 'm', 'zo-lk': 'kind', 'zo-ls': 'st' }[id]] = e.target.value;
      return render();
    }
  });
  let qt = null;
  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id != 'zo-uq' && id != 'zo-lq') return;
    clearTimeout(qt);
    qt = setTimeout(() => {
      if (id == 'zo-uq') UF.q = e.target.value;
      else LF.q = e.target.value;
      render();
      const f = document.getElementById(id);
      if (f) {
        f.focus();
        f.setSelectionRange(f.value.length, f.value.length);
      }
    }, 300);
  });

  /* maps after each render; positions refresh with the 10-second poll (ZGPS.update) */
  const afterRender = () => {
    if (S.ws == 'owner' && (S.wp || {}).owner == 'fleet') mountMap('fl-map', drawFleet);
    else mountMap('fl-map', () => {});
    if (S.ws == 'driver' && (S.wp || {}).driver == 'trip') {
      askHere();
      drawRoutes();
    }
    Object.keys(maps).forEach(k => !document.getElementById(k) && mountMap(k, () => {}));
    const w = S.ws,
      p = (S.wp || {})[w];
    if (!['fleet', 'earn', 'users', 'inc', 'sum', 'led', 'drv', 'set', 'dash', 'trip'].includes(p))
      msg = { t: '', good: true };
  };
  if (window.ZGPS) {
    const _u = ZGPS.update;
    ZGPS.update = () => {
      _u();
      try {
        if (maps['fl-map']) drawFleet(maps['fl-map']);
        if (S.ws == 'driver') drawRoutes();
      } catch (e) {}
    };
  }
  const _r = render;
  render = function () {
    _r();
    try {
      afterRender();
    } catch (e) {
      console.error('[zammove] ops', e);
    }
  };
  const css = document.createElement('style');
  css.textContent = `.zo-tip{position:fixed;z-index:2000;pointer-events:none;background:#0f172a;color:#fff;font:600 12px var(--text);padding:6px 9px;border-radius:8px;box-shadow:0 6px 18px rgba(15,23,42,.25);white-space:nowrap}
.zo-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.zo-bar path{transition:opacity .12s}.zo-bar:hover path{opacity:.8}
html[data-mode='dark'] .zo-chart text{fill:#a9bab8}html[data-mode='dark'] .zo-chart line{stroke:#2f4140}`;
  document.head.appendChild(css);
  render();
})();
