/**
 * 25-report.js — one "Report a problem" button during a trip, instead of report forms on every screen.
 *
 *   While the customer or the driver has a trip in progress, a floating button sits in the corner.
 *   It opens a pop-up that first asks what happened, then shows only that form:
 *     customer: Accident or emergency · Problem with the trip (damaged or missing items, driver conduct, delay)
 *     driver:   Accident or emergency · Breakdown, cannot continue · Report the customer
 *   The Track page's "Report issue" button and the driver's "Report no-show" open the same pop-up.
 *   Every report goes to the same server actions as before (emergency, createIncident, tripProblem).
 */
(function () {
  'use strict';
  const me = () => (S.me || {}).em;
  const DONE = ['Completed', 'Cancelled', 'Rejected'];
  const ST = { open: false, id: '', kind: '', note: '', cat: '', err: '', busy: false, draft: null };
  const stop1 = t => String(t || '').split(',')[0];
  /* trips in progress for the person using the app */
  const live = () => {
    const em = me(),
      ws = S.ws || 'customer';
    if (!em || !['customer', 'driver'].includes(ws)) return [];
    return (S.bk || []).filter(
      b => b.drvUser && !DONE.includes(b.st) && !['Pending', 'No driver found'].includes(b.st) && (ws == 'driver' ? b.drvUser == em : b.cu == em)
    );
  };
  const role = () => (S.ws == 'driver' ? 'driver' : 'customer');
  const bk = () => live().find(b => b.id == ST.id) || live()[0];
  const OPTS = {
    customer: [
      ['emergency', 'Accident or emergency', 'A crash, someone hurt or in danger. Stops the trip and alerts everyone at once.', 'r'],
      ['issue', 'Problem with the trip', 'Damaged or missing items, driver conduct, a long delay, or something else.', ''],
    ],
    driver: [
      ['emergency', 'Accident or emergency', 'A crash, someone hurt or in danger. Stops the trip and alerts everyone at once.', 'r'],
      ['breakdown', 'Breakdown, cannot continue', 'A flat tire, an engine problem or anything that stops the trip. ZamMove takes over.', 'w'],
      ['customer', 'Report the customer', 'Non-payment, conduct, unsafe or illegal cargo, or damaged items.', ''],
    ],
  };
  const CATS = {
    issue: ['Damaged items', 'Missing items', 'Driver conduct', 'Delay', 'Vehicle accident', 'Other'],
    customer: ['Customer did not pay', 'Customer conduct', 'Unsafe or illegal cargo', 'Damaged items', 'Vehicle accident', 'Other'],
  };
  const photos = id => {
    const f = [...((document.getElementById(id) || {}).files || [])].slice(0, 5);
    return Promise.all(f.map(x => new Promise(r => img(x, r))));
  };

  /* ---------- the button ---------- */
  const fabOn = () => {
    if (!S.me || !live().length) return false;
    if (role() == 'driver') return true;
    return ['home', 'bookings', 'track'].includes(typeof view != 'undefined' ? view : '');
  };
  const syncFab = () => {
    let f = document.getElementById('zr-fab');
    document.body.classList.toggle('zr-has-fab', fabOn());
    if (!fabOn()) return f && f.remove();
    if (!f) {
      f = document.createElement('button');
      f.id = 'zr-fab';
      f.type = 'button';
      f.className = 'zr-fab';
      f.dataset.a = 'zr-open';
      f.setAttribute('aria-haspopup', 'dialog');
      f.innerHTML = '<span class="zr-fi" aria-hidden="true">!</span><span class="zr-fl">Report a problem</span>';
      document.body.appendChild(f);
    }
  };

  /* ---------- the pop-up ---------- */
  const tripSel = list =>
    list.length > 1
      ? `<label class="zr-l" for="zr-trip">Which trip?</label><select id="zr-trip">${list
          .map(b => `<option value="${esc(b.id)}" ${b.id == ST.id ? 'selected' : ''}>${esc(b.id)} · ${esc(stop1(b.pu))} → ${esc(stop1(b.dr))}</option>`)
          .join('')}</select>`
      : '';
  const form = (b, k) => {
    const who = role() == 'driver' ? 'the customer' : 'the driver';
    if (k == 'emergency')
      return `<div class="zr-warn"><b>If anyone is hurt or in danger, call 911 first.</b><a class="btn d" href="tel:911">Call 911</a></div><fieldset class="zr-fs"><legend>Is anyone hurt?</legend><div class="zr-seg">${[
        ['yes', 'Yes'],
        ['no', 'No'],
        ['unsure', 'Not sure'],
      ]
        .map(([v, l]) => `<label><input type="radio" name="zr-hurt" value="${v}"><span>${l}</span></label>`)
        .join('')}</div></fieldset><label class="zr-l" for="zr-d">What happened?</label><textarea id="zr-d" rows="3" placeholder="e.g. A jeepney hit the van at the Tetuan crossing; the cargo is safe">${esc(ST.note)}</textarea><div class="zr-g2"><div><label class="zr-l" for="zr-ph">Photos (up to 5)</label><input id="zr-ph" type="file" accept="image/*" multiple></div><div><label class="zr-l" for="zr-bl">Police blotter no. (if any)</label><input id="zr-bl" maxlength="40" placeholder="You can add it later"></div></div><p class="zr-sub">Sending this stops the trip and alerts ZamMove, ${who} and the vehicle owner.</p><button class="btn d zr-go" data-a="zr-send" data-k="emergency">Send emergency report</button>`;
    if (k == 'breakdown')
      return `<label class="zr-l" for="zr-d">What happened?</label><textarea id="zr-d" rows="3" placeholder="e.g. Flat tire on the bridge, cannot continue">${esc(ST.note)}</textarea><p class="zr-sub">The trip stops and ZamMove decides the next step: another driver, resuming, or closing it fairly. The customer is told.</p><button class="btn d zr-go" data-a="zr-send" data-k="breakdown">Stop the trip and alert ZamMove</button>`;
    const cats = CATS[k];
    return `<div class="zr-g2"><div><label class="zr-l" for="zr-cat">What is it about?</label><select id="zr-cat"><option value="">Choose…</option>${cats
      .map(c => `<option ${c == ST.cat ? 'selected' : ''}>${c}</option>`)
      .join('')}</select></div><div><label class="zr-l" for="zr-sev">How serious?</label><select id="zr-sev"><option>Low</option><option selected>Medium</option><option>High</option></select></div></div><label class="zr-l" for="zr-d">Describe it</label><textarea id="zr-d" rows="3" placeholder="What, when and where. Mention anyone who saw it.">${esc(ST.note)}</textarea><label class="zr-l" for="zr-ph">Photos (optional, up to 5)</label><input id="zr-ph" type="file" accept="image/*" multiple><p class="zr-sub">ZamMove reviews every report before deciding. Nobody is blamed from a report alone. Accidents and damage are never filed as Low.</p><button class="btn zr-go" data-a="zr-send" data-k="${k}">Send report</button>`;
  };
  const html = () => {
    const list = live(),
      b = bk();
    if (!b) return '';
    const opts = OPTS[role()].filter(o => o[0] != 'breakdown' || b.st != 'Interrupted'),
      cur = opts.find(o => o[0] == ST.kind);
    const dr = ST.draft;
    const body = dr
      ? `<h3 class="zr-h3">Check your report before sending</h3><div class="zr-sum"><div><span>About</span><b>${esc(dr.cat)}</b></div><div><span>How serious</span><b>${esc(dr.sev)}</b></div><div class="zr-sw"><span>What you wrote</span><b>${esc(dr.d)}</b></div></div><p class="zr-sub">Nothing is sent yet and only you can see it. Send it to ZamMove and the people on the trip, or discard it if it was a mistake. You can also withdraw it later, until ZamMove decides.</p><div class="zr-two"><button class="btn zr-go" data-a="zr-ok">Confirm and send</button><button class="btn o zr-go" data-a="zr-dm">Discard</button></div>`
      : cur
      ? `<button class="zr-back" type="button" data-a="zr-kind" data-k="">← All options</button><h3 class="zr-h3">${esc(cur[1])}</h3>${form(b, cur[0])}`
      : `<p class="zr-lead">What happened? Choose one.</p><div class="zr-opts">${opts
          .map(o => `<button type="button" class="zr-opt ${o[3]}" data-a="zr-kind" data-k="${o[0]}"><b>${esc(o[1])}</b><span>${esc(o[2])}</span></button>`)
          .join('')}</div>${b.st == 'Interrupted' && role() == 'driver' ? '<p class="zr-sub">This trip is already stopped; an administrator decides the next step.</p>' : ''}`;
    return `<div class="zr" role="dialog" aria-modal="true" aria-labelledby="zr-t" tabindex="-1"><div class="zr-hd"><div><h2 id="zr-t">Report a problem</h2><span class="zr-ref"><b class="n">${esc(b.id)}</b> · ${esc(stop1(b.pu))} → ${esc(stop1(b.dr))}</span></div><button class="zr-x" type="button" data-a="zr-close" aria-label="Close">×</button></div><div class="zr-body">${tripSel(list)}${body}<p class="zr-err" id="zr-err" role="alert">${esc(ST.err)}</p></div></div>`;
  };
  let lastFocus = null;
  const mount = () => {
    let el = document.getElementById('zr');
    if (!ST.open) {
      if (el) {
        el.remove();
        document.body.classList.remove('zr-lock');
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
      }
      return;
    }
    const h = html();
    if (!h) {
      ST.open = false;
      return mount();
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'zr';
      el.className = 'zr-ov';
      document.body.appendChild(el);
      document.body.classList.add('zr-lock');
      lastFocus = document.activeElement;
    }
    el.innerHTML = h;
    const f = el.querySelector('.zr-body textarea, .zr-opt');
    (f || el.querySelector('.zr')).focus({ preventScroll: true });
  };
  const open = (id, kind, note, cat) => {
    Object.assign(ST, { open: true, id: id || '', kind: kind || '', note: note || '', cat: cat || '', err: '', draft: null });
    mount();
  };
  const close = () => {
    ST.open = false;
    mount();
  };
  window.ZM_REPORT = { open, close };

  const send = async (t, k) => {
    if (ST.busy) return;
    const b = bk();
    if (!b) return close();
    const v = id => ((document.getElementById(id) || {}).value || '').trim();
    const err = m => {
      ST.err = m;
      const e = document.getElementById('zr-err');
      if (e) e.textContent = m;
    };
    let r, okMsg;
    ST.busy = true;
    t.disabled = true;
    try {
      if (k == 'emergency') {
        const hurt = (document.querySelector('input[name="zr-hurt"]:checked') || {}).value || '';
        r = await ZAPI.act('emergency', { bid: b.id, hurt, d: v('zr-d'), blot: v('zr-bl'), phs: await photos('zr-ph') });
        okMsg = 'Emergency report sent. ZamMove and everyone on the trip were alerted.';
      } else if (k == 'breakdown') {
        r = await ZAPI.act('tripProblem', { id: b.id, reason: v('zr-d') });
        okMsg = 'Trip stopped. ZamMove was alerted and will contact you.';
      } else {
        r = await ZAPI.act('createIncident', {
          bid: b.id,
          cat: v('zr-cat'),
          sev: v('zr-sev'),
          w: new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 16),
          d: v('zr-d'),
          phs: await photos('zr-ph'),
        });
        okMsg = '';
        if (r && r.ok && r.draft) {
          /* show the review step instead of closing: the report is official only after Confirm and send */
          ST.busy = false;
          ST.draft = { id: r.id, cat: v('zr-cat'), sev: r.sev || v('zr-sev'), d: v('zr-d') };
          ST.err = '';
          return mount();
        }
      }
    } catch (e) {
      r = { ok: false, err: 'Could not send. Check your connection and try again.' };
    }
    ST.busy = false;
    t.disabled = false;
    if (!r.ok) return err(r.err || 'Something went wrong.');
    close();
    toast(okMsg);
    render();
  };

  document.addEventListener(
    'click',
    e => {
      /* the Track page's "Report issue" opens this pop-up while a trip is in progress */
      const nav = e.target.closest && e.target.closest('#app [data-a="nav"][data-v="reports"]');
      if (nav && S.ws != 'driver' && typeof view != 'undefined' && view == 'track' && live().length) {
        e.preventDefault();
        e.stopPropagation();
        return open((msg && msg.tid) || '');
      }
      const t = e.target.closest && e.target.closest('[data-a^="zr-"]');
      if (!t) {
        /* a click on the dark background closes it */
        if (ST.open && e.target.id == 'zr') close();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a;
      if (a == 'zr-open') return open();
      if (a == 'zr-close') return close();
      if (a == 'zr-kind') {
        ST.kind = t.dataset.k;
        ST.err = '';
        ST.note = '';
        return mount();
      }
      if (a == 'zr-send') return send(t, t.dataset.k);
      if (a == 'zr-ok' || a == 'zr-dm') {
        const did = (ST.draft || {}).id;
        if (!did) return;
        t.disabled = true;
        ZAPI.act(a == 'zr-ok' ? 'caseConfirm' : 'caseWithdraw', { id: did }).then(r => {
          t.disabled = false;
          if (!r.ok) {
            ST.err = r.err;
            return mount();
          }
          ST.draft = null;
          close();
          toast(a == 'zr-ok' ? 'Report sent to ZamMove. Follow it on the Report page.' : 'Report discarded. Nobody saw it.');
          render();
        });
        return;
      }
    },
    true
  );
  document.addEventListener('change', e => {
    if (e.target && e.target.id == 'zr-trip') {
      ST.id = e.target.value;
      mount();
    }
  });
  document.addEventListener('keydown', e => {
    if (ST.open && e.key == 'Escape') {
      e.preventDefault();
      close();
    }
  });

  /* keep the button in step with the page (after every redraw, once later layers have finished) */
  let t0 = 0;
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    clearTimeout(t0);
    t0 = setTimeout(() => {
      try {
        syncFab();
        if (ST.open && !bk()) close();
      } catch (e) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };
  render();
})();
