"""Builds the ZamMove client prototype for Figma.

    python build_client_prototype.py

Reads   source/meta.json + source/vector/*.svg    (editable screens converted from the running system:
                                                   text, shapes, icons and images as separate layers)
Writes  frames/*.svg                               one Figma frame per screen + cover, overview and index
        screens-editable/*.svg                     the same screens without annotations (pure app layout)
        ZamMove_Client_Prototype_Board.svg         every frame on one board (for a quick look)

Each frame: header (role, number, title, purpose), the editable app screen with numbered markers, a side panel
explaining every marker in plain language, the example data shown, and "Go to" buttons that you connect
to the next frames in Figma's Prototype tab.
"""
import base64, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = os.path.join(HERE, 'frames')
FONT = "Inter, 'Segoe UI', Arial, sans-serif"
INK, MUTED, LINE, BG, CARD = '#111827', '#4B5563', '#D9DEE7', '#F3F5F9', '#FFFFFF'
MARK = '#E8590C'
ROLE = {  # role: (strong, light)
    'Public': ('#475569', '#E2E8F0'), 'Customer': ('#0F766E', '#D5F2EE'), 'Customer / Driver': ('#0F766E', '#D5F2EE'),
    'Driver': ('#1D4ED8', '#DBE6FE'), 'Vehicle owner': ('#6D28D9', '#EAE2FD'), 'Any user': ('#475569', '#E2E8F0'),
    'Cashier': ('#B45309', '#FCEBCF'), 'Administrator': ('#B91C1C', '#FBE0E0'), 'Phone': ('#334155', '#E2E8F0'),
}
W = 1920


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def ident(s):
    return re.sub(r'[^A-Za-z0-9_.\-→ ]', '', s).strip().replace(' ', '_')


def text(x, y, s, size=16, weight=400, fill=INK, anchor='start', ls=0):
    l = f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{l}>{esc(s)}</text>'


def wrap(s, size, width, k=0.575):
    per = max(6, int(width / (size * k)))
    words, lines, cur = str(s).split(), [], ''
    for w in words:
        if cur and len(cur) + 1 + len(w) > per:
            lines.append(cur); cur = w
        else:
            cur = (cur + ' ' + w) if cur else w
    if cur:
        lines.append(cur)
    return lines


def para(x, y, s, size=16, width=400, fill=MUTED, weight=400, lh=1.45):
    lines = wrap(s, size, width)
    return ''.join(text(x, y + i * size * lh, ln, size, weight, fill) for i, ln in enumerate(lines)), len(lines) * size * lh


def rect(x, y, w, h, fill=CARD, stroke=LINE, r=14, sw=1.5, extra=''):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>'


def badge(cx, cy, n, r=17, fill=MARK):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" stroke="#fff" stroke-width="3"/>'
            + text(cx, cy + r * 0.36, n, int(r * 1.05), 700, '#fff', 'middle'))


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode()


def button(x, y, label, target, strong, w=None):
    w = w or max(150, len(label) * 9.2 + 64)
    return (f'<g id="{ident("Go to " + target)}">' + rect(x, y, w, 46, strong, strong, 23, 0)
            + text(x + 22, y + 29, label, 16, 600, '#fff') + text(x + w - 22, y + 29, '→', 18, 700, '#fff', 'end') + '</g>'), w


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{int(h)}" '
            f'viewBox="0 0 {w} {int(h)}"><title>{esc(title)}</title>{body}</svg>')


# ---------------------------------------------------------------- editable screen (vector, from the live page)
def read_screen(m):
    s = open(os.path.join(SRC, m['svg']), encoding='utf-8').read()
    return s.replace('id="zban"', 'id="Prototype-banner"')


def vector_inner(m, prefix):
    """The editable screen SVG without its outer <svg> tag; internal ids prefixed so frames can share one board."""
    s = read_screen(m)
    s = re.sub(r'^<svg[^>]*>', '', s.strip())[:-6]
    p = re.sub(r'[^A-Za-z0-9]', '', prefix)
    s = re.sub(r'id="(clip\d+|grad\d+|screen-clip)"', lambda g: f'id="{p}-{g.group(1)}"', s)
    return re.sub(r'url\(#(clip\d+|grad\d+|screen-clip)\)', lambda g: f'url(#{p}-{g.group(1)})', s)


# ---------------------------------------------------------------- screen frame
def screen_frame(m, titles):
    strong, light = ROLE.get(m['role'], ROLE['Public'])
    phone = m['device'] == 'phone'
    num = m['id'].split('-')[0]
    sec = dict((k, t) for k, t, _ in SECTIONS).get(m.get('section'), '')
    out = [f'<rect width="{W}" height="100%" fill="{BG}"/>']
    # header
    out.append(f'<g id="Header">' + rect(0, 0, W, 150, CARD, CARD, 0, 0) + f'<rect x="0" y="150" width="{W}" height="1.5" fill="{LINE}"/>')
    out.append(rect(60, 34, len(m['role']) * 10 + 36, 34, light, light, 17, 0) + text(78, 57, m['role'].upper(), 14, 700, strong, ls=1))
    out.append(text(60 + len(m['role']) * 10 + 52, 58, f'Screen {num}', 16, 500, MUTED))
    out.append(text(60, 112, m['title'], 40, 700, INK))
    out.append(text(W - 60, 58, 'ZamMove · client prototype', 16, 600, strong, 'end'))
    out.append(text(W - 60, 84, sec, 14, 600, MUTED, 'end') + text(W - 60, 106, 'Example data · names are fictional', 14, 400, MUTED, 'end') + '</g>')

    # screenshot
    sx, sy = 60, 200
    if phone:
        sw = 390 * 1.25
        sh = m['h'] * sw / m['w']
        out.append('<g id="Phone">' + rect(sx + 260 - 22, sy - 22, sw + 44, sh + 44, '#1F2937', '#1F2937', 54, 0))
        sx = sx + 260
    else:
        sw = 1180
        sh = m['h'] * sw / m['w']
        out.append('<g id="Screen">' + rect(sx - 1, sy - 40, sw + 2, sh + 41, '#E5E9F0', LINE, 14, 1.5)
                   + ''.join(f'<circle cx="{sx + 22 + i * 20}" cy="{sy - 20}" r="6" fill="{c}"/>' for i, c in enumerate(['#F87171', '#FBBF24', '#34D399']))
                   + rect(sx + 100, sy - 31, 520, 22, CARD, CARD, 11, 0) + text(sx + 116, sy - 15, 'zammove.ph/' + m['id'].split('-', 1)[1], 12, 400, MUTED))
    k = sw / m['w']
    out.append(f'<g id="App-screen" transform="translate({sx:.1f},{sy:.1f}) scale({k:.5f})">{vector_inner(m, m["id"])}</g>')
    for i, c in enumerate(m['callouts'], 1):
        x, y, w, h = sx + c['x'] * k, sy + c['y'] * k, max(c['w'] * k, 24), max(c['h'] * k, 18)
        x, w = max(sx, x - 4), min(w + 8, sx + sw - max(sx, x - 4))
        y, h = max(sy, y - 4), min(h + 8, sy + sh - max(sy, y - 4))
        out.append(f'<g id="Marker_{i}">' + rect(x, y, w, h, 'none', MARK, 8, 3)
                   + badge(max(sx + 18, x - 2), max(sy + 18, y - 2), str(i)) + '</g>')
    out.append('</g>')
    left_bottom = sy + sh + 60

    # side panel
    px, pw = (sx + sw + 90) if phone else 1300, (W - 60 - ((sx + sw + 90) if phone else 1300))
    y = 200
    body = []
    body.append(text(px, y + 6, 'WHAT THIS SCREEN IS FOR', 13, 700, strong, ls=1.2)); y += 34
    t, hh = para(px, y, m['purpose'], 20, pw, INK, 500, 1.42); body.append(t); y += hh + 16
    # example box
    ex_lines = wrap(m['example'], 16, pw - 48)
    bh = 52 + len(ex_lines) * 16 * 1.45
    body.append(rect(px, y, pw, bh, light, light, 14, 0) + text(px + 24, y + 30, 'EXAMPLE DATA ON THIS SCREEN', 12, 700, strong, ls=1.1))
    t, _ = para(px + 24, y + 56, m['example'], 16, pw - 48, INK); body.append(t); y += bh + 34
    # numbered explanations
    body.append(text(px, y, 'WHAT EACH NUMBER MEANS', 13, 700, strong, ls=1.2)); y += 24
    for i, c in enumerate(m['callouts'], 1):
        lines = wrap(c['text'], 16, pw - 64)
        ch = 34 + len(lines) * 16 * 1.45 + 14
        body.append(f'<g id="Note_{i}">' + rect(px, y, pw, ch, CARD, LINE, 12, 1.2) + badge(px + 28, y + 30, str(i), 15)
                    + text(px + 56, y + 36, c['title'], 18, 700, INK))
        t, _ = para(px + 56, y + 62, c['text'], 16, pw - 72); body.append(t + '</g>')
        y += ch + 10
    y += 24
    if m.get('next'):
        body.append(text(px, y, 'GO TO (connect these in Figma → Prototype)', 13, 700, strong, ls=1.2)); y += 18
        bx = px
        for target, label in m['next']:
            lab = f"{label} · {target.split('-')[0]}"
            g, bw = button(bx, y, lab, target, strong)
            if bx + bw > px + pw and bx > px:
                bx, y = px, y + 58
                g, bw = button(bx, y, lab, target, strong)
            body.append(g); bx += bw + 12
        y += 58
        names = ', '.join(f"{t.split('-')[0]} {titles.get(t, t)}" for t, _ in m['next'])
        t, hh = para(px, y + 14, 'Leads to: ' + names, 14, pw, MUTED); body.append(t); y += hh + 14
    g, _ = button(px, y + 16, 'Screen index', '00c-index', '#334155', 190); body.append(g); y += 80
    out.append('<g id="Explanation">' + ''.join(body) + '</g>')
    H = max(left_bottom, y + 40, 900)
    return svg(W, H, ''.join(out), f"{num} {m['title']}"), H


# ---------------------------------------------------------------- intro frames
def cover():
    o = [f'<rect width="{W}" height="1080" fill="#0F172A"/>',
         f'<circle cx="1640" cy="160" r="420" fill="#0F766E" opacity="0.35"/><circle cx="1800" cy="900" r="300" fill="#3FB8AF" opacity="0.18"/>',
         text(140, 300, 'ZamMove', 132, 800, '#FFFFFF', ls=-3),
         text(146, 380, 'Booking, tracking and payment settlement for moving and goods transport', 34, 500, '#C7F2EC'),
         text(146, 428, 'in Zamboanga City, plus self-drive vehicle rental', 34, 500, '#C7F2EC'),
         text(146, 540, 'CLIENT PROTOTYPE', 20, 700, '#3FB8AF', ls=3)]
    t, _ = para(146, 590, 'A walk-through of every screen of the working system, captured with realistic example data. '
                'Numbered markers on each screen are explained in plain language on the right. Use the buttons to move between screens.',
                24, 1100, '#CBD5E1', 400, 1.5)
    o.append(t)
    roles = [('Customer', 'Books hauls, rents vehicles, tracks trips, pays'), ('Driver', 'Accepts jobs, runs the trip, collects payment'),
             ('Vehicle owner', 'Registers vehicles, assigns drivers, rents out'), ('Cashier', 'Verifies payments and weekly remittances'),
             ('Administrator', 'Approves people and vehicles, oversees everything')]
    for i, (r, d) in enumerate(roles):
        x = 146 + i * 330
        strong, light = ROLE[r]
        o.append(rect(x, 790, 310, 150, '#1E293B', '#334155', 18, 1.5) + f'<rect x="{x}" y="790" width="8" height="150" rx="4" fill="{light}"/>'
                 + text(x + 30, 838, r, 24, 700, '#FFFFFF'))
        t, _ = para(x + 30, 872, d, 17, 260, '#94A3B8'); o.append(t)
    g, _ = button(146, 980, 'Start: how ZamMove works', '00b-how-it-works', '#0F766E', 300); o.append(g)
    g, _ = button(466, 980, 'Screen index', '00c-index', '#334155', 190); o.append(g)
    return svg(W, 1080, ''.join(o), '00 ZamMove client prototype')


def flow_row(x, y, steps, strong, light, title, note):
    o = [text(x, y, title, 28, 700, INK)]
    t, _ = para(x, y + 34, note, 17, 1700, MUTED); o.append(t)
    y += 70
    bw, gap = (1800 - (len(steps) - 1) * 26) / len(steps), 26
    for i, (head, who, desc) in enumerate(steps):
        bx = x + i * (bw + gap)
        o.append(rect(bx, y, bw, 190, CARD, LINE, 16, 1.5) + f'<rect x="{bx}" y="{y}" width="{bw}" height="8" rx="4" fill="{strong}"/>')
        o.append(badge(bx + 28, y + 42, str(i + 1), 15, strong) + text(bx + 54, y + 48, head, 19, 700, INK))
        o.append(rect(bx + 20, y + 68, len(who) * 8.2 + 24, 26, light, light, 13, 0) + text(bx + 32, y + 86, who, 13, 700, strong))
        t, _ = para(bx + 20, y + 120, desc, 15, bw - 40); o.append(t)
        if i < len(steps) - 1:
            ax = bx + bw + 3
            o.append(f'<polygon points="{ax},{y + 86} {ax + 18},{y + 95} {ax},{y + 104}" fill="{MUTED}"/>')
    return ''.join(o)


def how_it_works():
    c, cl = ROLE['Customer']; d, dl = ROLE['Driver']; ow, owl = ROLE['Vehicle owner']; k, kl = ROLE['Cashier']
    o = [f'<rect width="{W}" height="1500" fill="{BG}"/>', text(60, 110, 'How ZamMove works', 52, 800, INK)]
    t, _ = para(60, 160, 'Two services run on one system: booking a truck with a driver, and renting a vehicle to drive yourself. '
                'Every rule (prices, who may accept a job, payments, availability) is checked by the server, not the phone.', 20, 1750, MUTED)
    o.append(t)
    o.append(flow_row(60, 270, [
        ('Book', 'Customer', 'Pickup, drop-off, vehicle, date, items. Fare shown instantly.'),
        ('Accept', 'Driver', 'First eligible driver accepts. Customer sees driver, plate, color.'),
        ('Pay 50%', 'Customer → Driver', 'Down payment at pickup by GCash or cash.'),
        ('Start PIN', 'Customer + Driver', 'Cargo checklist confirmed; driver enters the customer’s PIN.'),
        ('Live trip', 'Customer', 'Live map, status updates and an optional Waze link.'),
        ('Deliver', 'Customer + Driver', 'Delivery PIN, final 50%, rating and review.'),
        ('Remit', 'Driver → Cashier', 'Each week the driver remits 80%; the cashier verifies it.'),
    ], c, cl, 'A. Hauling (truck with driver)', 'From request to delivery, with two PIN checks and a 50/50 payment.'))
    o.append(flow_row(60, 640, [
        ('Request', 'Customer', 'Dates, model and unit; ID and license photos.'),
        ('Approve', 'Vehicle owner', 'Owner approves; ZamMove issues the rental contract.'),
        ('Sign + pay', 'Customer + Owner', 'Both sign online or on paper; rent and deposit paid in full.'),
        ('Release', 'Vehicle owner', 'Odometer, fuel and 6 photos; the renter confirms.'),
        ('Track', 'Customer → Owner', 'Renter shares location; owner sees it on a map.'),
        ('Return', 'Vehicle owner', 'Readings and 6 photos again; tracking stops.'),
        ('Settle', 'Owner + Admin', 'Deposit refunded, or a claim accepted or decided by an admin.'),
    ], ow, owl, 'B. Self-drive rental', 'Contract, full payment and photo evidence protect both sides; a unit can never be double-booked.'))
    o.append(text(60, 1030, 'C. Who keeps it running', 28, 700, INK))
    cards = [('Administrator', 'Approves driver and owner applications (verification → interview → orientation), vehicles and assignments; handles incidents; sets the remittance rate.'),
             ('Cashier', 'Verifies rental payments, deposits and drivers’ weekly remittances; keeps the ledger and settlements.'),
             ('Not connected yet', 'SMS/email and a real GCash gateway are simulated in this prototype. GPS needs HTTPS on phones.')]
    for i, (h, s) in enumerate(cards):
        x = 60 + i * 610
        strong = ROLE.get(h, ('#475569', ''))[0]
        o.append(rect(x, 1060, 590, 200, CARD, LINE, 16, 1.5) + f'<rect x="{x}" y="1060" width="8" height="200" rx="4" fill="{strong}"/>' + text(x + 32, 1108, h, 22, 700, INK))
        t, _ = para(x + 32, 1144, s, 17, 530); o.append(t)
    g, _ = button(60, 1320, 'See every screen', '00c-index', '#0F766E', 240); o.append(g)
    g, _ = button(316, 1320, 'Start with sign-up', 'A01-landing', '#334155', 230); o.append(g)
    g, _ = button(566, 1320, 'Follow one move step by step', 'C01-pending', '#1D4ED8', 330); o.append(g)
    g, _ = button(912, 1320, 'Follow one rental step by step', 'D01-rent-choose', '#6D28D9', 340); o.append(g)
    return svg(W, 1500, ''.join(o), '00b How ZamMove works')


SECTIONS = [
    ('A', 'Account: sign up, verify, log in, reset password', 'Public'),
    ('B', 'Booking a haul', 'Customer'),
    ('C', 'The move, step by step (customer and driver side by side)', 'Customer'),
    ('D', 'Self-drive rental, step by step (renter, owner and administrator)', 'Vehicle owner'),
    ('E', 'Customer account and support', 'Customer'),
    ('F', 'Driver workspace and role applications', 'Driver'),
    ('G', 'Vehicle owner workspace', 'Vehicle owner'),
    ('H', 'Cashier', 'Cashier'),
    ('I', 'Administrator', 'Administrator'),
    ('M', 'Phone screens', 'Phone'),
]


def index(meta):
    o = [text(60, 110, 'Screen index', 52, 800, INK),
         text(60, 156, f'{len(meta)} screens in {len(SECTIONS)} sections. Each tile is a button: connect it to the matching frame in Figma’s Prototype tab.', 20, 400, MUTED)]
    y, cols, col_w = 220, 3, 586
    for key, title, role in SECTIONS:
        ms = [m for m in meta if m.get('section') == key]
        if not ms:
            continue
        strong, light = ROLE[role]
        o.append(rect(60, y, 52, 36, strong, strong, 18, 0) + text(86, y + 25, key, 18, 800, '#fff', 'middle') + text(126, y + 26, title, 22, 700, INK))
        y += 56
        for i, m in enumerate(ms):
            x = 60 + (i % cols) * (col_w + 20)
            yy = y + (i // cols) * 72
            rs, _ = ROLE.get(m['role'], ROLE['Public'])
            label = m['title'] if len(m['title']) <= 50 else m['title'][:49] + '…'
            o.append(f'<g id="{ident("Go to " + m["id"])}">' + rect(x, yy, col_w, 58, CARD, LINE, 12, 1.2) + f'<rect x="{x}" y="{yy}" width="6" height="58" rx="3" fill="{rs}"/>'
                     + text(x + 22, yy + 36, m['id'].split('-')[0], 17, 800, rs) + text(x + 74, yy + 36, label, 16, 600, INK) + '</g>')
        y += ((len(ms) + cols - 1) // cols) * 72 + 34
    return svg(W, y + 40, f'<rect width="{W}" height="{y + 40}" fill="{BG}"/>' + ''.join(o), '00c Screen index'), y + 40


# ---------------------------------------------------------------- main
def main():
    meta = json.load(open(os.path.join(SRC, 'meta.json'), encoding='utf-8'))
    titles = {m['id']: m['title'] for m in meta}
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.svg'):
            os.remove(os.path.join(OUT, f))
    frames = [('00a-cover', cover(), 1080), ('00b-how-it-works', how_it_works(), 1500)]
    ix, ih = index(meta)
    frames.append(('00c-index', ix, ih))
    for m in meta:
        s, h = screen_frame(m, titles)
        frames.append((m['id'], s, h))
    for name, s, _ in frames:
        open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8').write(s)
    # clean editable screens (no annotations): the real app layout as Figma layers, for adjusting and prototyping
    ed = os.path.join(HERE, 'screens-editable')
    os.makedirs(ed, exist_ok=True)
    for f in os.listdir(ed):
        if f.endswith('.svg'):
            os.remove(os.path.join(ed, f))
    for m in meta:
        src = read_screen(m)
        src = src.replace('<svg ', f'<svg id="{ident(m["id"] + " " + m["title"])}" ', 1)
        open(os.path.join(ed, f"{m['id']}.svg"), 'w', encoding='utf-8').write(src)
    # one board: frames in rows of 4
    cols, gap = 4, 200
    rows, x, y, rowh, parts = [], 0, 0, 0, []
    for i, (name, s, h) in enumerate(frames):
        if i and i % cols == 0:
            y += rowh + gap; x = 0; rowh = 0
        inner = re.sub(r'^<svg [^>]*>', '', s)[:-6]
        parts.append(f'<g id="{ident(name)}" transform="translate({x},{y})"><rect width="{W}" height="{h}" fill="{BG}"/>{inner}</g>')
        x += W + gap; rowh = max(rowh, h)
    bw, bh = cols * W + (cols - 1) * gap, y + rowh
    open(os.path.join(HERE, 'ZamMove_Client_Prototype_Board.svg'), 'w', encoding='utf-8').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{bw}" height="{bh}" viewBox="0 0 {bw} {bh}">{"".join(parts)}</svg>')
    print(f'{len(frames)} frames written to frames/ and the board.')


if __name__ == '__main__':
    main()
