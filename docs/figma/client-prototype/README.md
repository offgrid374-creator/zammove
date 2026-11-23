# ZamMove – client prototype for Figma

99 Figma frames that walk a client through the whole system, captured from the working app with realistic example data
(names, plates and phone numbers are fictional). **Every screen is captured from top to bottom, full length.**

| Frames      | What they show                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00a`–`00c` | Cover, **How ZamMove works** (hauling and rental journeys), and a **screen index** grouped by section                                                                                                                                                                                                                                                                                                                                                                                                       |
| `A01`–`A12` | **Account:** landing page → sign-up (empty and filled) → **6-digit verification code** (stands in for the SMS) → **before verification, booking is blocked** → code entered → **after verification, ready to book** → log in → wrong password → locked after 5 tries → forgot password (step 1 and 2)                                                                                                                                                                                                       |
| `B01`       | **Booking a haul**, fully filled in with the fare estimate and a discount code                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `C01`–`C25` | **The move, step by step**, alternating **customer** and **driver** screens: waiting for a driver (before) → driver accepts → driver assigned (after) → on the way (live map, Waze) → 50% down payment (GCash proof) → driver confirms payment → loading → **Start PIN** → driver enters PIN → plate check → cargo checklist → customer confirms cargo → **authorize departure** → in transit → **Delivery PIN** → driver confirms delivery → final 50% → **completed and rated** (after) → driver earnings |
| `D01`–`D21` | **Self-drive rental, step by step** (renter, owner, administrator): dates and model → request → owner sets rate and **deposit per vehicle** → approve → **rental contract** → renter signs → owner signs (or records a signed paper copy) → **full payment** → release with odometer, fuel and **6 photos** → renter checks the record (before) → confirmed and **sharing location** (after) → **owner’s rental map** → return with 6 photos → owner **claims part of the deposit** → renter disputes → **administrator decides** → completed and refunded → the finished contract |
| `E01`–`E06` | Customer account: home, driver profile, incident report, payments, notifications, profile photo                                                                                                                                                                                                                                                                                                                                                                                                             |
| `F01`–`F03` | Driver dashboard, my vehicle, applying to become a driver or owner                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `G01`–`G05` | Vehicle owner: dashboard, vehicles, register a vehicle, drivers, trip history                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `H01`–`H04` | Cashier: remittances, payments to verify, ledger, settlements                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `I01`–`I12` | Administrator: overview, bookings, live map, trip verification, applications, vehicles, rentals, incidents, payments, settings, staff, audit log                                                                                                                                                                                                                                                                                                                                                            |
| `M01`–`M07` | Phone screens, full length: landing, sign-up, home, booking, rental, live tracking, driver trip                                                                                                                                                                                                                                                                                                                                                                                                             |

**Everything is editable.** The screens are not screenshots. They were converted from the running app into
real Figma layers:

- every text is a **text layer** in the app's fonts (Geist, Bricolage Grotesque, Geist Mono, all free in Figma)
- cards, buttons, inputs, tags and dividers are **rectangles** with their real colours, borders and corner radius
- icons and vehicle drawings are **vector paths**
- photos are **image fills**; the map is one base-map image with the pins and labels as vector layers on top
- layers are **named like the page**: `Button-Book-a-haul`, `Heading-My-bookings`, `Card…`, `Input-pu`, `Text-…`

Two folders:

| Folder              | Use it for                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screens-editable/` | **Designing and prototyping.** 96 clean screens (1440 px desktop, 390 px phone), exactly the app with example data and no annotations.                                                 |
| `frames/`           | **Presenting to the client.** The same editable screens inside annotated frames: numbered markers, explanations, Go-to buttons, plus a cover, "How it works" and an index (99 frames). |

Every annotated frame has:

- a **header** with the role (colour-coded), screen number and title
- the **real screen** with **numbered orange markers**
- a side panel: **what the screen is for**, **the example data shown**, **what each number means**
- **"Go to" buttons** (and a **Screen index** button) that you connect to other frames so the client can click through

## 1. Put it in Figma (about 5 minutes)

1. figma.com → **New design file** → name it `ZamMove – Client Prototype`.
2. Make two pages in the left panel: **Screens** and **Presentation**.
   - On **Screens**, drag in all `.svg` files from `screens-editable/`.
   - On **Presentation**, drag in all `.svg` files from `frames/`.

   Each file becomes its own frame with editable layers. (Another way: open an SVG in Notepad, copy everything, and press **Ctrl+V** in Figma.)

3. Figma places them in a row. Optional tidy-up: select all → right-click → **Tidy up**.
4. If Figma warns about the font, choose **Inter** (free in Figma).

`ZamMove_Client_Prototype_Board.svg` has everything on one board. It's useful for a quick overview, but use the separate frames for the prototype.

### Editing tips

- Double-click into a frame to reach a layer. **Ctrl+click** (Cmd+click on Mac) selects the deepest layer directly.
- Change any text by double-clicking it. Change colours in the Fill panel.
- To reuse a part, such as the top bar or a button, select its group → right-click → **Create component**. Then use that component on the other screens.
- Text comes in fixed-position lines, like a printed page. To make a paragraph reflow, select its text layers and retype them as one text box.
- To give a layout auto-spacing, select a group → **Shift+A** (Auto layout).

## 2. Make it clickable (Prototype tab)

1. Top-right panel → **Prototype**.
2. Click a **Go to** button on a frame (the layer is named `Go_to_<screen>`, e.g. `Go_to_C02-driver-request`).
3. Drag the blue **+** handle onto the frame with that number, e.g. "Accept booking · C03" → frame `C03 …`.
   Leave the interaction as **On click → Navigate to**, with **Smart animate** or **Instant**.
4. Connect every **Screen index** button to `00c-index`, and each tile on the index to its frame.
5. Select `00a-cover` → in Prototype, set it as the **flow starting point** (name the flow "ZamMove walkthrough").

The text under the buttons ("Leads to: …") says exactly which frame each button opens.

On the clean screens in `screens-editable/`, you can wire the app's own buttons. For example, select `Button-Accept-booking`
on C02 and connect it to C03. The layer names match the button labels, so they are easy to find in the Layers panel.

## 3. Present it to the client

- Click **▶ Present** (top right). Use the buttons, or the arrow keys to go frame by frame.
- **Share → Copy link** (set "Anyone with the link can view") so the client can explore it on their own.

Suggested order (about 20 minutes):

1. Cover → **How ZamMove works**: the two services and who does what.
2. Account and trust: A02 → A03 → A04 → A05 (blocked before verification) → A07 (after)
3. **One move from start to finish:** B01 → C01 … C25. It alternates customer and driver, so the client sees both sides of every step. Pause on C11–C16 (Start PIN and verification) and C19–C20 (Delivery PIN).
4. **One rental from start to finish:** D01 … D21. Pause on D07 (the contract), D12–D14 (release photos and the renter’s check, before and after) and D17–D20 (deposit claim, dispute and refund).
5. Cashier and admin highlights: H01 → I01 → I03 → I04 → I08
6. Phone screens: M01 – M07 (it works in the phone's browser; nothing to install)

## 4. Rebuild after the system changes

The screens come from the running system. The capture script lives outside the repo, so ask Claude to recapture them.
Once `source/` holds the new `vector/` files and `meta.json`:

```bash
python build_client_prototype.py
```
