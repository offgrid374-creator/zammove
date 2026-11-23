'use strict';
/**
 * Erases ALL data (accounts, vehicles, bookings, rentals, payments, history, settings) and creates
 * one new owner admin with a random password, printed once.
 * With the local file store, a backup copy of the old data is saved first in backend/.data/.
 *
 * Stop the server first, then:
 *   npm run reset-data -- --yes [--email admin@example.com] [--name "Full Name"]
 * Afterwards start the server and log in with the printed email and password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../src/config');
const { createStore } = require('../src/store');
const { State, emptyState } = require('../src/state');
const { hashPassword, now, rid } = require('../src/util');

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/* 14 characters from an alphabet without look-alikes; always contains letters and digits */
function randomPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  let pw = '';
  while (!/\d/.test(pw) || !/[a-z]/i.test(pw)) {
    pw = Array.from({ length: 14 }, () => all[crypto.randomInt(all.length)]).join('');
  }
  return pw;
}

(async () => {
  if (!process.argv.includes('--yes')) {
    console.log('This erases ALL ZamMove data. Run again with --yes to confirm:');
    console.log('  npm run reset-data -- --yes [--email admin@example.com] [--name "Full Name"]');
    process.exit(1);
  }
  const email = String(arg('email', 'admin@zammove.test')).trim().toLowerCase();
  const name = String(arg('name', 'ZamMove Admin')).trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 3) {
    console.log('Give a valid --email and a --name of at least 3 characters.');
    process.exit(1);
  }

  const store = createStore(cfg);
  if (store.kind == 'file' && fs.existsSync(cfg.dataFile)) {
    const stamp = now().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const backup = path.join(path.dirname(cfg.dataFile), `backup-${stamp}.json`);
    fs.copyFileSync(cfg.dataFile, backup);
    console.log(`Backup of the old data: ${backup}`);
  } else if (store.kind == 'supabase') {
    console.log('Supabase store: no automatic backup (use Supabase backups if you need the old data).');
  }

  const state = await new State(store).init();
  const before = state.S.users.length;
  const password = randomPassword();
  await state.run(() => {
    const fresh = emptyState();
    fresh.users.push({
      name,
      em: email,
      pw: hashPassword(password),
      ph: '',
      ad: '',
      dob: '',
      ver: true,
      roles: [],
      adm: 'super',
      cr: now(),
      tv: 0,
    });
    fresh.au.push({
      id: rid('AU'),
      t: now(),
      who: 'reset-data script',
      evt: 'all data reset; owner admin created',
      data: { admin: email, previousAccounts: before },
    });
    state.replace(fresh);
  });

  console.log(`All data erased (${before} accounts removed). Store: ${store.kind}.`);
  console.log('New owner admin:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('Start the server, log in, and change the password with: npm run reset-password -- ' + email);
})().catch(e => {
  console.error('Reset failed:', e.message);
  process.exit(1);
});
