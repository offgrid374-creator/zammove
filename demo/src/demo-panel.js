/* Demo panel: log in as any example account in one click, follow a suggested script, reset the data.
   Only part of the front-end demo; the real system has no such panel. */
(() => {
  const PW = window.ZM_ENGINE.password;
  const ACC = [
    ['Customers', 'Customer', [
      ['carla@zammove.ph', 'Carla Mendoza', 'Move in progress (Start PIN) · approved rental', 'customer'],
      ['bea@zammove.ph', 'Bea Santos', 'Truck on the way: live map', 'customer'],
      ['jun@zammove.ph', 'Jun Alvarez', 'Booking waiting for a driver', 'customer'],
    ]],
    ['Drivers', 'Driver', [
      ['leo@zammove.ph', 'Leo Garcia', 'Free: accepts new jobs', 'driver'],
      ['dina@zammove.ph', 'Dina Reyes', 'Trip at loading: Start PIN, checklist', 'driver'],
      ['ramon@zammove.ph', 'Ramon Cruz', 'Heading to a pickup', 'driver'],
    ]],
    ['Vehicle owner', 'Vehicle owner', [['olga@zammove.ph', 'Olga Navarro', '9 vehicles: fleet map, earnings, rentals, drivers', 'owner']]],
    ['Cashier', 'Cashier', [['kim@zammove.ph', 'Kim Bautista', 'Income, remittances, payouts, flags', 'cashier']]],
    ['Administrator', 'Administrator', [['ada@zammove.ph', 'Ada Villanueva', 'Overview, users, approvals, incidents', 'admin']]],
  ];
  const COLOR = { Customer: '#0f766e', Driver: '#1d4ed8', 'Vehicle owner': '#6d28d9', Cashier: '#b45309', Administrator: '#b91c1c' };
  const SCRIPT = [
    ['Customer books', 'Log in as <b>Jun</b> (or sign up as a new customer). Book a haul: search two places or tap the map, choose the <b>L300 Van</b> (the example drivers drive L300s), a date, items, then submit.'],
    ['Driver accepts', 'Switch to <b>Leo</b>. Driver workspace → Requests → Accept. Open Active trip to see the best route.'],
    ['Pickup and payment', 'Leo: Start heading → arrive; Jun: pay the 50% down payment; Leo confirms it and loads the cargo.'],
    ['Start PIN', 'Jun: Track → show the Start PIN. Leo: enter it, check the plate, the cargo checklist; Jun confirms; Leo authorizes departure.'],
    ['Delivery', 'Leo: arrive → Jun shows the Delivery PIN → Leo confirms delivery → final payment → Jun rates the driver.'],
    ['Money', 'Switch to <b>Olga</b> (Earnings: her share), <b>Kim</b> (Income, Settlements, pay the owner) and <b>Ada</b> (Overview, Users).'],
    ['Rental', 'As <b>Carla</b>: Rent → choose dates and a unit; as <b>Olga</b>: Rentals → approve; both sign the contract.'],
  ];
  const el = document.createElement('div');
  el.id = 'zdemo';
  document.body.appendChild(el);
  let msgs = [];
  const loadMsgs = async () => {
    const [, j] = await window.ZM_ENGINE.handle('GET', '/dev/inbox', undefined, null);
    msgs = (j && j.messages) || [];
  };
  /* the app's "Open the simulated inbox" links open this tab */
  window.ZM_DEMO_INBOX = async () => {
    open = true;
    tab = 'msgs';
    await loadMsgs();
    paint();
  };
  let open = false,
    tab = 'acc',
    confirmReset = false,
    busy = '';
  const meEm = () => (typeof S != 'undefined' && S.me ? S.me.em : '');
  const paint = () => {
    const me = meEm();
    const acc = ACC.map(
      ([g, role, list]) =>
        `<div class="zd-g"><div class="zd-gh">${g}</div>${list
          .map(
            ([em, name, what, ws]) =>
              `<button class="zd-acc ${me == em ? 'on' : ''}" data-zd="as" data-em="${em}" data-ws="${ws}"><span class="zd-av" style="background:${COLOR[role]}">${name
                .split(' ')
                .map(x => x[0])
                .join('')}</span><span class="zd-tx"><b>${name}</b><small>${what}</small></span>${me == em ? '<span class="zd-on">signed in</span>' : busy == em ? '<span class="zd-on">…</span>' : ''}</button>`
          )
          .join('')}</div>`
    ).join('');
    el.innerHTML = `<button class="zd-fab" data-zd="toggle" aria-expanded="${open}" title="Demo panel">${open ? '×' : 'Demo'}</button>
${
  open
    ? `<div class="zd-panel" role="dialog" aria-label="Demo panel"><div class="zd-head"><b>ZamMove demo</b><span>No server: everything runs in this browser</span></div>
<div class="zd-tabs"><button data-zd="tab" data-t="acc" aria-pressed="${tab == 'acc'}">Accounts</button><button data-zd="tab" data-t="script" aria-pressed="${tab == 'script'}">Demo script</button><button data-zd="tab" data-t="msgs" aria-pressed="${tab == 'msgs'}">Messages</button><button data-zd="tab" data-t="data" aria-pressed="${tab == 'data'}">Data</button></div>
<div class="zd-body">${
        tab == 'acc'
          ? `<p class="zd-note">One click logs in as that person. Password for every account: <code>${PW}</code></p>${acc}<div class="zd-row"><button class="zd-btn" data-zd="signup">Sign up as a new customer</button>${me ? '<button class="zd-btn ghost" data-zd="out">Log out</button>' : ''}</div>`
          : tab == 'msgs'
            ? `<p class="zd-note">Simulated SMS and email: verification codes, password reset codes and a recipient’s Delivery PIN (no real SMS/email provider is connected).</p>${msgs.length ? msgs.map(m => `<div class="zd-msg"><small>${m.ch} to ${m.to} · ${new Date(m.t).toLocaleTimeString()}</small><div>${String(m.b).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</div></div>`).join('') : '<p class="zd-note">No messages yet. Sign up or use “Forgot password” to see one.</p>'}<button class="zd-btn ghost" data-zd="tab" data-t="msgs">Refresh</button>`
          : tab == 'script'
            ? `<ol class="zd-steps">${SCRIPT.map(([h, t]) => `<li><b>${h}</b><span>${t}</span></li>`).join('')}</ol><p class="zd-note">Tip: open this page in a second window (customer on one side, driver on the other). Each window logs in separately and sees the other’s changes within about 10 seconds.</p>`
            : `<p class="zd-note">Data is saved in this browser only, so you can close and reopen the demo. Seeded ${new Date(window.ZM_ENGINE.seededAt() || Date.now()).toLocaleString()}.</p>${window.ZM_ENGINE.storageFull() ? '<p class="zd-warn">The browser’s storage is full; changes will not survive a reload. Reset the demo.</p>' : ''}${
                confirmReset
                  ? `<p class="zd-warn">Reset puts back the example data with today’s dates and logs everyone out. Continue?</p><div class="zd-row"><button class="zd-btn danger" data-zd="reset-yes">Yes, reset</button><button class="zd-btn ghost" data-zd="reset-no">Cancel</button></div>`
                  : `<button class="zd-btn" data-zd="reset">Reset demo data</button>`
              }<p class="zd-note">Maps, address search and road routes need internet; everything else works offline.</p>`
      }</div></div>`
    : ''
}`;
  };
  const as = async (em, ws) => {
    busy = em;
    paint();
    ZAPI.logout();
    const r = await ZAPI.auth('login', { em, pw: PW });
    busy = '';
    if (!r.ok) {
      paint();
      return typeof toast == 'function' && toast(r.err);
    }
    S.me = r.me;
    S.ws = ws;
    S.wp = S.wp || {};
    msg = {};
    save();
    location.hash = '#home';
    render();
    window.scrollTo(0, 0);
    if (typeof toast == 'function') toast('Signed in as ' + r.me.name);
    open = false; // out of the way of the page; one click on Demo brings it back
    paint();
  };
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-zd]');
    if (!t) return;
    const a = t.dataset.zd;
    if (a == 'toggle') open = !open;
    if (a == 'tab') {
      tab = t.dataset.t;
      if (tab == 'msgs') await loadMsgs();
    }
    if (a == 'as') return as(t.dataset.em, t.dataset.ws);
    if (a == 'out' || a == 'signup') {
      ZAPI.logout();
      S.me = null;
      S.ws = 'customer';
      msg = a == 'signup' ? { mode: 'up' } : {};
      save();
      location.hash = '';
      render();
      window.scrollTo(0, 0);
      if (a == 'signup') open = false;
    }
    if (a == 'reset') confirmReset = true;
    if (a == 'reset-no') confirmReset = false;
    if (a == 'reset-yes') {
      await window.ZM_ENGINE.reset();
      ZAPI.logout();
      try {
        sessionStorage.clear();
        localStorage.removeItem('zm5');
        localStorage.removeItem('zammove-demo-state');
      } catch (e) {}
      location.hash = '';
      location.reload();
      return;
    }
    paint();
  });
  /* keep the "signed in" marker right after the page logs in or out by itself */
  const _r = render; // the app's global render (a top-level variable, not a window property)
  render = function () {
    _r();
    if (open) paint();
  };
  const css = document.createElement('style');
  css.textContent = `
#zdemo{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:3000;font:14px/1.45 Geist,system-ui,sans-serif;color:#0f172a}
@media (max-width:720px){#zdemo{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}
.zd-fab{min-width:56px;height:44px;padding:0 16px;border:0;border-radius:999px;background:#0f172a;color:#fff;font:700 14px Geist,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.35)}
.zd-fab::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#f28c28;margin-right:8px;vertical-align:1px}
.zd-panel{position:absolute;left:0;bottom:54px;width:min(380px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 120px));display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.35);overflow:hidden}
.zd-head{padding:14px 16px 10px;background:linear-gradient(90deg,#e0392b 0 16.6%,#f28c28 16.6% 33.3%,#f6c343 33.3% 50%,#2ba36b 50% 66.6%,#2563eb 66.6% 83.3%,#7c3aed 83.3% 100%) top/100% 4px no-repeat,#0f172a;color:#fff}
.zd-head b{display:block;font:800 17px 'Bricolage Grotesque',system-ui,sans-serif}.zd-head span{font-size:12.5px;color:#cbd5e1}
.zd-tabs{display:flex;gap:4px;padding:8px;border-bottom:1px solid #e2e8f0}
.zd-tabs button{flex:1;border:0;background:transparent;border-radius:10px;padding:7px 4px;font:600 13px Geist,system-ui,sans-serif;color:#475569;cursor:pointer}
.zd-tabs button[aria-pressed=true]{background:#e7f4f1;color:#0b3d38}
.zd-body{overflow:auto;padding:12px 12px 16px}
.zd-note{margin:4px 4px 10px;font-size:12.5px;color:#64748b}.zd-note code{background:#f1f5f9;padding:1px 6px;border-radius:6px;color:#0f172a}
.zd-warn{margin:6px 4px 10px;font-size:13px;color:#9f1239;background:#fff1f2;border-radius:10px;padding:8px 10px}
.zd-g{margin-bottom:8px}.zd-gh{font:700 11px Geist,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:6px 4px}
.zd-acc{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:transparent;border-radius:12px;padding:7px 8px;cursor:pointer;color:inherit}
.zd-acc:hover{background:#f1f5f9}.zd-acc.on{background:#e7f4f1}
.zd-av{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:#fff;font:700 12px Geist,system-ui,sans-serif}
.zd-tx{flex:1;min-width:0}.zd-tx b{display:block;font-size:14px}.zd-tx small{display:block;font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zd-on{font:600 11px Geist,system-ui,sans-serif;color:#0f766e}
.zd-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.zd-btn{min-height:38px;padding:0 14px;border:0;border-radius:11px;background:#0f5c53;color:#fff;font:600 13px Geist,system-ui,sans-serif;cursor:pointer}
.zd-btn.ghost{background:#fff;color:#0f172a;box-shadow:inset 0 0 0 1px #cbd5e1}.zd-btn.danger{background:#be123c}
.zd-msg{padding:8px 4px;border-top:1px solid #e2e8f0;font-size:13.5px}.zd-msg small{color:#64748b;display:block}.zd-steps{margin:0;padding:0 4px 0 22px;display:grid;gap:10px}.zd-steps b{display:block}.zd-steps span{font-size:13px;color:#475569}
html[data-mode='dark'] .zd-panel{background:#111b1a;color:#ecf3f2}html[data-mode='dark'] .zd-acc:hover{background:#182423}`;
  document.head.appendChild(css);
  paint();
})();
