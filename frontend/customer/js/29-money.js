/**
 * 29-money.js — money views for owners and cashiers.
 *
 *   Owner Earnings   earnings today and for chosen dates, plus every report (shared/reports.js) for their own
 *                    vehicles and rentals: sales, cash vs GCash, unpaid balances, discounts, trips, rentals, refunds.
 *   Owner discounts  give a discount on a trip with your vehicle (e.g. a friend), up to 50% of the fare.
 *                    ZamMove's fee and commission stay on the full fare; your share absorbs it.
 *   Cashier Income   the same reports for everything.
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const page = ws => (S.wp || {})[ws] || '';
  const place = (id, html, where) => {
    let box = document.getElementById(id);
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (!html) return box && box.remove();
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      box.style.cssText = 'min-width:0;max-width:100%'; // wide tables scroll inside the card
      where(box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
  };
  /* owner: discounts on open trips with their vehicles */
  const discCard = () => {
    const mine = new Set((S.vh || []).filter(x => x.owner == me()).map(x => x.id));
    const L = (S.bk || []).filter(b => mine.has(b.veh) && !['Completed', 'Cancelled', 'Rejected', 'Pending', 'No driver found'].includes(b.st) && !b.pkgOf);
    if (!L.length) return '';
    return `<section class="card zm-card"><h2 style="font-size:20px;margin:0">Give a discount</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">For a trip with your vehicle, e.g. moving a friend. Up to 50% of the fare. ZamMove’s fee and commission stay the same; the discount comes out of your share, and it shows on the customer’s receipt and in your reports.</p>${L.map(b => {
      const id = esc(b.id),
        d = b.odisc;
      return `<div class="zm-row"><div><b class="n">${id}</b> <span class="mu">· ${esc(String(b.pu).split(',')[0])} → ${esc(String(b.dr).split(',')[0])} · fare ${peso(b.tot)}</span>${d ? `<div class="ok" style="margin:4px 0 0">Discount ${peso(d.amt)}: ${esc(d.why)}</div>` : ''}</div><div class="wsa" style="margin:0"><input id="zm-da-${id}" type="number" min="0" step="50" placeholder="₱ off" value="${d ? esc(d.amt) : ''}" style="width:110px" aria-label="Discount in pesos"><input id="zm-dw-${id}" placeholder="Reason, e.g. family friend" value="${d ? esc(d.why) : ''}" style="min-width:180px" aria-label="Reason"><button class="btn sm" data-a="zm-disc" data-id="${id}">${d ? 'Update' : 'Give discount'}</button>${d ? `<button class="btn o sm" data-a="zm-disc0" data-id="${id}">Remove</button>` : ''}</div></div>`;
    }).join('')}</section>`;
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a="zm-disc"],[data-a="zm-disc0"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const id = t.dataset.id;
      t.disabled = true;
      const r = await ZAPI.act('ownerDiscount', t.dataset.a == 'zm-disc0' ? { id, amt: 0 } : { id, amt: v('zm-da-' + id), why: v('zm-dw-' + id) });
      t.disabled = false;
      toast(r.ok ? (t.dataset.a == 'zm-disc0' ? 'Discount removed.' : 'Discount saved. The customer and driver were told.') : r.err);
      if (r.ok) {
        const box = document.getElementById('zm-disc');
        if (box) box.dataset.h = '';
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
        if (!S.me || !window.ZREP) return;
        const h1 = document.querySelector('#app h1');
        if (!h1) return;
        /* some pages put the title in a flex row: insert after the whole row, not inside it */
        const top = getComputedStyle(h1.parentElement).display.includes('flex') && h1.parentElement.id != 'app' ? h1.parentElement : h1;
        if (S.ws == 'owner' && page('owner') == 'earn')
          place('zm-rep', `<section class="card zm-card"><h2 style="font-size:20px;margin:0">Earnings and reports</h2>${ZREP.view('own', S, { owner: me() })}</section>`, b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'owner' && ['dash', 'hist', ''].includes(page('owner'))) place('zm-disc', discCard(), b => top.insertAdjacentElement('afterend', b));
        if (S.ws == 'cashier' && ['inc', ''].includes(page('cashier')))
          place('zm-rep', `<section class="card zm-card"><h2 style="font-size:20px;margin:0">Reports</h2>${ZREP.view('cash', S, {})}</section>`, b => top.insertAdjacentElement('afterend', b));
      } catch (e) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zm-card{margin:12px 0;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden}.zm-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--bd)}.zm-row:first-of-type{border-top:0}`;
  document.head.appendChild(css);
  render();
})();
