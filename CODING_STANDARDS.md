# Coding standards

These standards cover judgment calls in code review. Formatting, lint rules, and
type checks live in the tool configuration described in [README.md](README.md#tool-configuration).

## Tests

Each test should protect a concrete failure that matters to users or callers.
Judge tests by the confidence they add and their maintenance cost. Test counts
and coverage percentages are diagnostic information, not targets.

- Test observable behavior through the relevant interface. Backend API tests
  should exercise real routes and database behavior. Database tests should
  protect the business-rule triggers directly. Frontend interaction tests
  should exercise the real forms or components.
- Keep helper tests for substantial logic or behavior that other tests do not
  adequately cover. A helper having its own function or file is not enough
  reason to give it a separate test.
- Preserve coverage for billing, payment retries, atomic saves, availability
  conflicts, date boundaries, draft preservation, and stale previews.
- Use expected values from known examples or business rules. Avoid assertions
  that recalculate the result using the same logic as the implementation.
- Prefer observable results over internal call counts, exact schema shapes, or
  the absence of retired fields. Keep internal checks only when they protect a
  specific failure that observable checks would miss.

### Frontend scope

Keep the portal suite small and risk-focused: reservation creation and edits,
money and retry safety, availability conflicts, date boundaries, authentication,
and protection against lost drafts. Reuse existing screen/form suites and the
shared browser harness before adding another integration suite.

- Cover a workflow's happy path and consequential failures. Use representative
  UI cases rather than every combination of equivalent inputs; keep exhaustive
  cases for substantial money, date, or availability logic in lightweight tests.
- Test shared behavior once through its real form, with screen-specific checks
  only for distinct wiring or behavior. A helper or component does not need its
  own suite when that behavior is already covered.
- Check visible values, actions, errors, and accessibility behavior. Leave CSS
  classes, exact nesting, and visual polish to manual review.

### Consolidating or removing tests

- Merge duplicate scenarios and share repetitive setup when the resulting test
  remains easy to read. Parameterize variations of the same rule and give each
  case a name that identifies the failure.
- Keep distinct failure cases identifiable. Restoration blocked by an assigned
  room and restoration blocked by room-type capacity need separate cases.
  Avoid long scenarios that combine unrelated behavior.
- For each removed scenario, identify the retained test that covers its
  meaningful behavior, or explain why the check adds little confidence. Put
  this reasoning in the review or change description rather than a permanent
  inventory of tests.
- A passing reduced suite alone does not prove that a deletion is safe. Review
  the removed assertions against the remaining tests and relevant application
  code, then run the affected tests and repository checks.

## Documentation

Agents are the primary audience. `AGENTS.md` files route tasks to context; the root
README owns setup, command usage, and tool configuration. Package READMEs index
focused guides for behavior and operations. The glossary owns business terms;
ADRs preserve consequential architectural trade-offs.

Update affected documentation in the same change as behavior, contracts,
configuration, or operational procedures. During review:

- Check the relevant guide against the final code, tests, scripts, and config.
  State actual behavior and known limitations precisely. Do not describe a bug as
  an intended business rule or promise guarantees the implementation lacks.
- Keep each detailed rule in one authoritative topic. Replace repeated explanations
  with links, and update inbound links and heading anchors when moving a section.
  Verify repository links and code paths manually as part of review.
- Prefer pointers to versions and other simple config facts over copied values.
  Include exact commands where they make a procedure executable, with working
  directory, prerequisites, effects, and a checkable completion condition.
- Rewrite current guidance when a decision changes. Remove superseded instructions
  and task-specific branch, approval, publication, or testing history. Git retains
  old drafts; preserve useful compatibility reasoning in clearly historical notes.
  Create ADRs only for durable architectural trade-offs.
- Read the relevant package guidance for cross-package changes. Verify both backend
  schemas and portal types/callers for API changes; keep business vocabulary aligned
  with the glossary.
- Record dated operational reports in [operational status](docs/operations-status.md),
  with provenance and verification limits. Keep private evidence outside Git.
  A source review does not establish deployed versions, applied migrations, token
  permissions, or recoverability.

A documentation-only change needs reference review and formatting validation.
Run the affected tests and `pnpm check` for code changes under the existing policy.
