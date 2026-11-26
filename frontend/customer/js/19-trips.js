/**
 * 19-trips.js — customer booking and trip screens from Figma ("NEW SCREENS: build these", B01 / C01–C24).
 *
 *   My bookings card (C01, C01c, C03, C03c, C04c, C06c, C07, C07b, C07c, C09, C21, C23, C24):
 *     reference + status pill, route, price and what is paid, a 9-stop "stamped" progress line with times,
 *     one action box that says what happens next (and holds the payment / rating form when it is the
 *     customer's turn), the driver row, and a confirm dialog before a cancellation fee.
 *   Track page (C05, C11, C15, C17, C19, C19c):
 *     header with status pill, a "Trip progress" timeline on the left, and on the right the existing
 *     Start PIN / Delivery PIN panel, the live map, a compact driver card with the plate and a payment bar.
 *
 * All actions reuse the existing handlers (pay, cancel, star, review, resub, trk, fx-prof), so the rules
 * stay on the server. Only the look changes. The track page reuses the panels other files build
 * (08-verification for PINs, 10-gps for the map) and moves them into the new layout after render.
 */
(() => {
  /* ---------- helpers ---------- */
  const hm = t => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const place = s => esc(String(s || '').split(',')[0]);
  const when = b => {
    const d = new Date(b.dt + 'T' + (b.tm || '00:00'));
    return isNaN(d)
      ? esc(b.dt + ' ' + (b.tm || ''))
      : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ', ' +
          d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  };
  const drvU = b => (b.drvUser && S.users.find(u => u.em == b.drvUser)) || null;
  const vehOf = b => (S.vh || []).find(v => v.id == b.veh) || {};
  const first = n => esc(String(n || 'Your driver').split(' ')[0]);
  const paid = (b, k) => ZPAY.sum(b.id, k);
  const sub = (b, k) => S.pay.find(p => p.bid == b.id && p.kind == k && p.status == 'Submitted');
  const evAt = (b, sts) => {
    const e = (b.ev || []).find(x => sts.includes(x.to));
    return e ? e.t : '';
  };
  const lastEv = b => (b.ev || [])[(b.ev || []).length - 1] || {};
  const rev = b => (S.rev || []).find(r => r.bid == b.id);
  const pill = (t, tone = 'wait') => `<span class="zb-pill ${tone}">${esc(t)}</span>`;
  const btn = (label, a, x = '', kind = 'pri') =>
    `<button class="zb-btn ${kind}" data-a="${a}" ${x}>${label}</button>`;
  const handedBack = b => b.st == 'Pending' && (b.hb || []).length && (b.hb[b.hb.length - 1].t || '') >= (b.cr || '');

  /* ---------- stages (9 stops on the card, 9 rows on the track page) ---------- */
  const STG = [
    ['Requested', ['Pending', 'No driver found']],
    ['Accepted', ['Accepted']],
    ['On the way', ['On the Way to Pickup']],
    ['Arrived at pickup', ['Awaiting Down Payment']],
    ['Down payment', ['Down Payment Confirmed']],
    ['Loaded', ['Items Loaded']],
    ['In transit', ['In Transit', 'Arrived at Destination']],
    ['Delivered', ['Delivery Confirmation', 'Awaiting Final Payment']],
    ['Completed', ['Completed']],
  ];
  const stageOf = b => STG.findIndex(s => s[1].includes(b.st));

  /* status pill: what the customer should know at a glance */
  const PILL = b => {
    const r = rev(b);
    return (
      {
        Pending: handedBack(b) ? ['Finding a new driver', 'wait'] : ['Looking for a driver', 'wait'],
        'No driver found': ['No driver found', 'bad'],
        Accepted: ['Driver assigned', 'ok'],
        'On the Way to Pickup': ['Driver on the way', 'ok'],
        'Awaiting Down Payment': sub(b, 'down') ? ['Waiting for driver to confirm', 'wait'] : ['Pay down payment', 'wait'],
        'Down Payment Confirmed': ['Down payment paid', 'ok'],
        'Items Loaded': ['Give your Start PIN', 'wait'],
        'In Transit': ['In transit', 'ok'],
        'Arrived at Destination': ['Give your Delivery PIN', 'wait'],
        'Delivery Confirmation': ['Delivered', 'ok'],
        'Awaiting Final Payment': sub(b, 'final') ? ['Waiting for driver to confirm', 'wait'] : ['Pay the balance', 'wait'],
        Completed: r ? ['Completed', 'ok'] : ['Rate your driver', 'wait'],
        Cancelled: ['Cancelled', 'bad'],
        Rejected: ['Rejected', 'bad'],
        Interrupted: ['Trip stopped', 'bad'],
      }[b.st] || [b.st, 'wait']
    );
  };

  /* the 9-stop progress line */
  const stamps = b => {
    const cur = stageOf(b),
      off = ['Cancelled', 'Rejected'].includes(b.st);
    return `<ol class="zb-prog" aria-label="Booking progress">${STG.map((s, i) => {
      const t = evAt(b, s[1]),
        st = off ? (t ? 'done' : 'todo') : i < cur || (i == cur && b.st == 'Completed') ? 'done' : i == cur ? 'now' : 'todo';
      return `<li class="${st}"${st == 'now' ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><b>${s[0]}</b><span class="n">${t && st != 'todo' ? hm(t) : '—'}</span>${st == 'now' ? '<em>Now</em>' : ''}</li>`;
    }).join('')}</ol>`;
  };

  /* payment box inside the action box: the customer chooses Cash, GCash, or part of each.
     GCash uses the same ids and action as the old form (the old "pay" handler runs); cash is handed to the
     driver, who records it and sends a receipt with the change. */
  const PM = [['cash', 'Cash'], ['gcash', 'GCash'], ['both', 'Cash + GCash']];
  const payBox = (b, k) => {
    const left = ZPAY.r2(ZPAY.due(b, k) - paid(b, k)),
      err = msg['b' + b.id] || '',
      m = msg['pm' + b.id] || 'cash',
      dn = first(drvU(b) && drvU(b).name) || 'the driver',
      half = ZPAY.r2(Math.round(left / 2));
    const pick = `<div class="zb-pm" role="radiogroup" aria-label="How will you pay?">${PM.map(
      ([v, l]) => `<button type="button" role="radio" aria-checked="${m == v}" class="${m == v ? 'on' : ''}" data-a="zb-pm" data-id="${b.id}" data-m="${v}">${l}</button>`
    ).join('')}</div>`;
    const payTo = b.payTo ? `<p class="zb-note zb-payto">Send GCash to the vehicle owner: <b class="n">${esc(String(b.payTo.no).replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))}</b> (${esc(b.payTo.name)}).</p>` : '';
    const ref = `${payTo}<div class="zb-fld"><label for="pr${b.id}">GCash reference no. (13 digits)</label><input id="pr${b.id}" inputmode="numeric" maxlength="13" placeholder="e.g. 7012398765432"${err ? ' class="is-bad" aria-invalid="true"' : ''}></div>`,
      shot = `<details class="zb-pf"><summary>Add a screenshot of the payment (optional)</summary><input type="file" accept="image/*" id="pp${b.id}"></details>`,
      fe = err ? `<p class="zb-fe" role="alert">${esc(err)}</p>` : '';
    const cashIn = (c, label) =>
      `<div class="zb-fld"><label for="cg${b.id}">${label}</label><div class="zb-peso"><span>₱</span><input id="cg${b.id}" type="number" min="${c}" step="0.01" value="${c}" data-cg="${b.id}" data-cash="${c}"></div></div><p class="zb-split" id="zb-chg-${b.id}">Exact amount: no change.</p>`;
    let body;
    if (m == 'cash')
      body = `<div class="zb-pay" data-left="${left}">${cashIn(left, `Cash you will hand ${esc(dn)} (₱${left} due)`)}${btn('Tell ' + esc(dn) + ' how I pay', 'zb-decl', `data-id="${b.id}" data-k="${k}" data-m="cash"`)}</div>${fe}<p class="zb-hint">${esc(dn)} enters the same amounts when collecting. If they differ, ${esc(dn)} must explain, and both versions are on your receipt.</p>`;
    else if (m == 'gcash')
      body = `<div class="zb-pay"><div class="zb-fld"><label for="pg${b.id}">GCash amount</label><div class="zb-peso"><span>₱</span><input id="pg${b.id}" type="number" min="0" step="0.01" value="${left}" readonly></div></div>${ref}${btn('Submit GCash reference', 'zb-decl', `data-id="${b.id}" data-k="${k}" data-m="gcash"`)}</div>${fe}${shot}<p class="zb-hint">Send ${peso(left)} by GCash, then enter the reference number. ${esc(dn)} checks it arrived.</p>`;
    else
      body = `<div class="zb-pay zb-pay3" data-left="${left}"><div class="zb-fld"><label for="pg${b.id}">GCash part</label><div class="zb-peso"><span>₱</span><input id="pg${b.id}" type="number" min="1" max="${left}" step="0.01" value="${half}" data-split="${b.id}"></div></div>${ref}<div class="zb-fld"><label>Cash part</label><div class="zb-peso"><span>₱</span><input id="pc${b.id}" type="number" value="${ZPAY.r2(left - half)}" readonly tabindex="-1"></div></div>${cashIn(ZPAY.r2(left - half), 'Cash you will hand over')}${btn('Tell ' + esc(dn) + ' how I pay', 'zb-decl', `data-id="${b.id}" data-k="${k}" data-m="both"`)}</div>${fe}${shot}<p class="zb-split" id="zb-split-${b.id}">Hand the other <b>${peso(ZPAY.r2(left - half))}</b> in cash to ${esc(dn)}. Total ${peso(left)}.</p>`;
    return `<p class="zb-pmq">How will you pay?</p>${pick}${body}`;
  };
  /* what the customer told the driver; they can change it until the driver records the payment */
  const declBox = (b, k) => {
    const d = (b.decl || {})[k];
    if (!d) return '';
    const dn = first(drvU(b) && drvU(b).name) || 'the driver';
    const rows = [
      d.g ? ['GCash', `${peso(d.g)} · ref <span class="n">${esc(d.ref)}</span>`] : null,
      d.c ? ['Cash part', peso(d.c)] : null,
      d.c ? ['Cash you hand over', peso(d.cg)] : null,
      d.c ? ['Change to get back', `<b>${peso(d.chg)}</b>`] : null,
    ].filter(Boolean);
    return `<div class="zb-decl"><b>You told ${esc(dn)}:</b><dl>${rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('')}</dl><p class="zb-note">${esc(dn)} enters the same amounts when collecting. If they differ, ${esc(dn)} must explain, and both versions go on your receipt.</p>${btn('Change how I pay', 'zb-redo', `data-id="${b.id}"`, 'sec')}</div>`;
  };
  const declared = (b, k) => !!((b.decl || {})[k]) && !msg['redo' + b.id];

  /* "Cash + GCash": the cash part updates as the GCash part is typed */
  document.addEventListener('input', e => {
    const id = e.target && e.target.dataset && e.target.dataset.split;
    if (!id) return;
    const box = e.target.closest('[data-left]'),
      left = +(box && box.dataset.left) || 0,
      g = Math.min(left, Math.max(0, +e.target.value || 0)),
      out = document.getElementById('zb-split-' + id),
      b = S.bk.find(x => x.id == id),
      dn = first(drvU(b) && drvU(b).name) || 'the driver';
    if (out) out.innerHTML = g >= left ? `That is the full amount: choose <b>GCash</b> instead.` : `Hand the other <b>${peso(ZPAY.r2(left - g))}</b> in cash to ${esc(dn)}. Total ${peso(left)}.`;
    const pc = document.getElementById('pc' + id),
      cg = document.getElementById('cg' + id),
      cash = ZPAY.r2(left - g);
    if (pc) pc.value = cash;
    if (cg) {
      cg.dataset.cash = cash;
      cg.min = cash;
      if (+cg.value < cash) cg.value = cash;
      chgLine(id);
    }
  });
  const chgLine = id => {
    const cg = document.getElementById('cg' + id),
      out = document.getElementById('zb-chg-' + id);
    if (!cg || !out) return;
    const cash = +cg.dataset.cash || 0,
      gave = +cg.value || 0;
    out.innerHTML = gave < cash ? `<b style="color:var(--err)">That is less than the ${peso(cash)} cash part.</b>` : gave == cash ? 'Exact amount: no change.' : `Your change: <b>${peso(ZPAY.r2(gave - cash))}</b>. It is on your receipt.`;
  };
  document.addEventListener('input', e => {
    const id = e.target && e.target.dataset && e.target.dataset.cg;
    if (id) chgLine(id);
  });

  /* star rating (uses the existing "star" and "review" actions) */
  const rateBox = b => {
    const n = msg['n' + b.id] || 0;
    return `<div class="zb-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => `<button data-a="star" data-id="${b.id}" data-n="${i}" role="radio" aria-checked="${n == i}" aria-label="${i} star${i > 1 ? 's' : ''}" class="${i <= n ? 'on' : ''}">${i <= n ? '★' : '☆'}</button>`).join('')}</div><div class="zb-fld" style="margin-top:12px"><label for="rt${b.id}">Comment (optional)</label><input id="rt${b.id}" placeholder="e.g. Careful with the fridge, arrived on time"></div><input type="hidden" id="sv${b.id}" value="">${msg['r' + b.id] ? `<p class="zb-fe" role="alert">${esc(msg['r' + b.id])}</p>` : ''}<div class="zb-acts" style="margin-top:12px">${btn('Submit rating', 'review', `data-id="${b.id}"`)}</div>`;
  };

  /* the cash still to hand over after a partial GCash payment ("Cash + GCash") */
  const cashLeft = (b, k, s) => {
    const rest = ZPAY.r2(ZPAY.due(b, k) - paid(b, k) - s.amount);
    return rest > 0.005 ? ` Hand the other <b>${peso(rest)}</b> in cash to ${esc(first((drvU(b) || {}).name) || 'the driver')}.` : '';
  };
  /* what happens next: title, text, tone, optional body, and the buttons under the box */
  const action0 = b => {
    const u = drvU(b),
      dn = first(u && u.name),
      fee = cancelFee(b),
      canCancel = CANCEL_OK.includes(b.st),
      cancel = canCancel ? btn(fee ? 'Cancel booking' : 'Cancel booking', 'cancel', `data-id="${b.id}"`, 'sec') : '',
      cnote = canCancel ? `<span class="zb-note">${fee ? peso(fee) + ' (10%) fee if you cancel now' : 'Free to cancel until the driver heads to your pickup'}</span>` : '',
      track = btn('Track trip', 'trk', `data-id="${b.id}"`),
      details = btn('View details', 'trk', `data-id="${b.id}"`);
    const A = (tone, h, p, body = '', acts = '') => ({ tone, h, p, body, acts });
    switch (b.st) {
      case 'Pending':
        if (handedBack(b)) {
          const x = b.hb[b.hb.length - 1],
            who = S.users.find(v => v.em == x.by);
          return A('bad', `${first(who && who.name)} cancelled at ${hm(x.t)} (${esc(x.reason)})`, 'We’re asking other nearby drivers now. You won’t be charged, and you can still cancel for free.', '', details + cancel + cnote);
        }
        return A('wait', 'Finding you a driver', `Nearby ${esc(b.vn)} drivers have been notified. If nobody accepts in time, we’ll ask if you want to change the time or vehicle.`, '', details + cancel + cnote);
      case 'No driver found':
        return A('bad', 'No driver accepted your booking', 'This time is busy. Send it to drivers again, book another time or a bigger vehicle, or cancel for free.', '', btn('Try again', 'resub', `data-id="${b.id}"`) + btn('Book another time', 'nav', 'data-v="book"', 'sec') + cancel);
      case 'Accepted':
        return A('ok', `${esc(u ? u.name : b.drv)} accepted at ${hm(evAt(b, ['Accepted']))}`, `${dn} will head to ${place(b.pu)} soon. Have your items ready and someone at the pickup address.`, '', track + cancel + cnote);
      case 'On the Way to Pickup':
        return A('ok', `${dn} is on the way to your pickup`, 'Have your items near the door and someone at the address. Follow the van live on the Track page.', '', track + cancel + cnote);
      case 'Awaiting Down Payment': {
        const s = sub(b, 'down');
        if (declared(b, 'down'))
          return A('wait', `Waiting for ${dn} to record your payment`, `Loading starts once ${dn} records it. This usually takes under 2 minutes.`, declBox(b, 'down'), track + cancel + cnote);
        return s && !msg['redo' + b.id]
          ? A('wait', `Waiting for ${dn} to confirm your GCash payment`, `You sent ${peso(s.amount)} with reference ${esc(s.ref)}${s.t ? ' at ' + hm(s.t) : ''}.${cashLeft(b, 'down', s)} Loading starts once ${dn} confirms. This usually takes under 2 minutes.`, '', track)
          : A('wait', `Pay the ${peso(ZPAY.due(b, 'down') - paid(b, 'down'))} down payment`, `${dn} arrived at ${hm(evAt(b, ['Awaiting Down Payment']))}. Pay in cash, or send it by GCash and enter the reference number. Loading starts once ${dn} confirms the payment.`, payBox(b, 'down'), track + cancel + cnote);
      }
      case 'Down Payment Confirmed': {
        const ps = S.pay.filter(x => x.bid == b.id && x.kind == 'down' && ZPAY.counted(x)),
          p = ps[ps.length - 1] || {},
          ms = [...new Set(ps.map(x => x.method))],
          g = ps.find(x => x.method == 'GCash'),
          how = ms.length > 1 ? 'cash and GCash payment' : ms[0] == 'GCash' ? `GCash payment${g && g.ref ? ' (ref ' + esc(g.ref) + ')' : ''}` : ms[0] == 'Cash' ? 'cash payment' : 'payment';
        return A('ok', `${peso(paid(b, 'down'))} received${p.t ? ' at ' + hm(p.t) : ''}`, `${dn} confirmed your ${how}. Next: ${dn} loads your items and runs the pre-departure checks.`, '', track);
      }
      case 'Items Loaded':
        return A('wait', `Give ${dn} your Start PIN`, 'Everything is loaded. Check the plate, confirm the items, then give your Start PIN so the trip can start.', '', btn('Show Start PIN', 'trk', `data-id="${b.id}"`));
      case 'In Transit':
        return A('ok', `On the way to ${place(b.dr)}`, 'When everything arrives, check your items and confirm with your Delivery PIN.', '', track);
      case 'Arrived at Destination':
        return A('wait', `${dn} arrived in ${place(b.dr)}`, `Check every item, then give ${dn} your Delivery PIN.`, '', btn('Show Delivery PIN', 'trk', `data-id="${b.id}"`));
      case 'Delivery Confirmation':
        return A('ok', 'Delivered and confirmed', `Delivery was confirmed with your Delivery PIN. ${dn} will ask for the balance next.`, '', track);
      case 'Awaiting Final Payment': {
        const s = sub(b, 'final');
        if (declared(b, 'final'))
          return A('wait', `Waiting for ${dn} to record your payment`, `The trip completes once ${dn} records it.`, declBox(b, 'final'), '');
        return s && !msg['redo' + b.id]
          ? A('wait', `Waiting for ${dn} to confirm your GCash payment`, `You sent ${peso(s.amount)} with reference ${esc(s.ref)}.${cashLeft(b, 'final', s)} The trip completes once ${dn} confirms.`, '', '')
          : A('wait', `Pay the ${peso(ZPAY.due(b, 'final') - paid(b, 'final'))} balance`, `Delivered${evAt(b, ['Delivery Confirmation']) ? ' at ' + hm(evAt(b, ['Delivery Confirmation'])) : ''} and confirmed with your Delivery PIN. Pay ${dn} in cash, or send it by GCash and enter the reference number.`, payBox(b, 'final'), '');
      }
      case 'Completed': {
        const r = rev(b);
        return r
          ? A('ok', `You rated ${dn} ${r.r} star${r.r > 1 ? 's' : ''}`, `${r.t && r.t != 'No comment' ? '“' + esc(String(r.t).replace(/[.\s]+$/, '')) + '.” ' : ''}Thanks for helping other customers choose.`, `<div class="zb-stars ro" aria-label="${r.r} of 5 stars">${'★'.repeat(r.r)}${'☆'.repeat(5 - r.r)}</div>`, btn('Book again', 'nav', 'data-v="book"', 'sec'))
          : A('wait', `How was your trip with ${dn}?`, `Your rating helps other customers and helps ${dn} get more trips.`, rateBox(b), '');
      }
      case 'Cancelled': {
        const e = lastEv(b),
          mine = e.by == S.me.em;
        return A('bad', `${mine ? 'You cancelled' : 'This booking was cancelled'}${e.t ? ' at ' + hm(e.t) : ''}`, b.cf ? `A ${peso(b.cf)} fee (10%) applies because the driver had already started. The driver was notified.` : 'No fee was charged.', '', btn('Book again', 'nav', 'data-v="book"', 'sec'));
      }
      case 'Rejected':
        return A('bad', 'This booking was rejected', esc(lastEv(b).note || 'Book again with another time or vehicle.'), '', btn('Book again', 'nav', 'data-v="book"', 'sec'));
      case 'Interrupted':
        return A('bad', 'The trip was stopped', 'ZamMove was alerted and will contact you. ' + esc(lastEv(b).note || ''), '', track);
    }
    return A('wait', esc(b.st), '', '', track);
  };

  /* change the date or time (free before the driver sets off), and the no-show fee with its dispute */
  const RESCH = ['Pending', 'No driver found', 'Accepted'];
  const action = b => {
    const x = action0(b);
    /* reservations and groups */
    if (b.pkg) {
      const rb = S.bk.find(y => y.id == b.pkg.ret);
      x.body += `<p class="zb-pkg">Reservation: we drop off on ${esc(b.dt)} and pick up on ${rb ? esc(rb.dt + ' ' + rb.tm) : 'the date you chose'} (${b.pkg.days} day${b.pkg.days > 1 ? 's' : ''} held at ${peso(b.pkg.holdFee)}/day = ${peso(b.pkg.hold)}). This price covers both trips.</p>`;
    }
    if (b.pkgOf) x.body += `<p class="zb-pkg">Prepaid pick-up of reservation <b class="n">${esc(b.pkgOf)}</b>: nothing to pay on this trip. Same driver and vehicle.</p>`;
    if (b.grp) {
      const n = S.bk.filter(y => y.grp == b.grp).length;
      x.body += `<p class="zb-pkg">Part of group <b class="n">${esc(b.grp)}</b>: ${n} booking${n > 1 ? 's' : ''} for one move.</p>`;
    }
    if (['Pending', 'Accepted', 'No driver found'].includes(b.st) && !b.pkgOf) x.acts += btn('Add a vehicle or drop-off', 'zx-more', `data-id="${b.id}"`, 'sec');
    if (window.ZREC) x.body += ZREC.card(b);
    /* the owner's discount, and every payment on this booking with the running balance */
    if (b.odisc) x.body += `<p class="zb-pkg">Owner discount: <b>−${peso(b.odisc.amt)}</b> (${esc(b.odisc.why)}). Your balance is lower.</p>`;
    const P = (S.pay || []).filter(p => p.bid == b.id && ['down', 'final'].includes(p.kind) && ['Recorded by driver', 'Verified', 'Submitted'].includes(p.status)).sort((a, c) => ((a.ct || a.t) < (c.ct || c.t) ? -1 : 1));
    if (P.length) {
      const due = ZPAY.r2((+b.tot || 0) - ((b.odisc && +b.odisc.amt) || 0));
      let run = 0;
      x.body += `<details class="zb-led"><summary>Payment history (${P.length}) · balance ${peso(Math.max(0, due - P.filter(p => p.status != 'Submitted').reduce((s, p) => s + p.amount, 0)))}</summary><table><thead><tr><th>When</th><th>What</th><th>Method</th><th class="n">Amount</th><th class="n">Balance</th></tr></thead><tbody>${P.map(p => {
        if (p.status != 'Submitted') run += p.amount;
        const t = p.ct || p.t;
        return `<tr><td>${t ? new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td><td>${p.kind == 'down' ? 'Down payment' : 'Balance'}${p.status == 'Submitted' ? ' (waiting)' : ''}</td><td>${esc(p.method)}${p.tx && p.tx.chg ? ` · change ${peso(p.tx.chg)}` : ''}</td><td class="n">${peso(p.amount)}</td><td class="n">${peso(Math.max(0, due - run))}</td></tr>`;
      }).join('')}</tbody></table></details>`;
    }
    if (RESCH.includes(b.st) && (b.resch || []).length < 3) {
      x.acts += btn('Change date or time', 'zb-rs', `data-id="${b.id}"`, 'sec');
      if (msg.rs == b.id) {
        const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
        x.body += `<div class="zb-rs"><b>New pickup time</b><div class="zb-rsf"><label>Date<input type="date" id="zb-rsd-${b.id}" min="${today}" value="${esc(b.dt)}"></label><label>Time<input type="time" id="zb-rst-${b.id}" value="${esc(b.tm)}"></label></div><p class="zb-note">Free.${b.drvUser ? ' Your driver keeps the job if they are free at the new time; otherwise it goes to other drivers.' : ''}</p><div class="err" id="zb-rse-${b.id}"></div><div class="zb-acts">${btn('Save new time', 'zb-rs-go', `data-id="${b.id}"`)}${btn('Close', 'zb-rs', 'data-id=""', 'sec')}</div></div>`;
      }
    }
    if (b.st == 'Cancelled' && b.cxl && b.cxl.noShow) {
      const fee = (S.pay || []).find(p => p.bid == b.id && p.kind == 'cancel_fee');
      x.h = 'Closed as a no-show';
      x.p = `Your driver waited at the pickup and you did not come out, so a ${peso(b.cf)} no-show fee (10%) applies. It goes to the driver.`;
      if (fee && fee.status == 'Waived') x.p = 'ZamMove reviewed it and waived the no-show fee.';
      else if (fee && fee.disp && !fee.disp.closed) x.body += '<p class="zb-note">You disputed this fee. ZamMove is reviewing it; you can still book meanwhile.</p>';
      else if (fee && fee.disp && fee.disp.closed) x.body += `<p class="zb-note">ZamMove reviewed your dispute: the fee stands. ${esc(fee.disp.closed.note)}</p>`;
      else if (fee && fee.status == 'Due')
        x.body += `<div class="zb-rs"><b>Was this wrong?</b><label for="zb-nsd-${b.id}" class="zb-note">For example, the driver went to the wrong address, or you were there.</label><textarea id="zb-nsd-${b.id}" rows="2" style="width:100%" placeholder="What happened?"></textarea><div class="err" id="zb-nse-${b.id}"></div><div class="zb-acts">${btn('Dispute the no-show', 'zb-nsd', `data-id="${b.id}"`, 'sec')}</div></div>`;
    }
    return x;
  };

  /* driver row on the card */
  /* who handles the cargo: the helpers the driver named (registered by the vehicle owner) */
  const drvRow = b => {
    const row = drvRow0(b),
      H = (b.helpers || []).map(x => esc(x.name));
    return row && H.length ? row + `<p class="zb-note zb-help">Helpers: <b>${H.join(', ')}</b></p>` : row && +b.mv > 0 && !['Completed', 'Cancelled', 'Rejected'].includes(b.st) ? row + `<p class="zb-note zb-help">Your ${b.mv} helper${b.mv > 1 ? 's are' : ' is'} named by the driver before departure.</p>` : row;
  };
  const drvRow0 = b => {
    const u = drvU(b);
    if (!u || ['Cancelled', 'Rejected'].includes(b.st)) return '';
    const v = vehOf(b),
      live = !['Completed'].includes(b.st);
    return `<div class="zb-drv"><span class="zb-av">${u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initials(u.name))}</span><div class="zb-dt"><b>${esc(u.name)} · verified driver</b><span>${esc([v.color, v.brand, v.model].filter(Boolean).join(' ') || b.vn)} · plate <b>${esc(v.plate || '—')}</b>${live && u.ph ? ' · ' + esc(u.ph) : ''}</span></div><div class="zb-acts">${btn('View profile', 'fx-prof', `data-id="${b.id}"`, 'sec sm')}${live && u.ph ? `<a class="zb-btn sec sm" href="tel:${esc(u.ph)}">Call</a>` : ''}</div></div>`;
  };

  /* booking details (what the old card showed under the summary) */
  const more = b =>
    `<details class="zb-more"><summary>Booking details</summary><dl><div><dt>Pickup</dt><dd>${esc(b.pu)}</dd></div><div><dt>Drop-off</dt><dd>${esc(b.dr)}</dd></div><div><dt>Items</dt><dd>${esc(b.it || '—')}</dd></div>${b.si ? `<div><dt>Instructions</dt><dd>${esc(b.si)}</dd></div>` : ''}<div><dt>Booked on</dt><dd>${b.cr ? new Date(b.cr).toLocaleDateString('en-PH') : '—'}</dd></div><div><dt>Down payment</dt><dd class="n">${peso(paid(b, 'down'))} of ${peso(ZPAY.due(b, 'down'))}</dd></div><div><dt>Balance</dt><dd class="n">${peso(paid(b, 'final'))} of ${peso(ZPAY.due(b, 'final'))}</dd></div>${b.disc ? `<div><dt>Discount</dt><dd class="n">−${peso(b.disc)}</dd></div>` : ''}${b.cf ? `<div><dt>Cancellation fee</dt><dd class="n">${peso(b.cf)}</dd></div>` : ''}</dl>${b.ph ? `<img src="${b.ph}" alt="Cargo photo" class="zb-photo">` : ''}</details>`;

  /* cancellation-fee confirmation (C03c) */
  const cancelDlg = b => {
    const u = drvU(b),
      fee = cancelFee(b);
    return `<div class="zb-ov" role="presentation"><div class="zb-dlg" role="alertdialog" aria-modal="true" aria-labelledby="zb-dh-${b.id}"><h3 id="zb-dh-${b.id}">Cancel this booking?</h3><p>${u ? first(u.name) + ' already started, so' : 'A driver already accepted, so'} a 10% cancellation fee of <b>${peso(fee)}</b> applies. ${u ? first(u.name) + ' will be told right away.' : ''} This can’t be undone.</p><div class="zb-acts">${btn('Keep booking', 'zb-keep', '', 'sec')}${btn('Cancel and pay ' + peso(fee), 'cancel', `data-id="${b.id}"`, 'dng')}</div></div></div>`;
  };

  const paidLine = b => {
    if (b.st == 'Completed') return 'Paid in full';
    if (b.st == 'Cancelled') return b.cf ? peso(b.cf) + ' cancellation fee' : 'Nothing charged';
    const d = paid(b, 'down'),
      f = paid(b, 'final');
    if (b.st == 'Awaiting Down Payment') return `Down <b>${peso(d)}</b> of ${peso(ZPAY.due(b, 'down'))}`;
    if (d + f <= 0) return 'Nothing paid yet';
    return `Paid <b>${peso(d + f)}</b> of ${peso(b.tot)}`;
  };

  /* ---------- the card ---------- */
  bcard = function (b) {
    const [pt, tone] = PILL(b),
      a = action(b);
    return `<article class="zb-card" id="bk-${esc(b.id)}"><div class="zb-top"><div><div class="zb-ref"><h2>${esc(b.id)}</h2>${pill(pt, tone)}</div><p class="zb-route">${place(b.pu)} → ${place(b.dr)}</p><p class="zb-meta">${esc(b.vn)} · ${when(b)}${b.mv ? ' · ' + b.mv + ' helper' + (b.mv > 1 ? 's' : '') : ''}${b.it ? ' · ' + esc(String(b.it).toLowerCase()) : ''}</p></div><div class="zb-price"><b class="n">${peso(b.tot)}</b><span>${paidLine(b)}</span></div></div>${stamps(b)}<div class="zb-act ${a.tone}"><h3>${a.h}</h3>${a.p ? `<p>${a.p}</p>` : ''}${a.body}</div>${drvRow(b)}${a.acts ? `<div class="zb-acts">${a.acts}</div>` : ''}${more(b)}${msg.cf == b.id ? cancelDlg(b) : ''}</article>`;
  };

  /* ---------- My bookings page ---------- */
  const _bookings = bookings;
  bookings = function () {
    const tab = msg.bt || 'act';
    if (tab == 'pay') return _bookings();
    const q = (msg.q || '').toLowerCase(),
      f = msg.f || '',
      l = S.bk
        .slice()
        .reverse()
        .filter(b => (tab == 'act') != done(b) && (!f || b.st == f) && (!q || (b.id + b.pu + b.dr).toLowerCase().includes(q)));
    const tabs = [
      ['act', 'Active'],
      ['past', 'Past'],
      ['pay', 'Payments'],
    ]
      .map(x => `<button class="zb-tab${tab == x[0] ? ' on' : ''}" data-a="bt" data-v="${x[0]}" aria-pressed="${tab == x[0]}">${x[1]}</button>`)
      .join('');
    const filt =
      S.bk.length > 3
        ? `<div class="zb-filt"><input placeholder="Search by reference or address" value="${esc(msg.q || '')}" data-a="q" aria-label="Search bookings"><select data-a="f" aria-label="Status"><option value="">All statuses</option>${[...FLOW, 'No driver found', 'Rejected', 'Cancelled'].map(s => `<option ${f == s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`
        : '';
    return `<div class="zb-page"><h1>My bookings</h1>${dlog()}<div class="zb-tabs">${tabs}</div>${filt}${
      l.length
        ? l.map(bcard).join('')
        : `<div class="zb-card zb-empty"><h2>${tab == 'act' ? 'No active bookings' : 'No past bookings yet'}</h2><p>${tab == 'act' ? 'Book a van or truck and your trip shows here, with every step from pickup to delivery.' : 'Finished and cancelled bookings show here.'}</p>${tab == 'act' ? btn('Book a haul', 'nav', 'data-v="book"') : ''}</div>`
    }</div>`;
  };

  /* ---------- Track page (C05, C11, C15, C17, C19, C19c) ---------- */
  const activeTrack = () => {
    const act = (S.bk || [])
      .filter(x => !['Cancelled', 'Rejected'].includes(x.st))
      .reverse()
      .sort((a, c) => (a.st == 'Completed') - (c.st == 'Completed'));
    return act.find(x => x.id == msg.tid) || act[0];
  };
  const ROWS = [
    ['Requested', ['Pending'], b => `You booked ${/^[aeiou]/i.test(b.vn) ? 'an' : 'a'} ${esc(b.vn)} for ${esc(b.tm || '')}`],
    ['Accepted', ['Accepted'], b => `${esc((drvU(b) || {}).name || b.drv || 'A driver')} accepted your booking`],
    ['On the way to pickup', ['On the Way to Pickup'], b => `${first((drvU(b) || {}).name)} left for ${place(b.pu)}`],
    ['Arrived at pickup', ['Awaiting Down Payment'], b => `${first((drvU(b) || {}).name)} arrived at your address`],
    [
      'Down payment confirmed',
      ['Down Payment Confirmed'],
      b => {
        const p = S.pay.filter(x => x.bid == b.id && x.kind == 'down' && ZPAY.counted(x)).pop();
        return p ? `${peso(paid(b, 'down'))} by ${p.method == 'Cash' ? 'cash' : 'GCash'}, confirmed by ${first((drvU(b) || {}).name)}` : '';
      },
    ],
    ['Loaded and checked', ['Items Loaded'], () => 'Start PIN, plate and cargo checklist passed'],
    ['In transit', ['In Transit'], b => `On the way to ${place(b.dr)}`],
    ['Delivered', ['Arrived at Destination', 'Delivery Confirmation'], () => 'Confirmed with your Delivery PIN'],
    ['Completed', ['Awaiting Final Payment', 'Completed'], () => 'Paid in full. Thank you!'],
  ];
  /* hint under the current row, and whether it is the customer's turn */
  const NOW = {
    Pending: () => ['Waiting for a driver to accept.', 0],
    Accepted: b => [`${first((drvU(b) || {}).name)} heads to your pickup soon.`, 0],
    'On the Way to Pickup': b => [`Have your items ready. ${first((drvU(b) || {}).name)} is on the way.`, 0],
    'Awaiting Down Payment': b => [sub(b, 'down') ? 'Waiting for the driver to confirm your payment.' : `Pay the ${peso(ZPAY.due(b, 'down'))} down payment.`, !sub(b, 'down')],
    'Down Payment Confirmed': () => ['Your items are being loaded.', 0],
    'Items Loaded': b => [b.ver && b.ver.pinOk ? 'Confirm the loaded items to authorize departure.' : 'Give the driver your <b>Start PIN</b> so the trip can start.', 1],
    'In Transit': () => ['Confirm with your Delivery PIN when everything arrives.', 0],
    'Arrived at Destination': () => ['Check your items, then give the driver your <b>Delivery PIN</b>.', 1],
    'Delivery Confirmation': () => ['Delivered. The balance is next.', 0],
    'Awaiting Final Payment': b => [sub(b, 'final') ? 'Waiting for the driver to confirm your payment.' : `Pay the ${peso(ZPAY.due(b, 'final'))} balance.`, !sub(b, 'final')],
    Completed: b => [rev(b) ? 'Thanks for rating your driver.' : 'Rate your driver on My bookings.', !rev(b)],
  };
  const rowIx = b => {
    const m = {
      Pending: 0,
      'No driver found': 0,
      Accepted: 1,
      'On the Way to Pickup': 2,
      'Awaiting Down Payment': 3,
      'Down Payment Confirmed': 4,
      'Items Loaded': 5,
      'In Transit': 6,
      'Arrived at Destination': 6,
      'Delivery Confirmation': 7,
      'Awaiting Final Payment': 8,
      Completed: 8,
    };
    return m[b.st] ?? 0;
  };
  const timeline = b => {
    const cur = rowIx(b),
      fin = b.st == 'Completed',
      [hint, turn] = (NOW[b.st] || (() => ['', 0]))(b);
    const upd = lastEv(b).t;
    return `<section class="zt-card zt-tl"><div class="zt-h"><h2>Trip progress</h2>${upd ? `<span class="n">Updated ${hm(upd)}</span>` : ''}</div><ol>${ROWS.map((r, i) => {
      const t = evAt(b, r[1]),
        st = i < cur || (fin && i == cur) ? 'done' : i == cur ? 'now' : 'todo';
      return `<li class="${st}"${st == 'now' ? ' aria-current="step"' : ''}><span class="zt-t n">${t && st != 'todo' ? hm(t) : '—'}</span><i aria-hidden="true"></i><div><b>${r[0]}</b><span>${st == 'now' ? hint : st == 'done' ? r[2](b) || '' : '—'}</span>${st == 'now' && turn ? '<em>Your turn</em>' : ''}</div></li>`;
    }).join('')}</ol></section>`;
  };
  /* the assigned vehicle's load limit and bed (from the owner's registration, else the type) and this load */
  const loadLine = (b, v) => {
    const ty = (typeof HV != 'undefined' && HV.find(x => x.id == (v.type || b.vid))) || {},
      kg = +v.kg || ty.kg,
      bed = v.bed || ty.bed;
    if (!kg) return '';
    const parts = [`Max load <b class="n">${kg.toLocaleString('en-PH')} kg</b>`];
    if (bed) parts.push(`bed ${bed[0]} × ${bed[1]}${bed[2] ? ' × ' + bed[2] : ''} ft${bed[2] ? '' : ' (open)'}`);
    if (b.wt) parts.push(`your load about <b class="n">${(+b.wt).toLocaleString('en-PH')} kg</b>`);
    return `<p class="zt-load">${parts.join(' · ')}</p>`;
  };
  const drvCardT = b => {
    const u = drvU(b);
    if (!u) return '';
    const v = vehOf(b),
      live = !done(b);
    return `<section class="zt-card zt-drv"><div class="zt-dr"><span class="zb-av lg">${u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initials(u.name))}</span><div><b>${esc(u.name)}</b> <span class="zb-pill ok">Verified driver</span><span class="zt-veh">${esc([v.color, v.brand, v.model].filter(Boolean).join(' ') || b.vn)}${v.year ? ' (' + esc(v.year) + ')' : ''}</span></div><div class="zt-plate"><b class="n">${esc(v.plate || '—')}</b><span>Check before loading</span></div></div>${loadLine(b, v)}<div class="zb-acts">${live && u.ph ? `<a class="zb-btn pri" href="tel:${esc(u.ph)}">Call ${esc(u.ph)}</a>` : ''}${btn('View profile', 'fx-prof', `data-id="${b.id}"`, 'sec')}</div></section>`;
  };
  const payCardT = b => {
    const p = paid(b, 'down') + paid(b, 'final'),
      pct = b.tot ? Math.min(100, Math.round((p / b.tot) * 100)) : 0,
      dn = first((drvU(b) || {}).name);
    const note =
      b.st == 'Completed'
        ? 'Paid in full'
        : paid(b, 'down') > 0
          ? 'Balance due after delivery · GCash or cash'
          : `${peso(ZPAY.due(b, 'down'))} down payment due when ${b.drvUser ? dn : 'the driver'} arrives · GCash or cash`;
    return `<section class="zt-card zt-pay"><div class="zt-h"><h2>Payment</h2><span>Paid <b class="n">${peso(p)}</b> of ${peso(b.tot)}</span></div><div class="zt-bar"><i style="width:${pct}%"></i></div><p>${note}</p></section>`;
  };
  const hintCard = b => {
    const a = action(b);
    return `<section class="zt-card zt-next ${a.tone}"><h2>${a.h}</h2>${a.p ? `<p>${a.p}</p>` : ''}${a.body}</section>`;
  };

  const layoutTrack = () => {
    const app = $('#app'),
      tk = app && app.querySelector('.tk');
    if (!tk || app.querySelector('.zt')) return;
    const b = activeTrack();
    if (!b) return;
    const [pt, tone] = PILL(b);
    const wrap = document.createElement('div');
    wrap.className = 'zt';
    wrap.innerHTML = `<div class="zt-head"><div class="zb-ref"><h1>${esc(b.id)}</h1>${pill(pt, tone)}</div><p>${place(b.pu)} → ${place(b.dr)} · ${esc(b.vn)} · booked for ${when(b)}</p></div><div class="zt-grid"><div class="zt-l">${timeline(b)}</div><div class="zt-r"></div></div>`;
    const L = wrap.querySelector('.zt-l'),
      R = wrap.querySelector('.zt-r');
    /* right column: PIN panels from 08-verification, or a "what's next" card */
    const panels = [...app.querySelectorAll(':scope > #vz, :scope > #dz, :scope > section.vz')],
      isDone = p => !!p.querySelector(':scope > .row .tag.g'),
      open = panels.filter(p => !isDone(p)),
      closed = panels.filter(isDone); // finished checks go to the bottom of the column
    if (open.length) open.forEach(p => R.appendChild(p));
    else R.insertAdjacentHTML('beforeend', hintCard(b));
    /* the live map block from 10-gps */
    const map = tk.querySelector('#zmap');
    if (map) {
      const blk = map.parentElement;
      blk.classList.add('zt-card', 'zt-map');
      R.appendChild(blk);
    }
    R.insertAdjacentHTML('beforeend', drvCardT(b) + payCardT(b));
    closed.forEach(p => R.appendChild(p));
    /* keep the extras from the old summary column (fare breakdown, report issue, share trip) */
    const g2 = tk.querySelector('.grid.g2');
    if (g2) {
      const col = g2.children[1];
      const keep = document.createElement('div');
      keep.className = 'zt-extra';
      if (col) [...col.children].forEach((c, i) => (i == 0 && c.classList.contains('card') ? null : keep.appendChild(c)));
      if (keep.children.length) R.appendChild(keep);
      g2.remove();
    }
    /* other trips list goes under the timeline */
    const aside = tk.querySelector('aside.tl2');
    if (aside && aside.querySelectorAll('[data-a="trk"]').length > 1) {
      aside.classList.add('zt-card', 'zt-trips');
      L.appendChild(aside);
    }
    tk.replaceWith(wrap);
    /* the map may have been created before it moved: let Leaflet re-measure */
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  };


  /* ---------- B01 Book a haul: numbered section cards and a "Your price" column ----------
     The form itself (autocomplete, map, live estimate, checklist) is built by 02/14/15/17; this only
     regroups the same elements, so every id and handler keeps working. */
  const layoutBook = () => {
    const g = $('#app .grid.g2.bk');
    if (!g || g.classList.contains('zk')) return;
    const left = g.children[0],
      right = g.children[1];
    if (!left || !right) return;
    g.classList.add('zk');
    const col = document.createElement('div');
    col.className = 'zk-l';
    let sec = null;
    [...left.childNodes].forEach(n => {
      const step = n.nodeType == 1 && n.classList.contains('rv-step'),
        num = step ? +((n.querySelector('span') || {}).textContent || 0) : 0;
      if (!sec || (step && num <= 4)) {
        sec = document.createElement('section');
        sec.className = 'zk-sec';
        col.appendChild(sec);
      }
      if (step && num > 4) n.classList.add('zk-subhead');
      sec.appendChild(n);
    });
    [...col.children].forEach(x => !x.children.length && !x.textContent.trim() && x.remove()); // only whitespace
    left.replaceWith(col);
    right.classList.add('zk-r');
    const h = right.querySelector('h2');
    if (h && /estimate/i.test(h.textContent)) h.textContent = 'Your price';
    /* "Pickup and drop-off are correct" sits right above the button, as in the design */
    const lc = document.getElementById('lc'),
      sb = right.querySelector('[data-a="submitbk"]');
    if (lc && sb) {
      const lab = lc.closest('label');
      if (lab) {
        lab.classList.add('zk-ok');
        sb.insertAdjacentElement('beforebegin', lab);
      }
      sb.insertAdjacentHTML('afterend', '<p class="zk-fine">Free to cancel until the driver heads to your pickup.</p>');
    }
    const sub = $('#app > p.mu');
    if (sub) sub.textContent = 'See the full price before you book. You pay half when the driver arrives, the rest after delivery.';
  };

  /* ---------- actions ----------
     on window (capture) so it runs before the older document-level handlers, which would toast instead */
  window.addEventListener(
    'click',
    e => {
      const t = e.target.closest('[data-a]');
      if (!t || !S.me) return;
      const a = t.dataset.a;
      if (a == 'zb-pm') {
        e.preventDefault();
        e.stopPropagation();
        msg['pm' + t.dataset.id] = t.dataset.m;
        msg['b' + t.dataset.id] = '';
        return render();
      }
      if (a == 'zb-redo') {
        e.preventDefault();
        e.stopPropagation();
        msg['redo' + t.dataset.id] = 1;
        return render();
      }
      if (a == 'zb-decl') {
        e.preventDefault();
        e.stopPropagation();
        const id = t.dataset.id,
          k = t.dataset.k,
          m = t.dataset.m,
          b = S.bk.find(x => x.id == id);
        if (!b) return;
        const left = ZPAY.r2(ZPAY.due(b, k) - paid(b, k)),
          num = x => +((document.getElementById(x + id) || {}).value || 0),
          g = m == 'cash' ? 0 : m == 'gcash' ? left : num('pg'),
          c = ZPAY.r2(left - g),
          f = (document.getElementById('pp' + id) || {}).files;
        t.disabled = true;
        new Promise(r => (f && f[0] ? img(f[0], r) : r(''))).then(pf =>
          ZAPI.act('payDeclare', { id, kind: k, g, c, cg: c ? num('cg') : 0, ref: ((document.getElementById('pr' + id) || {}).value || '').trim(), pf }).then(r => {
            t.disabled = false;
            msg['b' + id] = r.ok ? '' : r.err;
            if (r.ok) {
              msg['redo' + id] = 0;
              toast('Sent to your driver');
            }
            render();
          })
        );
        return;
      }
      if (a == 'zb-rs') {
        e.preventDefault();
        e.stopPropagation();
        msg.rs = t.dataset.id;
        return render();
      }
      if (a == 'zb-rs-go' || a == 'zb-nsd') {
        e.preventDefault();
        e.stopPropagation();
        const id = t.dataset.id;
        t.disabled = true;
        const call = a == 'zb-rs-go'
          ? ZAPI.act('reschedule', { id, dt: ($('#zb-rsd-' + id) || {}).value, tm: ($('#zb-rst-' + id) || {}).value })
          : ZAPI.act('noShowDispute', { id, note: (($('#zb-nsd-' + id) || {}).value || '').trim() });
        call.then(r => {
          t.disabled = false;
          if (!r.ok) {
            const x = $((a == 'zb-rs-go' ? '#zb-rse-' : '#zb-nse-') + id);
            if (x) x.textContent = r.err;
            return;
          }
          if (a == 'zb-rs-go') msg.rs = '';
          toast(a == 'zb-rs-go' ? (r.kept === false ? 'New time saved. Your driver is not free then, so other drivers are asked.' : 'New time saved') : 'Sent to ZamMove for review');
          render();
        });
        return;
      }
      if (a == 'zb-keep') {
        e.preventDefault();
        e.stopPropagation();
        msg.cf = 0;
        return render();
      }
      /* first tap on Cancel when a fee applies: show the confirm dialog instead of a toast */
      if (a == 'cancel' && view == 'bookings') {
        const b = S.bk.find(x => x.id == t.dataset.id);
        if (b && cancelFee(b) && msg.cf != b.id) {
          e.preventDefault();
          e.stopPropagation();
          msg.cf = b.id;
          render();
          setTimeout(() => $('.zb-dlg .zb-btn.sec')?.focus(), 30);
        }
      }
    },
    true
  );
  document.addEventListener('keydown', e => {
    if (e.key == 'Escape' && $('.zb-dlg')) $('[data-a="zb-keep"]').click();
  });

  /* phones: scroll each progress timeline to its current step; drop the edge fade at the end */
  const progScroll = () =>
    document.querySelectorAll('.zb-prog').forEach(ol => {
      if (ol.dataset.sc || ol.scrollWidth <= ol.clientWidth + 2) return;
      ol.dataset.sc = '1';
      const now = ol.querySelector('li.now') || [...ol.querySelectorAll('li.done')].pop();
      if (now) ol.scrollLeft = Math.max(0, now.offsetLeft - ol.offsetLeft - 72);
      const edge = () => ol.classList.toggle('end', ol.scrollLeft + ol.clientWidth >= ol.scrollWidth - 4);
      edge();
      ol.addEventListener('scroll', edge, { passive: true });
    });
  let rsT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(progScroll, 150);
  });

  /* ---------- render hook ---------- */
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    if (S.me && S.ws == 'customer' && view == 'track') layoutTrack();
    if (S.me && S.ws == 'customer' && view == 'book') layoutBook();
    setTimeout(progScroll, 0);
    return out;
  };
  render();
})();
