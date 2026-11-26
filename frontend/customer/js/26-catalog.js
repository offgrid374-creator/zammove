/**
 * 26-catalog.js — the admin catalog in every form, plus filters and preferences.
 *
 *   ZCAT        dropdowns from the admin catalog (S.cfg.cat): brand → only that brand's models, colours,
 *               fuels (Hybrid included), with "Other (not listed)" that asks ZamMove to add a new entry.
 *   Rentals     filter the vehicles by brand, model, colour, seats, fuel, transmission and price.
 *   Booking     optional preferences: brand, colour, minimum seats, fuel, a specific driver. Only matching
 *               vehicles are offered the job (server: catalog.js / helpers h.chk).
 *   Owner       ask ZamMove to change the fuel price (an administrator approves or denies).
 */
(function () {
  'use strict';
  const OTHER = '__other';
  const cat = () => (S.cfg && S.cfg.cat) || { brands: [], fuels: [], colors: [], trans: [] };
  const on = l => (l || []).filter(x => !x.off);
  const eq = (a, b) => String(a || '').trim().toLowerCase() == String(b || '').trim().toLowerCase();
  const brandOf = n => cat().brands.find(b => eq(b.n, n) || b.id == n);
  const opt = (v, l, cur) => `<option value="${esc(v)}"${eq(v, cur) ? ' selected' : ''}>${esc(l)}</option>`;
  const v = id => ((document.getElementById(id) || {}).value || '').trim();

  /* ---------- dropdowns for forms ---------- */
  /* other layers redraw forms: remember the choices so a redraw keeps the brand and its model list */
  const memo = {};
  const brandSel = (id, cur = '', other = true, mid = '') =>
    `<select id="${id}" data-zcat="brand" data-models="${mid || memo[id + ':m'] || id + '-m'}"><option value="">Choose a brand</option>${on(cat().brands)
      .map(b => opt(b.n, b.n, cur || memo[id]))
      .join('')}${other ? opt(OTHER, 'Other (not listed)', '') : ''}</select><input id="${id}-o" class="zcat-o" placeholder="Brand name" hidden>`;
  const modelOpts = (brand, cur = '', other = true) => {
    const b = brandOf(brand);
    return `<option value="">${b ? 'Choose a model' : 'Choose the brand first'}</option>${b ? on(b.models).map(m => opt(m.n, m.n, cur)).join('') : ''}${other && b ? opt(OTHER, 'Other (not listed)', '') : ''}`;
  };
  const modelSel = (id, brand = '', cur = '', brandId = '') => {
    if (brandId) memo[brandId + ':m'] = id;
    const b = brand || memo['b:' + id] || '';
    return `<select id="${id}" data-zcat="model">${b == OTHER ? opt(OTHER, 'Other (not listed)', OTHER) : modelOpts(b, cur || memo[id])}</select><input id="${id}-o" class="zcat-o" placeholder="Model name"${(cur || memo[id]) == OTHER ? '' : ' hidden'}>`;
  };
  const listSel = (id, list, cur = '', first = '') =>
    `<select id="${id}">${first ? `<option value="">${esc(first)}</option>` : ''}${on(cat()[list]).map(x => opt(x.n, x.n, cur)).join('')}</select>`;
  /* the value to submit: the typed name when "Other" is chosen */
  const val = id => (v(id) == OTHER ? v(id + '-o') : v(id));
  const isOther = (...ids) => ids.some(id => v(id) == OTHER);
  /* choosing a brand fills the model list; choosing a model fills in its usual seats and fuel */
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.zcat == 'brand') {
      memo[t.id] = t.value;
      memo['b:' + t.dataset.models] = t.value;
      memo[t.dataset.models] = '';
      const o = document.getElementById(t.id + '-o');
      if (o) o.hidden = t.value != OTHER;
      const ms = document.getElementById(t.dataset.models);
      if (ms) {
        ms.innerHTML = t.value == OTHER ? `${opt(OTHER, 'Other (not listed)', OTHER)}` : modelOpts(t.value);
        ms.value = t.value == OTHER ? OTHER : '';
        ms.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (t.dataset.zcat == 'model') {
      memo[t.id] = t.value;
      const o = document.getElementById(t.id + '-o');
      if (o) o.hidden = t.value != OTHER;
      const bs = document.querySelector(`[data-models="${t.id}"]`),
        b = bs && brandOf(bs.value),
        m = b && b.models.find(x => eq(x.n, t.value));
      if (m) {
        const seats = document.getElementById('w-vs'),
          fu = document.getElementById('w-vfu');
        if (seats && !seats.value) seats.value = m.seats;
        if (fu) fu.value = m.fuel;
      }
    }
  });
  window.ZCAT = { brandSel, modelSel, listSel, val, isOther, OTHER, cat };

  /* ---------- rentals: who drives, then the vehicle type, then the details of that type ---------- */
  const RF = { wd: '', type: '', brand: '', model: '', color: '', seats: '', fuel: '', trans: '', max: '' };
  const DETAIL = ['brand', 'model', 'color', 'seats', 'fuel', 'trans', 'max'];
  const wdMatch = u => !RF.wd || (RF.wd == 'drv' ? +u.drvDay > 0 : true);
  const typeMatch = u => !RF.type || u.type == RF.type;
  const rentMatch = u =>
    wdMatch(u) &&
    typeMatch(u) &&
    (!RF.brand || eq(u.brand, RF.brand)) &&
    (!RF.model || eq(u.model, RF.model)) &&
    (!RF.color || eq(u.color, RF.color)) &&
    (!RF.seats || +u.seats >= +RF.seats) &&
    (!RF.fuel || eq(u.fuel, RF.fuel)) &&
    (!RF.trans || eq(u.trans, RF.trans)) &&
    (!RF.max || +u.day <= +RF.max);
  const typeName = id => (((typeof HV != 'undefined' ? HV : []).concat((S.fleet || {}).RT || [])).find(t => t.id == id) || {}).n || id;
  const rsel = (k, label, items, cur) =>
    `<label class="zf"><span>${label}</span><select data-rf="${k}"><option value="">Any</option>${items.map(x => opt(x, x, cur)).join('')}</select></label>`;
  const chip = (k, val, label, n) =>
    `<button type="button" class="zf-chip${RF[k] == val ? ' on' : ''}" data-a="zf-chip" data-k="${k}" data-v="${esc(val)}" aria-pressed="${RF[k] == val}">${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</button>`;
  const rentFilters = () => {
    const L = S.rentList || [];
    if (!L.length) return '';
    const W = L.filter(wdMatch),
      T = W.filter(typeMatch),
      uniq = f => [...new Set(T.map(f).filter(Boolean))].sort(),
      types = [...new Set(W.map(u => u.type))].sort((a, b) => typeName(a).localeCompare(typeName(b))),
      drvN = L.filter(u => +u.drvDay > 0).length,
      n = L.filter(rentMatch).length,
      detail = DETAIL.some(k => RF[k]);
    const who = `<div class="zf-row" role="radiogroup" aria-label="Who drives?"><span class="zf-lb">Who drives?</span>${chip('wd', '', 'Any')}${chip('wd', 'self', 'I drive')}${chip('wd', 'drv', 'With a driver', drvN)}</div>${
      RF.wd == 'drv' && !drvN ? '<p class="note" style="margin:0 0 10px">No owner offers a driver yet. Choose “I drive”, or check again later.</p>' : ''
    }`;
    const ty = types.length ? `<div class="zf-row"><span class="zf-lb">Vehicle type</span>${chip('type', '', 'All types', W.length)}${types.map(t => chip('type', t, typeName(t), W.filter(u => u.type == t).length)).join('')}</div>` : '';
    const more = RF.type
      ? `<div class="zf-bar" role="search" aria-label="Filter ${esc(typeName(RF.type))}">${rsel('brand', 'Brand', uniq(u => u.brand), RF.brand)}${rsel('model', 'Model', uniq(u => (!RF.brand || eq(u.brand, RF.brand) ? u.model : '')), RF.model)}${rsel('trans', 'Transmission', uniq(u => u.trans), RF.trans)}${rsel(
          'seats',
          'Seats (at least)',
          [...new Set(T.map(u => +u.seats).filter(Boolean))].sort((a, b) => a - b).map(String),
          RF.seats
        )}${rsel('fuel', 'Fuel', uniq(u => u.fuel), RF.fuel)}${rsel('color', 'Colour', uniq(u => u.color), RF.color)}<label class="zf"><span>Max ₱/day</span><input data-rf="max" type="number" min="0" step="100" value="${esc(RF.max)}" placeholder="Any"></label></div>`
      : types.length > 1
        ? '<p class="mu" style="font-size:13px;margin:0 0 10px">Pick a vehicle type to filter by brand, transmission, seats, fuel and price.</p>'
        : '';
    const any = Object.values(RF).some(Boolean);
    return `<div class="zf-wrap">${who}${ty}${more}<div class="zf-n"><b>${n}</b> of ${L.length} vehicle${L.length == 1 ? '' : 's'}${any ? ' · <button type="button" class="zf-x" data-a="zf-clear">Clear filters</button>' : ''}</div></div>`;
  };
  const setWd = () => window.ZFX && (ZFX.wd = RF.wd == 'drv');
  document.addEventListener('change', e => {
    const k = e.target && e.target.dataset && e.target.dataset.rf;
    if (!k) return;
    RF[k] = e.target.value;
    if (k == 'brand') RF.model = '';
    render();
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('[data-a="zf-clear"],[data-a="zf-chip"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.dataset.a == 'zf-clear') Object.keys(RF).forEach(k => (RF[k] = ''));
      else {
        const k = t.dataset.k;
        RF[k] = t.dataset.v;
        if (k == 'type' || k == 'wd') DETAIL.forEach(x => (RF[x] = '')); // details belong to one type
      }
      setWd();
      render();
    },
    true
  );
  window.ZCAT.rentMatch = rentMatch;
  window.ZCAT.rentFilters = rentFilters;

  /* ---------- booking: optional preferences ---------- */
  const PF = { brand: '', color: '', seats: '', fuel: '', driver: '' };
  window.ZPREF = PF;
  const prefBox = () => {
    const vt = typeof sel != 'undefined' && sel ? sel.v : '';
    const H = (S.haulList || []).filter(x => !vt || x.type == vt),
      list = f => [...new Set(H.map(f).filter(Boolean))].sort(),
      drivers = [...new Map(H.filter(x => x.dk).map(x => [x.dk, x])).values()],
      n = H.filter(x => (!PF.brand || eq(x.brand, PF.brand)) && (!PF.color || eq(x.color, PF.color)) && (!PF.seats || +x.seats >= +PF.seats) && (!PF.fuel || eq(x.fuel, PF.fuel)) && (!PF.driver || x.dk == PF.driver)).length,
      act = Object.values(PF).some(Boolean);
    const s = (k, label, items, cur) => `<label class="zf"><span>${label}</span><select data-pf="${k}"><option value="">No preference</option>${items.map(([val, l]) => opt(val, l, cur)).join('')}</select></label>`;
    return `<details class="zk-pref"${act ? ' open' : ''}><summary>Preferences (optional): brand, colour, seats, driver</summary><p class="mu" style="margin:6px 0 8px;font-size:14px">Only vehicles that match are offered your booking. Fewer matches can mean a longer wait.</p><div class="zf-bar">${s('brand', 'Brand', list(x => x.brand).map(x => [x, x]), PF.brand)}${s('color', 'Colour', list(x => x.color).map(x => [x, x]), PF.color)}${s(
      'seats',
      'Seats (at least)',
      [...new Set(H.map(x => +x.seats).filter(Boolean))].sort((a, b) => a - b).map(x => [String(x), String(x)]),
      PF.seats
    )}${s('fuel', 'Fuel', list(x => x.fuel).map(x => [x, x]), PF.fuel)}${s('driver', 'Driver', drivers.map(x => [x.dk, `${x.drv} · ${x.brand} ${x.model}`]), PF.driver)}</div><p class="zf-n" style="margin-top:6px">${act ? `<b>${n}</b> matching vehicle${n == 1 ? '' : 's'} of this type${n ? '' : ' — remove a preference to find one'}` : `${H.length} vehicle${H.length == 1 ? '' : 's'} of this type in service`}${act ? ' · <button type="button" class="zf-x" data-a="zpf-clear">Clear</button>' : ''}</p></details>`;
  };
  const placePref = () => {
    if (!S.me || (S.ws || 'customer') != 'customer' || typeof view == 'undefined' || view != 'book') return;
    const pick = document.querySelector('#app [data-a="pick"]');
    if (!pick) return;
    const grid = pick.parentElement,
      html = prefBox();
    let box = document.getElementById('zk-pref');
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement)) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'zk-pref';
      grid.insertAdjacentElement('afterend', box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
  };
  document.addEventListener('change', e => {
    const k = e.target && e.target.dataset && e.target.dataset.pf;
    if (!k) return;
    PF[k] = e.target.value;
    const box = document.getElementById('zk-pref');
    if (box) box.dataset.h = '';
    placePref();
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('[data-a="zpf-clear"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      Object.keys(PF).forEach(k => (PF[k] = ''));
      const box = document.getElementById('zk-pref');
      if (box) box.dataset.h = '';
      placePref();
    },
    true
  );
  /* choosing a vehicle type does not always redraw the page: refresh the preferences for that type */
  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('[data-a="pick"]'))) return;
    setTimeout(() => {
      const box = document.getElementById('zk-pref');
      if (box) box.dataset.h = '';
      placePref();
    }, 0);
  });
  /* the booking request carries the preferences */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) => {
    if (n == 'createBooking' && !(p && p.pref)) {
      const pref = Object.fromEntries(Object.entries(PF).filter(([, x]) => x));
      if (Object.keys(pref).length) p = { ...(p || {}), pref };
    }
    return _act(n, p).then(r => {
      if (n == 'createBooking' && r.ok) Object.keys(PF).forEach(k => (PF[k] = ''));
      return r;
    });
  };

  /* ---------- owner: ask for a fuel price change ---------- */
  const fuelCard = () => {
    const f = (S.cfg && S.cfg.fuel) || { price: 60 },
      mine = (S.fuelReqs || []).slice().reverse()[0];
    const st = mine
      ? mine.st == 'Pending'
        ? `<p class="mu" style="margin:6px 0 0">You asked for ₱${esc(mine.price)} per litre on ${esc(new Date(mine.t).toLocaleDateString('en-PH'))}. Waiting for an administrator.</p>`
        : `<p class="mu" style="margin:6px 0 0">Your last request (₱${esc(mine.price)}) was ${esc(mine.st.toLowerCase())}${mine.note ? ': ' + esc(mine.note) : '.'}</p>`
      : '';
    return `<details class="card zc-fuel" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center">Fuel price: ₱${esc(f.price)} per litre · ask for a change</summary><p class="mu" style="font-size:14px;margin:4px 0 8px">The per-km part of every new fare follows the fuel price. If pump prices went up, ask ZamMove to update it; an administrator approves or denies.</p>${st}${
      mine && mine.st == 'Pending'
        ? ''
        : `<div class="wsf"><div><label for="zc-fp">New price per litre (₱)</label><input id="zc-fp" type="number" min="20" max="300" step="0.5" placeholder="e.g. 68.50"></div><div style="grid-column:1/-1"><label for="zc-fw">Why?</label><input id="zc-fw" maxlength="300" placeholder="e.g. Diesel is ₱68.50 at the Petron in Tetuan this week"></div></div><div class="wsa"><button class="btn sm" data-a="zc-fuel">Send to ZamMove</button></div>`
    }</details>`;
  };
  const placeFuel = () => {
    if (!S.me || S.ws != 'owner' || ((S.wp || {}).owner || 'dash') != 'veh') return;
    const h1 = document.querySelector('#app h1');
    if (!h1) return;
    let box = document.getElementById('zc-fuelbox');
    const html = fuelCard();
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement)) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'zc-fuelbox';
      h1.insertAdjacentElement('afterend', box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a="zc-fuel"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      t.disabled = true;
      const r = await ZAPI.act('fuelRequest', { price: v('zc-fp'), why: v('zc-fw') });
      t.disabled = false;
      toast(r.ok ? 'Sent. An administrator will decide.' : r.err);
      if (r.ok) {
        const box = document.getElementById('zc-fuelbox');
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
        placePref();
        placeFuel();
      } catch (e) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zf-bar{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 10px;align-items:end;margin:4px 0 12px}.zf{display:flex;flex-direction:column;gap:4px;margin:0;font-size:13px;font-weight:600;color:var(--tx2)}.zf select,.zf input{width:100%;font-weight:400}.zf-n{grid-column:1/-1;font-size:14px;color:var(--tx2);margin:0}.zf-x{border:0;background:none;color:var(--zb-pri,#0f766e);font:inherit;font-weight:600;cursor:pointer;padding:0;min-height:32px}.zk-pref{margin:12px 0;padding:12px 14px;border:1px solid var(--bd);border-radius:12px;background:var(--s)}.zk-pref summary{cursor:pointer;font-weight:600;min-height:40px;display:flex;align-items:center}.zcat-o{margin-top:6px}.zf-wrap{margin:4px 0 12px}.zf-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 10px}.zf-lb{font-size:13px;font-weight:600;color:var(--tx2);margin-right:4px;min-width:96px}.zf-chip{border:1px solid var(--bd);background:var(--s,#fff);color:var(--tx);border-radius:999px;padding:6px 12px;min-height:36px;font:inherit;font-size:14px;cursor:pointer;margin:0}.zf-chip span{color:var(--tx2);font-size:12px}.zf-chip.on{background:var(--tx,#0f172a);color:#fff;border-color:var(--tx,#0f172a)}.zf-chip.on span{color:#cbd5e1}.zf-wrap .zf-bar{margin:0 0 10px}`
  document.head.appendChild(css);
  render();
})();
