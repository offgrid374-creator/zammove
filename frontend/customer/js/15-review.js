/**
 * 15-review.js — customer UX fixes from the UI review (loaded last).
 *
 * - Book a haul: numbered steps, one distance (the duplicate km box is hidden), a live checklist next to
 *   Submit that points to whatever is still missing, and on phones the map right under the addresses.
 * - My bookings: a progress bar ("Step 6 of 11 · Items Loaded · next: In Transit") instead of 11 chips.
 * - Home: "Popular routes" distances computed from the place coordinates instead of hard-coded numbers.
 * - Profile: no duplicate read-only copy of the details the form below already edits.
 * - Accessibility: every field gets a label for screen readers.
 */
(() => {
  /* ---------- Home: popular routes from real coordinates ---------- */
  try {
    RT.forEach(r => {
      const a = coord(r[1] + ', Zamboanga City'),
        b = coord(r[2] + ', Zamboanga City');
      if (a && b) r[3] = Math.max(1, Math.round(hv(a, b) * 1.3));
    });
  } catch (e) {}

  /* ---------- Book a haul ---------- */
  const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const step = (n, t, sub) =>
    `<div class="rv-step"><span>${n}</span><div><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  /* what still has to be done before the booking can be submitted */
  const checks = () => {
    const pu = val('pu'),
      dr = val('dr'),
      dt = val('dt'),
      tm = val('tm');
    return [
      ['pu', 'Pickup set', !!coord(pu)],
      ['dr', 'Drop-off set', !!coord(dr) && dr != pu],
      ['dt', 'Pickup date and time', !!dt && !!tm && dt >= todayPH()],
      ['it', 'Items described', val('it').length >= 3],
      ...($('#z7-sz') ? [['z7-sz', 'Load size chosen', !!val('z7-sz')]] : []),
      ['lc', 'Locations confirmed', !!($('#lc') || {}).checked],
    ];
  };
  const paintChecks = () => {
    const box = document.getElementById('rv-check');
    if (!box) return;
    const c = checks(),
      done = c.filter(x => x[2]).length;
    box.innerHTML = `<div class="rv-check-h"><b>Before you submit</b><span>${done} of ${c.length}</span></div><ul>${c
      .map(
        ([id, t, ok]) =>
          `<li class="${ok ? 'done' : ''}"><button type="button" data-rv-go="${id}" ${ok ? 'tabindex="-1"' : ''}><i aria-hidden="true">${ok ? '✓' : ''}</i>${t}</button></li>`
      )
      .join('')}</ul>`;
    const sb = document.querySelector('[data-a="submitbk"]');
    if (sb) sb.setAttribute('aria-disabled', done == c.length ? 'false' : 'true');
  };
  const goTo = id => {
    const f = document.getElementById(id);
    if (!f) return;
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      f.focus({ preventScroll: true });
      const wrap = f.closest('.ac') || f.parentElement;
      wrap.classList.add('rv-flash');
      setTimeout(() => wrap.classList.remove('rv-flash'), 1400);
    }, 350);
  };
  function enhanceBook() {
    const pu = document.getElementById('pu');
    if (
      !pu ||
      pu.dataset.rv ||
      (!document.getElementById('submitbk-area') && !document.querySelector('[data-a="submitbk"]'))
    )
      return;
    pu.dataset.rv = '1';
    /* one distance: the read-only km box repeats the tile below and the map */
    const km = document.getElementById('km');
    if (km) {
      const lab = km.previousElementSibling,
        note = km.nextElementSibling;
      if (lab && lab.tagName == 'LABEL') lab.style.display = 'none';
      if (note && /distance/i.test(note.textContent)) note.style.display = 'none';
      km.style.display = 'none';
    }
    /* numbered steps */
    const add = (el, html) => el && el.insertAdjacentHTML('beforebegin', html);
    add(
      document.querySelector('label[for="pu"]'),
      step(1, 'Where', 'Search, use your location, or tap the map')
    );
    const vh = [...document.querySelectorAll('#app h2')].find(h => h.textContent.trim() == 'Vehicle');
    if (vh) {
      vh.insertAdjacentHTML('beforebegin', step(2, 'Vehicle', 'Pick the size that fits your load'));
      vh.remove();
    }
    const dt = document.getElementById('dt');
    add(dt && dt.closest('.grid'), step(3, 'When', 'Date and time the driver should arrive'));
    const it = document.getElementById('it');
    add(
      it && it.previousElementSibling,
      step(4, 'What you are moving', 'List the items so the driver brings the right help')
    );
    const si = document.getElementById('si');
    add(si && si.previousElementSibling, step(5, 'Extras', 'Optional'));
    /* checklist next to Submit */
    const sb = document.querySelector('[data-a="submitbk"]');
    if (sb && !document.getElementById('rv-check'))
      sb.insertAdjacentHTML('beforebegin', '<div id="rv-check" class="rv-check" aria-live="polite"></div>');
    paintChecks();
    /* phones: the map right under the addresses, not below the whole form */
    if (window.innerWidth <= 720) {
      const map = document.getElementById('bmap'),
        anchor = [...document.querySelectorAll('#app .mu')].find(x =>
          /Service area: Zamboanga City only/.test(x.textContent)
        );
      if (map && anchor) {
        anchor.insertAdjacentElement('afterend', map);
        map.classList.add('rv-map-phone');
        setTimeout(() => window.ZMAP && ZMAP.resize && ZMAP.resize(), 60);
      }
    }
  }
  /* keep the checklist current (suggestions and the map fill the boxes without input events) */
  setInterval(() => {
    if (document.getElementById('rv-check')) paintChecks();
  }, 700);
  document.addEventListener('input', paintChecks);
  document.addEventListener('change', paintChecks);
  document.addEventListener(
    'click',
    e => {
      const g = e.target.closest('[data-rv-go]');
      if (g) {
        e.preventDefault();
        return goTo(g.dataset.rvGo);
      }
      /* Submit with something missing: show the first missing step instead of a list of errors */
      const sb = e.target.closest('[data-a="submitbk"]');
      if (sb && document.getElementById('rv-check')) {
        const miss = checks().find(x => !x[2]);
        if (miss) {
          e.preventDefault();
          e.stopPropagation();
          toast('Almost there: ' + miss[1].toLowerCase() + ' is still missing.');
          goTo(miss[0]);
        }
      }
    },
    true
  );

  /* ---------- My bookings: progress bar instead of 11 status chips ---------- */
  const _bc = bcard;
  bcard = function (b) {
    const h = _bc(b),
      i = FLOW.indexOf(b.st);
    if (i < 0) return h;
    const next = FLOW[i + 1],
      pct = Math.round(((i + 1) / FLOW.length) * 100);
    const bar = `<div class="rv-prog" role="progressbar" aria-valuemin="1" aria-valuemax="${FLOW.length}" aria-valuenow="${i + 1}" aria-label="Booking progress"><div class="rv-bar"><i style="width:${pct}%"></i></div><div class="rv-cap"><b>Step ${i + 1} of ${FLOW.length}</b> · ${esc(b.st)}${next ? ` <span>· next: ${esc(next)}</span>` : ''}</div></div>`;
    return h.replace(/<div class="steps">[\s\S]*?<\/div>/, bar);
  };

  /* ---------- Profile: the details card repeated the form below ---------- */
  const _set = settings;
  settings = function () {
    return _set().replace(
      /<span class="grp">Personal details<\/span><div class="card zl">(?:<div class="zr">[\s\S]*?<\/div>){3}<\/div>/,
      ''
    );
  };

  /* ---------- accessibility: a label for every field ---------- */
  const a11y = () => {
    document.querySelectorAll('#app input:not([type=hidden]), #app select, #app textarea').forEach(e => {
      if (e.getAttribute('aria-label') || e.closest('label')) return;
      if (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) return;
      const prev = e.previousElementSibling;
      if (prev && prev.tagName == 'LABEL' && e.id) {
        prev.htmlFor = e.id;
        return;
      }
      const t =
        e.placeholder ||
        (e.tagName == 'SELECT' && e.options[0] ? e.options[0].text : '') ||
        (e.type == 'file' ? 'Choose a photo' : '');
      if (t) e.setAttribute('aria-label', t);
    });
  };

  const _r = render;
  render = function () {
    /* a "verify your account first" error from an earlier blocked attempt must not linger after verifying */
    try {
      const u = S.me && (S.users || []).find(x => x.em == S.me.em);
      if (msg.bk && /Verify your account/.test(msg.bk) && u && u.ver) msg.bk = '';
    } catch (e) {}
    _r();
    try {
      if (typeof view != 'undefined' && view == 'book') enhanceBook();
      a11y();
    } catch (e) {
      console.error('[zammove] review fixes', e);
    }
  };

  const css = document.createElement('style');
  css.textContent = `
.rv-step{display:flex;gap:12px;align-items:center;margin:26px 0 10px}
.rv-step:first-child{margin-top:4px}
.rv-step>span{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;background:#0f5c53;color:#fff;font:700 13px var(--text)}
.rv-step b{display:block;font:700 17px/1.2 var(--display);color:var(--tx)}
.rv-step small{display:block;color:var(--mu);font-size:13px;margin-top:2px}
.rv-check{margin:4px 0 12px;padding:12px 14px;border-radius:14px;background:var(--s2);border:1px solid var(--bd)}
.rv-check-h{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:6px}
.rv-check-h span{color:var(--mu);font-size:13px}
.rv-check ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.rv-check button{display:flex;gap:10px;align-items:center;width:100%;border:0;background:transparent;padding:6px 4px;border-radius:8px;font:500 14px var(--text);color:var(--tx);cursor:pointer;text-align:left}
.rv-check button:hover{background:var(--s)}
.rv-check i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;border:2px solid var(--bd2);font-style:normal;font-size:12px;font-weight:800;color:#fff;flex:none}
.rv-check li.done button{color:var(--mu);cursor:default}
.rv-check li.done i{background:#0f5c53;border-color:#0f5c53}
[data-a="submitbk"][aria-disabled="true"]{opacity:.55}
.rv-flash{animation:rvflash 1.4s ease}
@keyframes rvflash{0%,60%{box-shadow:0 0 0 4px rgba(242,140,40,.45);border-radius:12px}100%{box-shadow:none}}
.rv-map-phone{margin:12px 0 4px}
.rv-prog{margin:10px 0 4px}
.rv-bar{height:8px;border-radius:99px;background:var(--s2);overflow:hidden}
.rv-bar i{display:block;height:100%;border-radius:99px;background:#0f5c53}
.rv-cap{font-size:13px;margin-top:6px;color:var(--tx)}
.rv-cap span{color:var(--mu)}
.stp button{min-width:36px;min-height:34px;font-size:14px}
`;
  document.head.appendChild(css);
  render();
})();
