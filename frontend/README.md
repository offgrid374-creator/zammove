# ZamMove frontend — developer guide

Plain HTML, CSS and JavaScript (no build step, no framework). The browser shows screens and calls the
backend; **all business rules and all data live on the server** (`../backend`).

```
frontend/
├── shared/api.js          ZAPI: the only code that talks to the backend
├── customer/              customer app + driver, owner, cashier and admin-console workspaces
│   ├── index.html         loads the files below in order
│   ├── css/app.css
│   ├── css/auth.css       Auth screens design (Figma A01–A12), loaded after tailwind.css
│   ├── css/trips.css      Booking and trip screens design (Figma B01, C01–C24)
│   ├── css/driver.css     Driver Active trip design (Figma C02–C22 driver side)
│   ├── css/home.css       Home, payments, settings mode, header badge, app-wide button and status restyle
│   ├── js/01-core.js … 18-auth.js
│   └── vendor/qrcode.min.js   third-party (MIT), not edited or formatted
└── admin/                 separate staff Admin Panel (index.html, admin.css, admin.js)
```

## Load order and what each file does

The customer app's scripts are classic `<script>` files that share one global scope, loaded in this order:

| #   | File                   | Responsibility                                                                                       |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| –   | `shared/api.js`        | `ZAPI.act(name, payload)`, `ZAPI.auth(op, payload)`, `ZAPI.refresh()`; keeps the login token per tab |
| 1   | `01-core.js`           | Globals (`S`, `HV`, `RV`, `FLOW`, `ZPAY`, `render`, `msg`, `view`, `sel`) and the original screens   |
| 2   | `02-upgrade.js`        | Customer actions as server calls; booking map, payments, rentals, driver & vehicle card              |
| 3   | `03-public.js`         | Logged-out pages: landing, log in, sign up, password reset                                           |
| 4   | `04-app-v2.js`         | Logged-in layout: tiles, schematic map with live estimate                                            |
| 5   | `05-landing.js`        | Landing search card (Book / Rent / Track), line drawings, public tracking                            |
| 6   | `06-ui-layer.js`       | Vehicle illustrations, profile, notifications, header                                                |
| 7   | `07-home.js`           | Single Home page (landing + "Your trips")                                                            |
| –   | `vendor/qrcode.min.js` | QR codes for the Start PIN                                                                           |
| 8   | `08-verification.js`   | Start PIN / QR, plate, cargo checklist, Delivery PIN panels                                          |
| 9   | `09-workspaces.js`     | Driver, vehicle owner, cashier, admin console, staff, owner setup, polling                           |
| 18  | `18-auth.js`           | Auth redesign (Figma A01–A12): sign up, field errors, verify modal, login lockout countdown          |
| 19  | `19-trips.js`          | Booking redesign (Figma B01, C01–C24): My bookings cards, track page layout, Book a haul sections     |
| 20  | `20-driver-trip.js`    | Driver Active trip redesign (Figma C02–C22, C08c, C12c, C18, C18c): next-step banner, no-show timer  |
| 21  | `21-home.js`           | Home, offline bar, Payments tab, Settings mode, header mode badge (Figma E00–E07)                    |
| 22  | `22-roles.js`          | Driver, car owner, cashier workspaces (Figma F01–H04): bold plates, references and amounts           |

### How the layers work

Each later file **wraps** functions defined earlier instead of editing them, for example:

```js
const _track = track;
track = function () {
  const html = _track(); // the earlier version
  return html.replace(/* … */); // adds or changes part of its markup
};
```

So a screen's final output is built by several files. Because some wrappers find markup by its exact
text, **do not reflow or rename HTML inside template strings** unless you also update every
`.replace(…)` that targets it (search the folder for the snippet first).

## Data flow

1. `ZAPI.auth('login', …)` → the server returns a token (kept in `sessionStorage`, per tab) and the
   user's view.
2. Every response that carries a view calls `ZAPI.onState`, which replaces `S` (see `01-core.js`).
3. Screens only **read** `S`. To change anything, call an action and re-render:

```js
const r = await ZAPI.act('cancelBooking', { id });
if (!r.ok) toast(r.err);
render();
```

Actions are defined in `backend/src/domain/*.js`; their names match the first argument of `ZAPI.act`.
The server decides who is acting from the token — never from data sent by the browser.

## Adding a feature

1. Add or change the rule in `backend/src/domain/…` and a test in `backend/test/` (`npm test`).
2. If the browser needs new data, add it to `backend/src/views.js` for the right roles only.
3. In the frontend, read it from `S` and call the action with `ZAPI.act`. Put customer screens in
   `02-upgrade.js` and workspace screens in `09-workspaces.js`.
4. Escape every user-supplied value inserted into HTML with `esc(…)`.

## Code style

Formatting is automatic with Prettier (settings in `../.prettierrc.json`):

```bash
cd ..            # project root (Zamove/)
npm install      # once
npm run format   # reformat everything
npm run format:check
```

In VS Code, install the **Prettier** and **EditorConfig** extensions; files are formatted on save.
