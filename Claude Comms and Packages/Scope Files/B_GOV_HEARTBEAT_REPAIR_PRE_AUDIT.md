# B-GOV-HEARTBEAT-REPAIR — Pre-Implementation Audit (#637)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-08-01
**Scope:** `B_GOV_HEARTBEAT_REPAIR_SCOPE.md`

---

## 0. Honest note on timing

The **census in §2 was run before the edits**; this document was written up immediately after them, in the same session, and is dated honestly. It is not the #605 case (where Step 2 was skipped outright and the near-miss surfaced at Langston's review instead) — but it is not a fully-clean Step-1→2→3 either, and saying so is cheaper than being caught claiming it was.

## 1. Components touched

| component | role |
|---|---|
| `scripts/governance-checker/config.mjs` | **NEW export** `resolveEvidenceOrSentinel()` — pure, no I/O |
| `poller.mjs` · `checkerResolveEvidence()` | **modified** — delegates to the shared helper; keeps its module-scope var |
| `poller.mjs` · the three `saveState` sites (`:532`, `:607`, `:672`) | **modified** — publish `gradedRefSha`; **`null` explicitly on the fetch-fail path** |
| `heartbeat-check.mjs` · `resolveAlert()` | **modified** — takes evidence, returns success, distinguishes terminal from failed |
| `heartbeat-check.mjs` · `checkHeartbeat()` clear branch | **modified** — reads the sha from state; nulls the id **only on success** |
| `poller.test.mjs` | **new fences** |

## 2. Blast radius — measured, not assumed

- **`state.gradedRefSha`** — written by `poller.mjs`, read by **exactly one** consumer, `heartbeat-check.mjs:80`. **Additive field**; every existing reader of that JSON ignores unknown keys.
- **`resolveEvidenceOrSentinel`** — `config.mjs` (definition) · `poller.mjs` · `heartbeat-check.mjs` · `poller.test.mjs`. **All in-family; zero occurrences under `server/`.**
- ⚠️ **ONE OUT-OF-FAMILY HIT, CHECKED AND CLEARED — and it is a lookalike worth recording:** `server/core/governance/governance-persistence.ts:14` defines a constant with the **IDENTICAL NAME `GOV_STATE_FILE`**, which is what my grep matched. **It points at `governance_state.json` under a different directory — a DIFFERENT FILE.** ⇒ **not implicated.** ★ **Matching name, not a matching thing — the same class as `cat` vs `show`, `metadata.dedupe_key` vs the top-level key, and `resolved_by` vs `resolved_by_claimed`. Verified by reading the path, not by trusting the constant name.**
- ⇒ **BLAST RADIUS: bounded to the governance-checker family. No trading-path surface, no DB schema, no server import.**

## 3. ★ The hazard this audit exists to find

**The obvious implementation is wrong in a way nothing would catch.** Importing `checkerResolveEvidence()` into the heartbeat "works" — it compiles, it runs, it returns a *valid sanctioned token* — and it is **useless**, because `gradedRefSha` lives in the poller's memory and is always `null` in the heartbeat process. ⇒ **the resolve would succeed while citing `NO-EVIDENCE-GIVEN` forever**, and nothing would ever fail to signal it. **A green path carrying no information is exactly the failure mode #637 is about**, so shipping it would have reproduced the defect one layer up.

⚠️ **SECOND HAZARD, and it is the one CC-B would have shipped:** persisting the last-known sha unconditionally. `:532` returns **before** the sha is set, so fetch-fail ticks would carry a stale ref forward. **A plausible-but-wrong reference is worse than an honest sentinel** — it survives review precisely because it looks right.

## 4. Risks + disposition

| risk | disposition |
|---|---|
| Removing the `catch` makes a benign terminal alert abort the heartbeat | **Not removed.** Terminal is matched and treated as success; everything else is loud. (CC-A's constraint.) |
| The all-decimal-timestamp token passes the sha shape test | **REAL, and it was live in the first implementation.** `1785485897377` is 13 chars, all in `[0-9a-f]`. **Caught by the fence, rejected explicitly.** |
| Enabling the timer before the fix deploys | **Ordering is HARD and stated in three places:** an armed dead-man with a broken clear path raises an alert that can never be cleared — strictly worse than off. |
| State-file schema change breaks a reader | **Additive only**; single in-family reader; out-of-family hit cleared in §2. |

## 5. Background execution

`governance-checker.timer` (every 30 min) is **enabled and running**; `governance-checker-heartbeat.timer` is **disabled and not scheduled at all** (absent from `list-timers --all`). ⇒ **the poller change goes live on the next tick after deploy; the heartbeat change is inert until deliberately enabled.** That asymmetry is a safety property here, not an accident.

## 6. SIM / System Manual

**SIM:** applicable — the checker's cross-process state contract gains a field; updated at close. **System Manual:** **not** applicable — no trading architecture, strategy, regime, filter, pipeline or math change. Judged explicitly per §9, not skipped by default.
