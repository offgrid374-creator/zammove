'use strict';
/* Accounts: signup, login (with lockout), password reset, one-time owner setup, profile, verification, notifications. */
const { now, sha256, pin6, str, img, ok, no, hashPassword, checkPassword } = require('../util');

const EMAIL = /^\S+@\S+\.\S+$/,
  PHONE = /^(09|\+639)\d{9}$/;
const pwErr = p =>
  String(p || '').length < 8 || !/\d/.test(p) || !/[a-z]/i.test(p)
    ? 'Password needs 8+ characters with letters and a number.'
    : '';
const age = d => (Date.now() - new Date(d)) / 31557600000;
const meOf = u => ({ name: u.name, em: u.em });

module.exports = (S, h) => {
  const locks = new Map(); // email -> {n, until}; in memory on purpose
  return {
    signup(p) {
      const u = {
        name: str(p.name, 80),
        dob: str(p.dob, 10),
        ph: str(p.ph, 20),
        ad: str(p.ad, 200),
        em: str(p.em, 120).toLowerCase(),
        pw: String(p.pw || ''),
      };
      let e = '';
      if (u.name.length < 3) e = 'Enter your full name.';
      else if (!u.dob || !(age(u.dob) >= 18)) e = 'You must be 18 or older.';
      else if (!PHONE.test(u.ph)) e = 'Enter a valid PH mobile number.';
      else if (u.ad.length < 8) e = 'Enter your complete address.';
      else if (!EMAIL.test(u.em)) e = 'Enter a valid email.';
      else if (pwErr(u.pw)) e = pwErr(u.pw);
      else if (!p.terms) e = 'Please accept the Terms and Privacy Policy.';
      else if (h.U(u.em)) e = 'Email already registered.';
      if (e) return no(e);
      const rec = { ...u, pw: hashPassword(u.pw), ver: false, code: pin6(), codeT: Date.now(), roles: [], cr: now(), tv: 0 };
      S.users.push(rec);
      h.sim(rec.ph, 'SMS', `ZamMove: your verification code is ${rec.code}. Do not share it.`, rec.em);
      h.au(rec.em, 'signup', null);
      return ok({ user: rec, me: meOf(rec) });
    },
    login(p) {
      const em = str(p.em, 120).toLowerCase(),
        L = locks.get(em) || { n: 0, until: 0 };
      if (Date.now() < L.until)
        return no(
          'Too many attempts. Try again in ' + Math.ceil((L.until - Date.now()) / 1000) + ' seconds.'
        );
      const u = h.U(em);
      if (!u || !checkPassword(p.pw, u.pw)) {
        L.n++;
        if (L.n >= 5) {
          L.n = 0;
          L.until = Date.now() + 60000;
          locks.set(em, L);
          return no('Too many failed attempts. Login is locked for 60 seconds.');
        }
        locks.set(em, L);
        return no(
          'Invalid email or password. ' + (5 - L.n) + ' attempt' + (5 - L.n > 1 ? 's' : '') + ' left.'
        );
      }
      if (!h.acct(u)) return no('This account is suspended. Contact ZamMove.');
      locks.delete(em);
      h.au(em, 'login', null);
      return ok({ user: u, me: meOf(u) });
    },
    /* the code goes to the account's email and phone (simulated inbox), never to the screen. The answer is the
       same whether or not the email exists, so nobody can test which emails have accounts. */
    forgot(p) {
      const em = str(p.em, 120).toLowerCase(),
        u = h.U(em);
      if (!EMAIL.test(em)) return no('Enter a valid email.');
      if (u && !(u.reset && Date.now() - (u.reset.t || 0) < 60000)) {
        const code = pin6();
        u.reset = { h: sha256(u.em + code), exp: Date.now() + 15 * 6e4, att: 0, t: Date.now() };
        const body = `ZamMove: your password reset code is ${code}. It expires in 15 minutes. If you did not ask for it, ignore this message.`;
        h.sim(u.em, 'Email', body, u.em);
        if (u.ph) h.sim(u.ph, 'SMS', body, u.em);
        h.au(u.em, 'password reset requested', null);
      }
      return ok({ sent: true });
    },
    resetPassword(p) {
      const u = h.U(str(p.em, 120).toLowerCase()),
        r = u && u.reset;
      if (!r || Date.now() > r.exp) return no('The code expired. Request a new one.');
      if (sha256(u.em + str(p.code, 6)) != r.h) {
        r.att++;
        if (r.att >= 5) delete u.reset;
        return no('Incorrect code.');
      }
      if (pwErr(p.pw)) return no(pwErr(p.pw));
      u.pw = hashPassword(p.pw);
      u.tv = (u.tv || 0) + 1;
      delete u.reset;
      h.au(u.em, 'password reset', null);
      return ok();
    },
    ownerSetup(p, setupCode) {
      if (S.users.some(u => u.adm == 'super')) return no('Setup is already complete.');
      if (setupCode && str(p.code, 100) !== setupCode) return no('The setup code is not correct.');
      const name = str(p.name, 80),
        em = str(p.em, 120).toLowerCase();
      if (!name || !EMAIL.test(em)) return no('Enter your name and a valid email.');
      if (String(p.pw || '').length < 10) return no('Password must be at least 10 characters.');
      if (h.U(em)) return no('That email is already registered. Use a different email.');
      const u = {
        name,
        em,
        pw: hashPassword(p.pw),
        ph: '',
        ad: '',
        dob: '',
        ver: true,
        roles: [],
        adm: 'super',
        cr: now(),
        tv: 0,
      };
      S.users.push(u);
      h.au(em, 'owner admin created', null);
      return ok({ user: u, me: meOf(u) });
    },
    actions: {
      verifyAccount(me, p) {
        if (me.ver) return ok();
        if ((me.vatt || 0) >= 5) return no('Too many wrong codes. Send a new code.');
        if (!me.code || str(p.code, 6) !== me.code) {
          me.vatt = (me.vatt || 0) + 1;
          return no('Incorrect code. ' + (5 - me.vatt) + ' attempt' + (5 - me.vatt == 1 ? '' : 's') + ' left.');
        }
        delete me.vatt;
        me.ver = true;
        delete me.code;
        h.au(me.em, 'account verified', null);
        return ok();
      },
      /* send a new verification code to the phone (once a minute) */
      resendCode(me) {
        if (me.ver) return no('Your account is already verified.');
        if (me.codeT && Date.now() - me.codeT < 60000) return no('Wait a minute before asking for another code.');
        me.code = pin6();
        me.codeT = Date.now();
        delete me.vatt;
        h.sim(me.ph, 'SMS', `ZamMove: your verification code is ${me.code}. Do not share it.`, me.em);
        h.au(me.em, 'verification code sent', null);
        return ok();
      },
      saveProfile(me, p) {
        const n = str(p.name, 80),
          ph = str(p.ph, 20),
          ad = str(p.ad, 200);
        if (n.length < 3) return no('Enter your full name.');
        if (!PHONE.test(ph)) return no('Enter a valid PH mobile number.');
        if (ad.length < 8) return no('Enter your complete address.');
        Object.assign(me, { name: n, ph, ad });
        h.au(me.em, 'profile updated', null);
        return ok({ me: meOf(me) });
      },
      /* profile photo shown to customers on the driver card ('' removes it) */
      setPhoto(me, p) {
        if (p.photo === '') delete me.photo;
        else if (img(p.photo)) me.photo = img(p.photo);
        else return no('Choose a photo (JPG or PNG).');
        h.au(me.em, p.photo ? 'profile photo updated' : 'profile photo removed', null);
        return ok();
      },
      setAlerts(me, p) {
        me.alertsOff = !p.on;
        return ok();
      },
      notifRead(me, p) {
        S.nt.forEach(n => {
          if (n.to == me.em && (p.id == 'all' || n.id == p.id)) n.r = true;
        });
        return ok();
      },
    },
  };
};
