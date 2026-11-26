/**
 * 27-people.js — owners manage their own drivers and helpers.
 *
 *   Apply form   a driver chooses the vehicle owner they will drive for (an owner applying to drive skips it).
 *   Owner        Drivers page: applications waiting for them (approve / decline), "My drivers", and the
 *                helpers they register (name, phone, ID photo).
 *   Driver       a booking with helpers asks the driver to name them before departure.
 *   Customer     the booking card shows who handles the cargo.
 */
(function () {
  'use strict';
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const me = () => (S.me || {}).em;
  const user = em => (S.users || []).find(u => u.em == em) || {};
  const place = (id, html, where) => {
    let box = document.getElementById(id);
    if (box && box.dataset.h == html) return;
    if (box && box.contains(document.activeElement) && document.activeElement.tagName != 'BUTTON') return;
    if (!html) return box && box.remove();
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      where(box);
    }
    box.dataset.h = html;
    box.innerHTML = html;
  };
  const run = async (t, call, okMsg) => {
    t.disabled = true;
    const r = await call;
    t.disabled = false;
    toast(r.ok ? okMsg : r.err);
    if (r.ok) {
      document.querySelectorAll('[data-h]').forEach(x => x.id && x.id.startsWith('zp-') && (x.dataset.h = ''));
      render();
    }
    return r;
  };

  /* ---------- apply form: choose the owner ---------- */
  const ownerPick = () => {
    const L = (S.owners || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<label for="w-emp">Vehicle owner you will drive for <span aria-hidden="true">*</span></label><select id="w-emp"><option value="">Choose an owner</option>${L.map(o => `<option value="${esc(o.k)}">${esc(o.name)}${o.ad ? ' · ' + esc(o.ad) : ''} · ${o.vehicles} vehicle${o.vehicles == 1 ? '' : 's'}</option>`).join('')}</select><p class="mu n" style="margin:4px 0 0;font-size:13px">ZamMove drivers work for one vehicle owner. The owner approves you first, then ZamMove checks your documents. Applying as an owner too? You can drive your own vehicles; leave this empty.</p>`;
  };
  const placeOwnerPick = () => {
    const lc = document.getElementById('w-lc');
    if (!lc || document.getElementById('w-emp')) return;
    const cell = lc.closest('[data-apx="driver"]');
    if (!cell) return;
    const d = document.createElement('div');
    d.setAttribute('data-apx', 'driver');
    d.id = 'zp-emp';
    d.style.gridColumn = '1 / -1';
    d.innerHTML = ownerPick();
    cell.insertAdjacentElement('beforebegin', d);
  };
  /* the application request carries the owner */
  const _act = ZAPI.act;
  ZAPI.act = (n, p) => {
    if (n == 'apply' && p && !p.employer && document.getElementById('w-emp')) p = { ...p, employer: v('w-emp') };
    return _act(n, p);
  };

  /* ---------- owner: Drivers page ---------- */
  const ownerPanel = () => {
    const apps = (S.apps || []).filter(a => a.employer == me() && a.role == 'driver'),
      waiting = apps.filter(a => a.st == 'Waiting for Owner'),
      mine = (S.myDrivers || []).map(user),
      helpers = ((user(me()).helpers || (S.me || {}).helpers || []).filter(x => !x.off));
    const appCard = a => {
      const u = user(a.user),
        id = esc(a.id);
      return `<div class="zp-row"><div><b>${esc(u.name || a.user)}</b><div class="mu" style="font-size:13px">${esc(u.ph || a.info.phone || '')} · license ${esc(a.info.license || '—')} (valid to ${esc(a.info.licExp || '—')}) · clearance valid to ${esc(a.info.clrExp || '—')}</div></div><div class="wsa" style="margin:0"><button class="btn sm" data-a="zp-app" data-id="${id}" data-ok="1">Approve</button><input id="zp-an-${id}" placeholder="Reason, if you decline" style="min-width:160px"><button class="btn o sm" data-a="zp-app" data-id="${id}" data-ok="0">Decline</button></div></div>`;
    };
    const help = x => {
      const id = esc(x.id);
      return `<details class="zp-row"><summary><b>${esc(x.name)}</b> <span class="mu">· ${esc(x.ph)}</span></summary><div class="wsf" style="margin-top:8px"><div><label for="zp-hn-${id}">Full name</label><input id="zp-hn-${id}" value="${esc(x.name)}"></div><div><label for="zp-hp-${id}">Mobile</label><input id="zp-hp-${id}" value="${esc(x.ph)}"></div><div><label for="zp-hi-${id}">New ID photo (optional)</label><input id="zp-hi-${id}" type="file" accept="image/*"></div></div><div class="wsa"><button class="btn sm" data-a="zp-help" data-x="edit" data-id="${id}">Save</button><button class="btn d sm" data-a="zp-help" data-x="del" data-id="${id}">Remove</button></div></details>`;
    };
    return `<section class="card zp-card"><h2 style="font-size:20px;margin:0">Driver applications${waiting.length ? ` <span class="tag r">${waiting.length}</span>` : ''}</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">People who want to drive for you. Approve the ones you trust; ZamMove then checks their documents and interviews them.</p>${
      waiting.length ? waiting.map(appCard).join('') : '<p class="mu" style="margin:0">No applications waiting.</p>'
    }${apps.filter(a => a.st != 'Waiting for Owner').length ? `<details style="margin-top:8px"><summary class="mu" style="cursor:pointer">Earlier applications (${apps.filter(a => a.st != 'Waiting for Owner').length})</summary>${apps.filter(a => a.st != 'Waiting for Owner').map(a => `<div class="zp-row"><span>${esc(user(a.user).name || a.user)}</span><span class="tag">${esc(a.st)}</span></div>`).join('')}</details>` : ''}</section>
<section class="card zp-card"><h2 style="font-size:20px;margin:0">My drivers (${mine.length})</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">Only drivers who work for you. To add one, share your name so they can apply to you, or recommend them by email below.</p>${
      mine.length ? mine.map(u => `<div class="zp-row"><span><b>${esc(u.name || '')}</b> <span class="mu">· ${esc(u.ph || '')}</span></span>${u.em == me() ? '<span class="tag g">You</span>' : ''}</div>`).join('') : '<p class="mu" style="margin:0">No drivers yet.</p>'
    }</section>
<section class="card zp-card"><h2 style="font-size:20px;margin:0">Helpers (${helpers.length})</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">People who carry items on your trips. Only registered helpers (and your drivers) can be named on a booking, so customers know who handles their cargo.</p>${helpers.map(help).join('')}<details class="zp-add" style="margin-top:8px"><summary style="cursor:pointer;font-weight:600;min-height:40px;display:flex;align-items:center">Register a helper</summary><div class="wsf"><div><label for="zp-hn">Full name</label><input id="zp-hn" placeholder="e.g. Pedro Cruz"></div><div><label for="zp-hp">Mobile</label><input id="zp-hp" inputmode="tel" placeholder="09XXXXXXXXX"></div><div><label for="zp-hi">Photo of a valid ID</label><input id="zp-hi" type="file" accept="image/*"></div></div><div class="wsa"><button class="btn sm" data-a="zp-help" data-x="add">Register helper</button></div></details></section>`;
  };

  /* ---------- driver: name the helpers ---------- */
  const helperCard = () => {
    const BEFORE = ['Accepted', 'On the Way to Pickup', 'Awaiting Down Payment', 'Down Payment Confirmed', 'Items Loaded'];
    const L = (S.bk || []).filter(b => b.drvUser == me() && +b.mv > 0 && BEFORE.includes(b.st));
    if (!L.length) return '';
    const crew = S.crew || [];
    return L.map(b => {
      const named = (b.helpers || []).map(x => x.id),
        id = esc(b.id);
      return `<section class="card zp-card"><h2 style="font-size:19px;margin:0">Helpers for <span class="n">${id}</span> ${named.length == +b.mv ? '<span class="tag g">Named</span>' : '<span class="tag r">Needed before departure</span>'}</h2><p class="mu" style="margin:4px 0 8px;font-size:14px">The customer booked ${b.mv} helper${b.mv > 1 ? 's' : ''}. Choose who comes; the customer sees their names.</p>${
        crew.length
          ? `<div class="zp-crew">${crew.map(c => `<label class="p-ck"><input type="checkbox" data-crew="${id}" value="${esc(c.id)}"${named.includes(c.id) ? ' checked' : ''}><span>${esc(c.name)} <span class="mu">· ${esc(c.kind)}</span></span></label>`).join('')}</div><div class="wsa"><button class="btn sm" data-a="zp-crew" data-id="${id}">Save helpers</button></div>`
          : '<p class="err" style="margin:0">Your vehicle owner has not registered any helpers yet. Ask them to add helpers under Drivers.</p>'
      }</section>`;
    }).join('');
  };

  /* ---------- clicks ---------- */
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest && e.target.closest('[data-a^="zp-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      if (a == 'zp-app') return run(t, ZAPI.act('ownerAppDecide', { id, ok: t.dataset.ok == '1', note: v('zp-an-' + id) }), t.dataset.ok == '1' ? 'Approved. ZamMove now reviews the documents.' : 'Declined. The applicant was told.');
      if (a == 'zp-help') {
        const x = t.dataset.x,
          sfx = x == 'add' ? '' : '-' + id;
        if (x == 'del' && !confirm('Remove this helper? They stay on finished trips.')) return;
        const idph = await new Promise(r => {
          const f = (document.getElementById('zp-hi' + sfx) || {}).files;
          return f && f[0] ? img(f[0], r) : r('');
        });
        return run(t, ZAPI.act('ownerHelper', { act: x, id, name: v('zp-hn' + sfx), ph: v('zp-hp' + sfx), idph }), { add: 'Helper registered.', edit: 'Saved.', del: 'Helper removed.' }[x]);
      }
      if (a == 'zp-crew') {
        const ids = [...document.querySelectorAll(`input[data-crew="${id}"]:checked`)].map(x => x.value);
        return run(t, ZAPI.act('bookHelpers', { id, ids }), 'Helpers saved. The customer was told.');
      }
    },
    true
  );

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        placeOwnerPick();
        const h1 = () => document.querySelector('#app h1');
        if (S.me && S.ws == 'owner' && ((S.wp || {}).owner || 'dash') == 'drv' && h1()) place('zp-owner', ownerPanel(), box => h1().insertAdjacentElement('afterend', box));
        if (S.me && S.ws == 'driver' && h1()) place('zp-drv', helperCard(), box => h1().insertAdjacentElement('afterend', box));
      } catch (e) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `.zp-card{margin:12px 0}.zp-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--bd)}.zp-row:first-of-type{border-top:0}details.zp-row{display:block}details.zp-row summary{cursor:pointer;min-height:36px;display:flex;align-items:center;gap:6px}.zp-crew{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}`;
  document.head.appendChild(css);
  render();
})();
