'use strict';
/* In-memory state with write-through persistence.
   - All writes run one at a time (a promise queue), so two requests can never interleave a rule check and its update.
   - After each action, only rows that changed are written to the store (Supabase Postgres, a JSON file, or memory).
   - If the action throws or the database write fails, the in-memory state is rolled back.
   Run ONE backend instance per database: the cache is the source of truth while the process runs. */

/* collection in S -> table name; users are keyed by email, everything else by id */
const COLLECTIONS = {
  users: 'users',
  apps: 'applications',
  vh: 'vehicles',
  asg: 'assignments',
  bk: 'bookings',
  rn: 'rentals',
  pay: 'payments',
  inc: 'incidents',
  rev: 'reviews',
  nt: 'notifications',
  rem: 'remittances',
  au: 'audit_log',
};
const TABLES = [...Object.values(COLLECTIONS), 'driver_status', 'settings'];
const keyOf = (coll, x) => (coll == 'users' ? x.em : x.id);
/* comm: ZamMove commission (% of the fare after the service fee); drvPct: driver's share when no agreement sets one */
const DEFAULT_CFG = { coShare: 80, pendMin: 30, comm: 15, drvPct: 20 };

const emptyState = () => ({
  ...Object.fromEntries(Object.keys(COLLECTIONS).map(k => [k, []])),
  dp: {},
  cfg: { ...DEFAULT_CFG },
});

function toRows(S) {
  const out = new Map(TABLES.map(t => [t, new Map()]));
  for (const [coll, table] of Object.entries(COLLECTIONS))
    for (const x of S[coll] || []) {
      const k = keyOf(coll, x);
      if (k) out.get(table).set(String(k), JSON.stringify(x));
    }
  for (const [em, d] of Object.entries(S.dp || {})) out.get('driver_status').set(em, JSON.stringify(d));
  out.get('settings').set('main', JSON.stringify(S.cfg || {}));
  return out;
}
function fromRows(rows) {
  const S = emptyState();
  for (const [coll, table] of Object.entries(COLLECTIONS)) S[coll] = (rows[table] || []).map(r => r.data);
  for (const r of rows.driver_status || []) S.dp[r.id] = r.data;
  const cfg = (rows.settings || []).find(r => r.id == 'main');
  S.cfg = { ...DEFAULT_CFG, ...(cfg ? cfg.data : {}) };
  S.au.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  S.nt.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  return S;
}

class State {
  constructor(store) {
    this.store = store;
    this.S = emptyState();
    this.saved = toRows(this.S);
    this.version = 0;
    this.queue = Promise.resolve();
  }
  async init() {
    const rows = await this.store.loadAll(TABLES);
    this.replace(fromRows(rows));
    this.saved = toRows(this.S);
    return this;
  }
  replace(next) {
    Object.keys(this.S).forEach(k => delete this.S[k]);
    Object.assign(this.S, next);
  }
  async commit() {
    const cur = toRows(this.S),
      upserts = {},
      deletes = {};
    for (const t of TABLES) {
      const before = this.saved.get(t),
        now = cur.get(t);
      for (const [id, json] of now)
        if (before.get(id) !== json) (upserts[t] = upserts[t] || []).push({ id, data: JSON.parse(json) });
      for (const id of before.keys()) if (!now.has(id)) (deletes[t] = deletes[t] || []).push(id);
    }
    if (!Object.keys(upserts).length && !Object.keys(deletes).length) return false;
    await this.store.write(upserts, deletes);
    this.saved = cur;
    this.version++;
    return true;
  }
  /* run fn(S) exclusively; persist its changes; roll back on error */
  run(fn) {
    const job = this.queue.then(async () => {
      const snap = structuredClone(this.S);
      try {
        const r = await fn(this.S);
        await this.commit();
        return r;
      } catch (e) {
        this.replace(snap);
        throw e;
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
}

module.exports = { State, emptyState, TABLES, COLLECTIONS };
