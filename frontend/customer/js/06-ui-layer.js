/**
 * 06-ui-layer.js — design layer: flat-colour vehicle illustrations (SVG symbols, VS map), the
 * landing page layout, profile page, notifications list and the header (bell, avatar, workspace).
 * Notifications are created by the server; this file only displays them.
 */
const VS = {
  tw: 'v-3w',
  pk: 'v-pick',
  l3: 'v-van',
  cv: 'v-box',
  w6: 'v-truck',
  r1: 'v-car',
  r2: 'v-van',
  r3: 'v-pick',
};
const wh = (x, y, r) =>
  `<circle class="zwh" cx="${x}" cy="${y}" r="${r}"/><circle class="zhub" cx="${x}" cy="${y}" r="${r > 12 ? 5 : 4}"/>`;
document.body.insertAdjacentHTML(
  'afterbegin',
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="v-pick" viewBox="0 0 240 120"><rect class="zcr" x="22" y="32" width="36" height="26" rx="3"/><rect class="zcr" x="62" y="44" width="36" height="14" rx="3"/><rect class="zvb" x="12" y="56" width="98" height="30" rx="4"/><rect class="zvs" x="12" y="76" width="98" height="5"/><path class="zvc" d="M110 86V52L130 30H168Q178 30 184 40L204 58Q216 62 216 74V86Z"/><path class="zvw" d="M136 37H165Q170 37 174 44L184 56H136Z"/><rect class="zvc" x="8" y="84" width="212" height="8" rx="3"/><rect class="zlp" x="210" y="68" width="6" height="6" rx="2"/>${wh(50, 92, 14)}${wh(172, 92, 14)}</symbol>
<symbol id="v-van" viewBox="0 0 240 120"><rect class="zvb" x="14" y="20" width="136" height="68" rx="6"/><rect class="zvs" x="14" y="68" width="136" height="6"/><text class="zvt" x="82" y="52" text-anchor="middle">ZamMove</text><path class="zvc" d="M150 38H188Q198 38 204 50L220 68Q224 74 224 82V90H150Z"/><path class="zvw" d="M158 46H186Q191 46 195 53L204 66H158Z"/><rect class="zvc" x="8" y="86" width="218" height="8" rx="3"/><rect class="zlp" x="218" y="74" width="6" height="6" rx="2"/>${wh(52, 92, 14)}${wh(182, 92, 14)}</symbol>
<symbol id="v-box" viewBox="0 0 240 120"><rect class="zvb" x="6" y="12" width="150" height="74" rx="6"/><rect class="zvs" x="6" y="68" width="150" height="6"/><text class="zvt" x="81" y="48" text-anchor="middle">ZamMove</text><path class="zvc" d="M156 38H192Q202 38 208 50L224 68Q228 74 228 82V90H156Z"/><path class="zvw" d="M164 46H190Q195 46 199 53L206 66H164Z"/><rect class="zvc" x="4" y="86" width="226" height="8" rx="3"/><rect class="zlp" x="222" y="74" width="6" height="6" rx="2"/>${wh(48, 92, 14)}${wh(194, 92, 14)}</symbol>
<symbol id="v-truck" viewBox="0 0 240 120"><rect class="zvb" x="6" y="8" width="160" height="78" rx="6"/><rect class="zvs" x="6" y="68" width="160" height="6"/><text class="zvt" x="86" y="46" text-anchor="middle">ZamMove</text><path class="zvc" d="M166 36H200Q210 36 216 48L230 66Q234 72 234 80V90H166Z"/><path class="zvw" d="M174 44H198Q203 44 207 51L214 64H174Z"/><rect class="zvc" x="4" y="86" width="232" height="8" rx="3"/><rect class="zlp" x="228" y="72" width="6" height="6" rx="2"/>${wh(38, 92, 14)}${wh(72, 92, 14)}${wh(202, 92, 14)}</symbol>
<symbol id="v-3w" viewBox="0 0 240 120"><rect class="zcr" x="32" y="40" width="34" height="20" rx="3"/><rect class="zcr" x="70" y="46" width="28" height="14" rx="3"/><rect class="zvb" x="22" y="58" width="104" height="24" rx="4"/><rect class="zvs" x="22" y="74" width="104" height="5"/><path class="zvc" d="M126 84V42Q126 24 150 22H162Q190 24 198 58L202 84Z"/><path class="zvw" d="M150 30H162Q182 32 188 58H150Z"/><rect class="zvc" x="146" y="22" width="4" height="62"/><rect class="zvc" x="18" y="82" width="186" height="6" rx="3"/><rect class="zlp" x="194" y="70" width="6" height="6" rx="2"/>${wh(62, 92, 11)}${wh(184, 92, 11)}</symbol>
<symbol id="v-car" viewBox="0 0 240 120"><path class="zvb" d="M12 86V70Q12 62 24 60L62 56L90 34H146Q158 34 166 46L178 58Q208 60 214 72V86Z"/><path class="zvw" d="M98 41H142Q149 41 154 50L158 56H92Z"/><rect class="zvs" x="12" y="76" width="202" height="5"/><rect class="zvc" x="8" y="84" width="212" height="8" rx="3"/><rect class="zlp" x="208" y="68" width="6" height="6" rx="2"/>${wh(56, 92, 14)}${wh(170, 92, 14)}</symbol></defs></svg>`
);
const vsvg = id =>
  `<svg viewBox="0 0 240 112" aria-hidden="true"><use href="#${VS[id]}" x="0" y="-4" width="240" height="120"/></svg>`;
vart = h =>
  h.replace(
    /(<div class="veh[^"]*" data-a="pickr?" data-id="(\w+)">)<div class="vi">.*?<\/svg><\/div>/gs,
    (m, a, id) => a + '<div class="vp">' + vsvg(id) + '</div>'
  );
const initials = n =>
  String(n || '?')
    .split(/\s+/)
    .map(x => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const ZREF = 'ZM-' + (1000 + Math.floor(Math.random() * 9000));
const ZS = { i: 0 },
  PTOT = (() => {
    const v = HV.find(x => x.id == 'cv'),
      s = v.base + 12 * v.km;
    return s + Math.round(s * 0.05);
  })();
const sceneH = () => vsvg(PS.tab == 'rent' ? PS.rv : PS.v);
const fl = (id, n, sp, q, k) =>
  `<button class="fl" data-a="pcard" data-k="${k}" data-id="${id}"><div class="road">${PHOTO[id] ? `<img src="${PHOTO[id]}" alt="${esc(n)}" loading="lazy">` : vsvg(id)}</div><div class="vn">${n}</div><div class="vd">${sp}</div><div class="vq n">${q}</div></button>`;
const stg = ['Booked', 'Driver at pickup', 'Delivered'];
const payH = () => {
  const h = Math.ceil(PTOT / 2);
  return `<div class="stages" role="group" aria-label="Trip stage">${stg.map((s, i) => `<button class="stage" data-a="pstage" data-i="${i}" aria-pressed="${ZS.i == i}">${s}</button>`).join('')}</div><div class="zbar" aria-hidden="true"><div class="seg2 ${ZS.i >= 1 ? 'paid' : ''}"><span class="n">${ZS.i >= 1 ? 'Paid ' : 'Due '}${m0(h)}</span></div><div class="seg2 ${ZS.i >= 2 ? 'paid' : ''}"><span class="n">${ZS.i >= 2 ? 'Paid ' : 'After delivery '}${m0(PTOT - h)}</span></div></div><div class="paidline n" aria-live="polite">Paid ${m0(ZS.i >= 2 ? PTOT : ZS.i >= 1 ? h : 0)} of ${m0(PTOT)}</div>`;
};
landing = function () {
  return `<div class="p-c"><section class="z-hero"><div class="z-copy"><h1>Book a van or truck in Zamboanga City</h1><p>Pick a vehicle, see the price first, and pay half when the driver arrives at pickup and half after delivery.</p><div class="z-acts"><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a><a class="z-link" data-a="scr" data-t="pay">How payment works</a></div><div class="scene" id="scene" role="img" aria-label="Illustration of the selected vehicle">${sceneH()}</div></div>
<div class="ticket" id="psc"><div class="t-head"><span>WAYBILL</span><span class="n">${ZREF}</span></div><div class="p-tabs" role="tablist">${psTabs()}</div><div class="p-sb" id="ps-b">${psBody()}</div></div></section></div>
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
<section class="sec2 band-k"><div class="p-c z-own"><div><h2>Ready to move something?</h2><p style="margin-top:12px">Create an account to book your first haul.</p></div><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a></div></section>`;
};
const eyeI =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const pwf = (l, id, ac, x = '') =>
  `<div class="p-f"><label for="${id}">${l}</label><div class="pw"><input id="${id}" type="password" autocomplete="${ac}" ${x}><button type="button" data-a="eye" data-t="${id}" aria-label="Show password">${eyeI}</button></div></div>`;
const bk = m =>
  `<a class="z-back" data-a="swap" data-m="${m}" href="#" aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></a>`;
const termsH = () =>
  `<h2>What we collect</h2><ul><li>Your name, date of birth, mobile number, email and address when you register.</li><li>Your bookings, rentals, payments, reports and reviews.</li><li>Your location only when you tap Use my current location.</li></ul><h2>How it is used</h2><p>To price and arrange your trips, let drivers reach you, and keep a record of payments and reports.</p><h2>Where it is stored</h2><p>On the ZamMove server. Passwords are stored only as salted hashes, and each person sees only their own bookings, rentals and payments. Photos of IDs and licenses are seen only by ZamMove staff and, for rentals, the vehicle owner.</p><h2>Your choices</h2><p>You can edit your details in Profile. Ask ZamMove through Help and contact to correct or delete your data.</p>`;
authP = function (m) {
  if (m == 'terms')
    return `<div class="p-au">${bk('up')}<h1>Privacy and terms</h1><p class="z-sub">How ZamMove handles your information.</p><div class="z-doc">${termsH()}</div></div>`;
  if (m == 'fg')
    return `<div class="p-au">${bk('in')}<h1>Reset your password</h1><p class="z-sub">${msg.fc ? 'Enter the code and choose a new password.' : 'Enter your account email. We send a reset code to its email and phone.'}</p><form onsubmit="return false" novalidate>${msg.fc ? fld('Verification code', 'fcd', 'inputmode="numeric" autocomplete="one-time-code"') + pwf('New password', 'np', 'new-password') : fld('Email', 'em', 'type="email" autocomplete="email"')}<div class="p-err" style="margin-top:12px">${esc(msg.auth || '')}</div>${msg.fm ? `<div class="p-ok">${esc(msg.fm)}</div>` : ''}<button class="p-b p-pri p-full" data-a="${msg.fc ? 'fgset' : 'fgsend'}">${msg.fc ? 'Set new password' : 'Send code'}</button></form><p class="p-fn">Prototype: no SMS or email service is connected yet, so messages go to a simulated inbox. <a href="#" data-a="zinbox" data-to="${esc(msg.fe || '')}">Open the simulated inbox</a></p></div>`;
  const up = m == 'up';
  return `<div class="p-au">${bk('land')}<h1>${up ? 'Create your account' : 'Log in'}</h1><p class="z-sub">${up ? 'Use your real name and mobile number so drivers can reach you.' : 'Use the email you registered with.'}</p><form id="af" onsubmit="return false" novalidate>${up ? fld('Full name', 'fn', 'autocomplete="name"') + fld('Date of birth', 'db', 'type="date"') + fld('Mobile number', 'ph', 'inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"') + fld('Email', 'em', 'type="email" autocomplete="email"') + fld('Complete address', 'ad', 'autocomplete="street-address"') : fld('Email', 'em', 'type="email" autocomplete="email"')}
${pwf('Password', 'pw', up ? 'new-password' : 'current-password', up ? 'oninput="mt()"' : '')}${up ? '<div class="meter"><i id="mt" style="width:0"></i></div><div class="p-h">8+ characters with a letter and a number</div>' + pwf('Confirm password', 'pw2', 'new-password', 'oninput="mm()"') + '<div class="p-h" id="mm"></div><label class="p-ck"><input type="checkbox" id="tc"><span>I agree to the <a data-a="swap" data-m="terms" href="#">Terms and Privacy Policy</a></span></label>' : ''}
<div class="p-err" id="er" style="margin-top:12px">${esc(msg.auth || '')}</div>${up ? '' : '<div class="p-fo"><a data-a="forgot" href="#">Forgot password?</a></div>'}<button class="p-b p-pri p-full" data-a="${up ? 'signup' : 'login'}">${up ? 'Create account' : 'Log in'}</button></form><p class="z-alt">${up ? 'Already have an account? <a data-a="swap" data-m="in" href="#">Log in</a>' : 'New to ZamMove? <a data-a="swap" data-m="up" href="#">Create an account</a>'}</p></div>`;
};
/* notifications */
/* notifications: each one has a recipient (to). Users only ever see their own. */
/* notifications are created by the server; ntf() stays as a no-op for older call sites */
S.nt = S.nt || [];
const ntf = () => {};
const myNt = () => (S.nt || []).filter(n => S.me && n.to == S.me.em),
  staffEms = () => S.users.filter(u => ['super', 'admin'].includes(u.adm)).map(u => u.em);
const ago = t => {
  const m = Math.round((Date.now() - new Date(t)) / 6e4);
  return m < 1
    ? 'Just now'
    : m < 60
      ? m + ' min ago'
      : m < 1440
        ? Math.round(m / 60) + ' h ago'
        : Math.round(m / 1440) + ' d ago';
};
let SUB = '';
const bellI =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/></svg>';
const chev =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const subBack = t =>
  `<a class="zback" data-a="sub" data-s=""><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Profile</a><h1>${t}</h1>`;
const notifH = () => {
  const L = myNt(),
    day = t => Date.now() - new Date(t) < 864e5,
    g = (a, t) =>
      a.length
        ? `<span class="grp">${t}</span><div class="card zl">${a.map(n => `<div class="nti ${n.r ? '' : 'u'}" data-a="nread" data-id="${n.id}"><div class="ic2">${bellI}</div><div style="flex:1"><b>${esc(n.h)}</b><span>${esc(n.b)}</span><small class="n">${ago(n.t)}</small></div>${n.r ? '' : '<i class="dt" aria-label="Unread"></i>'}</div>`).join('')}</div>`
        : '';
  return `<div class="row" style="align-items:flex-end">${subBack('Notifications')}${L.some(n => !n.r) ? '<button class="zback" style="border:0;background:none" data-a="nall">Mark all as read</button>' : ''}</div>${
    L.length
      ? g(
          L.filter(n => day(n.t)),
          'Today'
        ) +
        g(
          L.filter(n => !day(n.t)),
          'Earlier'
        )
      : '<div class="card empty" style="margin-top:16px">No notifications yet. Booking, payment and report updates appear here.</div>'
  }`;
};
const helpH = () =>
  `${subBack('Help and contact')}<span class="grp">Common questions</span><div class="card" style="padding:4px 16px">${FQ.map(q => `<details class="zq"><summary style="min-height:56px;cursor:pointer;display:flex;align-items:center;font-weight:500">${q[0]}</summary><p style="color:var(--tx2);padding:0 0 16px;font-size:15px">${q[1]}</p></details>`).join('')}</div><span class="grp">Something went wrong</span><div class="card zl"><a class="zr lk" data-a="nav" data-v="reports"><span>Report an incident</span>${chev}</a></div><p class="mu" style="margin-top:12px;font-size:14px">Support phone and email will be listed here once the company sets them.</p>`;
const _st2 = settings;
settings = function () {
  if (SUB == 'notif') return notifH();
  if (SUB == 'help') return helpH();
  if (SUB == 'terms')
    return `${subBack('Privacy and terms')}<div class="card z-doc" style="margin-top:12px">${termsH()}</div>`;
  const u = S.users.find(x => x.em == S.me.em) || {},
    un = myNt().filter(n => !n.r).length,
    lk = (a, t, x = '') =>
      `<a class="zr lk" ${a}><span>${t}</span><span style="display:flex;align-items:center;gap:6px;color:var(--tx2)">${x}${chev}</span></a>`;
  const rest = _st2().replace(/<h1>Settings<\/h1><p class='mu'>[^<]*<\/p>/, '');
  return `<h1>Profile</h1><div style="display:flex;gap:14px;align-items:center;margin:16px 0 0"><div class="zav lg">${initials(S.me.name)}</div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start"><b style="font-weight:500;font-size:18px">${esc(S.me.name)}</b><span class="pill">Customer</span></div></div>
<span class="grp">Personal details</span><div class="card zl"><div class="zr"><span>Name</span><span>${esc(S.me.name)}</span></div><div class="zr"><span>Email</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(S.me.em)}</span></div><div class="zr"><span>Mobile</span><span class="n">${esc(u.ph || 'Not set')}</span></div></div>
<span class="grp">Account</span><div class="card zl"><div class="zr"><span style="color:var(--tx)">SMS and email trip alerts<small class="mu" style="display:block;font-size:12px">In-app notifications are always kept.</small></span><button class="sw" role="switch" aria-checked="${!(S.users.find(x => x.em == S.me.em) || {}).alertsOff}" aria-label="SMS and email trip alerts" data-a="alerts"></button></div></div>
<span class="grp">Shortcuts</span><div class="card zl">${lk('data-a="sub" data-s="notif"', 'Notifications', un ? `<span class="tag g n">${un} new</span>` : '')}${lk('data-a="nav" data-v="rent"', 'Rent a vehicle')}${lk('data-a="nav" data-v="reports"', 'Report an incident')}${lk('data-a="payhist"', 'Payment history')}${lk('data-a="sub" data-s="help"', 'Help and contact')}${lk('data-a="sub" data-s="terms"', 'Privacy and terms')}</div>
<button class="btn o" style="width:100%;margin-top:20px" data-a="out">Log out</button><h2 style="margin:36px 0 0">Edit profile and preferences</h2>${rest}`;
};
/* chrome: wordmark, bell, avatar, mobile profile tab */
const _r2 = render;
render = function () {
  const pub = !S.me;
  if (!pub && view != 'settings') SUB = '';
  _r2();
  document.documentElement.classList.toggle('pubm', pub);
  if (pub) return;
  const lg = document.querySelector('.logo');
  if (lg && lg.textContent != 'ZamMove') lg.textContent = 'ZamMove';
  if (!$('#bl')) {
    const b = document.createElement('a');
    b.id = 'bl';
    b.className = 'hb';
    b.dataset.a = 'bell';
    b.setAttribute('aria-label', 'Notifications');
    $('#hs').before(b);
  }
  const un = myNt().filter(n => !n.r).length;
  $('#bl').innerHTML = bellI + (un ? '<i aria-label="' + un + ' unread"></i>' : '');
  $('#hs').innerHTML = `<span class="zav">${initials(S.me.name)}</span>`;
  $('#hs').setAttribute('aria-label', 'Profile');
  $('#lo').hidden = true;
  const n = $('#nav');
  if (!n.querySelector('.nv-pf'))
    n.insertAdjacentHTML(
      'beforeend',
      `<a class="nv-pf ${view == 'settings' ? 'on' : ''}" data-a="nav" data-v="settings"><span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span>Profile</a>`
    );
};
/* public-page interactions */
const payUpd = () => {
  const d = $('#payd');
  if (d) d.innerHTML = payH();
};
document.addEventListener(
  'click',
  e => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a == 'pstage') {
      e.stopPropagation();
      e.preventDefault();
      ZS.i = +t.dataset.i;
      payUpd();
    }
    if (['psv', 'pcard', 'pst'].includes(a))
      setTimeout(() => {
        const s = $('#scene');
        if (s) {
          s.innerHTML = sceneH();
          s.classList.remove('drive');
          void s.offsetWidth;
          s.classList.add('drive');
        }
      });
    if (S.me && a == 'scr') {
      e.stopPropagation();
      e.preventDefault();
      $('#' + t.dataset.t)?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      return;
    }
    if (S.me && a == 'swap' && t.closest('#ps-res')) {
      e.stopPropagation();
      e.preventDefault();
      psSave();
      if (PS.tab == 'track') {
        msg.tid = PS.ref.trim().toUpperCase();
        return go('track');
      }
      if (PS.tab == 'rent') {
        sel.rv = PS.rv;
        go('rent');
        return setTimeout(() => {
          $('#rs').value = PS.s;
          $('#re').value = PS.e;
        }, 30);
      }
      sel.v = PS.v;
      go('book');
      return setTimeout(() => {
        $('#pu').value = PS.pu;
        $('#dr').value = PS.dr;
        autoKm();
        upd();
      }, 30);
    }
    if (!S.me) {
      if (a == 'eye') {
        e.stopPropagation();
        e.preventDefault();
        const i = $('#' + t.dataset.t);
        i.type = i.type == 'password' ? 'text' : 'password';
        t.setAttribute('aria-label', i.type == 'password' ? 'Show password' : 'Hide password');
        if (t.dataset.t == 'pw' && $('#pw2')) $('#pw2').type = i.type;
      }
      return;
    }
    const act = {
      bell: () => {
        S.ws = 'customer';
        save();
        SUB = 'notif';
        go('settings');
      },
      sub: () => {
        SUB = t.dataset.s;
        render();
      },
      payhist: () => {
        msg.bt = 'pay';
        go('bookings');
      },
      alerts: async () => {
        const u = S.users.find(x => x.em == S.me.em) || {};
        await ZAPI.act('setAlerts', { on: !!u.alertsOff });
        render();
      },
      nall: async () => {
        await ZAPI.act('notifRead', { id: 'all' });
        render();
      },
      nread: async () => {
        await ZAPI.act('notifRead', { id: t.dataset.id });
        render();
      },
    }[a];
    if (act) {
      e.stopPropagation();
      e.preventDefault();
      return act();
    }
    const n0 = { bk: S.bk.length, pay: S.pay.length, rn: S.rn.length, inc: S.inc.length },
      id = t.dataset.id;
    setTimeout(() => {
      const b = S.bk.find(x => x.id == id),
        r = S.rn.find(x => x.id == id),
        c = S.inc.find(x => x.id == id);
      if (a == 'submitbk' && S.bk.length > n0.bk) {
        const x = S.bk[S.bk.length - 1];
        ntf(S.me.em, 'Booking submitted', x.id + ' is waiting for a driver to accept.');
        try {
          S.users
            .filter(u => u.em != x.cu && ZW.ok(u, 'driver') && ZW.chk(u.em, x).every(c => c[1]))
            .forEach(u =>
              ntf(
                u.em,
                'New booking request',
                x.id + ': ' + sh(x.pu) + ' to ' + sh(x.dr) + ', ' + x.dt + ' ' + x.tm + '.'
              )
            );
        } catch (e) {}
      } else if (a == 'adv' && b) ntf(b.cu, 'Booking ' + b.id, 'Status is now ' + b.st + '.');
      else if ((a == 'pay' || a == 'rnpay') && S.pay.length > n0.pay) {
        const p = S.pay[S.pay.length - 1];
        if (a == 'pay' && b && b.drvUser)
          ntf(
            b.drvUser,
            'GCash proof received',
            'The customer submitted GCash ref ' +
              p.ref +
              ' (' +
              m0(p.amount) +
              ') for ' +
              p.bid +
              '. Confirm it when you collect.'
          );
        ntf(
          S.me.em,
          a == 'pay' ? 'GCash proof submitted' : 'Payment submitted',
          m0(p.amount) +
            ' for ' +
            p.bid +
            (a == 'pay' ? '. Your driver confirms it on site.' : '. It counts once a cashier verifies it.')
        );
      }

      /* FIX: never re-render the whole page here (it wiped every form field after each click, so picked locations vanished). Only refresh the bell badge. */
      const bl = $('#bl');
      if (S.me && bl) {
        const un = myNt().filter(n => !n.r).length;
        bl.innerHTML = bellI + (un ? '<i aria-label="' + un + ' unread"></i>' : '');
      }
    }, 0);
  },
  true
);
