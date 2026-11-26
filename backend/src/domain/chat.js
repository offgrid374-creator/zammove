'use strict';
/**
 * chat.js — messages between the people of one trip or one rental.
 *
 *   Booking  the customer and the assigned driver, from acceptance until 24 hours after the trip ends.
 *   Rental   the renter and the vehicle owner (and the owner's driver on a rental with a driver), from the
 *            request until 24 hours after the rental ends.
 * After that the conversation stays readable but closed. ZamMove staff can read every conversation (disputes);
 * nobody else can. Messages live on the booking or rental (`chat: { m: [...], seen: { em: time } }`) and are
 * never sent with the normal state: the browser asks for them with GET /api/chat (lightweight, while open).
 */
const { now, str, ok, no, rid } = require('../util');

const MAX_LEN = 500,
  KEEP = 400, // messages kept per conversation
  AFTER_H = 24, // still open this many hours after the trip or rental ends
  BURST = 15, // at most this many messages per minute from one person
  NOTIFY_GAP = 3 * 6e4; // one notification per conversation per 3 minutes, not one per message

module.exports = (S, h) => {
  const thread = (k, id) => (k == 'b' ? S.bk : k == 'r' ? S.rn : []).find(x => x.id == id);
  /* who takes part */
  const members = (k, x) => {
    if (!x) return [];
    if (k == 'b') return [x.cu, x.drvUser].filter(Boolean);
    return [x.cu, x.owner, x.withDrv && x.withDrv.em].filter(Boolean);
  };
  const endedAt = (k, x) => {
    const ev = k == 'b' ? (x.ev || []).slice().reverse().find(e => ['Completed', 'Cancelled', 'Rejected'].includes(e.to)) : (x.hist || []).slice().reverse().find(e => ['Completed', 'Cancelled', 'Rejected'].includes(e.st));
    return ev ? new Date(ev.t).getTime() : x.cd ? new Date(x.cd).getTime() : Date.now();
  };
  const isOpen = (k, x) => {
    if (!x) return false;
    if (k == 'b') {
      if (!x.drvUser) return false; // nobody to talk to until a driver accepts
      if (!['Completed', 'Cancelled', 'Rejected'].includes(x.st)) return true;
    } else if (!['Completed', 'Cancelled', 'Rejected'].includes(x.st)) return true;
    return Date.now() - endedAt(k, x) < AFTER_H * 36e5;
  };
  const canRead = (me, k, x) => !!x && (members(k, x).includes(me.em) || h.isAdmin(me));
  const nameOf = em => ((h.U(em) || {}).name || 'Someone').split(' ')[0];
  /* "seen" is the id of the last message a person has read (timestamps can tie within a millisecond) */
  const unreadOf = (ms, seenId, em) => {
    const i = seenId ? ms.findIndex(m => m.id == seenId) : -1;
    return ms.slice(i + 1).filter(m => m.by != em).length;
  };
  const roleOf = (k, x, em) => (k == 'b' ? (em == x.cu ? 'Customer' : 'Driver') : em == x.cu ? 'Renter' : em == x.owner ? 'Owner' : 'Driver');

  /* the conversations listed for a person (in their normal state view) */
  h.chatThreads = em => {
    const L = [];
    const add = (k, x) => {
      const ms = (x.chat && x.chat.m) || [],
        unread = unreadOf(ms, x.chat && x.chat.seen && x.chat.seen[em], em),
        open = isOpen(k, x);
      if (!open && !ms.length) return;
      const others = members(k, x).filter(e => e != em);
      L.push({
        k,
        id: x.id,
        title: k == 'b' ? `Trip ${x.id}` : `Rental ${x.id}${x.vn ? ' · ' + x.vn : ''}`,
        with: others.map(e => ({ name: nameOf(e), role: roleOf(k, x, e) })),
        open,
        n: ms.length,
        unread,
        last: ms.length ? { by: ms[ms.length - 1].by == em ? 'You' : nameOf(ms[ms.length - 1].by), x: ms[ms.length - 1].x.slice(0, 80), t: ms[ms.length - 1].t } : null,
      });
    };
    S.bk.forEach(b => members('b', b).includes(em) && add('b', b));
    S.rn.forEach(r => members('r', r).includes(em) && add('r', r));
    return L.sort((a, b) => b.open - a.open || String((b.last || {}).t || '').localeCompare(String((a.last || {}).t || '')));
  };
  /* GET /api/chat: messages after `since` (a count), for a member or staff */
  h.chatRead = (me, k, id, since) => {
    const x = thread(k, id);
    if (!canRead(me, k, x)) return null;
    const ms = (x.chat && x.chat.m) || [],
      from = Math.max(0, Math.min(+since || 0, ms.length));
    return {
      ok: true,
      k,
      id,
      open: isOpen(k, x),
      member: members(k, x).includes(me.em),
      total: ms.length,
      msgs: ms.slice(from).map(m => ({ ...m, me: m.by == me.em, name: m.by == me.em ? 'You' : nameOf(m.by), role: m.sys ? '' : roleOf(k, x, m.by) })),
      /* how far the others have read: the index of their last read message */
      seen: Object.fromEntries(Object.entries((x.chat && x.chat.seen) || {}).filter(([e]) => e != me.em).map(([e, sid]) => [nameOf(e), ms.findIndex(m => m.id == sid)])),
      with: members(k, x).filter(e => e != me.em).map(e => ({ name: nameOf(e), role: roleOf(k, x, e) })),
    };
  };

  return {
    chatSend(me, p) {
      const k = p.k == 'r' ? 'r' : 'b',
        x = thread(k, str(p.id, 20));
      if (!x || !members(k, x).includes(me.em)) return no('You are not part of this conversation.');
      if (!isOpen(k, x)) return no(k == 'b' ? 'This trip has ended, so the chat is closed. Use Report a problem if something is wrong.' : 'This rental has ended, so the chat is closed.');
      const text = str(p.x, MAX_LEN + 50).replace(/\s+\n/g, '\n').trim();
      if (!text) return no('Type a message.');
      if (text.length > MAX_LEN) return no(`Keep messages under ${MAX_LEN} characters.`);
      x.chat = x.chat || { m: [], seen: {} };
      const t0 = Date.now() - 6e4;
      if (x.chat.m.filter(m => m.by == me.em && new Date(m.t).getTime() > t0).length >= BURST) return no('You are sending messages too quickly. Wait a moment.');
      const m = { id: rid('MS'), by: me.em, t: now(), x: text };
      x.chat.m.push(m);
      if (x.chat.m.length > KEEP) x.chat.m.splice(0, x.chat.m.length - KEEP);
      x.chat.seen[me.em] = m.id;
      /* tell the others, at most once every few minutes per conversation */
      x.chat.nt = x.chat.nt || {};
      members(k, x)
        .filter(e => e != me.em)
        .forEach(e => {
          const last = x.chat.nt[e] ? new Date(x.chat.nt[e]).getTime() : 0;
          if (Date.now() - last < NOTIFY_GAP) return;
          x.chat.nt[e] = m.t;
          h.ntf(e, `Message from ${nameOf(me.em)} · ${k == 'b' ? 'Trip' : 'Rental'} ${x.id}`, text.slice(0, 120));
        });
      return ok({ m: { ...m, me: true, name: 'You' } });
    },
    /* the person has read the conversation up to now */
    chatSeen(me, p) {
      const k = p.k == 'r' ? 'r' : 'b',
        x = thread(k, str(p.id, 20));
      if (!x || !members(k, x).includes(me.em)) return no('You are not part of this conversation.');
      const ms = (x.chat && x.chat.m) || [];
      if (!ms.length) return ok();
      x.chat.seen = x.chat.seen || {};
      const lastId = ms[ms.length - 1].id;
      if (x.chat.seen[me.em] == lastId) return ok({ same: true });
      x.chat.seen[me.em] = lastId;
      return ok();
    },
  };
};
