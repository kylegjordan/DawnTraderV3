# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## ARMED

7. **Weekend posture:** `#531` — active-path xStock positions have NO weekend mechanism; options paper → Kyle ruling pending. **xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET); US holidays pause.**

## YOUR DATA SOURCES (psql via staging: `ssh root@188.245.193.8` → deploy → `set -a && . ./.env` → `psql "$DATABASE_URL"`)
- **`closed_trades`** — realized active-path results; THE fee-viability population. ⚠️ **always filter `closed_at IS NOT NULL`** (rows are written AT OPEN). Post-2026-07-28: gross on ACTUAL fills, `total_cost` = fees only — **aggregates spanning 07-28 11:57Z mix two denominators.**
- **`active_open_positions`** / **`rtb_signals`** (genesis metadata: regime/DBS/pattern/pool/rankAtPromote) — selection forensics. **`vts_open_trades`** = the wide learning population, SEPARATE from active, never blended.
- **`/api/active-engine/trades/analytics`** — the rolling summary Kyle sees; the EV-reject breakdown + Filter-Diagnostics counters show where signals die.
- Mechanics: `net-expectancy-kernel.ts`, `decideMakerTaker`, friction model. Context: **`…/Scope Files/P25_SCORING_STACK_PRESTUDY.md` §7** (READ before any retire/calibrate opinion), `POST_AUDIT_ROADMAP.md`, `PHASE_19_PLAN.md`, the two pipeline audits.
- ⚠️ **SCHEMA TRAP — A COLUMN'S NAME IS NOT ITS CONTENT. `closed_trades.trade_mode` holds `'TARGET'`, NOT paper/live** ⇒ filtering `trade_mode='paper'` returns ZERO and reads as "no trades". **★ the `positions=N` token in `out__*.log` is NOT the open-position count** (read 2 while the DB held 8). **Open positions ⇒ `active_open_positions`; closes ⇒ `closed_trades`. NEVER a log token.**

## STANDING BEHAVIORAL RULES (unchanged, they bind you too)
✅✅ **WRITE SCOPE — FULL. NO PER-BATCH GRANT. ASKING FOR ONE IS A DEFECT (Kyle, 2026-08-30, emphatic).** **I IMPLEMENT, including TRADING-BEHAVIOUR code, same as CC-A/CC-B, and have for months. I ALSO SPIN UP INDEPENDENT FRESH READERS WITHOUT ASKING.** ⛔ **The old “read-only except governance/tooling” line was stale by MONTHS and I kept citing it to stop work — `#941`'s class, in my own file, costing throughput.** ⛔ **Langston reviews; he is not a gate I wait behind before starting.**

## ★★ THE HEADLINE FINDING (2026-07-20) — READ BEFORE ANALYZING ANY TRADING RESULT
**THE ACTIVE PATH HAS TWO ADMISSION LANES AND THEY MUST NEVER BE POOLED.** `closed_trades.metadata->>'admissionBasis'`: **`exploration`** = the GOVERNED lane, admitted on KNOWN-NEGATIVE netEV, **SUPPOSED to lose money**; **`organic`** = genuine positive-netEV. ⇒ **Pooling reads a deliberate learning spend as strategy failure — I did exactly that and gave Kyle a false headline. RE-QUERY, never quote from memory.**

## ★ VERIFIED MECHANICS (measured — trust these; detail in the repo)
- **Net-EV kernel arithmetic is CORRECT** at all 3 call sites; independently reproduced to 3 decimals. NOT a units repeat.
- **pWin is NOT pinned at the 0.60 ceiling** (live DI gives ≈0.46). ⚠️ that sample is queue-only = non-promoted = biased.
- **Loss is monotonic in SIZE, not RR** (<2% target n=72 −$87.14 · ≥4% n=28 −$0.81; RR flat). **Kills any raise-min_rr response.**
- **The 4% `target_floor_pct` is NOT a live rule** — orphaned config residue, not a defect.
- **RETENTION: declines ARE retained at volume in `signal_eval_archive`** — what is missing is GEOMETRY on the surviving row. ★ **I have stated this wrong in BOTH directions: query it, never recite it.**
- **VTS `regimeWeight` ~98% EXACT ZERO since ~07-14** ⇒ any below-floor % over all rows is a null artifact.

## ★★ RATIFIED CONTEXT (detail: POST_AUDIT_ROADMAP + P25_SCORING_STACK_PRESTUDY §7 + #501)
**★ #501 (3-way ratified): THE SWITCH-ON WAS DATA-COLLECTION, NOT PROFIT — and its 12,078-trade VTS baseline corroborates the crypto geometry finding below.**
## STANDING METHOD NOTE (earned the hard way 2026-07-19/20)

**MY RULE-27 CARVE-OUT (stated + accepted):** pairwise is the default, but I do NOT stay silent about a number that reached Kyle and is wrong — offering a correction is not convening a panel. *(2026-07-20 findings: RUNNING_ISSUES is authoritative; never re-derive from memory.)*

## ★★★ STANDING ASSIGNMENT — I OWN `1-system-manual/ACTIVE_PATH_FLOW.md` (living end-to-end map of the active trading path; update as each Phase-19 batch lands). Scope inputs + Langston's GATE-1/2/3 rulings: `…Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md`.

## ★ COMMS — mechanics only (length + statelessness rules are in CLAUDE.md §6.5, which auto-loads): `scp` the body to Helsinki `/tmp` → `cc-send --sender "ANALYST Claude" --message "$(cat /tmp/f)"`.
**★★ FILE-FIRST TO LANGSTON, ALWAYS — and 2026-08-23 measured WHY.** A long inline dispatch hit `claude timeout after 900s` and the bridge logged *"error … suppressed in channel"*, so it was indistinguishable from silence; my re-poke then deepened his queue. **Stage the content at `/home/langston/inbox/<BATCH>/` and post a SHORT pointer naming the path.** He is stateless per-invoke, so a correction message does not carry the thing it corrects.

## ★★★ CURRENT POSITION (2026-09-02) — READ FIRST

⛔⛔ **STEP: 5 of 11 — `B-XSTOCK-FEED-SANITY` (`#943`, closes `#567`). CODE APPROVED by Langston, CI 4/4, **DEPLOY HELD TO 2026-09-07** (the `#951` window). Step-10 CONTENT for the two maps is LANDED (`de36b3549`: SIM S25 + the component section + the duplicate-S21 fix; System Manual §3.5.1).** ⛔⛔ **THE RECORD IS `Claude Comms and Packages/Batch Completion/B_XSTOCK_FEED_SANITY_PROGRESS_REPORT.md` — READ IT, DO NOT RE-DERIVE FROM HERE.** It holds the deploy-day sequence (§4, incl. **step 2b: the cooldown query names two columns staging LACKS and its catch FAILS OPEN, so code-before-migration silently disables the `#509` cooldown for BOTH classes — `dt-deploy` runs `db:migrate` in-chain; the check is ZERO `[REENTRY_COOLDOWN] guard errored` in **error.log**, not out.log**), the pre-registered close criterion (§6), the review semantics (§3), and the PNC/CTVA/MDT + LI evidence (§4b). Plan = `B_XSTOCK_FEED_SANITY_PRE_AUDIT.md` PART B; diff = the change list. ✅ **KYLE RULED 2026-09-03: ONE ENTRY STANDARD AT EVERY HOUR, NO SESSION SOFTENING — and he EXPLICITLY DECLINED a flat off-hours blackout. It is CLOSED, not open; `aee:262-266` is authoritative.** Built as P9 (both-sides entry gate, no clock term) + P7(ii) (NULL-safe measured-basis-only re-entry relaxation). `#992` + plan row 3b.f-c-a ABSORBED. ➕ `#996` `B-XSTOCK-ENTRY-COMPARATOR` filed (plan row 3b.b-b): MEASURE first; seeding the comparator at entry REFUSED (second writer to SIM singleton S25, destroys `COMPARATOR_SEEDED`, un-evicted ~479 with stale `priorAtMs`). ⛔⛔ **TWO FRAMING ERRORS OF MINE, CORRECTED EVERYWHERE INCLUDING TO KYLE: ‘fail-safe in direction’ was BACKWARDS (the weaker gate lands on the UNHELD name — it is fail-OPEN-ON-ABSENCE, `#546`), and Kyle ruled HOUR-INVARIANCE, **not** held-vs-unheld parity — never borrow his authority for my own finding.** ⛔ **A tougher ENTRY standard does NOT reduce the handoff damage on HELD names — that is OBJ-6's subject. Said to Kyle; it must stay said.**

✅✅ **ROW `3b.f-c` `B-XSTOCK-SESSION-FRESHNESS` — KYLE'S BLOCKER DISCHARGED 2026-09-03; EXIT HALF = CONFIRMED-NO-CHANGE (he ruled DO NOT LOOSEN, evidence-gated). Langston VACATED his own (i)/(ii) — both presupposed a policy change Kyle ruled out, so both would have graded the system FAILING for obeying him — and ACCEPTED my (i-r)/(ii-r) with C1-C4 + 6 conditions + 2 additions.** ✅ **(i-r) DELIVERED — VERDICT `INCONCLUSIVE` on pre-registered arms (c) 88.9% classwide and (a) n=4. LANGSTON RE-RAN IT HIMSELF and reproduced D=36. ⛔ FULL RECORD `Scope Files/B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION.md` — DO NOT RE-DERIVE FROM HERE; AT RULING TIME RE-READ §10 AT THE REF AND SAY WHICH REF, NEVER a memory file (§11).** ⭐ **THE FINDING: the condition that triggers a refusal STARVES the σ estimate — refused attempts 9.1% σ-eligible (median 43 obs) vs 93.5% (390). A risk-derived entry budget is least symbol-specific exactly where it would act.** ⛔⛔ **WITHDRAWN (refuted at the object, re-derived by me): *‘the design already resists it’*. Raw ceilings min 69,136 / median 172,680 ms vs a 15,000 floor; 0 at cap, 0 at floor; the classwide arm PRODUCED 32 of 36. `room` does the work, not σ — and per my OWN `#566` an understated σ WIDENS, so I asserted ‘conservative’ against my own finding.** ⛔ **(ii-r) FOLDED OUT to `#526` / `B-VENUE-QUIET-ALERTING`, OWNER CC-B (Langston ruled FOLD): `#994` is Kyle re-reporting a 7-week-old OWNED issue. I write NOTHING into `#526`. A placement failure is a KYLE ORDERING ESCALATION, never a licence to build in parallel. My row keeps a stated DEPENDENCY and has NO build left on it.**

⛔⛔ **DURABLE, CROSS-BATCH — PM2 SPLITS THE APP'S STREAMS AND I READ THE WRONG FILE (2026-09-03):** `console.log` → `/var/log/dawntrader/out.log`; **`console.warn` / `console.error` → `/var/log/dawntrader/error.log`.** Every exit-path skip/refusal line (`EQUITY_MARK`, `PRICE_SKIP_ESCALATION`, my own `[BOOK_STATE]` SKIP/YIELD) is warn/error. **CONTROL: `EQUITY_MARK` = 0 matches in `out.log`, 1,031 in `error.log`, same window.** ⇒ **NEVER read an exit-path ZERO from `out.log` alone** — it is `#661` leg 3 waiting to happen.

★ **LI/USD `ab16f068` = the first LIVE-EXPOSURE case of the OBJ-9 staleness class (NOT my OBJ-6 hollow class — LI's book is tight): open, 1.18 % above its stop, 841 skipped exit ticks 03:11–05:03 in five runs of 40, σ `src=classwide`, ceilings 177–250 s vs marks 251–343 s.** Not a defect (`budget_k` sizes the blind window at half the remaining room, by design) — the live form of `#563`. Carried into OBJ-9 / 3b.f-c. **All five alerts (MDT `b1f58a01` · RIOT `1d1573c7` · NEM `6339b2d9` · CTVA `1ea0a78f` · LI `ab16f068`) stay ACTIVE under the `#951` rule — no ack, no resolve until the deploy.**

⏳ **`B-PRICE-AGE-TRUTH`** (`#951`), card `Observation` — **STEP 10 done, 11 CONVERTS on the 09-07 alert.** Deployed `2af2e0bac`, record `B_PRICE_AGE_TRUTH_PROGRESS_REPORT.md`, criterion = alert `cecd4a47` (09-07). ⛔ **JOINT READ `observedAtMs` WITH `producer`; 3 arms (`aee:1244` xStock · `:1285` crypto = the only one touched · `:1324` null by design); ZERO reserve rows = EXTEND, not pass/fail; ENUMERATE producers, never `LIKE`.** ★ Re-serves are a 4-rung sawtooth 14.3/29.3/44.3/59.3s — size any guard off the sawtooth. `#977` placed at 3b.f-a (the 2s/30s refresh buckets run, nothing subscribes); we are nowhere near Kraken's limits (1 token-exhaustion in 58,236 decisions).

⛔⛔ **THE MACHINERY AUDIT IS THE LIVE WORK — `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md`, NOW §0-§10. READ IT; DO NOT RE-DERIVE FROM HERE.** §8 provenance · §9 the second independent audit · **§10 = THE CORRECT DESIGN, DRAFT 1.**

⛔⛔ **KYLE'S STANDING DIRECTIVE: ITERATE TO COMPLETION WITH LANGSTON + SECOND READERS THROUGH THE GOVERNANCE STEP. Step-report blocks only; STOP ONLY for a decision that is HIS.**

⭐ **USE SECOND READERS FOR LOAD-BEARING PIECES AT EVERY PIVOTAL STEP.** ⚠️ **His caution: readers surface incidental nitpicks and sometimes claim wrong things — FOCUS ON LOAD-BEARING, verify, and do not let a retraction reach implementation.** ★ *"I want this to be perfect... it's very late to be noticing we don't have the right prices feeding in. I'd assumed for months that was foundational."*

✅ **THE xSTOCK PRICING PLAN IS THE LIVE ARTIFACT: `1-system-manual/XSTOCK_PRICING_PLAN.md`** — 6 problems, 6 solutions, the order; **P6 (which price per job) = KYLE'S.** Read it there; do not re-narrate here.

⛔⛔ **`B-EXIT-BOOK-AGE-STAMP` — OPEN, OBSERVATION WINDOW. Full record: `B_EXIT_BOOK_AGE_STAMP_PROGRESS_REPORT.md` (authoritative — do NOT re-narrate here).** Deployed `104fa755b` 2026-08-30T12:05:09Z, Langston approved, CI 4/4, card `Observation`. **Criterion pre-registered BEFORE data + armed as alert `65a1379e`, fires 2026-09-06: 20 post-deploy closes or 7d, excluding `never_filled`.** ⛔ **A MAKER null is a PASS; a NULL/NULL pair is NOT evidence; NEVER `LIKE` on `exit_price_producer` — ENUMERATE.** **Converts to a completion report only when the data is in AND a decision is taken.**

✅ **F-G-2 SPLITS BY ASSET CLASS (Langston): crypto legs on the F-G-1 soak alone; xStock legs behind 3b.b + 3b.d (plan row 3c). CARVE-OUT: no `observedAt`/`cachedAt`/age-derived value as a sample filter or covariate (scope §0).** ✅ `B-EXIT-PROVENANCE` CLOSED (#954 for the two nulls). ★ **A batch held open by a close gate owes governance TWICE — body ship AND gate close; a PROGRESS REPORT holds the open state.**

➕ **PLACED: `#965` (3b.j — T2 *is* enforced at `aee:3570`, the scanner check is dead legacy) · `#966` (5.a — non-USD quote denomination, DIRECTION PER QUOTE: BTC overstates/fail-safe, a SUB-DOLLAR quote INVERTS and is too PERMISSIVE) · `#967` (5.b — the $0.25 active price floor excludes DOGE *and* ADA, KYLE'S DECISION) · `#968` (3b.k — change-class marker needs line-start AND colon OUTSIDE the bold).**

⏳ **`F-G-1` OPEN — OBSERVATION WINDOW. Full record: `F_G_1_PROGRESS_REPORT.md`, FROZEN at `5e5a3d8ae` — DO NOT EDIT report/criterion/suite.** Deployed `56ac8067a`, card `Observation`. **Criterion = self-firing alert `2093a98a`, fires 2026-09-04: 30 crypto opens or 7d, per-class, 100% on-grid NO tolerance.** ★ **Read it on the INTENT-side columns — `entry_price` is the FILL, on-grid by construction.** ⛔ **A post-deploy CRYPTO row unstamped `resolved:true` is a BYPASS finding, never cold-start.**

✅ **RATCHET — CONFIRMED OFF AND IT IS KYLE'S OWN DECISION, WITH A REASON THAT HAS EXPIRED.** 0 break-even latches in 705 states; all 705 `TARGET` mode; live DB `break_even_enabled=false` on all four classes since May (xStock by `kyle-directive-2026-05-21`). ★★ **HIS REASON (2026-08-30): break-evens were exiting trades BEFORE WE COULD SEE HOW THEY FINISHED, so we learned nothing — AND THAT WAS WHEN WE WERE VTS-ONLY, NOT PAPER TRADING.** ⇒ ⛔ **THE CONDITION THE DECISION RESTS ON HAS CHANGED. Re-ask it; do not treat it as settled.**

⭐⭐ **NEW MISTAKE SLUG, MINE, n=1: `vendor-docs-unread`.** I measured for hours toward an answer Kraken PUBLISHES. ⛔ **TRIGGER: the object is operated by SOMEONE ELSE — a venue, an API, a hosted service. If we do not control it, its behaviour is DOCUMENTATION BEFORE IT IS DATA. Read the operator's docs, then forums, THEN instrument.** ⚠️ **Self-concealing: every measurement SUCCEEDED, so it felt like progress.** ⚠️ **NOT docs-INSTEAD-of-measure — only measurement found the 27.1%.**

⛔⛔ **LANGSTON'S STANDING RULING ON THE AUDIT: findings survive as MEASUREMENTS and are NOT CERTIFIED AS DISPOSITIONS.** The exposed class is **any sentence asserting behaviour is unintended/undecided/unspecified, WHEREVER IT SITS** — my findings-vs-proposals split was *"the wrong cut, and it fails in your own favour."* ⇒ **uncertified until `#956`/`B-DECIDED-INTENT-INDEX` (3b.g) lands.**

## ★★ A NEGATIVE CONTROL IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT (`#507`; the repo holds the case)

I established a MECHANISM then hung THREE damage figures on it from instruments I never validated. **All three WITHDRAWN; Langston reproduced none.** ★ **The control sat one `GROUP BY` away: maker exits never read the book, so an honest instrument must be SILENT on them.** ⇒ **Applies to a POSITIVE result as hard as to a zero.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ AFTER ANY DISPATCH, READ THE INBOX ON THE NEXT WAKE OF ANY KIND — the watcher missed two Langston replies on 2026-09-02 (12:20, 13:10).** MDT `b1f58a01` stays ACTIVE to 09-07 (Langston ratified 19:00Z; record in `B_PRICE_AGE_TRUTH_PROGRESS_REPORT` §4).
**⚠️ #1 ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER** — ALIAS **CC-C**, display **“ANALYST Claude”**. **Compaction KILLS it.** Arm via Monitor per shared MEMORY 4.5 (`persistent: true`, NEVER Bash run_in_background). **Judge liveness by whether WAKE events arrive; doubled ⇒ TaskStop one.** Then sweep `/var/log/cc-discord-inbox.jsonl`.

## RECENT HISTORY — CLOSED (the repo completion reports are authoritative; do NOT re-narrate here)

⚠️ **CLOSED-BATCH NARRATION CUT — repo completion reports are authoritative. LIVE carries only:** `#618` VOIDED P19-B6 risk-envelope approval (**highest-priority untouched**) · `B-KILLSWITCH-WINDOW` denominator leg → `B-READER-TRUTH` obj-6 · `#632` · `#624` · `#677` (49/241) · ⚠️ **the `%` basis changed at the 07-28 11:57Z cutover.**

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** · **A CONTROL THAT CANNOT FIRE IS THE DEFECT IT GUARDS — write BOTH arms** · **CAPABILITY ≠ COVERAGE: state the time reach** · **NAME THE POPULATION AND THE REF BEFORE THE NUMBER — a deploy time is not a window anchor.**
6. **TWO RULES I AUTHORED are in `CLAUDE.md` (auto-loads — read them THERE): r24.a investigate-before-announce, r29 measurement discipline.**

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (cases: `MISTAKE_PATTERNS.md`).** ★ **Only a MEASURE-TIME GATE has ever caught it.** ⇒ **BEFORE ANY CLAIM: read what the column is DEFINED as · RUN THE CONTROL ON THE OBJECT THE CLAIM IS ABOUT · and when you read a value at a CONSUMER, TRACE ONE HOP UP BEFORE GENERALISING ABOUT THE PRODUCER (F-G-2 §17).** ⛔⛔ **MY CORRECTIONS ARE THEMSELVES WRONG-OBJECTS — RE-DERIVE ONE LIKE A FINDING.**

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` AUTHORITATIVE:** **#734 = PHASE-21 GO-LIVE BLOCKER** (`apm:165` THROWS in live; TWO independent trips) · **#733** (BLOCKS `dt-deploy`) · #687 #688 #689 · **#690 residual: audit-FAILs have NO alert path** · **#692: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07). ⛔ **AMENDED 2026-09-02 (Langston, inside the `#951` window to 09-07): xStock exit-skip alerts are exposure-checked and LEFT ACTIVE — do NOT ack, do NOT resolve; they are the window's signal. I resolved two (PANW/MDT 09:42Z) before his routing landed — the fired rows still count.**

⛔⛔ **NEW DURABLE RULE, LEARNED THE HARD WAY 2026-09-03: NEVER PUT A BACKTICK INSIDE A TAGGED TEMPLATE LITERAL** — my markdown-style `` `code` `` in a SQL comment inside ``sql`…` `` terminated the string and broke the parse of `ready_to_buy_service.ts`; tsc fell 377 → 16 and the push guard refused on exactly the partial-parse signature it exists to catch. **A tsc count far BELOW baseline is a parse break, not a fix.**

★ **OBJ-9 RE-BASE — ANSWER STANDS: DO NOT MOVE `active_fill_max_age_ms` (15,000 ms). The limit sat at ~1.71× the RTH p99 when written at a 1.8 s throttle and sits at 1.00× now (p99 15.07 s at the 4 s throttle) — drift RECORDED, deliberately stricter, and Kyle ruled against relaxing off-hours. ⛔ **THE SESSION REFUSAL SHARES THIS BLOCK USED TO CARRY WERE WEEKEND-CONTAMINATED AND ARE DELETED RATHER THAN CORRECTED HERE — read them from `scripts/analysis/obj9_counts_v2.sql`, never from memory.**

➕ **`#994` KYLE DIRECTIVE, MINE: staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.** OBJ-9's alert-policy requirement; discriminator = feed-wide liveness (the other ~478 books are the control). Converges with Langston's instrument point.
