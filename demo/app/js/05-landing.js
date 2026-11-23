/**
 * 05-landing.js — the landing page's "waybill" search card (Book / Rent / Track tabs),
 * vehicle line drawings (ART) and the public "Track a trip" lookup (POST /api/public/track).
 */
const PHOTO = {
  hero: '',
  pk: '',
  l3: '',
  cv: '',
  w6: '',
  r1: '',
  r2: '',
  r3: '',
}; /* paste an image URL or path to replace any drawing with a photo */
const wl = x => `<circle cx="${x}" cy="82" r="9"/><circle cx="${x}" cy="82" r="3"/>`;
const ART = {
  pk: `<path d="M8 74H192M8 74V52H84V74M84 74V54L100 36H142L168 56H188V74M104 40H122V54H94M132 40H142L158 54H132Z"/>${wl(48)}${wl(150)}`,
  l3: `<path d="M8 74H192M8 74V34H128L168 56H192V74M136 40H156L168 54H136Z"/>${wl(44)}${wl(150)}`,
  cv: `<path d="M6 74H194M6 74V20H122V74M122 74V42L136 28H160L192 52V74M140 34H158L172 50H140Z"/>${wl(44)}${wl(150)}`,
  tw: `<path d="M12 74H188M12 74V52H112V74M112 74V40Q112 24 136 22H148Q176 24 184 56L188 74M136 30H148Q166 32 172 56H136Z"/><circle cx="54" cy="82" r="7"/><circle cx="170" cy="82" r="7"/>`,
  w6: `<path d="M4 74H196M4 74V16H128V74M128 74V38L142 26H170L196 50V74M146 32H166L180 48H146Z"/>${wl(28)}${wl(60)}${wl(160)}`,
  r1: `<path d="M8 74H192M8 74V64C8 58 16 56 34 54L58 36H114L140 54H176C186 56 192 60 192 66V74M64 40H84V54H46ZM92 40H112L128 54H92Z"/>${wl(48)}${wl(150)}`,
  r2: `<path d="M8 74H192M8 74V28H124L172 54H192V74M132 34H152L166 52H132ZM20 36H60V50H20ZM68 36H112V50H68Z"/>${wl(44)}${wl(150)}`,
  r3: `<path d="M8 74H192M8 74V50H70M70 74V50M70 74V54L86 34H128L160 52H188V74M92 38H108V52H78ZM116 38H128L142 52H116Z"/>${wl(40)}${wl(150)}`,
};
const art = (id, sw = 2) =>
  `<svg viewBox="0 0 200 100" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[id]}</svg>`;
const media = (id, n) => (PHOTO[id] ? `<img src="${PHOTO[id]}" alt="${esc(n)}" loading="lazy">` : art(id));
const PS = { tab: 'haul', v: 'pk', rv: 'r1', pu: '', dr: '', s: '', e: '', ref: '', res: '' };
const psSave = () => {
  [
    ['pu', 'hp-pu'],
    ['dr', 'hp-dr'],
    ['s', 'hp-s'],
    ['e', 'hp-e'],
    ['ref', 'hp-r'],
  ].forEach(([k, i]) => {
    const x = $('#' + i);
    if (x) PS[k] = x.value;
  });
};
const chip = (id, n, k, on) =>
  `<button class="p-chip" data-a="psv" data-k="${k}" data-id="${id}" aria-pressed="${on}">${ico(VI[id], 16)}${n}</button>`;
const psBody = () => {
  const t = PS.tab,
    today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const ac = (l, id, v) =>
    `<div class="ac"><label class="p-lb" for="${id}">${l}</label><input id="${id}" data-a="ac" autocomplete="off" placeholder="Barangay or landmark" value="${esc(v)}"><div class="sug" id="s-${id}" hidden></div></div>`;
  if (t == 'haul')
    return `<div class="p-row">${ac('Pickup', 'hp-pu', PS.pu)}${ac('Drop-off', 'hp-dr', PS.dr)}<button class="p-b p-pri" data-a="psgo">Get estimate</button></div><div class="p-chips"><span class="p-lb">Vehicle</span>${HV.map(v => chip(v.id, v.n, 'v', PS.v == v.id)).join('')}</div><div id="ps-res">${PS.res}</div>`;
  if (t == 'rent')
    return `<div class="p-row"><div><label class="p-lb" for="hp-s">Start date</label><input id="hp-s" type="date" min="${today}" value="${PS.s}"></div><div><label class="p-lb" for="hp-e">End date</label><input id="hp-e" type="date" min="${today}" value="${PS.e}"></div><button class="p-b p-pri" data-a="psgo">Check price</button></div><div class="p-chips"><span class="p-lb">Vehicle</span>${RV.map(v => chip(v.id, v.n, 'rv', PS.rv == v.id)).join('')}</div><div id="ps-res">${PS.res}</div>`;
  return `<div class="p-row r2"><div><label class="p-lb" for="hp-r">Booking reference</label><input id="hp-r" autocomplete="off" placeholder="BK-XXXXXX" value="${esc(PS.ref)}"></div><button class="p-b p-pri" data-a="psgo">Track</button></div><div id="ps-res">${PS.res}</div>`;
};
const psTabs = () =>
  [
    ['haul', 'Book a haul'],
    ['rent', 'Rent a vehicle'],
    ['track', 'Track a trip'],
  ]
    .map(
      x =>
        `<button role="tab" data-a="pst" data-t="${x[0]}" aria-selected="${PS.tab == x[0]}">${x[1]}</button>`
    )
    .join('');
const card = (id, n, sp, pz, sm, k) =>
  `<button class="p-cd" data-a="pcard" data-k="${k}" data-id="${id}"><div class="p-ph">${media(id, n)}</div><div class="p-cb"><b>${n}</b><span class="s">${sp}</span><div class="pz">${pz}<small>${sm}</small></div></div></button>`;
const hamb =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
head = () =>
  `<div class="p-top"><div class="p-c p-bar"><a class="p-lg" data-a="swap" data-m="land" href="#">${mark}ZamMove</a><nav class="p-nav"><a data-a="scr" data-t="rates">Vehicles</a><a data-a="scr" data-t="how">How it works</a><a data-a="scr" data-t="faq">Questions</a></nav><div class="p-act"><a data-a="swap" data-m="in" href="#">Log in</a><a class="p-b p-pri sm" data-a="swap" data-m="up" href="#">Create account</a></div><details class="p-mn"><summary aria-label="Menu">${hamb}</summary><div class="p-mp"><a data-a="scr" data-t="rates">Vehicles</a><a data-a="scr" data-t="how">How it works</a><a data-a="scr" data-t="faq">Questions</a><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a></div></details></div></div>`;
landing = function () {
  return `<div class="p-c"><section class="p-hero2${PHOTO.hero ? ' hp' : ''}"${PHOTO.hero ? ` style="background-image:url('${PHOTO.hero}')"` : ''}><h1>Hire a truck and driver in Zamboanga City. See the price first.</h1><p>Pickup trucks to 6-wheelers. Pay half when the driver arrives at pickup and the rest after delivery.</p>${PHOTO.hero ? '' : `<div class="hart">${art('w6', 1.2)}</div>`}</section>
<div class="p-sc" id="psc"><div class="p-tabs" role="tablist">${psTabs()}</div><div class="p-sb" id="ps-b">${psBody()}</div></div>
<div class="p-cf"><h3>Haul with confidence</h3><div class="p-cfb"><div class="p-ph">${media('w6', '6-Wheeler')}</div><ul class="p-cfl"><li>Price shown before you book</li><li>50% down, 50% after delivery</li><li>Service across Zamboanga City</li><li>GCash, cash or both</li></ul></div></div></div>
<section class="p-c p-s" id="rates"><div class="p-sh"><h2>Vehicles for every load</h2><div><p>From a pickup for a few boxes to a 6-wheeler for a full house move. Rates are fixed per vehicle and kilometre.</p><a data-a="scr" data-t="how">See how booking works →</a></div></div>
<div class="p-gr">${HV.map(v => card(v.id, v.n, v.cap, 'From ' + m0(v.base), m0(v.km) + ' per km', 'v')).join('')}</div>
<h3 class="p-sub">Self-drive rental</h3><div class="p-gr t3" style="margin-top:24px">${RV.map(v => card(v.id, v.n, v.sp, m0(v.day) + ' per day', 'Plus a refundable deposit from ' + m0(DEP), 'rv')).join('')}</div></section>
<section class="p-c p-s" id="how"><div class="p-sp"><h2>From request to delivery in four steps</h2><ol class="p-ol">${[
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
<section class="p-c p-s" id="faq"><h2>Before your first booking</h2><div class="p-q" style="margin-top:32px;max-width:760px">${FQ.map(q => `<details><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}</div></section>
<section class="p-c"><div class="p-end"><h2>Create an account to book your first haul</h2><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a></div></section>`;
};
let vart = h =>
  h.replace(
    /(<div class="veh[^"]*" data-a="pickr?" data-id="(\w+)">)<div class="vi">.*?<\/svg><\/div>/gs,
    (m, a, id) => a + '<div class="vp">' + art(id) + '</div>'
  );
const _b3 = book;
book = () => vart(_b3());
const _n3 = rent;
rent = () => vart(_n3());
document.addEventListener(
  'click',
  e => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a,
      id = t.dataset.id;
    if (a == 'scr') document.querySelector('.p-mn')?.removeAttribute('open');
    if (!['pst', 'psv', 'psgo', 'pcard'].includes(a)) return;
    e.stopPropagation();
    e.preventDefault();
    const body = () => {
      $('#ps-b').innerHTML = psBody();
      document
        .querySelectorAll('.p-tabs button')
        .forEach(b => b.setAttribute('aria-selected', b.dataset.t == PS.tab));
    };
    if (a == 'pst') {
      psSave();
      PS.tab = t.dataset.t;
      PS.res = '';
      body();
    }
    if (a == 'psv') {
      psSave();
      PS[t.dataset.k] = id;
      PS.res = '';
      body();
    }
    if (a == 'pcard') {
      psSave();
      PS.tab = t.dataset.k == 'rv' ? 'rent' : 'haul';
      PS[t.dataset.k] = id;
      PS.res = '';
      body();
      $('#psc').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (a == 'psgo') {
      psSave();
      t.classList.add('is-busy');
      setTimeout(async () => {
        t.classList.remove('is-busy');
        let h = '';
        const er = x => `<div class="p-err">${x}</div>`;
        if (PS.tab == 'haul') {
          const A = coord(PS.pu),
            B = coord(PS.dr);
          if (!A || !B) h = er('Pick both places from the suggestions so the distance can be computed.');
          else {
            const v = HV.find(x => x.id == PS.v),
              km = Math.max(1, Math.ceil(hv(A, B) * 1.3)),
              sub = v.base + km * v.km,
              fee = Math.round(sub * 0.05),
              tot = sub + fee;
            h = `<div class="p-res"><div><span class="s">${v.n}, ${km} km</span><b>${m0(tot)}</b><span class="s">${m0(v.base)} base + ${m0(km * v.km)} distance + ${m0(fee)} service fee</span></div><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Book this haul</a></div>`;
          }
        } else if (PS.tab == 'rent') {
          const r = RV.find(x => x.id == PS.rv),
            d = Math.round((new Date(PS.e) - new Date(PS.s)) / 864e5) + 1;
          if (!PS.s || !PS.e || d < 1) h = er('Choose a start date and an end date on or after it.');
          else
            h = `<div class="p-res"><div><span class="s">${r.n}, ${d} day${d > 1 ? 's' : ''}</span><b>${m0(d * r.day)}</b><span class="s">Plus a refundable deposit from ${m0(DEP)}</span></div><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Rent this vehicle</a></div>`;
        } else {
          const tr = await ZAPI.publicTrack(PS.ref.trim().toUpperCase()),
            b = tr.ok ? tr.b : null;
          h = b
            ? `<div class="p-res"><div><span class="s">${esc(b.id)}</span><b>${b.st}</b><span class="s">${sh(b.pu)} to ${sh(b.dr)}, ${b.dt}</span></div><a class="p-b p-pri" data-a="swap" data-m="in" href="#">Track this trip</a></div>`
            : er(tr.net ? esc(tr.err) : 'No booking with that reference.');
        }
        PS.res = h;
        const r = $('#ps-res');
        if (r) r.innerHTML = h;
      }, 450);
    }
  },
  true
);
render();
