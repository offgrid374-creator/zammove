/**
 * 31-recovery.js — fixing human errors.
 *
 *   Undo bar        for 5 minutes after a one-tap action (a driver's trip step, an owner's "Received",
 *                   a rental approval or payment confirmation, "mark as returned"): Undo.
 *   Withdraw        your own pending turnover, owner remittance or fuel price request.
 *   Correct payment the driver proposes the right GCash / cash split for a recorded payment; the customer
 *                   approves or declines on the booking.
 *   Edit booking    the customer fixes the pickup, drop-off or items before a driver accepts.
 *   Owner GCash     GCash customers sent to the owner's number: "Arrived" / "Not received".
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const page = ws => (S.wp || {})[ws] || '';
  const mmss = t => {
    const s = Math.max(0, Math.round((new Date(t).getTime() - Date.now()) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const places = () => (typeof PL != 'undefined' ? PL : []).map(p => (Array.isArray(p) ? p[0] : p)).filter(Boolean);
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

  /* ---------- undo bar ---------- */
  const undoBar = () => {
    const L = (S.undo || []).filter(x => new Date(x.until).getTime() > Date.now());
    if (!L.length) return '';
    return `<div class="zu-bar" role="status">${L.map(x => `<div class="zu-it"><span>${esc(x.label)} <small>(${mmss(x.until)} left)</small></span><button type="button" class="zu-b" data-a="zu-undo" data-k="${esc(x.kind)}" data-id="${esc(x.id)}">Undo</button></div>`).join('')}</div>`;
  };
  const syncUndo = () => {
    let el = document.getElementById('zu-undo');
    const html = S.me ? undoBar() : '';
    if (!html) return el && el.remove();
    if (!el) {
      el = document.createElement('div');
      el.id = 'zu-undo';
      document.body.appendChild(el);
    }
    if (el.dataset.h != html) (el.dataset.h = html), (el.innerHTML = html);
  };
  setInterval(() => S.me && (S.undo || []).length && syncUndo(), 1000);

  /* ---------- driver: correct a recorded payment ---------- */
  const fixCard = () => {
    const L = (S.bk || []).filter(b => b.drvUser == me() && !b.rem && (S.pay || []).some(p => p.bid == b.id && ['down', 'final'].includes(p.kind) && p.status == 'Recorded by driver'));
    if (!L.length) return '';
    return `<details class="card zr2-card"><summary style="cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center">Entered a payment wrong? Correct it</summary><p class="mu" style="font-size:14px;margin:4px 0 8px">Propose the right split (GCash / cash / cash handed over). The total stays the same; the customer approves it, and both versions stay on the receipt.</p>${L.slice(-5)
      .reverse()
      .map(b => {
        const id = esc(b.id);
        return ['down', 'final']
          .filter(k => (S.pay || []).some(p => p.bid == b.id && p.kind == k && p.status == 'Recorded by driver'))
          .map(k => {
            const P = (S.pay || []).filter(p => p.bid == b.id && p.kind == k && p.status == 'Recorded by driver'),
              tot = P.reduce((s, p) => s + p.amount, 0),
              pend = b.fix && b.fix[k];
            return `<div class="zr2-row"><b class="n">${id}</b> · ${k == 'down' ? 'down payment' : 'balance'} ${peso(tot)} (now: ${P.map(p => p.method + ' ' + peso(p.amount)).join(' + ')})${
              pend
                ? ' <span class="tag">Waiting for the customer</span>'
                : `<div class="wsa" style="margin:6px 0 0"><input id="zr2-g-${id}-${k}" type="number" min="0" placeholder="GCash ₱" style="width:110px"><input id="zr2-c-${id}-${k}" type="number" min="0" placeholder="Cash ₱" style="width:110px"><input id="zr2-r-${id}-${k}" type="number" min="0" placeholder="Cash handed ₱" style="width:130px"><input id="zr2-f-${id}-${k}" placeholder="GCash ref" style="width:140px"><input id="zr2-w-${id}-${k}" placeholder="What was wrong?" style="flex:1;min-width:160px"><button class="btn o sm" data-a="zr2-fix" data-id="${id}" data-k="${k}">Send to customer</button></div>`
            }</div>`;
          })
          .join('');
      })
      .join('')}</details>`;
  };

  /* ---------- owner: GCash to their number, pending remittances, fuel request ---------- */
  const ownerGcash = () => {
    const mine = new Set((S.vh || []).filter(x => x.owner == me()).map(x => x.id)),
      bks = new Set((S.bk || []).filter(b => mine.has(b.veh)).map(b => b.id)),
      L = (S.pay || []).filter(p => bks.has(p.bid) && p.gto == 'owner' && !p.oc && ['Recorded by driver', 'Verified'].includes(p.status));
    if (!L.length) return '';
    return `<section class="card zr2-card"><h2 style="font-size:20px;margin:0">GCash to your number <span class="tag r">${L.length}</span></h2><p class="mu" style="margin:4px 0 8px;font-size:14px">Customers sent these to your GCash; the driver recorded them. Check your GCash and confirm. If one never arrived, ZamMove checks it with the customer.</p>${L.map(p => {
      const id = esc(p.id);
      return `<div class="zr2-row"><span><b class="n">${esc(p.bid)}</b> · ${peso(p.amount)} · ref <span class="n">${esc(p.ref)}</span></span><span class="wsa" style="margin:0"><button class="btn sm" data-a="zr2-gc" data-id="${id}" data-ok="1">Arrived</button><input id="zr2-gn-${id}" placeholder="Reason, if not received" style="min-width:160px"><button class="btn o sm" data-a="zr2-gc" data-id="${id}" data-ok="0">Not received</button></span></div>`;
    }).join('')}</section>`;
  };
  const ownerPending = () => {
    const rem = (S.pay || []).filter(p => p.kind == 'owner_remit' && p.payer == me() && p.status == 'Submitted'),
      fr = (S.fuelReqs || []).filter(x => x.st == 'Pending');
    if (!rem.length && !fr.length) return '';
    return `<section class="card zr2-card"><h2 style="font-size:18px;margin:0">Waiting for ZamMove</h2>${rem.map(p => `<div class="zr2-row"><span>Remittance ${peso(p.amount)} · ${esc(p.method)}${p.ref ? ' · ' + esc(p.ref) : ''}</span><button class="btn o sm" data-a="zr2-wd" data-k="remit" data-id="${esc(p.id)}">Withdraw (entered wrong)</button></div>`).join('')}${fr.map(x => `<div class="zr2-row"><span>Fuel price request ₱${esc(x.price)}</span><button class="btn o sm" data-a="zr2-wd" data-k="fuel" data-id="${esc(x.id)}">Withdraw</button></div>`).join('')}</section>`;
  };
  /* driver: withdraw a pending turnover */
  const drvPending = () => {
    const L = (S.pay || []).filter(p => p.kind == 'turnover' && p.payer == me() && p.status == 'Submitted');
    if (!L.length) return '';
    return `<section class="card zr2-card"><h2 style="font-size:18px;margin:0">Turnovers waiting for your owner</h2>${L.map(p => `<div class="zr2-row"><span>${peso(p.amount)} · ${esc(p.method)}</span><button class="btn o sm" data-a="zr2-wd" data-k="turnover" data-id="${esc(p.id)}">Withdraw (entered wrong)</button></div>`).join('')}</section>`;
  };

  /* ---------- customer: booking card additions (correction to approve, edit addresses) ---------- */
  window.ZREC = {
    card: b => {
      let h = '';
      const id = esc(b.id);
      Object.entries(b.fix || {}).forEach(([k, f]) => {
        h += `<div class="zb-rs"><b>Your driver asks to correct the ${k == 'down' ? 'down payment' : 'balance'}</b><p class="zb-note">“${esc(f.why)}”. Proposed: ${[f.g ? peso(f.g) + ' by GCash' : '', f.c ? peso(f.c) + ' cash (you handed ' + peso(f.rcv) + ')' : ''].filter(Boolean).join(' + ')}.</p><div class="zb-acts"><button class="zb-btn pri" data-a="zr2-ans" data-id="${id}" data-k="${k}" data-ok="1">That is right</button><input id="zr2-an-${id}-${k}" placeholder="If not, what is wrong?" style="flex:1;min-width:160px"><button class="zb-btn sec" data-a="zr2-ans" data-id="${id}" data-k="${k}" data-ok="0">Decline</button></div></div>`;
      });
      if (['Pending', 'No driver found'].includes(b.st) && !b.drvUser && !b.pkg && !b.pkgOf)
        h += `<details class="zb-led"><summary>Wrong address or items? Edit them</summary><div class="zb-rsf" style="display:grid;gap:8px;margin-top:8px"><label>Pickup<input id="zr2-pu-${id}" list="zr2-pl" value="${esc(b.pu)}"></label><label>Drop-off<input id="zr2-dr-${id}" list="zr2-pl" value="${esc(b.dr)}"></label><label>Items<input id="zr2-it-${id}" value="${esc(b.it)}"></label></div><datalist id="zr2-pl">${places().map(n => `<option value="${esc(n)}">`).join('')}</datalist><div class="zb-acts"><button class="zb-btn pri" data-a="zr2-edit" data-id="${id}">Save changes</button></div><p class="zb-note">The price is recalculated. Possible until a driver accepts.</p></details>`;
      return h;
    },
  };

  /* ---------- clicks ---------- */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a^="zu-"],[data-a^="zr2-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id,
        k = t.dataset.k;
      let r, okMsg;
      t.disabled = true;
      if (a == 'zu-undo') (r = await ZAPI.act('undo', { kind: k, id })), (okMsg = 'Undone.');
      if (a == 'zr2-wd') (r = await ZAPI.act('withdraw', { kind: k, id })), (okMsg = 'Withdrawn. You can enter it again.');
      if (a == 'zr2-gc') (r = await ZAPI.act('ownerGcashCheck', { id, ok: t.dataset.ok == '1', note: v('zr2-gn-' + id) })), (okMsg = t.dataset.ok == '1' ? 'Confirmed.' : 'Sent to ZamMove to check with the customer.');
      if (a == 'zr2-fix') {
        const s = x => v(`zr2-${x}-${id}-${k}`);
        r = await ZAPI.act('payCorrect', { id, kind: k, g: s('g'), c: s('c'), rcv: s('r'), ref: s('f'), why: s('w') });
        okMsg = 'Sent. The customer approves or declines it.';
      }
      if (a == 'zr2-ans') (r = await ZAPI.act('payCorrectAnswer', { id, kind: k, ok: t.dataset.ok == '1', note: v(`zr2-an-${id}-${k}`) })), (okMsg = t.dataset.ok == '1' ? 'Correction approved.' : 'Declined. Your driver was told.');
      if (a == 'zr2-edit') {
        r = await ZAPI.act('editBooking', { id, pu: v('zr2-pu-' + id), dr: v('zr2-dr-' + id), it: v('zr2-it-' + id) });
        okMsg = r && r.ok ? `Saved. New price ${peso(r.tot)}${r.was != r.tot ? ' (was ' + peso(r.was) + ')' : ''}.` : '';
      }
      t.disabled = false;
      if (!r) return;
      toast(r.ok ? okMsg : r.err);
      if (r.ok) {
        document.querySelectorAll('[id^="zr2-box"]').forEach(x => (x.dataset.h = ''));
        await ZAPI.refresh();
        render();
      }
    },
    true
  );
  /* admins: moving a driver who works for another owner needs a confirmation */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) =>
    _act(n, p).then(r => {
      if (n == 'adminAssignVehicle' && !r.ok && /works for another vehicle owner/.test(r.err || '') && !(p && p.move) && confirm(r.err.replace(/ Tick.*$/, '') + '\n\nMove the driver to this vehicle’s owner?')) return _act(n, { ...p, move: true });
      return r;
    });

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        syncUndo();
        const h1 = document.querySelector('#app h1');
        if (!S.me || !h1) return;
        const top = getComputedStyle(h1.parentElement).display.includes('flex') && h1.parentElement.id != 'app' ? h1.parentElement : h1;
        if (S.ws == 'driver' && page('driver') == 'trip') place('zr2-box-fix', fixCard(), b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'driver' && page('driver') == 'earn') place('zr2-box-dp', drvPending(), b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'owner' && ['drv', 'dash', ''].includes(page('owner'))) place('zr2-box-gc', ownerGcash(), b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'owner' && page('owner') == 'earn') place('zr2-box-op', ownerPending(), b => top.insertAdjacentElement('afterend', b));
      } catch (x) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zu-bar{position:fixed;left:16px;bottom:24px;z-index:950;display:flex;flex-direction:column;gap:6px;max-width:min(440px,calc(100vw - 32px))}.zu-it{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px 10px 14px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:14px}.zu-it small{opacity:.75}.zu-b{flex:none;min-height:36px;padding:0 14px;border:1px solid rgba(255,255,255,.5);border-radius:999px;background:transparent;color:#fff;font:inherit;font-weight:700;cursor:pointer}@media (max-width:760px){.zu-bar{bottom:calc(84px + env(safe-area-inset-bottom));left:12px;max-width:calc(100vw - 96px)}}.zr2-card{margin:12px 0;min-width:0;max-width:100%;box-sizing:border-box}.zr2-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--bd)}`;
  document.head.appendChild(css);
  render();
})();
