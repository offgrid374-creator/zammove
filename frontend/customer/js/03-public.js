/**
 * 03-public.js — pages shown when nobody is logged in: landing page with the price estimator,
 * log in, sign up and password reset. Wraps render() to switch to these pages when S.me is empty.
 */
const PE = { v: 'pk', km: 8, mv: 0, last: 0 };
const m0 = n =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const peC = () => {
  const v = HV.find(x => x.id == PE.v),
    d = PE.km * v.km,
    m = PE.mv * 500,
    sub = v.base + d + m,
    fee = Math.round(sub * 0.05);
  return { v, d, m, fee, tot: sub + fee };
};
const peHtml = c =>
  `<div class="p-rw"><span>${c.v.n}</span><span>${m0(c.v.base)}</span></div><div class="p-rw"><span>Distance, ${PE.km} km at ${m0(c.v.km)}</span><span>${m0(c.d)}</span></div><div class="p-rw"><span>Movers, ${PE.mv} at ${m0(500)}</span><span>${m0(c.m)}</span></div><div class="p-rw"><span>Service fee, 5%</span><span>${m0(c.fee)}</span></div><div class="p-tot"><span>Estimated total</span><b id="pe-t">${m0(PE.last)}</b></div><p class="p-nt">Down payment when the driver arrives at pickup: ${m0(c.tot / 2)}. The rest after delivery.</p>`;
const peUpd = () => {
  const r = $('#pe-r');
  if (!r) return;
  const c = peC(),
    from = PE.last;
  r.innerHTML = peHtml(c);
  const el = $('#pe-t'),
    t0 = performance.now();
  PE.last = c.tot;
  $('#pe-k').textContent = PE.km + ' km';
  $('#pe-m').textContent = PE.mv;
  document.querySelectorAll('.p-v').forEach(b => b.setAttribute('aria-checked', b.dataset.id == PE.v));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = m0(c.tot);
    return;
  }
  const f = t => {
    const k = Math.min(1, (t - t0) / 280),
      e = 1 - (1 - k) ** 3;
    el.textContent = m0(Math.round(from + (c.tot - from) * e));
    if (k < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
};
const mark =
  '<i><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h12v11H2z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></i>';
let head = () =>
  `<div class="p-top"><div class="p-c p-bar"><a class="p-lg" data-a="swap" data-m="land" href="#">${mark}ZamMove</a><nav class="p-nav"><a data-a="scr" data-t="rates">Rates</a><a data-a="scr" data-t="how">How it works</a><a data-a="scr" data-t="faq">Questions</a></nav><div class="p-act"><a data-a="swap" data-m="in" href="#">Log in</a><a class="p-b p-pri sm" data-a="swap" data-m="up" href="#">Create account</a></div></div></div>`;
const foot = () =>
  `<footer class="p-c p-ft"><span>ZamMove, Zamboanga City, Philippines</span><span>Prototype: SMS, email and the GCash gateway are simulated.</span></footer>`;
const trow = a =>
  '<tr>' +
  a.map((x, i) => `<td class="${i == a.length - 1 ? 'n' : i ? 'm' : ''}">${x}</td>`).join('') +
  '</tr>';
const FQ = [
  [
    'How is the price calculated?',
    'A base fare for the vehicle, a charge per kilometre, ₱500 for each extra mover and a 5% service fee. The price is fixed when you submit the booking.',
  ],
  [
    'When do I pay?',
    'Half when the driver arrives at pickup, and the other half after your items are delivered. GCash and cash are both accepted.',
  ],
  [
    'Can I cancel?',
    'Free while a booking is Pending. After a driver accepts, a 10% fee of the total applies.',
  ],
  [
    'What do I need to rent a vehicle?',
    'A valid driver’s license, a photo ID and a refundable deposit of ' +
      m0(DEP) +
      '. Pickup and return are limited to Zamboanga City.',
  ],
  [
    'Can I follow my trip?',
    'Once a driver accepts, the Track page shows each status from pickup to delivery. While the trip is active, it also shows your driver’s live location on a map.',
  ],
];
function landing() {
  return `<section class="p-c p-hero"><div><h1>Hire a truck and driver in Zamboanga City. See the price first.</h1><p>Pickup trucks to 6-wheelers. Pay half when the driver arrives at pickup and the rest after delivery.</p><div class="p-cta"><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Create account</a><a class="p-b p-sec" data-a="scr" data-t="rates">See rates</a></div></div>
<div class="p-shell"><div class="p-in"><div class="p-vs" role="radiogroup" aria-label="Vehicle">${HV.map(v => `<button class="p-v" role="radio" aria-checked="${v.id == PE.v}" data-a="pev" data-id="${v.id}"><b>${v.n}</b><span>${v.cap}</span></button>`).join('')}</div>
<div class="p-ctl"><label for="pek">Distance</label><output id="pe-k">${PE.km} km</output></div><input id="pek" data-a="pek" type="range" min="1" max="40" value="${PE.km}">
<div class="p-ctl"><span class="p-lb" style="margin:0">Extra movers</span><div class="p-st"><button data-a="pem" data-d="-1" aria-label="Remove a mover">−</button><output id="pe-m">${PE.mv}</output><button data-a="pem" data-d="1" aria-label="Add a mover">+</button></div></div>
<div class="p-rs" id="pe-r"></div><a class="p-b p-pri" data-a="swap" data-m="up" href="#">Book this haul</a></div></div></section>
<section class="p-c p-s" id="rates"><h2>Fixed rates by vehicle and distance</h2><div class="p-g2"><div><h3>Truck with driver</h3><table class="p-tb"><thead><tr><th>Vehicle</th><th>Capacity</th><th class="n">Base</th><th class="n">Per km</th></tr></thead><tbody>${HV.map(v => trow([v.n, v.cap, m0(v.base), m0(v.km)])).join('')}</tbody></table></div>
<div><h3>Self-drive rental</h3><table class="p-tb"><thead><tr><th>Vehicle</th><th>Spec</th><th class="n">Per day</th></tr></thead><tbody>${RV.map(v => trow([v.n, v.sp, m0(v.day)])).join('')}</tbody></table><p>Plus a refundable deposit from ${m0(DEP)}, set per vehicle.</p></div></div></section>
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
}
const fld = (l, id, x = '') =>
  `<div class="p-f"><label for="${id}">${l}</label><input id="${id}" ${x}></div>`;
function authP(m) {
  if (m == 'fg')
    return `<div class="p-au"><h1>Reset your password</h1><form onsubmit="return false" novalidate>${msg.fc ? fld('Verification code', 'fcd', 'inputmode="numeric" autocomplete="one-time-code"') + fld('New password', 'np', 'type="password" autocomplete="new-password"') + '<label class="p-ck"><input type="checkbox" data-a="showpw">Show password</label>' : fld('Email', 'em', 'type="email" autocomplete="email"') + fld('Date of birth', 'fdb', 'type="date"')}<div class="p-err">${esc(msg.auth || '')}</div>${msg.fm ? `<div class="p-ok">${esc(msg.fm)}</div>` : ''}<div class="p-fo"><button class="p-b p-pri" data-a="${msg.fc ? 'fgset' : 'fgsend'}">${msg.fc ? 'Set new password' : 'Send code'}</button><a data-a="swap" data-m="in" href="#">Back to log in</a></div></form><p class="p-fn">No email or SMS service is connected, so the code appears on this page.</p></div>`;
  const up = m == 'up';
  return `<div class="p-au"><h1>${up ? 'Create your account' : 'Log in to ZamMove'}</h1><form id="af" onsubmit="return false" novalidate>${up ? `<div class="p-2">${fld('Full name', 'fn', 'autocomplete="name"')}${fld('Date of birth', 'db', 'type="date"')}</div><div class="p-2">${fld('Phone', 'ph', 'inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"')}${fld('Email', 'em', 'type="email" autocomplete="email"')}</div>${fld('Complete address', 'ad', 'autocomplete="street-address"')}` : fld('Email', 'em', 'type="email" autocomplete="email"')}
${fld('Password', 'pw', `type="password" autocomplete="${up ? 'new-password' : 'current-password'}" ${up ? 'oninput="mt()"' : ''}`)}${up ? '<div class="meter"><i id="mt" style="width:0"></i></div><div class="p-h">8+ characters with a letter and a number</div>' + fld('Confirm password', 'pw2', 'type="password" autocomplete="new-password" oninput="mm()"') + '<div class="p-h" id="mm"></div>' : ''}
<label class="p-ck"><input type="checkbox" data-a="showpw">Show password</label>${up ? '<label class="p-ck"><input type="checkbox" id="tc">I agree to the Terms of Service and Privacy Policy</label>' : ''}<div class="p-err" id="er">${esc(msg.auth || '')}</div>
<div class="p-fo"><button class="p-b p-pri" data-a="${up ? 'signup' : 'login'}">${up ? 'Create account' : 'Log in'}</button>${up ? '' : '<a data-a="forgot" href="#">Forgot password?</a>'}<a data-a="swap" data-m="${up ? 'in' : 'up'}" href="#">${up ? 'Have an account? Log in' : 'New here? Create account'}</a></div></form></div>`;
}
const pubPage = m => `<div class="pg">${head()}${m == 'land' ? landing() : authP(m)}${foot()}</div>`;
window.mm = () => {
  const a = $('#pw').value,
    b = $('#pw2').value,
    x = $('#mm');
  if (!b) {
    x.textContent = '';
    return;
  }
  x.textContent = a == b ? 'Passwords match' : 'Passwords do not match';
  x.style.color = a == b ? '#1F6B3A' : '#B42318';
};
const _r0 = render;
let _pm = '';
render = function () {
  const h = document.documentElement;
  if (S.me) {
    h.classList.remove('pubm');
    _pm = '';
    return _r0();
  }
  h.classList.add('pubm');
  $('#nav').innerHTML = '';
  $('#lo').hidden = true;
  $('#hs').hidden = true;
  const m = msg.mode || 'land';
  $('#app').innerHTML = pubPage(m);
  if (m == 'land') peUpd();
  if (_pm != m) {
    window.scrollTo(0, 0);
    _pm = m;
  }
};
document.addEventListener(
  'click',
  e => {
    const t = e.target.closest('[data-a]');
    if (!t || S.me) return;
    const a = t.dataset.a;
    if (['pev', 'pem', 'scr'].includes(a)) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (a == 'pev') {
      PE.v = t.dataset.id;
      peUpd();
    }
    if (a == 'pem') {
      PE.mv = Math.max(0, Math.min(4, PE.mv + +t.dataset.d));
      peUpd();
    }
    if (a == 'scr') {
      const go = () =>
        $('#' + t.dataset.t)?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      if ((msg.mode || 'land') != 'land') {
        msg = { mode: 'land' };
        render();
        setTimeout(go);
      } else go();
    }
    if (['login', 'signup', 'fgsend', 'fgset'].includes(a) && t.tagName == 'BUTTON') {
      t.classList.add('is-busy');
      t.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        t.classList.remove('is-busy');
        t.removeAttribute('aria-busy');
      }, 700);
    }
  },
  true
);
document.addEventListener('input', e => {
  if (e.target.dataset.a == 'pek') {
    PE.km = +e.target.value;
    peUpd();
  }
});
render();
