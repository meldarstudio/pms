---
name: refine-ui
description: >-
  Improve UI from three starting points: refine an existing layout, compose a
  screen from supplied data, or discover the task and content from an early idea.
  Use when presentation feels scattered or unclear, when the user has data but no
  layout, or when they need help figuring out a screen. Preserve explicit layout
  constraints, offer opt-in prototyping for competing directions, and keep
  critique-only requests read-only.
---

# Refine UI

Make the next glance useful. A screen feels organized when its reading order matches the user's task, not when every field has its own box.

## 1. Start from what the user has

Infer the starting point from the prompt and conversation; the user need not name a mode. Respect explicit constraints over the defaults below.

| Starting point | Mode | First deliverable |
| --- | --- | --- |
| An existing UI | Refine | A clearer presentation within its constraints |
| Data, but no layout | Compose | A task-oriented reading order and proposed layout |
| An idea, but neither layout nor data | Discover | A small, agreed screen brief |

### Refine what exists

When asked to keep the layout, preserve section order, columns, navigation and responsive structure. Improve typography, spacing, alignment, emphasis and visual noise within it. If a useful fix needs structural change, explain the tradeoff and ask before crossing that boundary. An unconstrained refinement may regroup content when that improves the task.

### Compose what's known

Inventory the supplied fields, relationships, units and available states. Establish who uses the data and what they need to understand or do; ask only if that purpose remains unclear. Organize facts around the task rather than turning every field into a card. Propose the reading order, sections and relevant actions, then implement if the request authorizes building. Keep unknown calculations, capabilities and business rules explicit rather than inventing them from field names.

### Discover what's missing

Use what the conversation already establishes. Ask up to three focused questions at a time to resolve the essentials: who uses the screen, what they need to accomplish, and what decision or action the screen should support. Recommend minimum content rather than asking the user to design the screen for you.

Finish with a short brief: user, task, necessary facts, relevant actions and unresolved assumptions. Get agreement on that brief before building. Sample content can help exploration once its purpose is clear; label it as illustrative rather than treating it as real data or an approved business rule. If the request stops at discovery, the brief is the deliverable.

All three modes use the same presentation checks. A new screen does not automatically require multiple prototypes. For critique-only requests, provide recommendations without implementing or building a picker.

## 2. Inspect the available evidence

In a project, read the applicable repository instructions, relevant components and shared primitives. For an existing UI, open it in a browser and capture its current presentation when browser access is available. For a new screen, inspect supplied data, constraints and examples instead of searching for a nonexistent baseline. Load the relevant UI-library or browser skill before using it.

Identify the surface from the conversation; clarify only if multiple surfaces remain plausible. Keep the work bounded to that surface and necessary shared components.

Before implementation, identify:

- The user's immediate task and the first question the surface should answer.
- The available facts and authorized actions, including conditional and exceptional states.
- For an existing UI, what competes for attention: equal-weight text, detached labels and values, scattered related facts, repeated borders or equally prominent actions.

Finish inspection with a proposed reading order in one sentence. Distinguish a missing fact from a fact that is already present but hard to find.

## 3. Rank, group and subtract

Read [PRESENTATION-CHECKS.md](PRESENTATION-CHECKS.md). Apply its task-dependent hierarchy and visual-noise pass to the proposed presentation and, when present, the existing surface. Finish when every fact belongs to a group and every emphasis earns its place in the user's task.

### Optional exploration

Implement a clear improvement directly. Removing a redundant icon or reconnecting a label with its value does not need three alternatives.

When materially different layouts remain plausible, explain their task-related tradeoff and offer a prototype comparison. Keep this opt-in: wait for an explicit request or agreement to prototype before loading `prototype`. A critique-only request remains read-only unless the user expands its scope.

After approval, follow [prototype](../prototype/SKILL.md) for the isolated picker, user selection and promotion. Keep the current UI as a baseline when one exists and apply the same presentation checks to each direction. Hold data, state, viewport and surrounding context constant so the comparison reveals design differences. Name any intentional interaction differences as an exploration axis. Return to implementation and verification only after the user selects a direction; do not preselect or integrate a winner.

## 4. Implement within the agreed scope

- Preserve existing facts, commands, layout constraints and editing boundaries. For a new screen, implement the agreed brief; keep speculative capabilities out of the shipped UI.
- Give headings, item values and supporting text distinct roles. Avoid solving hierarchy by making everything larger or bold.
- Choose the anchor from the task: identity, reference, deadline or exception. Give other facts the weight their role warrants.
- Preserve authoritative values and existing formatters; presentation changes should not introduce new calculations or reinterpret states.
- Preserve user-entered text, line breaks and long-token wrapping. Omit empty optional sections instead of adding placeholder noise.
- Establish a clear action priority. Preserve state-dependent primary actions rather than making every button equally prominent.
- Remove redundant controls only when the remaining equivalent control is accessible, discoverable and retains pending-operation protection. Loading/error states still need a way out.
- Reuse existing components and variants. Keep shared-component changes backward compatible and validate their other consumers.
- Preserve accessible names, heading order, focus return, keyboard dismissal, confirmation dialogs, undo, stale-data restrictions and pending-save guards. Keep active interaction state intact across responsive changes.

Add information or interaction only to solve an identified user need; clarity can come from subtraction.

### Example: reservation summary

```text
Guest identity                 strongest heading
  Reservation reference/status secondary context
  Phone                        belongs with the guest

Stay                           dates, then assigned rooms and occupancy
Account                        balance/status first; total, paid and adjustments beneath
Notes                          supporting context, only when present

Actions                        edit and applicable lifecycle action; clear primary
```

This reading order fits a guest-inspection task, not every reservation task. For an account-first task, the balance may lead. Preserve the meaning of debt, zero balance, refunds and coupon adjustments using server-provided values. A summary remains an inspection surface, not a second editor.

## 5. Verify the presentation and the behavior separately

For an existing UI, compare before/after screenshots at the same viewport with the same data, state and surrounding context. For a new UI, evaluate the rendered screen against the agreed task, content and layout constraints; do not invent a before state. Apply the glance test in [PRESENTATION-CHECKS.md](PRESENTATION-CHECKS.md) and explain how the presentation serves the task; fitting on-screen is not enough.

Inspect desktop and phone widths, a short viewport and representative stress content: long names, multiple items, long multiline text and unbroken tokens. Evaluate exceptional as well as ordinary states.

Verify that:

- Related content stays visually connected and secondary text remains legible.
- The correct region scrolls, actions stay reachable and content does not overflow horizontally.
- Missing optional values do not leave awkward gaps or misleading labels.
- Exceptional financial and lifecycle states retain their meaning and controls.

Iterate on the rendered result before declaring the refinement finished. If browser access is unavailable, state that visual validation is outstanding rather than treating DOM tests as visual evidence. Phone-sized emulation does not establish physical-phone usability.

Run affected tests and repository checks according to the repository's instructions. Retain observable facts, accessibility and consequential interaction assertions; update assertions for intentionally changed controls. Leave exact CSS, spacing and nesting to visual verification.

Finish with a short account of the new reading order, a screenshot or local preview when available, and validation results. Separate what was verified from what remains unverified. Leave committing, publishing and deployment to the user's requested scope.
