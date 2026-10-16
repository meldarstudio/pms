# Issue tracker

Issues and specs live in GitHub Issues for `meldarstudio/pms`.
Use the `gh` CLI from the repository root.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add label filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."`
  or `--remove-label "..."`.
- Close: `gh issue close <number>`.

Write multiline bodies to a temporary file and pass `--body-file`.

When a skill says to publish to the issue tracker, create a GitHub issue.
When it says to fetch a ticket, read the issue and its comments.

## Pull requests as a triage surface

PRs as a request surface: no.

GitHub issues and pull requests share numbers. When a reference is ambiguous,
try `gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding

For `/wayfinder`, use one map issue labelled `wayfinder:map`.
Keep Notes, Decisions-so-far, and Fog in its body.

Link child tickets through GitHub sub-issues. If unavailable, maintain a task
list in the map and put `Part of #<map>` at the top of each child.
Label children `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, or `wayfinder:task`.

Use native GitHub issue dependencies for blockers. If unavailable, put
`Blocked by: #<number>` at the top of the child body.
A child is unblocked when all blockers are closed.

Choose the first open, unassigned, unblocked child in map order.
Claim it with `gh issue edit <number> --add-assignee @me` before other writes.
To resolve it, comment with the result, close the child, and append a short
finding with a link to the map's Decisions-so-far.
