/**
 * 22-roles.js — driver, car owner, cashier and account workspaces from Figma (F01–F03, G01–G05, H01–H04).
 *
 * Every screen in this batch is "UPDATED · restyled": new button colours, status colours, bold info and
 * the mode badge. Buttons, statuses and the badge come from css/home.css and 21-home.js. This file adds
 * the "bold info": plate numbers, booking / rental references and peso amounts are set in bold
 * wherever a workspace page shows them, so they are easy to scan in tables and lists.
 */
(() => {
  /* ZAM 4521 · BK-7Q2M4X / RN-M1FWBL · ₱1,739.20 */
  const RX = /\b[A-Z]{3}[ -]?\d{3,4}\b|\b(?:BK|RN|RM|RF|PY)-[A-Z0-9]{5,8}\b|₱\s?-?[\d,]+(?:\.\d{2})?/g;
  const SKIP = 'B, STRONG, BUTTON, A, OPTION, SELECT, TEXTAREA, INPUT, LABEL, SCRIPT, STYLE, SUMMARY, H1, H2, H3, .tile, .zw-b';
  const boldInfo = root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.nodeValue || !RX.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        RX.lastIndex = 0;
        return n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const hits = [];
    while (w.nextNode()) hits.push(w.currentNode);
    hits.forEach(n => {
      const s = n.nodeValue,
        f = document.createDocumentFragment();
      let i = 0;
      s.replace(RX, (m, at) => {
        if (at > i) f.appendChild(document.createTextNode(s.slice(i, at)));
        const b = document.createElement('b');
        b.className = 'zw-b';
        b.textContent = m;
        f.appendChild(b);
        i = at + m.length;
        return m;
      });
      if (i < s.length) f.appendChild(document.createTextNode(s.slice(i)));
      n.replaceWith(f);
    });
  };

  const WS = ['driver', 'owner', 'cashier', 'account', 'admin'];
  const _r = render;
  render = function () {
    const out = _r.apply(this, arguments);
    try {
      const app = document.getElementById('app');
      if (S.me && app && WS.includes(S.ws || 'customer')) boldInfo(app);
    } catch (e) {
      console.error('[zammove] bold info', e);
    }
    return out;
  };
  render();
})();
