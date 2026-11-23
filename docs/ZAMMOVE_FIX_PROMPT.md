# ZamMove – Fix Plan for Claude Code

Paste the **Kickoff prompt** below into Claude Code in VS Code. Keep this whole file in your project folder (for example `docs/ZAMMOVE_FIX_PROMPT.md`) so Claude can read the full plan.

Work one phase at a time. After each phase, test in the browser, commit, then send the next phase prompt.

---

## Kickoff prompt (paste this first)

```
You are a senior full-stack engineer fixing the ZamMove hauling system.
Read @docs/ZAMMOVE_FIX_PROMPT.md completely before doing anything.

Files:
- ZamMove_Customer_SelfDrive_Rental_v11.html  (customer, driver, owner, cashier, in-app admin)
- ZamMove_Admin_Panel.html                    (separate staff panel, same localStorage key "hg")

Rules for this whole job:
1. Do NOT rewrite the app from scratch and do NOT change the visual design. Make targeted fixes.
2. Before editing, make a backup copy of both files (append _backup_before_fixes).
3. Work ONLY on the phase I name. At the start of a phase, show me a short plan
   (which functions you will change and why), then implement it.
4. Keep all business rules in ONE place. If the same rule exists in both files,
   make both call the same logic (or make them identical and say so).
5. Escape every user-supplied value with esc() when inserting into HTML.
6. After each phase, give me: (a) list of changes by function name,
   (b) a step-by-step manual test I can run in the browser, (c) anything you
   could not fix and why.
7. If something in the plan conflicts with the code, stop and ask me.

Start with Phase 1.
```

---

## Background: how the code is built (for Claude)

- All data lives in one object `S`, saved to `localStorage['hg']`. Both HTML files read and write it.
- The customer app is made of about 9 `<script>` layers. Each later layer wraps earlier functions (`render`, `book`, `track`, `bcard`, `home`, …) and often patches HTML with `.replace()` / regex. When you change markup, check every later layer that regex-matches it.
- Main APIs:
  - `ZMVER.api` – pre-departure verification (PIN/QR, plate, checklist, authorize) in the IIFE starting `/* ===== Pre-Departure Verification`.
  - `ZW.api` (`API` inside the last IIFE) – roles, applications, vehicles (`S.vh`), assignments (`S.asg`), `accept`, `step`, `pay`, `remit`, `verify`, `resolve`, `case`, `cfg`.
- Status list `FLOW` is in the first script. Driver transitions are in `API.step`.
- Only serve both files from the same origin (for example `python -m http.server`), never `file://`.

---

## Phase 1 – Unblock the trip lifecycle (CRITICAL)

**Problem C1-A:** A real driver can never reach the verification screen. At *Items Loaded*, `stepUI()` in the driver workspace only shows text. The verification `panel()` is rendered only inside the customer `track()` page, and that page filters bookings to `b.cu == S.me.em`.

**Problem C1-B:** Verification uses `S.veh[plate]` (seeded only with sample plates from `DRV`). Real vehicles are in `S.vh`. `vehOk()`, `API.plate`, `API.vehicle` and `recH()` fail for every real booking.

**Problem C2:** `actor()` builds the driver id from the booking (`DID(drvOf(b))`), so `asD()` always passes. The "Demo: act as Customer / Driver / Admin" role switch lets anyone perform any role. `mk()` sets `cust: S.me.em` (whoever opens first) instead of the booking's customer.

**Do:**
1. Make `vehOk(b)` use the real fleet when `b.drvUser` is set: the vehicle `S.vh.find(v=>v.id==b.veh)` must have `approval=='Approved'`, status not `Maintenance`, and no other booking with the same `veh` in `In Transit` / `Arrived at Destination`. Keep the old `S.veh` path only for legacy sample bookings (no `drvUser`).
2. `plateOf(b)` → for real bookings return the plate of `S.vh` record `b.veh`. Update `API.plate`, `API.vehicle` (admin toggle should change `S.vh` approval or be removed) and `recH()` to use the same source.
3. Identity from the session only:
   - customer actor = `{role:'customer', id:S.me.em}` and is valid only if `S.me.em == b.cu`.
   - driver actor = `{role:'driver', id:'DRV-'+S.me.em}` and is valid only if `S.me.em == b.drvUser`.
   - admin actor valid only if the logged-in user has `adm` in `['super','admin']`.
   - In `mk(b)`, set `cust: b.cu` (fall back to `S.me.em` only for legacy bookings without `cu`).
4. Remove the role-switch buttons (`roles()` / `vz-role`) from the panel. Instead, the panel shows the customer view when `S.me.em == b.cu`, the driver view when `S.me.em == b.drvUser`, and the admin view in the admin console.
5. Add the driver verification view to the driver workspace: in `dTrip()` (Active trip), when `b.st=='Items Loaded'`, render the driver part of the verification panel (PIN/QR entry, plate, cargo checklist, driver confirmation, authorize button) for that booking. Reuse the existing `panel()` code. It must work even though the customer-workspace `S.bk` filter is not active there.
6. Customer side keeps: show Start PIN + QR, see the checklist, confirm cargo, report a discrepancy.
7. `ZMVER.api.sim()` (demo flow) must still work.

**Acceptance test:**
- Seed: driver approved, owner vehicle approved, active assignment, driver Available. Customer creates a booking for that vehicle type.
- Driver accepts → heads to pickup → arrives → records down payment → loads cargo (*Items Loaded*).
- Customer (logged in, Track page) sees a PIN. Driver (logged in, Active trip) enters the PIN, enters plate, saves the checklist, confirms. Customer confirms. Driver authorizes → booking becomes **In Transit**.
- A customer must NOT be able to do any driver step for their own booking.

---

## Phase 2 – One payment model

**Problem C3:** The customer `payform()` / `pay` handler records payments without `by`. The driver `API.pay` records payments with `by`. Results:
- the driver's real GCash ref is rejected with "That GCash reference was already used" if the customer entered it first;
- the customer sees double (e.g. ₱2,100 of ₱1,050);
- customer and rental payments never appear in the ledger, settlements or cashier queue (those filter `p.by`).

**Do:**
1. Define one payment record: `{id, bid, kind:'down'|'final'|'rental'|'deposit'|'cancel_fee', method, amount, ref, payer, collectedBy, status:'Submitted'|'Recorded by driver'|'Verified'|'Rejected', t, pf}`.
2. Customer side: replace "Record payment" with **"Submit GCash proof"** (reference + optional photo). This creates a `Submitted` record linked to the booking. It does not count as paid. Cash is not recorded by the customer.
3. Driver `API.pay`: if a customer-submitted GCash record with the same ref exists for the same booking and kind, **link/confirm it** instead of rejecting it. Reject a reference only when it is used on a different booking or kind.
4. Paid amounts everywhere (`bcard`, `track` fare box, home "Paid so far", settings "Amount recorded") count each payment once and only count `Recorded by driver` or `Verified`.
5. Rental payments (`rnpay`) use the same record with `kind:'rental'`/`'deposit'` and appear in the ledger. A rental deposit counts as paid only when `Verified` by a cashier/admin.
6. Make the ledger (`cLed`, Admin Panel `P.pay`, CSV) include all payment kinds with a status column.
7. Fix the timing text so the FAQ, home copy and driver flow agree: **50% down payment collected when the driver arrives at pickup, 50% after delivery.**

**Acceptance test:** customer submits GCash ref 1234567890 → driver confirms the same ref → only ₱1,050 counted, ledger shows one row, no error.

---

## Phase 3 – Status machine and proof of delivery

**Problem H1:** `FLOW` = Pending → Accepted → Awaiting Down Payment → Down Payment Confirmed → Preparing for Pickup → On the Way to Pickup → …, but `API.step` goes Accepted → On the Way to Pickup → Awaiting Down Payment → Down Payment Confirmed → Items Loaded. The customer progress bar goes backwards, and the Track timeline is out of order.

**Problem H2:** The driver sets *Delivery Confirmation* alone. The customer never confirms, and there is no proof of delivery.

**Do:**
1. Make one ordered list used by everyone:
   `Pending → Accepted → On the Way to Pickup → Awaiting Down Payment → Down Payment Confirmed → Items Loaded → In Transit → Arrived at Destination → Delivery Confirmation → Awaiting Final Payment → Completed` (+ `Cancelled`, `Rejected`).
   Remove "Preparing for Pickup" or put it in both places. Update `FLOW`, `TRK`, `ST`/`RNG` (track map positions), the `steps` array in `track()`, the meter in `tripsH()`/home, the status filter and `API.step`.
2. Drop-off OTP (mirror of the Start PIN): at *Arrived at Destination* the customer sees a 6-digit Delivery PIN. The driver must enter it plus a delivery note (and optional photo) to move to *Delivery Confirmation*. Reuse the hashing, expiry and attempt-limit logic from `ZMVER`.
3. If the customer is unavailable, an admin can waive it with a written reason (audit logged).
4. Customer gets "Report a problem with delivery" at *Delivery Confirmation*, which opens an incident linked to the booking.

---

## Phase 4 – Data isolation, session and safety

**Problems:** C4, C5, H3.
- `S.me` and `S.ws` are stored inside the shared `hg` blob. A login in another tab switches identity in every tab (the `storage` listener copies `me`).
- "Reset demo data" in customer Profile wipes everyone's bookings and payments.
- Only `S.bk` is filtered per user. Rentals (`S.rn`), payments (`S.pay`), incidents (`S.inc`), reviews (`S.rev`) and notifications (`S.nt`) are shown to every user.

**Do:**
1. Move `me` and `ws`/`wp` to `sessionStorage` (key e.g. `zm_session`). Never save them in `hg`. In the `storage` listeners (both files), never overwrite the session; also, do not re-render while the user is typing (only refresh if no input/textarea/select has focus, otherwise show a small "Data updated – refresh" chip).
2. Add owner fields: `S.rn[].cu`, `S.inc[].by`, `S.rev[].by`, `S.nt[].to`. Filter every customer view by the logged-in email (`rent`, `pays`, `reports`, `settings` activity/reviews, notifications, home tiles).
3. Notifications: `ntf(to, h, b)`. Notify the right person: driver on new eligible request, customer on accept/status/payment, staff on high-severity incident.
4. Remove "Reset demo data" from customer settings. Optionally add it to the owner-admin Settings only, with a typed confirmation.
5. Remove customer demo buttons: rental "Demo: staff advance ▸ next" (`rnadv`) and incident "Demo: admin advances status" (`incadv`).
6. `#owner-setup`: allow it only when no super admin exists (already done) **and** show a warning that this is a prototype-only bootstrap.

---

## Phase 5 – Capacity, dispatch and cancellation

**Problems:** C6, H10, H11.
- The overlap check in `submitbk` compares `b.vid` (vehicle **type**). The company can take only one booking per type per time slot, whatever the fleet size.
- A driver with any active booking (even next week's) cannot accept another.
- No timeout for Pending bookings and no admin reassignment.
- The 10% cancellation fee (`b.cf`) is never charged; the driver isn't notified.

**Do:**
1. At submit, allow the booking if at least one approved, operational vehicle of that type (with an active assignment) has no overlapping booking (`t0`/`dur`). Show "No vehicle of this type is free at that time" otherwise. Specific vehicle binding stays at accept time.
2. In `chk()`/`tripOf`, block only overlapping bookings and bookings already *In Transit*; allow accepting future non-overlapping bookings.
3. Pending timeout: if no driver accepts within N minutes (setting, default 30), mark it "No driver found" and let the customer re-submit or cancel; admins see it in a queue and can assign a driver manually (`API.adminAssign`, which runs the same `chk()` rules).
4. Cancellation: create a `cancel_fee` payment record (status `Submitted`), notify the assigned driver, free the driver/vehicle, add audit log. Show the fee on the booking card and in the ledger.

---

## Phase 6 – Admin and cashier gaps (both files)

**Do:**
1. **Incidents (H5, H6):** show the description `c.d` (and photo `c.ph`, reporter, time `c.w` labelled as "When") in `aInc()` and Admin Panel `P.inc`. Unify the customer-visible incident statuses with the admin case states (`Submitted → Under review → Evidence requested / Statement recorded → Decision recorded → Closed`).
2. **Rentals module (H4):** new admin page in both consoles: list, approve/reject with reason, verify deposit, mark Released (Active), record return inspection (fuel, mileage, damage notes, photos), compute balance, mark Completed and refund deposit. Customer can only cancel while Pending/Approved.
3. **Booking actions (H12):** admin can cancel (with reason), reassign driver, and force a status only along the allowed path, with every action audit-logged.
4. **Users:** list users, suspend/reactivate (`u.status='suspended'`), view roles. Suspended drivers become "Temporarily Suspended" and can't accept.
5. **Pricing and discounts:** move `HV`, `RV`, `DEP`, mover fee (₱500), service fee (5%) and `DC` discount codes into `S.cfg` with admin edit pages (validation, audit). The customer app reads from `S.cfg` with the current values as defaults.
6. **Cashier (H8, H13):** in-app `API.verify` must reject a blank amount (same as the Admin Panel). Make `resolve` identical in both files (adjustment amount + shortfall rule), with centavo rounding everywhere (`Math.round(x*100)/100`).
7. **Time zone (H9):** add one helper `fmtPH(t)` using `toLocaleString('en-PH',{timeZone:'Asia/Manila'})` and `datePH(t)` for YYYY-MM-DD in Manila time. Use them for all displayed timestamps, the ledger/CSV date column, and the `min` of date inputs (replace `new Date().toISOString().slice(0,10)`).
8. **Ratings (H7):** `rt(d)` must match by driver email (`b.drvUser == d.em`) or sample index, not object identity. Show the driver their average rating on the driver dashboard.
9. In-app `API.adm` approve: guard against a missing role record (return an error instead of throwing).

---

## Phase 7 – Missing hauling features (do after Phases 1–6 pass)

Do each as a separate, small task:
1. **Load fit:** optional weight (kg) and largest-item size at booking; warn and suggest a larger vehicle if over `cap`.
2. **Multi-stop:** up to 3 extra drop-offs, each with distance added, shown on the driver trip screen in order.
3. **Price extras:** waiting time per 30 min after a free 30 min, stairs/floors fee, night surcharge. All from `S.cfg`.
4. **Driver rates customer** after completion.
5. **Document expiry watch:** license and OR/CR expiry dates; a driver or vehicle with an expired document is blocked from accepting, and admins see an "Expiring in 30 days" list.
6. **Customer contact after accept:** show customer name and phone on the driver Active trip page (only after accept).
7. **Shared UI states:** one helper for empty / loading / error / access-denied cards used on every page.
8. **Reports:** admin page with bookings per day, revenue (verified payments), cancellations, utilization per vehicle, demand by barangay. CSV export for each.

---

## Phase 8 – Final regression test

Write a Playwright script (`tests/e2e.spec.js` or Python) that serves both files on one origin and checks:
1. Signup → verify → booking created.
2. Second customer can book the same type at the same time when two vehicles exist.
3. Full lifecycle Pending → Completed by the real driver account, with Start PIN and Delivery PIN.
4. GCash ref submitted by customer then confirmed by driver: counted once.
5. Cashier verifies remittance; blank amount rejected.
6. Customer A cannot see Customer B's rentals, payments, incidents or notifications.
7. Logging in on tab 2 does not change the user on tab 1.
8. Admin Panel incident page shows the description.
9. No console errors on any page.

Report pass/fail for each.

---

## Out of scope for now (note only, don't build)

Real backend/database, server-side auth (bcrypt/Argon2, sessions), real SMS/email OTP, Google Maps/routing and live GPS, GCash/PayMongo gateway, official receipts. Keep the existing "Prototype" banner and labels honest about these.
