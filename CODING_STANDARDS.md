# Coding standards

These standards cover judgment calls in code review. Formatting, lint rules, and
type checks live in the root `vite.config.ts` and package configs.

## Tests

The suite is a tripwire, not a specification. A test earns its place only when
its failure means one of these:

- **Money**: a wrong charge, refund, coupon, bill, or balance.
- **Inventory**: a room double-booked, or sold while full or closed.
- **Access**: a route, token, or record reachable by someone it should refuse.
- **Data**: a retry saved twice, a partial save, a draft lost after a failed
  save, or a migration that changes production rows.
- **Core flow**: a guest cannot book and pay; staff cannot create, edit,
  check in, or cancel a reservation.

Leave everything else to types, lint, and manual review: copy, layout, focus,
logging, validation matrices, and variations of a rule a kept test already
trips on. When a change adds a test, name the failure it trips on; when none
of the five applies, the change ships without one.

- Write one test per failure, at the cheapest layer that catches it: price and
  bill math in `lib` unit tests, business-rule triggers in `db` tests, and
  everything else through the real routes. A rule covered at one layer is not
  repeated at another.
- Parameterize only cases that fail for different reasons. One representative
  stands for a class of equivalent inputs.
- Take expected values from known examples or business rules, never from the
  implementation's own logic.
- Assert observable results: responses, saved rows, visible values. Exact
  error-message assertions stay only where another package maps the message.
- Delete a migration's upgrade test once that migration is applied in
  production; it can never fail again.
- Keep `pnpm test` under one minute. Past that, delete or merge before adding.

### Frontend scope

The backend enforces every rule, so portal and website tests cover only what
the browser alone gets wrong: a save sent twice, a stale price or preview shown
as current, a draft lost after a failed save, and a core flow that no longer
completes. Cover each risk once, through an existing screen suite or the
website's pure `checkout-flow` reducer. Playwright covers only journeys that
need a real browser and backend: book, pay, recover a payment, and file a
complaint.

### Removing tests

A test that trips on none of the five failures is deleted without a
replacement. For any other removal, name the kept test that covers the same
failure in the change description, then run the affected tests and
`pnpm check`.

## Documentation

Code is the docs. During review:

- Put feature behavior in names and types, with tests for the risks listed above.
  Use `docs/adr/` for durable architectural trade-offs, not walkthroughs.
- Keep `AGENTS.md` and `docs/agents/` focused on pointers, guardrails, and gotchas
  that are hard to discover from code. Verify links and code paths in changed
  instructions; flag feature summaries and changelog entries.
- Keep business vocabulary aligned with the glossary; update it in the same change
  when a term's meaning changes.
- Linted code has no comments except tool directives. `pms/no-comments` enforces
  this. Put non-obvious reasons and hazards in names, types, and tests. During
  review, flag hazards that the code doesn't make visible this way.

Run the affected tests and `pnpm check` for code changes.
