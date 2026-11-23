# ZamMove front-end demo (no server)

The real ZamMove frontend, with the real business rules running **inside the browser**. You don't need Node, a database or an internet server. Every rule is the system's own code bundled for the browser: prices, the 50% down payment, Start/Delivery PINs, the cargo checklist, the money split, rentals and approvals.

## Open it

1. Double-click **`demo/index.html`**. Chrome or Edge works best.
2. Click the dark **Demo** button at the bottom left.
3. Pick a person to log in as. Every account uses the password **`Demo1234`**.

Maps, address search and road routes need internet. Everything else works offline.

## Demo panel

| Tab | What it does |
|---|---|
| **Accounts** | One click logs in as an example user. The users cover each role: customers Carla, Bea and Jun, drivers Leo, Dina and Ramon, owner Olga, cashier Kim and admin Ada. It can also sign you up as a new customer or log you out. |
| **Demo script** | The suggested order for showing the system. |
| **Data** | Resets the example data, with dates moved to today. |

## Showing the full flow (two windows)

Open `index.html` in **two browser windows** side by side, with the customer on the left and the driver on the right. Each window logs in on its own and sees the other's changes within a few seconds.

1. **Customer books.** Log in as **Jun** and go to Book. Search two places (for example *Tetuan* → *Pasonanca*), then choose the **L300 Van**, a date and the items, and submit. Choose the L300 because all the example drivers drive L300s. With another vehicle type you'll see "No vehicle of this type is free".
2. **Driver accepts.** In the other window, log in as **Leo**, open the Driver workspace → Requests, and accept the booking.
3. **Pickup.** Leo starts heading to the pickup and arrives. Leo records the 50% down payment and loads the cargo.
4. **Start PIN.** Jun opens Track and shows the Start PIN. Leo enters it, checks the plate and fills in the cargo checklist. Jun confirms, then Leo authorizes departure.
5. **Delivery.** Leo arrives. Jun shows the Delivery PIN, Leo confirms the delivery and the final payment, and Jun rates the driver.
6. **Money.** Log in as **Olga** (Earnings and Fleet map), **Kim** (Income, Settlements, pay the owner) and **Ada** (Overview, Users).
7. **Rental (optional).** As **Carla**, rent a unit. As **Olga**, approve the rental. Both then sign the contract.

## Good to know

- **Data stays in this browser.** It's saved with IndexedDB, so you can close and reopen the demo. Another browser or computer starts from the example data.
- **Reset.** Before a presentation, open Demo → Data → Reset demo data. This restores the example data with fresh dates and logs everyone out.
- **Not real.** SMS, email and GCash aren't connected, just as in the real prototype. Passwords use a simple browser hash instead of the server's scrypt, so this demo is only for demonstration.
- **Timeouts.** A booking waits up to 24 hours for a driver here. The real system waits 30 minutes.

## Rebuild after changing the system

From the `Zamove` folder:

```
npm run demo
```

This bundles `backend/src` (domain rules, views, geo) into `engine.js` and copies `frontend/customer` into `app/`. It also writes a new `index.html`. Edit only the files in `demo/src/` and `demo/seed.js`; everything else in this folder is generated.

| File | Role |
|---|---|
| `src/server.js` | Answers the same requests as the real server (`/state`, `/auth`, `/act`, `/geo`) inside the browser |
| `src/util-browser.js` | Browser version of `backend/src/util.js` (random IDs, password hash, session token) |
| `src/demo-api.js` | Replaces `frontend/shared/api.js`: sends requests to the in-browser engine and picks map tiles that work from a file page |
| `src/demo-panel.js` | The Demo button and panel |
| `seed.js` | The example people, vehicles, bookings and rentals |
