# B-SPREAD-BLOWN-RELEASE-MOVEMENT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture

Owner: CC-C · #1199 · Step 2 draft · approved Step 1 r2 `40754e3ae9d3399d939e6e0e6db256834f30bb14`, Coltrane 2026-11-27 04:07:50Z.

## Previously stated vs now

- **Previously stated:** 31 of 81 stop-side wide holds released below the stop (§3d of the Bid Trigger Reland progress report). **Now:** 31 of 81 historical close rows with a wide-hold marker carried a below-stop release value. **Reason:** the persistent summary has no episode key for either value. Scope r2 and Audit A2 define a separate, currently unmeasured matched denominator.
- **Previously stated:** 53 above-stop releases from objective 6's first overnight read. **Now:** 53 release log events across 17 symbols in its 20:00–01:00Z window. They describe decision recovery events, with no paper xStock close during that window, and are separate from the 81 close rows.

## Audit

### A1. The candidate only applies after a verified comparator clear

Code and manual read at `fe3fcc586fd8b5d6e08cf449829f5cb54f78e17d`. The System Manual §3.5.1, System Impact Map §§S25–S25c and book-state/exit-trigger entries, BATCH_CATALOG, RUNNING_ISSUES #1199 and the Bid Trigger Reland objective 6 change list and §§3c/3d/3h progress report define the two paths. Step 1 traces the original absolute hold and ring-independent escape to `9c82d1e10`, `75f6fcc22`, `f7413a96a` and `546cda86e`. The pre-governance canonical bridge corpus has no applicable description under the wide-book, `spread_blown`, tracker or bid-collapse terms. Both branches postdate it.

The equity archiver's last raw bid/ask frame feeds `book-state-tracker.ts`. In `active-execution-engine.ts:1486–1498,1816–1840`, the monitor interval and immediate start pass converge on one non-reentrant loop per active engine. The bootstrap restore of the retained ring precedes engine resume (`server/index.ts:506–527`). The TEC exit loop is the production comparator advance caller (`active-execution-engine.ts:3011`). The wide hold is applied before the comparator assessment can admit a decision. A below-cap hold preserves the shared-by-symbol reference, while a cap-reaching hold can clear a valid chain (`:2853–2882`). The implausible chain is spared; its two existing internal clears and re-seeds stay protected (`book-state-tracker.ts:368,430`). The ordinary post-clear baseline may seed on the first qualifying frame, validate on the second, and act on the third (`active-execution-engine.ts:3007–3051`). Neither an absent comparator by itself nor a generic symbol-level clear identifies the target case.

Downstream, the guard releases before the trigger and fill checks. The shared exit selector has one TEC call and two VTS calls on this ref (`active-execution-engine.ts:4225`, `vts-runner.ts:4012,4817`). The candidate is scoped to the TEC paper exit after a verified wide-hold clear. It must preserve the short hold, restart-only seed, implausible-chain escape, entry guard, VTS, crypto, price selector, size/fill checks and S25 ring persistence. The code census is a lead and the cited call sites were read at the ref.

Positive control: existing chain and increment A fixture suites passed **43/43** together on the unchanged code at this base, including cap-reaching clear and third eligible evaluation. Coltrane's r1 paired replay found evaluation 1 for the short hold and evaluation 3 for the cap-reaching hold with the same recovered quote. An early-clear mutation broke the short control. Recheck both cases in the Step 3 paired tool.

### A2. Close-row screening cannot match the hold to the release

`exit-refusal-tally.ts:65–104,116–119` latches the first stop-side wide marker, updates last and minimum priced releases across any refusal kind, and drops internal episode timestamps from the persisted summary. Its TEC call site runs before evaluating the actual trade exit (`active-execution-engine.ts:3127–3144`). It is keyed by open position (`:793–816`) and snapped to close metadata (`:5310–5311`). Restart clears the running tally. The book-state metadata writer keeps the most recent skip and at most 20 yields (`:1100–1118`), so their presence can corroborate a trace and their absence cannot settle it.

Read-only replay of the actual tally module, two histories with the same stop at 100 and the same first wide-refused bid at 98. History A released the wide hold at 99 and later had an unpriced generic release. History B released the wide hold at 101 and later had a generic priced release at 99. The complete persisted outputs were identical, including two releases, first bid 98, last/minimum release −1%, and 1,500 ms wide-held duration. Equal output leaves the actual wide-hold release on either side of the stop. Even a correctly matched release can have occurred without a clear, as shown by GIS below.

REVIEWER: claim-only · what objects and histories distinguish the wide marker from the stored release · found an identical-summary counterexample with opposite wide-hold outcomes and traced the matchable events · re-derived y.

### A3. Measured source coverage and protection controls

Governed staging DB reads, 2026-11-27 around 04:03–04:09Z, and the retained error log for 2026-11-16:

| Control | Reproduced observation | What it can grade |
|---|---|---|
| GIS paper close at 2026-11-16 21:16:01.385Z, trade `6ffecbd2-698f-4ad6-938a-4c78702754ca` | Close event joins open-position ID `06b3d5aa-95c6-41d2-a318-244e9350bc16`. Error log at 21:15:03Z records first wide refusal with an already validated comparator, then 38 more ticks flushed as recovered at 21:16:01Z and position-keyed release at −0.583%. Archived 21:16:01.171Z quote displayed 400 at the 35.00 bid against position quantity 0.75342491. Booked 35.00 fill cites a separate 21:15:47.024Z ticker row, about 14,290 ms old. Serving identity from §3h is `8fac86e5e`, restart 708. | A short-hold, surviving-reference control and independently witnessed brief opportunity. It must remain accessible to the baseline and candidate. The archived quote does not identify the exact consumed frame. |
| CRM paper close at 2026-10-19 11:22:20.293Z, trade `48db9ca5-40c5-4f10-86ae-0e3c5d241107` | Close event joins open-position ID `b99cf18d-2b38-4c3a-a832-686c5207a2c2`. Progress report §3c records the ask-only narrowing and the third decision at a steady 237.27 bid. The closed row has 64 recorded releases and 20 retained yields, booked depth age about 45,083 ms and no quote capture stamp. | Reproduces the close row and gives a historical decision-sequence control from the report. Exact hold/clear/build match and contemporaneous executable bid remain unverified. |
| Same bounded hot-archive query, 2 minutes per symbol | CRM Oct 19 11:21:30Z window had 0 rows. GIS and AAPL Nov 16 21:15:00Z windows had 14 and 26 rows, with 4 and 26 sub-ceiling rows respectively. | Positive archive control. A zero in the older hot window does not establish a missing venue update. Storage Policy §3 specifies 30-day hot snapshots and the archive has a four-second nominal sampling interval. Tiered snapshots can add availability evidence but still cannot show every TEC evaluation. |

UI trade summaries can corroborate a close. None of the causal joins are graded from the UI. These are bounded source-coverage checks and controls, not a grading cohort. The oldest reports describe historical logged cases, with exact build/quote linkage required afresh before an episode can be scored.

### Audit aid blind spots

- Value lists and database enums: no enum changes or list-equivalence claims.
- Literal copies: the proposed comparison uses the same code/config per episode. Do not duplicate thresholds as an independent source of truth.
- Fields/properties: first held bid, latest/minimum release, episode resets and timestamps were read in their real writers.
- Sibling producers: distinguish per-position release log and close summary from the per-symbol comparator and the separately sampled quote archive.
- Site meaning: a guard release precedes the downstream selector and fill. A sampled quote or trade close alone cannot prove evaluation or quote consumption.
- Error paths: no archive hit, query/read failure, partial timestamp coverage and runtime failure carry distinct labels.
- Library behavior: no library behavior or policy assumptions needed for the comparison.
- Scripts outside TypeScript program: the existing recut helper intentionally substitutes archived context where exact frames are missing. It is not an exact replay source and was not run.

## Implementation plan

1. **Freeze and match the existing evidence (A1–A3).** Recover the original close cohort selection boundaries before claiming an exact 81-row reconstruction. Give every screened close a coverage status and allow several episodes per position. Keep the first-night 53 events and still-open/right-censored positions in their own cohorts. Join by trade and position identity through the close events, and constrain comparator events by symbol, process, serving ref, mode, intervening positions and known restart. Demand timestamped continuous evidence of the actual wide hold and its clear, seed, validation, first eligible decision, release, and any booked close. For missing input history, use explicit partial or unavailable categories. Check bounded existing files and the archive manifest and read only sanctioned sources. No rehydration into staging or new active observation is planned.
2. **Run a matched offline comparison (A1–A3).** Reproduce current behavior at the serving build and on fixtures. The comparison counts at least two distinct price-pair changes with both sides having moved after the first eligible sub-ceiling frame. Replayed or duplicate evaluations give no movement credit. Restart, return to a wide/missing/crossed frame or loss of provenance requires an explicit disposition before the episode can count. Grades are per episode on identical proven inputs. Demonstrate the short hold/evaluation 1, cleared hold/evaluation 3, retained implausible chain, ordinary restart, mixed reasons, entry, VTS, crypto, opposite-direction later release, sharing of a symbol between positions, and known frozen versus two-sided-moving fixtures. Log changed decision timing, lost qualified opportunities (including a witness without exact attribution), bid-to-stop impact, later decision/no decision, and right-censoring. GIS is a non-target positive control for cost: any candidate delay on this short-hold history fails preservation rather than counting as a target effect.
3. **Apply the grading rule and return for review (A2–A3).** Report coverage against the full screened denominator, including unmatched cases. Historical minimum for a positive policy recommendation is a fully matched eligible episode with direct evidence of a harmful release blocked by the candidate, and a fully matched eligible genuinely recoverable episode to test whether the candidate preserves a witnessed usable exit. Fixtures are mandatory positive and negative controls but do not satisfy that historical minimum. Every witnessed missed opportunity counts as a cost. Compare comparable capture intervals and do not award improvement from mark-only proxies or a later better bid without traceable state. If the records cannot distinguish the policy outcomes, record insufficient evidence and retain the present behavior. Return any evidence-backed rule change as a scoped technical decision. No trading, restart, deployment, alert or settings action belongs to this plan.

The key comparison is whether waiting for quote movement filters a false recovery without losing a brief usable bid. The audit keeps the known paper exits as controls and gives unknowns their own count.
