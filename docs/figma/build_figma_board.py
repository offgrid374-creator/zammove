"""Builds Figma-ready SVGs for the ZamMove system presentation.

    python build_figma_board.py

Outputs (next to this script):
  diagrams/01-architecture.svg, 02-booking-lifecycle.svg, 03-roles-and-features.svg, 04-data-model.svg
  ZamMove_System_Board.svg   (everything on one board, screenshots embedded)

Drag any of these SVG files onto a Figma canvas: shapes and text become editable layers.
Screenshots come from screens/ (captured from the running system).
"""
import base64, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
SCREENS = os.path.join(HERE, 'screens')
FONT = "Inter, 'Segoe UI', Arial, sans-serif"
INK, MUTED, LINE, BG, CARD = '#111827', '#5F6779', '#D5DAE3', '#F5F7FA', '#FFFFFF'
TEAL, TEAL_D, TEAL_L, ORANGE, ORANGE_L, GREEN_L, VIOLET_L = '#3FB8AF', '#0F766E', '#DDF3F1', '#C2410C', '#FDEBDD', '#DCF2E3', '#ECE9FB'


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def rect(x, y, w, h, fill=CARD, stroke=LINE, r=12, dash=False, sw=1.5):
    d = ' stroke-dasharray="8 6"' if dash else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>'


def text(x, y, s, size=16, weight=400, fill=INK, anchor='start'):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{esc(s)}</text>'


def wrap(s, size, width):
    words, lines, cur = str(s).split(), [], ''
    per = max(8, int(width / (size * 0.54)))
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > per:
            lines.append(cur); cur = w
        else:
            cur = (cur + ' ' + w) if cur else w
    if cur: lines.append(cur)
    return lines


def para(x, y, s, size=15, width=300, fill=MUTED, weight=400, lh=1.4, anchor='start'):
    out, lines = [], wrap(s, size, width)
    for i, ln in enumerate(lines):
        out.append(text(x, y + i * size * lh, ln, size, weight, fill, anchor))
    return ''.join(out), len(lines) * size * lh


def arrow(pts, color=MUTED, sw=2, dash=False, both=False):
    d = ' stroke-dasharray="7 6"' if dash else ''
    out = [f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="{sw}"{d}/>']
    def head(a, b):
        (x1, y1), (x2, y2) = a, b
        dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** .5 or 1; ux, uy = dx / L, dy / L
        p = [(x2, y2), (x2 - 11 * ux + 6 * uy, y2 - 11 * uy - 6 * ux), (x2 - 11 * ux - 6 * uy, y2 - 11 * uy + 6 * ux)]
        return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in p)}" fill="{color}"/>'
    out.append(head(pts[-2], pts[-1]))
    if both: out.append(head(pts[1], pts[0]))
    return ''.join(out)


def chip(x, y, s, fill=TEAL_L, color=TEAL_D, size=13):
    w = int(len(s) * size * 0.58) + 24
    return rect(x, y, w, 28, fill, fill, 14) + text(x + w / 2, y + 19, s, size, 600, color, 'middle'), w


def heading(title, sub, w):
    return text(40, 58, title, 30, 700) + text(40, 90, sub, 16, 400, MUTED)


def card(x, y, w, title, lines, fill=CARD, stroke=LINE, tsize=17, lsize=14, pad=20, title_fill=INK):
    body, cy = [], y + pad + tsize
    body.append(text(x + pad, cy, title, tsize, 700, title_fill)); cy += 10
    for ln in lines:
        p, h = para(x + pad, cy + lsize + 4, ln, lsize, w - 2 * pad)
        body.append(p); cy += h + 4
    h = cy - y + pad
    return rect(x, y, w, h, fill, stroke) + ''.join(body), h


# ---------------------------------------------------------------- 1. architecture
def architecture():
    W, H = 1600, 930
    o = [rect(0, 0, W, H, BG, BG, 0), heading('System architecture', 'Three tiers: browser screens → Node.js API that holds every business rule → Supabase Postgres', W)]
    # frontend
    o.append(rect(40, 120, 470, 640, '#EEF2F6', LINE, 16)); o.append(text(64, 156, 'Frontend (browser)', 20, 700)); o.append(text(64, 180, 'frontend/  ·  HTML, CSS, JavaScript', 14, 400, MUTED))
    o.append(rect(64, 200, 422, 156)); o.append(text(84, 230, 'Customer web app', 17, 700))
    o.append(text(84, 256, 'frontend/customer · one app with a workspace per role:', 14, 400, MUTED))
    x, y = 84, 272
    for i, s in enumerate(['Customer', 'Driver', 'Vehicle owner', 'Cashier', 'Admin console']):
        cp, cw = chip(x, y, s); o.append(cp); x += cw + 8
        if i == 2: x, y = 84, y + 38
    c, h = card(64, 372, 422, 'Admin Panel', ['frontend/admin · separate staff console']); o.append(c); y2 = 372 + h + 16
    c, h = card(64, y2, 422, 'shared/api.js', ['Keeps the login token per browser tab', 'Sends actions, receives the user’s view', 'Stores no business data in the browser'], TEAL_L, TEAL); o.append(c)
    # backend
    o.append(rect(590, 120, 520, 640, '#EEF2F6', LINE, 16)); o.append(text(614, 156, 'Backend (Node.js + Express)', 20, 700)); o.append(text(614, 180, 'backend/  ·  JavaScript', 14, 400, MUTED))
    y = 200
    for t, ls, f in [('app.js · routes', ['Checks the signed login token on every request'], CARD),
                     ('domain/ · business rules', ['auth · bookings · verification · rentals · workspace · finance · helpers', 'Pricing, capacity, driver eligibility, payments, PINs, remittances'], TEAL_L),
                     ('views.js · role-scoped data', ['Each user receives only what their role may see'], CARD),
                     ('state.js · safe writes', ['One action at a time · only changed rows saved · rollback on error'], CARD),
                     ('store/ · storage adapter', ['Supabase · local JSON file · memory (tests)'], CARD)]:
        c, h = card(614, y, 472, t, ls, f, TEAL if f == TEAL_L else LINE, 16, 13, 16); o.append(c)
        if y > 200: o.append(arrow([(850, y - 14), (850, y - 2)], TEAL_D))
        y += h + 16
    # data
    o.append(rect(1190, 120, 370, 640, '#EEF2F6', LINE, 16)); o.append(text(1214, 156, 'Database', 20, 700)); o.append(text(1214, 180, 'backend/sql/schema.sql', 14, 400, MUTED))
    c, h = card(1214, 200, 322, 'Supabase Postgres', ['14 tables · full record in JSONB plus indexed columns', 'Row Level Security on: public keys can read nothing'], TEAL_L, TEAL); o.append(c)
    c2, h2 = card(1214, 200 + h + 16, 322, 'Local JSON file', ['backend/.data · development without Supabase']); o.append(c2)
    c3, h3 = card(1214, 200 + h + h2 + 32, 322, 'Memory', ['Automated tests']); o.append(c3)
    # connectors
    o.append(arrow([(510, 430), (590, 430)], TEAL_D, 3, both=True))
    o.append(text(550, 412, 'HTTPS + JSON', 13, 700, TEAL_D, 'middle'))
    p, _ = para(550, 462, '/api/auth · /api/act/:action · /api/state', 12, 70, MUTED, 400, 1.3, 'middle'); o.append(p)
    o.append(arrow([(1110, 300), (1190, 300)], TEAL_D, 3, both=True))
    p, _ = para(1150, 330, 'service-role key (server only)', 12, 80, MUTED, 400, 1.3, 'middle'); o.append(p)
    # future
    o.append(rect(40, 790, 1520, 110, CARD, '#9AA3B4', 14, dash=True))
    o.append(text(64, 826, 'Not connected yet (future integrations)', 17, 700))
    x = 64
    for s in ['GCash / PayMongo gateway', 'SMS & email (codes shown on screen today)', 'Maps routing & live GPS', 'Photo storage (Supabase Storage)']:
        cp, cw = chip(x, 846, s, ORANGE_L, ORANGE, 14); o.append(cp); x += cw + 12
    return ''.join(o), W, H


# ---------------------------------------------------------------- 2. booking lifecycle
def lifecycle():
    W, H = 1600, 900
    o = [rect(0, 0, W, H, BG, BG, 0), heading('Booking lifecycle', 'One status order shared by the customer, driver, admin screens and the server', W)]
    NW, NH = 214, 86
    row1 = [('Pending', 'Customer requested'), ('Accepted', 'Driver assigned'), ('On the Way to Pickup', 'Tracking opens'), ('Awaiting Down Payment', 'Driver at pickup'), ('Down Payment Confirmed', '50% recorded'), ('Items Loaded', 'Pre-departure checks')]
    row2 = [('In Transit', 'Departure authorized'), ('Arrived at Destination', 'Delivery PIN issued'), ('Delivery Confirmation', 'Proof of delivery saved'), ('Awaiting Final Payment', 'Balance due'), ('Completed', 'Customer can rate')]
    xs = [40 + i * 260 for i in range(6)]
    y1, y2 = 170, 470
    def node(x, y, t, s, fill=CARD, stroke=TEAL):
        return rect(x, y, NW, NH, fill, stroke, 14, sw=2) + text(x + NW / 2, y + 37, t, 16, 700, INK, 'middle') + text(x + NW / 2, y + 62, s, 13, 400, MUTED, 'middle')
    for i, (t, s) in enumerate(row1): o.append(node(xs[i], y1, t, s))
    for i, (t, s) in enumerate(row2):
        x = xs[5 - i]; o.append(node(x, y2, t, s, GREEN_L if t == 'Completed' else CARD, TEAL_D if t == 'Completed' else TEAL))
    lab1 = ['Driver accepts (7 checks)', 'Heads to pickup', 'Arrives', '50% collected', 'Cargo loaded']
    for i, l in enumerate(lab1):
        a, b = xs[i] + NW, xs[i + 1]; o.append(arrow([(a + 4, y1 + NH / 2), (b - 4, y1 + NH / 2)], TEAL_D, 2.5))
        o.append(text((a + b) / 2, y1 - 14, l, 13, 700, TEAL_D, 'middle'))
    o.append(arrow([(xs[5] + NW / 2, y1 + NH + 4), (xs[5] + NW / 2, y2 - 4)], ORANGE, 3))
    p, _ = para(xs[5] + NW / 2 - 16, y1 + NH + 52, 'Start PIN + plate + cargo checklist + driver and customer confirm', 14, 230, ORANGE, 700, 1.4, 'end'); o.append(p)
    lab2 = ['Arrives', 'Delivery PIN + note', 'Requests balance', '50% collected']
    for i, l in enumerate(lab2):
        a, b = xs[5 - i], xs[4 - i] + NW; o.append(arrow([(a - 4, y2 + NH / 2), (b + 4, y2 + NH / 2)], ORANGE if i == 1 else TEAL_D, 2.5))
        o.append(text((a + b) / 2, y2 + NH + 30, l, 13, 700, ORANGE if i == 1 else TEAL_D, 'middle'))
    # side states
    o.append(node(40, 320, 'No driver found', 'Not accepted in time', ORANGE_L, ORANGE))
    o.append(arrow([(80, y1 + NH + 4), (80, 316)], ORANGE, 2))
    o.append(arrow([(210, 316), (210, y1 + NH + 4)], TEAL_D, 2, dash=True))
    o.append(text(88, y1 + NH + 38, 'After 30 min', 13, 700, ORANGE))
    p, _ = para(218, y1 + NH + 20, 'Re-submit or admin assigns', 13, 90, TEAL_D, 700, 1.25); o.append(p)
    o.append(node(40, 640, 'Cancelled', 'By the customer', '#F3F4F6', '#9AA3B4'))
    o.append(arrow([(150, 410), (150, 636)], '#9AA3B4', 2, dash=True))
    c, h = card(300, 640, 600, 'Cancellation', ['Allowed from Pending, No driver found, Accepted, On the Way to Pickup and Awaiting Down Payment.', 'Free before a driver accepts; 10% fee afterwards (recorded as a payment for a cashier to verify).'])
    o.append(c)
    c, h = card(930, 640, 630, 'Rules enforced by the server', ['PINs: 6 digits, expire in 30 min, 5 wrong tries lock for 5 min; the admin can waive with a reason.', 'Payments: a customer GCash proof counts only when the driver records it; each payment counted once.'], TEAL_L, TEAL)
    o.append(c)
    return ''.join(o), W, H


# ---------------------------------------------------------------- 3. roles
def roles():
    W, H = 1600, 860
    o = [rect(0, 0, W, H, BG, BG, 0), heading('Roles and features', 'One account can hold several roles (for example an Owner-Driver). Staff roles are appointed by the owner admin.', W)]
    R = [('Customer', 'Sign up and verify', TEAL, ['Book a haul with an upfront price', 'Pay 50% at pickup, 50% after delivery (GCash proof or cash)', 'Track the trip; show Start and Delivery PINs', 'Self-drive rental with deposit', 'Report incidents', 'Reviews and notifications']),
         ('Driver', 'Apply → interview → approved', '#2563EB', ['Set availability', 'Accept eligible requests (7 checks)', 'Run trip steps', 'Record collections', 'Verify PINs, plate and cargo', 'Submit weekly remittance']),
         ('Vehicle owner', 'Apply → approved', '#7C3AED', ['Register vehicles (OR/CR upload)', 'Set vehicle status', 'Assign or recommend drivers', 'Trip history per vehicle']),
         ('Cashier', 'Appointed by owner admin', ORANGE, ['Verify rental, deposit and fee payments', 'Verify weekly remittances', 'Resolve discrepancies', 'Ledger, CSV export, settlements']),
         ('Administrator', 'Appointed by owner admin', TEAL_D, ['Review applications (interview, orientation)', 'Approve vehicles and assignments', 'Assign drivers to waiting bookings', 'Waive PINs with a reason', 'Investigate incidents', 'Settings (rates, response time)']),
         ('Owner admin', 'One-time setup', INK, ['Everything an administrator does', 'Appoint and revoke staff', 'Reset prototype data'])]
    cw = (W - 80 - 5 * 16) / 6
    y = 130; bodies, bottom = [], 0
    for i, (name, how, col, feats) in enumerate(R):
        x = 40 + i * (cw + 16); body, cy = [], y + 100
        for f in feats:
            p, h = para(x + 34, cy, f, 15, cw - 52, INK); body.append(f'<circle cx="{x + 22}" cy="{cy - 5}" r="4" fill="{col}"/>' + p); cy += h + 12
        bodies.append((x, name, how, col, body)); bottom = max(bottom, cy)
    ch = bottom - y + 10
    for x, name, how, col, body in bodies:
        o.append(rect(x, y, cw, ch, CARD, LINE, 14))
        o.append(f'<path d="M{x + 14} {y} H{x + cw - 14} Q{x + cw} {y} {x + cw} {y + 14} V{y + 72} H{x} V{y + 14} Q{x} {y} {x + 14} {y} Z" fill="{col}"/>')
        o.append(text(x + 20, y + 35, name, 20, 700, '#FFFFFF')); o.append(text(x + 20, y + 58, how, 13, 400, '#FFFFFF'))
        o.extend(body)
    by = y + ch + 30
    o.append(rect(40, by, W - 80, 64, TEAL_L, TEAL, 12))
    o.append(text(64, by + 39, 'Customers, drivers, owners and cashiers use the web app (frontend/customer); staff can also use the separate Admin Panel (frontend/admin).', 15, 600, TEAL_D))
    H = by + 64 + 40
    o[0] = rect(0, 0, W, H, BG, BG, 0)
    return ''.join(o), W, H


# ---------------------------------------------------------------- 4. data model
def data_model():
    W, H = 1600, 980
    o = [rect(0, 0, W, H, BG, BG, 0), heading('Database model (Supabase Postgres)', 'Every table: id, data (JSONB full record), created_at, updated_at, plus the indexed columns shown. RLS on; only the backend can access.', W)]
    T = {
        'users': (40, 130, ['id = email (PK)', 'name', 'admin_level · is_cashier', 'status', 'data: roles, phone, password hash']),
        'applications': (40, 380, ['id', 'user_email → users', 'role · status', 'data: documents, interview, history']),
        'driver_status': (40, 600, ['id = driver email → users', 'availability']),
        'notifications': (40, 760, ['id', 'recipient_email → users', 'is_read']),
        'vehicles': (420, 130, ['id', 'owner_email → users', 'type · plate (unique)', 'approval · status']),
        'assignments': (420, 380, ['id', 'vehicle_id → vehicles', 'driver_email → users', 'status']),
        'remittances': (420, 600, ['id', 'driver_email → users', 'week · status · amount_due']),
        'audit_log': (420, 790, ['id', 'actor · event · created_at']),
        'bookings': (800, 130, ['id', 'customer_email → users', 'driver_email → users', 'vehicle_id → vehicles', 'status · pickup_date · total', 'data: route, cargo, checks, proof']),
        'payments': (800, 470, ['id', 'ref_id → bookings / rentals', 'kind · method · amount', 'reference · status', 'payer_email · collected_by']),
        'settings': (800, 790, ["id = 'main'", 'data: rates, response time']),
        'rentals': (1180, 130, ['id', 'customer_email → users', 'vehicle_type · status', 'start_date · end_date']),
        'incidents': (1180, 420, ['id', 'booking_id → bookings', 'reporter_email', 'severity · status']),
        'reviews': (1180, 660, ['id', 'booking_id → bookings', 'rating']),
    }
    BW, box = 340, {}
    for name, (x, y, cols) in T.items():
        h = 48 + 24 * len(cols); box[name] = (x, y, BW, h)
    def edge(a, side):
        x, y, w, h = box[a]
        return {'r': (x + w, y + 40), 'l': (x, y + 40), 'b': (x + w / 2, y + h), 't': (x + w / 2, y), 'bl': (x + 40, y + h), 'r2': (x + w, y + h - 30)}[side]
    G = '#9AA3B4'
    def link(pts, dash=False):
        d = ' stroke-dasharray="6 5"' if dash else ''
        o.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="{G}" stroke-width="2"{d}/><circle cx="{pts[-1][0]}" cy="{pts[-1][1]}" r="4" fill="{G}"/>')
    for a, sa, b, sb in [('users', 'r', 'vehicles', 'l'), ('vehicles', 'b', 'assignments', 't'), ('vehicles', 'r', 'bookings', 'l'), ('bookings', 'b', 'payments', 't')]:
        link([edge(a, sa), edge(b, sb)])
    bx, by = edge('bookings', 'r2')
    for t in ['incidents', 'reviews']:                     # booking-owned tables
        x, yy, w, h = box[t]; link([(bx, by), (1158, by), (1158, yy + 40), (x, yy + 40)])
    rx, ry = edge('rentals', 'bl'); px, py = box['payments'][0] + BW, box['payments'][1] + 80
    link([(rx, ry), (rx, 350), (1170, 350), (1170, py), (px, py)], dash=True)   # rental payments
    link([edge('users', 't'), (210, 116), (970, 116), edge('bookings', 't')])
    o.append(text(590, 110, 'customer · driver', 12, 600, MUTED, 'middle'))
    for t in ['applications', 'driver_status', 'notifications']:   # user-owned tables: bus on the left
        x, yy, w, h = box[t]; link([(40, 170), (24, 170), (24, yy + 40), (40, yy + 40)])
    for name, (x, y, cols) in T.items():
        _, _, w, h = box[name]
        o.append(rect(x, y, w, h, CARD, LINE, 12))
        o.append(f'<path d="M{x + 12} {y} H{x + w - 12} Q{x + w} {y} {x + w} {y + 12} V{y + 40} H{x} V{y + 12} Q{x} {y} {x + 12} {y} Z" fill="{TEAL_L}"/>')
        o.append(text(x + 16, y + 27, name, 17, 700, TEAL_D))
        for i, c in enumerate(cols):
            o.append(text(x + 16, y + 66 + i * 24, c, 14, 600 if '→' in c or 'PK' in c else 400, INK if '→' in c or 'PK' in c else MUTED))
    o.append(text(40, 950, 'Lines show the main references (arrows in the column lists). Links are checked by the backend rules; the full record of each row is the JSONB data column.', 14, 400, MUTED))
    return ''.join(o), W, H


def svg(inner, w, h):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{inner}</svg>\n'


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    return struct.unpack('>II', head[16:24])


SCREEN_GROUPS = [
    ('Public pages and sign-in', ['01-landing', '02-signup', '03-login']),
    ('Customer', ['04-customer-home', '05-book-a-haul', '06-my-bookings', '07-track-start-pin', '08-self-drive-rental', '09-report-incident', '10-payment-history', '11-notifications']),
    ('Driver', ['12-driver-dashboard', '13-driver-requests', '14-driver-active-trip-verification', '15-driver-earnings']),
    ('Vehicle owner and role applications', ['16-owner-dashboard', '17-owner-vehicles', '18-owner-drivers', '19-apply-for-role']),
    ('Cashier', ['20-cashier-remittances', '21-cashier-payments-to-verify', '22-cashier-ledger']),
    ('Admin console (in the web app)', ['23-admin-overview', '24-admin-bookings', '25-admin-applications', '26-admin-trip-verification', '27-admin-incidents', '28-admin-staff']),
    ('Admin Panel (separate staff app)', ['29-adminpanel-login', '30-adminpanel-overview', '31-adminpanel-payments', '32-adminpanel-remittances']),
]
MOBILE = ['m1-landing', 'm2-customer-home', 'm3-track-start-pin', 'm4-driver-active-trip']


def title_of(name):
    return name.split('-', 1)[1].replace('-', ' ').capitalize().replace('Adminpanel', 'Admin Panel')


def image(name, x, y, w, max_h, cid):
    path = os.path.join(SCREENS, name + '.png')
    if not os.path.exists(path):
        return rect(x, y, w, max_h, '#EEF2F6', LINE, 10) + text(x + w / 2, y + max_h / 2, 'missing: ' + name, 14, 400, MUTED, 'middle'), max_h
    iw, ih = png_size(path); h = w * ih / iw; shown = min(h, max_h)
    data = base64.b64encode(open(path, 'rb').read()).decode()
    clip = f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{shown}" rx="10"/></clipPath>'
    return (clip + f'<image x="{x}" y="{y}" width="{w}" height="{h:.1f}" clip-path="url(#{cid})" preserveAspectRatio="none" xlink:href="data:image/png;base64,{data}"/>'
            + rect(x, y, w, shown, 'none', LINE, 10)), shown


def board(diagrams):
    W, M = 3400, 60
    o, y = [], 0
    o.append(text(M, 110, 'ZamMove — Hauling and Self-Drive Rental System', 64, 700))
    o.append(text(M, 168, 'Zamboanga City · Software Engineering project · system overview', 28, 400, MUTED))
    x = M
    for s in ['Frontend: HTML · CSS · JavaScript', 'Backend: Node.js + Express (JavaScript)', 'Database: Supabase Postgres', 'Roles: customer · driver · vehicle owner · cashier · admin']:
        cp, cw = chip(x, 200, s, TEAL_L, TEAL_D, 18); o.append(cp); x += cw + 14
    y = 280
    for i in range(0, 4, 2):
        h = 0
        for j, (inner, w, hh) in enumerate(diagrams[i:i + 2]):
            dx = M + j * (1600 + 80)
            o.append(f'<g transform="translate({dx},{y})">{inner}</g>'); o.append(rect(dx, y, w, hh, 'none', LINE, 0)); h = max(h, hh)
        y += h + 80
    cid = 0
    tw, gap = (W - 2 * M - 3 * 80) / 4, 80
    for title, names in SCREEN_GROUPS:
        o.append(text(M, y + 50, 'Screens · ' + title, 40, 700)); y += 90
        for r in range(0, len(names), 4):
            row_h = 0
            for k, n in enumerate(names[r:r + 4]):
                cid += 1; xx = M + k * (tw + gap)
                im, sh = image(n, xx, y, tw, tw * 900 / 1440, f'c{cid}'); o.append(im)
                o.append(text(xx, y + sh + 34, n.split('-')[0] + '  ' + title_of(n), 20, 600)); row_h = max(row_h, sh + 60)
            y += row_h + 30
        y += 30
    o.append(text(M, y + 50, 'Screens · Mobile', 40, 700)); y += 90
    mw = 360
    for k, n in enumerate(MOBILE):
        cid += 1; xx = M + k * (mw + 120)
        im, sh = image(n, xx, y, mw, 780, f'c{cid}'); o.append(im)
        o.append(text(xx, y + sh + 34, title_of(n), 20, 600))
    y += 780 + 120
    return svg(rect(0, 0, W, y, BG, BG, 0) + ''.join(o), W, y)


if __name__ == '__main__':
    os.makedirs(os.path.join(HERE, 'diagrams'), exist_ok=True)
    ds = []
    for name, fn in [('01-architecture', architecture), ('02-booking-lifecycle', lifecycle), ('03-roles-and-features', roles), ('04-data-model', data_model)]:
        inner, w, h = fn(); ds.append((inner, w, h))
        open(os.path.join(HERE, 'diagrams', name + '.svg'), 'w', encoding='utf-8').write(svg(inner, w, h))
        print('wrote diagrams/' + name + '.svg')
    open(os.path.join(HERE, 'ZamMove_System_Board.svg'), 'w', encoding='utf-8').write(board(ds))
    print('wrote ZamMove_System_Board.svg')
