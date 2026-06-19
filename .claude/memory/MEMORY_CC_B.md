# MEMORY_CC_B.md — Claude New (CC-B) Volatile Working-State

> Per-session working-state for **Claude New (CC-B)**, session `7f66d970-154c-441a-9aa1-e12a77e67cce` (roster-bound). Shared protocols + project-consensus live in `MEMORY.md` (read that too). This file = "what I'm doing / where I am" — I write volatile state ONLY here (Kyle per-session split directive 2026-06-19). Mirror to `.claude/memory/MEMORY_CC_B.md`. Hard cap ~200 lines.

## IDENTITY
Claude New (CC-B), session `7f66d970-154c-441a-9aa1-e12a77e67cce` (roster-bound). Telegram prefix **CLAUDE NEW (CC) SPEAKING:**. Role = batch implementation. Re-arm the wake watcher per shared `MEMORY.md` session-start item 4.5 every session start.

---

## ★★ CURRENT STATE / RESUME HERE (2026-06-19) — AUDIT DONE + REORG PLAN LOCKED

The Active Trading Pipeline Audit is COMPLETE + 3-way APPROVED (`1-system-manual/ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`). Reorganized Phase-19 program LOCKED on **CC-B + Langston** agreement (Kyle released the CC-A-concur dependency 2026-06-19; Langston APPROVED). **AUTHORITATIVE PLAN = `Claude Comms and Packages/Scope Files/P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md` + `PHASE_19_PLAN.md` §1 reorg banner + POST_AUDIT_ROADMAP §6 (2026-06-19).**

**KEY DECISIONS D1-D7:** D1 both-classes **"BOTH IN CODE, ONE LIVE AT A TIME"** (build SHARED pieces for BOTH now — don't crypto-restrict; sequence only live-activation/debug-focus/calibration). D2 shared bugs fixed for BOTH on the spot. D3 both classes paper-active ON by Phase-19 close (wired+working bar, NOT calibrated). D4 Phase-25 calibrate both (crypto comfortable first; xStock may run ∥ Phase 16/20 — refines the 2026-06-08 strictly-sequential call). D5 both ready by Phase 21 → launch live TOGETHER (days-not-weeks safety stagger only if needed). D7 **HARD GATE** = one class active-trading during the validation window (xStock in shadow/VTS until crypto template proven).

**★AUDIT REVERSAL (decision-grade, live-DB confirmed):** fixing #233 (EV inputs) does NOT open crypto — pWin capped 0.60 (`net-expectancy-kernel.ts:110`; live DB `pwin_ceiling=0.60`); binding constraint = Tier-1 fee friction (~1.8% round-trip > edge). Gate-10 unblock = the **FEE LADDER (D6):** rung-1 bigger ~3.5-4% targets (RR≥2.5-3) at TAKER opens trades NOW (low-build = target-floor + liquid-volatile universe selector); rung-2 maker-entry build + asymmetric-stop EV kernel + shared active+VTS maker/taker service; rung-3 pWin-ceiling on MEASURED win-rates (Phase 25). #233 stays as ACCURACY (ONE fix-site at the RTB→promote metadata boundary, per Langston) — NOT the opener. **The RANKING fix** (live picker = `paper-execution-engine.checkRtbPromotion`→`getRankedSignals` sorts anti-predictive finalScore −0.14; the better rankingScore is computed only on the VTS path = inert on active) is the MAKE-OR-BREAK. Shadow-trade layer (P19-B8/19-17) PULLED FORWARD (data engine + selection-quality; telemetry-only).

**★NEXT BUILD = reorg-B1 = recognition completeness (the old B6.5f, RE-SCOPED both-class)** → then rung-1 target-floor + universe selector. §13 homes #328-#331 in RUNNING_ISSUES (dead CriteriaLimiter / dead rankingScore-ranker / two-fee-source / no-regime-flip-exit). Confidence inversion CONFIRMED (B-NEW-36/37/39 decile table) → Phase-25 25-2/3/10. Fee = Tier-1 0.80%taker/0.40%maker BUILT IN (verified VTS reads the same shared `fee_model`). Size/concurrency study = roadmap 25-16. xStock VTS global-fields fix = CC-A's (pushed a93e274c8; recurring → root-cause + tripwire owed by CC-A).

**Coordination note (2026-06-19):** CC-A + I share the GoogleDrive tree → SEQUENCE shared-governance-doc edits (one editor at a time, signal-clear on the wake file). CC-A owns BATCH_CATALOG/PHASE_HISTORY for his B-GOV-2 + B-XSTOCK-GLOBALS batch entries; I own PHASE_19_PLAN §1 reorg + the reorg docs. Per-session MEMORY split is now live (this file).

---

## RECENT BATCH HISTORY (CC-B, newest first — context only; authoritative = completion reports + PHASE_19_PLAN §1 board)

- **P19-B6.5e CLOSED 2026-06-18** (`dbd0a2283`): made the open-path OBSERVABLE (typed `OpenOutcome` + `openFailedByStage` 3rd term in rtb-metrics; I3 invariant `attempts===opened+blocked+openFailed`). Diagnosed: crypto open is NOT broken — it reaches the 11.8B Net-Expectancy gate which HONESTLY rejects on DEFAULT EV inputs. gate-10 was MOVED to B6.5g — **now SUPERSEDED by the fee-ladder reframe (audit).** +#327 dead-import removed.
- **P19-B6.5d CLOSED 2026-06-18** (`3bd3deedc`): carry-the-stamp invariant (one SizingContext=one class=one pipe) across 35 resolve sites + `TICKER_BASE_MIN_LEN=1` resolver widen → cleared the live A/EUR classify alert.
- **P19-B6.5c CLOSED 2026-06-18** (`0b5bb206d`): cwqi DROP migration + pattern→canonical strategy resolution (patterns=TRIGGERS, 19 canonical FIXED).
- **P19-B6.5b SHIPPED** (`d56a0cc1e`) + **B6.5a CLOSED** (`500127614`): per-class active gate (fail-closed JSONB `system_context.active_asset_classes`, AND-gated on per-mode `isEngineActive`); crypto dry-run proved the front half.
- **P19-B6 CLOSED** (daily-loss auto-trip RESTORE) · **B4a/B4b/B4b.1/B4b.2** (xStock wire-in + split-brain isolation + depth-walked fill) · **B5a/b/c** (capture hooks + macro snapshot + Q-D probe) · **B3a/b** (OrderPlacer port + #137/#139) · **B2** (Option-A live-reuse + paper internal-fill decision) · **B1** (test-suite 0/0). All DORMANT til B7b.
- **B6.5f (recognition, now reorg-B1, RE-SCOPED both-class):** the old crypto-quote scope `P19_B6_5f_SCOPE.md` @ `09bf82da1` — 23 knownQuotes + longest-match-first + crypto-quote eligibility gate + `classify-unknown-quote` alert; Langston Step-1 PROCEED locked. Re-scope for both classes per D1/D2 before implementing.

## ALERTS ARMED (CC-B)
- B-NEW-53 proof-of-capture parity re-run `7362f63f` → 2026-07-05.
- (Others — read `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` per session-start item 3 every turn.)
