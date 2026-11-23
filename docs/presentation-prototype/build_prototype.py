"""Builds the ZamMove interactive prototype from a screen capture.

    python build_prototype.py <capture-folder>

The capture folder holds meta.json and screens/*.jpg (the same capture that feeds the Figma files).
Writes data.js and copies the screenshots into screens/. Open index.html in any browser; no server needed.
"""
import json
import os
import re
import shutil
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'source')

SECTIONS = {
    'A': 'Account',
    'B': 'Booking a haul',
    'C': 'The move, step by step',
    'D': 'Self-drive rental',
    'E': 'Customer account',
    'F': 'Driver',
    'G': 'Vehicle owner',
    'H': 'Cashier',
    'I': 'Administrator',
    'M': 'Phone',
}

TAGLINE = ('Book a van or truck with a driver, or rent a vehicle to drive yourself, in Zamboanga City: '
           'fixed prices from the real road distance, live tracking, PIN checks at pickup and delivery, '
           'and every rule checked by the server.')

ABOUT = [
    ['The problem', 'Moving goods in Zamboanga City means calling around for a truck, haggling over the price and not knowing where your things are. Owners of vans and cars have no safe way to rent them out or find drivers.'],
    ['What ZamMove does', [
        'Hauling: book a van or truck with a driver at a price fixed when you submit.',
        'Follow the move live, with a Start PIN at pickup and a Delivery PIN at the destination.',
        'Self-drive rental with a signed contract, handover photos and fair deposit claims.',
        'Owners, drivers, a cashier and administrators run the business in their own workspaces.',
    ]],
    ['Who uses it', [
        'Customer: books, pays 50/50, tracks, reviews, rents vehicles.',
        'Driver: accepts jobs, follows the route, verifies cargo, remits weekly.',
        'Vehicle owner: fleet map, earnings, drivers, rentals.',
        'Cashier: income, payment checks, remittances, owner payouts, flags.',
        'Administrator: approvals, users, incidents, settings, audit log.',
    ]],
    ['Rules the server enforces', [
        'Price = base + road km + movers + 5% service fee, fixed at submission.',
        'A vehicle is never double-booked between hauling and rentals.',
        'Departure needs the Start PIN, plate check and cargo checklist.',
        'Each trip is split between ZamMove, the driver and the owner.',
        'Rentals need a signed contract and full payment before release.',
    ]],
    ['Technology', [
        'Single-page web app in plain JavaScript, styled with Tailwind CSS.',
        'Node.js + Express REST API; data in Supabase (PostgreSQL) or a file.',
        'Leaflet + OpenStreetMap maps, OSRM road routing, Nominatim address search.',
        'Automated tests: 49 server tests plus browser tests of every flow.',
    ]],
]


def tours(meta):
    ids = [m['id'] for m in meta]
    pick = lambda f: [m['id'] for m in meta if f(m)]
    sec = lambda *ls: (lambda m: m.get('section') in ls)
    order = lambda wanted: [i for i in wanted if i in ids] + []
    owner_first = order(['G01-owner-dashboard', 'G06-owner-fleet-map', 'G07-owner-earnings', 'G02-owner-vehicles', 'G03-owner-register', 'G04-owner-drivers', 'G05-owner-trip-history'])
    owner = owner_first + [i for i in pick(sec('G')) if i not in owner_first]
    driver = pick(lambda m: m.get('section') == 'F' and m['id'].startswith('F01')) + pick(lambda m: m.get('section') == 'C' and m.get('role') == 'Driver') + pick(lambda m: m.get('section') == 'F' and not m['id'].startswith('F01'))
    admin = order(['I01-admin-overview', 'I13-admin-users'])
    admin += [i for i in pick(sec('I')) if i not in admin]
    return [
        {'id': 'all', 'title': 'Full walkthrough', 'role': 'Public', 'desc': 'Every screen in order.', 'ids': ids},
        {'id': 'account', 'title': 'Sign up and verify', 'role': 'Customer', 'desc': 'Create an account, confirm it with a code, log in, recover a password. Booking is blocked until the account is verified.', 'ids': pick(sec('A'))},
        {'id': 'move', 'title': 'One move, start to finish', 'role': 'Customer', 'desc': 'Book a haul, then follow the customer and the driver side by side: payment, Start PIN, live map, Delivery PIN, review.', 'ids': pick(sec('B', 'C'))},
        {'id': 'rental', 'title': 'Self-drive rental', 'role': 'Customer', 'desc': 'Choose a unit, sign the contract, pay in full, handover photos, owner’s map, return, deposit claim and refund.', 'ids': pick(sec('D'))},
        {'id': 'customer', 'title': 'Customer account', 'role': 'Customer', 'desc': 'Home, driver profile, incident reports, payments, notifications and profile.', 'ids': pick(sec('E'))},
        {'id': 'driver', 'title': 'Driver', 'role': 'Driver', 'desc': 'Dashboard, accepting a job, the route to the pickup, verification, delivery and earnings.', 'ids': driver},
        {'id': 'owner', 'title': 'Vehicle owner', 'role': 'Vehicle owner', 'desc': 'Live fleet map, earnings and payouts, vehicles, drivers and agreements, trip history.', 'ids': owner},
        {'id': 'cashier', 'title': 'Cashier', 'role': 'Cashier', 'desc': 'Monthly income, remittances, payment checks, the ledger, settlements and flags.', 'ids': pick(sec('H'))},
        {'id': 'admin', 'title': 'Administrator', 'role': 'Administrator', 'desc': 'KPI overview, users and suspensions, bookings, live map, approvals, incidents, settings and audit log.', 'ids': admin},
        {'id': 'phone', 'title': 'On a phone', 'role': 'Phone', 'desc': 'The same system in the phone’s browser; nothing to install.', 'ids': pick(sec('M'))},
    ]


def short(title):
    t = re.sub(r'^(Rental step|Step) \d+ · ', '', title)
    return t if len(t) <= 48 else t[:47] + '…'


def main():
    meta = json.load(open(os.path.join(SRC, 'meta.json'), encoding='utf8'))
    out = os.path.join(HERE, 'screens')
    # replace the files, not the folder: OneDrive and Explorer can lock the folder itself
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        try:
            os.remove(os.path.join(out, old))
        except OSError:
            pass
    screens = []
    for m in meta:
        src = os.path.join(SRC, m['file'])
        name = m['id'] + os.path.splitext(src)[1]
        shutil.copyfile(src, os.path.join(out, name))
        screens.append({
            'id': m['id'], 'title': m['title'], 'short': short(m['title']), 'role': m.get('role', 'Public'),
            'section': m.get('section', ''), 'sectionTitle': SECTIONS.get(m.get('section', ''), ''),
            'purpose': m.get('purpose', ''), 'example': m.get('example', ''),
            'next': m.get('next', []), 'img': 'screens/' + name, 'w': m['w'], 'h': m['h'], 'device': m.get('device', 'desktop'),
            'callouts': [{k: (round(c[k], 1) if isinstance(c[k], float) else c[k]) for k in ('x', 'y', 'w', 'h', 'title', 'text')} for c in m.get('callouts', [])],
        })
    data = {'generated': date.today().strftime('%B %d, %Y'), 'tagline': TAGLINE, 'about': ABOUT, 'screens': screens, 'tours': tours(meta)}
    with open(os.path.join(HERE, 'data.js'), 'w', encoding='utf8') as f:
        f.write('/* generated by build_prototype.py; do not edit by hand */\nwindow.ZM = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    size = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out))
    print(f'{len(screens)} screens, {len(data["tours"])} tours, {size / 1e6:.1f} MB of images')


if __name__ == '__main__':
    main()
