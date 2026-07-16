# MEMORY_CC_B.md — Claude New (CC-B) Volatile Working-State

> Per-session working-state for **Claude New (CC-B)**, session `f9ed24c3-9a40-4fa7-a9c4-f6c479801602` (roster-bound). Shared protocols live in `MEMORY.md` (read that too). Write volatile state ONLY here; mirror to repo `.claude/memory/MEMORY_CC_B.md`. Hard cap 200 lines / ~24KB. **Lean rule (Kyle 2026-07-01): the moment a batch CLOSES, collapse it to ONE line — the repo completion report is the record.**

## IDENTITY
Claude New (CC-B). Discord display name **"NEW Claude"** (exact `--sender` value or you self-wake). Role = batch implementation. **Arm the wake watcher via the Monitor TOOL (`persistent:true`), NEVER Bash run_in_background** (a `while true` never exits → never wakes you). Re-arm on resume/compaction — judge liveness by recent WAKE events, never TaskList; doubled events = duplicate watcher → TaskStop one.

## ★FEEDBACK (standing rules, Kyle-flagged — keep in full)
- **ack ≠ resolve (2026-07-10):** after acting on ANY alert run `system-alerts resolve <FULL-UUID> --by <session> --evidence "..."` — ack only CLAIMS. Verify the STATE field, never the exit code. §10.5 sweeps must ALSO list `state=acknowledged`. A cited home batch must be OPEN.
- **EPISTEMICS (2026-07-10, the big one):** separate (Q1) what the RULE+artifact say = decidable, GO READ, from (Q2) what a human reasoned = undecidable without provenance. An asserted ABSENCE needs presence-evidence (`path:line`); ENUMERATE, don't count; a matching NUMBER is not a matching THING. **A FAILED READ MUST PRODUCE A REFUSAL, NOT A RECOLLECTION.** **NEVER `2>/dev/null` a governed read** (PreToolUse hook enforces; CLAUDE.md rule 22). Label evidence against your own interest; build gates, not sentences.
- **Read-at-the-ref before reframing (2026-07-13, bit twice):** verify code mechanisms AT CODE before filing/asserting.
- **Shared working tree (2026-07-13):** DIFF a shared file before staging; PRE-PUSH ENUMERATE `git log origin..HEAD`; check CI before push; stage only at the moment of commit (B8.7 sweep incident); migrations = gitignored → `git add -f` + MANIFEST bare filename.
- **Don't over-think (2026-07-01):** when a batch's core is simple, say it simply and build it.
- **Pre-audit must CATCH design/placement issues itself (2026-06-21):** "could this live in / duplicate an existing component" by READING modules + SIM.
- **Honest engineering view even against Kyle's pushback (2026-06-20).** Gates/filters VISIBLE in Filter Diagnostics wherever they sit.
- **"Autonomously iterate" = full 11-step workflow WITH Langston**; CI 4-green before deploy; only stop on a genuine Kyle-only block. Desktop plain-language summaries EVERY time + ALSO Discord (both channels).
- **Langston follow-through:** "dispatched" ≠ "reviewed" — re-poke ~8-10 min. STATELESS per-invoke: context in prompt or staged file.
- **Canonical terms, never paraphrase:** SQE, MCE, TCL, TEC, signal orchestrator, RTB, VTS (has NO SQE), IMF/DBS/LQ/VN/DI, regime, xStock, live/paper mode.
- **§9.4 name-the-fix (2026-07-13):** the fork closes AT filing — no either/or homes.
- **Kyle fix-on-find (2026-07-16, standing):** legacy hardcodes/hidden fallbacks/deferred items get a determination AT surfacing — fix now, or an explicit exception + a named home. No confidence/quality/ranking gate lives OUTSIDE the SQE without a JUSTIFIED-OUTSIDE ruling (Langston's test: blocks on quality → remove/consolidate; blocks on drift/staleness/integrity/live-execution-state → justified, documented).

## ★★★ CURRENT STATE (2026-07-16 evening)
**P19-B8.8 ✅ CLOSED (sizing-fallback fail-loud sweep; head `7de34c03d`, CI 4-green `29523500782`, deployed + engine CONTINUE `paper_-i05tFriAB`; Langston Step-1/2/4 ALL PASS).** The sizer's own 3+3 fallback layers deleted (incl. null→100 exposure-UNCAP); refusal contract = invalidResult→SIZING_INVALID + rail (10 consecutive → ONE dedupe-keyed alert); kill-switch/LPCP/goal-feasibility/trade-safety×2/routes-PHANTOM-ROW-404/m5e all swept; 21 tests. #516 RESOLVED; #518 (dormant LPCP, Phase-20) + #519 (daily-loss runtime trip confirm, Phase-20) + #520 opened. `P19_B8_8_COMPLETION_REPORT.md`. Awaiting Kyle ack (batch fully governed; Langston Step-8 note: rail + engine-halt finding relayed).

**★ #520 (Step-8 finding, FOLDED INTO #512):** the engine SILENTLY HALTS on every pm2 restart — `[41F-B][RECOVERY]` orphan-closes the running session ~5 min post-boot; auto-resume (R9.3.HF-4.FIX, active-engine-service :1145) never wins ("Session missing required fields" heartbeat skip = likely discriminator). Manual `{"mode":"continue"}` POST to /active-engine/start after EVERY deploy until fixed.

**★ NEXT QUEUE (Langston-consensed order, Kyle pre-agreed):** ① **#512 B-STAGING-LIVENESS-WATCH — FRIDAY 2026-07-18 DEADLINE** (now TWO objectives: the watchdog + the #520 resume fix). ② venue-only-at-source batch (remove backup-price FETCHING; invariant lives at active-execution-engine.ts:933 — citation corrected; display-chain REST/LKG evidence = the EQuery:Unknown-asset-pair noise). ③ FD tabs: stale dormancy banners + per-scan/24h funnel views. ④ B8.7 Step-9 layout-identity rebuild (tables EXACTLY match VTS; layout-map to Langston BEFORE code; + hydration artifact: Paper header strip briefly "15 / 0" vs card "15 / 15") + OBJ-5 VTS additions (Kyle APPROVED: cost 5-col breakdown + Reason badge + maker-exit details into VTS; skip confidence).

**★ OPEN WATCHES:** first REAL xstock CLOSE = B8.5 AC2 (⚠ the two 07-16 16:26Z closed rows are B7.2c never_filled maker pendings, NULL pnl CORRECT — not closes; 8 xstock + 7 crypto positions live) → then #237 NOT NULL + B8.5 governance close (SysManual/SIM marks-architecture notes per Langston condition + doc-gap alerts). First maker-exit deadline CONVERT (Langston's 4 discriminants: fee_mode→taker, non-zero exit_slippage, outcome=convert, taker-rate fee). Crypto pass-rate watch vs baseline (gen 14,335 / passed 313 / Conf 4,051). Monitors: bzp6fxwx0 (wake watcher), bljpl80w8 (trade opens/convert/rails). DB 136 GB = STORAGE_POLICY-known (Wave-D ~6× lands 08-01); dashboard banner "10 GB limit" = stale display threshold (flagged, unhomed cosmetic).

**xStock unblock state (B8.5 OBJ-6, closed):** gateShadowMode at 4 sites (3 SQE calls + engine 11.7S); #514 = two-stage regime-wiring decision (Phase-19-close data checkpoint, else Phase-25); all 3 shadow sites die together on the bury ruling.

## OTHER OPEN
- **B-NEW-53 parity:** 25-12 data-blocked until accrual; alert `83afc970` fires 2026-08-03T12Z (MINE — re-run provenance replay vs ≥99% gate; check crypto row DENSITY first).
- CC-A lanes (not mine): B-SEC-HARDEN follow-ups · #499 · #501 harness · P25 research doc.
- **SCORING REDESIGN (Kyle-RATIFIED):** `P25_SCORING_STACK_PRESTUDY.md` PART II = locked Phase-25 blueprint (finalScore RETIRE · hybridScore two-layer model+Platt · regimeWeight SPLIT · ZERO new hardcoded decision constants).

## RECENT BATCH HISTORY (one-liners; repo docs authoritative)
- **P19-B8.8 (07-16):** sizing-fallback fail-loud sweep — see CURRENT STATE.
- **P19-B8.7 (07-16):** trade-table parity — CLASS/Strategy/slots defects root-caused; +8/+5 VTS-mirror columns; fallback family safe-degrade; dynamic-slots deleted. #515/#516/#517 homed. Layout-identity rebuild = Step-9 pending. `P19_B8_7_COMPLETION_REPORT.md`.
- **xStock marks fix (07-16, B8.5 mini-cycle):** equities-WS single-source for xstock marks (`getLatestEquityTick` + BLOCKING staleness knob 90s + unconditional short-circuit engine:933); withoutPrice 4-5→0 across 1,853 cycles; Kraken spot REST carries NO tokenized equities (KNOWN_NONEXISTENT_NAMES). 5 alerts resolved w/ evidence.
- **Gates-outside-SQE sweep (07-16):** 25 engine refusal sites audited; 11.8B netEV backstop + AMR execution_entry + MAKER_MARKETABLE + B7.1 geo-reject JUSTIFIED-OUTSIDE; 11.7S floor → shadow site-4; GEO_DROP enumeration shipped. `GATES_OUTSIDE_SQE_SWEEP.md`.
- **B8.5 OBJ-6 xStock unblock (07-16):** HF8/HF9 → gateShadowMode (root cause: fabricated regimeStability from cold-start defaults); 10 xstock opens followed. #514.
- **P19-B8.5d (07-16, CC-A):** sizing tune-3 — $2,250 anchor, 6.67%/100%, $145.58 proven.
- **P19-B8.6 (07-15):** maker TARGET-exits shipped + runtime-proven (fills at limit price, maker fee, slip 0); convert watch open. Co-shipped the uncommitted B8.5 engine leg (Langston ⑤ catch). `P19_B8_6_COMPLETION_REPORT.md`.
- **B8.5 switch-on arc (07-14/15):** crypto STAGE-1 ON (fee wall real: 0 organic admits) → exploration lane (3-way sealed; 4-field stamp; anneal 60-informative-closes; budget 50) → 4 live-fire mini-cycles (warmup registration, stamp carry, queue-time book warm #506, checksum-as-sequence book-deletion kill #507) → first orders; soak fix-round A-E (toFixed, mode-sync, balance write-through single-writer, venue-only actionable pricing, XRP/GBP poison rows annotated); #512 outage owned (migration-first runbook). B8.5 batch itself still OPEN pending AC2 + governance close.
- Earlier (B8.5a/b/c, B8.1-B8.4c, B-GOV arcs, B7.2 family, B-RENAME, reorg-B3/B4): repo completion reports.

## OPS NOTES
- Engine restart after each deploy: POST /active-engine/start `{"mode":"continue"}` (until #520 fixed). Deploy chain: `npm run build > /tmp/build.log 2>&1; echo BUILD_EXIT=$?` — NEVER pipe build to tail before pm2 restart (masks failure).
- Discord-history-via-REST when inbox log stale (`curl -H "Authorization: Bot $DISCORD_BOT_TOKEN" .../channels/$DISCORD_CHANNEL_ID/messages`).
- Bench: copy changed files GDrive→C:\dev, `node scripts/check-tsc-baseline.mjs` + `npx vitest run`; known-pre-existing fails = the b79-0n routing pair (no local postgres). Baseline 2279+new.
