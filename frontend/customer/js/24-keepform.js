/**
 * 24-keepform.js — a failed submit never wipes the form.
 *
 * When the server refuses an action (a plate number already used, a missing photo, an expired date),
 * the screens redraw to show the message, and a redraw used to rebuild the form empty. This file keeps
 * what was filled in: for a short moment after a refused action, every redraw copies the values of
 * the inputs, selects, text areas, checkboxes, chosen photos and open sections back into the new page,
 * keeps the scroll position, and shows the error right under the button that was pressed.
 * A successful action redraws as before, so a form that went through starts empty again.
 *
 * Used by the customer app (it wraps render) and by the admin panel (admin.js calls ZKeep itself).
 */
(function () {
  'use strict';
  if (window.ZKeep) return;
  let keepUntil = 0,
    lastBtn = null,
    lastErr = '';
  const app = () => document.getElementById('app');

  /* the button that started the request, to put the error next to it */
  document.addEventListener(
    'click',
    e => {
      const b = e.target.closest && e.target.closest('button, a[data-a], [role="button"]');
      if (b && b.closest('#app'))
        lastBtn = { a: b.dataset.a || '', id: b.dataset.id || '', x: b.dataset.x || '', txt: b.textContent.trim() };
    },
    true
  );

  /* a refused action keeps the forms for the redraws that follow it */
  const _act = ZAPI.act;
  ZAPI.act = async (n, p) => {
    const r = await _act(n, p);
    if (r && r.ok === false) {
      keepUntil = Date.now() + 2500;
      lastErr = r.err || 'Something went wrong. Check the form and try again.';
    } else if (r && r.ok) {
      keepUntil = 0;
      lastErr = '';
    }
    return r;
  };

  const key = el =>
    el.id
      ? '#' + CSS.escape(el.id)
      : el.name
        ? `[name="${CSS.escape(el.name)}"]` + (el.type == 'radio' || el.type == 'checkbox' ? `[value="${CSS.escape(el.value)}"]` : '')
        : null;
  const summary = d => ((d.querySelector('summary') || {}).textContent || '').trim();

  const snapshot = () => {
    const root = app();
    if (!root) return null;
    const fields = [];
    root.querySelectorAll('input, select, textarea').forEach(el => {
      if (['hidden', 'button', 'submit', 'reset', 'password'].includes(el.type)) return;
      const k = key(el);
      if (!k) return;
      if (el.type == 'checkbox' || el.type == 'radio') fields.push({ k, el, checked: el.checked });
      else if (el.type == 'file') el.files && el.files.length && fields.push({ k, el, files: [...el.files] });
      else fields.push({ k, el, v: el.value });
    });
    return { fields, open: [...root.querySelectorAll('details[open]')].map(summary).filter(Boolean), y: window.scrollY };
  };

  const restore = s => {
    const root = app();
    if (!root || !s) return;
    s.open.forEach(t => {
      const d = [...root.querySelectorAll('details')].find(d => summary(d) == t);
      if (d) d.open = true;
    });
    s.fields.forEach(f => {
      const el = root.querySelector(f.k);
      if (!el || el === f.el) return; // the same element survived the redraw: nothing to copy
      if ('checked' in f) {
        if (el.checked != f.checked) {
          el.checked = f.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (f.files) {
        try {
          const dt = new DataTransfer();
          f.files.forEach(x => dt.items.add(x));
          el.files = dt.files;
        } catch (e) {
          /* very old browsers cannot refill a file input; the photo has to be chosen again */
        }
      } else if (el.value !== f.v) {
        el.value = f.v;
        el.dispatchEvent(new Event(el.tagName == 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
    });
    window.scrollTo(0, s.y);
  };

  /* the error, right under the button that was pressed (the page's own message stays too) */
  const showErr = () => {
    const root = app();
    if (!root || !lastErr) return;
    root.querySelectorAll('.zk-err').forEach(e => e.remove());
    const b =
      lastBtn &&
      [...root.querySelectorAll('button, a[data-a], [role="button"]')].find(
        x =>
          (x.dataset.a || '') == lastBtn.a &&
          (x.dataset.id || '') == lastBtn.id &&
          (x.dataset.x || '') == lastBtn.x &&
          (lastBtn.a || x.textContent.trim() == lastBtn.txt)
      );
    if (!b) return;
    const p = document.createElement('p');
    p.className = 'zk-err';
    p.setAttribute('role', 'alert');
    p.textContent = lastErr;
    (b.closest('.wsa, .ad-row, .zad-acts, .wsf') || b).insertAdjacentElement('afterend', p);
  };

  window.ZKeep = {
    before: () => (Date.now() < keepUntil ? snapshot() : null),
    after: s => {
      if (!s) return;
      restore(s);
      showErr();
    },
  };

  /* customer app: every redraw goes through this */
  if (typeof render == 'function') {
    const _r = render;
    render = function () {
      const s = ZKeep.before();
      const out = _r.apply(this, arguments);
      ZKeep.after(s);
      return out;
    };
  }

  const css = document.createElement('style');
  css.textContent = `.zk-err{color:var(--err,#b3202f);font-weight:600;font-size:14px;margin:8px 0 0;padding:8px 12px;border-radius:8px;background:color-mix(in srgb,var(--err,#b3202f) 9%,transparent)}`;
  document.head.appendChild(css);
})();
