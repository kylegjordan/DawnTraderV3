# B-GOV-INTEGRITY-1 — Scope

change-class: architecture

**Owner:** CC-A (Claude Old). **Due:** 2026-07-12. **Reviewer:** Langston (Step-1 scope, Step-2 pre-audit, Step-4 diff, Step-8 second-pass).

**Origin:** Kyle directive 2026-07-10 — "our system is broken because it has allowed all of these things to happen… acknowledged and just falsely verified and pushed to the side as completed." Three-way consensus program; this is the CC-A workstream that ships the resolve-provenance and delivery-integrity half. Sibling batches: B-GOV-INTEGRITY-0 (CC-B, checker frozen-rulebook, prerequisite), B-LANGSTON-QUEUE-2 (CC-A, bridge/queue), B-GOV-INTEGRITY-2 (CC-B, close-gate).

**Absorbs** B-ALERT-TAXONOMY (RUNNING_ISSUES #38): the class-driven delivery objective below is that work.

---

## The defect, in one line

An alert can be marked `resolved` with **no record of who resolved it, when, or on what basis** — and 249 of 249 historical resolves have exactly that emptiness. `resolveAlert` (`server/services/system-alerts.ts:322`) sets `found.state = 'resolved'` and writes nothing else that answers *"was this legitimately closed?"* That is Kyle's complaint in the data: closure is an assertion, not a record.

Kyle's decision on this (2026-07-10, verbatim): *"for closing anything… we must record why it was legitimate, and there should probably be references to documentation that shows why it's legitimate."*

---

## Objectives (numbered, each independently verifiable)

### OBJ-1 (F3b — SHIP FIRST) — resolve provenance, two honest fields + evidence

**Add to `SystemAlert` (`system-alerts.ts:55`):**
- `resolved_at: string | null` — ISO-8601, set when state → resolved.
- `resolved_by_claimed: string | null` — the identity the caller passed (`--by`). This is a CLAIM, named as one.
- `resolved_by_transport: string | null` — the channel the resolve arrived through (CLI / dispatcher / API), stamped by the code, not the caller. Two fields because the caller's self-report and the verifiable transport are different trust levels — conflating them is how a claim launders into a fact.
- `resolution_evidence: string | null` — REQUIRED free text answering *why the close is legitimate*, and it MUST contain either a re-derivable reference (a `path:line`, a commit sha, an alert id, a doc section) OR the literal token `NO-EVIDENCE-GIVEN`. No silent empty.

**`resolveAlert(id, by, evidence, transport)`** sets all four. **The CLI `resolve` subcommand (`scripts/system-alerts.ts`) requires `--evidence`** and fails loudly without it (no default, no empty string).

**Verification:** a resolve without `--evidence` exits non-zero and changes nothing; a resolve with evidence writes all four fields; re-reading the JSONL shows them.

### OBJ-2 — historical backfill, NEVER fabricated

The 249 existing resolved rows get `resolved_by_claimed = acknowledged_by` (the only identity we actually have) and `resolved_by_transport = "provenance-unknown-pre-F3b"` and `resolution_evidence = "provenance-unknown-pre-F3b"`. **We do not invent a `resolved_at`** — it is set to the existing `acknowledged_at` if present, else `null`, and the backfill records that it is a reconstruction, not a measurement. A migration that fabricates provenance to look complete would be the exact disease.

**Verification:** row count conserved (JSONL `set(before) == set(after)` by id, not `len`); every pre-F3b resolved row carries the honest sentinel; zero rows carry a fabricated timestamp.

### OBJ-3 — class-driven delivery (absorbs B-ALERT-TAXONOMY #38)

`info`-severity alerts currently never reach Discord (117 of 254). Delivery is severity-gated when it should be **class-driven**: a `governance` or `breakage` alert must deliver regardless of severity; a routine `info` health check need not page. Introduce delivery rules keyed on `category`, not `severity` alone, so a governance alert cannot be silent because someone filed it `info`.

**Verification:** a synthetic `governance`/`info` alert delivers to Discord; a synthetic `health_check`/`info` follows the routine rule; both asserted against the actual dispatched set.

### OBJ-4 — SSOT category validation in `addAlert`

`scripts/system-alerts.ts` casts `requireFlag(args,'category') as AlertCategory` — a type assertion, not a check — so a typo'd category is accepted and then invisible to any consumer keyed on the real set (`routes.ts:6628`'s `CATEGORIES` omits `governance`, 181 rows / 71%). Validate `category` against a single exported SSOT set in `addAlert`; reject unknown values loudly; make `routes.ts` import the same set instead of a hand-maintained literal.

**Verification:** `addAlert` with a bogus category throws; the `governance` category is visible to the route that lists categories; one SSOT, imported in both places.

### OBJ-5 — JSONL migration safety

The backfill (OBJ-2) rewrites the alert JSONL. It MUST: pre-hash the file (sha256), write temp → fsync → atomic rename (the file already has `writeAllAlertsAtomic` + `withLock` — use them, do not hand-roll), conserve the id set exactly, and log a content-conservation summary (254 → 254). No delete path.

**Verification:** pre/post id-set diff empty; file parses; the pre-hash is recorded in the completion report.

---

## Out of scope (explicitly)
- The checker frozen-rulebook (B-GOV-INTEGRITY-0, CC-B).
- The Langston queue/bridge (B-LANGSTON-QUEUE-2, CC-A).
- The close-gate that RE-RUNS a batch's acceptance evidence (B-GOV-INTEGRITY-2, CC-B) — this batch records provenance; it does not re-execute verification.
- Auto-resolve / stale-ack detection (B-ALERT-LIFECYCLE, CC-B).

## Governance (Step-10, applicable set)
Tier-1: BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#38 absorbed, #447 resolved-by-this, #493 cross-ref), MEMORY_CC_A, completion report. Tier-2: SYSTEM_MANUAL (the alert schema + the two-field trust model is architecture), SIM (SystemAlert shape + delivery routing changed), CHANGES_AND_FIXES, STORAGE_POLICY if retention of the new fields matters (it does not — same row).

## Non-negotiables carried in
- No fabricated provenance, ever (OBJ-2).
- `resolution_evidence` required or the literal `NO-EVIDENCE-GIVEN` — no silent empty (OBJ-1).
- Row-set conservation by id, not by count (OBJ-5) — `len` is not a conservation check (#495).
- Test on the `C:\dev` bench (tsc baseline + vitest) before push; Langston Step-4 on the diff before push; CI 4-green before close.
