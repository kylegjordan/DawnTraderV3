# B-SEC-HARDEN — SCOPE (staging security hardening)

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1022` · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 158.

> ⚠️ **WHY THIS FILE EXISTS NOW, ahead of the batch's formal Step 1 (honest note):** a live-reachable
> vulnerability (an anonymous file-download path traversal) was found and closed DEFENSIVELY ahead of
> the full batch, and its commits are tagged `B-SEC-HARDEN (#1022)`. The governance checker resolves a
> batch's change-class from a scope file whose name carries the batch-id; with none, it fail-closed to
> `architecture` and raised alert `3df84e72`. This file declares the class for the work landed so far.
> **The full B-SEC-HARDEN batch gets its proper Step-1 scope + Step-2 audit when it formally starts;**
> this is not a substitute for that. The change-class is amendable (§3.0) if later increments warrant it.

## Change-class rationale
`non_architecture`. The landed work adds a defensive containment utility (`server/services/safe-path.ts`)
and wires it into file-serving handlers. It changes no trading architecture, formula, routing, regime,
strategy, filter or signal-pipeline logic, and touches **no** `CORE_ENGINE_PATHS` file (verified against
`scripts/governance-checker/config.mjs`). Langston reviewed and approved the diff (ruling in `#1022`).

## LANDED (this increment) — the file-download path-traversal containment fix
Three report/download handlers built a filesystem path from a caller-supplied filename; their
`startsWith(prefix)+endsWith(".json")` checks did not stop a name that carries them and still escapes
with `..`. `GET /api/audit/reports/:filename` is anonymous.
- **`server/services/safe-path.ts`** — `resolveWithin(baseDir, name)`: rejects any name with a
  separator, NUL, `..` segment, absolute path or empty value, and asserts the resolved path is strictly
  inside the base. Lexical containment (not symlink-resistant), stated in its docstring.
- Wired into `server/routes/audit.ts`, `server/routes/tlva.ts`, and
  `server/services/file-persistence.ts` (`readFile`/`fileExists`/`getDownloadPath` + both `/tmp` reads);
  `server/routes.ts` download route returns 400 (not 500) on a rejection.
- Tests: `server/__tests__/safe-path.test.ts` (8/8). Coltrane ran an independent `server/` census +
  guard stress-test; Langston re-derived the guard, routes and mount at the ref.
- **NOT deployed** — rides the 10-02 release deploy B (`dt-deploy` ships the whole branch, held for the
  fee-contract window). Deploy timing is Kyle's/CC-B's call.

## REMAINING (scoped fully when the batch formally starts)
- **Route authorization** — `#1022`: 157 of 216 mutating routes carry no authorization guard; the
  `viewer` role does not make an account read-only. (Anonymous `/api/audit/*` incl. `run?mode=deep`
  split off to `B-AUDIT-ROUTE-AUTH`, row 158b; the exhaustive request→filesystem sink census split off
  to `B-PATH-SINK-CENSUS`, row 158a.)
- **Database TLS** — `#1022` (2026-09-30): the app's connections to Supabase are unencrypted; pin the
  root CA and set `sslmode=verify-full`.
- **Two more uncontained request→filesystem flows** — `#1022`: VTS `query.date` (read escape) and
  telemetry `body.mode` (write escape); fix via a central date-contract + `mode` validation with writer
  containment. (Also tracked under `B-PATH-SINK-CENSUS`.)
- **`#1102`** — remove the staging app account's passwordless root (needs Kyle's go; with `#615`, `#924`).
- The `0.0.0.0:5000` bind (defence-in-depth, measured unreachable behind ufw).
