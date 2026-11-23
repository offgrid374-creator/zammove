/**
 * 13-drivers.js — driver ↔ vehicle assignments (loaded last). Built with Tailwind classes (tw- prefix).
 *
 * Steps: request (owner assigns / recommends, or an admin assigns from the pool) → the driver accepts →
 * driver and owner sign the driver agreement (online or a signed paper copy) → an admin activates it after
 * checking documents → either side can end it with a reason.
 *
 * Pages: Vehicle Owner → Drivers, Driver → Assignment & documents, Admin → Assignments.
 * Every rule is enforced by the server (backend/src/domain/drivers.js); this file draws screens and sends requests.
 */
(() => {
  const me = () => (S.me || {}).em;
  const U = em => (S.users || []).find(u => u.em == em) || {};
  const V = id => (S.vh || []).find(v => v.id == id) || {};
  const vname = v => `${v.brand || ''} ${v.model || ''}`.trim() || 'Vehicle';
  const rentOnly = v => ((S.fleet || {}).RT || []).some(t => t.id == v.type);
  const okr = (u, t) => (window.ZW && ZW.ok ? ZW.ok(u, t) : false);
  const activeOf = em => (S.asg || []).find(a => a.driver == em && a.st == 'Active');
  const vehDriver = vid => (S.asg || []).find(a => a.vehicle == vid && a.st == 'Active');
  const today = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const days = d => Math.round((new Date(d) - new Date(today())) / 864e5);
  const fmt = d =>
    d
      ? new Date(d + (d.length == 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';
  const dt = t => (t ? new Date(t).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const initials = n =>
    String(n || '?')
      .split(' ')
      .map(x => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  const OPEN = [
    'Waiting for Application',
    'Pending Admin Review',
    'Awaiting Driver',
    'Awaiting Agreement',
    'Pending Activation',
  ];
  const CLOSED = ['Rejected', 'Declined', 'Cancelled', 'Ended'];
  let msg = { t: '', good: true };

  /* ---------------- small Tailwind building blocks ---------------- */
  const TONE = {
    'Waiting for Application': 'tw-bg-amber-50 tw-text-amber-800 tw-ring-amber-200',
    'Pending Admin Review': 'tw-bg-amber-50 tw-text-amber-800 tw-ring-amber-200',
    'Awaiting Driver': 'tw-bg-sky-50 tw-text-sky-800 tw-ring-sky-200',
    'Awaiting Agreement': 'tw-bg-violet-50 tw-text-violet-800 tw-ring-violet-200',
    'Pending Activation': 'tw-bg-harbor-50 tw-text-harbor-800 tw-ring-harbor-200',
    Active: 'tw-bg-emerald-50 tw-text-emerald-800 tw-ring-emerald-200',
    Rejected: 'tw-bg-rose-50 tw-text-rose-700 tw-ring-rose-200',
    Declined: 'tw-bg-rose-50 tw-text-rose-700 tw-ring-rose-200',
  };
  const pill = (st, label) =>
    `<span class="tw-inline-flex tw-items-center tw-gap-1.5 tw-whitespace-nowrap tw-rounded-full tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-semibold tw-ring-1 tw-ring-inset ${TONE[st] || 'tw-bg-slate-100 tw-text-slate-600 tw-ring-slate-200'}"><span class="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-current tw-opacity-70"></span>${esc(label || st)}</span>`;
  const section = (title, sub, body, extra = '') =>
    `<section class="tw-mt-8"><div class="tw-mb-3 tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-2"><div><h2 class="tw-m-0 tw-text-xl">${title}</h2>${sub ? `<p class="tw-m-0 tw-mt-1 tw-text-sm tw-text-slate-500">${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
  const panel = (body, cls = '') =>
    `<div class="tw-rounded-2xl tw-bg-white tw-p-5 tw-shadow-card tw-ring-1 tw-ring-slate-900/5 ${cls}">${body}</div>`;
  const empty = t =>
    `<div class="tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-300 tw-bg-white/60 tw-px-5 tw-py-8 tw-text-center tw-text-sm tw-text-slate-500">${t}</div>`;
  const avatar = (u, size = 'tw-h-10 tw-w-10') =>
    u.photo
      ? `<img src="${esc(u.photo)}" alt="" class="${size} tw-flex-none tw-rounded-full tw-object-cover tw-ring-2 tw-ring-white">`
      : `<span class="${size} tw-inline-grid tw-flex-none tw-place-items-center tw-rounded-full tw-bg-harbor-100 tw-text-sm tw-font-bold tw-text-harbor-800">${esc(initials(u.name))}</span>`;
  const btn = (a, label, id, kind = 'primary', x = '') => {
    const k = {
      primary: 'tw-bg-harbor-700 tw-text-white hover:tw-bg-harbor-800 tw-shadow-sm',
      outline: 'tw-bg-white tw-text-slate-800 tw-ring-1 tw-ring-inset tw-ring-slate-300 hover:tw-bg-slate-50',
      danger: 'tw-bg-white tw-text-rose-700 tw-ring-1 tw-ring-inset tw-ring-rose-300 hover:tw-bg-rose-50',
      ghost: 'tw-bg-transparent tw-text-harbor-700 hover:tw-bg-harbor-50',
    }[kind];
    return `<button type="button" class="tw-inline-flex tw-min-h-[40px] tw-cursor-pointer tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border-0 tw-px-4 tw-text-sm tw-font-semibold tw-transition ${k}" data-a="${a}" ${id ? `data-id="${esc(id)}"` : ''} ${x}>${label}</button>`;
  };
  const field = (id, label, input) =>
    `<label for="${id}" class="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-font-medium tw-text-slate-700">${label}${input}</label>`;
  const inputCls = 'tw-w-full tw-min-h-[44px] tw-text-sm';
  const docStatus = (label, d) => {
    if (!d)
      return `<div class="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-py-2"><span class="tw-text-sm tw-text-slate-600">${label}</span>${pill('', 'No expiry date on file')}</div>`;
    const n = days(d),
      p =
        n < 0
          ? pill('Rejected', 'Expired ' + fmt(d))
          : n <= 30
            ? pill('Waiting for Application', 'Expires in ' + n + ' days')
            : pill('Active', 'Valid until ' + fmt(d));
    return `<div class="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-py-2"><span class="tw-text-sm tw-text-slate-600">${label}</span>${p}</div>`;
  };
  const dx = u => u.dx || { lic: u.licExp || '' };
  const docProblems = u => {
    const d = dx(u),
      out = [];
    if (d.lic && d.lic < today()) out.push('license expired');
    if (d.clr && d.clr < today()) out.push('clearance expired');
    return out;
  };

  /* the 4-step progress of one assignment */
  const STEPS = ['Request', 'Driver accepts', 'Agreement signed', 'Activated'];
  const stepIdx = st =>
    ({
      'Waiting for Application': 0,
      'Pending Admin Review': 0,
      'Awaiting Driver': 1,
      'Awaiting Agreement': 2,
      'Pending Activation': 3,
      Active: 4,
    })[st];
  const stepper = a => {
    const i = stepIdx(a.st);
    if (i == null) return '';
    return `<ol class="tw-m-0 tw-mt-4 tw-grid tw-list-none tw-grid-cols-4 tw-gap-2 tw-p-0">${STEPS.map(
      (s, j) => {
        const done = j < i,
          cur = j == i;
        return `<li class="tw-flex tw-flex-col tw-gap-1.5"><span class="tw-h-1.5 tw-rounded-full ${done ? 'tw-bg-harbor-600' : cur ? 'tw-bg-harbor-300' : 'tw-bg-slate-200'}"></span><span class="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide ${done || cur ? 'tw-text-harbor-800' : 'tw-text-slate-400'}">${s}</span></li>`;
      }
    ).join('')}</ol>`;
  };
  const termsLine = t =>
    t
      ? `<div class="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2 tw-text-xs">${[
          ['Driver’s share', t.pct + '%'],
          ['Fuel', t.fuel],
          ['Notice', t.notice + ' days'],
          ['Starts', fmt(t.start)],
        ]
          .map(
            ([k, x]) =>
              `<span class="tw-rounded-lg tw-bg-slate-50 tw-px-2.5 tw-py-1 tw-ring-1 tw-ring-slate-200"><span class="tw-text-slate-500">${k}</span> <b class="tw-font-semibold tw-text-slate-800">${esc(x)}</b></span>`
          )
          .join('')}</div>`
      : '';
  const termsForm = pre =>
    `<div class="tw-grid tw-gap-4 sm:tw-grid-cols-2 lg:tw-grid-cols-4">
${field(pre + '-pct', 'Driver’s share (%)', `<input id="${pre}-pct" type="number" min="10" max="90" value="30" class="${inputCls}">`)}
${field(pre + '-fuel', 'Fuel paid by', `<select id="${pre}-fuel" class="${inputCls}"><option>Owner</option><option>Driver</option><option>Shared</option></select>`)}
${field(pre + '-notice', 'Notice to end (days)', `<input id="${pre}-notice" type="number" min="1" max="30" value="7" class="${inputCls}">`)}
${field(pre + '-start', 'Start date', `<input id="${pre}-start" type="date" min="${today()}" value="${today()}" class="${inputCls}">`)}</div>`;
  const termsVal = pre => ({
    pct: val(pre + '-pct'),
    fuel: val(pre + '-fuel'),
    notice: val(pre + '-notice'),
    start: val(pre + '-start'),
  });
  const msgBox = () =>
    msg.t
      ? `<div role="status" aria-live="polite" class="tw-mt-4 tw-rounded-xl tw-px-4 tw-py-3 tw-text-sm tw-font-medium tw-ring-1 ${msg.good ? 'tw-bg-emerald-50 tw-text-emerald-800 tw-ring-emerald-200' : 'tw-bg-rose-50 tw-text-rose-800 tw-ring-rose-200'}">${esc(msg.t)}</div>`
      : '';
  const pageHead = (title, sub) =>
    `<div class="tw-flex tw-flex-col tw-gap-2"><span class="vinta-stripe"></span><h1 class="tw-m-0">${title}</h1><p class="tw-m-0 tw-max-w-3xl tw-text-slate-500">${sub}</p></div>${msgBox()}`;
  const howItWorks = () =>
    `<div class="tw-mt-6 tw-grid tw-gap-3 sm:tw-grid-cols-2 lg:tw-grid-cols-4">${[
      ['1', 'Request', 'The owner assigns or recommends a driver, or ZamMove assigns one from the pool.'],
      ['2', 'Driver accepts', 'The driver sees the vehicle and the terms, then accepts or declines.'],
      ['3', 'Agreement', 'Driver and owner sign the driver agreement, online or on paper.'],
      ['4', 'Activation', 'ZamMove checks the documents and activates the assignment.'],
    ]
      .map(
        ([n, h, d]) =>
          `<div class="tw-flex tw-gap-3 tw-rounded-2xl tw-bg-white tw-p-4 tw-ring-1 tw-ring-slate-900/5"><span class="tw-grid tw-h-7 tw-w-7 tw-flex-none tw-place-items-center tw-rounded-full tw-bg-harbor-700 tw-text-xs tw-font-bold tw-text-white">${n}</span><div><b class="tw-text-sm tw-text-slate-900">${h}</b><p class="tw-m-0 tw-mt-0.5 tw-text-xs tw-leading-relaxed tw-text-slate-500">${d}</p></div></div>`
      )
      .join('')}</div>`;

  /* one assignment as a card; role: ow | dr | ad */
  const card = (a, role) => {
    const v = V(a.vehicle),
      d = U(a.driver),
      o = U(v.owner),
      id = a.id,
      sg = (a.ag && a.ag.sg) || {},
      mine = role == 'dr' ? 'dr' : 'ow';
    let act = '';
    if (a.st == 'Awaiting Driver' && role == 'dr')
      act = `<div class="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${btn('zdr-accept', 'Accept vehicle', id)}<input id="zdr-why-${esc(id)}" placeholder="Reason, if you decline" class="tw-min-h-[40px] tw-flex-1 tw-text-sm" style="min-width:200px">${btn('zdr-decline', 'Decline', id, 'danger')}</div>`;
    if (a.st == 'Awaiting Agreement' && role != 'ad')
      act = `<div class="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${btn('zdr-open', sg[mine] ? 'View agreement' : 'Read and sign agreement', id, sg[mine] ? 'outline' : 'primary')}${btn('zdr-print', 'Print', id, 'outline')}<span class="tw-text-xs tw-text-slate-500">Driver: ${sg.dr ? 'signed' : 'not yet'} · Owner: ${sg.ow ? 'signed' : 'not yet'}</span></div>`;
    if (a.st == 'Pending Activation' && role == 'ad') {
      const probs = [
        ...docProblems(d),
        ...(v.regExp && v.regExp < today() ? ['vehicle registration expired'] : []),
      ];
      act = `<div class="tw-mt-4 tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-ring-1 tw-ring-slate-200"><b class="tw-text-sm">Document check</b>${docStatus('Driver’s license', dx(d).lic)}${docStatus('NBI/police clearance', dx(d).clr)}${docStatus('Vehicle registration', v.regExp)}</div><div class="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">${probs.length ? `<span class="tw-text-sm tw-font-medium tw-text-rose-700">Cannot activate: ${esc(probs.join(', '))}.</span>` : btn('zdr-activate', 'Activate assignment', id)}${btn('zdr-open', 'View agreement', id, 'outline')}</div>`;
    }
    if (a.st == 'Pending Activation' && role != 'ad')
      act = `<div class="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-2"><span class="tw-text-sm tw-text-slate-500">Signed by both. ZamMove checks the documents and activates it.</span>${btn('zdr-open', 'View agreement', id, 'outline')}</div>`;
    if (a.st == 'Active' && a.ag)
      act = `<div class="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">${btn('zdr-open', 'View agreement', id, 'outline')}${btn('zdr-print', 'Print', id, 'outline')}</div>`;
    if (a.st == 'Pending Admin Review' && role == 'ad')
      act = `<div class="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${okr(d, 'driver') ? btn('zdr-approve', 'Approve request', id) : `<span class="tw-text-sm tw-text-amber-700">The driver is not approved yet.</span>`}<input id="zdr-rej-${esc(id)}" placeholder="Reason to reject" class="tw-min-h-[40px] tw-flex-1 tw-text-sm" style="min-width:200px">${btn('zdr-reject', 'Reject', id, 'danger')}</div>`;
    const canEnd =
      (OPEN.includes(a.st) || a.st == 'Active') &&
      !(role == 'dr' && a.st == 'Awaiting Driver') &&
      (role == 'ad' || role == 'dr' || role == 'ow');
    const end = canEnd
      ? `<details class="tw-mt-3"><summary class="tw-cursor-pointer tw-text-sm tw-font-medium tw-text-slate-500 hover:tw-text-slate-800">${a.st == 'Active' ? 'End this assignment' : 'Cancel this request'}</summary><div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2"><input id="zdr-end-${esc(id)}" placeholder="${a.st == 'Active' ? 'Reason (the agreement’s notice period applies)' : 'Reason'}" class="tw-min-h-[40px] tw-flex-1 tw-text-sm" style="min-width:220px">${btn('zdr-end', a.st == 'Active' ? 'End assignment' : 'Cancel request', id, 'danger')}</div></details>`
      : '';
    const last = (a.hist || []).slice(-1)[0] || {};
    return `<article class="tw-rounded-2xl tw-bg-white tw-p-5 tw-shadow-card tw-ring-1 tw-ring-slate-900/5">
<div class="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3"><div class="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-3">${avatar(d)}<div class="tw-min-w-0"><div class="tw-truncate tw-font-semibold tw-text-slate-900">${esc(d.name || a.driver)}</div><div class="tw-text-sm tw-text-slate-500">${esc(vname(v))} · <span class="tw-font-mono tw-text-slate-700">${esc(v.plate || '')}</span>${role != 'ow' ? ' · owner ' + esc(o.name || v.owner || '') : ''}</div></div></div><div class="tw-flex tw-flex-col tw-items-end tw-gap-1">${pill(a.st)}<span class="tw-text-[11px] tw-text-slate-400">${esc(a.mode || '')}${a.ag ? ' · ' + esc(a.ag.terms.no) : ''}</span></div></div>
${stepper(a)}${termsLine(a.terms)}${CLOSED.includes(a.st) && last.note ? `<p class="tw-m-0 tw-mt-3 tw-text-sm tw-text-slate-500">${esc(a.st)}: ${esc(last.note)}</p>` : ''}${a.st == 'Waiting for Application' ? `<p class="tw-m-0 tw-mt-3 tw-text-sm tw-text-amber-700">Waiting for ${esc(d.name || a.driver)} to apply and be approved as a driver. The request moves on by itself when the application is approved.</p>` : ''}${act}${end}</article>`;
  };
  const list = (as, role, none) =>
    as.length
      ? `<div class="tw-grid tw-gap-4 lg:tw-grid-cols-2">${as.map(a => card(a, role)).join('')}</div>`
      : empty(none);

  /* ---------------- Vehicle Owner → Drivers ---------------- */
  const ownerPage = () => {
    const em = me(),
      mine = (S.vh || []).filter(v => v.owner == em && v.approval == 'Approved' && !rentOnly(v)),
      as = (S.asg || [])
        .filter(a => mine.some(v => v.id == a.vehicle) || V(a.vehicle).owner == em)
        .slice()
        .reverse(),
      pool = (S.users || []).filter(u => okr(u, 'driver') && !activeOf(u.em) && u.em != em);
    const fleet = mine.length
      ? `<div class="tw-grid tw-gap-3 sm:tw-grid-cols-2 lg:tw-grid-cols-3">${mine
          .map(v => {
            const a = vehDriver(v.id),
              d = a ? U(a.driver) : null;
            return `<div class="tw-flex tw-items-center tw-gap-3 tw-rounded-2xl tw-bg-white tw-p-4 tw-ring-1 tw-ring-slate-900/5">${d ? avatar(d) : `<span class="tw-grid tw-h-10 tw-w-10 tw-place-items-center tw-rounded-full tw-border tw-border-dashed tw-border-slate-300 tw-text-slate-400">+</span>`}<div class="tw-min-w-0"><div class="tw-truncate tw-font-semibold tw-text-slate-900">${esc(vname(v))} <span class="tw-font-mono tw-text-xs tw-text-slate-500">${esc(v.plate)}</span></div><div class="tw-text-sm ${d ? 'tw-text-slate-600' : 'tw-text-amber-700'}">${d ? esc(d.name) : 'No driver yet'}</div></div></div>`;
          })
          .join('')}</div>`
      : empty('No approved hauling vehicles yet. Register one under Vehicles.');
    const poolTbl = pool.length
      ? panel(
          `<div class="tw-overflow-x-auto"><table class="tw-w-full tw-border-collapse tw-text-sm"><thead><tr class="tw-text-left tw-text-[11px] tw-uppercase tw-tracking-wider tw-text-slate-500"><th class="tw-py-2 tw-pr-3 tw-font-semibold">Driver</th><th class="tw-py-2 tw-pr-3 tw-font-semibold">Verification</th><th class="tw-py-2 tw-pr-3 tw-font-semibold">Trips</th><th></th></tr></thead><tbody>${pool
            .map(
              u =>
                `<tr class="tw-border-0 tw-border-t tw-border-solid tw-border-slate-100"><td class="tw-py-3 tw-pr-3"><div class="tw-flex tw-items-center tw-gap-3">${avatar(u, 'tw-h-8 tw-w-8')}<span class="tw-font-medium tw-text-slate-900">${esc(u.name)}</span></div></td><td class="tw-py-3 tw-pr-3">${pill('Active', 'Verified driver')}${u.licExp ? `<div class="tw-mt-1 tw-text-xs tw-text-slate-500">License valid until ${fmt(u.licExp)}</div>` : ''}</td><td class="tw-py-3 tw-pr-3 tw-text-slate-600">${u.trips || 0}</td><td class="tw-py-3 tw-text-right">${btn('zdr-pick', 'Choose', null, 'outline', `data-em="${esc(u.em)}"`)}</td></tr>`
            )
            .join(
              ''
            )}</tbody></table></div><p class="tw-m-0 tw-mt-3 tw-text-xs tw-text-slate-500">You see each driver’s verification status only. Their ID, license and clearance stay with ZamMove.</p>`
        )
      : empty('No approved drivers without a vehicle right now. You can still recommend someone below.');
    const form = panel(`<div class="tw-grid tw-gap-4 sm:tw-grid-cols-2">
${field('zdr-veh', 'Vehicle', `<select id="zdr-veh" class="${inputCls}"><option value="">Choose a vehicle</option>${mine.map(v => `<option value="${esc(v.id)}">${esc(vname(v))} · ${esc(v.plate)}${vehDriver(v.id) ? ' (has a driver)' : ''}</option>`).join('')}</select>`)}
${field('zdr-em', 'Driver’s email (registered account)', `<input id="zdr-em" type="email" placeholder="name@example.com" class="${inputCls}">`)}</div>
<div class="tw-mt-4">${termsForm('zdr-t')}</div>
<div class="tw-mt-4">${field('zdr-note', 'Note to ZamMove (optional)', `<input id="zdr-note" class="${inputCls}" placeholder="e.g. worked with me before, knows the vehicle">`)}</div>
<div class="tw-mt-5 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${btn('zdr-req', 'Assign approved driver', null, 'primary', 'data-m="assign"')}${btn('zdr-req', 'Recommend a driver', null, 'outline', 'data-m="recommend"')}<span class="tw-text-xs tw-text-slate-500">Recommend someone who has not applied yet: they get an invitation, and the request continues when their application is approved.</span></div>`);
    const open = as.filter(a => !CLOSED.includes(a.st)),
      closed = as.filter(a => CLOSED.includes(a.st));
    return `<div class="tw-pb-10">${pageHead('Drivers', 'Find a driver for each hauling vehicle. Every assignment needs the driver’s acceptance, a signed driver agreement and ZamMove’s activation.')}${howItWorks()}
${section('Your vehicles', '', fleet)}
${section('Driver pool', 'Approved drivers without a vehicle.', poolTbl)}
${section('Assign or recommend a driver', 'Set the terms the driver will see before accepting.', form)}
${section('Assignments', '', list(open, 'ow', 'No open assignments.'))}
${closed.length ? `<details class="tw-mt-6"><summary class="tw-cursor-pointer tw-text-sm tw-font-semibold tw-text-slate-500">History (${closed.length})</summary><div class="tw-mt-3">${list(closed, 'ow', '')}</div></details>` : ''}</div>`;
  };

  /* ---------------- Driver → Assignment & documents ---------------- */
  const driverPage = () => {
    const em = me(),
      u = U(em),
      as = (S.asg || [])
        .filter(a => a.driver == em)
        .slice()
        .reverse(),
      offers = as.filter(a => a.st == 'Awaiting Driver'),
      now = as.filter(a => ['Awaiting Agreement', 'Pending Activation', 'Active'].includes(a.st)),
      past = as.filter(
        a => CLOSED.includes(a.st) || ['Waiting for Application', 'Pending Admin Review'].includes(a.st)
      );
    const docs =
      panel(`${docStatus('Driver’s license', dx(u).lic)}<div class="tw-border-0 tw-border-t tw-border-solid tw-border-slate-100"></div>${docStatus('NBI or police clearance', dx(u).clr)}
<details class="tw-mt-3"><summary class="tw-cursor-pointer tw-text-sm tw-font-semibold tw-text-harbor-700">Upload a renewed document</summary><div class="tw-mt-3 tw-grid tw-gap-4 sm:tw-grid-cols-3">
${field('zdr-dk', 'Document', `<select id="zdr-dk" class="${inputCls}"><option value="lic">Driver’s license</option><option value="clr">NBI or police clearance</option></select>`)}
${field('zdr-dx', 'New expiry date', `<input id="zdr-dx" type="date" min="${today()}" class="${inputCls}">`)}
${field('zdr-df', 'Photo of the document', `<input id="zdr-df" type="file" accept="image/*">`)}</div><div class="tw-mt-3">${btn('zdr-doc', 'Save renewed document')}</div></details>
<p class="tw-m-0 tw-mt-3 tw-text-xs tw-text-slate-500">Bookings stop automatically when a document expires, until you upload the renewed one.</p>`);
    return `<div class="tw-pb-10">${pageHead('Assignment & documents', 'Vehicles offered to you, your driver agreement and the documents that keep you on the road.')}
${section('Vehicle offers', 'Read the terms, then accept or decline.', list(offers, 'dr', 'No vehicle offers right now.'))}
${section('Your assignment', '', list(now, 'dr', 'You are not assigned to a vehicle yet. Owners and ZamMove can offer you one from the driver pool.'))}
${section('Your documents', '', docs)}
${past.length ? `<details class="tw-mt-6"><summary class="tw-cursor-pointer tw-text-sm tw-font-semibold tw-text-slate-500">Other requests and history (${past.length})</summary><div class="tw-mt-3">${list(past, 'dr', '')}</div></details>` : ''}</div>`;
  };

  /* ---------------- Admin → Assignments ---------------- */
  const adminPage = () => {
    const as = (S.asg || []).slice().reverse(),
      by = st => as.filter(a => a.st == st),
      pool = (S.users || []).filter(u => okr(u, 'driver') && !activeOf(u.em) && u.status != 'suspended'),
      vehs = (S.vh || []).filter(v => v.approval == 'Approved' && !rentOnly(v));
    const kpi = [
      ['Owner requests', by('Pending Admin Review').length, 'tw-text-amber-700'],
      ['Waiting for driver', by('Awaiting Driver').length, 'tw-text-sky-700'],
      ['Awaiting agreement', by('Awaiting Agreement').length, 'tw-text-violet-700'],
      ['Ready to activate', by('Pending Activation').length, 'tw-text-harbor-700'],
      ['Active', by('Active').length, 'tw-text-emerald-700'],
    ];
    const kpis = `<div class="tw-mt-6 tw-grid tw-grid-cols-2 tw-gap-3 sm:tw-grid-cols-3 lg:tw-grid-cols-5">${kpi.map(([k, n, c]) => `<div class="tw-rounded-2xl tw-bg-white tw-p-4 tw-ring-1 tw-ring-slate-900/5"><div class="tw-text-xs tw-font-medium tw-text-slate-500">${k}</div><div class="tw-mt-1 tw-font-display tw-text-3xl tw-font-bold ${c}">${n}</div></div>`).join('')}</div>`;
    const form = panel(`<div class="tw-grid tw-gap-4 sm:tw-grid-cols-2">
${field('zda-drv', 'Driver from the pool', `<select id="zda-drv" class="${inputCls}"><option value="">Choose a driver</option>${pool.map(u => `<option value="${esc(u.em)}">${esc(u.name)}${docProblems(u).length ? ' (documents expired)' : ''}</option>`).join('')}</select>`)}
${field(
  'zda-veh',
  'Vehicle',
  `<select id="zda-veh" class="${inputCls}"><option value="">Choose a vehicle</option>${vehs
    .map(v => {
      const a = vehDriver(v.id);
      return `<option value="${esc(v.id)}">${esc(vname(v))} · ${esc(v.plate)} · ${a ? 'replaces ' + esc(U(a.driver).name || a.driver) : 'no driver'}</option>`;
    })
    .join('')}</select>`
)}</div>
<div class="tw-mt-4">${termsForm('zda-t')}</div>
<div class="tw-mt-5 tw-flex tw-flex-wrap tw-items-center tw-gap-2">${btn('zda-assign', 'Offer the vehicle to the driver')}<span class="tw-text-xs tw-text-slate-500">The driver must accept, and the driver and owner must sign the agreement before you activate it.</span></div>`);
    const closed = as.filter(a => CLOSED.includes(a.st));
    return `<div class="tw-pb-10">${pageHead('Driver assignments', 'Approve owners’ requests, assign drivers from the pool and activate signed assignments after checking documents.')}${kpis}
${section('Ready to activate', 'Signed by the driver and the owner.', list(by('Pending Activation'), 'ad', 'Nothing to activate.'))}
${section('Owner requests', 'Owners asking to assign or recommend a driver.', list(by('Pending Admin Review'), 'ad', 'No requests waiting.'))}
${section('Assign from the driver pool', pool.length + ' approved driver' + (pool.length == 1 ? '' : 's') + ' without a vehicle.', form)}
${section('In progress', 'Waiting for the driver, the agreement or an application.', list([...by('Awaiting Driver'), ...by('Awaiting Agreement'), ...by('Waiting for Application')], 'ad', 'Nothing in progress.'))}
${section('Active assignments', '', list(by('Active'), 'ad', 'No active assignments.'))}
${closed.length ? `<details class="tw-mt-6"><summary class="tw-cursor-pointer tw-text-sm tw-font-semibold tw-text-slate-500">Closed (${closed.length})</summary><div class="tw-mt-3">${list(closed, 'ad', '')}</div></details>` : ''}</div>`;
  };

  /* applications page: show who recommended the applicant */
  const recNote = a => {
    const rs = (a.rec || []).map(id => (S.asg || []).find(x => x.id == id)).filter(Boolean);
    return rs.length
      ? `<div class="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">${rs.map(x => `<span class="tw-rounded-lg tw-bg-violet-50 tw-px-2.5 tw-py-1 tw-text-xs tw-font-semibold tw-text-violet-800 tw-ring-1 tw-ring-violet-200">Recommended by ${esc(U(V(x.vehicle).owner).name || V(x.vehicle).owner || '')} for ${esc(vname(V(x.vehicle)))} ${esc(V(x.vehicle).plate || '')}</span>`).join('')}</div>`
      : '';
  };

  /* ---------------- the driver agreement (screen + print) ---------------- */
  const line = '<span class="ct-blank"></span>';
  const cell = x => (x === '' || x == null ? line : esc(x));
  const kv = rows =>
    `<table class="ct-kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const sigBox = (role, name, s) =>
    `<div class="ct-sigbox"><div class="ct-role">${role}</div>${!s ? '<div class="ct-sigline"></div>' : s.how == 'digital' ? `<img class="ct-sig" src="${esc(s.sig)}" alt="Signature of ${esc(name)}">` : '<div class="ct-sigline ct-paper">Signed on the printed copy</div>'}<div class="ct-name">${esc(name)}</div><div class="ct-note">${!s ? 'Signature over printed name · Date: ____________' : s.how == 'digital' ? 'Signed electronically in ZamMove on ' + esc(dt(s.t)) : 'Paper signature recorded on ' + esc(dt(s.t))}</div></div>`;
  const doc = a => {
    const T = a.ag.terms,
      sg = a.ag.sg || {};
    return `<article class="ct-doc"><div class="ct-hd"><div><div class="ct-brand">ZamMove · Zamboanga City</div><h1>Driver Service Agreement</h1></div><div class="ct-meta">Agreement no. <b>${esc(T.no)}</b><br>Assignment ${esc(T.asg)}<br>Issued ${esc(fmt(T.issued))}<br>Terms version ${esc(T.v)}</div></div>
<p>This agreement is made between the <b>Owner</b> of the vehicle and the <b>Driver</b> named below, for hauling bookings carried out through ZamMove, under the terms in section 4.</p>
<h3>1. The parties</h3><table class="ct-t"><tr><th></th><th>Owner</th><th>Driver</th></tr><tr><th>Full name</th><td>${cell(T.owner.name)}</td><td>${cell(T.driver.name)}</td></tr><tr><th>Mobile number</th><td>${cell(T.owner.ph)}</td><td>${cell(T.driver.ph)}</td></tr><tr><th>Address</th><td>${cell(T.owner.ad)}</td><td>${cell(T.driver.ad)}</td></tr><tr><th>Driver’s license</th><td>—</td><td>${cell(T.driver.lic)}${T.driver.licExp ? ' (valid until ' + esc(fmt(T.driver.licExp)) + ')' : ''}</td></tr></table>
<h3>2. The vehicle</h3><div class="ct-2">${kv([
      ['Make and model', cell(T.veh.name)],
      ['Model year', cell(T.veh.year)],
      ['Color', cell(T.veh.color)],
    ])}${kv([
      ['Plate number', `<b>${cell(T.veh.plate)}</b>`],
      ['Type', cell(T.veh.type)],
      ['Registration valid until', T.veh.regExp ? esc(fmt(T.veh.regExp)) : line],
    ])}</div>
<h3>3. Terms</h3><div class="ct-2">${kv([
      ['Driver’s share of trip earnings', `<b>${esc(T.pct)}%</b> (after ZamMove’s service share)`],
      ['Fuel paid by', esc(T.fuel)],
    ])}${kv([
      ['Notice to end', esc(T.notice) + ' days'],
      ['Start date', esc(fmt(T.start))],
    ])}</div>
<h3>4. Terms and conditions</h3><ol class="ct-cl">${T.clauses.map(c => `<li><b>${esc(c.t)}.</b> ${esc(c.x)}</li>`).join('')}</ol>
<h3>5. Signatures</h3><p class="ct-small">By signing, both parties confirm they have read and agree to sections 1 to 4.</p><div class="ct-sigs">${sigBox('Owner', T.owner.name, sg.ow)}${sigBox('Driver', T.driver.name, sg.dr)}</div>
<div class="ct-ft">Document fingerprint (SHA-256): <span class="ct-h">${esc(a.ag.h)}</span><br>The digital copy is kept in ZamMove: Driver → Assignment & documents, Vehicle Owner → Drivers. Any change to the terms would change this fingerprint.</div></article>`;
  };
  const signPanel = a => {
    const v = V(a.vehicle),
      who = a.driver == me() ? 'dr' : v.owner == me() ? 'ow' : '';
    if (!who || a.st != 'Awaiting Agreement') return '';
    const sg = a.ag.sg || {};
    let h = sg[who]
      ? `<div class="tw-mt-4 tw-rounded-xl tw-bg-emerald-50 tw-px-4 tw-py-3 tw-text-sm tw-font-medium tw-text-emerald-800 tw-ring-1 tw-ring-emerald-200">You signed this agreement. Waiting for the ${who == 'dr' ? 'owner' : 'driver'}’s signature.</div>`
      : `<div class="card ct-sign" id="ct-sign"><h2 style="font-size:20px;margin:0 0 4px">Sign this agreement</h2><p class="mu" style="font-size:14px;margin:0 0 10px">Your electronic signature has the same effect as signing on paper (Electronic Commerce Act, RA 8792).</p>
<label class="ct-chk"><input type="checkbox" id="ct-agree"> I have read all ${a.ag.terms.clauses.length} terms and conditions and I agree to them.</label>
<label for="ct-name">Type your full name as on your account</label><input id="ct-name" autocomplete="name" placeholder="${esc((S.me || {}).name || '')}">
<label>Draw your signature</label><div class="ct-padw"><canvas id="ct-pad" aria-label="Signature pad"></canvas><span class="ct-padh">Sign here with your finger or mouse</span></div>
<div class="wsa"><button class="btn o sm" data-a="zct-clear">Clear</button><button class="btn" data-a="zdr-sign" data-id="${esc(a.id)}">Sign agreement</button></div><div class="err" id="ct-err"></div></div>`;
    if (who == 'ow' && !(sg.dr && sg.ow))
      h += `<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Signed on paper instead?</summary><p class="mu" style="font-size:14px">Print the agreement, sign it together with the driver, then upload a clear photo of the signed page. It counts as signed by both of you.</p><input id="zdr-photo" type="file" accept="image/*"><div class="wsa" style="margin-top:8px"><button class="btn sm" data-a="zdr-paper" data-id="${esc(a.id)}">Record signed paper copy</button></div><div class="err" id="zdr-perr"></div></details>`;
    return h;
  };
  const openDoc = id => {
    const a = (S.asg || []).find(x => x.id == id);
    if (!a || !a.ag) return toast('The agreement is issued when the driver accepts.');
    const old = document.getElementById('fx-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="fx-modal" class="fx-ov ct-ov"><div class="fx-dlg card ct-wide" role="dialog" aria-modal="true" aria-label="Driver agreement"><div class="ct-tools"><b style="flex:1">Driver agreement ${esc(a.ag.terms.no)}</b><button class="btn o sm" data-a="zdr-print" data-id="${esc(id)}">Print</button><button class="btn o sm" data-a="fx-close">Close</button></div>${doc(a)}${signPanel(a)}</div></div>`
    );
    if (window.ZCT && ZCT.pad) ZCT.pad.init();
  };
  const printDoc = id => {
    const a = (S.asg || []).find(x => x.id == id);
    if (!a || !a.ag) return toast('The agreement is issued when the driver accepts.');
    let el = document.getElementById('ct-print');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ct-print';
      document.body.appendChild(el);
    }
    el.innerHTML = doc(a);
    document.body.classList.add('ct-printing');
    const done = () => {
      document.body.classList.remove('ct-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => {
      window.print();
      setTimeout(done, 1000);
    }, 60);
  };

  /* ---------------- register the pages ---------------- */
  if (window.ZW && ZW.NAV && ZW.PG) {
    ZW.PG.owner.drv = ownerPage;
    ZW.PG.admin.asg = adminPage;
    const ai = ZW.NAV.admin.find(n => n[0] == 'asg');
    if (ai) ai[1] = 'Assignments';
    const di = ZW.NAV.driver.findIndex(n => n[0] == 'veh');
    ZW.NAV.driver.splice(di + 1, 0, ['asg', 'Assignment & documents', 'doc']);
    ZW.PG.driver.asg = driverPage;
    /* driver dashboard: point to offers, agreements to sign and expiring documents */
    const dash = ZW.PG.driver.dash;
    ZW.PG.driver.dash = () => {
      const em = me(),
        u = U(em),
        offers = (S.asg || []).filter(a => a.driver == em && a.st == 'Awaiting Driver').length,
        toSign = (S.asg || []).filter(
          a => a.driver == em && a.st == 'Awaiting Agreement' && !(a.ag && a.ag.sg && a.ag.sg.dr)
        ).length,
        d = dx(u),
        soon = [
          ['license', d.lic],
          ['clearance', d.clr],
        ].filter(([, x]) => x && days(x) <= 30);
      const items = [
        offers ? `${offers} vehicle offer${offers > 1 ? 's' : ''} waiting for your answer` : '',
        toSign ? 'A driver agreement is waiting for your signature' : '',
        ...soon.map(([k, x]) => `Your ${k} ${days(x) < 0 ? 'expired on' : 'expires on'} ${fmt(x)}`),
      ].filter(Boolean);
      const alert = items.length
        ? `<div class="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-rounded-2xl tw-bg-harbor-950 tw-p-4 tw-text-white tw-shadow-lift"><div><div class="tw-text-sm tw-font-semibold tw-text-harbor-200">Needs your attention</div><ul class="tw-m-0 tw-mt-1 tw-list-disc tw-pl-5 tw-text-sm">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><button class="tw-cursor-pointer tw-rounded-xl tw-border-0 tw-bg-white tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-harbor-900 hover:tw-bg-harbor-50" data-a="w-go" data-w="driver" data-p="asg">Open Assignment & documents</button></div>`
        : '';
      return alert + dash();
    };
  }

  /* ---------------- events ---------------- */
  const after = async (p, okText, keep) => {
    const r = await p;
    msg = { t: r.ok ? okText : r.err, good: !!r.ok };
    if (r.ok) toast(okText);
    render();
    return r;
  };
  document.addEventListener(
    'click',
    async e => {
      const t = e.target.closest('[data-a^="zdr-"],[data-a^="zda-"]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const a = t.dataset.a,
        id = t.dataset.id;
      if (a == 'zdr-pick') {
        const f = $('#zdr-em');
        if (f) {
          f.value = t.dataset.em;
          f.scrollIntoView({ behavior: 'smooth', block: 'center' });
          f.focus();
        }
        return;
      }
      if (a == 'zdr-req')
        return after(
          ZAPI.act('reqAssign', {
            vehicle: val('zdr-veh'),
            driver: val('zdr-em'),
            mode: t.dataset.m,
            note: val('zdr-note'),
            ...termsVal('zdr-t'),
          }),
          t.dataset.m == 'assign' ? 'Request sent to ZamMove for approval' : 'Recommendation sent'
        );
      if (a == 'zda-assign')
        return after(
          ZAPI.act('adminAssignVehicle', {
            driver: val('zda-drv'),
            vehicle: val('zda-veh'),
            ...termsVal('zda-t'),
          }),
          'Vehicle offered to the driver'
        );
      if (a == 'zdr-approve')
        return after(
          ZAPI.act('assignDecision', { id, act: 'approve' }),
          'Approved. The driver can now accept.'
        );
      if (a == 'zdr-reject')
        return after(
          ZAPI.act('assignDecision', { id, act: 'reject', reason: val('zdr-rej-' + id) }),
          'Request rejected'
        );
      if (a == 'zdr-accept') {
        const r = await after(
          ZAPI.act('assignRespond', { id, act: 'accept' }),
          'Accepted. Now sign the driver agreement.'
        );
        if (r.ok) openDoc(id);
        return;
      }
      if (a == 'zdr-decline')
        return after(
          ZAPI.act('assignRespond', { id, act: 'decline', reason: val('zdr-why-' + id) }),
          'Offer declined'
        );
      if (a == 'zdr-activate') return after(ZAPI.act('assignActivate', { id }), 'Assignment activated');
      if (a == 'zdr-end') return after(ZAPI.act('assignEnd', { id, reason: val('zdr-end-' + id) }), 'Done');
      if (a == 'zdr-open') return openDoc(id);
      if (a == 'zdr-print') return printDoc(id);
      if (a == 'zdr-sign') {
        const done = busyBtn(t);
        const r = await ZAPI.act('assignSign', {
          id,
          agree: !!($('#ct-agree') || {}).checked,
          name: val('ct-name'),
          sig: window.ZCT && ZCT.pad ? ZCT.pad.image() : '',
        });
        done();
        if (!r.ok) {
          const x = $('#ct-err');
          if (x) x.textContent = r.err;
          return;
        }
        toast(r.done ? 'Agreement signed by both. ZamMove will activate it.' : 'Agreement signed');
        render();
        return openDoc(id);
      }
      if (a == 'zdr-paper') {
        const r = await ZAPI.act('assignSign', { id, how: 'paper', photo: await pimg('zdr-photo') });
        if (!r.ok) {
          const x = $('#zdr-perr');
          if (x) x.textContent = r.err;
          return;
        }
        toast('Signed paper copy recorded');
        render();
        return openDoc(id);
      }
      if (a == 'zdr-doc')
        return after(
          ZAPI.act('driverDocUpdate', {
            kind: val('zdr-dk'),
            exp: val('zdr-dx'),
            file: await pimg('zdr-df'),
          }),
          'Document updated'
        );
    },
    true
  );
  /* clear the message when leaving these pages */
  const _r = render;
  render = function () {
    const w = S.ws,
      p = (S.wp || {})[w];
    if (!((w == 'owner' && p == 'drv') || (w == 'admin' && p == 'asg') || (w == 'driver' && p == 'asg')))
      msg = { t: '', good: true };
    _r();
    /* keep the active tab visible when the navigation scrolls sideways (admin console has many tabs) */
    const on = document.querySelector('#nav a.on');
    if (on && on.parentElement && on.parentElement.scrollWidth > on.parentElement.clientWidth) {
      /* position inside the nav (offsetLeft is relative to the header, which clipped the first tab) */
      const nav = on.parentElement,
        x = on.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      nav.scrollLeft = Math.max(0, x - nav.clientWidth / 2 + on.offsetWidth / 2);
    }
  };

  window.ZDR = { recNote, openDoc, printDoc };
  render();
})();
