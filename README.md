# ZamMove

Hauling (truck + driver) and self-drive rental system for Zamboanga City.

```
Zamove/
├── frontend/                 Browser code (HTML, CSS, JavaScript). No business rules, no stored data.
│   ├── customer/             Customer app + driver, vehicle owner, cashier and admin workspaces
│   │   ├── index.html
│   │   ├── css/app.css
│   │   ├── js/01-core.js … 09-workspaces.js   (screens, in load order)
│   │   └── vendor/qrcode.min.js
│   ├── admin/                Separate staff Admin Panel (index.html, admin.css, admin.js)
│   └── shared/api.js         The only way the browser reads or changes data (calls the backend)
├── backend/                  Node.js (JavaScript) API server + Supabase Postgres
│   ├── server.js             Entry point: loads data, serves /api and the frontend
│   ├── src/
│   │   ├── app.js            HTTP routes (auth, actions, state, public tracking)
│   │   ├── config.js         Settings from backend/.env
│   │   ├── state.js          In-memory state, one-at-a-time writes, diff + rollback
│   │   ├── views.js          What each role is allowed to see
│   │   ├── util.js           IDs, scrypt passwords, signed tokens, money rounding
│   │   ├── store/index.js    Storage: Supabase | local JSON file | memory
│   │   └── domain/           ALL business rules
│   │       ├── constants.js  Prices, status order, places, cargo parsing
│   │       ├── helpers.js    Roles, driver eligibility, capacity, payments, notifications, timeout
│   │       ├── auth.js       Signup, login lockout, password reset, owner setup, profile
│   │       ├── bookings.js   Pricing, capacity, cancel, re-submit, GCash proof, accept, trip steps, collection
│   │       ├── verification.js  Start PIN/QR, plate, cargo checklist, confirmations, Delivery PIN
│   │       ├── rentals.js    Rentals, rental payments, incidents
│   │       ├── workspace.js  Role applications, vehicles, driver assignments
│   │       └── finance.js    Payment verification, remittances, settings, staff, reset
│   ├── sql/schema.sql        Run once in Supabase (tables, indexes, Row Level Security)
│   ├── test/                 node:test rule tests + e2e/e2e.mjs browser test
│   └── .env.example
├── docs/ZAMMOVE_FIX_PROMPT.md
└── legacy/                   The old single-file prototype (kept for reference only)
```

## Run it locally (no Supabase needed)

```bash
cd backend
npm install
cp .env.example .env          # then set TOKEN_SECRET (command is in the file)
npm start
```

Open http://localhost:3000/customer/ (Admin Panel: http://localhost:3000/admin/).
Without Supabase settings, data is saved to `backend/.data/zammove.json`.

First run: open http://localhost:3000/customer/#owner-setup to create the owner admin
(set `OWNER_SETUP_CODE` in `.env` first if anyone else can reach the server).

## Switch to Supabase Postgres

1. Create a project at supabase.com.
2. Dashboard → **SQL Editor** → New query → paste `backend/sql/schema.sql` → **Run**.
3. Dashboard → **Project Settings → API**: copy the Project URL and the **service_role** key.
4. In `backend/.env` set `SUPABASE_URL=...` and `SUPABASE_SERVICE_ROLE_KEY=...` and restart.
   The server log shows `store=supabase`.

The service-role key must stay in `backend/.env` (never in frontend code). Row Level Security is on with
no policies, so the public/anon key can read or write nothing; only this backend can.

Run **one** backend process per database: the server keeps the data in memory and writes changes through
to Postgres one action at a time.

## How it works

- The browser logs in (`/api/auth/login`) and gets a signed token kept per tab in `sessionStorage`.
- Every change is `POST /api/act/<action>`. The server identifies the user from the token, never from
  anything the browser sends, applies the rule, saves only the rows that changed, and returns that user's
  role-scoped view of the data.
- Passwords are hashed with scrypt; PIN and QR secrets are hashed; neither ever leaves the server.
- Unaccepted bookings become "No driver found" through a server timer.

## Tests

```bash
cd backend
npm test                      # business rules, data isolation, storage, HTTP auth
```

Browser end-to-end test (needs Chrome and `npm i -D playwright-core`):

```bash
STORE=memory ALLOW_TEST_SEED=1 TOKEN_SECRET=e2e PORT=3100 node server.js
node test/e2e/e2e.mjs         # set CHROME=/path/to/chrome if it is not in the default place
node test/e2e/gps.mjs         # live GPS (simulated driver phone)
```

## For developers

- Frontend structure, load order and how to add a feature: [frontend/README.md](frontend/README.md)
- Business rules: `backend/src/domain/` (one file per area), tested in `backend/test/`
- Formatting is automatic: run `npm install` once in this folder, then `npm run format`
  (VS Code formats on save with the Prettier extension; settings in `.prettierrc.json` and `.editorconfig`)

## Live GPS tracking

- The driver taps **Share live location** on the Active trip page; the phone's GPS (browser Geolocation API)
  sends a position about every 10 seconds, only while the trip is active.
- The customer's Track page shows a live OpenStreetMap map (Leaflet): pickup, drop-off, the driver, the recent
  trail and a rough arrival time. Admins have a **Live map** page with every active trip.
- Customers only see the position of their own trip, and only while it is active.
- **Phones need HTTPS.** Browsers only share location on `https://` or `http://localhost`. To test on a real
  phone, put the server behind HTTPS (hosting, or a tunnel such as Cloudflare Tunnel or ngrok).
- The map loads Leaflet from cdnjs and map tiles from openstreetmap.org, so it needs an internet connection.
  Distances and arrival times are straight-line estimates (no road routing yet).

## Not connected yet

SMS/email (verification and reset codes are shown on screen), the GCash gateway, and road routing for exact
distances and arrival times. Payments are recorded and confirmed by drivers/cashiers, not by a payment provider.
