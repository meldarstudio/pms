---
name: dogfood
description: Watch a live portal session and note issues from what the user does and from the API log. Use when the user will use the app while you watch, or asks to dogfood or take session notes.
---

# Dogfood

A **session** is the user using the local portal while you watch the API log and take notes. You do not fix unless they ask.

Serve a production portal preview, not the Vite dev server. React StrictMode there double-fetches, and the log lies. The local API is still the backend dev script: that process is Wrangler, not React.

## Serve

1. If port 5173 or 8788 is already a portal or API from this repo, stop that process. Leave any other listener alone and say so.
2. From the repo root, start the API with `pnpm --filter @pms/backend dev`. Local D1 only. Never remote, never deploy.
3. Build and preview the portal against that API. `pnpm --filter @pms/portal build` runs check; skip it. From `apps/portal`, with `VITE_API_BASE_URL=http://localhost:8788`:

   ```sh
   VITE_API_BASE_URL=http://localhost:8788 pnpm exec vp build
   VITE_API_BASE_URL=http://localhost:8788 pnpm exec vp preview --host localhost --port 5173 --strictPort
   ```

   Port 5173 matches the backend's local `ALLOWED_ORIGINS`. Host is `localhost`. `127.0.0.1` drops session cookies. A built snapshot ignores later code edits; rebuild only if they ask.

**Done when:** http://localhost:5173 and http://localhost:8788 both answer, and one page load does not pair identical GETs.

## Hand off

Tell them the portal URL and point at [local sign-in](../../../AGENTS.md#local-sign-in). Then wait. Read the API log when they speak, not on a poll.

**Done when:** they have the URL.

## Note

Each thing they call out gets a note, tied to a log line or marked client-only.

- What they said is a note even when the log is clean.
- A request per keystroke is a finding.
- Phone and other client checks never hit the API. Say that, then read the form only if they want the cause.
- An unexplained 4xx is a note. Chase it only if they ask.
- Identical paired GETs on this server are real. Wrangler's typegen warning and the local scheduled-worker warning are noise.
- Do not quote `.dev.vars` or hidden bindings.

**Done when:** every call-out has that note.

## Stop

When they say stop, kill the preview and the API, and write the findings: what they asked, what the log showed, what is client-only, what is noise.

**Done when:** 5173 and 8788 are free and the writeup is in the reply. Do not file issues or change code unless they ask.
