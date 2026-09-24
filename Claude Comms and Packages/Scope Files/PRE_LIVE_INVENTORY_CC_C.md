# PRE-LIVE INVENTORY — CC-C (ANALYST Claude) LANE CHECK

**For:** NEW Claude (coordinator), then Langston and Kyle. **Read against:** `PRE_LIVE_INVENTORY_DRAFT.md` at `10df5589e`, plus `PHASE_19_PLAN.md`, `RUNNING_ISSUES.md`, `CHANGES_AND_FIXES.md` and the code at the same ref.
**Scope:** every draft line that names CC-C (113 lines; 51 with CC-C in the owner cell), plus the items in my lane the extraction could not reach.
**Method:** each correction below cites the object it rests on. ⚠️ **Limit, stated:** the HELPFUL and AFTER rows not named below keep the drafted bucket — I agree with them, but did not re-derive each one this pass.

---

## 1. THE QUESTION YOU ASKED: DID `#935` SHIP? — YES. PRUNE IT AS DONE.

- **Shipped 2026-08-28 as `0e5ad6d62`** (hotfix r2, on top of `b1a8cdf72`). Langston approved it at the ref. The deploy went out on a *cancelled* CI run; the 4/4 re-run on the deployed sha discharged that. Record: `CHANGES_AND_FIXES` FIX-2026-08-28-A.
- **Still in the running build today.** `0e5ad6d62` is an ancestor of the deployed `bc199185e` (`git merge-base --is-ancestor`, true). `server/index.ts:175` reads `app.set('trust proxy', 2);` at that sha. Staging `dist/BUILD_SHA` = `bc199185e…`, and `dist/index.js` carries `trust proxy`.
- **Verified live at the time:** one deliberate login returned HTTP 200 after the restart.
- **Its two residuals already have homes, so nothing is lost by pruning:**
  - `#936` — `resetRateLimiter()` never runs on staging. Kyle homed it to Phase 16 (`POST_AUDIT_ROADMAP` §16.9).
  - The `0.0.0.0:5000` bind. Since the fix, the forgery resistance rests on ufw. Homed at `B-SEC-HARDEN`, owner CC-A.
- ⚠️ **Its `RUNNING_ISSUES` header still read OPEN.** I closed the header in the same commit as this file — ledger hygiene, no change of substance.

---

## 2. MUST ROWS — CORRECTIONS

| draft row | draft says | should say | evidence |
|---|---|---|---|
| **1** `B-LEGACY-LIVE-EXIT-PATH` `21.1.a` `#953` | owner `—` | **owner CC-C** | `#953` header: *"OWNER: CC-C … added as an item to `B-INTENT-ENTRY-PARITY` / plan row 3h"*. |
| **4** `21-3c` `#734` | owner `—` | **owner CC-C** | `#734`: *"TABLED TO PHASE 21, as roadmap item 21-3c … to be fixed BEFORE live is enabled. Owner CC-C."* |
| **15** `B-KILLSWITCH-DENOMINATOR` `4.b` `#618` | owner **Kyle** | **owner CC-C** — Kyle PLACED it; he does not own it | `PHASE_19_PLAN` row `4.b`: *"Owner CC-C"*, *"PLACED HERE BY KYLE, 2026-08-30"*. |
| **18** `B-SIZING-DEC-RESTORE` | ⏳ | **⏳ — HALF-LIVE.** obj-1 (fixed-notional sizing), obj-10 and obj-11 are LIVE at `213e162dc` and **size every trade today**; obj-2/3/4/5 and Steps 4-11 are not built. ⚠️ The row's *"20% where the governed decision says 6.67%"* predates obj-1 — **re-read it before Kyle sees it.** `#666` has its OWN home (*"its own batch, scoped after B-SIZING-DEC-RESTORE closes"*), so it should not ride this row. | `GOVERNANCE_EXCEPTIONS` open row 2026-09-12 (`08e8a535d`); `#666` HOME line. |
| **24** `B-PRICE-SIDE-BY-JOB` `3n` | *"open by design until the xStock **paper** increments land"* | **The paper halves are LIVE** — `8a-P2`, `8a-P3`, `8a-P4a`, and `8a-P4b` with C1. **What remains of the umbrella's own work is `8a-P4c` (VTS xStock).** Increment 1 is deployed and in its window to 2026-09-30T00:00Z; rules A-D then fix increments 2-3. **Bucket opinion:** the umbrella's remaining own work is HELPFUL (learning lane). Its MUST content is already listed separately (`3n.l`, `3n.m`, `3n.p`, `3n.q5`, `3n.q7`, `3n.q8`). | Plan row `3n` status cell (re-justified 2026-09-22); progress report §9-§9.2. |
| **28** `B-XSTOCK-LIVE-FEED` `3b.e` ⚠️ verify | ⚠️ | **Confirmed still open, and NOT absorbed into `3n`.** `3n` r5 absorbed `3c`, `3b.d`, `3b.h-1`, `3b.f-a`, `3b.f-b`, `3b.l` — **not `3b.e`**. MUST agreed: the xStock trading feed became one without a decision. | Plan row `3n` r5 absorb list; row `3b.e`. |
| **30** `B-OHLC-FRAME-GUARD` `3b.h-6` | ⏳ | **NEARLY DONE:** deployed `29cce1076` 2026-09-11, Step 4 approved r2, CI 4/4. **Paused at Step 7; only the on-screen panel check is left.** | My state record; batch record. |
| **42** `row:3h.b` ⚠️ verify | ⚠️ | **Confirmed a separate named item** (Langston-ruled 2026-08-29), decidable without `3h`. It is a second exit-decision implementation that never imports `evaluateTECExit` and reads a third price source. MUST agreed. | Plan row `3h.b`. |
| **52** `B-MODE-PREDICATE-SWEEP` `#736` | ⏳ | **Still to do, and it has NO plan row.** It carried a dated "due 2026-09-11" home under the old convention and was never placed. **Needs a placement in the reorganisation.** | `grep` of `PHASE_19_PLAN` and `BATCH_CATALOG`: no match. |
| **58** `#935` | ⏳ | **DONE → PRUNE.** | §1. |
| **3** `P19-B6.10` | owner `?` | Not mine. **`#633` should MERGE into it** (see §3). I can take the `#633` half. | `#633` HOME: *"fold into the #400 legacy-guardrails retirement batch"*; `#400` HOME = `P19-B6.10`. |

---

## 3. WRONGLY PRUNED — "BY THE ISSUE'S OWN WORDING" DOES NOT HOLD FOR THESE

**Each one's own text says it is open.** Two are risk boundaries.

| item | draft says | should be | evidence |
|---|---|---|---|
| **`#634`** — the daily-loss evaluator's failure counter | pruned, "withdrawn" | ⛔ **MUST (C. risk controls), owner CC-B.** When the kill-switch evaluation throws, it is counted and logged, **and no code can read the count**. A persistent fault stops the daily-loss kill switch evaluating **while trading continues**. That fails open on a risk boundary. | **Re-derived at the ref:** `git grep getDailyLossEvalStats` returns only its own definition (`server/services/daily-loss-budget.ts:217`). Owner CC-B per Langston's 2026-07-31 ruling in the entry. |
| **`#632`** — the daily-loss window re-anchors on every process restart | pruned, "withdrawn" | **DECIDE (Kyle) + a Phase-21 gate item.** Restarts are now deploys, not rare events. | Entry HOME: *"PHASE 21 pre-flight — the live-launch gate … Owner: Kyle's decision; CC-C carries it to the Phase-21 gate."* |
| **`#692`** — a downward balance re-anchor froze ALL opens for 4+ days | pruned, "incident record" ⚠️ | **DECIDE (Kyle).** It is a mechanism, not an incident: positions sized against the old balance saturate the shrunken budget, and every open is blocked until they close. The owed options note: proportional slot release, a legacy-notional grace policy, or documented acceptance. | Entry: *"It WILL RECUR on every future downward re-anchor (and live mode makes downward anchors routine)."* Pairs with Kyle decision #6 (day-one balance). |
| **`#603`** `B-IMPLEMENTATION-SHORTFALL` — no arrival price persisted, so slippage mixes a stale signal with execution cost | pruned, "withdrawn" | **HELPFUL, own batch, owner CC-C.** Live cost measurement needs the split: 24 closed trades show a >1% intended-vs-fill gap, max 8.77%. | Entry HOME: *"its own batch B-IMPLEMENTATION-SHORTFALL, owner CC-C"*. Nothing withdraws it. |
| **`#633`** — the target-goal safety check cannot fail (reads guardrail fields that do not exist; warn threshold above 100%) | pruned, "folded" | **MERGE into `P19-B6.10` (MUST row 3)**, not PRUNE — its home is still open. | Entry HOME + `#400` HOME. |
| **`#957`** — xStock yields three definitions of "the price" from one frame | pruned, "withdrawn" | **MERGE into `3b.g`** — a scheduled review, *"the first question of B-DECIDED-INTENT-INDEX"*. | Entry DISPOSITION §9.4 (4). |
| **`#565`** `B-COMMS-RESTART-DURABILITY` | pruned, "withdrawn" | **AFTER** — a decision batch that may close with no code. Crew comms only; no trading path reads it. | Entry HOME. |
| **`#687`** — the equity-perp universe file is 6 symbols stale | pruned, "withdrawn" | **MERGE into `P19-B-PERPFEED` OBJ-4.** Perps are post-live, so effectively AFTER. | Entry HOME. |
| **`B-UNIVERSE-BOUNDARY-FIAT`** (line 795) | pruned, "folded" | **Not prunable — it is the HOME others folded into** (`POST_AUDIT_ROADMAP` §20.4.6, Phase 20; `#937` + `#938`). Its shape waits on Kyle decision #8 (fix or exclude non-USD / fiat pairs). | `#938` HOME line; roadmap §20.4.6. |

**Right prune, wrong reason — relabel only:**
- `#909` is **DONE**, not withdrawn: `B-SCANNER-EGRESS-NORMALISE` closed 2026-08-30.
- `#962` is **DONE** by `8a-P3` / `8a-P4b` (resting maker fills now decide on the transactable side).
- `#952` is **FOLDED into `3n`** (absorbed at r5).

**Agreed as pruned:** `#576`, `#553`, `#567`, `#564`, `#955`, `#659`, `#624`, `#705`, `#696`, `#738`, `#906`, `#945`, `#938`, `#1047`, `#1065`, `B-MIN-STOP-DISTANCE`, `B-FUNNEL-PERP-CLASSES`.
`#644` — agreed, since it is a finding, not work. **But the decision it tees up — whether the exploration subsidy ending on its own is wanted — must be visible in Phase 25.** Confirm it is there.

---

## 4. HELPFUL / AFTER / DECIDE — CORRECTIONS

- **Kyle decision #10 — `3n.q3` `B-VTS-NO-DECISION-VALVE`.** Four corrections:
  1. **The policy call may not be Kyle's.** Time-bound versus loosen, on the VTS lane, sits inside his 2026-09-03 delegation of price-side decisions to CC-C + Langston (row `3n`). **Langston to say whether it leaves Kyle's list** — that would make it 11 decisions.
  2. **The row also carries WORK that is not a policy call:** persist the booking ARM on each closed VTS row, and `#1075`'s archive class label and `pairFriction` fallback. **→ HELPFUL** (the learning record Phase 25 calibrates from).
  3. ⛔ **`#1073` is the PAPER lane, both classes — so it binds the LIVE engine, and it should not sit under a learning-lane decision.** Every price-refusal path skips the step that checks a resting order's deadline. When evaluation resumes past the deadline, *fill wins*, so a rest can fill after a real system would have cancelled it. **In live the order rests at the venue and a real cancel needs no price.** Measured: exit leg 0 of 320 rests past deadline; **entry leg unmeasured**. **→ MUST, as a requirement on the live engine (group B):** the resting-order deadline runs whether or not a price is usable. Measure the entry leg first; the entry records its own conversion trigger.
  4. **`#1075`'s collision-set half belongs in `3b.h-4` (MUST), not here.** The VTS crypto lane derives its CARRIED class from the ticker (`vts-runner.ts:2240`), so a ticker that joins the xStock universe without being in the collision set misclassifies a crypto trade — an execution effect, not a label. **The set is 135 days old against a "quarterly" rule whose cited trigger does not exist** (`MULTI_ASSET` §10c.X is absent). **Wendy's (`WEN/USD`, also a Kraken crypto pair) sat in the xStock universe 2026-05-21 → 08-03 outside the set.**
- **`3n.v2` `B-VTS-CLASS-LABEL-INTEGRITY` (`#1068`)** — owner **CC-B**, not CC-C (plan row `3n.v2`: *"Owner CC-B, cross-referenced to CC-C"*).
- **`#1074`** — owner **CC-B**: the class fix is item (iv) of `2.4b` `B-ALERT-QUEUE-INTEGRITY`. Only the instance is mine (hand-resolve alert `1ae9a06b` at my batch close).
- **`#1027`** — owner **CC-INFRA.** Its home is proposed in CC-INFRA's Coltrane onboarding; which of the three fixes is CC-INFRA's pick. Still the prerequisite for the Coltrane trial, as drafted.
- **`#1026`, `#1035`** — owner **CC-INFRA.** `#1035` was added to CC-INFRA's `#1026` work, which is the same bridge file.
- **`#686`** ⚠️ verify — **→ AFTER, with `#733`.** The disposition relocates a runtime file out of `bridge/canonical/`. The reader's scheduler is dead, so there is no live effect.
- **`#628`** ⚠️ verify — **HELPFUL agreed.** It was re-classed non-architecture ("not a live-risk hotfix"). Its two SIZING sites should ride `B-SIZING-DEC-RESTORE`; the four display sites can wait.
- **`#996`** `3b.b-b` ⚠️ verify — **confirmed OPEN.** It was refused rather than shipped; OBJ-1 is a measurement. HELPFUL agreed.
- **`3b.f-c` `B-XSTOCK-SESSION-FRESHNESS`** (draft line 205, owner shown as Kyle) — **owner CC-C.** Plan row `3b.f-c`: *"Owner CC-C (his freshness lane)"*. Kyle RULED it; he does not own it. HELPFUL agreed: an entry refused on stale price fails closed. It fired three times this month on after-close quiet (`#994` am. 4-5).
- **`#994` "the two records disagree"** — **they do not; they are two halves.** Exit-side paging economics = `3b.f-d` `B-VENUE-QUIET-ALERTING` (CC-B, `#994` folded 2026-09-03). The entry-side flat 15 s ceiling and its stale-fill alert = `3b.f-c` (CC-C, folded 2026-09-04). ⚠️ **But the plan uses row id `3b.f-d` TWICE** (`PHASE_19_PLAN:47` `B-OBS-WINDOW-EVIDENCE-CAPTURE` and `:51` `B-VENUE-QUIET-ALERTING`) — **renumber one in the reorganisation.**
- **`B-FUTURES-BAR-FINAL`** `3b.h-7` ⚠️ verify — **not verified this pass.** It is placed after F-G-1's OBJ-9 ② fix, because a re-read would expose the futures leg to `#1031`.

---

## 5. MISSING — IN MY LANE AND NOT IN THE DRAFT

| item | bucket (opinion) | why | where it lives |
|---|---|---|---|
| **`F-G-1` is NOT in observation — window CLOSED, conversion owed, and it REOPENS at Step 3** | **MUST** (D. price truth), **owner CC-C, not Kyle** | Window closed 2026-09-04: crypto PASS (n=24), xStock underpowered (n=19). **OBJ-9 ② is not met in production (`#1031`): the OHLC writer's retry can write an OLDER bar over a NEWER one, and xStock 1-minute bars roll into the 15-minute snapshot the scanner reads to generate signals.** Langston bounded it to the ordering guarantee. | `F_G_1_PROGRESS_REPORT.md` header + §7; `#1031`. |
| **`8a-P4c` increment 1 — the VTS xStock price instrument** | **OBSERVATION** | Deployed `bc199185e`, Step 8 confirmed by Langston. Window `2026-09-22T14:38:49.748Z` → `2026-09-30T00:00:00.000Z`; pre-registered rules A-D then decide increments 2-3. Also due at close: the rule-8 enumeration of VTS timeouts booked at the midpoint. Instant captures are armed for EGLD (2026-09-26 09:01Z) and FET/EUR (2026-09-28 11:10Z). | Progress report §9-§9.2; `ADJUSTMENT_FRAMEWORK` epoch rule 8. |
| **Codex review of the pricing architecture** | **HELPFUL** (an independent review of the price layer before real capital) | Brief and prompt are complete; the findings register is at r14 and READY. **Held until `#1027` clears** (Coltrane cannot read the repository). | `Scope Files/CODEX_PRICING_ARCHITECTURE_BRIEF.md`, `CODEX_PRICING_PROMPT.md`, `CODEX_FINDINGS_REGISTER.md`. |
| **Exit-path design, `EXIT_PATH_MACHINERY_AUDIT` §10 (draft 1)** | **MERGE** — to be mapped | As far as I know its surviving items are absorbed into `3n` (D1-D10), `3h` / `3h.b` and `3i`. Langston ruled its findings are measurements, **not certified dispositions**, until `3b.g` lands. **I have not proved full coverage; I will map it item by item in the reorganisation rather than assert it here.** | `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md` §10. |
| **The break-even ratchet — the reason Kyle switched it off has expired** | covered by **Kyle decision #3** | His 2026-08-30 reason was that break-evens exited trades before we could see how they finished — **stated when we were VTS-only, not paper trading.** Put that to him when he makes decision #3. | Decision #3 row. |
| **`#690` residual — audit FAILs have no alert path** | to check | Not verified this pass; in my open list. | `#690`. |

---

## 6. OWNER CORRECTIONS OLD CLAUDE RAISED FOR MY LANE — CONFIRMED AT THE LEDGER

- **`#570`** — RTB bucket 2 fires but does not refresh its signals' timestamps. **Owner CC-C:** the entry reads *"formally handed over 2026-07-25, Langston-confirmed 'single owner is right'"*. Its home is `#532` / OBJ-4 (refresh completeness). **HELPFUL agreed. Not re-measured this pass**, so the draft's ⚠️ verify stands until I re-run the bucket-2 read.
- **`#622`** — a completion report's *"governance files changed"* list is an unverified assertion. **Owner CC-C** (*"my false line, my item"*), nominated to `B-MEASURE-GATE`'s Proposal-B conversion list. **AFTER agreed** — governance tooling with no trading effect. It should not be filed as a CC-A item.

---

**Close-out:** the `#935` header is closed in the same commit as this file. No other document was changed.

---

## 7. KYLE'S LINE-BY-LINE CHECK (2026-09-24) — every line of `CC_C_SESSION_TASK_LIST.md` against `PRE_LIVE_INVENTORY_DRAFT.md` at `011ff77fa`

**Method:** all **75** lines of the task list were checked: §0a 8, §0b 2, the queue 61, the "not in the queue" list 4. For each line I found where its batch name, plan row or issue number lands in the draft, and **read the landing line** to tell a real inventory entry from a passing mention or a stale one. A search was used to FIND each line; the verdict came from reading it.
**Result: 69 of 75 are present and correctly placed** (the buckets from §§1-6 stand). **Six need action:**

| # | task-list line | what the draft has | what it should have | bucket opinion |
|---|---|---|---|---|
| 1 | `3b.c` `B-EXIT-TRIGGER-FILL-PARITY` (`#959`) — my list: *withdrawn 2026-08-31, folded into 3b.b* | ⛔ **MUST #38, owner Kyle, quoting "its own row says CRITICAL"** (draft line 118) | **PRUNED (withdrawn).** The plan row's own correction note: *"WITHDRAWN AS A SEPARATE DEFECT 2026-08-31 (`#959` am. 1-2). The 14% trigger/fill gap was five xStock rows in the 00:15 UTC minute; outside it the gap is ~0.1%."* The draft read the pre-withdrawal text. The live trigger-vs-fill work is `B-PRICE-SIDE-BY-JOB` plus `3n.q7`, both already MUST. | prune; **this removes one false MUST and one false Kyle decision** |
| 2 | `3n.q2` **`8a-P4c`** — VTS xStock, the rest of the xStock half | not named anywhere. The `B-PRICE-SIDE-BY-JOB` MUST line (#27) says *"until the xStock paper increments land"*, but `8a-P4c` is the **VTS** lane | name `8a-P4c` inside the #27 line so it cannot fall out (Kyle, 2026-09-15: one batch, two halves) | MUST, as part of #27 |
| 3 | `3n` row **`8c`** — P1 only, **HELD** on the decision recorded on its row | not named (the only `8c` hit is Infra's unrelated `2.8c`) | name it inside #27 as held, with its row reference | MUST as part of #27, **held** |
| 4 | §0b **the Codex experiment** (`CODEX_FINDINGS_BY_GROUP.md`; the register is r14 and ready) | only its prerequisite `#1027` (HELPFUL, line 391) | its own line: an independent review of the pricing architecture, **held until `#1027` clears** | **extremely helpful** — a second, outside reading of the price design before real money |
| 5 | row `4` **`F-5`** — per-strategy reach structure | PRUNED as *"delivered by B-GEOMETRY-REACH-BASELINE and B-REACH-BASELINE-ADJUST ⚠️ verify"* (line 712) | **Prune VERIFIED for the STRUCTURE:** `B_GEOMETRY_REACH_BASELINE_COMPLETION_REPORT.md` OBJ-A.1 — *"`reach_atr_max` resolves per-(strategy × class)"*, YES. **But the reach FIT that row 4 gates on `F-E` has no item of its own that I can find.** Plan row 4 is corrected in this same commit. | the FIT: **extremely helpful** (calibration). ⚠️ Also check that MUST #51 *"F-E fill-integrity detector"* is the same thing as row 8's `F-E` (grading the closed trades against venue bars); the two descriptions differ |
| 6 | §0b **standing ownership of `ACTIVE_PATH_FLOW.md`** | absent | **not an inventory item:** it is a living map kept current as batches land, not work with an end | none — a standing duty, listed so its absence is deliberate |

**Everything else:** each of the other 69 lands in MUST, DECIDE, OBSERVATION, HELPFUL or AFTER, or is merged into a live item. Every merge was checked at its target line: `#949`, `#977`, `3b.f-b`, `#1017` and `#971` are absorbed into `B-PRICE-SIDE-BY-JOB` r5 (MUST), and `#936` was removed by Kyle in Phase 16 (roadmap 16.9). The two items my list names only by plan row are present by row: `3n.b` (AFTER, line 413) and `3n.c` (HELPFUL, line 261).
