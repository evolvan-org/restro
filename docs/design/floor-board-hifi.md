# Live Floor Board (`/floor`) — Hi-fi handoff

Design canvas (page **"Hi-fi · Option A"**): https://claude.ai/artifact/PQz4gFrYBAWkLfL2ecQv1o

Primary users: host, manager and captains. **Tablet landscape first (1194×834), then desktop.**
Scope: today's `RestaurantTable` data plus a few light additions, marked **NEW** below.

Files to rebuild:

- `apps/web/src/containers/FloorBoard/index.tsx`
- `apps/web/src/components/FloorTile/index.tsx` (keep the Base UI `Popover` + `Tooltip` structure)
- `apps/web/src/components/AppSidebar/navigation.ts` (add the nav item)

Reuse: `TableCaptainAction`, `useShowWalkInFormSidePane`, `useShowSidePane(SidePaneType.ReservationEdit)`, `useCompleteOrder`, `useTransitionTableStatus`, `usePermissions`, the shadcn `Button` / `Sheet`, `lucide-react` icons, and the existing 12s refetch + 60s timer tick.

---

## 1. Screens

### 1.1 Floor board — tablet (1024–1279px, primary)

```
┌────┬──────────────────────────────────────────────────────────────────────────────┐
│ R  │ Live floor board                         [🔍 Find table      ] [+ Seat walk-in]│  72px header
│    │ ● Live · updated 4s ago                                                        │
│ ▦  ├──────────────────────────────────────────────────────────────────────────────┤
│ ▣* │ (All tables 17) (● Available 6) (● Occupied 6) (● Reserved 3) (● Needs cleaning 2)   Covers 23/70 │  64px
│ ▤  ├──────────────────────────────────────────────────────────────────────────────┤
│ ▥  │ All sections 17 | Main hall 8 | Patio 4 | Bar 4 | Private 1                    │  44px tabs
│ ▧  ├───────────────────────────────────────────────────────┬──────────────────────┤
│    │ MAIN HALL  3 of 8 free                                │ Needs attention (3)  │
│    │ [T1][T2][T3][T4!][T5][T6!][T7][T8]                    │ ┌ T4 seated 1:52 ──┐ │
│    │ PATIO  2 of 4 free                                    │ │ [View order]     │ │
│    │ [P1][P2][P3][P4]                                      │ ├ T6 cleaning 18m ─┤ │
│    │ BAR  1 of 4 free                                      │ │ [Mark available] │ │
│    │ [B1][B2][B3][B4]                                      │ ├ Sharma ×4 7:30 ──┤ │
│    │ PRIVATE  0 of 1 free                                  │ │ [Start order]    │ │
│    │ [PR1]                                                 │ Up next · 2 hrs      │
│    │                                                       │ 7:30 Sharma ×4  [T3] │
│    │                                                       │ 9:00 Iyer ×5 [Assign]│
└────┴───────────────────────────────────────────────────────┴──────────────────────┘
 64px icon rail (sidebar collapsed)          main: px-6 py-[18px]            rail 300px
```

- The header, chips and tabs stay sticky; only `main` scrolls, and the rail scrolls on its own.
- Section heading: `text-xs font-semibold uppercase tracking-[.12em] text-neutral-600` + `text-xs text-muted-foreground` summary ("3 of 8 free"; with a status filter on, "3 occupied").
- Hide sections with no matching tables (as today).

### 1.2 Floor board — desktop (≥1280px)

The structure is the same as tablet, with these changes:

- Expanded sidebar (256px).
- Page padding `px-8`.
- Tiles 112×120.
- Rail 320px, with compact alert cards (icon · title/reason · small action button on the right).
- Search shows a `/` keyboard hint.
- Chips and buttons are `h-9` (36px).
- A hover **Tooltip** on tiles shows a preview (status + time in status, captain, guest · party · time). Clicking opens the popover.
- With a status filter on, show **"Clear filter"** (underlined text button) after the chips. Below the grid show "Showing 6 of 17 tables".

### 1.3 Table tapped → actions popover

- The tapped tile gets `ring-2 ring-neutral-900 ring-offset-2 shadow-lg` and stays above the scrim.
- Touch only: a light scrim `bg-black/20` over the page. Tapping outside closes the popover; so does Esc.
- Popover: `w-[360px] rounded-xl border shadow-xl`, `sideOffset={12}`, with an arrow, flip/shift collision handling as today, and `max-h-[calc(100dvh-1.5rem)] overflow-y-auto`.

Popover content, top to bottom (sections divided by `border-b border-neutral-100`):

1. **Header:** `T4` (`text-[22px] font-bold`) · section · `Users` icon + "6 seats" · close button (ghost icon button, 44×44).
2. **Status row:** status pill (dot + name) · timer `text-lg font-bold tabular-nums` with a `Clock` icon · "since 5:58 PM" (muted).
3. **Attention callout** (only when it applies): `bg-amber-50 border-amber-200 text-amber-800`, `TriangleAlert` icon, e.g. "Seated past the 90 min turn target". Reserved tables arriving in ≤15 min use the blue variant `bg-blue-50 border-blue-200 text-blue-800`.
4. **Details** (label left in muted `text-[13px]`, value right `text-sm`, rows `min-h-8`): Guest ("Gupta · 5 guests"), Booking ("Walk-in · 5:58 PM" or "Today, 7:30 PM"), Order ("● Open" / "Not started").
5. **Actions:** one full-width primary (dark) button, then secondary buttons in a 2-column grid (`h-11` on tablet).
6. **Status:** a segmented **radiogroup** (Available / Occupied / Reserved / Cleaning) in a `bg-neutral-100 p-1 rounded-[9px]` track. The active segment is `bg-white shadow-sm font-semibold`. It replaces the `NativeSelect`. Clicking the active status does nothing.
7. **Captain:** the existing `TableCaptainAction`, styled as a full-width 44px picker (avatar initials + name + "· role" + chevron). Shows "Assign captain" when none is assigned.

### 1.4 Popover per state

| State                | Status row                     | Callout                        | Details rows                    | Primary                          | Secondary                        |
| -------------------- | ------------------------------ | ------------------------------ | ------------------------------- | -------------------------------- | -------------------------------- |
| Available            | pill only + "Free for 25 min"  | —                              | Guest: "No one seated" (muted)  | **Create walk-in**               | —                                |
| Reserved             | pill + `7:30 PM` + "in 12 min" | blue, if ≤15 min away          | Guest, Booked for               | **Start order** / **View order** | Edit reservation                 |
| Occupied, no order   | pill + timer + "since 7:06 PM" | amber, if over turn target     | Guest, Order: "Not started"     | **Start order**                  | Edit reservation                 |
| Occupied, order open | pill + timer + since           | amber, if over turn target     | Guest, Booking, Order: "● Open" | **View order**                   | Complete order, Edit reservation |
| Needs cleaning       | pill + timer + since           | amber, if over cleaning target | "Last guest · Left 7:00 PM"     | **Mark available**               | —                                |

Permissions stay as in the current `FloorTile`: **hide** (don't disable) anything the role can't do.

- Create walk-in → `RESERVATION_WRITE`
- View/Start order → `ORDER_READ` (Start label only with `ORDER_WRITE`); link `/orders/tables/{id}?reservationId={rid}`
- Complete order → `ORDER_UPDATE`
- Edit reservation → `RESERVATION_WRITE`
- Status radiogroup / Mark available → `TABLE_UPDATE_STATUS`
- Captain picker → `TABLE_ASSIGN_CAPTAIN`

### 1.5 System states (replace the section grid only)

- **Loading (first load):** skeleton chips (3 × `h-9 w-28 rounded-full`), skeleton section labels, and skeleton tiles at tile size (`bg-neutral-100 animate-pulse`).
- **Empty (no active tables):** icon tile (`Table2`), "No active tables yet", the text "Add tables and give each one a section to see them on the floor board.", and a primary link "Set up tables" → `/tables`.
- **No matches (filters on):** `Search` icon, "No tables match", a sentence naming the active filters ("No **Needs cleaning** tables in **Patio** right now."), and a "Clear filters" button.
- **Error:** red icon tile, `role="alert"` "Unable to load the floor board" plus `getApiErrorMessage(...)`, and a "Try again" button that calls `refetch()`.
- **Reconnecting (NEW):** shown when a refetch fails while data exists, or the data is >60s old. An amber banner sits above the grid: `RefreshCw` icon, "Reconnecting…", "Last updated 2 min ago. Timers keep counting; statuses may be out of date.", and a "Refresh now" button. The live dot in the header turns amber.

---

## 2. Tokens

### 2.1 Status colours — extend `SYSTEM_STATUS_COLORS`

Add keys `border`, `label`, `pill` alongside the existing `ring/bg/dot/badge/strip`, and keep the `dark:` variants.

| Code             | Tile bg / border                | Label text              | Strip + dot              | Popover pill                  |
| ---------------- | ------------------------------- | ----------------------- | ------------------------ | ----------------------------- |
| `AVAILABLE`      | `bg-green-50 border-green-200`  | `text-green-700`        | `bg-green-500`           | `bg-green-100 text-green-700` |
| `OCCUPIED`       | `bg-slate-100 border-slate-300` | `text-slate-700`        | `bg-slate-500`           | `bg-slate-200 text-slate-700` |
| `RESERVED`       | `bg-blue-50 border-blue-200`    | `text-blue-700`         | `bg-blue-500`            | `bg-blue-100 text-blue-700`   |
| `NEEDS_CLEANING` | `bg-red-50 border-red-200`      | `text-red-700`          | `bg-red-500`             | `bg-red-100 text-red-700`     |
| custom status    | `DEFAULT_STATUS_COLOR`          | `text-muted-foreground` | `bg-muted-foreground/40` | `bg-muted`                    |

**Needs attention (NEW)**, overlaid on any status:

- tile `ring-2 ring-amber-500`
- corner badge: 20px circle `bg-amber-500 text-stone-900 border-2 border-white`, "!" at `-top-[7px] -right-[7px]`
- rail count `bg-amber-100 text-amber-800`

Status is never colour-only: every tile prints its status label.

### 2.2 Type, size and spacing

| Element           | Tablet (<1280)                                                                                                                                   | Desktop (≥1280)                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Page title        | `text-xl font-semibold tracking-tight`                                                                                                           | same                                           |
| Live line         | `text-xs text-muted-foreground` + 8px `bg-green-500` dot with `ring-[3px] ring-green-100`                                                        | same                                           |
| Tile              | 88×100, `rounded-[10px] border px-[9px] py-2`, gap 10                                                                                            | 112×120, `rounded-xl px-[11px] py-2.5`, gap 12 |
| Tile number       | `text-base font-bold`                                                                                                                            | `text-lg font-bold`                            |
| Tile seats        | `Users` 12px + `text-xs text-neutral-600`, top-right                                                                                             | same                                           |
| Tile status label | `text-[10px] font-semibold uppercase tracking-wide` + status label colour                                                                        | `text-[11px]`                                  |
| Tile timer/time   | `text-[13px] font-semibold tabular-nums` (bottom)                                                                                                | `text-[15px]`                                  |
| Tile sub line     | `text-[11px] text-neutral-600 truncate` (captain first name / guest × party / "Free")                                                            | `text-xs`                                      |
| Tile strip        | `h-[3px] rounded-full mt-1` + strip colour                                                                                                       | `mt-[5px]`                                     |
| Chips             | `h-11 rounded-full border px-3.5 text-sm font-medium`, dot + label + count pill (`bg-neutral-100 text-xs font-semibold`)                         | `h-9 px-3 text-[13px]`                         |
| Active chip       | `bg-neutral-900 text-neutral-50 border-neutral-900`, count `bg-neutral-700`                                                                      | same                                           |
| Section tabs      | `h-11 border-b-2`, active `border-neutral-900 font-semibold text-foreground`, inactive `text-muted-foreground`, count `text-xs text-neutral-400` | same                                           |
| Buttons           | `h-11` (44px touch)                                                                                                                              | `h-9`                                          |
| Page padding      | `px-6`                                                                                                                                           | `px-8`                                         |
| Rail              | 300px, `bg-neutral-50 border-l p-4`                                                                                                              | 320px, `p-5`                                   |

Tile hover/press: `hover:-translate-y-0.5 hover:shadow-md`, `focus-visible:ring-4 ring-offset-2` (keep the existing behaviour).

---

## 3. Responsive

- **≥1280 · desktop:** expanded sidebar, 112px tiles, hover tooltip (existing `hidden md:block` → change to `hidden xl:block`), rail 320.
- **1024–1279 · tablet landscape (primary):** collapsed 64px icon sidebar, 88px tiles, no hover tooltip, rail 300.
- **768–1023 · tablet portrait:** rail hidden; the header shows a "3 need attention" button (amber count) that opens the rail content in a right `Sheet`.
- **<768 · phone:** chips and tabs scroll horizontally (`overflow-x-auto`, no wrap); the tile popover becomes a bottom `Sheet` with the same content; Seat walk-in becomes an icon button with `aria-label`.

---

## 4. Components (suggested split)

- `FloorHeader` — title, live/reconnecting indicator (from `tables.dataUpdatedAt`, `tables.isError`), search input, Seat walk-in.
- `StatusFilterChips` — single-select toggle buttons with `aria-pressed`; "All tables" clears. **Counts come from the unfiltered list**, so the status filter is applied client-side. Covers stat on the right.
- `SectionTabs` — `role="tablist"`; "All sections" + one tab per section with its table count; drives `sectionId`.
- `FloorSection` — heading + summary + tile grid (`flex flex-wrap`).
- `FloorTile` — new layout + attention ring/badge; aria-label `"Table T4, 6 seats, Occupied, needs attention. Open actions"`.
- `TablePopover` — content from §1.3/§1.4 (can stay inside `FloorTile`).
- `AttentionRail` (NEW) — "Needs attention" cards + "Up next" list. When nothing needs attention, show "All tables on track" (muted).
- `FloorBoardStates` — loading / empty / no-match / error / reconnecting.

Attention card (tablet): `rounded-[10px] border bg-white p-3`; 32px icon tile + title `text-sm font-semibold` + reason `text-xs text-muted-foreground`; action `Button size="sm" variant="outline"` below. On desktop the action sits on the right.

- Long-seated: `Clock` icon, `bg-amber-100 text-amber-700`
- Cleaning overdue: `Sparkles` icon, `bg-red-100 text-red-700`
- Arriving soon: `Calendar` icon, `bg-blue-100 text-blue-700`

Up next row: `h-11 px-3 border-b`, time `font-semibold tabular-nums w-10` · guest "Name ×N" · table chip `bg-blue-50 text-blue-700 rounded-md h-[22px] px-2 text-xs font-semibold`, or **Assign** chip `bg-amber-50 text-amber-800 border border-amber-200` when there's no table (opens reservation edit).

---

## 5. Data — what exists vs what's new

| UI                            | Source                                                                                                                    | Work needed                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Number, seats, section        | `tableNumber`, `capacity`, `section`                                                                                      | none                                                                                                                                 |
| Status label + colour         | `currentStatus.code / name`                                                                                               | none                                                                                                                                 |
| Timer                         | `statusChangedAt` (60s tick exists)                                                                                       | format `H:MM`; also "Free for N min" for AVAILABLE in the popover                                                                    |
| Guest / party / time          | `activeReservation.guest.guestName`, `partySize`, `reservationAt`                                                         | none                                                                                                                                 |
| Captain                       | `captain.name / role`                                                                                                     | none (tile shows first name)                                                                                                         |
| Order open                    | `openOrderId`                                                                                                             | none                                                                                                                                 |
| Search                        | `tableListQuerySchema.search` exists                                                                                      | filter client-side on `tableNumber` for instant results                                                                              |
| **NEW** Covers `23 / 70`      | Σ `activeReservation.partySize` of OCCUPIED tables / Σ `capacity` of active tables                                        | client only                                                                                                                          |
| **NEW** Needs attention       | OCCUPIED longer than turn target; NEEDS_CLEANING longer than cleaning target; RESERVED with `reservationAt` ≤ 15 min away | start with constants `TURN_TARGET_MIN = 90`, `CLEANING_TARGET_MIN = 10`, `ARRIVING_SOON_MIN = 15`; later move to restaurant settings |
| **NEW** Up next               | reservations with `reservationAt` in [now, now + 2h], including ones with no table                                        | reservations list query with a time window (add `from`/`to` params to the contract if missing)                                       |
| **NEW** Seat walk-in (header) | `useShowWalkInFormSidePane`                                                                                               | allow opening with no table; suggest the smallest AVAILABLE table with `capacity ≥ partySize`                                        |
| **NEW** Live / reconnecting   | TanStack `dataUpdatedAt`, `isError` (12s refetch exists)                                                                  | amber state as in §1.5                                                                                                               |
| Nav item                      | `AppSidebar/navigation.ts`                                                                                                | add `{ label: 'Floor board', icon: LayoutGrid, href: '/floor', permission: Permission.RESTAURANT_READ }` after Dashboard             |

Note: the status filter should move client-side, because the chip counts need the full list. The section tab can stay a server param (`sectionId`), or also go client-side. Either is fine, since the list already loads `MAX_PAGE_SIZE`.

---

## 6. Acceptance checklist

- [ ] Tablet 1194×834 matches canvas frame 1; desktop 1440 matches frame 4.
- [ ] Every interactive element is ≥44px below 1280px.
- [ ] Status chips filter, show counts from the unfiltered list, and "All tables" clears them.
- [ ] Tapping a tile opens the popover with the correct primary action per state (§1.4); actions are hidden per permission.
- [ ] Status change is a radiogroup; captain uses `TableCaptainAction`.
- [ ] Attention ring/badge + rail entries follow the thresholds; the rail empty state shows.
- [ ] Loading / empty / no-match / error / reconnecting states render as in frame 5.
- [ ] Tablet portrait moves the rail into a Sheet; phone uses a bottom Sheet for the popover.
- [ ] `yarn lint && yarn typecheck` pass.
