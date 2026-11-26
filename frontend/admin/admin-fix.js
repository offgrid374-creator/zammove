'use strict';
/**
 * admin-fix.js — System → Corrections: fix a record when a user made a mistake the app cannot undo.
 *   Find a booking, rental or payment by its ID, then: step a trip back, void a wrong payment, reopen a
 *   decided dispute, step a rental back, or cancel a booking (with an optional refund). A reason is required;
 *   the people involved are told and the correction is in the audit log.
 */
(() => {
  let q = '';
  const nm = em => ((S.users || []).find(u => u.em == em) || {}).name || em || '—';
  const f = id => ((document.getElementById('zf-' + id) || {}).value || '').trim();
  const row = (k, v) => `<div class="zf-r"><span>${esc(k)}</span><b>${v}</b></div>`;
  const act = (kind, id, label, extra = '', cls = 'o') => `<button class="btn sm ${cls}" data-a="zfix" data-k="${kind}" data-id="${esc(id)}">${label}</button>${extra}`;
  const found = () => {
    const s = q.trim().toUpperCase();
    if (!s) return '';
    const b = S.bk.find(x => x.id.toUpperCase() == s),
      r = S.rn.find(x => x.id.toUpperCase() == s),
      pays = S.pay.filter(x => (x.id || '').toUpperCase() == s || (x.bid || '').toUpperCase() == s || (x.ref || '').toUpperCase() == s);
    let h = '';
    if (b)
      h += card(
        'Booking ' + b.id,
        `${row('Status', esc(b.st))}${row('Customer', esc(nm(b.cu)))}${row('Driver', esc(b.drv || '—'))}${row('Fare', peso(b.tot))}<p class="mu" style="font-size:13px">Last event: ${esc(((b.ev || []).slice(-1)[0] || {}).to || '—')} — ${esc(((b.ev || []).slice(-1)[0] || {}).note || '')}</p><div class="ad-row">${act('step-back', b.id, 'Step the trip back')}${act('cancel', b.id, 'Cancel booking', '<input id="zf-refund" type="number" min="0" placeholder="Refund ₱ (optional)" style="width:160px">', 'd')}</div>`,
        'style="margin-top:14px"'
      );
    if (r) h += card('Rental ' + r.id, `${row('Status', esc(r.st))}${row('Renter', esc(nm(r.cu)))}${row('Owner', esc(nm(r.owner)))}<div class="ad-row">${act('rental-back', r.id, 'Step the rental back')}</div>`, 'style="margin-top:14px"');
    if (pays.length)
      h += card(
        'Payments',
        tbl(
          ['When', 'For', 'Kind', 'Method', 'Amount', 'Status', ''],
          pays.map(p => [ts(p.t), esc(p.bid || '—'), esc(p.kind), esc(p.method || ''), peso(p.amount), tag(p.status), `<div class="ad-row">${p.status != 'Voided' ? act('void-pay', p.id, 'Void') : ''}${p.disp && p.disp.closed ? act('reopen', p.id, 'Reopen dispute') : ''}</div>`])
        ),
        'style="margin-top:14px"'
      );
    return h || `<p class="mu" style="margin-top:14px">Nothing found for “${esc(q)}”. Use a booking ID (BK-…), rental ID (RN-…), payment ID (PY-…) or GCash reference.</p>`;
  };
  P.fix = () =>
    `${msg()}${card(
      'Correct a record',
      `<p class="mu" style="margin-top:0">For mistakes the app cannot undo by itself (the users' own Undo lasts 5 minutes). Every correction needs a reason; the people involved are told and it is kept in the audit log.</p><div class="ad-row"><input id="zf-q" value="${esc(q)}" placeholder="Booking, rental, payment ID or GCash ref" style="flex:1;min-width:220px">${btn('zfix-find', 'Find')}</div><div class="ad-row" style="margin-top:8px"><input id="zf-why" placeholder="Reason for the correction (required, at least 10 characters)" style="flex:1;min-width:260px"></div>`,
      'style="margin-top:18px"'
    )}${found()}`;
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a="zfix"],[data-a="zfix-find"]');
      if (!t || !me) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.dataset.a == 'zfix-find') {
        q = f('q');
        flash = null;
        return render();
      }
      const k = t.dataset.k;
      if (k == 'cancel' && !confirm('Cancel this booking?')) return;
      t.disabled = true;
      const j = await RQ('adminFix', { kind: k, id: t.dataset.id, reason: f('why'), refund: f('refund') });
      flash = j.ok ? { t: 'Corrected. The people involved were told.', good: true } : { t: j.err };
      render();
    },
    true
  );
  /* moving a driver who works for another owner needs a confirmation */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) =>
    _act(n, p).then(r => {
      if (n == 'adminAssignVehicle' && !r.ok && /works for another vehicle owner/.test(r.err || '') && !(p && p.move) && confirm(r.err.replace(/ Tick.*$/, '') + '\n\nMove the driver to this vehicle’s owner?')) return _act(n, { ...p, move: true });
      return r;
    });
  const css = document.createElement('style');
  css.textContent = `.zf-r{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--bd,#e2e8f0);font-size:14px}`;
  document.head.appendChild(css);
})();
