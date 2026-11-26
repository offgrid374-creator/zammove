'use strict';
/**
 * admin-cat.js — Catalog & fuel (System → Catalog & fuel).
 *
 *   Every dropdown in the app comes from here: brands and their models (usual type, seats, fuel), fuel types
 *   (Hybrid included), colours and transmissions. Add, rename, hide ("no longer available") or delete.
 *   Hidden entries stay on vehicles that already use them; an entry in use cannot be deleted.
 *   Fuel price: the per-km part of new fares follows it; owners' change requests are approved or denied here.
 */
(() => {
  const C = () => (S.cfg && S.cfg.cat) || { brands: [], fuels: [], colors: [], trans: [] };
  const f = id => ((document.getElementById('zc-' + id) || {}).value || '').trim();
  const typesL = () => [...((S.fleet || {}).HV || []), ...((S.fleet || {}).RT || [])];
  const tyName = id => (typesL().find(t => t.id == id) || {}).n || id || '—';
  const used = (field, n) => S.vh.filter(v => String(v[field] || '').toLowerCase() == String(n).toLowerCase()).length;
  const state = x => (x.off ? '<span class="tag">Hidden</span>' : '<span class="tag g">Offered</span>');
  const b2 = (a, l, at, c = 'o') => `<button class="btn sm ${c}" data-a="${a}" ${at}>${l}</button>`;
  const typeSel = (id, cur) => `<select id="zc-${id}" aria-label="Usual vehicle type"><option value="">Any type</option>${typesL().map(t => `<option value="${t.id}"${t.id == cur ? ' selected' : ''}>${esc(t.n)}</option>`).join('')}</select>`;
  const fuelSel = (id, cur) => `<select id="zc-${id}" aria-label="Fuel">${C().fuels.map(x => `<option${x.n == cur ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select>`;

  P.cat = () => {
    const c = C(),
      fu = S.cfg.fuel || { price: 60, ref: 60, hist: [] },
      reqs = (S.fuelReqs || []).filter(x => x.st == 'Pending'),
      newCat = S.vh.filter(v => v.catReq && !c.brands.some(b => b.n.toLowerCase() == String(v.brand).toLowerCase() && b.models.some(m => m.n.toLowerCase() == String(v.model).toLowerCase())));
    const fuelCard = card(
      'Fuel price',
      `<p class="mu" style="margin-top:0">The per-km part of every new fare follows this price (fares were set at ₱${esc(fu.ref)} per litre; now ×${(+S.cfg.fuelK || 1).toFixed(2)}). Existing bookings keep their price.</p><div class="ad-row"><label class="zcl">Price per litre (₱)<input id="zc-fp" type="number" min="20" max="300" step="0.5" value="${esc(fu.price)}"></label><label class="zcl" style="flex:2">Reason<input id="zc-fw" maxlength="200" placeholder="e.g. DOE price update this week"></label>${btn('zcat-fuel', 'Save fuel price')}</div>${
        (fu.hist || []).length
          ? `<details style="margin-top:8px"><summary class="mu" style="cursor:pointer">Price history (${fu.hist.length})</summary>${tbl(['When', 'From', 'To', 'Why'], fu.hist.slice().reverse().slice(0, 15).map(x => [ts(x.t), '₱' + esc(x.from), '₱' + esc(x.to), esc(x.why || '')]))}</details>`
          : ''
      }`,
      'style="margin-top:18px"'
    );
    const reqCard = reqs.length
      ? card(
          `Fuel price requests from owners (${reqs.length})`,
          reqs
            .map(
              x =>
                `<div class="zc-req"><b>${esc(x.name)}</b> asks for <b>₱${esc(x.price)}</b> per litre (now ₱${esc(fu.price)}) · ${ts(x.t)}<p style="margin:4px 0">“${esc(x.why)}”</p><div class="ad-row"><input id="zc-rn-${esc(x.id)}" placeholder="Reason (required to deny)" style="flex:1">${btn('zcat-req', 'Approve', `data-id="${esc(x.id)}" data-x="1"`)}${b2('zcat-req', 'Deny', `data-id="${esc(x.id)}" data-x="0"`, 'd')}</div></div>`
            )
            .join(''),
          'style="margin-top:14px"'
        )
      : '';
    const askCard = newCat.length
      ? card(
          'Not in the catalog yet',
          `<p class="mu" style="margin-top:0">Owners registered these as "Other (not listed)". Add them so everyone can choose them.</p>${tbl(
            ['Vehicle', 'Brand', 'Model', 'Type', ''],
            newCat.map(v => [esc(v.plate), esc(v.brand), esc(v.model), esc(tyName(v.type)), btn('zcat-quick', 'Add to catalog', `data-id="${esc(v.id)}"`)])
          )}`,
          'style="margin-top:14px"'
        )
      : '';
    const brands = card(
      'Brands and models',
      `<p class="mu" style="margin-top:0">Choosing a brand in any form shows only its models. A model's type, seats and fuel are filled in for the owner.</p><div class="ad-row"><input id="zc-nb" placeholder="New brand, e.g. Kia" aria-label="New brand">${btn('zcat', 'Add brand', 'data-k="brand" data-x="add"')}</div>${c.brands
        .map(b => {
          const n = used('brand', b.n),
            id = esc(b.id);
          return `<details class="zc-brand"><summary><b>${esc(b.n)}</b> ${state(b)} <span class="mu">${b.models.length} model${b.models.length == 1 ? '' : 's'} · ${n} vehicle${n == 1 ? '' : 's'}</span></summary><div class="ad-row" style="margin:8px 0"><input id="zc-bn-${id}" value="${esc(b.n)}" aria-label="Brand name">${b2('zcat', 'Rename', `data-k="brand" data-x="edit" data-id="${id}"`)}${b2('zcat', b.off ? 'Offer again' : 'Hide (no longer available)', `data-k="brand" data-x="${b.off ? 'on' : 'off'}" data-id="${id}"`)}${n ? '' : b2('zcat', 'Delete', `data-k="brand" data-x="del" data-id="${id}"`, 'd')}</div>${tbl(
            ['Model', 'Usual type', 'Seats', 'Fuel', 'Status', ''],
            b.models.map(m => {
              const mid = esc(b.id + '-' + m.id),
                inUse = S.vh.some(v => v.brand.toLowerCase() == b.n.toLowerCase() && String(v.model).toLowerCase() == m.n.toLowerCase());
              return [
                `<input id="zc-mn-${mid}" value="${esc(m.n)}" aria-label="Model name" style="min-width:120px">`,
                typeSel('mt-' + mid, m.type),
                `<input id="zc-ms-${mid}" type="number" min="1" max="30" value="${esc(m.seats)}" style="width:70px" aria-label="Seats">`,
                fuelSel('mf-' + mid, m.fuel),
                state(m),
                `<div class="ad-row" style="justify-content:flex-end">${b2('zcat', 'Save', `data-k="model" data-x="edit" data-b="${id}" data-id="${esc(m.id)}" data-m="${mid}"`)}${b2('zcat', m.off ? 'Offer' : 'Hide', `data-k="model" data-x="${m.off ? 'on' : 'off'}" data-b="${id}" data-id="${esc(m.id)}"`)}${inUse ? '' : b2('zcat', 'Delete', `data-k="model" data-x="del" data-b="${id}" data-id="${esc(m.id)}"`, 'd')}</div>`,
              ];
            }),
            'No models yet.'
          )}<div class="ad-row" style="margin-top:8px"><input id="zc-mn-new-${id}" placeholder="New ${esc(b.n)} model">${typeSel('mt-new-' + id, '')}<input id="zc-ms-new-${id}" type="number" min="1" max="30" placeholder="Seats" style="width:80px">${fuelSel('mf-new-' + id, 'Gasoline')}${btn('zcat', 'Add model', `data-k="model" data-x="add" data-b="${id}" data-m="new-${id}"`)}</div></details>`;
        })
        .join('')}`,
      'style="margin-top:14px"'
    );
    const simple = (kind, list, title, ph, field) =>
      card(
        title,
        `<div class="ad-row"><input id="zc-n-${kind}" placeholder="${ph}" aria-label="New entry">${btn('zcat', 'Add', `data-k="${kind}" data-x="add"`)}</div>${tbl(
          ['Name', 'Vehicles', 'Status', ''],
          list.map(x => {
            const k = esc(kind + '-' + x.n.replace(/\W+/g, '_')),
              n = used(field, x.n);
            return [`<input id="zc-e-${k}" value="${esc(x.n)}" aria-label="Name">`, String(n), state(x), `<div class="ad-row" style="justify-content:flex-end">${b2('zcat', 'Rename', `data-k="${kind}" data-x="edit" data-id="${esc(x.n)}" data-e="${k}"`)}${b2('zcat', x.off ? 'Offer' : 'Hide', `data-k="${kind}" data-x="${x.off ? 'on' : 'off'}" data-id="${esc(x.n)}"`)}${n ? '' : b2('zcat', 'Delete', `data-k="${kind}" data-x="del" data-id="${esc(x.n)}"`, 'd')}</div>`];
          })
        )}`,
        'style="margin-top:14px"'
      );
    return `${msg()}${fuelCard}${reqCard}${askCard}${brands}${simple('fuel', c.fuels, 'Fuel types', 'e.g. LPG', 'fuel')}${simple('color', c.colors, 'Colours', 'e.g. Pearl white', 'color')}${simple('trans', c.trans, 'Transmissions', 'e.g. CVT', 'trans')}`;
  };

  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="zcat"]');
      if (!t || !me) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        k = t.dataset.k,
        x = t.dataset.x,
        id = t.dataset.id;
      let r, done;
      if (a == 'zcat-fuel') (r = RQ('fuelSet', { price: f('fp'), why: f('fw') })), (done = 'Fuel price saved. New fares follow it.');
      if (a == 'zcat-req') (r = RQ('fuelDecide', { id, ok: x == '1', note: f('rn-' + id) })), (done = x == '1' ? 'Approved: the fuel price was updated.' : 'Request denied.');
      if (a == 'zcat-quick') {
        const v = S.vh.find(y => y.id == id);
        const br = C().brands.find(b => b.n.toLowerCase() == String(v.brand).toLowerCase());
        if (!br) {
          const r1 = await RQ('catEdit', { kind: 'brand', act: 'add', n: v.brand });
          if (!r1.ok) return (flash = { t: r1.err }), render();
        }
        r = RQ('catEdit', { kind: 'model', act: 'add', brand: v.brand, n: v.model, type: v.type, seats: v.seats || 2, fuel: v.fuel || 'Gasoline' });
        done = `${v.brand} ${v.model} added to the catalog.`;
      }
      if (a == 'zcat') {
        const L = { add: 'Added.', edit: 'Saved.', off: 'Hidden: no longer offered in forms.', on: 'Offered again.', del: 'Deleted.' };
        done = L[x];
        if (x == 'del' && !confirm('Delete this entry? It is not used by any vehicle.')) return;
        if (k == 'brand') r = RQ('catEdit', { kind: 'brand', act: x, id, n: x == 'add' ? f('nb') : f('bn-' + id) });
        else if (k == 'model') {
          const m = t.dataset.m;
          r = RQ('catEdit', { kind: 'model', act: x, brand: t.dataset.b, id, n: f('mn-' + m), type: f('mt-' + m), seats: f('ms-' + m), fuel: f('mf-' + m) });
        } else r = RQ('catEdit', { kind: k, act: x, id, n: x == 'add' ? f('n-' + k) : f('e-' + t.dataset.e) });
      }
      if (!r) return;
      t.disabled = true;
      const j = await r;
      flash = j.ok ? { t: done, good: true } : { t: j.err || 'Something went wrong.' };
      render();
    },
    true
  );
  const css = document.createElement('style');
  css.textContent = `.zc-brand{border:1px solid var(--bd,#e2e8f0);border-radius:12px;padding:10px 14px;margin-top:10px}.zc-brand summary{cursor:pointer;display:flex;gap:10px;align-items:center;flex-wrap:wrap;min-height:36px}.zc-req{padding:10px 0;border-top:1px solid var(--bd,#e2e8f0)}.zc-req:first-child{border-top:0}.zcl{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;flex:1;min-width:160px}`;
  document.head.appendChild(css);
})();
