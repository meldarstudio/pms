# Presentation checks

Use these checks for an existing interface, a screen composed from data, or each prototype direction. They evaluate clarity, not visual personality; distinct layouts can satisfy them in different ways.

## Task-dependent hierarchy

Identify what the user needs to recognize, decide and do. Assign roles before assigning styles:

| Role | Question | Treatment |
| --- | --- | --- |
| Anchor | What matters first for this task? | A clear entry point, without competing emphasis |
| Decision | What state or comparison informs the next step? | Connected facts, readable values, clear action priority |
| Support | What helps without leading? | Quieter but legible context and explanation |

These are reasoning roles, not three required containers. A reference can be the anchor in a lookup workflow; a name can be secondary. A deadline or exception can take priority when the state changes.

Group related facts, keep labels near values and preserve comparisons between repeated items. Use a consistent type and spacing scale, with greater separation between groups than within them. Keep useful whitespace rather than filling it with extra data.

Adapt to the surface:

- **Dense table:** preserve row/column comparisons, aligned values and scanability. Use headers, grouping and restrained exceptions rather than converting each row into a card.
- **Form:** prioritize the current input task, dependent fields, understandable errors and the next action. Keep labels and necessary guidance legible.
- **Summary:** connect subject, relevant state and next action. Detailed supporting facts can recede without disappearing.

## Visual-noise pass

Inventory existing as well as proposed icons, badges, borders, backgrounds, large text and motion. For each treatment, ask what becomes harder to recognize or use if it is removed.

- Retain icons that improve recognition, distinguish states or identify an action. A decorative status icon can disappear when the text and existing treatment already communicate the state clearly. Keep accessible names and non-color state cues.
- Spend strong color on meaningful state or priority, using the project's semantic tokens. An ordinary settled state should not compete with an actionable exception merely because both have badges.
- Use borders and surfaces to explain boundaries. Remove repeated framing that separates related facts or turns every value into a contestant.
- Reserve the strongest type for the task's anchor and important decisions. Secondary content stays readable; quiet is not low-contrast or tiny.
- Make the primary action apparent in the current state. Keep a redundant control only if it adds useful discoverability, reachability or accessibility.

Finish with a reason for each retained emphasis. Prefer fewer competing signals, not universal minimalism: preserve helpful redundancy in urgent, unfamiliar or accessibility-sensitive interactions.

## Before/after glance test

When an original exists, compare it with the proposed presentation at full size using identical data, state, viewport and context. For a new screen, judge the proposal against the agreed task and content rather than inventing a baseline. For prototypes, include the current design when available and keep the same conditions across directions. Inspect desktop and phone sizes separately.

For each, answer:

1. What catches the eye first, and does that match the user's task?
2. Where is the important state, and what might distract from or obscure it?
3. Is the next action obvious and appropriate to that state?

Name the improvement and its cost: easier scanning may use more height; denser presentation may weaken grouping. Reconsider a change that only looks more decorated without improving those answers.

This is a qualitative judgment, not a measured usability score. Verify geometry and interaction behavior separately. Screenshots cannot prove usability, and DOM tests cannot prove hierarchy.
