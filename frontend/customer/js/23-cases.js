/**
 * 23-cases.js — accidents and incident cases for the people on a trip (customer, driver, vehicle owner).
 *
 *   Accident or emergency: on every trip in progress, a red card asks "Is anyone hurt?", offers Call 911,
 *   and sends one report that stops the trip and alerts ZamMove, the others on the trip and the owner.
 *   Cases about your trips: every case you are involved in, with its status, what ZamMove asks of you
 *   (a statement, or evidence when requested) and the decision when it is made.
 *
 * The cards go into the same box 17-improve builds (window.ZM_CASES), so they survive redraws by other
 * layers and keep what you type. Inputs use z7- ids for that reason. The server decides everything.
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const R = () => S.rules || {};
  const DONE = ['Completed', 'Cancelled', 'Rejected'];
  const LIVE = b => b.drvUser && !DONE.includes(b.st) && !['Pending', 'No driver found'].includes(b.st);
  const tagH = (t, tone) => `<span class="tag ${tone || ''}">${esc(t)}</span>`;
  const when = t => (t ? new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const sum = x => `<summary style="cursor:pointer;min-height:40px;display:flex;align-items:center;font-weight:600">${x}</summary>`;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  /* up to five photos from one file input */
  const photos = id => {
    const f = [...((document.getElementById(id) || {}).files || [])].slice(0, 5);
    return Promise.all(f.map(x => new Promise(r => img(x, r))));
  };

  /* ---------- accident / emergency ---------- */
  const emergencyCard = b => {
    const id = esc(b.id),
      open = (S.inc || []).some(c => c.kind == 'accident' && c.bid == b.id && c.by == me() && !['Closed', 'Withdrawn'].includes(c.st));
    if (open)
      return `<section class="card z23-em sent" style="margin:12px 0"><h2 style="font-size:19px;margin:0">Accident reported on <span class="n">${id}</span></h2><p style="margin:6px 0 0">ZamMove, the people on this trip and the vehicle owner were alerted. Stay safe; an administrator will call you. Follow the case below.</p><div class="wsa"><a class="btn d" href="tel:911">Call 911</a></div></section>`;
    return `<section class="card z23-em" style="margin:12px 0"><details>${sum(`<span>Accident or emergency on <span class="n">${id}</span>?</span>`)}<p style="margin:4px 0 10px"><b>If anyone is hurt or in danger, call 911 first.</b> Then send this report: it stops the trip and alerts ZamMove, ${
      b.drvUser == me() ? 'the customer' : 'the driver'
    } and the vehicle owner at once.</p><div class="wsa" style="margin:0 0 10px"><a class="btn d" href="tel:911">Call 911</a></div><fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Is anyone hurt?</legend><div class="z23-seg">${[
      ['yes', 'Yes'],
      ['no', 'No'],
      ['unsure', 'Not sure'],
    ]
      .map(([k, l]) => `<label><input type="radio" name="z7-eh-${id}" id="z7-eh-${id}-${k}" value="${k}"> ${l}</label>`)
      .join('')}</div></fieldset><label for="z7-ed-${id}">What happened?</label><textarea id="z7-ed-${id}" rows="3" style="width:100%" placeholder="e.g. A jeepney hit the van at the Tetuan crossing; the cargo is safe"></textarea><div class="wsf"><div><label for="z7-ep-${id}">Photos (up to 5)</label><input id="z7-ep-${id}" type="file" accept="image/*" multiple></div><div><label for="z7-eb-${id}">Police blotter no. (if any)</label><input id="z7-eb-${id}" placeholder="You can add it later in your statement"></div></div><div class="wsa"><button class="btn d" data-a="z23-em" data-id="${id}">Send emergency report</button></div></details></section>`;
  };

  /* ---------- cases about my trips ---------- */
  const ROLE = c => ((c.parties || []).find(p => p.em == me()) || {}).role || (c.by == me() ? 'reporter' : '');
  const caseCard = c => {
    const id = esc(c.id),
      role = ROLE(c),
      decided = ['Decision recorded', 'Closed'].includes(c.st),
      mine = (c.stmts || {})[me()],
      askedMe = c.st == 'Evidence requested' && (c.ask || []).includes(me()) && !(c.evid || []).some(x => x.by == me() && x.t >= c.askT),
      req = [...(c.log || [])].reverse().find(l => l.act == 'evidence'),
      dec = [...(c.log || [])].reverse().find(l => l.act == 'decide');
    const tone = decided ? '' : c.st == 'Evidence requested' && askedMe ? 'r' : 'w';
    const out = c.out
      ? [c.out.refund && peso(c.out.refund) + ' refund to the customer', c.out.charge && peso(c.out.charge) + ' charged to the driver', c.out.strike && 'a strike for the driver', c.out.suspend && 'the driver is suspended'].filter(Boolean)
      : [];
    const parts = [
      `<p style="margin:6px 0 0">${c.by == me() ? (c.st == 'Unconfirmed' ? 'Your report' : 'You reported') : 'Reported by the ' + esc(((c.parties || []).find(p => p.em == c.by) || {}).role || 'other party')}: “${esc(c.d || '')}”</p>`,
    ];
    /* a draft: only the reporter sees it until they confirm it */
    if (c.st == 'Unconfirmed') {
      parts.push(
        `<div class="z23-draft"><b>Not sent yet.</b> Only you can see this report. Check it, then send it to ZamMove and the people on the trip, or dismiss it if it was a mistake. If you do nothing, it is discarded after 24 hours.<div class="wsa" style="margin-top:8px"><button class="btn sm" data-a="z23-ok" data-id="${id}">Confirm and send</button><button class="btn o sm" data-a="z23-dm" data-id="${id}">Dismiss</button></div></div>`
      );
      return `<div class="z7-it"><b>${esc(c.cat || 'Report')} · <span class="n">${esc(c.bid || '')}</span></b> ${tagH('Not sent yet', 'w')}<div class="mu" style="font-size:13.5px">${id} · drafted ${when(c.t)}</div>${parts.join('')}</div>`;
    }
    if (c.st == 'Withdrawn')
      return `<div class="z7-it"><b>${esc(c.cat || 'Report')} · <span class="n">${esc(c.bid || '')}</span></b> ${tagH('Withdrawn')}<div class="mu" style="font-size:13.5px">${id} · ${c.by == me() ? 'you withdrew it' : 'withdrawn by the reporter'} ${when((c.wd || {}).t)}</div>${(c.wd || {}).why ? `<p style="margin:6px 0 0">Reason: “${esc(c.wd.why)}”</p>` : ''}</div>`;
    if (askedMe)
      parts.push(
        `<div class="z23-ask"><b>ZamMove asks you for evidence:</b> ${esc((req || {}).note || '')}<div class="wsf"><div><label for="z7-vp-${id}">Photos (up to 5)</label><input id="z7-vp-${id}" type="file" accept="image/*" multiple></div><div><label for="z7-vn-${id}">Note</label><input id="z7-vn-${id}" placeholder="What the photos show, or other evidence"></div></div><div class="wsa"><button class="btn sm" data-a="z23-ev" data-id="${id}">Send evidence</button></div></div>`
      );
    else if (c.st == 'Evidence requested' && (c.ask || []).includes(me())) parts.push(`<p class="mu" style="margin:6px 0 0">Your evidence was sent. ZamMove is reviewing it.</p>`);
    if (!decided)
      parts.push(
        `<details style="margin-top:8px"${mine ? '' : ' open'}>${sum(mine ? 'Your statement (sent ' + when(mine.t) + ') · update it' : 'Give your statement')}<p class="mu" style="margin:0 0 6px">Your own account of what happened. Only ZamMove reads it.</p><textarea id="z7-st-${id}" rows="3" style="width:100%" placeholder="What happened, in your own words. Include a police blotter number if there is one.">${esc(mine ? mine.text : '')}</textarea><div class="wsf"><div><label for="z7-sp-${id}">Photos (optional, up to 5)</label><input id="z7-sp-${id}" type="file" accept="image/*" multiple></div></div><div class="wsa"><button class="btn sm o" data-a="z23-st" data-id="${id}">${mine ? 'Update statement' : 'Send statement'}</button></div></details>`
      );
    if (!decided && c.by == me() && c.kind != 'accident')
      parts.push(
        `<details style="margin-top:8px">${sum('Withdraw this report')}<p class="mu" style="margin:0 0 6px">If it was a mistake, withdraw it. Everyone involved is told, and any flag it caused is lifted. You can withdraw until ZamMove decides.</p><input id="z7-wd-${id}" maxlength="300" placeholder="Why? e.g. I miscounted, the change was correct"><div class="wsa" style="margin-top:8px"><button class="btn o sm" data-a="z23-wd" data-id="${id}">Withdraw report</button></div></details>`
      );
    if (decided && c.decision)
      parts.push(`<div class="z23-dec"><b>ZamMove’s decision:</b> ${esc(c.decision || (dec || {}).note || '')}${out.length ? `<br><b>Outcome:</b> ${out.join(', ')}.` : ''}</div>`);
    return `<div class="z7-it"><b>${esc(c.cat || 'Report')} · <span class="n">${esc(c.bid || '')}</span></b> ${tagH(c.st, tone)} ${c.kind == 'accident' ? tagH('Accident', 'r') : ''}<div class="mu" style="font-size:13.5px">${id} · you are the ${esc(role)} · opened ${when(c.t)}</div>${parts.join('')}</div>`;
  };
  const casesCard = () => {
    const L = (S.inc || []).filter(
      c => c.kind != 'change' && c.kind != 'owner-report' && !(c.wd && c.wd.draft) && (c.by == me() || (c.parties || []).some(p => p.em == me())) && (!['Closed', 'Withdrawn'].includes(c.st) || Date.now() - new Date(c.t).getTime() < 7 * 864e5)
    );
    if (!L.length) return '';
    return `<section class="card z7-card" style="margin:12px 0"><h2 style="font-size:20px;margin:0">Cases about your trips</h2><p class="mu" style="margin:4px 0 0;font-size:14px">ZamMove reviews every report before deciding. Nobody is penalized from a report alone.</p>${L.slice().reverse().map(caseCard).join('')}</section>`;
  };

  /* ---------- rentals: the next step of each open rental, so it is visible outside the Rent page ---------- */
  const rentalsCard = () => {
    const L = (S.rn || []).filter(r => r.cu == me() && ['Pending', 'Approved', 'Active', 'Returned'].includes(r.st));
    if (!L.length) return '';
    const veh = r => {
      const v = (S.vh || []).find(x => x.id == r.veh) || {};
      return [v.brand, v.model].filter(Boolean).join(' ') || r.vn || 'Rental vehicle';
    };
    const row = r => {
      const pays = (S.pay || []).filter(p => p.bid == r.id && ['rental', 'deposit'].includes(p.kind)),
        paid = pays.filter(p => p.status == 'Verified').reduce((t, p) => t + p.amount, 0),
        waiting = pays.some(p => p.status == 'Submitted'),
        due = Math.max(0, Math.round((+r.tot + (+r.dep || 2000) - paid) * 100) / 100),
        sg = (r.ct && r.ct.sg) || {};
      let st, tone, msg;
      if (r.st == 'Pending') [st, tone, msg] = ['Waiting for the owner', 'w', 'The owner reviews your request and documents. You are notified when it is approved.'];
      else if (r.st == 'Approved') {
        const todo = [!sg.cu && 'sign the rental contract', due > 0.005 && !waiting && `pay ${peso(due)} (rental and deposit)`].filter(Boolean);
        if (todo.length) [st, tone, msg] = ['Your action needed', 'r', `Approved. Before pickup on ${esc(r.s)}, ${todo.join(' and ')}.`];
        else if (waiting) [st, tone, msg] = ['Payment being verified', 'w', 'A cashier is verifying your payment.'];
        else if (!sg.ow) [st, tone, msg] = ['Waiting for the owner to sign', 'w', 'You signed the contract and paid. The owner signs before releasing the vehicle.'];
        else [st, tone, msg] = ['Ready for pickup', '', `Signed and paid. Pick it up on ${esc(r.s)}; the owner records the photos and readings at release.`];
      } else if (r.st == 'Active' && r.rq && r.rq.redo) [st, tone, msg] = ['Retake the return photos', 'r', `The owner asked you to submit the return again: ${esc(r.rq.redo.note)}`];
      else if (r.st == 'Active' && r.rq) [st, tone, msg] = ['Return submitted', 'w', 'The owner is checking the vehicle against your photos and will mark it returned.'];
      else if (r.st == 'Active') {
        const check = !!r.out && !r.out.cu; // the renter has not answered the release record yet
        [st, tone, msg] = [check ? 'Check the handover record' : 'On rent', check ? 'r' : '', `${check ? 'Confirm the release photos and readings, or report a difference. ' : ''}Return it by ${esc(r.e)}, 6 PM, and keep location sharing on while driving. When you are done, press Return the vehicle in My rentals.`];
      } else if (r.back && !r.back.cu) [st, tone, msg] = ['Check the return record', 'r', 'Confirm the return photos and readings, or report a difference. The owner then completes the rental and your deposit refund follows.'];
      else [st, tone, msg] = ['Returned', 'w', 'The owner completes the rental next; your deposit refund follows.'];
      return `<div class="z7-it"><b>${esc(veh(r))} · <span class="n">${esc(r.id)}</span></b> ${tagH(st, tone)}<p style="margin:6px 0">${msg}</p><div class="wsa" style="margin-top:6px"><button class="btn sm${tone == 'r' ? '' : ' o'}" data-a="nav" data-v="rent">Open My rentals</button></div></div>`;
    };
    return `<section class="card z7-card" style="margin:12px 0"><h2 style="font-size:20px;margin:0">Your rentals</h2>${L.map(row).join('')}</section>`;
  };

  window.ZM_CASES = (ws, view) => {
    if (!S.me) return {};
    const em = me();
    if (ws == 'customer' && view == 'reports') return { top: casesCard() }; // your cases live on the Report page
    if (ws == 'customer' && view == 'bookings') return { top: rentalsCard() };
    if (ws == 'driver') {
      return { top: casesCard() };
    }
    if (ws == 'owner') return { top: casesCard() };
    return {};
  };

  /* ---------- actions ---------- */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="z23-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      t.disabled = true;
      let r, okMsg;
      if (a == 'z23-em') {
        const hurt = (document.querySelector(`input[name="z7-eh-${id}"]:checked`) || {}).value || '';
        r = await ZAPI.act('emergency', { bid: id, hurt, d: v('z7-ed-' + id), blot: v('z7-eb-' + id), phs: await photos('z7-ep-' + id) });
        okMsg = 'Emergency report sent. ZamMove and everyone on the trip were alerted.';
      }
      if (a == 'z23-ok') {
        r = await ZAPI.act('caseConfirm', { id });
        okMsg = 'Report sent to ZamMove.';
      }
      if (a == 'z23-dm') {
        r = await ZAPI.act('caseWithdraw', { id });
        okMsg = 'Report dismissed. Nobody saw it.';
      }
      if (a == 'z23-wd') {
        r = await ZAPI.act('caseWithdraw', { id, why: v('z7-wd-' + id) });
        okMsg = 'Report withdrawn. Everyone involved was told.';
      }
      if (a == 'z23-st') {
        r = await ZAPI.act('caseStatement', { id, text: v('z7-st-' + id), phs: await photos('z7-sp-' + id) });
        okMsg = 'Statement sent to ZamMove.';
      }
      if (a == 'z23-ev') {
        r = await ZAPI.act('caseEvidence', { id, note: v('z7-vn-' + id), phs: await photos('z7-vp-' + id) });
        okMsg = 'Evidence sent to ZamMove.';
      }
      t.disabled = false;
      if (!r) return;
      toast(r.ok ? okMsg : r.err);
      if (r.ok) {
        if (document.activeElement) document.activeElement.blur();
        render();
      }
    },
    true
  );

  const css = document.createElement('style');
  css.textContent = `.z23-draft{margin-top:8px;padding:12px 14px;border-radius:12px;background:var(--zb-wait-bg,#fbf0d9);color:var(--tx);font-size:14.5px}.z23-em{border:2px solid var(--err,#b3202f)}.z23-em summary{color:var(--err,#b3202f);font-size:18px}.z23-em.sent{border-width:1px}.z23-seg{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.z23-seg label{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid var(--bd);border-radius:999px;cursor:pointer;font-weight:600}.z23-seg label:has(input:checked){border-color:var(--err,#b3202f);background:color-mix(in srgb,var(--err,#b3202f) 10%,transparent)}.z23-ask{margin-top:8px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--err,#b3202f) 8%,transparent)}.z23-dec{margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--s2)}`;
  document.head.appendChild(css);
})();
