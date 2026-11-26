/**
 * 35-chat.js — chat between the customer and the driver of a trip, and between the renter and the owner
 * (and the owner's driver) of a rental. Server: domain/chat.js; messages come from GET /api/chat.
 *
 *   A round chat button (bottom right, above "Report a problem") shows the unread count and opens the
 *   conversations. Track, the driver's Active trip page and the rental cards also get a "Chat" button.
 *   While a conversation is open it is refreshed every 3 seconds; closed conversations stay readable.
 */
(function () {
  'use strict';
  const POLL_MS = 3000;
  const QUICK = {
    Customer: ['I’m outside', 'Please call me', 'Running 5 minutes late', 'Thank you!'],
    Driver: ['On my way', 'I’ve arrived', 'Stuck in traffic, a few minutes late', 'Thank you!'],
    Renter: ['I’m at the pickup point', 'Can we move the time?', 'On my way to return it', 'Thank you!'],
    Owner: ['The vehicle is ready', 'I’m at the pickup point', 'Please call me', 'Thank you!'],
  };
  const C = { open: false, k: '', id: '', msgs: [], total: 0, info: null, timer: null, list: false, sending: false };
  const threads = () => (S.me && S.chats) || [];
  const unread = () => threads().reduce((n, t) => n + (t.unread || 0), 0);
  const tm = t => {
    const d = new Date(t),
      today = new Date().toDateString() == d.toDateString();
    return today ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  };
  const myRole = () => {
    const t = threads().find(x => x.k == C.k && x.id == C.id);
    if (!t) return 'Customer';
    const roles = t.with.map(w => w.role);
    if (C.k == 'b') return roles.includes('Driver') ? 'Customer' : 'Driver';
    return roles.includes('Owner') ? (roles.includes('Renter') ? 'Driver' : 'Renter') : 'Owner';
  };

  /* ---------- server ---------- */
  let seq = 0; // only the newest answer counts: an older, slower one must not wipe newer messages
  const fetchMsgs = async () => {
    if (!C.open || C.list || !C.id) return;
    const mine = ++seq,
      key = C.k + ':' + C.id;
    try {
      const r = await fetch(`${window.ZM_API_BASE || '/api'}/chat/${C.k}/${encodeURIComponent(C.id)}?since=${C.total}`, { headers: { Authorization: 'Bearer ' + ZAPI.token() } });
      const j = await r.json();
      if (!j.ok || mine != seq || key != C.k + ':' + C.id) return;
      const fresh = j.msgs.filter(m => !C.msgs.some(x => x.id == m.id));
      C.info = j;
      if (j.total < C.total) (C.msgs = j.msgs), (C.total = j.total);
      else if (fresh.length) C.msgs.push(...fresh), (C.total = j.total);
      paint(fresh.length > 0);
      /* tell the server it was read (only when something new came from the others) */
      if (fresh.some(m => !m.me) && j.member && document.visibilityState == 'visible') {
        await ZAPI.act('chatSeen', { k: C.k, id: C.id });
        fab();
        inline(); // the "Chat with …" buttons drop their unread count
      }
    } catch (e) {
      /* offline: try again on the next tick */
    }
  };
  const send = async text => {
    text = String(text || '').trim();
    if (!text || C.sending) return;
    C.sending = true;
    const r = await ZAPI.act('chatSend', { k: C.k, id: C.id, x: text });
    C.sending = false;
    if (!r.ok) return toast(r.err);
    const inp = document.getElementById('zc-in');
    if (inp) inp.value = '';
    await fetchMsgs();
    const i2 = document.getElementById('zc-in');
    if (i2) i2.focus();
  };

  /* ---------- open / close ---------- */
  const openThread = (k, id) => {
    Object.assign(C, { open: true, list: false, k, id, msgs: [], total: 0, info: null });
    paint();
    fetchMsgs();
    clearInterval(C.timer);
    C.timer = setInterval(fetchMsgs, POLL_MS);
  };
  const openList = () => {
    const L = threads();
    if (L.length == 1) return openThread(L[0].k, L[0].id);
    Object.assign(C, { open: true, list: true });
    clearInterval(C.timer);
    paint();
  };
  const close = () => {
    C.open = false;
    clearInterval(C.timer);
    const p = document.getElementById('zc-panel');
    if (p) p.remove();
    fab();
  };
  window.ZCHAT = { open: openThread, list: openList };

  /* ---------- drawing ---------- */
  const panel = () => {
    let p = document.getElementById('zc-panel');
    if (!p) {
      p = document.createElement('section');
      p.id = 'zc-panel';
      p.setAttribute('role', 'dialog');
      p.setAttribute('aria-label', 'Chat');
      document.body.appendChild(p);
    }
    return p;
  };
  const head = (title, sub, back) =>
    `<div class="zc-hd">${back ? '<button class="zc-ib" data-zc="list" aria-label="All conversations">‹</button>' : ''}<div class="zc-ht"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><button class="zc-ib" data-zc="close" aria-label="Close chat">×</button></div>`;
  function paint(scroll) {
    if (!C.open) return;
    const p = panel();
    if (C.list) {
      const L = threads();
      p.dataset.key = 'list';
      p.innerHTML =
        head('Messages', L.length ? 'Your trips and rentals' : '') +
        `<div class="zc-list">${
          L.length
            ? L.map(
                t => `<button class="zc-th" data-zc="th" data-k="${t.k}" data-id="${esc(t.id)}"><span class="zc-tt"><b>${esc(t.title)}</b>${t.unread ? `<span class="zc-n">${t.unread}</span>` : ''}</span><small>${esc(t.with.map(w => w.name + ' (' + w.role.toLowerCase() + ')').join(', '))}${t.open ? '' : ' · closed'}</small>${t.last ? `<span class="zc-lt">${esc(t.last.by)}: ${esc(t.last.x)}</span>` : '<span class="zc-lt mu">No messages yet</span>'}</button>`
              ).join('')
            : '<p class="mu" style="padding:16px">No conversations yet. A chat opens when a driver accepts your booking, or when you request a rental.</p>'
        }</div>`;
      return;
    }
    const t = threads().find(x => x.k == C.k && x.id == C.id) || {},
      info = C.info || {},
      who = (info.with || t.with || []).map(w => w.name + ' · ' + w.role).join(', '),
      openNow = info.open !== false && t.open !== false,
      member = info.member !== false,
      list = document.getElementById('zc-msgs'),
      atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 60,
      draft = (document.getElementById('zc-in') || {}).value || '';
    const lastMine = C.msgs.map((m, i) => (m.me ? i : -1)).filter(i => i >= 0).pop();
    const seenBy = Object.entries(info.seen || {}).filter(([, i]) => lastMine != null && i >= lastMine).map(([n]) => n);
    const msgs = C.msgs.length
      ? C.msgs
          .map((m, i) => {
            const day = i == 0 || new Date(C.msgs[i - 1].t).toDateString() != new Date(m.t).toDateString();
            return `${day ? `<div class="zc-day">${new Date(m.t).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</div>` : ''}<div class="zc-m ${m.me ? 'me' : ''}">${m.me ? '' : `<small class="zc-by">${esc(m.name)} · ${esc(m.role)}</small>`}<div class="zc-bub">${esc(m.x).replace(/\n/g, '<br>')}</div><small class="zc-t">${tm(m.t)}${m.me && i == lastMine && seenBy.length ? ' · Seen' : ''}</small></div>`;
          })
          .join('')
      : `<p class="zc-empty">${C.info ? 'No messages yet. Say hello, or tap a quick reply below.' : 'Loading…'}</p>`;
    const quick = (QUICK[myRole()] || []).map(q => `<button class="zc-q" data-zc="q">${esc(q)}</button>`).join('');
    const headH = head(t.title || (C.k == 'b' ? 'Trip ' : 'Rental ') + C.id, who, threads().length > 1),
      footMode = !member ? 'staff' : openNow ? 'open' : 'closed',
      footH = !member
        ? '<div class="zc-off">You are viewing this conversation as ZamMove staff.</div>'
        : openNow
          ? `<div class="zc-qr">${quick}</div><form class="zc-f" data-zc="form"><textarea id="zc-in" rows="1" maxlength="500" placeholder="Type a message" aria-label="Message"></textarea><button class="btn zc-send" type="submit" aria-label="Send">Send</button></form>`
          : `<div class="zc-off">This conversation is closed (the ${C.k == 'b' ? 'trip' : 'rental'} ended more than 24 hours ago). Use Report a problem if something is wrong.</div>`;
    /* three parts, each replaced only when its own content changes: the box you type in is never rebuilt
       while you type (rebuilding it every refresh took the focus away and cut sentences off) */
    const key = C.k + ':' + C.id;
    if (p.dataset.key != key || !p.querySelector('.zc-msgs')) {
      p.dataset.key = key;
      p.innerHTML = '<div class="zc-h"></div><div class="zc-msgs" id="zc-msgs" aria-live="polite"></div><div class="zc-foot"></div>';
    }
    const hEl = p.querySelector('.zc-h'),
      mEl = p.querySelector('.zc-msgs'),
      fEl = p.querySelector('.zc-foot');
    if (hEl.dataset.h != headH) (hEl.dataset.h = headH), (hEl.innerHTML = headH);
    if (mEl.dataset.h != msgs) (mEl.dataset.h = msgs), (mEl.innerHTML = msgs);
    if (fEl.dataset.mode != footMode) {
      fEl.dataset.mode = footMode;
      fEl.innerHTML = footH;
      const inp = document.getElementById('zc-in');
      if (inp && draft) inp.value = draft;
    }
    if (scroll || atBottom) mEl.scrollTop = mEl.scrollHeight;
  }

  /* the round button with the unread count */
  function fab() {
    let b = document.getElementById('zc-fab');
    const L = threads(),
      n = unread();
    if (!S.me || !L.length) return b && b.remove();
    if (!b) {
      b = document.createElement('button');
      b.id = 'zc-fab';
      b.setAttribute('data-zc', 'fab');
      document.body.appendChild(b);
    }
    const html = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>${n ? `<span class="zc-fn">${n > 9 ? '9+' : n}</span>` : ''}`;
    if (b.dataset.h != html) (b.dataset.h = html), (b.innerHTML = html);
    b.setAttribute('aria-label', n ? `Messages, ${n} unread` : 'Messages');
    b.classList.toggle('zc-hide', C.open);
    b.classList.toggle('zc-up', !!document.querySelector('.zr-fab, #zr-fab, [class*="zr-f"]'));
  }

  /* "Chat" buttons on Track, the driver's trip page and the rental cards */
  const chatBtn = (k, id, label) => {
    const t = threads().find(x => x.k == k && x.id == id);
    if (!t) return null;
    const b = document.createElement('button');
    b.className = 'btn o sm zc-inline';
    b.dataset.zc = 'th';
    b.dataset.k = k;
    b.dataset.id = id;
    b.innerHTML = `${esc(label)}${t.unread ? ` <span class="zc-n">${t.unread}</span>` : ''}`;
    return b;
  };
  const inline = () => {
    document.querySelectorAll('.zc-inline').forEach(x => x.remove());
    if (!S.me) return;
    /* customer Track: next to "View profile" of the driver */
    document.querySelectorAll('#app [data-a="fx-prof"][data-id]').forEach(p => {
      const b = chatBtn('b', p.dataset.id, 'Chat with driver');
      if (b) p.insertAdjacentElement('afterend', b);
    });
    /* driver Active trip: under the header */
    const head = document.querySelector('#app .ztd-head');
    if (head) {
      const h = head.querySelector('h1, h2'),
        m = h && h.textContent.match(/Active trip · (BK-[A-Z0-9]+)\s*$/);
      const b = m && chatBtn('b', m[1], 'Chat with customer');
      if (b) head.insertAdjacentElement('afterend', b);
    }
    /* rental cards (renter and owner): after the line that shows the rental reference */
    threads()
      .filter(t => t.k == 'r')
      .forEach(t => {
        const line = [...document.querySelectorAll('#app .mu')].find(x => x.textContent.includes(t.id) && !x.querySelector('.zc-inline'));
        const roles = t.with.map(w => w.role);
        const b = line && chatBtn('r', t.id, roles.includes('Owner') ? 'Chat with owner' : 'Chat with renter');
        if (b) line.insertAdjacentElement('afterend', b);
      });
  };

  /* ---------- events ---------- */
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('[data-zc]');
      if (!t || t.tagName == 'FORM') return;
      const a = t.dataset.zc;
      if (!['fab', 'th', 'list', 'close', 'q'].includes(a)) return;
      e.preventDefault();
      e.stopPropagation();
      if (a == 'fab') return C.open ? close() : openList();
      if (a == 'th') return openThread(t.dataset.k, t.dataset.id);
      if (a == 'list') return openList();
      if (a == 'close') return close();
      if (a == 'q') return send(t.textContent);
    },
    true
  );
  document.addEventListener(
    'submit',
    e => {
      if (!(e.target && e.target.dataset && e.target.dataset.zc == 'form')) return;
      e.preventDefault();
      send((document.getElementById('zc-in') || {}).value);
    },
    true
  );
  /* Enter sends, Shift+Enter makes a new line */
  document.addEventListener('keydown', e => {
    if (e.target && e.target.id == 'zc-in' && e.key == 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(e.target.value);
    }
    if (e.key == 'Escape' && C.open) close();
  });

  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    setTimeout(() => {
      try {
        fab();
        inline();
        if (C.open && C.list) paint();
        if (!S.me && C.open) close();
      } catch (x) {
        /* never break a redraw */
      }
    }, 0);
    return out;
  };

  const css = document.createElement('style');
  css.textContent = `
#zc-fab{position:fixed;right:24px;bottom:96px;z-index:940;width:56px;height:56px;border-radius:50%;border:0;background:var(--zb-pri,#0f766e);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;cursor:pointer;margin:0;padding:0}
#zc-fab:not(.zc-up){bottom:24px}#zc-fab.zc-hide{display:none}
.zc-fn,.zc-n{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;line-height:1}
.zc-fn{position:absolute;top:-2px;right:-2px;border:2px solid #fff}
#zc-panel{position:fixed;right:24px;bottom:24px;z-index:960;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--s,#fff);color:var(--tx,#0f172a);border:1px solid var(--bd,#e2e8f0);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.25);overflow:hidden}
.zc-hd{display:flex;align-items:center;gap:8px;padding:12px 12px 10px 16px;border-bottom:1px solid var(--bd,#e2e8f0);background:var(--zb-pri,#0f766e);color:#fff}
.zc-ht{flex:1;min-width:0;display:flex;flex-direction:column}.zc-ht b{font-size:16px}.zc-ht small{opacity:.85;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zc-ib{border:0;background:rgba(255,255,255,.15);color:#fff;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer;margin:0;padding:0;flex:none}
.zc-h,.zc-foot{flex:none}.zc-msgs{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px;background:var(--s2,#f8fafc)}
.zc-day{align-self:center;font-size:11.5px;color:var(--tx2,#64748b);background:var(--s,#fff);border:1px solid var(--bd,#e2e8f0);border-radius:999px;padding:2px 10px;margin:6px 0}
.zc-m{display:flex;flex-direction:column;align-items:flex-start;max-width:82%}.zc-m.me{align-self:flex-end;align-items:flex-end}
.zc-by{font-size:11.5px;color:var(--tx2,#64748b);margin:0 0 2px 4px}
.zc-bub{padding:8px 12px;border-radius:14px 14px 14px 4px;background:var(--s,#fff);border:1px solid var(--bd,#e2e8f0);font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}
.zc-m.me .zc-bub{background:var(--zb-pri,#0f766e);color:#fff;border-color:transparent;border-radius:14px 14px 4px 14px}
.zc-t{font-size:11px;color:var(--tx2,#64748b);margin:2px 4px 0}
.zc-empty{margin:auto;text-align:center;color:var(--tx2,#64748b);font-size:14px;padding:0 16px}
.zc-qr{display:flex;gap:6px;overflow-x:auto;padding:8px 10px 0;scrollbar-width:none}.zc-qr::-webkit-scrollbar{display:none}
.zc-q{flex:none;border:1px solid var(--bd,#e2e8f0);background:var(--s,#fff);color:var(--tx,#0f172a);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;margin:0;white-space:nowrap}
.zc-f{display:flex;gap:8px;padding:8px 10px 10px;align-items:flex-end;margin:0}
.zc-f textarea{flex:1;resize:none;min-height:40px;max-height:110px;border-radius:12px;padding:9px 12px;font:inherit;font-size:14.5px;margin:0}
.zc-send{margin:0;min-height:40px}
.zc-off{padding:12px 14px;font-size:13.5px;color:var(--tx2,#64748b);border-top:1px solid var(--bd,#e2e8f0)}
.zc-list{flex:1;overflow-y:auto}
.zc-th{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--bd,#e2e8f0);background:none;color:inherit;padding:12px 16px;cursor:pointer;margin:0;font:inherit}
.zc-th:hover{background:var(--s2,#f8fafc)}.zc-tt{display:flex;justify-content:space-between;gap:8px}.zc-th small{color:var(--tx2,#64748b);font-size:12.5px}.zc-lt{font-size:13.5px;color:var(--tx2,#475569);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zc-inline{margin:6px 0 6px 8px}
@media (max-width:720px){#zc-fab{right:16px;bottom:calc(150px + env(safe-area-inset-bottom))}#zc-fab:not(.zc-up){bottom:calc(84px + env(safe-area-inset-bottom))}#zc-panel{right:0;left:0;bottom:0;top:0;width:auto;height:auto;border-radius:0;border:0}}`;
  document.head.appendChild(css);
})();
