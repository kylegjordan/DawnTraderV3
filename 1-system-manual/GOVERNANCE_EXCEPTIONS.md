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
| _(none yet — post-cutoff exceptions go here)_ | | | | | |

<!--
input-type ∈ { na-skip | open | umbrella-namespace | umbrella-done | class-override }
confirmed_by ∈ { langston | kyle | langston+kyle }  (cc-declared rows pending confirmation carry confirmed_by = pending)
value: for na-skip = the doc key; for open = "open since <ISO>"; for umbrella-namespace = "owns P19-B6.*"; for class-override = "declared:<class> heuristic:<class>"
One row per declaration. Append-only; supersede with a new row rather than editing history.
-->
