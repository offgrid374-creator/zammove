/**
 * 04-app-v2.js — logged-in layout: overview tiles, the schematic booking map with the live
 * estimate callout, and the mover counter on the booking page.
 */
if (!S.mode) {
  S.mode = 'light';
  save();
}
applyMode();
const sh = t => esc(String(t).split(',')[0]);
home = function () {
  const act = S.bk.filter(b => !done(b)).sort((a, b) => (a.dt + a.tm < b.dt + b.tm ? -1 : 1)),
    nx = act[0],
    dn = S.bk.filter(b => b.st == 'Completed').length,
    sp = ZPAY.total(),
    i = nx ? FLOW.indexOf(nx.st) : 0;
  return (
    vbox() +
    `<h1>Overview</h1><div class="tiles" style="margin-top:16px"><div class="tile"><span>Active trips</span><b>${act.length}</b></div><div class="tile"><span>Completed</span><b>${dn}</b></div><div class="tile"><span>Paid so far</span><b>${m0(sp)}</b></div></div>
<div class="grid g2" style="margin-top:16px;align-items:start"><div class="card">${nx ? `<div class="row" style="padding-top:0"><span class="mu">Next trip · ${nx.id}</span><span class="tag g">${nx.st}</span></div><div style="font-size:26px;font-weight:600;letter-spacing:-.03em;line-height:1.2;margin:8px 0 4px">${sh(nx.pu)} to ${sh(nx.dr)}</div><div class="mu">${nx.dt} at ${nx.tm} · ${nx.vn}</div><div class="meter" style="margin:20px 0 8px"><i style="width:${((i + 1) / FLOW.length) * 100}%"></i></div><div class="row mu" style="padding:0"><span>Step ${i + 1} of ${FLOW.length}</span><b style="color:var(--tx)">${peso(nx.tot)}</b></div><div style="display:flex;gap:8px;margin-top:20px"><button class="btn" data-a="${i >= 1 ? 'trk' : 'nav'}" data-id="${nx.id}" data-v="bookings">${i >= 1 ? 'Track trip' : 'View booking'}</button><button class="btn o" data-a="nav" data-v="bookings">All bookings</button></div>` : `<div class="empty" style="padding:24px">No active trips.<div style="margin-top:12px"><button class="btn" data-a="nav" data-v="book">Book a haul</button></div></div>`}</div>
<div class="card"><h2>Popular routes</h2>${RT.slice(0, 4)
      .map(
        (r, j) =>
          `<div class="rrow" data-a="route" data-id="${j}"><div><b>${r[1]} to ${r[2]}</b><div class="mu" style="font-size:14px">${HV.find(v => v.id == r[0]).n}</div></div><span class="pr" style="font-variant-numeric:tabular-nums">${r[3]} km</span></div>`
      )
      .join('')}</div></div>
<div class="grid g2" style="margin-top:16px"><div class="card" data-a="nav" data-v="book"><h2>Book a haul</h2><p class="mu">Truck and driver, priced before you submit.</p><span class="btn">Book a haul</span></div><div class="card" data-a="nav" data-v="rent"><h2>Rent a vehicle</h2><p class="mu">Self-drive with a refundable deposit from ${peso(DEP)}.</p><span class="btn o">Rent a vehicle</span></div></div>
${recent()}`
  );
};
const MX = l => Math.max(24, Math.min(576, 24 + ((l - 121.99) / 0.18) * 552)),
  MYc = l => Math.max(24, Math.min(496, 496 - ((l - 6.895) / 0.1) * 472)),
  LB = [
    'Zamboanga City Hall',
    'Zamboanga International Airport',
    'Western Mindanao State University, Zamboanga City',
    'Pasonanca Park, Zamboanga City',
    'Zamboanga City Port',
    'Divisoria, Zamboanga City',
    'Ayala, Zamboanga City',
    'Taluksangay, Zamboanga City',
    'Recodo, Zamboanga City',
  ];
window.mapUpd = function () {
  const m = $('#bmap');
  if (!m) return;
  const A = coord(val('pu')),
    B = coord(val('dr')),
    e = est(),
    ok = A && B;
  let g = '';
  for (let i = 0; i <= 4; i++) g += `<path class="gl" d="M${24 + i * 138} 24V496M24 ${24 + i * 118}H576"/>`;
  const dots = PL.map((p, i) =>
    p[1] > 6.895 && p[1] < 6.995 && p[2] > 121.99 && p[2] < 122.17
      ? `<circle class="mdot" data-a="mp" data-id="${i}" cx="${MX(p[2]).toFixed(1)}" cy="${MYc(p[1]).toFixed(1)}" r="5"><title>${esc(p[0])}</title></circle>` +
        (LB.includes(p[0])
          ? `<text x="${(MX(p[2]) + 9).toFixed(1)}" y="${(MYc(p[1]) + 4).toFixed(1)}">${sh(p[0]).replace('Western Mindanao State University', 'WMSU').replace('Zamboanga ', '')}</text>`
          : '')
      : ''
  ).join('');
  const pin = (c, f, n) =>
    `<circle cx="${MX(c[1])}" cy="${MYc(c[0])}" r="8" fill="${f}" stroke="var(--s)" stroke-width="3"/><text x="${MX(c[1]) + 13}" y="${MYc(c[0]) + 4}" style="font-weight:600;fill:var(--tx);font-size:12px">${n}</text>`;
  const rt = ok
    ? `<path d="M${MX(A[1])} ${MYc(A[0])}L${MX(B[1])} ${MYc(B[0])}" stroke="var(--ac)" stroke-width="3" stroke-linecap="round" fill="none"/>`
    : '';
  const cx = ok ? (MX(A[1]) + MX(B[1])) / 12 : 50,
    cy = ok ? (MYc(A[0]) + MYc(B[0])) / 10.4 : 46,
    h = Math.ceil(2 + e.km / 20);
  m.innerHTML = `<svg viewBox="0 0 600 520" role="img" aria-label="Schematic map of Zamboanga City. Tap a pin to set pickup, then drop-off.">${g}${dots}${rt}${A ? pin(A, 'var(--tx)', 'Pickup') : ''}${B ? pin(B, 'var(--ac)', 'Drop-off') : ''}</svg><div class="callout" style="left:${cx}%;top:${cy}%">${ok ? `<div><b>${e.km}</b><span>Kilometres</span></div><div><b>${m0(e.tot)}</b><span>Estimated total</span></div><div><b>${h} h</b><span>Trip window</span></div>` : '<div style="padding:4px 14px;flex-direction:row"><span style="font-size:13px;color:#fff">Tap two pins or search to set the route</span></div>'}</div>`;
};
const _u = window.upd;
window.upd = function () {
  _u();
  const e = est(),
    a = $('#td');
  if (a) {
    a.textContent = e.km + ' km';
    $('#tm2').textContent = e.mv;
    $('#tw').textContent = '~' + Math.ceil(2 + e.km / 20) + ' h';
  }
  mapUpd();
};
let _mk = '';
setInterval(() => {
  if (view != 'book' || !$('#bmap')) return;
  const k = val('pu') + '|' + val('dr');
  if (k != _mk) {
    _mk = k;
    mapUpd();
  }
}, 500);
const _b2 = book;
book = () =>
  _b2()
    .replace(
      /<div class="mp" style="margin-top:10px">.*?<\/svg><\/div><div class="mu"[^>]*>Map picker:.*?<\/div>/s,
      ''
    )
    .replace('<div class="grid g2">', '<div class="grid g2 bk">')
    .replace(
      '<label>Additional movers (₱500 each)</label><input id="mv" type="number" min="0" max="10" value="0" oninput="upd()">',
      '<input id="mv" type="hidden" value="0"><div class="tiles" style="margin-top:16px"><div class="tile"><span>Distance</span><b id="td">0 km</b></div><div class="tile"><span>Extra movers</span><b id="tm2">0</b><div class="stp"><button data-a="mvs" data-d="1" aria-label="Add a mover" type="button">▲</button><button data-a="mvs" data-d="-1" aria-label="Remove a mover" type="button">▼</button></div></div><div class="tile"><span>Time slot booked</span><b id="tw">~2 h</b><small class="mu" style="display:block;font-size:12px;margin-top:2px">loading, drive and unloading</small></div></div>'
    )
    .replace(
      '<div class="card" style="align-self:start;position:sticky;top:70px"><h2>Estimate</h2>',
      '<div class="card mapcard" style="align-self:start;position:sticky;top:24px"><div class="mapbox" id="bmap"></div><div style="padding:16px 12px 4px"><h2>Estimate</h2>'
    )
    .replace(
      'Submit booking request</button></div></div>',
      'Submit booking request</button></div></div></div>'
    );
const _t2 = track;
track = () => _t2().replace(/#8b5cf6/g, '#EA580C');
const _r1 = render;
render = function () {
  _r1();
  const h = document.documentElement.classList.contains('pubm');
  let b = $('#hp');
  if (h) {
    b && b.remove();
    return;
  }
  if (!b) {
    b = document.createElement('button');
    b.id = 'hp';
    b.className = 'hp';
    b.dataset.a = 'nav';
    b.dataset.v = 'settings';
    b.setAttribute('aria-label', 'Help and settings');
    b.textContent = '?';
    document.body.appendChild(b);
  }
  document.querySelectorAll('#nav a').forEach(a => {
    a.title = a.textContent.trim();
  });
  $('#lo').title = 'Log out';
  $('#lo').setAttribute('aria-label', 'Log out');
  $('#lo').innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/></svg>';
};
document.addEventListener(
  'click',
  e => {
    const t = e.target.closest('[data-a]');
    if (!t || !S.me) return;
    const a = t.dataset.a;
    if (a == 'mvs') {
      e.stopPropagation();
      e.preventDefault();
      const v = $('#mv');
      v.value = Math.max(0, Math.min(10, +v.value + +t.dataset.d));
      upd();
    }
    if (
      ['pay', 'submitbk', 'submitrn', 'submitinc', 'review', 'saveprof'].includes(a) &&
      t.classList.contains('btn')
    ) {
      t.classList.add('is-busy');
      setTimeout(() => t.classList.remove('is-busy'), 700);
    }
  },
  true
);
render();
