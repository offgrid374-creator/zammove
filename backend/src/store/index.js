'use strict';
/* Storage adapters. Each one implements:
     loadAll(tables) -> { [table]: [{ id, data }] }
     write(upserts, deletes)   upserts: { [table]: [{ id, data }] }, deletes: { [table]: [id] }   (throws on failure) */
const fs = require('fs');
const path = require('path');

function memoryStore() {
  const db = {};
  return {
    kind: 'memory',
    async loadAll(tables) {
      return Object.fromEntries(
        tables.map(t => [t, Object.entries(db[t] || {}).map(([id, data]) => ({ id, data }))])
      );
    },
    async write(ups, dels) {
      for (const [t, rows] of Object.entries(ups)) {
        db[t] = db[t] || {};
        rows.forEach(r => (db[t][r.id] = r.data));
      }
      for (const [t, ids] of Object.entries(dels)) ids.forEach(id => db[t] && delete db[t][id]);
    },
  };
}

/* local development without Supabase: one JSON file, written atomically */
function fileStore(file) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return {};
    }
  };
  return {
    kind: 'file',
    async loadAll(tables) {
      const db = read();
      return Object.fromEntries(
        tables.map(t => [t, Object.entries(db[t] || {}).map(([id, data]) => ({ id, data }))])
      );
    },
    async write(ups, dels) {
      const db = read();
      for (const [t, rows] of Object.entries(ups)) {
        db[t] = db[t] || {};
        rows.forEach(r => (db[t][r.id] = r.data));
      }
      for (const [t, ids] of Object.entries(dels)) ids.forEach(id => db[t] && delete db[t][id]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, file);
    },
  };
}

/* Supabase Postgres via the service-role key (server only; RLS blocks everyone else). See sql/schema.sql */
function supabaseStore(url, key, client) {
  const sb =
    client ||
    require('@supabase/supabase-js').createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const PAGE = 1000,
    CHUNK = 500;
  const check = (res, what) => {
    if (res.error) throw new Error(what + ': ' + res.error.message);
    return res;
  };
  return {
    kind: 'supabase',
    async loadAll(tables) {
      const out = {};
      for (const t of tables) {
        out[t] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = check(
            await sb
              .from(t)
              .select('id,data')
              .order('id')
              .range(from, from + PAGE - 1),
            'load ' + t
          );
          out[t].push(...data);
          if (data.length < PAGE) break;
        }
      }
      return out;
    },
    async write(ups, dels) {
      const ts = new Date().toISOString();
      for (const [t, rows] of Object.entries(ups))
        for (let i = 0; i < rows.length; i += CHUNK)
          check(
            await sb.from(t).upsert(
              rows.slice(i, i + CHUNK).map(r => ({ id: r.id, data: r.data, updated_at: ts })),
              { onConflict: 'id' }
            ),
            'save ' + t
          );
      for (const [t, ids] of Object.entries(dels))
        for (let i = 0; i < ids.length; i += CHUNK)
          check(
            await sb
              .from(t)
              .delete()
              .in('id', ids.slice(i, i + CHUNK)),
            'delete ' + t
          );
    },
  };
}

function createStore(cfg) {
  if (cfg.store == 'supabase') {
    if (!cfg.supabaseUrl || !cfg.supabaseKey)
      throw new Error('STORE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
    return supabaseStore(cfg.supabaseUrl, cfg.supabaseKey);
  }
  if (cfg.store == 'memory') return memoryStore();
  return fileStore(cfg.dataFile);
}

module.exports = { createStore, memoryStore, fileStore, supabaseStore };
