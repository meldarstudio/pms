# Property setup

`POST /setup` requires a signed-in session (Staff or Owner account) and saves one
room type with its room-table changes in one D1 batch. It accepts:

```json
{
  "roomTypeId": "existing-type-id",
  "name": "Doble",
  "maxAdults": 2,
  "maxChildren": 2,
  "baseRateCents": 15000,
  "rooms": [{ "id": "existing-room-id", "number": "101" }, { "number": "102" }]
}
```

Omit `roomTypeId` to create a type; omit a room's `id` to add it. Existing room IDs
must belong to the selected type and cannot be repeated. Omitted rooms are left
unchanged, not deleted. Empty room arrays are valid. Adult and child limits are
independent integers: `maxAdults` is at least 1 and `maxChildren` can be 0. Both
are hard limits for new or changed reserved rooms; there is no staff override.
Rates remain per room-night regardless of occupant counts.

The response is `{ roomType, rooms }`, including the saved type and all its rooms,
with status 201 for a new type or 200 for an edit. A conflict rolls back the entire
batch, including type edits, room-number edits, and new rooms. The existing English
error strings and `{ error: string }` responses are reused. Room-number conflicts
identify the affected submitted field in the CORS-exposed `X-Error-Field` response
header (for example, `rooms[2].number`), so the portal does not need a second
request to highlight the row. Uniqueness remains
database-enforced across the property. Saves have no revision check or retry
receipt; overlapping edits use last-write-wins.

Existing numbers are temporarily released inside the batch before applying final
numbers, allowing renumbering chains and swaps. An ownership guard aborts the
batch if a submitted room has changed type since it was loaded. This is an
integrity check, not revision-based concurrent-edit detection.

Setup does not change saved reservation prices or assignments. Existing
individual room and room-type endpoints remain available.

## Occupancy and availability

Room types, availability, and inventory responses expose `maxAdults` and
`maxChildren`. The limits
are checked separately: a type with limits of 2 adults and 2 children permits
that family arrangement, but not 3 adults or 3 children. Children remain part of
the reserved room's declared occupancy. No age collection or automatic age
classification is introduced.

`GET /availability?checkIn=2026-10-10&checkOut=2026-10-13&adults=3&children=0`
only returns types that can accommodate those counts **in one room**. Both count
filters are optional; without them, availability returns all requested room
types for the staff's multi-room editor. Adult filters accept integers from 1
to 100 and child filters from 0 to 100. Pricing and free-room counts are
unchanged. The endpoint requires a signed-in session.

Each type's `free` is its room count minus the busiest night's inventory-holding
stays (assigned or not) and closed rooms. `freeRoomIds` lists, in room-number order,
the type's rooms with no overlapping assigned stay in an inventory-holding status
(confirmed, checked-in, checked-out) and no overlapping closure. That is the same
`[start, end)` rule the overlap triggers enforce, so same-day turnover is free and
No-show/Unfulfilled stays release their room. Unassigned stays reduce `free` without
removing room IDs, so `free` can be lower than the list's length; only `free` limits
how many rooms a booking may reserve.

`excludeReservationId` drops that reservation's stays from both `free` and
`freeRoomIds`, so an editor whose draft replaces the saved reservation sees its own
rooms as free while other holders and closures still block. An unknown ID excludes
nothing.

## Portal setup

After signing in, calendar, reservations, and inventory stay accessible even when
property setup is incomplete. Their setup empty states link to `/setup`, and the
**Configuración** sidebar link keeps it accessible at any time. Inventory remains editable
when room types exist without rooms, so rates can be configured first. Each
deployment manages one property; there is no hotel profile or account-creation step.

`/setup` opens the room-type list in **Habitaciones**. Configuración also contains
**Apariencia** (`/setup?section=appearance`) and owner-only **Cuentas**
(`/setup?section=accounts`); old `/accounts` links redirect to that section. The
Staff account does not see Cuentas, and a direct visit opens Habitaciones without
reading accounts. Below 768px, a section select sits to the right of the title and
description; desktop uses a left-hand section menu. Navigation, setting rows, and
focused editors use the shared [Lyra controls](portal.md#control-styling).
Shell-header breadcrumbs close an editor or return to Configuración; focused
mobile breadcrumbs omit the Configuración
ancestor. Reloading or returning to a section opens its list, not an old draft.

The room-type list opens an editor for the type's name, base nightly rate in PEN,
separate maximum adults and maximum children, and a compact editable grid of its
physical room numbers. Enter a number and use **Agregar** or Enter to stage it;
focus stays in the add field for the next number. New rooms appear first, with a
small **Nueva** badge and a remove action. Only unsaved rooms can be removed;
saved rooms and types cannot be deleted here. Numbers are unique across the
property, and within-type number swaps save together.

**Guardar cambios** saves the selected type and all proposed room additions and
number edits atomically through `POST /setup`, never independent room PATCH calls.
There is no autosave. Saving also includes a valid number still in the add field;
invalid or duplicate pending input blocks the entire request without staging it
or losing other edits. **Descartar** resets both grid edits and pending input.
New types can be saved with no rooms. Setup is ready for reservations when at least
one saved room exists; there is no separate setup-completion flag or final wizard
submission.

Closing an editor, navigating breadcrumbs, or switching sections through either
the desktop menu or mobile select with a draft prompts to save, discard, or keep
editing. Pending add-field text is part of this
guard even before Add/Enter. Router navigation and browser unload also protect
unsaved changes; editing, discard, and navigation are blocked while saving. A
navigation attempted during an ordinary save is cancelled, not replayed, when the
save finishes, so its result stays on screen. A failed save-and-continue stays in the editor and does not queue a later navigation.
Explicit sign-out keeps the app's existing behavior.
Validation and save failures retain the draft, with known conflicts shown beside
the affected fields. A failed background refresh does not replace an open editor.
Configuration saves use last-write-wins rather than concurrent-edit detection.

Apariencia applies the system/light/dark theme from the existing
[theme provider](portal.md#installable-app-and-offline-behavior) immediately, with no
preview or Save step. The preference belongs to this browser, not the property or
team; if local storage is unavailable it lasts for the visit only. Cuentas uses the
existing [password workflows](authentication.md#portal-sessions).

Base-rate changes leave saved reservation prices intact. Lower adult or child limits
retain unchanged reservations; subsequent changes use the current validation rules.
Room reassignment and dated rate overrides stay in their existing screens.

`apps/portal/tests/setup.test.ts` exercises the real page and router through happy-dom with
HTTP responses substituted at the fetch boundary. The backend setup tests cover
the actual API and transactional database behavior.

See [save-time room validation](reservations.md#room-validation-at-save-time) for
existing reservations after limits change, and [property dates](calendar.md#property-dates)
for physical room-type changes.
