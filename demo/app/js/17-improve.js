/* 17-improve.js: screens for the rules added after the system review (every rule runs on the server).
 *  - codes reach only the simulated SMS/email inbox; "send a new code"
 *  - booking: how much is being moved (sets the smallest vehicle), an optional recipient, helpers capped per vehicle
 *  - customer: answer a driver's price correction, pay a cancellation fee, see a stopped trip or a refund
 *  - driver: company money on hand vs the limit, propose a price correction, report a problem or the customer
 */
(() => {
  const R = () =>
    S.rules || {
      MOV_MAX: { tw: 1, pk: 2, l3: 3, cv: 4, w6: 6 },
      SIZES: [
        { id: 'S', n: 'A few items (boxes, one appliance)', min: 'tw' },
        { id: 'M', n: 'Studio or one room', min: 'pk' },
        { id: 'L', n: 'Two to three rooms', min: 'l3' },
        { id: 'XL', n: 'Whole house or office', min: 'cv' },
      ],
      LATE_MIN: 30,
    };
  const me = () => (S.me && S.me.em) || '';
  const hvN = id => (HV.find(x => x.id == id) || { n: id }).n;
  const rank = id => HV.findIndex(x => x.id == id);
  const when = t => new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const bk = { sz: '', rn: '', rph: '' }; // booking form values kept across redraws
  const say = (m, good) => typeof toast == 'function' && toast(m);
  const DONE = ['Completed', 'Cancelled', 'Rejected'];
  const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;

  /* ---------- booking form ---------- */
  const bookExtras = () => {
    const it = document.getElementById('it');
    if (!it || document.getElementById('z7-sz')) return;
    const sizes = R().SIZES;
    it.insertAdjacentHTML(
      'afterend',
      `<div id="z7-bk" style="margin-top:12px"><label for="z7-sz">How much are you moving?</label><select id="z7-sz"><option value="">Choose…</option>${sizes.map(s => `<option value="${s.id}" ${bk.sz == s.id ? 'selected' : ''}>${esc(s.n)}</option>`).join('')}</select><div id="z7-szh" class="mu" style="font-size:13.5px;margin-top:4px"></div>
<details id="z7-rcp" style="margin-top:10px" ${bk.rn || bk.rph ? 'open' : ''}><summary style="cursor:pointer;min-height:36px;display:flex;align-items:center;font-weight:600">Someone else receives the items</summary><label for="z7-rn">Recipient’s full name</label><input id="z7-rn" value="${esc(bk.rn)}" autocomplete="off"><label for="z7-rph">Recipient’s mobile number</label><input id="z7-rph" inputmode="tel" placeholder="09XXXXXXXXX" value="${esc(bk.rph)}"><p class="mu" style="font-size:13.5px;margin:6px 0 0">They receive the Delivery PIN by SMS and confirm the delivery themselves.</p></details></div>`
    );
    sizeHint();
  };
  const sizeHint = () => {
    const h = document.getElementById('z7-szh');
    if (!h) return;
    const s = R().SIZES.find(x => x.id == bk.sz);
    if (!s) return (h.textContent = 'This decides the smallest vehicle that fits your load.');
    const small = typeof sel != 'undefined' && rank(sel.v) < rank(s.min);
    h.innerHTML = small
      ? `<span style="color:var(--err);font-weight:600">Too small: choose a ${esc(hvN(s.min))} or bigger.</span>`
      : `Smallest vehicle that fits: ${esc(hvN(s.min))}.`;
  };
  /* helpers: the driver brings them, at most a few per vehicle type; the fee is paid to the driver */
  const helperCap = () => {
    const mv = document.getElementById('mv');
    if (!mv || typeof sel == 'undefined') return;
    const cap = R().MOV_MAX[sel.v] || 0;
    if (+mv.value > cap) {
      mv.value = cap;
      const t = document.getElementById('tm2');
      if (t) t.textContent = cap;
      if (typeof upd == 'function') upd();
    }
    const tile = document.getElementById('tm2');
    const lab = tile && tile.parentElement && tile.parentElement.querySelector('span');
    if (lab && !lab.dataset.z7) {
      lab.dataset.z7 = 1;
      lab.textContent = 'Helpers';
    }
    if (tile && tile.parentElement && !tile.parentElement.querySelector('.z7-cap'))
      tile.insertAdjacentHTML('afterend', `<small class="z7-cap mu" style="display:block;font-size:12px">₱500 each · max ${cap} · paid to the driver</small>`);
    else if (tile) tile.parentElement.querySelector('.z7-cap').textContent = `₱500 each · max ${cap} · paid to the driver`;
  };
  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id == 'z7-rn') bk.rn = e.target.value;
    if (id == 'z7-rph') bk.rph = e.target.value;
  });
  document.addEventListener('change', e => {
    if (e.target.id == 'z7-sz') {
      bk.sz = e.target.value;
      sizeHint();
    }
  });
  /* the booking request carries the new fields */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) => {
    /* fill in only what the caller did not send (the booking form sends neither) */
    if (n == 'createBooking') {
      p = p || {};
      p = { ...p, sz: p.sz || bk.sz, rn: p.rn != null ? p.rn : bk.rn.trim(), rph: p.rph != null ? p.rph : bk.rph.trim() };
    }
    return _act(n, p).then(r => {
      if (n == 'createBooking' && r.ok) Object.assign(bk, { sz: '', rn: '', rph: '' });
      return r;
    });
  };

  /* ---------- customer: things waiting for them ---------- */
  const custCard = () => {
    const em = me(),
      out = [];
    (S.bk || [])
      .filter(b => b.cu == em)
      .forEach(b => {
        if (b.rq && !b.rq.ans && !DONE.includes(b.st))
          out.push(
            `<div class="z7-it"><b>Price correction for ${esc(b.id)}</b> ${tag('Your answer needed', 'r')}<p style="margin:6px 0">Your driver says: “${esc(String(b.rq.why).replace(/[.\s]+$/, ''))}.” New route ${esc(String(b.rq.pu).split(',')[0])} → ${esc(String(b.rq.dr).split(',')[0])}, ${b.rq.km} km. New price <b>${peso(b.rq.tot)}</b> (was ${peso(b.tot)}).</p><div class="wsa" style="margin-top:6px"><button class="btn sm" data-a="z7-rqa" data-id="${esc(b.id)}" data-v="1">Accept the new price</button><button class="btn sm o" data-a="z7-rqa" data-id="${esc(b.id)}" data-v="0">Decline and cancel free</button></div></div>`
          );
        if (b.st == 'Interrupted')
          out.push(`<div class="z7-it"><b>${esc(b.id)} is stopped</b> ${tag('Interrupted', 'r')}<p style="margin:6px 0 0">${esc((b.int || {}).why || '')} ZamMove is deciding the next step and will contact you.</p></div>`);
      });
    (S.pay || []).forEach(p => {
      if (p.kind == 'cancel_fee' && p.payer == em && p.status == 'Due')
        out.push(
          `<div class="z7-it"><b>Cancellation fee for ${esc(p.bid)}: ${peso(p.amount)}</b> ${tag('Due', 'r')}<p style="margin:6px 0">It goes to the driver who already travelled to you. New bookings are possible once it is paid.</p><div class="wsa" style="margin-top:6px;align-items:center"><select id="z7-fm-${esc(p.id)}" style="width:auto"><option>GCash</option><option>Cash</option></select><input id="z7-fr-${esc(p.id)}" placeholder="GCash reference (10–13 digits)" style="width:auto;flex:1 1 220px"><button class="btn sm" data-a="z7-fee" data-id="${esc(p.bid)}" data-p="${esc(p.id)}">Pay fee</button></div></div>`
        );
      if (p.kind == 'cancel_fee' && p.payer == em && p.status == 'Submitted')
        out.push(`<div class="z7-it"><b>Cancellation fee for ${esc(p.bid)}</b> ${tag('Waiting for the cashier')}</div>`);
      if (['refund', 'deposit_refund'].includes(p.kind) && p.to == em && p.status == 'Due')
        out.push(`<div class="z7-it"><b>Refund of ${peso(p.amount)} for ${esc(p.bid)}</b> ${tag('Being prepared')}<p style="margin:6px 0 0">The ZamMove cashier sends it to you; you are notified when it is paid.</p></div>`);
    });
    return out.length ? `<section class="card z7-card" style="margin:12px 0"><h2 style="font-size:20px">Needs your attention</h2>${out.join('')}</section>` : '';
  };

  /* ---------- driver: money on hand and trip tools ---------- */
  const cashBar = () => {
    const c = S.cash;
    if (!c) return '';
    const pct = Math.min(100, Math.round((c.held / (c.cap || 1)) * 100)),
      blocked = c.overdue || c.held >= c.cap;
    return `<section class="card z7-card" style="margin:12px 0"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><h2 style="font-size:20px;margin:0">Company money on hand</h2><b style="font-size:20px">${peso(Math.max(0, c.held))} <span class="mu" style="font-size:14px;font-weight:400">of ${peso(c.cap)} limit</span></b></div><div style="height:8px;border-radius:99px;background:var(--s2);margin:10px 0 8px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:${blocked ? 'var(--err)' : pct > 75 ? '#d97706' : 'var(--ac)'}"></i></div><p class="mu" style="margin:0;font-size:14px">${
      c.overdue
        ? '<b style="color:var(--err)">A remittance is overdue: you cannot accept new jobs until you remit.</b>'
        : c.held >= c.cap
          ? '<b style="color:var(--err)">Limit reached: remit to the cashier before accepting new jobs.</b>'
          : 'Collected fares minus your share, until the cashier receives your remittance.'
    }${c.credit ? ` Cancellation fees owed to you: ${peso(c.credit)} (deducted from your next remittance).` : ''}${c.strikes ? ` Late/no-show strikes: ${c.strikes}.` : ''}</p></section>`;
  };
  const placeOpts = cur => {
    const names = PL.map(p => p[0]);
    return [cur, ...names.filter(n => n != cur)].map(n => `<option ${n == cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  };
  const drvTools = () => {
    const em = me(),
      act = (S.bk || []).filter(b => b.drvUser == em && !DONE.includes(b.st) && b.st != 'Pending');
    if (!act.length) return '';
    return act
      .map(b => {
        const id = esc(b.id),
          early = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment'].includes(b.st),
          rqWait = b.rq && !b.rq.ans;
        const parts = [];
        if (b.rn) parts.push(`<p style="margin:6px 0 0"><b>Recipient:</b> ${esc(b.rn)} · ${esc(b.rph)} (they have the Delivery PIN)</p>`);
        if (b.st == 'Interrupted') parts.push(`<p style="margin:6px 0 0">${tag('Interrupted', 'r')} ${esc((b.int || {}).why || '')} An administrator decides the next step.</p>`);
        if (rqWait) parts.push(`<p style="margin:6px 0 0">${tag('Waiting for the customer')} Price correction to ${peso(b.rq.tot)} sent ${when(b.rq.t)}.</p>`);
        if (early && !rqWait)
          parts.push(
            `<details style="margin-top:8px"><summary style="cursor:pointer;min-height:36px;display:flex;align-items:center;font-weight:600">Locations don’t match the pins? Propose a corrected price</summary><div class="wsf"><div><label for="z7-pu-${id}">Actual pickup</label><select id="z7-pu-${id}">${placeOpts(b.pu)}</select></div><div><label for="z7-dr-${id}">Actual drop-off</label><select id="z7-dr-${id}">${placeOpts(b.dr)}</select></div></div><label for="z7-why-${id}">What does not match?</label><input id="z7-why-${id}" placeholder="e.g. the drop-off is in Vitali, not Putik"><div class="wsa"><button class="btn sm o" data-a="z7-rq" data-id="${id}">Send to the customer</button></div><p class="mu" style="font-size:13.5px;margin:6px 0 0">The customer accepts the new price or cancels at no charge.</p></details>`
          );
        if (b.st != 'Interrupted')
          parts.push(
            `<details style="margin-top:8px"><summary style="cursor:pointer;min-height:36px;display:flex;align-items:center;font-weight:600">Report a problem (breakdown, accident, cannot continue)</summary><label for="z7-pb-${id}">What happened?</label><textarea id="z7-pb-${id}" rows="2" style="width:100%" placeholder="e.g. flat tire on the bridge, cannot continue"></textarea><div class="wsa"><button class="btn sm d" data-a="z7-prob" data-id="${id}">Stop the trip and alert ZamMove</button></div></details>`
          );
        parts.push(
          `<details style="margin-top:8px"><summary style="cursor:pointer;min-height:36px;display:flex;align-items:center;font-weight:600">Report the customer (non-payment, conduct, unsafe cargo)</summary><div class="wsf"><div><label for="z7-ic-${id}">Category</label><select id="z7-ic-${id}"><option value="">Choose…</option><option>Customer did not pay</option><option>Customer conduct</option><option>Unsafe or illegal cargo</option><option>Damaged items</option><option>Vehicle accident</option><option>Other</option></select></div><div><label for="z7-is-${id}">Severity</label><select id="z7-is-${id}"><option>Low</option><option selected>Medium</option><option>High</option></select></div></div><label for="z7-id-${id}">Describe it</label><textarea id="z7-id-${id}" rows="2" style="width:100%"></textarea><div class="wsa"><button class="btn sm o" data-a="z7-inc" data-id="${id}">Send report</button></div></details>`
        );
        return `<section class="card z7-card" style="margin:12px 0"><h2 style="font-size:20px;margin:0">Trip tools · <span class="n">${id}</span></h2><div class="mu" style="font-size:14px">${esc(b.st)} · ${esc(String(b.pu).split(',')[0])} → ${esc(String(b.dr).split(',')[0])}</div>${parts.join('')}</section>`;
      })
      .join('');
  };

  /* ---------- after every redraw ---------- */
  const typing = () => {
    const a = document.activeElement;
    return a && a.id && /^z7-/.test(a.id);
  };
  const after = () => {
    if (!S.me) return;
    bookExtras();
    helperCap();
    const app = document.getElementById('app');
    if (!app) return;
    /* build the cards for this page; redraw only when they changed (keeps what the user is typing) */
    const ws = S.ws || 'customer';
    let html = '',
      top = false;
    if (ws == 'customer' && ['home', 'bookings', 'track'].includes(typeof view != 'undefined' ? view : '')) {
      html = custCard();
      top = true; // above the page (the home page starts with a large hero)
    }
    if (ws == 'driver') {
      const pg = (S.wp || {}).driver || 'dash';
      html = drvTools() + (['dash', 'earn', 'req'].includes(pg) ? cashBar() : '');
    }
    const box = app.querySelector(':scope > .z7-box, .z7-box');
    if (box && box.dataset.h == html) return;
    if (box) box.remove();
    if (!html) return;
    const el = document.createElement('div');
    el.className = 'z7-box';
    el.dataset.h = html;
    el.innerHTML = html;
    const h1 = app.querySelector('h1');
    if (top || !h1) app.insertAdjacentElement('afterbegin', el);
    else h1.insertAdjacentElement('afterend', el);
  };
  /* other layers redraw parts of the page on their own: put the cards back when they disappear */
  let pend = 0;
  const watch = () => {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(() => {
      if (pend) return;
      pend = requestAnimationFrame(() => {
        pend = 0;
        if (typing()) return;
        try {
          after();
        } catch (e) {
          console.error('[zammove 17]', e);
        }
      });
    }).observe(app, { childList: true });
  };
  if (document.readyState == 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
  const _r = render;
  render = function () {
    _r.apply(this, arguments);
    try {
      after();
    } catch (e) {
      console.error('[zammove 17]', e);
    }
  };

  /* ---------- actions ---------- */
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      const a = t.dataset.a;
      if (a == 'zinbox') {
        e.preventDefault();
        e.stopPropagation();
        const to = t.dataset.to || '';
        if (window.ZM_DEMO_INBOX) return window.ZM_DEMO_INBOX(to);
        return window.open('../inbox/?to=' + encodeURIComponent(to), '_blank', 'noopener');
      }
      if (!/^z7-|^zresend$/.test(a)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = t.dataset.id,
        run = async (p, ok) => {
          t.disabled = true;
          const r = await p;
          t.disabled = false;
          say(r.ok ? ok : r.err);
          if (r.ok) render();
          return r;
        };
      if (a == 'zresend') return run(ZAPI.act('resendCode'), 'A new code was sent to your phone (simulated inbox).');
      if (a == 'z7-rqa') return run(ZAPI.act('requoteAnswer', { id, accept: t.dataset.v == '1' }), t.dataset.v == '1' ? 'New price accepted.' : 'Booking cancelled at no charge.');
      if (a == 'z7-fee') {
        const pid = t.dataset.p;
        return run(ZAPI.act('payCancelFee', { id, method: v('z7-fm-' + pid), ref: v('z7-fr-' + pid) }), 'Payment sent. The cashier verifies it.');
      }
      if (a == 'z7-rq') return run(ZAPI.act('requote', { id, pu: v('z7-pu-' + id), dr: v('z7-dr-' + id), reason: v('z7-why-' + id) }), 'Sent to the customer.');
      if (a == 'z7-prob') return run(ZAPI.act('tripProblem', { id, reason: v('z7-pb-' + id) }), 'Trip stopped. ZamMove was alerted.');
      if (a == 'z7-inc') {
        const w = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 16);
        return run(ZAPI.act('createIncident', { bid: id, cat: v('z7-ic-' + id), sev: v('z7-is-' + id), w, d: v('z7-id-' + id) }), 'Report sent to ZamMove.');
      }
    },
    true
  );
  /* helpers: re-check the cap after the stepper or a vehicle change */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-a="mvs"],[data-a="pick"]');
    if (t) setTimeout(() => (helperCap(), sizeHint()), 0);
  });
  /* keep driver tools open while typing: skip redraws triggered by polling */
  window.ZM_TYPING_Z7 = typing;

  const css = document.createElement('style');
  css.textContent = `.z7-it{padding:12px 0;border-top:1px solid var(--s2)}.z7-it:first-of-type{border-top:0}.z7-card .wsa select,.z7-card .wsa input{min-height:38px}`;
  document.head.appendChild(css);
})();
