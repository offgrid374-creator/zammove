/**
 * 07-home.js — one Home page for everyone: logged-in customers see the landing page plus
 * "Your trips" (next trip, popular routes, recent activity).
 */
const tripsH = () => {
  const act = S.bk.filter(b => !done(b)).sort((a, b) => (a.dt + a.tm < b.dt + b.tm ? -1 : 1)),
    nx = act[0],
    dn = S.bk.filter(b => b.st == 'Completed').length,
    sp = ZPAY.total(),
    i = nx ? FLOW.indexOf(nx.st) : 0;
  return `<section class="sec2" id="trips"><h2>Your trips</h2><div class="tiles" style="margin-top:24px"><div class="tile"><span>Active trips</span><b>${act.length}</b></div><div class="tile"><span>Completed</span><b>${dn}</b></div><div class="tile"><span>Paid so far</span><b>${m0(sp)}</b></div></div>
<div class="grid g2" style="margin-top:12px;align-items:start"><div class="card">${nx ? `<div class="row" style="padding-top:0"><span class="mu n">Next trip · ${nx.id}</span><span class="tag g">${nx.st}</span></div><div style="font-family:var(--display);font-size:28px;font-weight:700;letter-spacing:-.025em;line-height:1.15;margin:10px 0 4px">${sh(nx.pu)} to ${sh(nx.dr)}</div><div class="mu n">${nx.dt} at ${nx.tm} · ${nx.vn}</div><div class="meter" style="margin:20px 0 8px"><i style="width:${((i + 1) / FLOW.length) * 100}%"></i></div><div class="row mu" style="padding:0"><span>Step ${i + 1} of ${FLOW.length}</span><b class="n" style="color:var(--tx)">${peso(nx.tot)}</b></div><div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap"><button class="btn" data-a="${i >= 1 ? 'trk' : 'nav'}" data-id="${nx.id}" data-v="bookings">${i >= 1 ? 'Track trip' : 'View booking'}</button><button class="btn o" data-a="nav" data-v="bookings">All bookings</button></div>` : `<div class="empty" style="padding:24px"><b style="font-weight:500">No active trips</b><p class="mu" style="margin:6px 0 16px">Get an estimate in the waybill above and your next trip appears here.</p><button class="btn" data-a="scr" data-t="psc">Get an estimate</button></div>`}</div>
<div class="card"><h2 style="font-size:22px">Popular routes</h2>${RT.slice(0, 4)
    .map(
      (r, j) =>
        `<div class="rrow" data-a="route" data-id="${j}"><div><b style="font-weight:500">${r[1]} to ${r[2]}</b><div class="mu" style="font-size:14px">${HV.find(v => v.id == r[0]).n}</div></div><span class="pr n">${r[3]} km</span></div>`
    )
    .join('')}</div></div>${recent()}</section>`;
};
const homeBody = au => {
  const f = S.me ? esc(S.me.name.split(' ')[0]) : '';
  const acts = au
    ? `<a class="p-b p-pri" data-a="nav" data-v="book" href="#">Book a haul</a><a class="z-link" data-a="nav" data-v="bookings" href="#">My bookings</a>`
    : `<a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a><a class="z-link" data-a="scr" data-t="pay">How payment works</a>`;
  const lead = au
    ? `Welcome back, ${f}. Pick a vehicle, see the price first, and pay half when the driver arrives at pickup and half after delivery.`
    : 'Pick a vehicle, see the price first, and pay half when the driver arrives at pickup and half after delivery.';
  return `<div class="p-c"><section class="z-hero"><div class="z-copy"><h1>Book a van or truck in Zamboanga City</h1><p>${lead}</p><div class="z-acts">${acts}</div><div class="scene" id="scene" role="img" aria-label="Illustration of the selected vehicle">${sceneH()}</div></div>
<div class="ticket" id="psc"><div class="t-head"><span>WAYBILL</span><span class="n">${ZREF}</span></div><div class="p-tabs" role="tablist">${psTabs()}</div><div class="p-sb" id="ps-b">${psBody()}</div></div></section></div>
${au ? tripsH() : ''}
<section class="sec2 p-c" id="rates"><h2 style="max-width:16em">Pick the vehicle that fits your load</h2><div class="z-fleet">${HV.map(v => fl(v.id, v.n, v.cap, 'From ' + m0(v.base) + ' · ' + m0(v.km) + '/km', 'v')).join('')}</div><h3 class="p-sub">Self-drive rental</h3><div class="z-fleet t3" style="margin-top:24px">${RV.map(v => fl(v.id, v.n, v.sp, m0(v.day) + '/day · ' + 'deposit from ' + m0(DEP), 'rv')).join('')}</div></section>
<section class="sec2 band-t" id="pay"><div class="p-c z-pay"><div><h2>Pay in two halves</h2><p>Nothing is charged when you book. Half is due when the driver arrives at pickup and the rest after delivery. GCash, cash or both. Move through the stages to see when each half is due.</p></div><div id="payd">${payH()}</div></div></section>
<section class="sec2 p-c" id="how"><div class="p-sp"><h2>From request to delivery in four steps</h2><ol class="p-ol">${[
    ['Request a haul', 'Choose pickup, drop-off, vehicle and time. You get an itemized estimate.'],
    [
      'Driver accepts',
      'The driver heads to your pickup. Pay 50% down by GCash, cash or both when they arrive.',
    ],
    ['Follow the trip', 'Status updates from pickup, loading and transit to arrival.'],
    ['Confirm delivery', 'Pay the balance, then rate your driver.'],
  ]
    .map((s, i) => `<li><span class="k">${i + 1}</span><div><b>${s[0]}</b><span>${s[1]}</span></div></li>`)
    .join('')}</ol></div></section>
<section class="sec2 p-c" id="faq"><div style="max-width:820px"><h2 style="margin-bottom:28px">Questions before you book</h2><div class="p-q">${FQ.map(q => `<details><summary>${q[0]}<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></summary><p>${q[1]}</p></details>`).join('')}</div></div></section>
${au ? '' : `<section class="sec2 band-k"><div class="p-c z-own"><div><h2>Ready to move something?</h2><p style="margin-top:12px">Create an account to book your first haul.</p></div><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a></div></section>`}`;
};
landing = () => homeBody(false);
home = function () {
  return (
    vbox() +
    `<div class="pg pgi">${homeBody(true)}<footer class="p-c p-ft"><span>ZamMove, Zamboanga City, Philippines</span><span>Prototype: SMS, email and the GCash gateway are simulated.</span></footer></div>`
  );
};
render();
