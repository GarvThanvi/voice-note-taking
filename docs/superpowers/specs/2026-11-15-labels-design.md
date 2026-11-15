# Labels for NoteFlow — design

Date: 2026-11-15
Status: approved for planning

## Intent and why

The All Notes screen has grown long enough that finding a note means searching
or scrolling. Labels give the user coarse buckets — Home, Work, Personal — and
each label carries a color the user picks, so a list can be narrowed by intent
instead of by remembering text. A note can carry several labels, because real
notes straddle buckets ("Work" + "Urgent").

## Goals

- Create, rename, recolor and delete labels, each scoped to one user.
- Label color is any `#RRGGBB` the user chooses, at creation or later.
- Attach zero or more labels to a note, at creation or afterwards.
- Filter the note list to a single label from the sidebar; search composes with it.
- Show a note's labels on its card in both the grid and list views, on every tab
  (All Notes, Bookmark, Archive, Trash).
- A label's color reads correctly in both the dark and the light theme.

## Non-goals

- Voice commands that assign labels (`extractIntent` is unchanged).
- Searching by label name; label names are not part of the `search` query.
- Per-label note ordering, or drag-reorder inside a label view.
- Nested labels, label groups, or labels shared between users.
- Bulk-assigning one label to many notes.
- A dedicated Labels management page; management lives in the sidebar and a modal.
- Composite filters such as "archive + label" (see Decision R1).

## Anti-goals

What would make this a failure even if it technically works:

- **Labeling being expensive.** If attaching a label costs more than a click or
  two per note, notes go unlabeled and the feature is decoration. The picker must
  be one click per label, and creating a label from inside a note must not
  require leaving the note.
- **Cards becoming noisy.** If chips crowd the title or push the content away,
  the All Notes screen gets harder to read, which is the opposite of the goal.
- **A list that lies.** Counts that do not match, or notes appearing in a label
  view that no longer carry the label, destroy trust faster than having no
  feature.
- **Unreadable chips.** White text on a pale yellow label (or dark text on navy)
  makes the color the user chose look broken.

## Constraints

- Prisma 7 with the `prisma-client` generator writing TypeScript into
  `backend/src/generated/prisma` (gitignored). Every schema change needs
  `npm run build` (`prisma generate`) plus a migration; the server runs TS
  directly through `tsx`, there is no compile step.
- One Postgres (Neon) database, shared with the deployed app. Migrations must be
  applied there, not just locally.
- **Blocker:** the development machine's router DNS refuses
  `*.ap-southeast-1.aws.neon.tech`, so Prisma cannot resolve the database host
  (P1001 / `getaddrinfo ENOTFOUND`). Fix by setting the Wi-Fi adapter's DNS to
  1.1.1.1 / 8.8.8.8, or run migrations from a network that resolves it. Nothing
  else in this design needs the database.
- The list endpoint paginates at 12 per page and `GET /api/note` builds a single
  `where` clause; labels slot into it rather than adding a parallel endpoint.
- Express 5 with zod v4 validation; every route is user-scoped by `userId`.
- Tailwind v4 theme tokens with `.light` overrides. Runtime hex values cannot be
  Tailwind classes, so chip colors must be inline styles.
- Cards receive a whole `note` object; `NoteItem` switches between `NoteCard`
  (grid) and `NoteListItem` (list).

## Approaches considered

**A. `Label` model + Prisma implicit many-to-many — chosen.**
A `Label` row owns name and color; the join table is `_LabelToNote`. Cards read
the label entity, so recoloring is a single row update that shows everywhere.
Deleting a label cascades the links and leaves notes intact. Filtering is an
indexed `labels: { some: { id } }`. This is the smallest model that gives a
stable, unique, user-owned label.

**B. Explicit `NoteLabel` join model.**
Buys per-note label ordering and an `assignedAt`; costs hand-written
connect/disconnect logic in note create and update. Rejected: we have no use for
per-note order, and Prisma's implicit relation already cascades.

**C. Labels as `Json` on `Note`.**
No new tables, but recoloring rewrites every note that uses the label, names
cannot be unique per user, the sidebar list needs a `DISTINCT` scan over JSON,
and filtering cannot use an index. Rejected: "go to Home" wants a label to be a
stable thing, not a per-note copy.

## Decisions

### R1 — A label view is a flat fifth tab

`activeFilter` keeps its single-string shape and gains `label:<id>`. A label
view shows the user's **active** notes (not archived, not trashed) carrying that
label — exactly the scope `noteCount` reports.

Chips are clickable on All Notes and Bookmark, jumping to that label's view.
They are **display-only on Archive and Trash**, because navigating from an
archived card would land the user in a view that excludes the card they just
clicked. Composite filters (`archive + label`) are out of scope: the existing
`handleToggleFavorite` already special-cases the `bookmark` tab, and making the
filter composite would rework that, the title rules, the empty states and the
sidebar's active highlighting.

Consequences:

- `reorderEnabled` stays `activeFilter === "all"`; label views are not draggable.
- Page title for a label filter is the label's name; empty message is
  "No notes with this label".

### R2 — One label list, owned by the page

`useLabels` is instantiated **once**, in `Note.tsx`, and passed down: `Sidebar`
gets the list and mutation callbacks; `NoteModal`'s picker gets the list and a
create callback. `LabelModal` is a props-driven dialog rendered where it is
needed — once at page level for the sidebar's create/edit, and once inside
`LabelPicker` for "create a label without leaving the note" — while the
canonical list and every mutation still live in the single `useLabels`
instance. One list, two mount points.

Cards render chips from each note's **embedded** `labels`, so they work while
paging. `Note.tsx` patches the loaded notes when a label is renamed or
recolored, and strips it from them when deleted. That one small effect is what
makes "propagates without a refresh" true, without prop-drilling a label map
into both card components.

### R3 — Counts stay honest

`useLabels.refresh()` is called by the note handlers that change membership or
archive/trash state: create, update, delete, archive, restore, permanent delete,
empty trash, and voice action completion. One extra `GET /api/label` per
mutation, one line per handler. Stale counts are an anti-goal, and the cost is
a cheap read.

### R4 — Creating from a label view pre-assigns it

`NoteModal` takes `defaultLabelIds`, seeded from the active label, so a note
created while viewing Work is a Work note.

Voice-created notes cannot carry labels (non-goal). If a label filter is active
and the note returned by a voice action does not carry it, the page calls
`reset()` instead of inserting it, so the visible list never contradicts the
filter.

## Data model

```prisma
model Label {
  id        Int      @id @default(autoincrement())
  userId    Int
  name      String
  color     String   // "#RRGGBB", stored uppercase
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes     Note[]

  @@unique([userId, name])
  @@index([userId])
}
```

- `Note` gains `labels Label[]`; `User` gains `labels Label[]`.
- Migration `add_labels` creates `Label` and the `_LabelToNote` join table.
- `color` is validated as `/^#[0-9A-Fa-f]{6}$/` and normalized to uppercase.
- Postgres' unique index is case-sensitive, so the API additionally rejects
  case-insensitive duplicates (`mode: "insensitive"` lookup) with 409. The index
  remains the last line of defense.
- Notes keep no copy of a label's name or color; the join row is the only link.

## API — labels

New `backend/src/routes/label.ts`, mounted at `/api/label`, `authMiddleware` on
the router. Validation in `backend/src/schemas/label.ts`:

- `name`: trimmed, 1–30 characters.
- `color`: matches `/^#[0-9A-Fa-f]{6}$/`, stored uppercase.
- Update schema is the create schema, partial.

| Route | Body | Behaviour |
| --- | --- | --- |
| `GET /` | — | Labels for the user, name ascending, each with `noteCount` (notes where `deletedAt: null` and `archived: false`) |
| `POST /` | `{ name, color }` | 201 with the label; 409 on duplicate name; 400 on validation failure |
| `PUT /:id` | `{ name?, color? }` | 404 if not owned; 409 on duplicate; returns the updated label |
| `DELETE /:id` | — | 404 if not owned; deletes the label, join rows cascade, notes are kept and become unlabelled |

Every lookup is scoped `where: { id, userId }`. Nothing about a label is ever
read or written without the user scope.

`noteCount` uses a filtered relation count
(`_count: { select: { notes: { where: { deletedAt: null, archived: false } } } }`).
If the generated Prisma types reject the filtered count, fall back to the
unfiltered `_count`; counts are decorative and must never block the feature.

## API — notes (existing `backend/src/routes/note.ts`)

1. **`GET /`** — accepts a `labelId` query param and adds
   `where.labels = { some: { id: labelId } }`. The `include` gains
   `labels: { select: { id, name, color } }`. **Both** branches of the manual
   `formattedNotes` mapper (PARAGRAPH and CHECKBOX) must add `labels`: that
   mapper hand-picks fields, so a missed branch silently drops chips.
2. **`POST /`** — accepts `labelIds?: number[]`. Verify ownership with
   `count({ where: { id: { in: labelIds }, userId } })` against the distinct id
   count and answer **404 "Label not found"** on mismatch (not 400: a 404 does
   not confirm whether another user's label id exists). Create with
   `labels: { connect: [...] }` and return the note with labels included.
3. **`PUT /:id`** — accepts `labelIds?: number[]`. Destructure it out alongside
   `todos` before the `cleanFields` spread (that spread goes straight into
   Prisma's `data`). Validate ownership, then apply `labels: { set: [...] }`.
   An empty array clears all labels; omitting the field leaves them untouched.
   Return the note with labels included.
4. **`PUT /:id/order`** and **`PUT /todo/complete/:noteId`** — add the same
   `labels` include. Both return a note that client state may use to replace an
   existing one; without labels those responses would wipe chips.

Label names stay out of `search` and out of `resolveTarget`. Search keeps
meaning "match the note's own words".

## API — voice (`backend/src/lib/executeAction.ts`)

No new actions and no changes to `extractIntent`. But `ExecutionNote` gains
`labels`, and every note-returning path includes them: `create_note` (both
types), `add_todo`, `mark_done`, `update_todo`, `update_note`, `archive`.

Reason: `VoiceControl.onActionDone` replaces the note object in the list. A note
returned without `labels` would make that note's chips vanish until a refresh —
a list that lies (anti-goal).

## Frontend

### Types and client

- `frontend/src/api/labelApi.ts`:
  `Label { id, name, color, noteCount }`, `NoteLabel = Pick<Label, "id" | "name" | "color">`,
  and `getLabels`, `createLabel`, `updateLabel`, `deleteLabel`. Same
  `{ success, message }` response shape and error convention as `noteApi`.
- `frontend/src/api/noteApi.ts`: `Note` gains `labels: NoteLabel[]`;
  `CreateNoteData` and `UpdateNoteData` gain `labelIds?: number[]`; the
  `getNotes` options gain `labelId?: number`, sent as a `labelId` param.

### State

- `activeFilter`: `all | bookmark | archive | trash | label:<id>`.
- `useInfiniteNotes` keeps its signature. `buildOptions` parses the filter string
  for `label:` and sends `labelId`; bookmark/archive/trash behaviour is unchanged.
- `useLabels` (new hook): loads once on mount, exposes `labels`, `loading`,
  `error`, `create`, `update`, `remove`, `refresh`.
- `Note.tsx` owns the wiring: page title, empty message, the note handlers'
  `refresh()` calls, patching loaded notes after label rename/recolor/delete,
  falling back to `all` when the active label is deleted, and dropping a note
  from a label view when it loses that label.

### Components

- **`LabelChip`** — **solid** fill of the user's hex with text colour derived
  from that hex's relative luminance (dark text on light fills, white on dark),
  so a pale yellow and a near-black label both read correctly in both themes.
  A translucent wash was rejected: at 14% opacity a near-black label is
  indistinguishable from the surface, and no single text colour is readable
  across both a 14% wash on `#050607` and on `#f5f6f8`. Optional remove button;
  optional click; optional `+N` overflow variant.
- **`LabelPicker`** — the chip row used inside `NoteModal`: selected chips with
  remove buttons, an "Add label" popover listing unassigned labels as colored
  dots, and "New label" which opens `LabelModal` and auto-assigns the result.
- **`LabelModal`** — create/edit dialog: name input, native color input, editable
  hex field, preset swatches, Save/Cancel. In edit mode a Delete action whose
  confirm copy states that notes are kept and only the label is removed.
- **`Sidebar`** — new `LABELS` section under the four filters, with an uppercase
  micro-header and a `+` button. Each row: colored dot, name, count; a `⋯`
  affordance opens `LabelModal` in edit mode. The nav area becomes
  `flex-1 overflow-y-auto` so many labels cannot push the user block off-screen.
  Sidebar needs new props: `labels`, `onSelectLabel`, `onNewLabel`, `onEditLabel`.
- **`NoteCard` / `NoteListItem`** — up to three chips plus a `+N` indicator;
  chips render on every tab; the click behaviour follows R1.
- **`NoteModal`** — `labelIds` joins the draft, assigned via `LabelPicker`,
  included in the create payload and in the debounced autosave for edits (a chip
  toggle schedules a save exactly like a text edit does). Accepts
  `defaultLabelIds` for R4.

### Visual

```
┌────────────────────┐      ┌─────────────────────────────┐
│ NoteFlow           │      │ ● Work ×   ● Urgent ×    +  │  assign (in modal)
│ [+ New Note]       │      └─────────────────────────────┘
│ ▤ All Notes        │
│ ⛉ Bookmark         │      ┌─────────────────────────────┐
│ ▣ Archive          │      │ Sprint recap          ● ●  │  chips (grid + list)
│ ⌫ Trash            │      │ Standup notes, blockers…    │
│                    │      │ Sep 12            ☆ ▣ ⌫     │
│ LABELS          +  │      └─────────────────────────────┘
│ ● Work        (12) │
│ ● Home         (4) │
│ ● Personal     (7) │
└────────────────────┘
```

## Build order

1. Restore database access (DNS), so migrations can run.
2. Schema change, `add_labels` migration, regenerate the Prisma client.
3. `schemas/label.ts`, `routes/label.ts`, mount in `app.ts`.
4. Note routes: `labelId` filter, label includes, `labelIds` on create/update,
   includes on the other note-returning routes.
5. `executeAction` label plumbing.
6. `labelApi.ts`, `noteApi` types.
7. `LabelChip` → `LabelModal` → `LabelPicker`.
8. `Sidebar`, `NoteCard`, `NoteListItem`, `NoteModal`.
9. `useLabels` and `Note.tsx` wiring.
10. Verify.

## Verification

Commands: `npm run build` (generate), `npx prisma migrate deploy`, `npm run dev`,
`curl http://localhost:8080/health`.

Manual checklist:

- Create a label with a custom hex; it appears in the sidebar with `(0)`.
- Assign two labels to one note; both chips render in grid and list.
- Chips render on All Notes, Bookmark, Archive and Trash.
- Clicking the sidebar label shows only notes carrying it; the count matches.
- Search inside a label view composes (AND) and does not leak other labels.
- Rename and recolor propagate to loaded cards with no refresh.
- Delete a label: notes survive, chips disappear, counts update.
- Create a note while a label view is active: it is pre-assigned and appears.
- Removing the active label from an open note drops it from the list.
- Drag-reorder still works on All Notes and is absent in label views.
- Sidebar stays usable with ~15 labels (nav scrolls, user block visible).
- Light theme and dark theme: chips readable on both, including a pale and a
  near-black label color.
- Voice action on a note keeps its chips; voice-created note under a label
  filter does not appear incorrectly.

## Left to the builder

- The exact preset swatch palette, chip padding and font size.
- Whether `noteCount` ships at all if the filtered count fights the generated types.
- The error surface inside `LabelModal` (inline text versus existing toast).
- Empty-state copy beyond "No notes with this label".
- Whether the `+N` overflow on cards is a count or a tooltip listing the labels.
