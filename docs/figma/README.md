# ZamMove – Figma presentation files

> **For clients:** use [`client-prototype/`](client-prototype/README.md). It has 52 annotated, clickable frames of every current screen, with example data. The board below is the older technical overview.

Everything here imports into Figma by drag and drop. The SVGs become editable layers (frames, shapes, text).

| File                                 | What it is                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `ZamMove_System_Board.svg`           | The whole presentation on one board: title, 4 diagrams, 32 desktop screens and 4 mobile screens (screenshots embedded) |
| `diagrams/01-architecture.svg`       | Frontend → Node.js backend → Supabase Postgres                                                                         |
| `diagrams/02-booking-lifecycle.svg`  | Booking statuses, who moves them, PIN and payment gates                                                                |
| `diagrams/03-roles-and-features.svg` | Customer, driver, vehicle owner, cashier, administrator, owner admin                                                   |
| `diagrams/04-data-model.svg`         | The 14 database tables and their links                                                                                 |
| `screens/*.png`                      | Screenshots of the real running system (1440×900 desktop, `m*` = phone at 390×844)                                     |

## Put it in Figma (5 minutes)

1. Open figma.com → **New design file**. Name it "ZamMove – System Overview".
2. Drag `ZamMove_System_Board.svg` onto the canvas. Wait a few seconds (it is ~5 MB because the screenshots are inside).
3. Optional, for separate pages: create pages **Overview**, **Diagrams**, **Screens**, then drag the files from `diagrams/` onto _Diagrams_ and the PNGs from `screens/` onto _Screens_.
4. Select a diagram and press **Shift+A** (or right-click → _Frame selection_) to wrap it in a frame. Frames can be presented.
5. To present: select the frames in order → **Present** (top right). Or **Share** → copy link for your professor (set "Anyone with the link can view").

Text in the diagrams is real text: double-click to edit. If Figma shows a missing-font warning, pick **Inter** (free in Figma).

## Suggested order when presenting

1. Board header: what ZamMove is and the technology used
2. Roles and features: who uses it
3. Booking lifecycle: the core process, with the Start PIN / Delivery PIN and 50/50 payment rules
4. Architecture: frontend, backend rules, database, and what is not connected yet
5. Data model: the tables in Supabase
6. Screens by role: customer → driver → owner → cashier → admin

## Want the screens as editable Figma layers too?

Run the system (`cd backend && npm start`) and use the free Figma plugin **html.to.design**: paste
`http://localhost:3000/customer/` and it converts the page into editable Figma frames. (The plugin needs a
publicly reachable URL for some features; screenshots above work without it.)

## Rebuild after changes

```bash
python build_figma_board.py      # regenerates the diagrams and the board from screens/
```

The screenshots were captured from the running system with demo data (names such as "Carla Mendoza" are fictional).
