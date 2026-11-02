---
name: loading-skeleton
description: Build or adjust a portal loading skeleton by measuring the loaded UI in a real browser and matching the skeleton's sizes and positions to it. Use when adding a skeleton or loading placeholder, or when content shifts as data arrives.
---

# Loading skeleton

A skeleton is done when it is a **tracing** of the loaded UI: same region size, every bar on the line its text will occupy. Trace by measuring both states in a browser; happy-dom tests cannot see geometry.

[Loading states](../../../docs/portal.md#loading-states) owns the rules (the `Skeleton` primitive, `aria-busy`, the Spanish loading label, what stays real). Read it first.

## Steps

1. **App running and signed in.** Start the portal and API per [README commands](../../../README.md#commands) if ports 5173/8788 are not listening. Sign in with a disposable **local** account; create one by piping the password twice:
   `(printf 'PASSWORD\n'; sleep 1; printf 'PASSWORD\n'; sleep 3) | pnpm auth:account <name> --role=staff --local`
   (usernames: letters, digits, `_`, `.`). Local sample data is disposable; use `--local` only.
2. **Scratch Playwright outside the repo.** It is not a project dependency:
   ```sh
   mkdir -p /tmp/skeleton-measure && cd /tmp/skeleton-measure
   echo '{"type":"module","private":true}' > package.json && pnpm add playwright-core
   cp <repo>/.claude/skills/loading-skeleton/{measure,example-driver}.mjs .
   ```
   Launch the system browser (`which chromium`) through `executablePath`; no browser download.
3. **Driver.** Copy `example-driver.mjs` to `driver.mjs` and edit its marked parts: the region selector, the steps that reach the state, a loaded-only text signal, and the read URL to hold. It measures the loaded region, then reloads with that read held behind a gate and measures the skeleton, then prints `compare` (region Δh, then leaves paired in document order with Δy). Run with `PMS_USER`/`PMS_PASSWORD` set, at `1440x900` and `390x844`, plus a screenshot prefix.
4. **Build the skeleton** from the loaded numbers:
   - Mirror the loaded containers: same flex direction, gaps, and padding classes.
   - Keep real whatever does not depend on the read: headings, labels, controls, form-derived text.
   - Replace each read-dependent text leaf with a bar. A text bar is `Skeleton` with `inline-block h-lh align-top` inside an element carrying the loaded text's size class, so it takes that line's height _and keeps its baseline_. A bare block bar in an `items-baseline` row drops to the row's bottom edge.
   - Bar width: the typical loaded width, rounded to the spacing scale.
5. **Iterate** until both widths print `Δh 0` and every bar shows `Δy 0` against the leaf it stands in for. When a pairing looks wrong, check for an extra or missing leaf before nudging sizes; pairing is by order. Then read both screenshots side by side.
6. **Finish.** Run affected tests and `pnpm check`. Delete `/tmp/skeleton-measure`. Report the final `compare` header lines for both widths.
