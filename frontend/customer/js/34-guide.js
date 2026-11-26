/**
 * 34-guide.js — guidance so nobody misses a step.
 *
 *   1. Form steps    each numbered step on Book a haul and Rent a vehicle shows ✓ (done) or ! (something
 *                    missing, with the reason on hover); the rental form gets a "Before you submit" list.
 *   2. Menu badges   a red count on the menu item (and on the workspace switcher) when something there
 *                    needs this person's action.
 *   3. Next step     one line at the top of the page with the most urgent thing to do and a button to it.
 *   4. Fields        required fields get a red *, and a short hint appears under a field as soon as it is
 *                    left wrong (it disappears once it is right).
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const $$ = s => [...document.querySelectorAll(s)];
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const done = b => ['Completed', 'Cancelled', 'Rejected'].includes(b.st);
  const ROAD = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded', 'In Transit', 'Arrived at Destination', 'Delivery Confirmation', 'Awaiting Final Payment'];
  const isBook = () => typeof view != 'undefined' && view == 'book' && S.ws == 'customer';
  const isRent = () => typeof view != 'undefined' && view == 'rent' && S.ws == 'customer';
  const FXo = () => window.ZFX || {};
  const avail = id => (!S.typeAvail || S.typeAvail[id] == null ? 1 : +S.typeAvail[id]);

  /* ================= 4. field rules (also feed the step icons) ================= */
  const RULES = {
    pu: () => (coord(v('pu')) ? '' : 'Pick the pickup from the suggestions, use your location, or tap the map.'),
    dr: () => (!coord(v('dr')) ? 'Pick the drop-off from the suggestions or tap the map.' : v('dr') == v('pu') ? 'The drop-off must be different from the pickup.' : ''),
    dt: () => (!v('dt') ? 'Choose the pickup date.' : v('dt') < todayPH() ? 'The date cannot be in the past.' : ''),
    tm: () => (v('tm') ? '' : 'Choose the time the driver should arrive.'),
    it: () => (v('it').length >= 3 ? '' : 'List what you are moving, e.g. “sofa, 3 boxes, refrigerator”.'),
    'z7-sz': () => (v('z7-sz') ? '' : 'Choose how much you are moving so the right vehicle and helpers come.'),
    rp: () => (!v('rp') ? 'Enter where you will pick up the vehicle.' : inZC(v('rp')) ? '' : 'Pickup must be in Zamboanga City.'),
    rr: () => (FXo().wd ? '' : !v('rr') ? 'Enter where you will return the vehicle.' : inZC(v('rr')) ? '' : 'Return must be in Zamboanga City.'),
    rl: () => (FXo().wd ? '' : v('rl').length >= 6 ? '' : 'Enter your driver’s license number as printed on the card.'),
    rx: () => (FXo().wd ? '' : !v('rx') ? 'Enter your license expiry date.' : FXo().e && v('rx') < FXo().e ? `Your license must be valid until your return date (${FXo().e}).` : ''),
    ri: () => (((document.getElementById('ri') || {}).files || []).length ? '' : 'Add a photo of a valid ID.'),
    rlp: () => (FXo().wd ? '' : ((document.getElementById('rlp') || {}).files || []).length ? '' : 'Add a photo of your driver’s license.'),
  };
  const touched = new Set(); // hints show only after the person has left the field once
  const err = id => (RULES[id] && document.getElementById(id) ? RULES[id]() : '');
  const anchorOf = el => el.closest('.ac') || el;
  const showHint = id => {
    const el = document.getElementById(id);
    if (!el) return;
    const a = anchorOf(el),
      msg = touched.has(id) ? err(id) : '';
    let h = a.nextElementSibling && a.nextElementSibling.classList.contains('zg-hint') ? a.nextElementSibling : null;
    if (!msg) {
      if (h) h.remove();
      el.removeAttribute('aria-invalid');
      return;
    }
    if (!h) {
      h = document.createElement('small');
      h.className = 'zg-hint';
      h.setAttribute('role', 'alert');
      a.insertAdjacentElement('afterend', h);
    }
    if (h.textContent != msg) h.textContent = msg;
    el.setAttribute('aria-invalid', 'true');
  };
  const labelOf = el => document.querySelector(`#app label[for="${el.id}"]`) || (el.closest('.ac') || el).previousElementSibling;
  const markRequired = () => {
    Object.keys(RULES).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const l = labelOf(el),
        need = !!RULES[id] && !(FXo().wd && ['rr', 'rl', 'rx', 'rlp'].includes(id));
      if (l && l.tagName == 'LABEL') l.classList.toggle('zg-req', need);
      if (touched.has(id)) showHint(id);
    });
  };
  document.addEventListener('focusout', e => {
    const id = e.target && e.target.id;
    if (!RULES[id]) return;
    /* a suggestion click can fill the field right after it loses focus */
    setTimeout(() => {
      touched.add(id);
      showHint(id);
      paintSteps();
    }, 250);
  });
  ['input', 'change'].forEach(ev =>
    document.addEventListener(ev, e => {
      const id = e.target && e.target.id;
      if (RULES[id] && touched.has(id)) showHint(id);
      if (isBook() || isRent()) setTimeout(paintSteps, 0);
    })
  );

  /* ================= 1. step icons ================= */
  const ok = ids => ids.every(id => !err(id));
  const why = ids => ids.map(err).filter(Boolean)[0] || '';
  const icon = (host, state, tip) => {
    let i = host.querySelector(':scope > .zg-st');
    if (!state) return i && i.remove();
    if (!i) {
      i = document.createElement('i');
      i.className = 'zg-st';
      i.setAttribute('aria-hidden', 'false');
      host.appendChild(i);
    }
    i.className = 'zg-st ' + state;
    i.textContent = state == 'ok' ? '✓' : '!';
    i.title = state == 'ok' ? 'Done' : tip || 'Something here is still needed';
    i.setAttribute('aria-label', i.title);
  };
  const bookSteps = () => {
    const S1 = ['pu', 'dr'],
      S3 = ['dt', 'tm'],
      S4 = ['it', 'z7-sz'];
    const st = {
      1: [ok(S1), why(S1)],
      2: [avail(sel.v) > 0, 'No vehicle of this type is free right now. Choose another type.'],
      3: [ok(S3), why(S3)],
      4: [ok(S4), why(S4)],
    };
    $$('#app .rv-step').forEach(s => {
      const n = +((s.querySelector('span') || {}).textContent || 0);
      if (!st[n]) return;
      const host = s.querySelector('div > b') || s;
      icon(host, st[n][0] ? 'ok' : 'todo', st[n][1]);
    });
  };
  const rentChecks = () => {
    const F = FXo(),
      d1 = F.s && F.e && F.e >= F.s && !(F.s == F.e && F.rt && F.pt && F.rt <= F.pt),
      det = ['rp', 'rr', 'rl', 'rx', 'ri', 'rlp'].filter(id => document.getElementById(id));
    return [
      ['fx-s', 'Dates and times', !!d1, !F.s || !F.e ? 'Choose the start and end dates.' : 'Check the dates and times.'],
      ['fx-model', 'Vehicle chosen', !!F.m, 'Choose a vehicle model.'],
      ['fx-model', 'Unit chosen', !!F.u, 'Pick one of the available units.'],
      ...det.map(id => [id, { rp: 'Pickup location', rr: 'Return location', rl: 'License number', rx: 'License expiry', ri: 'ID photo', rlp: 'License photo' }[id], !err(id), err(id)]).filter(x => !(F.wd && ['rr', 'rl', 'rx', 'rlp'].includes(x[0]))),
    ];
  };
  const rentSteps = () => {
    const c = rentChecks(),
      F = FXo();
    const det = c.slice(3);
    const st = {
      1: [c[0][2], c[0][3]],
      2: [!!F.m, 'Choose a vehicle model.'],
      3: [!!F.u, 'Pick one of the available units.'],
      4: [det.length > 0 && det.every(x => x[2]), (det.find(x => !x[2]) || [])[3]],
    };
    $$('#app h2').forEach(h => {
      const m = h.firstChild && h.firstChild.nodeType == 3 && h.firstChild.textContent.match(/^\s*(\d)\./);
      if (!m || !st[m[1]]) return;
      icon(h, st[m[1]][0] ? 'ok' : 'todo', st[m[1]][1]);
    });
    /* the list next to "Submit rental request" */
    const btn = document.querySelector('#app [data-a="fx-req"]');
    if (!btn) return;
    let box = document.getElementById('zg-rcheck');
    if (!box) {
      box = document.createElement('div');
      box.id = 'zg-rcheck';
      box.className = 'rv-check';
      box.setAttribute('aria-live', 'polite');
      btn.insertAdjacentElement('beforebegin', box);
    }
    const n = c.filter(x => x[2]).length,
      html = `<div class="rv-check-h"><b>Before you submit</b><span>${n} of ${c.length}</span></div><ul>${c
        .map(([id, t, good]) => `<li class="${good ? 'done' : ''}"><button type="button" data-zg-go="${id}" ${good ? 'tabindex="-1"' : ''}><i aria-hidden="true">${good ? '✓' : ''}</i>${esc(t)}</button></li>`)
        .join('')}</ul>`;
    if (box.dataset.h != html) (box.dataset.h = html), (box.innerHTML = html);
  };
  function paintSteps() {
    try {
      if (isBook()) bookSteps();
      if (isRent()) rentSteps();
    } catch (e) {
      /* never break a redraw */
    }
  }
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('[data-zg-go]');
      if (!t) return;
      e.preventDefault();
      const id = t.dataset.zgGo,
        el = document.getElementById(id) || document.querySelector('#app [data-a="fx-model"]');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        if (el.focus) el.focus({ preventScroll: true });
        touched.add(id);
        showHint(id);
      }, 350);
    },
    true
  );

  /* ================= 2 + 3. what needs this person's action ================= */
  /* each item: [workspace, page, text, priority] — priority 1 is the most urgent */
  const todo = () => {
    const em = me();
    if (!em) return [];
    const L = [];
    const bk = S.bk || [],
      rn = S.rn || [],
      pay = S.pay || [];
    /* customer */
    bk.filter(b => b.cu == em && !done(b)).forEach(b => {
      if (b.st == 'Awaiting Down Payment') L.push(['customer', 'track', `Your driver is at pickup: pay the down payment for ${b.id}.`, 1]);
      else if (b.st == 'Awaiting Final Payment') L.push(['customer', 'track', `Pay the balance for ${b.id}.`, 1]);
      else if (b.st == 'Delivery Confirmation' || b.st == 'Arrived at Destination') L.push(['customer', 'track', `Your items arrived: check them and confirm delivery of ${b.id}.`, 1]);
      else if (b.st == 'No driver found') L.push(['customer', 'bookings', `No driver accepted ${b.id}: choose another time or vehicle.`, 2]);
      if (b.fix && Object.values(b.fix).some(f => f && !f.ans && !f.done)) L.push(['customer', 'bookings', `Your driver asks to correct a payment on ${b.id}: approve or decline it.`, 2]);
    });
    pay.filter(p => p.payer == em && p.kind == 'cancel_fee' && p.status == 'Due' && !(p.disp && !p.disp.closed)).forEach(p => L.push(['customer', 'bookings', `A fee of ${peso(p.amount)} for ${p.bid} is due.`, 2]));
    rn.filter(r => r.cu == em).forEach(r => {
      const sg = (r.ct && r.ct.sg) || {},
        paid = typeof ZPAY != 'undefined' ? ZPAY.sum(r.id) : 0,
        need = +r.tot + (+r.dep || 0);
      if (r.st == 'Approved' && !sg.cu) L.push(['customer', 'rent', `Your rental ${r.id} was approved: sign the contract.`, 1]);
      else if (r.st == 'Approved' && paid < need - 0.005) L.push(['customer', 'rent', `Pay ${peso(need - paid)} for rental ${r.id} before pickup.`, 1]);
      else if (r.st == 'Approved' && r.hv && r.ho && r.ho.out && r.ho.out.rec) L.push(['customer', 'rent', `Check the owner’s record and start rental ${r.id}.`, 1]);
      if (r.st == 'Active' && r.rq && r.rq.redo) L.push(['customer', 'rent', `The owner asked for new return photos for ${r.id}.`, 1]);
      if (r.back && !r.back.cu && r.st == 'Returned') L.push(['customer', 'rent', `Confirm the return record for ${r.id}.`, 2]);
    });
    pay.filter(p => p.to == em && ['refund', 'deposit_refund'].includes(p.kind) && p.status == 'Sent').forEach(p => L.push(['customer', 'rent', `Confirm you received the ${peso(p.amount)} refund for ${p.bid}.`, 2]));
    (S.inc || []).filter(i => i.by == em && i.st == 'Unconfirmed').forEach(i => L.push(['customer', 'reports', `Your report ${i.id} is a draft: send it or discard it.`, 3]));
    /* driver */
    const myTrip = bk.find(b => b.drvUser == em && ROAD.includes(b.st));
    if (myTrip) L.push(['driver', 'trip', `Trip ${myTrip.id} is in progress (${myTrip.st}).`, 1]);
    const open = bk.filter(b => b.st == 'Pending' && !b.drvUser && b.cu != em).length;
    if (open && S.me && (S.me.roles || []).some(r => r.t == 'driver' && r.st == 'approved')) L.push(['driver', 'req', `${open} booking request${open > 1 ? 's are' : ' is'} waiting for a driver.`, 3]);
    if (S.turn && S.turn.overdue) L.push(['driver', 'earn', 'You owe your owner for a trip over 7 days old: turn it over to take new jobs.', 1]);
    pay.filter(p => p.kind == 'turnover' && p.payer == em && p.status == 'Rejected' && !p.disp).forEach(p => L.push(['driver', 'earn', `Your owner marked a ${peso(p.amount)} turnover as not received.`, 2]));
    /* vehicle owner */
    const mine = new Set((S.vh || []).filter(x => x.owner == em).map(x => x.id));
    if (mine.size) {
      rn.filter(r => mine.has(r.veh) && r.st == 'Pending').forEach(r => L.push(['owner', 'rent', `New rental request ${r.id}: approve or reject it.`, 1]));
      const ids = new Set(rn.filter(r => mine.has(r.veh)).map(r => r.id));
      pay.filter(p => ids.has(p.bid) && p.status == 'Submitted').forEach(p => L.push(['owner', 'rent', `Confirm the ${peso(p.amount)} payment for ${p.bid}.`, 1]));
      rn.filter(r => mine.has(r.veh) && r.st == 'Active' && r.rq && !r.rq.redo).forEach(r => L.push(['owner', 'rent', `${r.id} was returned: check the vehicle.`, 1]));
      pay.filter(p => p.kind == 'turnover' && p.to == em && p.status == 'Submitted').forEach(p => L.push(['owner', 'drv', `A driver handed you ${peso(p.amount)}: confirm it.`, 1]));
      (S.apps || []).filter(a => a.employer == em && a.st == 'Waiting for Owner').forEach(a => L.push(['owner', 'drv', 'A driver applied to work for you: accept or decline.', 2]));
      pay.filter(p => p.from == em && ['refund', 'deposit_refund'].includes(p.kind) && p.status == 'Due').forEach(p => L.push(['owner', 'rent', `Send the ${peso(p.amount)} refund for ${p.bid}.`, 1]));
      const ob = S.ownerBal;
      if (ob && -(+ob.due || 0) - (+ob.sent || 0) > 0.005) L.push(['owner', 'earn', `Remit ${peso(-(+ob.due || 0) - (+ob.sent || 0))} to ZamMove this week.`, 3]);
    }
    return L.sort((a, b) => a[3] - b[3]);
  };

  /* menu badges */
  const setBadge = (el, n, title) => {
    let b = el.querySelector(':scope > .zg-badge');
    if (!n) return b && b.remove();
    if (!b) {
      b = document.createElement('span');
      b.className = 'zg-badge';
      el.appendChild(b);
    }
    const t = n > 9 ? '9+' : String(n);
    if (b.textContent != t) b.textContent = t;
    b.title = title;
    b.setAttribute('aria-label', title);
  };
  const paintBadges = L => {
    const by = {};
    L.forEach(([ws, pg]) => {
      by[ws + ':' + pg] = (by[ws + ':' + pg] || 0) + 1;
      by[ws] = (by[ws] || 0) + 1;
    });
    /* only the menus (header / navigation), not buttons inside the page */
    const menu = a => !!a.closest('header, nav, [role="navigation"]');
    $$('[data-a="nav"][data-v]').forEach(a => menu(a) && !a.classList.contains('hb') && S.ws == 'customer' && setBadge(a, by['customer:' + a.dataset.v] || 0, 'Needs your action'));
    $$('[data-a="w-go"][data-p]').forEach(a => menu(a) && setBadge(a, by[(a.dataset.w || S.ws) + ':' + a.dataset.p] || 0, 'Needs your action'));
    $$('[data-a="w-ws"][data-w]').forEach(a => setBadge(a, a.dataset.w != S.ws ? by[a.dataset.w] || 0 : 0, 'Needs your action in this workspace'));
  };

  /* next-step banner */
  const hidden = new Set(); // dismissed for this visit
  const curPage = () => (S.ws == 'customer' ? (typeof view != 'undefined' ? view : '') : (S.wp || {})[S.ws] || '');
  const paintBanner = L => {
    const h1 = document.querySelector('#app h1');
    let box = document.getElementById('zg-next');
    const item = L.find(x => x[0] == S.ws && !hidden.has(x[2]) && !(x[1] == curPage() && x[3] > 1));
    if (!h1 || !item || isBook()) return box && box.remove();
    const here = item[1] == curPage(),
      html = `<span class="zg-dot" aria-hidden="true">!</span><span class="zg-txt"><b>Next step:</b> ${esc(item[2])}</span>${here ? '' : `<button class="btn sm" data-zg-next="${esc(item[1])}">Open</button>`}<button class="zg-x" data-zg-hide="${esc(item[2])}" aria-label="Hide this">×</button>`;
    if (!box) {
      box = document.createElement('div');
      box.id = 'zg-next';
      box.setAttribute('role', 'status');
      /* above the page content, full width: walk up to the block directly inside #app */
      let top = h1;
      while (top.parentElement && top.parentElement.id != 'app' && top.parentElement != document.body) top = top.parentElement;
      top.insertAdjacentElement('beforebegin', box);
    }
    if (box.dataset.h != html) (box.dataset.h = html), (box.innerHTML = html);
  };
  document.addEventListener(
    'click',
    e => {
      const n = e.target.closest && e.target.closest('[data-zg-next],[data-zg-hide]');
      if (!n) return;
      e.preventDefault();
      e.stopPropagation();
      if (n.dataset.zgHide) {
        hidden.add(n.dataset.zgHide);
        return paint();
      }
      const pg = n.dataset.zgNext;
      if (S.ws == 'customer') {
        view = pg;
        location.hash = pg;
      } else {
        S.wp = S.wp || {};
        S.wp[S.ws] = pg;
        if (typeof save == 'function') save();
      }
      render();
      scrollTo(0, 0);
    },
    true
  );

  function paint() {
    try {
      if (!S.me) return;
      const L = todo();
      paintBadges(L);
      paintBanner(L);
      markRequired();
      paintSteps();
    } catch (e) {
      /* never break a redraw */
    }
  }
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(paint, 0);
    return out;
  };
  /* map suggestions and pins fill fields without events: keep the icons current */
  setInterval(() => (isBook() || isRent()) && paintSteps(), 1000);

  const css = document.createElement('style');
  css.textContent = `
.zg-st{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;margin-left:8px;font-size:12px;font-style:normal;font-weight:700;vertical-align:middle;cursor:help;flex:none}
.zg-st.ok{background:#16a34a;color:#fff}.zg-st.todo{background:#f59e0b;color:#fff}
label.zg-req::after{content:' *';color:#dc2626;font-weight:700}
.zg-hint{display:block;margin:4px 0 8px;color:#b45309;font-size:13px;line-height:1.35}
[aria-invalid="true"]{border-color:#f59e0b!important;box-shadow:0 0 0 3px rgba(245,158,11,.18)!important}
.zg-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;line-height:1;vertical-align:middle}
#zg-next{width:min(1072px,calc(100% - 32px));margin-left:auto!important;margin-right:auto!important;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 4px;padding:10px 14px;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:10px;background:#fffbeb;color:#78350f;font-size:15px;min-width:0;max-width:100%;box-sizing:border-box}
#zg-next .zg-txt{flex:1;min-width:180px}#zg-next .btn{margin:0}
#zg-next .zg-dot{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#f59e0b;color:#fff;font-weight:700;flex:none}
#zg-next .zg-x{border:0;background:none;color:#92400e;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px;margin:0}
@media (prefers-color-scheme: dark){#zg-next{background:#3a2a06;color:#fde68a;border-color:#a16207}#zg-next .zg-x{color:#fde68a}.zg-hint{color:#fbbf24}}`;
  document.head.appendChild(css);
})();
