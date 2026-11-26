/**
 * 30-turnover.js — driver → owner → ZamMove (bookings made from now on).
 *
 *   Driver Earnings   what they owe their owner (or the owner owes them), per trip, and "Turn over" with
 *                     history; a turnover the owner says never arrived can be contested.
 *   Owner Drivers     money from drivers to confirm, each driver's balance, and "Pay a driver".
 *   (The owner remits ZamMove's fee + commission weekly on Earnings → Remit to ZamMove.)
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const page = ws => (S.wp || {})[ws] || '';
  const when = t => (t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—');
  const place = (id, html, where) => {
    let box = document.getElementById(id);
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (!html) return box && box.remove();
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      box.style.cssText = 'min-width:0;max-width:100%';
      where(box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
  };
  const ST = { Submitted: ['Waiting for the owner', ''], Verified: ['Confirmed', 'g'], Rejected: ['Not received', 'r'], Disputed: ['Contested: ZamMove decides', ''] };
  const tag = s => `<span class="tag ${(ST[s] || [])[1] || ''}">${esc((ST[s] || [s])[0])}</span>`;

  /* ---------- driver ---------- */
  const driverCard = () => {
    const T = S.turn;
    if (!T || T.self || !(T.owners || []).length) return '';
    const mine = (S.pay || []).filter(p => p.kind == 'turnover' && p.payer == me()).slice().reverse(),
      paidMe = (S.pay || []).filter(p => p.kind == 'drv_pay' && p.to == me()).slice().reverse();
    const ownerRow = o => {
      const bal = +o.bal || 0,
        left = Math.round((bal - (+o.pending || 0)) * 100) / 100,
        k = esc(o.k);
      const head =
        bal > 0.005
          ? `You owe <b>${esc(o.name)}</b> <b>${peso(bal)}</b>${o.pending ? ` (${peso(o.pending)} sent, waiting for them to confirm)` : ''}.`
          : bal < -0.005
            ? `<b>${esc(o.name)}</b> owes you <b>${peso(-bal)}</b> (your share of fares paid to them by GCash).`
            : `You and <b>${esc(o.name)}</b> are even.`;
      return `<div class="zt2-own"><p style="font-size:16px;margin:0 0 8px">${head}</p>${
        left > 0.005
          ? `<div class="wsa"><input id="zt2-a-${k}" type="number" min="1" step="0.01" value="${left}" style="width:130px" aria-label="Amount"><select id="zt2-m-${k}" aria-label="Method"><option>Cash</option><option>GCash</option></select><input id="zt2-r-${k}" inputmode="numeric" placeholder="GCash ref (GCash only)" style="min-width:170px" aria-label="GCash reference"><button class="btn sm" data-a="zt2-send" data-k="${k}">Record turnover</button></div>${o.gcash ? `<p class="mu" style="font-size:13px;margin:4px 0 0">${esc(o.name)}’s GCash: <b class="n">${esc(o.gcash.no)}</b> (${esc(o.gcash.name)})</p>` : ''}`
          : ''
      }</div>`;
    };
    return `<section class="card zt2-card"><h2 style="font-size:20px;margin:0">Turn over to your owner</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">For each trip you keep your share (your % plus helper fees) and hand the rest to the owner of the vehicle you drove. The owner pays ZamMove its fee and commission.</p>${T.overdue ? '<div class="err" style="margin:0 0 8px">Overdue: you still owe an owner for a trip completed more than 7 days ago. You cannot take new jobs until you turn it over.</div>' : ''}${T.owners.map(ownerRow).join('')}${
      (T.trips || []).length
        ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Trips (${T.trips.length})</summary><table class="zt2-tb"><thead><tr><th>Done</th><th>Booking</th><th>Owner</th><th class="n">Fare</th><th class="n">You collected</th><th class="n">Your share</th><th class="n">To owner</th></tr></thead><tbody>${T.trips
            .slice()
            .reverse()
            .map(x => `<tr><td>${when(x.cd)}</td><td class="n">${esc(x.id)}</td><td>${esc(x.owner)}</td><td class="n">${peso(x.fare)}</td><td class="n">${peso(x.held)}</td><td class="n">${peso(x.share)}</td><td class="n">${peso(x.held - x.share)}</td></tr>`)
            .join('')}</tbody></table></details>`
        : ''
    }${
      mine.length || paidMe.length
        ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:600">History</summary>${mine
            .map(p => {
              const id = esc(p.id);
              return `<div class="zt2-row"><span>${when(p.t)} · turnover ${peso(p.amount)} · ${esc(p.method)}</span>${tag(p.status)}${
                p.status == 'Rejected' && !p.disp
                  ? `<div class="wsa" style="width:100%;margin:6px 0 0"><input id="zt2-dn-${id}" placeholder="How and when did you hand it over?" style="flex:1;min-width:200px"><button class="btn o sm" data-a="zt2-disp" data-id="${id}">I did hand it over</button></div>`
                  : ''
              }</div>`;
            })
            .join('')}${paidMe.map(p => `<div class="zt2-row"><span>${when(p.t)} · your owner paid you ${peso(p.amount)} · ${esc(p.method)}</span><span class="tag g">Received</span></div>`).join('')}</details>`
        : ''
    }</section>`;
  };

  /* ---------- owner ---------- */
  const ownerCard = () => {
    const L = S.drvBal || [],
      wait = (S.pay || []).filter(p => p.kind == 'turnover' && p.to == me() && p.status == 'Submitted'),
      nm = em => ((S.users || []).find(u => u.em == em) || {}).name || em;
    if (!L.length && !wait.length) return '';
    return `<section class="card zt2-card"><h2 style="font-size:20px;margin:0">Money from drivers${wait.length ? ` <span class="tag r">${wait.length}</span>` : ''}</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">Your drivers keep their share of each fare and hand you the rest. Confirm what you received. ZamMove’s fee and commission for these trips is in your weekly remittance (Earnings).</p>${wait
      .map(p => {
        const id = esc(p.id);
        return `<div class="zt2-row"><span><b>${esc(nm(p.payer))}</b> handed you <b>${peso(p.amount)}</b> · ${esc(p.method)}${p.method == 'GCash' ? ' ref <span class="n">' + esc(p.ref) + '</span>' : ''} · ${when(p.t)}</span><span class="wsa" style="margin:0"><button class="btn sm" data-a="zt2-ok" data-id="${id}" data-ok="1">Received</button><input id="zt2-on-${id}" placeholder="Reason, if not received" style="min-width:160px"><button class="btn o sm" data-a="zt2-ok" data-id="${id}" data-ok="0">Not received</button></span></div>`;
      })
      .join('')}${
      L.length
        ? `<table class="zt2-tb" style="margin-top:8px"><thead><tr><th>Driver</th><th class="n">Balance</th><th></th></tr></thead><tbody>${L.map(d => {
            const k = esc(d.em.replace(/[^a-z0-9]/gi, '_'));
            return `<tr><td>${esc(d.name)}${d.overdue ? ' <span class="tag r">Overdue</span>' : ''}</td><td class="n">${d.bal > 0.005 ? `owes you ${peso(d.bal)}` : d.bal < -0.005 ? `<b>you owe ${peso(-d.bal)}</b>` : 'even'}${d.pending ? `<br><small class="mu">${peso(d.pending)} to confirm</small>` : ''}</td><td>${
              d.bal < -0.005
                ? `<span class="wsa" style="margin:0;justify-content:flex-end"><input id="zt2-pa-${k}" type="number" value="${(-d.bal).toFixed(2)}" style="width:110px" aria-label="Amount"><select id="zt2-pm-${k}" aria-label="Method"><option>Cash</option><option>GCash</option></select><input id="zt2-pr-${k}" placeholder="GCash ref" style="width:130px" aria-label="Reference"><button class="btn sm" data-a="zt2-pay" data-em="${esc(d.em)}" data-k="${k}">Pay driver</button></span>`
                : ''
            }</td></tr>`;
          }).join('')}</tbody></table>`
        : ''
    }</section>`;
  };

  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a^="zt2-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      let r, okMsg;
      t.disabled = true;
      if (a == 'zt2-send') {
        const k = t.dataset.k;
        r = await ZAPI.act('turnover', { owner: k, amount: v('zt2-a-' + k), method: v('zt2-m-' + k), ref: v('zt2-r-' + k) });
        okMsg = 'Turnover recorded. Your owner is asked to confirm it.';
      }
      if (a == 'zt2-disp') (r = await ZAPI.act('turnoverDispute', { id, note: v('zt2-dn-' + id) })), (okMsg = 'Sent to ZamMove. You are told the decision.');
      if (a == 'zt2-ok') (r = await ZAPI.act('turnoverDecide', { id, ok: t.dataset.ok == '1', note: v('zt2-on-' + id) })), (okMsg = t.dataset.ok == '1' ? 'Confirmed.' : 'Marked as not received. The driver was told.');
      if (a == 'zt2-pay') {
        const k = t.dataset.k;
        r = await ZAPI.act('ownerPayDriver', { driver: t.dataset.em, amount: v('zt2-pa-' + k), method: v('zt2-pm-' + k), ref: v('zt2-pr-' + k) });
        okMsg = 'Payment recorded. The driver was told.';
      }
      t.disabled = false;
      if (!r) return;
      toast(r.ok ? okMsg : r.err);
      if (r.ok) {
        ['zt2-drv', 'zt2-own'].forEach(x => {
          const b = document.getElementById(x);
          if (b) b.dataset.h = '';
        });
        render();
      }
    },
    true
  );

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        const h1 = document.querySelector('#app h1');
        if (!S.me || !h1) return;
        const top = getComputedStyle(h1.parentElement).display.includes('flex') && h1.parentElement.id != 'app' ? h1.parentElement : h1;
        if (S.ws == 'driver' && page('driver') == 'earn') place('zt2-drv', driverCard(), b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'owner' && page('owner') == 'drv') place('zt2-own', ownerCard(), b => top.insertAdjacentElement('afterend', b));
      } catch (x) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zt2-card{margin:12px 0;min-width:0;max-width:100%;box-sizing:border-box;overflow-x:auto}.zt2-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--bd)}.zt2-tb{width:100%;border-collapse:collapse;font-size:13.5px}.zt2-tb th,.zt2-tb td{padding:6px 8px;border-bottom:1px solid var(--bd);text-align:left}.zt2-tb .n{text-align:right}.zt2-own{padding:8px 0;border-top:1px solid var(--bd)}`;
  document.head.appendChild(css);
  render();
})();
