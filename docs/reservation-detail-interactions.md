# Reservation detail interactions

## Problem Statement

Staff reviewing a reservation see overlapping edit controls with unclear scopes. The header and reservation card open the same stay-only editor, while the financial card's generic edit action changes only the discount. Contact details cannot be edited from the current overview. Status changes have inconsistent interactions between the page and compact calendar dialog, and routine check-in requires unnecessary confirmation. Back navigation depends on the entry point rather than consistently returning to Reservations.

## Solution

Keep a compact, read-first reservation detail page that ends at its two summary cards. Provide one clearly scoped reservation editor, an understandable reservation bill, and direct routine lifecycle actions. Preserve the existing shadcn visual language and equivalent phone/desktop capabilities.

## User Stories

1. As property staff, I want Back to always open Reservations, so that navigation is predictable regardless of where I opened the reservation.
2. As property staff, I want the reservation name, code, phone, status, and arrival/departure context visible, so that I can identify the correct reservation before acting.
3. As property staff, I want header actions right-aligned at the heading level, so that the compact overview remains easy to scan.
4. As property staff, I want one Editar reserva entry point, so that duplicate edit controls do not imply different capabilities.
5. As property staff, I want to edit the booking contact's name, phone, email, and document details, so that I can correct contact information.
6. As property staff, I want to edit stay dates, so that the reservation reflects its agreed stay.
7. As property staff, I want to add or remove reserved rooms while retaining at least one, so that room requirements can change.
8. As property staff, I want to change a reserved room's type, so that the reservation reflects the selected accommodation.
9. As property staff, I want to assign or unassign physical rooms, so that room assignments remain operationally accurate.
10. As property staff, I want to edit declared adults and children, so that room capacity is validated independently of the optional guest list.
11. As property staff, I want Contacto and Estadía visible in one editor, so that I do not need separate editing sessions or hidden tabs.
12. As property staff, I want one Guardar cambios action for contact and stay details, so that related changes save together or not at all.
13. As property staff, I want server billing and availability feedback before saving stay changes, so that I can understand the proposed bill and resolve conflicts.
14. As property staff, I want failed saves to preserve all entered details, so that I can correct or retry without retyping.
15. As property staff, I want background refreshes not to replace my draft, so that ongoing edits are safe.
16. As property staff, I want dirty dismissal and navigation guarded, so that accidental closing does not discard my work.
17. As property staff, I want pending writes protected against duplicate submission, so that repeated clicks or uncertain network responses do not duplicate changes.
18. As desktop staff, I want a centered, compact editing dialog, so that focused edits do not require leaving the reservation.
19. As phone staff, I want a full-screen editor with the same capabilities, so that room and contact editing remains usable on a small screen.
20. As property staff, I want save controls reachable while scrolling a multi-room form, so that long reservations remain practical to edit.
21. As property staff, I want to see subtotal, discount, total, amount paid, and balance, so that I can understand the reservation bill's arithmetic.
22. As property staff, I want the discount visible even when zero, so that its current value and edit affordance are discoverable.
23. As property staff, I want an edit action beside the discount row, so that its limited scope is obvious.
24. As property staff, I want Registrar pago in the financial card, so that received money is recorded separately from adjustments to charges.
25. As property staff, I want outstanding, settled, and credit balances distinguished, so that credit is not mistaken for money owed or a refund.
26. As property staff, I want the current status displayed separately from action labels, so that I can distinguish the reservation's state from what a button will do.
27. As property staff, I want one-click Hacer check-in for a confirmed reservation, so that a routine arrival does not require an additional confirmation dialog.
28. As property staff, I want one-click Hacer check-out for a checked-in reservation, so that a routine departure does not require an additional confirmation dialog.
29. As property staff, I want other status transitions accessible from a menu, so that corrections remain possible without crowding the header.
30. As property staff, I want cancellation confirmed with its consequences and resulting bill, so that inventory release and retained credit are understood.
31. As property staff, I want restoration confirmed and availability validated, so that cancelled inventory is not restored blindly.
32. As property staff, I want direct lifecycle actions to show pending, success, and failure feedback, so that I know whether the change was accepted.
33. As property staff, I want status changes to preserve stay dates and remain independent of payment or assignment, so that lifecycle acknowledgement does not silently rewrite the stay.
34. As property staff, I want the compact calendar dialog to follow the same lifecycle interaction policy, so that status changes do not behave differently depending on entry point.
35. As property staff, I want successful writes to refresh the visible reservation and related views, so that the overview, calendar, and reservation list remain consistent.
36. As property staff, I want the overview limited to the header and two cards for now, so that lower sections do not distract from the current design work.

## Implementation Decisions

- Build on the existing, uncommitted real reservation-page redesign; preserve it as an explicit integration-branch foundation rather than discarding it. No fictional-data prototype route is introduced.
- The header's Editar reserva opens a centered desktop dialog and a full-screen mobile dialog. Reuse existing dialog, field, button, and other shadcn primitives and the current compact editor's validation and billing logic. Retain normal typography, rounding, and dense spacing.
- Contacto and Estadía are visible sections in the same draft. A single Guardar cambios submits changed contact fields and stay/room actions in one existing workflow command, never sequential partial saves. The existing mixed-action API and atomic backend batch support this without schema or contract changes.
- Editing a booking contact corrects its existing record. Creation currently creates a separate record per reservation; equal names/phones are not automatically linked. Do not add search, reuse, replacement, or a prominent shared-contact warning to the ordinary new combined editor. Do not change backend contact semantics or remove cross-reservation cache invalidation safeguards.
- Preserve the distinction between booking contact, staying guests, and declared occupancy. Occupancy remains editable but is not restored to the summary card.
- Preserve room availability/capacity validation, current server billing previews, stale-preview protection, retry-safe command IDs, snapshot-based drafts, field-level server errors, dirty dismissal, router/unload guards, and pending-write guards. Contact typing need not invalidate an otherwise current operational preview; operational changes must be validated.
- Keep the editor footer reachable while the form body scrolls. Cancel/close uses the existing dirty-draft protection. Failed saves keep the whole draft; successful saves refresh relevant queries and close the editor.
- Remove the reservation summary's duplicate edit action. Keep the contact phone link beside the reservation code and the existing compact two-column desktop/stacked mobile summary composition.
- The financial card shows Subtotal, Descuento, Total, Pagado, and the semantic balance. Always show the discount row and place an explicitly accessible Editar descuento affordance beside it. Remove the financial card-wide generic Editar action. Discount editing remains a separate validated workflow; Registrar pago remains a separate received-payment workflow.
- Current status remains informational. A confirmed reservation offers Hacer check-in; a checked-in reservation offers Hacer check-out. These direct actions save without another confirmation, using the same server validation and retry/idempotency safeguards as other workflows. Do not optimistically announce success before the write succeeds.
- Other non-cancellation status corrections are menu actions and save directly; cancellation and every transition out of a cancelled reservation require the existing consequence-aware confirmation and preview. A cancelled reservation must never bypass restoration checks through a direct check-in/check-out action.
- Status actions are outside the new combined editor's save. Replace the legacy calendar editor's status select/draft with the same dedicated lifecycle policy, rather than maintaining two status-changing patterns. Preserve its compact utility-focused editing capabilities and protect any unsaved details from being discarded by lifecycle actions.
- Check-in/check-out do not automatically change dates or require payment or a physical room assignment. Cancellation releases inventory, zeros billable charges, and retains payments as credit; it is not deletion or a refund. Restoration validates current room-type and assignment availability.
- Back always navigates to the canonical Reservations list, including direct detail URLs and calendar-originated detail URLs. Do not consult the originating calendar/list context to choose the destination. Preserve unsaved-change guards.
- No backend, database, migration, credentials, or deployment change is planned. Money remains integer cents and business dates remain timezone-free labels using the property's operational today.
- Implement on a single integration branch using separate local-ticket worktrees. The user explicitly opted out of GitHub ticket publication because implementation is immediate. Keep this spec and task graph local; do not publish issues, push, open a PR, merge to main, or deploy as part of this task.

## Testing Decisions

- User explicitly approved the existing rendered-page/router seam, with actual forms, components, and query behavior running in happy-dom and HTTP responses substituted only at fetch. This is the common seam for page, calendar-dialog, and navigation scenarios; do not introduce component-internal mocks or a new testing framework.
- The user explicitly resumed testing/TDD after an earlier styling-only pause. Use one failing externally observable test, minimal implementation, and repeat per vertical slice.
- Prior art is the existing reservation-page, reservation-dialog, reservations-navigation, and setup/direct-detail suites and their shared browser harness.
- Test contact-plus-stay atomic command submission, visible refresh on success, full draft retention after rejection, validation feedback, stale previews, dirty close/navigation/unload protection, and retry request-ID reuse where affected. These UI tests verify one combined HTTP operation and user-visible outcomes; existing backend transaction tests remain the authority for actual database rollback.
- Test fixed back navigation from calendar-origin, list-origin, and direct detail entry. Test navigation guard behavior without depending on obsolete return-context fields.
- Test the five-value financial breakdown using known cent amounts, zero/nonzero discounts, outstanding/settled/credit balances, discount update refresh, and payment registration access. Do not assert arbitrary CSS class strings or absent retired fields as the principal behavior.
- Test one-click check-in/check-out, disabled/pending feedback, failed-write recovery/retry without duplicate effects, unchanged stay dates, and allowed unpaid/unassigned transitions. Verify cancellation and restoration still require explicit confirmation and handle distinct capacity and assigned-room conflicts.
- Test the matching lifecycle policy through the actual compact calendar dialog, including safe handling of dirty details. Remove/replace stale legacy expectations only when their meaningful protections are retained or explicitly deferred.
- Run affected tests, the full portal suite, pnpm check, and a portal production build with a non-production API origin. Checks do not substitute for tests.
- Manually inspect desktop and narrow-screen dialog layout, body scrolling/footer access, header wrapping, and two-card composition if an interactive browser is available. Report unperformed visual/device checks honestly; happy-dom is not visual validation.

## Out of Scope

- Lower tabs/sections for contact, staying guests, notes, payment records, and account/nightly-price history. Existing editor capabilities need not be deleted, but do not expose unfinished lower sections.
- Payment history, editing/deleting existing payments from this page, Ver pagos, refunds, payment processing, or payment requests. Payment-history corrections are deferred; no inert action should imply they are available now.
- Contact search, matching/deduplication, reuse, replacement/relinking, or a new contact domain model.
- Invoice generation, web check-in, history/audit features, attachments, tasks, or screenshot-only unsupported controls.
- A wizard, hidden editor tabs, inline page editing, side-drawer redesign, or a separate edit route.
- Changes to lifecycle business rules, automatic date adjustments, payment/assignment prerequisites, saved nightly-price policy, or automatic refunds.
- Schema changes, migrations, production configuration, deployments, production releases, and merging the integration PR.

## Further Notes

- This spec records the decisions reached in the reservation-page interaction discussion. The initial single current-status dropdown proposal was superseded by one-click contextual check-in/check-out actions with confirmation reserved for cancellation/restoration.
- The initial shared-contact concern was scoped down after confirming that normal creation makes a new contact record for each reservation. Existing shared-record backend semantics remain unchanged.
- The rendered UI/router seam and resumed TDD were explicitly approved. The user subsequently requested no GitHub ticket publication. This is implementation authorization, not production deployment authorization.
- Existing uncommitted page tests predate several visual/action changes and contain stale expectations. Update them thoughtfully rather than treating all baseline failures as regressions introduced by this spec.
