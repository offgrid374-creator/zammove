'use strict';
/* admin-rep.js — Money → Reports: every report (shared/reports.js) for the whole system, searchable, printable, CSV. */
(() => {
  P.rep = () => `${msg()}<div class="card" style="margin-top:18px">${window.ZREP ? ZREP.view('adm', S, {}) : '<p>Reports are loading…</p>'}</div>`;
})();
