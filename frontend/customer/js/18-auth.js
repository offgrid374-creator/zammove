/**
 * 18-auth.js — Auth redesign from the Figma file ("NEW SCREENS: build these", A01–A12).
 *
 *   A02 / A03  Sign up: card layout, split name fields, +63 mobile prefix, street illustration
 *   A03b       Sign up errors: each problem shown under its own field
 *   A04        Verify account: modal with six code boxes, resend countdown, "Later"
 *   A08 / A09  Log in: keeps the typed email, red password field and attempts left
 *   A10        Locked: disabled button with a live "Try again in 0:58" countdown
 *   A12b       Reset code: red code field when the code is wrong
 *
 * The UPDATED screens (A01, A05–A08, A11, A12) only change colours and weights; that lives in css/auth.css.
 * Like the other files, this one wraps earlier functions (head, authP, render) instead of editing them.
 * The server rules are unchanged: sign up still sends one full name, and errors still come from the server.
 */
(() => {
  const AU = { lockT: 0 }; // login lockout timer
  const ZV = { t: 0, sent: 0 }; // verify modal: resend countdown timer and when the last code was sent

  /* ---------- shared bits ---------- */
  const val = id => (document.getElementById(id)?.value || '').trim();
  const fe = (k, m) => (m ? `<p class="zu-fe" id="fe-${k}">${esc(m)}</p>` : '');
  const bad = k => (msg.fe && msg.fe[k] ? ' class="is-bad" aria-invalid="true"' : '');
  const keep = k => esc((msg.fv && msg.fv[k]) || '');
  const ufld = (l, id, x = '', hint = '') =>
    `<div class="p-f zu-f"><label for="${id}">${l}</label><input id="${id}"${bad(id)} value="${keep(id)}" ${x}>${hint}${fe(id, msg.fe && msg.fe[id])}</div>`;
  const upwf = (l, id, ac, x = '') =>
    `<div class="p-f zu-f"><label for="${id}">${l}</label><div class="pw"><input id="${id}"${bad(id)} type="password" autocomplete="${ac}" placeholder="At least 8 characters" ${x}><button type="button" data-a="eye" data-t="${id}" aria-label="Show password">${eyeI}</button></div>${fe(id, msg.fe && msg.fe[id])}</div>`;

  /* street band behind the sign-up card and verify modal, drawn from the app's own vehicle line art (ART) */
  const truck = (id, x, y, w) =>
    `<svg x="${x}" y="${y}" width="${w}" height="${w / 2}" viewBox="0 0 200 100">${ART[id]}</svg>`;
  const band = () =>
    `<div class="zu-band" aria-hidden="true"><svg viewBox="0 0 1440 130" preserveAspectRatio="xMidYMax slice" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${truck('cv', 96, 14, 230)}${truck('l3', 436, 26, 190)}${truck('w6', 736, 8, 240)}${truck('l3', 1086, 46, 170)}<path d="M0 109H1440"/><path stroke-width="1.5" d="M80 120H140M260 120H320M440 120H500M620 120H680M800 120H860M980 120H1040M1160 120H1220M1340 120H1400"/></svg></div>`;

  /* ---------- A02 / A03 / A03b: sign up ---------- */
  const _head = head;
  head = () =>
    msg.mode == 'up'
      ? `<div class="p-top zu-top"><div class="p-c p-bar"><a class="p-lg" data-a="swap" data-m="land" href="#">ZamMove</a><div class="zu-have"><span>Already have an account?</span><a class="p-b zu-sec sm" data-a="swap" data-m="in" href="#">Log in</a></div></div></div>`
      : _head();

  const signUp = () => {
    const E = msg.fe || {};
    return `<div class="zu-wrap">${band()}<div class="zu-card"><h1>Create your account</h1><p class="z-sub">Use your legal name as it appears on your ID. Drivers see your first name and mobile number.</p><form id="af" onsubmit="return false" novalidate>
<div class="p-2">${ufld('Last name', 'ln', 'autocomplete="family-name" placeholder="e.g. Dela Cruz"')}${ufld('First name', 'fnm', 'autocomplete="given-name" placeholder="e.g. Juan"')}</div>
<div class="p-2">${ufld('Middle name <span class="zu-opt">(optional)</span>', 'mn', 'autocomplete="additional-name" placeholder="e.g. Santos"')}${ufld('Date of birth', 'db', 'type="date" autocomplete="bday"')}</div>
<div class="p-f zu-f"><label for="ph">Mobile number</label><div class="zu-ph${E.ph ? ' is-bad' : ''}"><span>+63</span><input id="ph" value="${keep('ph')}" inputmode="tel" autocomplete="tel-national" placeholder="9XX XXX XXXX" maxlength="13"${E.ph ? ' aria-invalid="true"' : ''}></div>${E.ph ? fe('ph', E.ph) : '<p class="p-h zu-hint">We text a 6-digit code to this number.</p>'}</div>
${ufld('Email', 'em', 'type="email" autocomplete="email" placeholder="name@example.com"')}
${ufld('Complete address', 'ad', 'autocomplete="street-address" placeholder="House no., street, barangay"')}
${upwf('Password', 'pw', 'new-password', 'oninput="mt()"')}<div class="meter"><i id="mt" style="width:0"></i></div>${E.pw ? '' : '<p class="p-h zu-hint">8+ characters with a letter and a number</p>'}
${upwf('Confirm password', 'pw2', 'new-password', 'oninput="mm()"')}<div class="p-h" id="mm"${E.pw2 ? ' hidden' : ''}></div>
<label class="p-ck zu-ck${E.tc ? ' is-bad' : ''}"><input type="checkbox" id="tc"${msg.fv && msg.fv.tc ? ' checked' : ''}><span>I agree to the <a data-a="swap" data-m="terms" href="#">Terms and Privacy Policy</a></span></label>${fe('tc', E.tc)}
<div class="p-err" id="er" role="alert">${esc(msg.auth || '')}</div><button class="p-b p-pri p-full" data-a="zu-signup">Create account</button></form></div></div>`;
  };

  /* client checks mirror the server rules so problems show under the right field before anything is sent */
  const phone = s => {
    const d = s.replace(/[\s-]/g, '').replace(/^\+?63/, '');
    return /^9\d{9}$/.test(d) ? '0' + d : /^09\d{9}$/.test(d) ? d : '';
  };
  const age = d => {
    const b = new Date(d + 'T00:00'),
      n = new Date();
    return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  };
  const checkUp = v => {
    const e = {};
    if (!v.ln) e.ln = 'Enter your last name';
    if (!v.fnm) e.fnm = 'Enter your first name';
    if (!v.db) e.db = 'Enter your date of birth';
    else if (!(age(v.db) >= 18)) e.db = 'You must be 18 or older';
    if (!phone(v.ph)) e.ph = 'Use a 10-digit mobile number starting with 9, like 917 123 4567';
    if (!/^\S+@\S+\.\S+$/.test(v.em)) e.em = 'Enter an email like name@example.com';
    if (v.ad.length < 8) e.ad = 'Enter your house number, street and barangay';
    if (v.pw.length < 8 || !/\d/.test(v.pw) || !/[a-z]/i.test(v.pw))
      e.pw = 'Use 8 or more characters with a letter and a number';
    if (!v.pw2 || v.pw2 != v.pw) e.pw2 = "Passwords don't match";
    if (!v.tc) e.tc = 'Agree to the Terms to continue';
    return e;
  };
  /* server messages that belong to one field */
  const SERVER = [
    [/full name/i, 'fnm'],
    [/18 or older/i, 'db'],
    [/mobile/i, 'ph'],
    [/address/i, 'ad'],
    [/valid email|already registered/i, 'em'],
    [/password/i, 'pw'],
    [/terms/i, 'tc'],
  ];
  const doSignUp = async btn => {
    const v = {
      ln: val('ln'),
      fnm: val('fnm'),
      mn: val('mn'),
      db: val('db'),
      ph: val('ph'),
      em: val('em').toLowerCase(),
      ad: val('ad'),
      pw: $('#pw').value,
      pw2: $('#pw2').value,
      tc: $('#tc').checked,
    };
    const { pw, pw2, ...fv } = v,
      e = checkUp(v);
    if (Object.keys(e).length) {
      msg = { mode: 'up', fe: e, fv };
      render();
      return $('#' + Object.keys(e)[0])?.focus();
    }
    btn.classList.add('is-busy');
    btn.disabled = true;
    const r = await ZAPI.auth('signup', {
      name: [v.fnm, v.mn, v.ln].filter(Boolean).join(' '),
      dob: v.db,
      ph: phone(v.ph),
      ad: v.ad,
      em: v.em,
      pw: v.pw,
      terms: true,
    });
    if (!r.ok) {
      const hit = SERVER.find(x => x[0].test(r.err || ''));
      msg = hit ? { mode: 'up', fe: { [hit[1]]: r.err }, fv } : { mode: 'up', fv, auth: r.err };
      return render();
    }
    S.me = r.me;
    S.ws = 'customer';
    msg = {};
    view = 'home';
    sessionStorage.removeItem('zv-later');
    save();
    render();
  };

  /* ---------- A08 / A09 / A10: log in ---------- */
  const locked = () => AU.until && Date.now() < AU.until;
  const left = () => Math.max(0, Math.ceil((AU.until - Date.now()) / 1000));
  const clock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const logIn = () => {
    const L = locked(),
      err = L ? `Too many attempts. You can try again in ${left()} seconds, or reset your password.` : msg.auth || '';
    return `<div class="p-au">${bk('land')}<h1>Log in</h1><p class="z-sub">Use the email you registered with.</p><form id="af" onsubmit="return false" novalidate>${fld('Email', 'em', `type="email" autocomplete="email" value="${esc(msg.lem || '')}"`)}<div class="p-f"><label for="pw">Password</label><div class="pw"><input id="pw" type="password" autocomplete="current-password"${err ? ' class="is-bad" aria-invalid="true" aria-describedby="er"' : ''}${L ? ' disabled' : ''}><button type="button" data-a="eye" data-t="pw" aria-label="Show password">${eyeI}</button></div></div>
<div class="p-err" id="er" role="alert" style="margin-top:12px">${esc(err)}</div><div class="p-fo"><a data-a="forgot" href="#">Forgot password?</a></div><button class="p-b p-pri p-full" id="zu-lb" data-a="zu-login"${L ? ' disabled' : ''}>${L ? 'Try again in ' + clock(left()) : 'Log in'}</button></form><p class="z-alt">New to ZamMove? <a data-a="swap" data-m="up" href="#">Create an account</a></p></div>`;
  };
  const tick = () => {
    clearInterval(AU.lockT);
    AU.lockT = setInterval(() => {
      const b = $('#zu-lb'),
        er = $('#er');
      if (!locked()) {
        clearInterval(AU.lockT);
        AU.until = 0;
        msg.auth = '';
        if (!S.me && msg.mode == 'in') render();
        return;
      }
      if (S.me || msg.mode != 'in') return; // only the log-in page shows the countdown
      if (b) b.textContent = 'Try again in ' + clock(left());
      if (er) er.textContent = `Too many attempts. You can try again in ${left()} seconds, or reset your password.`;
    }, 1000);
  };
  const doLogIn = async btn => {
    if (locked()) return;
    const em = val('em');
    btn.classList.add('is-busy');
    btn.disabled = true;
    const r = await ZAPI.auth('login', { em, pw: $('#pw').value });
    if (!r.ok) {
      const s = /(\d+)\s*seconds/.exec(r.err || '');
      if (/too many|locked/i.test(r.err || '') && s) {
        AU.until = Date.now() + +s[1] * 1000;
        tick();
      }
      msg = { mode: 'in', auth: r.err, lem: em };
      render();
      return locked() ? null : $('#pw')?.focus();
    }
    S.me = r.me;
    S.ws = 'customer';
    msg = {};
    save();
    render();
  };

  /* ---------- A11 / A12 / A12b: reset password ---------- */
  const _authP = authP;
  authP = function (m) {
    if (m == 'up') return signUp();
    if (m == 'in') return logIn();
    let h = _authP(m);
    if (m == 'fg' && msg.fc && msg.auth)
      h = h.replace('<input id="fcd"', '<input id="fcd" class="is-bad" aria-invalid="true"');
    return h;
  };

  /* ---------- A04: verify account modal ---------- */
  const meU = () => S.me && S.users.find(x => x.em == S.me.em);
  const mask = p => {
    const d = String(p || '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(0, 4) + ' ••• ' + d.slice(-4) : 'your phone';
  };
  const modal = u =>
    `<div class="zv-ov" id="zv"><div class="zv-m" role="dialog" aria-modal="true" aria-labelledby="zv-h"><span class="zv-pill">1 step left before you can book</span><h2 id="zv-h">Verify your mobile number</h2><p class="zv-p">We sent a 6-digit code to <b>${esc(mask(u.ph))}</b>. Enter it below so drivers can reach you.</p><div class="zv-boxes" role="group" aria-label="6-digit code">${[0, 1, 2, 3, 4, 5].map(i => `<input class="zv-b" data-i="${i}" inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="6" aria-label="Digit ${i + 1}">`).join('')}</div><p class="zv-err" id="zv-err" role="alert"></p><p class="zv-rs" id="zv-rs"></p><div class="zv-acts"><button class="p-b zu-btn zu-pri" id="zv-go" data-a="zv-verify" disabled>Verify</button><button class="p-b zu-btn zu-sec" data-a="zv-later">Later</button></div><p class="zv-note">Until you verify, you can look around but not book or rent.</p><p class="zv-note">Prototype: no SMS service is connected, so the code goes to a <a href="#" data-a="zinbox" data-to="${esc(u.ph || '')}">simulated inbox</a>.</p></div></div>`;
  const code = () => [...document.querySelectorAll('.zv-b')].map(b => b.value).join('');
  const resendLine = () => {
    const r = $('#zv-rs');
    if (!r) return clearInterval(ZV.t);
    const s = Math.ceil((ZV.sent + 60000 - Date.now()) / 1000);
    r.innerHTML =
      s > 0
        ? `Didn't get it? Send again in ${clock(s)}`
        : `Didn't get it? <a href="#" data-a="zv-resend">Send a new code</a>`;
    if (s <= 0) clearInterval(ZV.t);
  };
  const startResend = () => {
    ZV.sent = Date.now();
    clearInterval(ZV.t);
    resendLine();
    ZV.t = setInterval(resendLine, 1000);
  };
  const closeModal = () => {
    clearInterval(ZV.t);
    $('#zv')?.remove();
    document.documentElement.classList.remove('zv-open');
  };
  const syncModal = () => {
    const u = meU(),
      want = u && !u.ver && !u.adm && S.ws == 'customer' && !sessionStorage.getItem('zv-later');
    if (!want) return closeModal();
    if ($('#zv')) return; // already open: keep what the person typed
    document.body.insertAdjacentHTML('beforeend', modal(u));
    document.documentElement.classList.add('zv-open');
    startResend();
    setTimeout(() => $('.zv-b')?.focus(), 30);
  };
  const fillFrom = (i, s) => {
    const bs = [...document.querySelectorAll('.zv-b')],
      d = s.replace(/\D/g, '').split('');
    d.forEach((c, k) => bs[i + k] && (bs[i + k].value = c));
    bs[Math.min(i + d.length, 5)]?.focus();
  };
  const boxState = () => {
    document.querySelectorAll('.zv-b').forEach(b => b.classList.toggle('on', !!b.value));
    const go = $('#zv-go'),
      full = code().length == 6;
    if (go) go.disabled = !full;
  };
  document.addEventListener('input', e => {
    const b = e.target.closest('.zv-b');
    if (!b) return;
    const i = +b.dataset.i,
      v = b.value.replace(/\D/g, '');
    b.value = '';
    if (v) fillFrom(i, v);
    $('#zv-err').textContent = '';
    document.querySelectorAll('.zv-b').forEach(x => x.classList.remove('is-bad'));
    boxState();
  });
  document.addEventListener('keydown', e => {
    const b = e.target.closest('.zv-b');
    if (b) {
      const i = +b.dataset.i,
        bs = document.querySelectorAll('.zv-b');
      if (e.key == 'Backspace' && !b.value && i) bs[i - 1].focus();
      if (e.key == 'ArrowLeft' && i) bs[i - 1].focus();
      if (e.key == 'ArrowRight' && i < 5) bs[i + 1].focus();
      if (e.key == 'Enter' && code().length == 6) $('#zv-go').click();
    }
    if (e.key == 'Escape' && $('#zv')) $('[data-a="zv-later"]').click();
  });
  document.addEventListener('paste', e => {
    const b = e.target.closest('.zv-b');
    if (!b) return;
    e.preventDefault();
    fillFrom(+b.dataset.i, (e.clipboardData || window.clipboardData).getData('text'));
    boxState();
  });

  /* ---------- actions ---------- */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a]');
      if (!t || !/^z[uv]-/.test(t.dataset.a)) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a;
      if (a == 'zu-signup') return doSignUp(t);
      if (a == 'zu-login') return doLogIn(t);
      if (a == 'zv-later') {
        sessionStorage.setItem('zv-later', '1');
        return closeModal();
      }
      if (a == 'zv-resend') {
        const r = await ZAPI.act('resendCode');
        if (!r.ok) return ($('#zv-err').textContent = r.err);
        startResend();
        return toast('A new code was sent to your phone (simulated inbox).');
      }
      if (a == 'zv-verify') {
        t.disabled = true;
        t.classList.add('is-busy');
        const r = await ZAPI.act('verifyAccount', { code: code() });
        t.classList.remove('is-busy');
        if (!r.ok) {
          $('#zv-err').textContent = r.err;
          document.querySelectorAll('.zv-b').forEach(x => {
            x.classList.add('is-bad');
            x.value = '';
          });
          $('.zv-b').focus();
          return boxState();
        }
        closeModal();
        toast('Account verified. You can now book and rent.');
        return render();
      }
    },
    true
  );

  /* ---------- render hook ---------- */
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    if (S.me) syncModal();
    else closeModal();
    return out;
  };
  render();
})();
