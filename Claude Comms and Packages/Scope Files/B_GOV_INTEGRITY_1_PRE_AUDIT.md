# B-GOV-INTEGRITY-1 — Step-2 Pre-Audit

**Owner:** CC-A. **Scope:** `B_GOV_INTEGRITY_1_SCOPE.md` (Step-1 APPROVED by Langston, 2026-07-10, msg `1525185070015578133`).

## PREVIOUSLY-STATED-VS-NOW

- **Category pollution — PREVIOUSLY STATED: "a typo'd category is accepted and then invisible." NOW: it already happened, at scale — 9 distinct category strings exist in the live JSONL that are NOT in the 6-member `AlertCategory` type. REASON: the `as AlertCategory` cast (`scripts/system-alerts.ts:169`) has been silently admitting off-taxonomy values since the type was introduced.** This strengthens OBJ-4 and adds a grandfathering requirement (below).

## 1. Counts verified by id-set (Langston Step-1 requirement — NOT `grep -c`)

Last-write-wins per `id` over the JSONL (254 distinct alerts):

| Claim (scope) | Verified | Method |
|---|---|---|
| 254 total distinct | ✅ 254 | id-set |
| 249 resolved | ✅ 249 | state=resolved |
| 249/249 resolves have zero provenance | ✅ 0 have `resolved_at`, 0 `resolved_by_claimed`, 0 `resolution_evidence` | field presence |
| every resolve has a usable identity to backfill | ✅ 249/249 have `acknowledged_by`; **0 have null** | field presence |
| 117 info-severity (never reaches Discord) | ✅ 117 (`warning` 129, `critical` 8) | severity tally |
| governance = 181 (71%) | ✅ 181 | category tally |

**Load-bearing for OBJ-2:** all 249 resolved rows carry a real `acknowledged_by` — so the honest backfill (`resolved_by_claimed = acknowledged_by`) has a genuine identity for every row and never has to invent one.

## 2. NEW FINDING — category taxonomy is polluted, not just at-risk

Live `category` values and counts: `governance` 181, `breakage` 29, `soak_verification` 26, `verification` 5, `one_off` 4, `comms_decommission` 2, then **1 each**: `weekend_restart_verification`, `b46b_soak_analysis`, `scheduled_verification`, `test`, `reorg_b2_1_window`, `tec_selfheal_verify`, `reminder`.

- **Only 3 of the 6 declared type members are actually used** (`governance`, `breakage`, `soak_verification`, `one_off`). `health_check` and `recurring` have **zero** rows.
- **9 values exist in data outside the type**, proving the `as` cast is a live hole, not a hypothetical.

**⇒ OBJ-4 amendment (needs one Langston decision):** validating NEW alerts against an SSOT is unchanged. But the SSOT itself must be *decided*, not assumed — some off-taxonomy values are obviously real categories added ad-hoc (`verification`, `reminder`, `tec_selfheal_verify`) and some are one-off junk (`test`, `reorg_b2_1_window`, `b46b_soak_analysis`). **Two options:**
  - **(A) Broad SSOT** — fold the legitimate ad-hoc ones into the canonical set, leave the junk as grandfathered-historical (validator warns but does not reject existing rows; rejects only NEW off-set values).
  - **(B) Narrow SSOT** — keep the canonical 6 (drop the 2 dead ones → 4), and every historical off-set row is grandfathered; NEW alerts must use the canonical set.
- **Non-negotiable either way:** the validator gates only *new* `addAlert` calls. It NEVER rewrites or rejects the 254 historical rows — retroactively invalidating stored data is the `#495` set-destruction hazard.

## 3. Langston Step-1 refinements folded in (CHANGES-NEEDED-before-close, captured now)

- **OBJ-1 `resolved_by_transport` is code-derived ONLY** — sourced internally from the arrival channel, **never** from `args`/caller. The signature must make a caller-supplied transport *impossible*, or the two-field trust distinction is cosmetic. (Langston Q1.)
- **OBJ-1 `resolution_evidence` is a HARD token gate**, not a non-empty check: it must match a reference-shaped token (`path:line` | 40-hex sha | uuid | doc `§`/`#` ref) **OR** equal a sanctioned sentinel. A non-empty check passes `"looks fine"` — the 249 empties with a word added. (Langston Q2.)
- **OBJ-1/OBJ-2 sanctioned-sentinel SSOT set** `{ NO-EVIDENCE-GIVEN, provenance-unknown-pre-F3b }` — the validator accepts these two literals explicitly. This closes Langston's catch: OBJ-2 backfills `provenance-unknown-pre-F3b`, which would otherwise **fail OBJ-1's own validator** on any re-run. Two sanctioned sentinels in one SSOT, not two free strings that happen to differ (`count-is-not-a-set`, one layer up).
- **Build order: OBJ-4 (category SSOT) → OBJ-3 (delivery keyed on category)** so OBJ-3 routes against the validated set, not the hand-literal it replaces.

## 4. SIM blast radius (system-alerts write path)

- **Writers of `resolveAlert`/`addAlert`:** the CLI (`scripts/system-alerts.ts`), the app's verifier/smoke paths, and the **external** governance-checker (staging systemd timer, `/opt/governance-checker/`, writes `governance` alerts via the local CLI). **The checker calls `resolveAlert` too** — so the new required `--evidence` on the CLI resolve path MUST be given a sane checker-supplied value (the checker resolves its own dedupe'd gaps; its evidence = the commit/doc that closed the gap). **Coordinate with CC-B (B-GOV-INTEGRITY-0):** the checker's resolve call needs an `--evidence` arg or it breaks the moment OBJ-1 lands. This is the one cross-batch seam.
- **Downstream consumers:** §10.5 per-turn check (reads state/ack/triggers — unaffected by new fields), `processResurface` (reads state/fired_at — unaffected), `routes.ts:6628` category consumer (OBJ-4 makes it import the SSOT), the Discord/alert dispatcher (OBJ-3 changes its delivery gate).
- **Helpers to reuse, not re-roll:** `withLock` + `writeAllAlertsAtomic` already give OBJ-5 its atomic+locked write. The Python-bridge lesson (`#495`) does not recur here — this file was already built correctly.

## 5. Open decision for Langston (Step-2)
The OBJ-4 SSOT breadth: **(A) broad** (fold legit ad-hoc categories in) or **(B) narrow** (canonical set only, grandfather the rest). Recommend **(A)** — `verification`, `reminder`, `tec_selfheal_verify` are real recurring categories and forcing them out creates churn; the junk (`test`, `reorg_b2_1_window`) stays grandfathered and simply can't be re-created. Awaiting Langston.
