# B-PAPER-OPEN-ENTRYPOINT-CENSUS — SCOPE

> ⛔⛔ **SUPERSEDED 2026-09-12, THE SAME DAY IT WAS WRITTEN — DO NOT IMPLEMENT ANY OBJECTIVE IN THIS FILE.** The defect claim it is built on is **WITHDRAWN**: the runtime test showed 19 gate refusals of the same pair in 12 hours producing **zero pool rows and zero trades**. See the `#1051` banner in `RUNNING_ISSUES.md`. ✅ **Kept rather than deleted** because its §2 provenance reads (both commits quoted verbatim) and §3 census are still correct and were expensive; **§1, §4 and §5 rest on the withdrawn claim.**

**Batch:** `B-PAPER-OPEN-ENTRYPOINT-CENSUS` · **Issue:** `#1051` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r1** — first draft. The batch NAME is a historical artefact and is kept because the row and the issue already cite it: the census it was named for is **done and came back clean**, and what remains is a fix. Renaming would break two live citations for no gain.

> ⛔ **THE BATCH IS ONE FIX, NOT A CENSUS.** Langston placed the row expecting its first objective to be a repo-wide entry-point census; his own condition was *"if step 1 explains the eight, the row closes on the answer instead of running the census."* It did. **The census result is recorded as evidence, not as work.**

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | The defect is a **second entry point** reaching the paper open without the RR gate; the fix needs a repo-wide entry-point census. | **ONE entry point. The defect is ORDERING inside it.** No census needed. | `rtb_signals` has exactly one insert site, one wrapper caller, one production caller — and that caller sits **423 lines upstream of the gate in the same function**. An enumeration would have returned "exactly one" at every hop, which is the answer a healthy system gives. Filed as `ordering-invisible-to-enumeration`. |
| 2 | The orchestrator normalizer at `:1906` is a **net-neutral bridge awaiting retirement**, so fix (A) would expire. | **It is LOAD-BEARING ON EVERY PATH, and has been since 2026-08-28.** (A) does not expire. | Langston's finding, re-derived by me at `:703-707`: F-G-1's P2 post-round re-check was **deliberately NARROWED** on the stated ground that *"`normalizeAndGateTarget` below re-derives RR, reachability and ordering on the rounded numbers, so those three are already covered."* **Something now depends on it.** |
| 3 | The ordering defect affects the **pattern pool only**. | **It is live for the QUANT path too.** | The grid rebind at `:724-728` rounds the geometry, and the rounding is **directional** (`venue-price-grid.ts:302-304` — entry `nearest`, stop and target by role, i.e. away), so both legs grow and for `R > 1` that moves R **toward 1**, i.e. only ever *down* through a floor. `:1483` sits **between the rounding and the only gate that judges the rounded numbers.** |
| 4 | *"reorg-B3.3 measured the normalizer near-inert on the strategy path — 1 signal across 136,779 evals."* | ⛔ **WITHDRAWN — WRONG OBJECT, MINE.** | The figure is a **code comment** at `strategy-helpers.ts:430` and it measures **the VTS learning engine being strangled under `enforce`** — *"That strangled the VTS learning engine (1 signal across 136,779 evals; rr+reach drops ~95%+)"*. It is **not** a measurement of active-path normalizer liveness and must not be carried as one. Caught by Langston. |
| 5 | Fix = **(A) move the write**, single fix. | **BOTH, staged. (A) ships in this batch; guard-at-birth is a named follow-on.** | Guard-at-birth runs **upstream of the grid rebind**, so it structurally cannot see the rounded geometry and **cannot replace `:1906`.** Two defects, two fixes, two batches (Langston's Q1 ruling). |

---

## 1. THE DEFECT, IN ONE PARAGRAPH

`buildSizedSignalForStrategy` (`signal-orchestrator.ts:548`–`:1989`) writes the signal into the ready-to-buy pool at **`:1483`**, fire-and-forget (`.catch` at `:1484`, no `await`). The universal reward-to-risk gate is at **`:1906`** — the same function, **423 lines later** — and returns `null` on `rr < minRR` (`signal-target-normalizer.ts:101`). **Nothing between them removes the queued row, and the floor is never re-applied downstream of the pool.** So a signal the gate refuses is dropped from the function's *return value* while its pool row already exists, and the pool is what the promotion path opens from — `active-execution-engine.ts:4271`/`:4378` write `takeProfit` straight off `signal.targetPrice`.

**MEASURED CONSEQUENCE (object `closed_trades`; population `asset_class='crypto_spot' AND opened_at >= '2026-09-01'`, n=58, of which 52 carry `intended_entry_price`):** eight trades opened below their own resolved `min_rr` floor — `inside_bar_reversal` 4/4 at R≈1.667 against a floor of **2.00**, `reverse_impulse` 4/4 at R≈1.666 against **2.40**. All eight are `mode='paper'`; **zero VTS**, so reorg-B3.3's `'tag'` exemption does not apply.

---

## 2. PROVENANCE (mandatory 1.b) — CORPORA NAMED, COMMITS QUOTED

**Searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `SYSTEM_MANUAL.md`, `SYSTEM_IMPACT_MAP.md` (§4.1 Signal Orchestrator, §4.3 RTB Service), and `git log -S` **not path-limited** on both symbols. `bridge/canonical/` **not consulted** — both sites postdate the 2026-01/02 governance change, which is itself recorded here rather than left as a silent omission.

### TIER 1 — behaviour this batch changes

| site | introduced | intent, VERBATIM | disposition |
|---|---|---|---|
| the RTB queue write, `signal-orchestrator.ts:1483` | **`3b1691366`, 2025-12-15** (Replit-era agent commit) | *"Integrate SQE signals into RTB pool and delay trading capacity limit / Implement a unified RTB pool, connect SQE signals, and introduce a 100-signal threshold for TCL activation."* ⚠️ **That is the entire message. No design note, and no gate existed to be ordered against** — anything beyond this line is **`INFERRED-FROM-CODE`, not established.** | **(1) still relevant and correct.** Queueing SQE-qualified signals into the pool is exactly what it should do. **Its POSITION became wrong when the gate arrived six months later; the write itself was never wrong.** ⇒ the fix MOVES it, does not change it. |
| the RR gate, `signal-orchestrator.ts:1906` | **`d592c8e29`, 2026-06-20** (reorg-B2 Step-3 chunk 4) | *"Active: buildSizedSignalForStrategy (single, post-strategy, pre-geometry — covers all active sizing emit paths); the lifted/gated target flows into geometry + the sized signal; DROP on RR<minRR (no co-move)."* | **(2) relevant but needs updating to today's intent.** ⭐ **The fix does not change anyone's intent — it makes the gate's own stated intent TRUE.** *"Covers all active sizing emit paths"* was the goal on the day it shipped and **has never held**, because the pool write it was meant to cover already ran. |

### TIER 2 — read or called, intent noted

- **`normalizeAndGateTarget`** (`signal-target-normalizer.ts`) — the pure helper the gate calls. **Unchanged by this batch.** Its floor-LIFT was removed at reorg-B2.1 OBJ-1; it is now pass/drop only. ⭐ **Construction argument, not an absence claim: `:94` is the file's ONLY `targetPrice = ` assignment and all five return arms (`:84`, `:103`, `:109`, `:113`, `:116`) carry that value**, so `_b2Target === rawSignal.targetPrice` unconditionally.
- **`queueSQESignal`** (`ready_to_buy_service.ts:2080`) — *"Queue an SQE-qualified signal into the unified RTB pool… Enforce SQE await before insert."* **Unchanged.** It is the single admission chokepoint and its own `#320` defence-in-depth gate stays as-is.
- **`applyGlobalGuards`** (`strategy-helpers.ts:409`) — the AUTHORITATIVE RR gate, relocated into the strategies by reorg-B2.1 on **Kyle's placement question**, quoted in `SYSTEM_MANUAL:439`: *"a strategy 'would never have produced a signal with a target like that' — so the validations belong where the signal is MADE, not in a post-hoc normalizer."* **Unchanged by this batch** — it is the follow-on's subject.
- **`patternToTradeSignal`** (`pattern-recognizer.ts:570`) — a **second geometry producer**; its docstring declares *"ATR multipliers (1.5× stop / 2.5× target) stay hardcoded; per-class tuning deferred to Layer-3."* **Unchanged by this batch.**

---

## 3. WHAT THE CENSUS RETURNED (evidence, not work)

`git grep` at the ref, tests excluded. **Each list is stated with its size, because an asserted absence needs presence-evidence.**

| hop | members | site |
|---|---|---|
| `rtb_signals` insert sites | **exactly 1** | `storage.ts:4327` (`upsertRtbSignal`) |
| callers of that wrapper | **exactly 1** | `ready_to_buy_service.ts:2407`, inside `queueSQESignal` |
| production callers of `queueSQESignal` | **exactly 1** | `signal-orchestrator.ts:1483` |
| `return null` between the write and the gate's end | **exactly 1** | `:1925`, the gate itself. **Control: 11 in `:548`–`:1483`.** |
| rebinds of `rawSignal` in `:548`–`:1989` | **exactly 2** | `:674` metadata-only, `:724` the prices — **both UPSTREAM of `:1483`**, and **zero** in `:1484`–`:1989` |
| references to `sqeSignalInput` in the file | **4** | `:269` comment, `:1376` construct, `:1483` consume, `:1952` comment — **constructed and consumed, never touched between** |

**Two absences, each with a positive control, because each is load-bearing:**
- Nothing in `:1483`–`:1930` removes or invalidates a queued row — **0** matching lines for `removeSignal|deleteRtb|invalidate|dequeue|removeFromQueue|cancelQueued|rtb`. **CONTROL: the identical pattern over `:1470`–`:1930` returns 2.**
- The floor is never re-applied downstream of the pool — `active-execution-engine.ts` and `ready_to_buy_service.ts` return **0** matching lines each for `normalizeAndGateTarget|getPerClassTargetGate|min_rr|minRR`. **CONTROL: 9 in `signal-orchestrator.ts`, 6 in `xstock_spot/eval-cycle.ts`.**

⛔ **AND THE REASON NOBODY LOOKED HERE IS A COMMENT.** The gate's own text at `:1898`–`:1900` calls it *"the ACTIVE convergence point (SINGLE, post-strategy, pre-geometry/sizing — covers every active emit path that goes through sizing)"*. **That is false with respect to a line in its own function.** ⭐ **A documented chokepoint is a CLAIM ABOUT REACHABILITY, and nothing tests it** (Langston). `#546` absent-as-valid one level up: a missing **coverage** read as complete.

---

## 4. OBJECTIVES

> **Every objective back-references the §2/§3 finding it falls out of. Anything unaudited is flagged `UNAUDITED`.**

### OBJ-1 — Move the RTB queue write to AFTER the reward-to-risk gate
**Falls out of:** §1, §2 TIER-1 both rows, §3 rows 1–3.
**Change:** relocate the `queueSQESignal(sqeSignalInput)` call from `:1483` to after the `_b2Target` assignment at `:1927`, so no signal enters the pool before the gate has judged it. `sqeSignalInput`'s construction stays where it is; only the *consume* moves.
**Why this is safe and not a refactor:** §3 rows 4–6 — the move crosses **one** rejection and **zero** dependencies.
**VERIFICATION:**
- (a) `tsc` at the project baseline, zero new errors in the touched file.
- (b) A unit test that drives a signal with `rr < minRR` through the function and asserts **`queueSQESignal` is never called** — and its **mutation twin**: revert the move, and the same test must FAIL. ⛔ *A test that passes both before and after the fix tests nothing.*
- (c) A second test with `rr >= minRR` asserting the call **does** happen exactly once, so the fix cannot be satisfied by never queueing.
- (d) On staging, after deploy: zero new crypto closes below their resolved floor, read with the §1 query, **denominator printed**.

### OBJ-2 — A regression fence on the ORDER, not on the behaviour
**Falls out of:** §3's comment finding — the previous guarantee was a sentence, and a sentence cannot fail.
**Change:** a test asserting the gate's rejection path is reached with the pool write still un-called, written so that **re-introducing the old order breaks the build or the test**, not a comment claiming it cannot happen.
**VERIFICATION:** the mutation twin in OBJ-1(b) IS this fence; if it cannot be made to fail on the reverted order, OBJ-2 is not met and says so.
⚠️ **Honest limit, stated: this fences THIS ordering, not the class.** A future write added upstream of the gate is not caught. The class-level fix is the follow-on.

### OBJ-3 — Correct the two false claims in the code and the governance
**Falls out of:** §3's comment finding and §0 row 4.
**Change:** (i) `:1898`–`:1900`'s *"covers every active emit path"* — restate to what will then be true, and name the pool write as the path it covers. (ii) `strategy-helpers.ts:407`'s *"the guards run at signal-gen for ALL strategies"* — **false for the pattern branch**; annotate with the exception and point at the follow-on. (iii) `BATCH_CATALOG:383`'s *"net-neutral downstream bridge"* — **true 2026-06-21, false since 2026-08-28**; mark disposition (2).
**VERIFICATION:** each of the three re-read at the ref after the change; the claim and the code agree.

### OBJ-4 — Governance
**Tier-1 unconditional:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1051` closed, or explicitly left open for the follow-on with the reason) · `MEMORY_CC_B` · `PHASE_19_PLAN` row 2.4g-2 · the task-list row (`gov-ledgerrow`).
**Tier-2, judged explicitly and NOT skipped by default:** **`SYSTEM_MANUAL`** — YES, the admission order is architecture (§reorg-B2/B2.1 both describe this gate). **`SYSTEM_IMPACT_MAP`** — YES, §4.1 and §4.3 both describe this seam.

---

## 5. ⛔ WHAT NEEDS KYLE BEFORE ANYTHING SHIPS — IN PLAIN LANGUAGE

**Both fixes have the same live consequence and it is large.** The pattern pool produced **31 of 58** September crypto closes. Its geometry is hardcoded at 1.5× / 2.5× ATR, so **R = 1.667 by construction** — which **fails the crypto default floor of 2.00 and five of the eight seeded per-strategy floors.**

⇒ ⛔ **ON DEPLOY DAY, CRYPTO TRADE FLOW ROUGHLY HALVES.** That is not a side-effect to discover at Step 8. It moves risk and behaviour, so **§5 makes it Kyle's call, not Langston's and not mine.**

⭐ **And it is reorg-B2.3's own failure arriving on a different pool.** That batch exists because a flat 2.5 floor *"over-suppressed the suite — most strategies set ~2.0 RR by design, so a 2.5 floor dropped them wholesale"* (`SYSTEM_MANUAL:431`). **The same thing is about to happen to the pattern pool, for the same reason: a floor is a distributional statement and 1.667 is a constant.** ⇒ **any floor applied to a constant R is an on/off switch for that pool, never a filter.**

**The three options, plainly:**
1. **Ship the fix; accept the flow drop.** Correct, and the pool stops trading until its geometry changes.
2. **Ship the fix AND decide the hardcoded 1.5/2.5 pair first** (`#1051` item (i), already Kyle's scope call) so the pool clears a floor honestly.
3. **Ship the fix and lower the floor** — ⛔ **my recommendation is AGAINST:** choosing a number so the existing 1.667 passes is calibrating the gate to the thing being gated.

**MY RECOMMENDATION: option 2, and the fix ships behind it rather than ahead of it.** The defect is real but it is not losing money today — it is admitting trades at a worse ratio than intended in **paper mode**, where the purpose is to learn. Shipping (1) buys correctness and stops a third of the flow we are trying to gather evidence from.

---

## 6. OUT OF SCOPE — NAMED, NOT SILENT

| item | home |
|---|---|
| Guard-at-birth for the pattern pool (the durable class-level fix) | **named follow-on, this batch's successor** — Langston's Q1: two defects, two fixes, two batches |
| The hardcoded 1.5/2.5 pair | `#1051` item (i) — **outcome 2, Kyle's scope call** |
| `patternToTradeSignal` as a parallel geometry producer | `#1051` item (ii) — **outcome 2, architectural** |
| The `atr > 0` FALSE arm's fourth geometry (1 % / 2 % of price, **R = exactly 2.0, which CLEARS a 2.00 floor on a strict `<`**) | recorded on `#1051`; **invisible to the 28-of-31 measure by construction** — those rows carry no `atr` key |
| `floorPct` dead on the input type | `B-GOV-HYGIENE-ANALYST-1` OBJ-3 Branch B (`#373`) — **§9.4 disposition 5, no new work** |
| `#373`'s normalizer retirement | **does not move; gains a blocking predecessor.** Its premise is dead (§0 row 2). Gate on (a) guard-at-birth shipped and (b) an explicit re-derivation of what judges post-round geometry without the normalizer. **Dependency, not a date.** |
| `dt-review` result cap | `B-DT-REVIEW-RESULT-CAP`, owner Infra Claude, row 4.51b |

---

## 7. ONE DISAGREEMENT WITH THE REVIEWER, RECORDED

Langston reported my control *"17 `detect` matches in `:2650`–`:2760`"* as **12** at the ref. **I re-ran it and get 17 lines and 17 occurrences** — `git show origin/migration/aws-supabase:server/services/signal-orchestrator.ts | sed -n '2650,2760p' | grep -c -iE "detect"`, and the same with `grep -o | wc -l`. ⭐ **His own instrument finding in the same message is the likely explanation: `dt-review grep` caps silently with no marker and no count.** Direction is unaffected either way — the claim is that the pattern branch has **zero**, and both readings agree the quant branch has many. **Recorded rather than quietly conformed to, because a count I cannot reproduce is not a count I should adopt.**
