# GOVERNANCE_EXCEPTIONS — declarations & exception ledger (B-GOV)

> **Purpose:** the single, machine-greppable audit trail for the FOUR self-declared inputs the governance-checker keys off, plus legitimate-skip (N/A) confirmations. Kept here (not in CHANGES_AND_FIXES) so the checker can parse it deterministically and so the record survives independent of the §10.5 alert queue. Created by B-GOV (2026-06-17).
>
> **Why this exists:** every self-declared input is a soft spot (the same sessions being governed declare them). Recording each declaration here makes (a) the audit trail durable + greppable, (b) the stale-open-state cross-check (C3) implementable — the checker greps this file for open-declarations and flags ones past the 48h backstop, (c) repeat-skip patterns (Item 3) visible.

## How the checker uses this file
- **N/A skip:** when a required doc is marked N/A, the checker keeps the gap alert ACTIVE until a confirmed row appears here. A row with `confirmed_by` = `langston` (or `kyle` for three-way) clears it.
- **Open-state:** a batch declared OPEN (timer-suspended) must have an `open` row here; the checker flags an `open` row older than 48h (OPEN_STATE_BACKSTOP_HOURS) with a "still open?" route to Langston.
- **Umbrella namespace:** an umbrella declares the sub-batch namespace it owns here; the checker won't expect a roll-up report from the umbrella until it's declared `umbrella-done`, and rejects `umbrella-done` while any sub-batch in the namespace is still open or has an active gap.
- **Class override:** a declared change-class that differs from the path-heuristic's expectation (Obj-12) is recorded here with the rationale.

## Tiering (Item 3)
- **Langston-alone** confirms an N/A that AGREES with the config (a CONDITIONAL doc marked N/A).
- **Three-way (escalate Kyle)** for an N/A that OVERRIDES a REQUIRED doc (esp. SYSTEM_MANUAL/SIM on an arch batch), or a repeat-skip pattern of the same doc across batches.

---

## ★ Grandfather cutoff (B-GOV-3 Obj-1, 2026-06-20)
**Decision:** the checker does NOT retroactively enforce on batches that CLOSED before it went live. The 2026-06-19 flood (88 `info` alerts on P19-B1/B2/B3a/B3b/B4a, B-NEW-22, B67.1, and others) was exactly this — historical batches closed under older rules being graded against the new doc-set. **Mechanism (B-GOV-3 Obj-1, to implement):** a cutoff (date or commit) in `config.mjs` so only batches whose code-push is AFTER the cutoff are graded; everything before is grandfathered with no per-row seeding required. This ledger then holds only genuine POST-cutoff exceptions going forward. Cutoff value + Langston confirm = Obj-1 close. Until implemented, the timer stays disabled (no retroactive flood).

## Ledger

| timestamp (UTC) | batch-id | input-type | value | confirmed_by | reason |
|---|---|---|---|---|---|
| 2026-06-25T10:36:03Z | B-NEW-40 | class-override | declared:non_architecture heuristic:architecture | langston | B-NEW-40 = the System-Alerts / soak-verification OBSERVABILITY infrastructure batch (non_architecture). The "architecture" default came from the checker mis-parsing 2026-06-25 soak-follow-up commits that LED their subject with "B-NEW-40" (e.g. "B-NEW-40 soak finding…") as a fresh batch close. Root parser fix homed at RUNNING_ISSUES #350 → B-GOV-4. |
| 2026-06-25T10:36:03Z | B-NEW-40 | na-skip | system_manual | langston | non_architecture → System Manual not required. The 2026-06-25 follow-up commits (soak RUN + homing #349 to a RUNNING_ISSUES entry + one SIM S18 cross-cutting-registry row) touch ZERO engine/strategy/regime/signal-pipeline/math. Langston-alone (AGREES with correct config — not the arch-override three-way tier). Alerts 90ace091 + 8dbd9524 resolved. |
| 2026-06-25T14:02:42Z | B-GOV-4 | open | open since 2026-06-25 (queued, not yet executed) | pending | B-GOV-4 is a FUTURE/queued governance-tooling batch (the home for the #350 checker parser-fix) — it has NOT been started, so its doc-set is legitimately absent. The checker graded it because the batch-id appears MID-SUBJECT in two reference commits ("…concretize #350 B-GOV-4 home", "…parser-fix at #350 → B-GOV-4") — confirming the #350 parser matches batch-ids ANYWHERE in a subject, not just leading (the commits documenting the bug triggered it). Declared OPEN to suppress the doc-gap until the batch actually runs. 8 false alerts resolved (3b767e20, 1cba23d8, 53412fa2, 8af08dd9, fe15055b, aa92cb28, c3660062, 7f52bf1d). |
| 2026-06-25T14:30:00Z | B-TEC-SELFHEAL | open | open since 2026-06-25 (in-flight, Kyle-greenlit) | pending | B-TEC-SELFHEAL is an IN-PROGRESS Phase-19 sub-batch (Kyle-greenlit 2026-06-25) running the full 11-step workflow — the TEC config self-heal (refresh-before-throw) + per-class VTS exit-loop isolation fix (supersedes the mis-scoped #349 / B-XSTOCK-TEC-WARMUP). Declared OPEN so the checker suppresses the doc-gap (pre_audit/completion_report/etc.) until the batch CLOSES with its full doc-set. **✅ CLOSED 2026-06-25 — full doc-set landed** (scope + pre_audit + completion_report + BATCH_CATALOG + PHASE_19_PLAN + RUNNING_ISSUES #349 RESOLVED + SIM + System Manual TEC content); the open-state is discharged. |
| 2026-06-25T16:10:00Z | B-TEC | open | PHANTOM id — never a real batch | langston+cc-a | **"B-TEC" is a PHANTOM batch-id, NOT a real batch.** The #350 parser TRUNCATED the multi-hyphen `B-TEC-SELFHEAL` commit subjects to the fragment `B-TEC` and graded it as a fresh architecture batch → 7 false alerts (scope/pre_audit/completion_report/batch_catalog/phase_history/sim + change-class-undeclared). No standalone `B-TEC` exists in BATCH_CATALOG / PHASE_HISTORY / git — the REAL batch `B-TEC-SELFHEAL` is CLOSED with a complete doc-set (row above). Langston gov-triage independently confirmed + resolved `2e11e3f9` (phase_history); CC-A resolved the other 6 (`2ee35208`, `118c3897`, `3c58478b`, `0c96891b`, `28e5780f`, `edacf21b`). Declared OPEN to suppress. **This is a SECOND, distinct #350 failure mode (multi-hyphen-name TRUNCATION, on top of the mid-subject match) → folded into B-GOV-4's scope.** |

<!--
input-type ∈ { na-skip | open | umbrella-namespace | umbrella-done | class-override }
confirmed_by ∈ { langston | kyle | langston+kyle }  (cc-declared rows pending confirmation carry confirmed_by = pending)
value: for na-skip = the doc key; for open = "open since <ISO>"; for umbrella-namespace = "owns P19-B6.*"; for class-override = "declared:<class> heuristic:<class>"
One row per declaration. Append-only; supersede with a new row rather than editing history.
-->
