/**
 * 28-extras.js — bigger bookings and location.
 *
 *   Signup        the customer picks their barangay (used to suggest vehicles near them).
 *   Booking form  "Pick it up again later" (reservation: drop off now, pick up on a later date with the same
 *                 vehicle and driver; both trips and a daily hold fee are paid together), adding a vehicle or a
 *                 drop-off to an existing booking (one group), and how many vehicles are near the customer.
 */
(function () {
  'use strict';
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const places = () => (typeof PL != 'undefined' ? PL : []).map(p => (Array.isArray(p) ? p[0] : p.n || p)).filter(Boolean);
  const meU = () => (S.users || []).find(u => u.em == (S.me || {}).em) || S.me || {};
  const km = (a, b) => {
    if (!a || !b) return null;
    const r = Math.PI / 180,
      x = (b[0] - a[0]) * r,
      y = (b[1] - a[1]) * r,
      h = Math.sin(x / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };

  /* ---------- signup: barangay ---------- */
  const placeBrgy = () => {
    if (S.me || typeof msg == 'undefined' || (msg || {}).mode != 'up') return;
    const ad = document.getElementById('ad');
    if (!ad || document.getElementById('su-brgy')) return;
    const cell = ad.closest('.zu-f, .fld, div');
    const d = document.createElement('div');
    d.className = (cell && cell.className) || '';
    d.innerHTML = `<label for="su-brgy">Barangay <span aria-hidden="true">*</span></label><select id="su-brgy" required><option value="">Choose your barangay</option>${places()
      .map(n => `<option value="${esc(n)}">${esc(String(n).replace(/, Zamboanga City$/, ''))}</option>`)
      .join('')}</select><small class="mu" style="display:block;margin-top:4px">Used to show vehicles near you when you book.</small>`;
    (cell || ad).insertAdjacentElement('afterend', d);
  };
  const _auth = ZAPI.auth;
  ZAPI.auth = (op, p) => {
    if (op == 'signup' && p && !p.brgy) {
      const b = v('su-brgy');
      if (!b) return Promise.resolve({ ok: false, err: 'Choose your barangay from the list.' });
      p = { ...p, brgy: b };
    }
    return _auth(op, p);
  };

  /* ---------- booking form: reservation, group, near me ---------- */
  const RES = { on: false, dt: '', tm: '', dr: '' };
  window.ZGRP = window.ZGRP || null; // { grp, label } when adding to an existing booking
  const resBox = () => {
    const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10),
      fee = (S.cfg && S.cfg.holdFee) || 500;
    return `<div class="zx-box">${
      window.ZGRP
        ? `<div class="zx-grp"><b>Adding to ${esc(window.ZGRP.label)}.</b> This booking joins the same move (another vehicle or another drop-off). <button type="button" class="zf-x" data-a="zx-grp-x">Book separately</button></div>`
        : ''
    }<label class="p-ck"><input type="checkbox" id="zx-res"${RES.on ? ' checked' : ''}><span><b>Pick it up again later</b> (reservation)</span></label><p class="mu" style="margin:2px 0 0 30px;font-size:13.5px">For events and temporary moves: we drop off now and the same vehicle and driver pick everything up on the date you choose. Both trips and ₱${fee} a day for holding the vehicle are paid together.</p>${
      RES.on
        ? `<div class="wsf" style="margin-top:8px"><div><label for="zx-rdt">Pick-up date</label><input id="zx-rdt" type="date" min="${today}" value="${esc(RES.dt)}"></div><div><label for="zx-rtm">Pick-up time</label><input id="zx-rtm" type="time" value="${esc(RES.tm)}"></div><div style="grid-column:1/-1"><label for="zx-rdr">Bring everything back to</label><select id="zx-rdr"><option value="">The original pickup address</option>${places()
            .map(n => `<option${n == RES.dr ? ' selected' : ''}>${esc(n)}</option>`)
            .join('')}</select></div></div>`
        : ''
    }${nearLine()}</div>`;
  };
  const nearLine = () => {
    const loc = meU().loc;
    if (!loc) return '';
    const vt = typeof sel != 'undefined' && sel ? sel.v : '',
      L = (S.haulList || []).filter(x => (!vt || x.type == vt) && x.near),
      n = L.filter(x => km(loc, x.near) <= 5).length;
    return `<p class="zx-near"><span aria-hidden="true">📍</span> ${n} ${n == 1 ? 'vehicle' : 'vehicles'} of this type within 5 km of ${esc(String(meU().brgy || 'you').replace(/, Zamboanga City$/, ''))}.</p>`;
  };
  const placeRes = () => {
    if (!S.me || (S.ws || 'customer') != 'customer' || typeof view == 'undefined' || view != 'book') return;
    const pref = document.getElementById('zk-pref'),
      pick = document.querySelector('#app [data-a="pick"]');
    const anchor = pref || (pick && pick.parentElement);
    if (!anchor) return;
    let box = document.getElementById('zx-res-box');
    const html = resBox();
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement) && document.activeElement.type != 'checkbox') return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'zx-res-box';
      anchor.insertAdjacentElement('afterend', box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
    /* a booking added to a group starts from the same pickup, date and time */
    if (window.ZGRP && !window.ZGRP.filled) {
      window.ZGRP.filled = true;
      [['pu', window.ZGRP.pu], ['dt', window.ZGRP.dt], ['tm', window.ZGRP.tm]].forEach(([id, x]) => {
        const el = document.getElementById(id);
        if (el && x && !el.value) {
          el.value = x;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  };
  document.addEventListener('change', e => {
    const id = e.target && e.target.id;
    if (id == 'zx-res') RES.on = e.target.checked;
    else if (id == 'zx-rdt') RES.dt = e.target.value;
    else if (id == 'zx-rtm') RES.tm = e.target.value;
    else if (id == 'zx-rdr') RES.dr = e.target.value;
    else return;
    if (id == 'zx-res') {
      const box = document.getElementById('zx-res-box');
      if (box) box.dataset.h = '';
      placeRes();
    }
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('[data-a="zx-grp-x"],[data-a="zx-more"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.dataset.a == 'zx-grp-x') {
        window.ZGRP = null;
        const box = document.getElementById('zx-res-box');
        if (box) box.dataset.h = '';
        return placeRes();
      }
      const b = (S.bk || []).find(x => x.id == t.dataset.id);
      if (!b) return;
      window.ZGRP = { grp: b.grp || b.id, label: b.grp ? 'group ' + b.grp : 'booking ' + b.id, pu: b.pu, dt: b.dt, tm: b.tm };
      location.hash = '#book';
      view = 'book';
      render();
      window.scrollTo({ top: 0 });
      toast('Same pickup, date and time. Choose the vehicle and the drop-off.');
    },
    true
  );
  /* the booking request carries the reservation and the group */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) => {
    if (n == 'createBooking') {
      p = { ...(p || {}) };
      if (RES.on && !p.ret) {
        if (!RES.dt) return Promise.resolve({ ok: false, err: 'Choose the pick-up date for the reservation.' });
        p.ret = { dt: RES.dt, tm: RES.tm || p.tm, dr: RES.dr || '' };
      }
      if (window.ZGRP && !p.grp) p.grp = window.ZGRP.grp;
    }
    return _act(n, p).then(r => {
      if (n == 'createBooking' && r.ok) {
        Object.assign(RES, { on: false, dt: '', tm: '', dr: '' });
        window.ZGRP = null;
      }
      return r;
    });
  };

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        placeBrgy();
        placeRes();
      } catch (e) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-a="pick"]'))
      setTimeout(() => {
        const box = document.getElementById('zx-res-box');
        if (box) box.dataset.h = '';
        placeRes();
      }, 10);
  });
  const css = document.createElement('style');
  css.textContent = `.zx-box{margin:12px 0;padding:12px 14px;border:1px solid var(--bd);border-radius:12px;background:var(--s)}.zx-grp{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:var(--zb-ok-bg,#e2f3ea);font-size:14px}.zx-near{margin:10px 0 0;font-size:14px;color:var(--tx2)}.zb-pkg{margin:8px 0 0;font-size:14px}`;
  document.head.appendChild(css);
  render();
})();
