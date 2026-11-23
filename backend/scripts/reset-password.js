'use strict';
/**
 * Sets a new password for any account (for example a forgotten owner admin password).
 * The password is typed in the terminal (hidden) and never shown or logged.
 * Old logins for that account stop working.
 *
 * Stop the server first, then:   npm run reset-password -- you@example.com
 */
const readline = require('readline');
const cfg = require('../src/config');
const { createStore } = require('../src/store');
const { State } = require('../src/state');
const { hashPassword, now, rid } = require('../src/util');

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = text => {
      if (!muted) rl.output.write(text);
      else if (text.includes('\n')) rl.output.write('\n');
      else rl.output.write('*'.repeat(text.length ? 1 : 0));
    };
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

(async () => {
  const email = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
  if (!email) {
    console.log('Usage: npm run reset-password -- you@example.com');
    process.exit(1);
  }
  const state = await new State(createStore(cfg)).init();
  const user = state.S.users.find(u => u.em == email);
  if (!user) {
    console.log(`No account with the email ${email} (store=${state.store.kind}).`);
    process.exit(1);
  }
  const min = user.adm == 'super' ? 10 : 8;
  const pw = await askHidden(`New password for ${user.name} (${min}+ characters, letters and a number): `);
  if (pw.length < min || !/\d/.test(pw) || !/[a-z]/i.test(pw)) {
    console.log(`Not changed: use at least ${min} characters with letters and a number.`);
    process.exit(1);
  }
  const again = await askHidden('Type it again: ');
  if (again !== pw) {
    console.log('Not changed: the two passwords do not match.');
    process.exit(1);
  }
  await state.run(S => {
    const u = S.users.find(x => x.em == email);
    u.pw = hashPassword(pw);
    u.tv = (u.tv || 0) + 1; // signs out old sessions
    delete u.reset;
    S.au.push({
      id: rid('AU'),
      t: now(),
      who: 'reset-password script',
      evt: 'password reset',
      data: { user: email },
    });
  });
  console.log(`Password updated for ${email}. Start the server again and log in with the new password.`);
})().catch(e => {
  console.error('Password reset failed:', e.message);
  process.exit(1);
});
