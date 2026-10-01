# B-XSTOCK-BID-TRIGGER-RELAND (row `3n.q7`) INCREMENT 2 — STEP-4 CHANGE LIST

## Dispatch header (`workflow-04-code-review`)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `sub_batch` (scope header; Langston ruled it STANDS for increment 2 on `4cae3f6e`, conditionally: SYSTEM_MANUAL §3.5.1 + the SIM entry are REQUIRED Step-10 rows) |
| ii | **the class's doc set** | scope — `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §INC-2 r2 (present, approved 2026-09-30T13:11Z) · pre-audit + plan — `…/B_XSTOCK_BID_TRIGGER_RELAND_INC2_PRE_AUDIT.md` (present; cleared 13:59Z except P4, P4 r3 with Langston) · change list — this file (present) · SIM, SYSTEM_MANUAL, PHASE_19_PLAN row `3n.q7`, BATCH_CATALOG, CHANGES_AND_FIXES — Step 10 (owed, plan P8 / P8 r2) · completion report — at the re-land (increment 3; the batch is declared OPEN in `GOVERNANCE_EXCEPTIONS.md`, row 2026-10-01T01:10Z) |
| iii | **Step-2 reference** | `B_XSTOCK_BID_TRIGGER_RELAND_INC2_PRE_AUDIT.md` at the ref |

**Nothing here changes a trading decision.** The arm resolves `false` in production; everything else is a test or an offline script.

## Commits (all on `migration/aws-supabase`)
| commit | plan item | files |
|---|---|---|
| `9c82d1e10` | **P1** the `spread_blown` arm, OFF · **P9** `trail=prior`, fence slice | `book-state.ts` (+19), `book-state-config.ts` (+4), `xstock-exit-frame-log.ts` (+13/-1); tests: `b-xstock-feed-sanity-book-state` (+47), `b-xstock-bid-trigger-reland-frame` (+16/-2), `b-price-side-obj8-reseed-selfvalidation` (+1) |
| `258c97c5c` | **P6** OBJ-5 (V)'s overnight stretch + the replay's double count corrected | `scripts/analysis/b_xstock_bid_trigger_v_replay.py` (NEW, 125) + pre-audit §0 |
| `7cf32622c` | **P5** the false-hollow classifier + its export | `scripts/analysis/xs_frame_false_hollow.py` (NEW, 259), `xs_frame_false_hollow_snaps.sql` (NEW, 10) |
| `d105a676c` | **P3** OBJ-3, the chain through the real exit loop | `server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` (NEW, 447) |
| `91c4c6f4a` | **P4 r2/r3** the durable corpus extractor | `scripts/analysis/xs_frame_extract.sh` (NEW, 113), `xs_frame_extract.selftest.sh` (NEW, 33) |
| `f5506512b` | **P4 r4** the app reflog archived each run | the extractor + self-test; this change list |
| *(this commit)* | **P4 r4 folds** (Langston 01:14Z): the bias restated; two reflog self-test arms; **P5 r2** the reflog CHAIN check; the stray non-UTF-8 byte | the extractor, its self-test, the classifier, the pre-audit |

## Load-bearing hunks

**P1 — `book-state.ts`, after arm (i):**
```ts
if (cfg.spreadBlownEnabled && spreadFrac !== null && spreadFrac > threshold) {
  reasons.push('spread_blown');
  return { state: 'hollow', reasons, inputs };
}
```
`BookStateConfig.spreadBlownEnabled: boolean` is REQUIRED (the compiler listed the two test literals). `book-state-config.ts` resolver: `spreadBlownEnabled: false,` — a code constant, no knob, no seed, no boot change (your (a)). Mutation: dropping the flag check reds **10** feed-sanity tests (the arm is behaviour-bearing when on); the OFF test reads the MDB frame `two_sided` exactly as before.

**P9 — `xstock-exit-frame-log.ts`:** `trail=prior` when `trail` is null and `thr` is set (the prior-frame fallback), distinct from `trail=none`. The `readThresholdBasis` fence slices to the function's closing brace.

**P3 — the chain test.** The REAL `checkOpenPositions` + `checkExitConditions` on a stub `this`; the tracker and predicate unmocked, reset per test; config injected through `resolveBookStateConfigSync`. Positive: seed → validate → evaluate ×4 → `spread_blown` SKIP, SKIP, YIELD (alert, `book_state_yield_refused`, ring retained) → `SEED_IMPLAUSIBLE` + REFUSE ×3 → recovery REFUSE ×2 → `SEED_ESCAPED` (runMoves 3) → REFUSE (validating) → evaluator `stop_hit` → `closePosition` once, asserted on its arguments: `stop_hit`, the recovered price, `exitProvenance { decisionPrice, bookStateAtDecision: 'two_sided', bookStateYielded: false }`. Negative: never recovers ⇒ 20 refused ticks, no close, one alert (the blown mid IS below the stop). Control: the same frames with the arm off ⇒ the MDB false stop fires on the blown mid. **Stated limit:** no `atr_at_open`, so the evaluator's ATR-floor branch decides, not the trailing machine. Mutations (run by hand, restored): guard forced off ⇒ red; escape forced never to fire ⇒ red. Drafted by a helper agent in an isolated worktree; reviewed line by line and re-run here (3/3).

**P6 — the replay correction.** The source (`/home/deploy/8ap4b_br_sim.py`) counted a yield frame as `blown`+`yield` and an escape frame as `escape`+`unvalidated`. Corrected: RTH **128 of 333,431** (was 131 of 333,434), off-hours **4,743 of 245,614** (was 4,762 of 245,633); `--legacy` reproduces 131 / 4,762 exactly. New: arm ON, **21 of 68 symbols** have an off-hours stretch > 1 h with no exit decision (arm OFF 0 of 68); longest SYY 13.3 h. SNAPSHOT proxy, one day; limits in pre-audit §0.

**P5 — the classifier.** Runs end at `frame=none`, back inside the threshold, the position's last frame, a > 10 s gap, or a restart/deploy boundary. FALSE / TRUE / NOT_COMPUTABLE against the per-frame `sl=`/`tp=` on prints (strict `volume_24h` rises) inside the run or ≤ +90 s; +5/+30 min sensitivity with flip counts; INCONCLUSIVE when the primary and +5 min majorities differ; the three biases printed every read. `--self-test`: MDB-shaped ⇒ TRUE, real move ⇒ FALSE, frozen `last` below the stop with no volume rise ⇒ NOT_COMPUTABLE (never FALSE), a restart splits a run — PASS. The export is bounded by time AND symbols (all symbols is ~1,100 rows a minute).

**P4 — the extractor.** Stderr only; sequential gzip so a manifest row never precedes a complete archive; contiguity (seen-last-run and gone unextracted ⇒ gap, exit 3); pre-loss reach rung (oldest file < 2× cadence); boundary file (new pm2 restart markers + the deploy record verbatim each run; pm2.log shrinking ⇒ flush warned; an unreadable record or pm2.log ⇒ gap). **P4 r4:** the deploy record is the self-dating primary; the app clone's reflog (`.git/logs/HEAD`) is archived each run by byte offset (shrink ⇒ reach alert + re-read; unreadable ⇒ gap, exit 3); the degraded path loses SHA attribution, never a boundary (runs split at every pm2 restart). Self-test **15/15** PASS (incl. two intra-cadence deploys recovered once each, reflog shrink, reflog unreadable). The classifier (`--boundaries`) asserts the reflog `old → new` chain and names any break; its self-test **6/6** PASS; it parses real staging reflog + pm2 lines (3 + 2, chain intact). **Not yet installed** — the crontab line goes to Infra Claude after this review.

## What I want attacked
1. P3's harness: is anything the decision depends on stubbed that should run real? (The four mocked decision-adjacent reads are `resolveTECConfig`, the mark-staleness and σ knobs, and the frame source.)
2. P5's run-ending rules: is 10 s the right gap at a ~1.5 s loop, and does ending a run at "back inside the threshold" lose the case where a blown book oscillates around the threshold?
3. P4: the contiguity check sees a file that appeared AND vanished between two runs only through the reach rung — is that the right split?

**Verification so far:** `npx tsc --noEmit` 339 = 339 (test files are excluded from tsc; vitest compiles them); 248 related unit tests + the 3 chain tests green; both script self-tests PASS.
