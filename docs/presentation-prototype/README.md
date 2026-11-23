# ZamMove – interactive prototype

A clickable walkthrough of the whole system for presenting to the panel. Every screen is a real capture of the
running ZamMove system with fictional example data.

## Open it

Double-click **`index.html`**. It runs in any browser, offline (no server and no internet needed). With internet,
the app's fonts load; without it, system fonts are used.

To share it, send the whole folder (zip it). Keep `index.html`, `app.js`, `styles.css`, `data.js` and `screens/`
together.

## Present it

1. The home page has **guided tours** (customer sign-up, one move from start to finish, self-drive rental, driver,
   vehicle owner, cashier, administrator, phone) and a **full walkthrough** of every screen. It also has a one-minute
   **"About the system"** summary: the problem, what ZamMove does, the roles, the rules and the technology.
2. Each screen shows **numbered orange markers**. Click a marker (or press **1–9**) to explain that part. The panel
   on the right says what the screen is for, the example data shown, and the points to make.
3. **Go to** buttons follow the real flow (e.g. "Accept booking → C03"). **Next** follows the tour.
4. Press **P** for **presenter mode**: the screen fills the window and a notes bar shows what to say.

| Key | Does |
| --- | --- |
| ← → (or Space) | Previous / next screen |
| 1–9 | Open a marker's explanation |
| H | Hide or show the markers |
| P | Presenter mode |
| O | Overview of all screens in the tour |
| Esc | Close / back to the home page |

Every screen has its own link (e.g. `index.html#/tour/move/C11-start-pin`) so you can bookmark where to start.

### Suggested 15-minute order

1. Home → "About the system" (1 min)
2. **One move, start to finish** (6 min): pause on the booking map (B01), Start PIN (C11–C16) and Delivery PIN (C19–C20)
3. **Self-drive rental** (3 min): the contract (D07), handover photos (D12–D14), deposit claim (D17–D20)
4. **Vehicle owner**: Fleet map and Earnings (2 min)
5. **Cashier**: Income and Settlements & flags; **Administrator**: Overview and Users (3 min)

## Rebuild after the system changes

The screens come from the same capture as the Figma files. After a new capture:

```bash
python build_prototype.py <capture-folder>
```

The capture folder must contain `meta.json` and `screens/`.
