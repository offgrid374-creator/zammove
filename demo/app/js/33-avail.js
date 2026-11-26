/**
 * 33-avail.js — the booking form only offers vehicle types that can take a job right now.
 *
 *   The server sends S.typeAvail: { vehicleType: number of vehicles with an approved, active driver }.
 *   A type with none is shown as "None available now" and cannot be picked, and the form starts on a
 *   type that has vehicles, so a customer never fills in the whole form only to be refused at the end.
 */
(function () {
  'use strict';
  const avail = id => {
    const a = S.typeAvail;
    return !a || a[id] == null ? 1 : +a[id];
  };
  /* start on a type that can be booked */
  const fixSel = () => {
    if (!S.typeAvail || avail(sel.v) > 0) return false;
    const ok = (typeof HV != 'undefined' ? HV : []).find(v => avail(v.id) > 0);
    if (!ok) return false;
    sel.v = ok.id;
    return true;
  };
  const mark = () => {
    if (typeof view == 'undefined' || view != 'book') return;
    document.querySelectorAll('#app [data-a="pick"][data-id]').forEach(c => {
      const n = avail(c.dataset.id),
        off = n < 1;
      c.classList.toggle('za-off', off);
      c.setAttribute('aria-disabled', off ? 'true' : 'false');
      let b = c.querySelector('.za-tag');
      if (off && !b) {
        b = document.createElement('span');
        b.className = 'za-tag';
        b.textContent = 'None available now';
        c.appendChild(b);
      }
      if (!off && b) b.remove();
    });
    const none = (typeof HV != 'undefined' ? HV : []).every(v => avail(v.id) < 1);
    let w = document.getElementById('za-none');
    const pick = document.querySelector('#app [data-a="pick"]');
    if (none && pick && !w) {
      w = document.createElement('div');
      w.id = 'za-none';
      w.className = 'note';
      w.style.margin = '8px 0';
      w.textContent = 'No vehicle is available for hauling right now. Please try again later.';
      pick.parentElement.insertAdjacentElement('beforebegin', w);
    }
    if (!none && w) w.remove();
  };
  /* an unavailable type cannot be picked */
  document.addEventListener(
    'click',
    e => {
      const c = e.target.closest && e.target.closest('#app [data-a="pick"][data-id]');
      if (!c || avail(c.dataset.id) > 0) return;
      e.preventDefault();
      e.stopPropagation();
      toast('No ' + ((HV.find(v => v.id == c.dataset.id) || {}).n || 'vehicle') + ' is available right now. Choose another vehicle type.');
    },
    true
  );
  const _r = render;
  render = function () {
    if (typeof view != 'undefined' && view == 'book' && fixSel()) {
      /* the selection changed before drawing, so the price follows the chosen type */
    }
    const out = _r.apply(this, arguments);
    setTimeout(mark, 0);
    return out;
  };
  const css = document.createElement('style');
  css.textContent = `[data-a="pick"].za-off{opacity:.5;cursor:not-allowed;filter:grayscale(1);position:relative}.za-tag{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:var(--s2,#f1f5f9);color:var(--tx2,#475569);font-size:12px;font-weight:600}`;
  document.head.appendChild(css);
})();
