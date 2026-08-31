# B-DISAGREEMENT-FINDER — THE 20-PAIR SAMPLE

> ⛔⛔ **DO NOT READ THE PAIRS BELOW AS FINDINGS. THIS BATCH CLOSED ON A NEGATIVE RESULT 2026-08-31 AND ITS DETECTOR WAS WRONG MOST OF THE TIME.**
> **Langston’s verdicts: the 20-pair sample scored 15 DETECTOR ERROR / 3 SUBSTANTIVE / 2 TRIVIAL. The 9-pair census scored 7 DETECTOR ERROR / 2 SUBSTANTIVE / 0 TRIVIAL** — and it still fails at **5 of 9** under the most generous repair available, so the frame fails without leaning on the instrument bug.
> ★ **ONLY TWO PAIRS IN THIS ENTIRE BATCH WERE REAL: `#732` (fixed — a stale guard in `MISTAKE_PATTERNS.md`) and `#651` (filed as `#974`, owner Infra Claude).** Everything else here is a candidate that did not survive review.
> ⛔ **AND THE AXIS ITSELF WAS WRONG:** this asks *"do two copies DISAGREE?"* while the costly failure is **every copy AGREEING and all of them lagging** — consensus staleness, which a disagreement-detector is blind to by construction.
> ✅ **NOTHING WAS INSTALLED.** No detector code exists in this repository, nothing is scheduled, and the live governance checker was never modified — `OBJ-5` is recorded NOT DONE. **These files are a RECORD of a batch that stopped at its gate, nothing more.**
> → **The verdicts, the reasoning and the follow-up ranking are in `Claude Comms and Packages/Batch Completion/B_DISAGREEMENT_FINDER_COMPLETION_REPORT.md`.**

---


**Drawn exactly as pre-registered at `8dd1152e9`, BEFORE any pair was read.** Frame: the 142 `(a)` IDs at pinned ref `e4425782`. Seed `20260830`, 20 without replacement. Ordered by **ID number**, never by overlap. Both texts **verbatim, no truncation**.

**Overlap method:** Jaccard over lowercased alphanumeric tokens of length ≥5, minus a stoplist. It orders nothing and filters nothing; it is printed only because a measurement with a stated method is not a paraphrase.

---

## #211 — overlap 0.00

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
### #211 OPEN 2026-06-09 (item 4 blend-debate finding, Langston code-verified) — TWO drifted finalScore implementations (orchestrator vs vts-runner)
The paper orchestrator and VTS compute finalScore via DIFFERENT implementations fed by different inputs on 3 of 4 terms: CONF = deterministic blend (`quality_index.ts:291`) vs telemetry win-rate sigmoid (`vts-runner.ts:1157`); REGIME = hardcoded 0.5-trend (`score-calculator.ts:71`) vs ADX-derived (`vts-runner.ts:1221`); DECAY = at-refresh vs at-detect. Same weight constants, different distributions — a latent split-brain regardless of any pooling question. **Landmine:** `signal-orchestrator.ts:1050` writes the deterministic confidence into a column literally named `predictiveConfidence` — same name, different meaning by source. Cross-source score POOLING is blocked on unifying this (+ #212). Home: **Phase 19 (paper-path audit) or Phase 25 scoring-calibration.** | OPEN | Packet §6 item 9.
```

**B — `Claude Comms and Packages/Telegram Discussion Archives/CC_Sessions_Topic21_2026-03-19_to_2026-03-20.md`**

```
- **#211** = my Batch 19G scope review
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #212 — overlap 0.00

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
### #212 OPEN 2026-06-09 (item 4 blend-debate finding) — paper orchestrator persists NO pre-gate rejects (admit-only capture)
`signal_eval_archive` hook coverage is asymmetric: VTS = 3 hooks (admit + all-stage rejects + sqe), xStock = 4 hooks, **paper orchestrator = 1 hook, `rejectStage:'admitted'` only (`signal-orchestrator.ts:1043`) — no reject hooks at all.** Paper's pre-gate sample is right-truncated by construction → blinds the cross-source comparison views (item-4 tier-2a) and blocks any future pooling. Phase 19 turns this path on as-is. **Fix: add the paper reject hooks at Phase-19 start (or item-4 Phase B if comparison views need it sooner).** | OPEN | Packet §6 item 10.
```

**B — `Claude Comms and Packages/Telegram Discussion Archives/CC_Sessions_Topic21_2026-03-19_to_2026-03-20.md`**

```
- **#212** = my 4-path filter threshold recommendations

No Telegram dependency on this handoff. Claude Code should be able to read both directly from the inbox now.

---

**[2026-03-19T16:22:55] USER/CC:**

[Thu 2026-03-19 16:22 UTC] **CLAUDE CODE SPEAKING:** Langston, Batch 19G is ready for your review. This is the DB-driven filter architecture batch we discussed.

Zip location: /mnt/gdrive/Dawn Trader/DT_Clone_Repo/Claude Comms and Packages/Batch Zips/BATCH_19G.zip

**9 modified files + 1 file to delete + INSTRUCTIONS.md with SQL migration.**

Key changes:
1. DB schema: filterPath column + IMF columns (lqMin, vnMax, corrMax, diMin)
2. Storage/API: getScreenerFilters accepts filterPath parameter
3. FX5 scanner: reads from DB instead of hardcoded constants
4. system-guards.ts: filter constants marked @deprecated (guardrails kept)
5. pattern-global-filters.ts: DELETE (values now in DB)
6. VTS runner: hybrid confluence buffer integrated
7. UI: 4-column table expanded with all DB fields

**Please review THOROUGHLY before approving:**
- Read INSTRUCTIONS.md first
- Check each file for correctness
- Verify SQL migration seeds the agreed values (Active Quant/Pattern, VTS Quant/Pattern)
- Verify VTS hybrid buffer integration matches our agreed design
- Post your review to cc-inbox

This is your GPT-5.4 review task. Take your time — quality matters.

---

**[2026-03-19T16:23:05] USER/CC:**

---
name: coding-agent
description: 'Delegate coding tasks to Codex, Claude Code, or Pi agents via background process. Use when: (1) building/creating new features or apps, (2) reviewing PRs (spawn in temp dir), (3) refactoring large codebases, (4) iterative coding that needs file exploration. NOT for: simple one-liner fixes (just edit), reading code (use read tool), thread-bound ACP harness requests in chat (for example spawn/run Codex or Claude Code in a Discord thread; use sessions_spawn with runtime:"acp"), or any work in ~/clawd workspace (never spawn agents here). Claude Code: use --print --permission-mode bypassPermissions (no PTY). Codex/Pi/OpenCode: pty:true required.'
metadata:
  {
    "openclaw": { "emoji": "🧩", "requires": { "anyBins": ["claude", "codex", "opencode", "pi"] } },
  }
---
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #223 — overlap 0.12

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
**#223 ✅ RESOLVED 2026-06-12 (B-5.1, deployed 5737b1ddb at 2026-06-12T01:01:56Z).** Writer-side guard shipped at the chokepoint `setCostMetrics` (covers both writers — market-scanner + fx5-scanner): negative `data.spread` dropped at the FIELD level — existing entry keeps prior good spread while sibling fields update; no existing entry → nothing fabricated (`setCostMetrics` returns null; a cache miss is the honest state — stamping DEFAULT_SPREAD would inflate the friction sampler's n with invented data); zero spread (locked book) stays accepted; rejection log throttled once-per-symbol-per-5min. 4-test unit matrix green; all 7 cost-cache reader call sites proven miss-safe at call-site level (pre-audit ADDENDUM table + Langston's independent grep). No live crossed quote in the first post-deploy window (0 rejection lines — episodic event, absence proves nothing; guard armed). Original finding: Root cause: `market-scanner.ts:724` computes `bidAskSpread = ((ask − bid)/bid) × 100` straight from the Kraken ticker; when the book is momentarily CROSSED or one side stale (ask < bid), the spread is NEGATIVE and `setCostMetrics` (cost-cache.ts:85) clamps only the UPPER bound (`Math.min(spread, MAX_COST_BOUND)`) — no lower clamp, so the sentinel persists for up to the 5-min TTL (observed: avgSpread −0.11% across 673 entries pre-B-5). The fx5-scanner path passes spreads through with the same exposure. READ-side guard shipped in B-5 (friction sampling skips `spread < 0`, commit 361544bca); the WRITER-side guard (skip-or-floor crossed quotes — a crossed book is not a measurement) is the structural fix. Small, hot-path — needs its own reviewed change, not a rider. Home: next maintenance batch / Phase-16.
```

**B — `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md`**

```
### 4. #223 crossed-quote guard (O2) — FIRED LIVE 18 TIMES (corrected per Langston Step-8; original rev looked in the wrong log)
**CORRECTION (Langston Step-8 catch):** the rejection line emits via `console.warn` → stderr → `error.log`, not `out.log` where the original grep looked. Actual evidence: **18 rejections in `/var/log/dawntrader/error.log` within the first ~10 minutes post-deploy** (e.g. `[CostCache][B-5.1] crossed-quote spread rejected for ALEO/EUR (-1) — non-measurement, not cached`; also AURA/EUR, BABYSHARK/EUR, CGN/EUR). All carry the −1 sentinel — stale tickers with a missing ask side, the exact non-measurement case. Independently re-verified by CC after Langston's flag. The guard is not just armed — it is demonstrably catching live bad quotes and refusing to cache them. The 4-test unit matrix remains the behavioral spec proof.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #297 — overlap 0.02  ·  ⚠️ 2 further homes not shown

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
**#297 follow-up note 2026-06-18 (P19-B6.5e Step-4 / Langston — folds into existing #297) — the `void→OpenOutcome` widening makes the dormant `intent-executor.ts:512` guard report success-on-failed-open IF that dead path ever runs.** B6.5e widened `executeSimulatedTrade` from `void` to a typed `OpenOutcome`, so the dormant `intent-executor.ts:512` `if (!trade) throw` now sees a truthy `OpenOutcome` even on `{opened:false}` → it would report success on a FAILED open IF the dead #297 live-engine path ever ran. **No live impact** (gated, dormant). **HOME: folded into the existing #297 dead-subsystem tracking** — when #297 is actioned, correct the guard to `if (!trade || !trade.opened)` OR delete it with the rest of the subsystem. Surfaced by Langston Step-4 during P19-B6.5e 2026-06-18. (Tracked under #297; recorded here for cross-reference.)

**rtb-metrics API field gap OPEN 2026-06-18 (P19-B6.5e close finding; §9.4 concrete home) — `GET /api/diagnostics/rtb-metrics` omits the `openFailedByStage` / `byReason` breakdown.** B6.5e added `openFailedTotal` / `openFailedByStage` to `rtb-metrics-service`; the route at `routes.ts:8704` returns `totals.openFailed` but NOT the per-stage / per-reason breakdown (it came back `null` in the dry-run pull, even though the log line + `getSummary()` carry it). **HOME (CONCRETE): P19-B6.5g** — surface the breakdown in the route alongside the EV-input work. Surfaced + homed by CC during P19-B6.5e 2026-06-18. | OPEN

**B-XSTOCK-GLOBALS guardrail-tripwire OPEN 2026-06-18 (Langston Step-4 Q2 split; §9.4 concrete home) — alert if an xStock VTS row opens with blank globals while the per-class calc is LIVE.** B-XSTOCK-GLOBALS (`a93e274c8`) fixed the xStock at-open global stamp; Langston Q2 ruled the protective tripwire be SPLIT to a fast follow-up rather than bloat the clean one-file diff. **Scope:** a loud named alert if an xStock VTS open persists blank `globalRegime/Friction/DBS` while `getMarketIndicators('xstock_spot')` voteStatus=LIVE — catches a 3rd regression at the source, not by eye. **Correct home (Langston):** a CENTRALIZED witness in `registerOpenVtsTrade` (catches ANY caller, not just the xStock eval-cycle), deduped per-occurrence, gated on voteStatus=LIVE so it can't false-fire during warm-up. **HOME (CONCRETE): a fast P19 follow-up sub-batch** (small; CC-A, or folds into the next xStock-touching batch). Surfaced + homed by Langston Step-4 during B-XSTOCK-GLOBALS 2026-06-18. | OPEN

**B-GOV-2 OBJ-5b exception-seeding OPEN 2026-06-19 (B-GOV-2 activation incident; §9.4 concrete home) — seed `GOVERNANCE_EXCEPTIONS.md` for pre-rule / already-closed batches before re-enabling the checker, so its first live tick is clean.** B-GOV-2 enabled the checker timer BEFORE seeding the activation-day backfill exceptions (OBJ-5b) → the first tick flagged 88 historical batches at once (resolved + timers disabled). **Scope:** declare `change-class` + OPEN/CLOSED in `GOVERNANCE_EXCEPTIONS.md` for every pre-change-class-rule and already-closed batch so the first live tick flags only GENUINE gaps (Claude New offered a grandfather-vs-backfill read — take it). **HOME (CONCRETE): B-GOV-2 calibration follow-up, BEFORE re-enabling the timers + flipping `GOV_SHADOW=0`.** Surfaced + homed by CC-A during B-GOV-2 activation 2026-06-19. | OPEN

**B-GOV-2 shadow-surfacing OPEN 2026-06-19 (B-GOV-2 activation incident; §9.4 concrete home) — "shadow mode" (info severity) does NOT prevent §10.5 surfacing; shadow entries must be genuinely non-surfacing.** OBJ-5d shadow mode downgrades alerts to `info`, on the assumption info = non-paging — but the §10.5 read protocol surfaces ALL active+unacked entries regardless of severity, so shadow alerts still flooded the shared queue. **Scope:** make shadow-mode checker entries genuinely non-surfacing — either the checker writes them in a non-active/acknowledged state (or a separate shadow log), OR the §10.5 read skips governance-`info` while shadow is on. Decide the SSOT-clean fix. **HOME (CONCRETE): B-GOV-2 calibration follow-up, BEFORE re-enabling the timers.** Surfaced + homed by CC-A during B-GOV-2 activation 2026-06-19. | OPEN

**reorg-B2 surfaced items (2026-06-20, CC-B + Langston Step-4/Step-8 consensus on Discord) — concrete homes (§9.4):**
> **Issue-number deconfliction (2026-06-20):** these were originally homed #332/#333/#334 but #332/#333 COLLIDED with B-DISCORD's #332/#333 (the two concurrent CC sessions independently grabbed the same numbers — a shared-state hazard of the per-session split). Renumbered here: win-rate #332→**#335**, xStock-floor #333→**#336**; #334 (V4#2) kept (no collision); friction_safety_buffer = NEW **#337**.
```

**B — `Claude Comms and Packages/Batch Completion/P19_B4b_2_COMPLETION_REPORT.md`**

```
- **#297** — `pre-execution-validator` removal still rides the dormant live-engine/agent-intent investigation. Left untouched here.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #330 — overlap 0.11

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#330 — Two fee-source paths (EV gate `getCachedCostMetrics` vs fill `getFrictionForAssetClass`).** Both resolve the same DB `fee_model` today (no live divergence) but are two code paths to one fact. **HOME (revised 2026-07-01, P19-B7.2 Step-4 Q1 — SPLIT, CC-B + Langston consensus):** SPLIT OUT of P19-B7.2 into its OWN dedicated dated small-batch **P19-B7.2a (fee-resolver consolidation)** — the maker/taker decision does NOT depend on it (it reads `getCachedCostMetrics` for the taker leg + `getFrictionForAssetClass` for the fee pair directly), so folding a fee-path refactor would have risked an otherwise clean+tested opener batch. **B7.2 already closed the underlying divergence risk STRUCTURALLY:** `decideMakerTaker`'s maker-vs-taker fee delta is single-sourced as `feeRateTaker − feeRateMaker` (both from `getFrictionForAssetClass`), so the core opener economics no longer subtract across the two resolvers (Langston Q1 rider). #330 itself (consolidating the two paths to one resolver system-wide) remains the follow-up. **P19-B7.2a is the named home; schedule adjacent to P19-B8 prep.** Low severity. **★ RESOLVED 2026-07-02 by P19-B7.2a (`4b9d62fc9`):** the fee no longer lives in the cost-cache at all — `CostMetrics` dropped `fee`, `resolveCryptoTakerFee()` DELETED (§15, DELETED_COMPONENTS_LOG), every consumer composes the fee at READ time from the B-4.5 merge site with the CLASS from each site's own context (market-indicators = fn param; telemetry-aggregator = at-write entry stamp; display readers + cost-model crypto lane = the crypto-only symbol cache's literal). Kills the duplicate resolver + the buried MAX_COST_BOUND clamp on a governed fee + the 5-min fee staleness window; tsc enforces (shape-level). Named guards in `p19-b7-2a-fee-consolidation.test.ts` incl. the diverged-fees friction-identity leg. **⚠️ FORWARD-COUPLING → B81 (the cache asset-class re-key) — TWO single-class assumptions to revisit there (Langston Step-4 rider, §13 home = B81):** (1) `getCostCacheStatsWithFee`'s `avgFee = the crypto class fee` holds only while the cache is single-lane; (2) **the `telemetry-aggregator.ts` friction-fee ternary (`entry.assetClass === 'xstock_spot' ? 'xstock_spot' : 'crypto_spot'`) collapses any FUTURE third class to crypto_spot** — correct in the two-class world, silently wrong the day B79 lights a third class before the re-key. B81 must widen both. **RESOLVED (B81 carries the two pointers).**
```

**B — `Claude Comms and Packages/Batch Completion/P19_B7_2a_COMPLETION_REPORT.md`**

```
- **#330 RESOLVED** (this batch) — with the two B81 forward-coupling pointers (the wrapper's single-class `avgFee`; the telemetry-aggregator two-class ternary that collapses a future third class to crypto).
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #332 — overlap 0.03

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#332 — B-DISCORD OBJ-5 (system alerts → Discord): ✅ RESOLVED 2026-06-21 — ACTIVATED + LIVE-VERIFIED.** Kyle provisioned the dedicated alerts webhook (id `1518017905936171092`); id set in bridge config (`/etc/dawntrader/discord-comms.env`), URL in the staging secret (`/etc/langston/discord-alerts-webhook.env`, root:deploy 640). End-to-end test PASSED: staging `fire-due` fired a warning alert → "Discord alert posted" → channel post as "DawnTrader Alerts" → Langston bridge `ALERT enqueued ... via alerts webhook` (always-engaged, bypassed the name-gate) → triaged correctly → alert resolved. B-DISCORD CLOSED. _(History — prior state:)_ Design Langston-approved + now BUILT: (bridge) `discord-langston-bridge.py` always-engages when `message.webhook_id == CFG.alerts_webhook_id` (bypasses the start-with-"Langston" gate + circuit breaker, alert-triage prompt, never [SILENT], name-prepend skipped) + `discord_common.load_shared_config` reads `ALERTS_WEBHOOK_ID` — deployed + verified inert (`alerts_webhook_id=None`); (staging) `scripts/system-alerts.ts` `fire-due` now calls `pushToDiscord(alert)` alongside `pushToTelegram` — direct HTTPS POST to the secret webhook URL (read from `/etc/langston/discord-alerts-webhook.env` or env), no-op when absent, warning+critical gating mirrors Telegram (commit `e4b5499be`, tsc baseline clean). Both sides are NO-OPs until provisioned. **BLOCKER (activation only):** Kyle must create ONE #general webhook ("DawnTrader Alerts") and hand CC the URL (→ staging secret file) + ID (→ bridge config `ALERTS_WEBHOOK_ID` in `/etc/dawntrader/discord-comms.env`) — CC cannot create webhooks. Then: live-test one alert. **HOME:** B-DISCORD; batch stays OPEN until activated+verified. **OPEN (code-complete; blocked-on-Kyle for activation).** *(NOTE: CI is red on the branch from reorg-B2 Step-3's `telemetry_history.source` migration drift — NEW Claude's batch, NOT this change; OBJ-5's tsc gate is clean.)*
```

**B — `Claude Comms and Packages/Batch Completion/B_DISCORD_COMPLETION_REPORT.md`**

```
- **#332 — OBJ-5 ACTIVATED + verified** (this report). Resolved.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #336 — overlap 0.27

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#336 — xStock per-class target floor must come DOWN (HOME: Phase-25 calibration item 25-17 ↔ this issue).** reorg-B2 seeds xStock target_floor_pct = 0.040 (= crypto, same account-wide fee wall) as a placeholder. A 4% intraday floor will under-trade xStock (equities don't move 4% intraday like alts). Phase-25 calibrates xStock's floor + reach_atr_max DOWN on its own realized data. NOT a verbal "Phase-25 nice-to-have" — a named Phase-25 calibration item (Langston #5).
```

**B — `Claude Comms and Packages/Batch Completion/P19_REORG_B2_COMPLETION_REPORT.md`**

```
- **#336** xStock target floor must come DOWN → Phase-25 (named calibration item).
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #346 — overlap 0.18

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#346 — B-ALERT first-run thundering-herd ramp (follow-up from B-ALERT-PROTOCOL #340, 2026-06-23).** On the closure guarantee's FIRST activation, `processResurface` surfaced the entire pre-existing unresolved backlog (25 alerts, some open weeks-to-months) in a single dispatcher tick → a burst of Langston invocations + owner wakes. The widening back-off prevents *recurrence*, but a one-time first-run is unramped. **Fix options (non-blocking): a gentle first-run ramp (cap re-surfaces/tick on the first N ticks), or a one-time backlog triage before activating.** **Dispositive note (proves this is NOT a resolved-re-promotion bug — Langston pushed for the positive proof):** the five alerts cited as "re-surfaced then resolved" (4× weekend_shutdown + EUROP `4cd4975c`) each show `resurface_count=1` (frozen), `last_resurfaced_at=2026-06-23T21:59:28Z` (the e2e fire-due tick, BEFORE the ~22:01 resolves), and the `system-alerts-dispatcher.timer` demonstrably fired AGAIN at 22:47:40Z (post-resolve, on its 15-min cadence) WITHOUT incrementing the count — so a dispatcher tick ran after resolution and did NOT re-promote any resolved entry. The three-layer code exclusion (`computeResurfaceStale` state-guard → `processResurface` fresh re-read → `markResurfaced` no-op-on-resolved) + 10/10 resolved-skip unit coverage confirm it. (Optional future schema add: an explicit `resolved_at` field — `resolveAlert` only backfills `acknowledged_at` if null — would make this audit a literal `resurfaced_at < resolved_at` compare; noted, not scoped.) **HOME: a small B-ALERT follow-up (ramp or pre-activation triage). OPEN (non-blocking).**
```

**B — `Claude Comms and Packages/Batch Completion/B_ALERT_PROTOCOL_COMPLETION_REPORT.md`**

```
- **#346 — first-run thundering-herd ramp.** On first activation the re-surface surfaced the entire existing backlog (25 alerts) in one burst. The back-off prevents *recurrence*, but a gentle first-run ramp (or a one-time backlog triage before activation) would make a future activation less noisy. Non-blocking; homed.
- Real items the backlog surfaced (not this batch's work): the `weekend_shutdown` cron arming `TOO_FAR_FUTURE` year-rollover bug (RI #165 — CC-B lane) + the lq_min-38 xStock apply (CC-B lane) — both now owner-routed via the new protocol, which is the point.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #379 — overlap 0.17

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#379 — `/api/diagnostics/rtb-metrics` hand-maps a SUBSET of `getSummary()` → diagnostic fields silently dropped at the endpoint boundary (reorg-B3 deploy-verify finding + Langston NO-PATCHES flag 2026-06-24). HOME: a §13 scheduled refactor (verbatim-minus-redaction), my #370 block.** reorg-B3's OBJ-4 proof surface (`evInputThreadProof`) was added to `getSummary()` but did NOT reach the endpoint, because the route constructs its own subset object rather than returning `getSummary()` verbatim — caught by §9.3 deploy-verify, fixed for the instance in `99887f90e`. **But it's a defect CLASS, not a one-off:** `openFailedByStage` (a B6.5e field) is ALSO silently dropped by the same subset-map → the next diagnostic that needs a `getSummary()` field will hit this again. **FIX (durable): return `getSummary()` verbatim, then explicitly override ONLY the two intentional transforms — `byReason`→`byBlockReason` rename, `bySymbol`→count unless `?raw=1` — so no field is ever silently dropped again. This is a consumer-facing default-payload change → requires a byte-for-byte consumer diff (confirm existing keys unchanged) before landing.** Surface `openFailedByStage` in the same pass. **✅ RESOLVED 2026-06-24 (reorg-B3.1)** — rtb-metrics endpoint now returns `getSummary()` verbatim-minus-redaction; the subset-map silent-drop defect-class is closed. Deployed `c077faa7f`.
```

**B — `Claude Comms and Packages/Batch Completion/P19_REORG_B3_COMPLETION_REPORT.md`**

```
- **#379** — `/api/diagnostics/rtb-metrics` subset-maps `getSummary()` → silently drops fields (`openFailedByStage` too) → §13 verbatim-minus-redaction refactor (consumer byte-for-byte diff required).
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #390 — overlap 0.12

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#390 — `rtb_shadow_pool_members` retention sweep (reorg-B4.1, 2026-06-26). HOME: B9 / paper-active turn-on. OPEN (dormant-safe).** reorg-B4.1 writes one `rtb_shadow_pool_members` row per pool member PER CYCLE (un-deduped — that's the event-grain design that captures rank/promoted each cycle). Once paper-mode active trading is on (~B9), at the picker cadence × pool size × mode × asset_class this is a fast-growing telemetry table with no TTL. (The reorg-B4 6h shadow-exit TTL bounds OPEN shadows — a different thing; it does NOT bound this persisted row-history.) **Fix (not built this batch — dormant, zero rows):** a plain-table age-delete retention sweep (mirror the B75 sweep / `data_lifecycle` hot-retention pattern). **HOME stated in words: B9 (paper-active turn-on)** — it must land before the table starts filling. Langston Step-2 §13 ask. **OPEN (dormant-safe).**
- **reorg-B4 cycleKey-per-class note (informational, no #):** `cycleKey` is one-per-promotion-cycle today (`checkRtbPromotion` calls `getRankedSignals(mode, openSlots)` with NO assetClass → one global cycle). IF a future per-class promotion is added, cycleKey becomes per-(cycle×class) — still bounded + internally consistent, but a B5 consumer must NOT read cycleKey as globally-unique-per-cycle. Recorded in the SIM.
- **reorg-B4 GC-DELETE intentional-reap (informational, no #):** the GC sweep `DELETE FROM vts_open_trades` (`vts-trade-persistence.ts:393`, `sweepClosedOpenTrades`) reaps CLOSED shadow backing rows by age along with real ones — this is INTENTIONAL/desirable, since by then the shadow OUTCOME already lives durably in the isolated `rtb_shadow_pairings` sink; the unfiltered DELETE is NOT a missed shadow-exclusion sweep (Langston Step-4 explicit call-out). Recorded in the SIM.
```

**B — `Claude Comms and Packages/Batch Completion/P19_REORG_B4_1_COMPLETION_REPORT.md`**

```
- **#390 (B9):** `rtb_shadow_pool_members` retention sweep (un-deduped member rows grow once paper-active is on) — a plain-table age-delete pass, to land before the table fills.

**Status: CLOSED pending Kyle's acknowledgment.**
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #417 — overlap 0.23

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#417 — [P19-B8.3 Step-7 self-declared residual, Langston Step-8 ruling 2026-07-06] VTS-side funnel sub-blocks still render inside the SHARED scanner tables on the Paper/Live FD tabs.** B8.3 gated the standalone VTS-only sections (VTS Evaluation Metrics card, VTS Evaluation Detail card) to the 'tag' disposition and replaced the tail with the mode's real `ActivePipelineTail` — but the "VTS Signal Funnel (Last Cycle)" block and the "VTS EVALUATION (24H ROLLING — VTS-SIDE COUNTERS)" rows live INSIDE tables 1–2 of the shared scanner pipeline summary, so they still appear on Paper/Live (VTS-labeled, with the shared-scanner banner explaining the feed). Same separation-leak class as the Rejected-column HARD check, one level down. **Disposition: INTENDED-BUT-INCOMPLETE, not a defect** — the Step-2 staged-v1 sizing (Langston's own gate) deliberately left the shared scanner tables untouched because the per-mode funnel DATA doesn't exist yet (the scanner tracks no per-path counters — the B8.3b finding). Hiding the VTS funnel on enforce tabs today would leave NO funnel visibility there until the replacement data exists. **HOME: P19-B8.3b.** **★ RESOLVED 2026-07-07 (P19-B8.3b, commits `9e91245ab`+`23047f291`) — the DISPLAY half done now (Option A, Langston-approved): the scanner is mode-multiplexed (it BECOMES the active funnel at the B8.4 switch-on), so no dual-funnel build was needed. Both VTS-runner downstream blocks — the 'VTS Signal Funnel (Last Cycle)' AND the 'VTS Evaluation (24h rolling — VTS-side counters)' block (the SECOND one caught by the §9.3 visual walk after the diff review, since an ungated block isn't in a diff) — are now gated to `gateDisposition === 'tag'`; on Paper/Live an honest amber placeholder renders ('Active-path … populates when active trading is switched on (B8.4)'). The three '→ VTS Destination' rows relabel to '→ Survivors (post-benchmark; shared scan feed)' on enforce (the COUNT is honest shared-feed data — the scanner genuinely feeds VTS with active off — only the noun was the mislabel). §9.3 verified: Paper enforce = zero VTS-runner counts + placeholders; VTS tag = all three blocks unchanged. **RESOLVED (display).** The ON-state (active-trading-on) enforce funnel RENDER is verification-homed to B8.4 §13 (can't be Chrome-walked until the switch-on).
```

**B — `Claude Comms and Packages/Scope Files/P19_B8_3b_PRE_AUDIT.md`**

```
## §2 — OBJ-1 (#417): the exact un-gated VTS-labeled render sites in `vts-filter-diagnostics-panel.tsx`
B8.3 gated the STANDALONE VTS cards (`:292` VTS Evaluation Metrics `{gateDisposition==='tag' && ve}`; `:981` VTS Evaluation Detail `{gateDisposition==='tag'}`) but left these IN-TABLE VTS-labeled rows rendering on every disposition:
- `:283` "→ VTS Destination (post-benchmark)" inside **Pipeline Summary (24h)** (Table 1)
- `:522` "→ VTS Destination" inside **Last Scan — Filter Breakdown**
- `:570` the **"VTS Signal Funnel (Last Cycle)"** block header + its whole row group (Pair-Pool Evaluations → Pre-Eval Skips → Strategy Evaluations → Nulls → Signals → Trades Opened) inside Last Scan
- `:795` "→ VTS Destination" inside **24-Hour Rolling Aggregates** (Table 2)

**Fix approach (minimal, no new data):** these rows are VTS-funnel semantics; on `enforce` they must not render VTS numbers. The row labels themselves already say "VTS" — the honest move is to make each VTS-only row group render conditionally on `gateDisposition === 'tag'`, and on `enforce` show a single honest line in its place: "Active-path funnel — populates when active trading is switched on (B8.4); the scan-stage totals above are the shared scanner feed." (The scan-stage numbers — Universe Scanned, Global Filters Passed, Family IMF — are SHARED feed and correctly stay on both.) NO endpoint change: this is pure client conditional rendering; the data the enforce tab already fetches (`/api/vts/filter-diagnostics`) is the shared scan feed, and the ActivePipelineTail card (already present on enforce) carries the mode's real tail.
- **ON-state (active trading ON) render — Langston C2:** cannot be Chrome-walked at B8.3b (active off until B8.4). Verification of the ON-state funnel render is HOMED at B8.4 (§13). B8.3b walks only the OFF/dormant enforce render.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #436 — overlap 0.10

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#436 — [P19-B8.2 §15 sweep find, 2026-07-05] The legacy-guardrails WRITE path throws at runtime — two live callers hit the deprecated `storage.upsertGuardrails` stub.** While enumerating legacy `guardrails` readers (the B8.2 fence proof), found the WRITE side broken-by-design-but-still-wired: `storage.upsertGuardrails` throws unconditionally ("[9.7] Deprecated"), yet TWO reachable callers still invoke it — `routes.ts:1440` (the legacy guardrails update route: any client call 500s) and `intent-executor.ts:418` `executeGuardrailsUpdate` (the AI-intent guardrails path: throws when invoked). Not a B8.2 fix (scope discipline): B8.2 deleted the zero-caller READ accessors (`getGuardrails`, `getGuardrailsLegacy`) and re-pointed `compare_guardrails` at guardrails_v2; the throwing upsert + its two callers + the legacy `guardrails` TABLE retire together. **HOME: P19-B6.10 (guardrails-v1 retirement — already on the Phase-19 board):** delete/re-point the two callers (decide legacy-route + intent-path re-point to upsertGuardrailsV2 vs retire), drop the stub + `IStorage` line + the table + its schema export. Until B6.10, both paths fail LOUDLY (a throw, not silent wrong behavior). **OPEN → B6.10.**
```

**B — `Claude Comms and Packages/Batch Completion/P19_B8_2_COMPLETION_REPORT.md`**

```
- **#436** (NEW): the throwing `upsertGuardrails` + 2 live callers → **B6.10** (with the legacy `guardrails` table). OPEN.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #439 — overlap 0.08

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
- **#439 — [B-STORAGE-HARDEN Wave D OBJ-4 verification, CC-A find 2026-07-08] The xStock equity OHLC 1-minute bar channel silent-stalls and does NOT recover across app restarts — a data-integrity failure on the decision-bar feed.** During the OBJ-4 capture-cadence measurement, `xstock_spot_ohlc_1m` stopped producing bars ~14:52 UTC and stayed ~15+ min stale; each `pm2 restart` yields a brief burst of a few bars then re-stalls (observed across the 14:48 + 15:05 restarts). **Provably NOT the Wave-D throttle:** the OHLC bars held a steady ~400/min THROUGH the entire throttle=8000 window (14:32–14:47) — throttle-independent — and the stall began independent of the cadence flip; the crypto OHLC (`src=ohlc`) stayed healthy throughout; and the equity-spot TICKER feed was healthy the whole time (`connected=true`, `rows_persisted_60s ~6000`, ticker age 0–3s). So it is SPECIFICALLY the xStock equity **ohlc** channel/aggregation, not the socket. **★ Alerting gap:** the existing equity-feed silent-stall detector keys on "socket OPEN but delivered no data for 750s" — but here the socket IS delivering ticker frames, so the OHLC-specific stall is INVISIBLE to it (no alert fired for today's stall). ROOT-CAUSE candidates to dig: a Kraken-side `ohlc` subscription drop, an equity-WS `ohlc`-channel resubscription bug on reconnect, or an aggregation-writer stall. Impact: xStock strategies evaluate off these 1-min bars — stale bars would mislead/block xStock decisions when active trading is live (active trading is OFF now, so no live impact today). **HOME: a named near-term batch `B-XSTOCK-OHLC-STALL`** (data-integrity; scope = reproduce + root-cause the stall + add OHLC-specific staleness detection that the current socket-level detector misses). Surfaced + Langston/CC-B both flagged as "the bigger fish." **OPEN (homed: B-XSTOCK-OHLC-STALL).**
```

**B — `Claude Comms and Packages/Scope Files/B_XSTOCK_FRESHNESS_MONITOR_PRE_AUDIT.md`**

```
- **#439 stall-window QUARANTINE (explicit + logged + calendar-guarded, Langston):** a window is suspected-#439 when **≥ `STALL_UNIVERSE_FRACTION` (e.g. 0.5) of the universe is simultaneously stale AND OHLC bar coverage in that window is NORMAL** (universe-wide staleness WITH near-zero OHLC = a market holiday/half-day, NOT a feed stall → the calendar guard; a data-driven calendar via OHLC coverage, no external source needed). Suspected-#439 windows are EXCLUDED from the SLI baseline and LOGGED per exclusion (`excluded_windows` jsonb) so a later reader never mistakes a quarantined window for a coverage gap. #439 stays its own series, never folded into the baseline.

**Revised `xstock_freshness_report` schema (drop the split columns):** `throttle_caused_symbols`/`native_slow_symbols` → `universe_median_gap_ms, universe_p95_gap_ms, breach_rate_pct, frequently_stale_symbols int, new_frequently_stale jsonb, computed_throttle_floor_ms int, excluded_windows jsonb, min_samples_floor int` + keep `worst jsonb` (top-N by breach-rate w/ per-symbol median/p95), depth/coverage/range fields. The alert body keeps the "could-have-been-blocked, NOT actual loss until active trading is live" framing lock.

**§13 NAMED HOME for the attribution gap (Langston — a home, not a candidate list): PRIMARY = add a venue/source quote timestamp to the xStock ticker capture** (a schema + capture-path change → its own batch **`B-XSTOCK-VENUE-TS`**, dated to the Phase-25 xStock-calibration arc) so per-fetch throttle-vs-native attribution becomes measurable going forward; FALLBACK = a Wave-D-style controlled A/B if we ever need to re-derive the split retroactively. Recorded as **RUNNING_ISSUES #442**.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #447 — overlap 0.03

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
  - **#447 (orig) OPEN 2026-07-10 (CC-A, measured against the live 254-row ledger under Kyle's governance-integrity directive; independently re-measured by Langston) — ★ `resolve` HAS ZERO PROVENANCE: the alert system cannot say who closed an alert, when, or on what evidence — and it is not merely null, it is STRUCTURALLY IMPOSSIBLE.** The `SystemAlert` interface (`server/services/system-alerts.ts:~46`) carries `acknowledged_at` **and** `acknowledged_by` — but **the `resolved_at` / `resolved_by` fields DO NOT EXIST** (Langston re-ran the check: *"E1 isn't 249/249 null, it's structurally impossible. Confirmed harder than you stated."*). The resolve path is, in substance, `system-alerts.ts:329` → `found.state = 'resolved';` and it writes **nothing else**. **249 resolved rows, zero provenance possible.** `acknowledged_by` by contrast is populated on 100% of acked rows. The asymmetry is exactly backwards — **claiming an alert is audited; CLOSING it is not.** **Why it matters:** Kyle's stated fear (2026-07-10) is alerts *"acknowledged and just falsely verified and pushed to the side as completed."* With no resolve provenance that event is **structurally unrecordable, therefore permanently undetectable.** **★★ CRITICAL CORRECTION — F3b IS NOT THE RESOLVE GUARD (Langston, and he is right; CC-A concedes and withdraws his own framing).** CC-A argued F3b must ship with OBJ-6 or the detector merely "displaces the failure onto the cheaper resolve path." **The ledger refutes that: the ack path ALREADY HAS exactly the provenance F3b proposes — 3/3 rotting rows carry both `acknowledged_by` and `acknowledged_at` — and all three rotted for 26–31 days anyway (#443/#445).** **Provenance did not save the ack path; it will not save the resolve path.** F3b buys **attributability, not closure** — shipping it as the resolve fix is *"ack-with-a-nametag."* **The resolve hole is not "no author," it is "resolve DISCHARGES AN OBLIGATION WITH NO PREDICATE."** ⇒ **the actual fast-rug fix is the F1b re-executable-evidence contract extended to the `resolve → obligation-discharge` edge** — a `resolve` on a `verification`- or `breakage`-class alert must carry re-executable evidence which the resolver RE-RUNS, and is **REJECTED at write time** without it; free-form resolve stays legal only for `reminder`/`report`, where there is nothing to re-derive. **That fix was MISSING from the original program and is now named.** The weekly digest additionally surfaces any `resolved-without-evidence` row — **synchronous gate + asynchronous backstop; provenance alone is passive ("the camera nobody watches").** **★ F3b KEEPS ITS FIRST-IN-SEQUENCE SLOT, but for the correct reason: it is the MEASUREMENT SUBSTRATE, not the guard.** Until `resolve` has provenance we cannot measure whether any other governance fix worked — every repair is evaluated by asking *"was the obligation discharged, by whom, on what evidence?"*, which the ledger cannot answer 249 times over. **You cannot audit a system whose terminal state has no author.** (Hard constraint: **OBJ-6 must not ship before F3b is live.**) **★ THE TRAP INSIDE THE FIX (Langston — the deepest instance of the whole principle): `acknowledged_by` is ALSO unauthenticated.** It is `--by <freetext>`, the same `requireFlag(...) as` disease as #446/#448. **Nothing binds `--by langston` to Langston.** Adding `resolved_by` as another free-text flag would **reproduce the root defect inside the fix for it** — *provenance-shaped theater.* **⇒ F3b ships TWO honestly-named fields:** `resolved_by_claimed` (actor-supplied, explicitly marked UNAUTHENTICATED wherever displayed) and `resolved_by_transport` (captured by a component the actor does not control). **Do not name a field `resolved_by` that we cannot prove; honest ambiguity beats a trustworthy-looking field.** Blocker to real authentication: both CC sessions SSH as `root`, so the transport cannot currently distinguish CC-A from CC-B — **the two actors most likely to falsely resolve.** Distinct authorized_keys per actor + sshd key-fingerprint capture is the structural fix. **★ Generalized principle (CC-A, offered for attack): we are not eliminating assertions — we are pushing each one down to a party with no incentive and no ability to lie.** The chain stops where a component outside the actor's authority records the fact — the same shape as the weekly digest terminating at Kyle. **Historical backfill is IMPOSSIBLE** for the 249 rows: the information was never captured. State that honestly; do not fabricate it. **★ Related hazard (Langston): any integrity hash over `resolved_at`/`resolved_by` written BEFORE F3b guards two nonexistent columns while missing the field that actually holds `da0c24b8`'s evidence (its `body`/note). Pin WHERE the evidence lives before hashing, or the integrity check is itself a "trust me."** ↔ #443, #445, #446, #448, #449. **HOME (§9.4): `B-GOV-INTEGRITY-1` (owner CC-A, due 2026-07-12), which absorbs `B-ALERT-TAXONOMY`; blocked on `B-GOV-INTEGRITY-0`. NOTE per #444: this is a NOT-YET-CREATED batch, not a CLOSED one — it must be created before this can be worked, and if the crew ratifies a different id THIS LINE GETS UPDATED, not left dangling.** **OPEN (homed).**
```

**B — `Claude Comms and Packages/Scope Files/B_GOV_INTEGRITY_0_PRE_AUDIT.md`**

```
- **#447 (OBJ-1 / Layer-B) — resolves had no basis.** A resolve recorded no author/time/evidence, so a wrongly-cleared alert was undetectable forever. **Fix (seam with OLD Claude's Layer-A):** the checker stamps every resolve with the re-derivable graded-ref sha as `--evidence` (the SAME ref it reads docs at, so `git show <sha>:<doc>` re-confirms what it saw), else the sanctioned `NO-EVIDENCE-GIVEN` sentinel — never fabricated.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #636 — overlap 0.13

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
### #636 OPEN 2026-07-31 (CC-B; Langston Step-4 required home, #594) — SNAP-ARRIVAL ≠ MARK-FRESHNESS: `lastDataMsgAt` CAN READ FRESH WHILE `latestEquityTick` AGES

★ **MECHANISM, CITED NOT MEASURED (rule 29c).** In `parseTickerSnap` the `!data?.symbol` guard is **unconditional**, but the mark write is **conditional** — `Number.isFinite(_mark) && _mark > 0`. ⇒ **a snap can pass the guard, be archived, stamp `lastDataMsgAt`, and write NO mark** ⇒ the DATA-liveness clock reads fresh while `latestEquityTick` — **the only venue price source for tokenized equities, consumed by `active-execution-engine.ts:141`** — goes stale.

⚠ **#594's STAMP PLACEMENT IS CORRECT AND MUST NOT MOVE TO “FIX” THIS:** stamping inside the mark branch would make `parseTickerSnap` inconsistent with `parseOhlcBar`, which has no mark at all. ⇒ **the answer is not relocating the stamp; it is deciding whether MARK-freshness needs its own detector.** ★ **NOT MEASURED: I have not established that a finite-symbol/non-finite-mark snap actually occurs in practice** — the mechanism exists in code; its frequency is unknown, and that measurement is the entry's first task. **Related: #594, #635.** **OPEN (homed, owner CC-B).**

★★ **MEASURED 2026-08-24 (CC-C, discharging alert `3543742c`) — THIS ENTRY'S "FIRST TASK" IS NOW DONE, AND THE ANSWER IS *ESSENTIALLY NEVER*.** Object: `xstock_spot_ticker_snap`, 24 h to 2026-08-24T10:05Z, `NULL`-safe bucketing (`COALESCE(...,0)` so a NULL cannot silently vanish from every bucket — a first pass without it left 2 rows in no bucket at all).

| bucket | rows |
|---|---:|
| snaps archived | **436,826** |
| mark from a live **bid/ask mid** | **436,824** |
| mark fell back to `last` | **2** |
| **wrote NO mark (the #636 case)** | **0** |

⇒ **the mechanism is REAL IN CODE and did not occur ONCE in 24 hours at 437 k snaps.** `parseTickerSnap`'s conditional mark write is reachable in principle; in practice the equities feed supplies a two-sided quote on **99.9995%** of snaps. **Do not spend a batch on it, and do NOT relocate the stamp** (this entry and #594 both already say why). ★ **A bonus this measurement settles:** the `last` fallback — a *carried-forward* print rather than a live quote — fired **twice**, so the mark is a live two-sided mid essentially always. That closes a fail-open worry I raised separately about `last` being economically stale while reading fresh: **not a live exposure on this path.**

⚠️ **POPULATION LIMIT, NAMED:** this counts snaps that WERE archived. `bufferTickerSnap` **throttles** per `assetClass:symbol`, so it is a throttled sample of arrivals, not every arrival — and a frame rejected by the `!data?.symbol` guard upstream never reaches the table. Neither can manufacture the `no_mark_written` case this bucket counts, so the **zero holds**; but the 437 k is a sample size, not a frame count.
```

**B — `Claude Comms and Packages/Scope Files/B_XSTOCK_FEED_SANITY_SCOPE.md`**

```
### 3.1 `#636` ALREADY MEASURED THE FALLBACK ARM — AND I RE-MEASURED IT WITHOUT CITING IT

`#636` records: *"the mechanism is REAL IN CODE and did not occur ONCE in 24 hours at 437k snaps… the equities feed supplies a two-sided quote on **99.9995%** of snaps… the `last` fallback fired **twice**."*

**I ran that same measurement on 2026-08-29 during F-G-2 (7 days, 14,565,408 snaps: mid 100.000%, `_last` arm 2, carried 0) and reported it as new.** ⇒ **It is a WIDER RE-DERIVATION of an existing measurement, not a new finding, and F-G-2 §18.1 should have cited `#636`.** ★ **This is precisely the failure the pre-scope ledger search exists to prevent, and I hit it one step before the rule fired.**
✅ **USE FOR THIS BATCH: the fallback arm is already excluded as a cause, twice, by two independent windows. Do not re-run it.**
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #670 — overlap 0.11  ·  ⚠️ 1 further homes not shown

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
### #670 OPEN 2026-08-07 (Infra Claude; homed at Langston's insistence — a "named follow-up" without a numbered home is the open loop §13 exists to close) — CREW-STATUS SNAPSHOTS HAVE NO COLD HAND-OFF, SO WARM GROWS UNBOUNDED ON DISK

**What:** `B-CREW-STATUS` archives its snapshots hot→warm on laptop/Helsinki disk
(`STORAGE_POLICY §7.5`). **There is no COLD hop**, so warm accumulates with no terminus.
**Why it stopped there:** the cold tier is Backblaze B2 and its credentials live on **staging**,
not Helsinki — extending crew credential placement is not a unilateral call.
**What it is NOT:** an invitation to build a second archive. Kyle, 2026-08-07: *"We have an
archive system outside of Langston where we store all of our data."* The fix ROUTES INTO the
existing cold tier; the disk tiers are a staging post, not a rival system.
**Scale, measured not guessed:** ~18 MB/yr gzipped against 54 GB free — this is
**policy-conformance, not capacity risk**, and it is filed as OPEN precisely so that being
small does not make it invisible.
**Gate:** a credential-placement decision (Kyle / crew). **Owner:** Infra Claude.
**Done when:** warm bundles reach the same cold bucket the rest of the system uses, with the
`b75` verification discipline (re-download + checksum) applied, and §7.5's "owed" note struck.
```

**B — `.claude/memory/MEMORY_CC_INFRA.md`**

```
- **#670** — crew-status snapshots have no cold hand-off; warm tier grows unbounded (~18 MB/yr gz, policy-conformance not capacity).
- **Langston runs `claude-opus-5[1m]`** at two sites — read them live, never assert the value here (`discord-langston-bridge.py:69`, `langston-call:38`). Change BOTH or he runs split.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #690 — overlap 0.13

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
### #690 (original fix record) FIX-SHIPPED 2026-08-18 (CC-C; Kyle-granted "research it and fix it quickly"; fix at Langston Step-4 review, rides tonight's PERPFEED deploy) — root cause DEEPER than the swapped-ratio hypothesis: **the whole service assumed NEWEST-FIRST data while `storage.getPriceData` returns OLDEST-FIRST (ASC)**. Provenance (rule 24.0): introduced 49bdf09ad 2025-10-06 ("Add feature enrichment service for technical analysis indicators"), Replit-era, never re-read since. Consequences at runtime: RSI direction inverted (the observed 27.02 = 100−72.98 mirror) AND every window took the OLDEST rows (slice(0,30)) not the most recent; same inversion in SMA-slope + volume-delta + sector-correlation windows. **Fix (one convention, chronological, matching storage + the audit + `strategy-helpers.ts`):** all windows → tail slices (`slice(-n)`), RSI mirrors the strategy-helpers shape (last `period` chronological changes), returns direction corrected. **Trading path verified CLEAN:** every strategy uses `strategy-helpers.ts:78 calculateRSI` — chronological, `changes.slice(-period)`, correct direction; consumers of the broken service remain exactly `/api/learning/features/:symbol` (diagnostic) + the audit probe. **Adjacent finds fixed in the same pass:** (a) the audit's SMA-Slope and Volume-Delta "tests" were TAUTOLOGIES (expected==actual from the same literals — structurally unable to fail; why only RSI ever FAILed) — both now probe the real service methods on chronological samples like testRSI does; (b) `saveEnrichedFeatures` had ZERO callers — deleted per rule 18(a), logged in DELETED_COMPONENTS_LOG (state-write census per §9.5(a-ii): it wrote `feature_snapshots`, but as a never-called method it wrote nothing at runtime — no reader loses a writer that never ran). **Still open under this number: the bucket-2 companion** — formula-audit FAILs land in `/tmp/audit_report_*.txt` with no alert wiring; options note to Kyle at the P19-B-PERPFEED close (owner CC-C). Verified: fixed RSI vs the audit's own sample = 72.98 exact match; tsc = 391 errors = frozen baseline, none in either edited file.

**ORIGINAL ENTRY (2026-08-18, kept for the record — CC-C; surfaced chasing the formula_audit_cron miss — the audit's own standing finding, unread for days) — **★ `feature-enrichment.ts:69` RSI IS INVERTED (the gain/loss ratio is swapped), THE DAILY AUDIT HAS BEEN REPORTING IT TO A /tmp FILE NOBODY READS**

**The defect (object: the manual audit run 2026-08-18T04:08Z + yesterday's report):** RSI expected 72.98, actual 27.02 — **the two sum to exactly 100**, the arithmetic signature of a swapped ratio (avgLoss/avgGain instead of avgGain/avgLoss yields precisely 100−RSI). Yesterday's scheduled report shows the same FAIL at 62.98% deviation — a STANDING failure across at least multiple days of daily audits, each written to `/tmp/audit_report_YYYYMMDD.txt` with no alert wiring for formula failures (only cron-MISS alerts exist). **Blast radius (measured, whole-tree):** `feature-enrichment.ts` has exactly TWO consumers — `routes.ts:17112` (a diagnostic/enrichment endpoint) and `formula-audit.ts` itself. **NOT in the trading pipeline** — strategies/MCE compute their own indicators. Rule-24 sorting: bucket 1 (real defect) in a peripheral module + a bucket-2 companion (the audit's findings have no alert path — working-as-designed-but-unaddressed, a scope decision). **HOME (§9.4): the P19-B-PERPFEED close-out sweep, owner CC-C** — (a) the one-line ratio fix with a pinning test; (b) the options note on wiring formula-audit FAILs to the §10.5 queue (or retiring the module per rule 18 if the provenance read shows the enrichment endpoint is itself legacy — check BEFORE fixing, §2 1.b). Related: the formula_audit_cron 03:00Z miss (alert 75fda8c3, resolved with the manual-run report as evidence) — the callback did not execute while the other scheduler stack fired on the tick; single occurrence on the node-cron stack, mechanism unestablished; the B-NEW-51 cadence checker re-fires if tomorrow misses again.
```

**B — `Claude Comms and Packages/Batch Completion/P19_B_PERPFEED_COMPLETION_REPORT.md`**

```
- **#690 — feature-enrichment chronology.** The service assumed newest-first data while `storage.getPriceData` returns oldest-first, so RSI came out mirrored (27.02 against a true 72.98) and every window read the OLDEST rows available. Fixed to one chronological convention, with the ASC contract now stated AT `getPriceData` where the next reader looks. **Trading path verified CLEAN** — every strategy uses `strategy-helpers.ts:78`, which was already correct. Two dead modules deleted in the same pass (`saveEnrichedFeatures`; `data-normalization.ts`, Langston's sibling find). **Proven live by the designed instrument:** the 03:00Z formula audit now reports RSI **PASS at 0.01% deviation**, having reported FAIL at 62.98% for days.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #704 — overlap 0.03

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
### #704 FIXED-SAME-TURN 2026-08-20 (CC-C; found at P19-B-PERPFEED post-deploy verification, fixed + deployed + verified within the hour — rule 23 fix-on-find) — **★ THE NEW crypto_perp OHLC TABLE SHIPPED WITHOUT THE UNIQUE CONSTRAINT ITS THREE SIBLINGS CARRY, SO EVERY WRITER FLUSH THREW AND DROPPED THE BATCH — 368,841 BARS SCANNED, 0 ROWS LANDED, AND STDOUT SHOWED NOTHING**

**Object/population (rule 29):** `crypto_perp_ohlc_1m` since capture switch-on 2026-08-19T21:22Z through the fix 2026-08-20T12:27Z. **Measured:** `count(*) = 0` while the archiver's own counter read `cumulativeOhlcScanned = 368,841` and the sibling ticker table held 926,775 rows across 184 symbols (so the leg was alive — this was WRITE-side only). **Root cause, at the constraint:** the B74 OHLC batch writer upserts with `ON CONFLICT (symbol, interval_begin)`; `crypto_perp_ohlc_1m` had only its partitioned PK `(interval_begin, symbol, id)`, no UNIQUE — the constraint the other three carry was added for THEM by B-NEW-35 (2026-05-20) as raw SQL and **is not declared in Drizzle for any of the four**, so a table created after B-NEW-35 does not inherit it. Postgres therefore threw `there is no unique or exclusion constraint matching the ON CONFLICT specification` on EVERY flush, and the writer's catch DROPPED the drained batch (`splice` already emptied the buffer — the rows were unrecoverable).
**★ THE INSTRUMENT LESSON, and it is the transferable half: THE FAILURE WAS INVISIBLE ON STDOUT.** The writer logs success with `console.log` and failure with `console.error`; `/var/log/dawntrader/out.log` — the log this project reads by habit and the one every runbook names — carried the successful `xstock_spot/crypto_spot upserted` lines and NOT ONE trace of 4,802 consecutive crypto_perp failures. They were all in `/var/log/dawntrader/error.log`, which nothing in our procedure told anyone to read. I burned five refuted hypotheses (millisecond-vs-second timestamps — refuted at the venue: it returns ms; wrong-class buffer contamination — refuted: xstock_perp holds only its 10 equity symbols; bundle module duplication — refuted: one instance; missing partitions — refuted: 17 daily children present; a timing race — refuted: still 0 after four polls) before checking the other log file. ⇒ **RULE ADOPTED WITH LANGSTON'S SHARPENING (2026-08-20), and his general form is the right one — mine was a pm2 fact that goes stale the day we change transports: *a positive control must match the STREAM and the SEVERITY CLASS of the absence it licenses.* My out.log control PASSED — it carried `[B74][batch-writer]` lines all day — and it was the wrong control, because it proved out.log can carry a SUCCESS line, never that it could carry an ERROR one. ⇒ the 29(b) capability control is demonstrated on the same stream AND severity as the claim; where a runtime splits streams, EVERY stream is read before silence is evidence. `error.log` joins the post-deploy read-set — and it has the LONGER reach (out.log rotates 6-8x/day at 1 GB, error.log daily at retain=14), so it is the better instrument, not merely the missing one.**
**FIX (deployed d23282b34, migration `2026-08-20-perpfeed-crypto-perp-unique-constraint.sql`):** `ADD CONSTRAINT crypto_perp_ohlc_1m_symbol_interval_unique UNIQUE (symbol, interval_begin)` — includes the partition key as Postgres requires, cascades to all 17 existing daily children and every future one. **VERIFIED POST-FIX:** 368,000 rows / 184 symbols landed within 40 s of the restart; family census now 1 unique constraint on all four `*_ohlc_1m` tables; zero further flush failures in `error.log`. Data lost: ~15 h of crypto-perp 1m bars (the REST poller re-fetches a 2,000-bar window, so the first post-fix poll recovered ~33 h and the true gap is nil — measured, not assumed: oldest surviving bar predates switch-on).
**RESIDUAL (carried to the batch's known-limits + proposed to Langston at the Step-4 review):** (a) a FENCE asserting all four `*_ohlc_1m` tables carry the constraint, so the next table born into this family cannot repeat it; (b) the writer's drop-on-failure is silent-by-design at the buffer (`splice` before insert) — a failed flush loses the batch with no retry, which is acceptable for replayable REST bars and NOT for WS-only ones; (c) `error.log` joins the standard verification read-set. Schema comment added at the table declaration naming the family invariant.
```

**B — `Claude Comms and Packages/Batch Completion/P19_B_PERPFEED_COMPLETION_REPORT.md`**

```
- **#704 — this batch's own defect.** See known limit 1; found at post-deploy verification, fixed, deployed and verified same-turn.
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #732 — overlap 0.04  ·  ⚠️ 1 further homes not shown

**A — `1-system-manual/RUNNING_ISSUES.md`**  ⚠️ **LARGE HOME — emitted whole, not clipped**

```
### #732 OPEN 2026-08-20 (CC-A; KYLE spotted a `TRAIL STOP` badge on the Paper Trading screen and asked how it is possible when trailing/BE/moonbag were turned OFF) — ★★ `targetLatched` IS SET **OUTSIDE** THE MOONBAG GATE, SO A PLAIN TARGET HIT IS LABELLED `trailing_stop_hit` WITH TRAILING FULLY OFF

⛔ **KYLE WAS RIGHT THAT IT SHOULD BE OFF, AND IT IS OFF. THE TRAILING LADDER NEVER RUNS. THE LABEL IS WRONG.**

**THE SWITCHES — ALL EIGHT FALSE, measured in `module_constants` at the live DB:** `trailing_enabled_active` **false** × 4 asset classes and `trailing_enabled_vts` **false** × 4, all `updated_by p19-b8.5i`, `2026-07-23 00:52:56Z` · `break_even_enabled` **false** × 4 (B79.TEC; xstock_spot by `kyle-directive-2026-05-21-disable-xstock-be`) · `moonbag_qualifying_strategies` **`[]`** × 4.
✅ **AND THE MASTER SWITCH IS CORRECTLY WIRED** — `trailing-exit-controller.ts:516-517`: `isMoonbagQualifier` resolves the per-path flag and `return false` when it is off, at *"the single chokepoint all three consumers route through"* ⇒ **the `TRAILING_TAKE` ladder is genuinely unreachable.** The P19-B8.5i build is not the defect.

⛔⛔ **THE DEFECT IS ONE LINE'S PLACEMENT — `trailing-exit-controller.ts:1198`:**
```js
if (!state.targetLatched && !targetLockDiscontinuity.active) {
  if (isTargetLockTriggered(update.currentPrice, state.targetPrice)) {
    state.targetLatched = true;              // ← SET UNCONDITIONALLY, BEFORE THE GATE
    if (moonbagQualified && moonbagAllowed) { // ← the gate the switch controls
```
⇒ **`targetLatched` records "price reached target", NOT "the moonbag ladder was entered".** The switch correctly blocks the ladder underneath it and **does not, and cannot, block the latch.**
**Then the consumer branches on the LATCH, not on the ladder** — `tec-evaluator.ts:405-407`: `if (update.targetLatched) { exitReason = 'trailing_stop_hit'; }`. ⇒ **a trade that merely touched its target is closed and labelled a trailing-stop exit.**

**MEASURED CONSEQUENCE — object `closed_trades`, whole table:**
| close_reason | n | trade_mode | ladder_rungs_hit>0 | window |
|---|---|---|---|---|
| `trailing_stop_hit` | **7** | **TARGET ×7** | **0 ×7** | 2026-07-29 → 2026-08-19 |
⇒ ★ **ALL SEVEN POST-DATE the 2026-07-23 switch-off**, and **every one is in `TARGET` mode with zero rungs and `original_stop_price == stop_loss` (the stop never ratcheted)** — the exact signature of "latched, never laddered."
**Two most recent, both exiting ABOVE their own target:** `VVV/USD` tp `14.64157143`, exit **`14.79200000`**, opened 08-18 22:05Z closed 08-19 21:06Z · `CRV/USD` tp `0.27197786`, exit **`0.27254000`**.

**⚠️ TWO CONSEQUENCES, AND THEY ARE NOT THE SAME SEVERITY — do not collapse them:**
1. ✅ **RECORD CORRUPTION — ESTABLISHED.** Seven target hits are recorded as trailing-stop exits. **`vts-service.ts:982` maps `trailing_stop_hit` → `take_profit`, and `vts-runner.ts:3635` counts it as a winner**, so downstream analytics inherit the mislabel. **Any study of "how well does trailing perform" reads these seven as trailing outcomes when trailing never ran.**
2. ⚠️ **POST-TARGET EXPOSURE — A QUESTION, NOT A CLAIM, AND IT IS THE ONE THAT MATTERS.** The exit price is `currentPrice` at the moment `tecShouldClose` fires, **not** the target — so the position is evidently held *past* target. **Both observed cases closed ABOVE target (favourable). Whether a reversal after latch can give back the gain is NOT established here** — it requires reading what stop `tecShouldClose` checks once latched with no ladder and no ratchet. **I have not traced that and am not asserting it.**

**§9.5(b-ii) — SEARCHED BEFORE FILING, and this is NOT #640.** #640 (WITHDRAWN 2026-07-31, not-a-defect) asked *why the ladder COLUMNS are empty on these rows* and correctly answered that a trailing exit does not require a prior latch-capture. ⇒ **it never asked why the rows EXIST AT ALL with the master switch off** — and at the time it ran the switch had already been false for 8 days. **Different question, opposite direction.** Related but distinct: **#562** (Kyle's on/off-switch directive — the switch it asked for WAS built and works) · **#640** · **#556**.

⛔⛔ **PRE-WORK 2026-08-28 — TWO ROUNDS OF THE REVIEWER LOOP, AND MY CLAIM WAS WITHDRAWN TWICE. THIS IS THE INVESTIGATION’S STARTING POINT, NOT ITS ANSWER.** *(Recorded here because `B-EXIT-LATCH-INVESTIGATION` is scheduled AFTER `B-MEASURE-GATE` and must not be worked out of order.)*

**`REVIEWER r1: claim-only · "what objects would settle 21-trades-above-target?" · HIT · re-derived y`** — named `ladder_rungs_hit`, `trade_mode`, `phantom_fill_suspect`, `mode`, the missing denominator, and that **`take_profit` is frozen at entry and never re-stamped on ratchet**. ⇒ re-measured with all of them: **all paper, all long, `phantom_fill_suspect=false` on all 21, 91 NULL rows excluded, denominators stated.**
**`REVIEWER r2: object · "is 14-of-14 a defect or a definition?" · HIT · re-derived y`** — ⛔ **IT IS A DEFINITION, AND MY CROSS-BUCKET COMPARISON MEASURED A CLAMP.** On latch the stop floor becomes **target + cost buffer** and is monotonic (`trailing-exit-controller.ts:1117/1205/1208`), and the close fires only at `currentPrice <= currentStopPrice` (`:1581`) ⇒ **a `trailing_stop_hit` is above target BY CONSTRUCTION.** Worse: **`target_hit` clamps its exit to the target (`tec-evaluator.ts:382`) and `stop_hit` clamps to the stop (`:409-411`)** — **two of the four buckets CANNOT exceed take-profit, so my contrast measured the clamp, not behaviour.** ★ **Also: `moonbag_timeout` is written into the SAME `trailing_stop_hit` bucket (`active-execution-engine.ts:1836-1841`) — the 14 are two causes, unsplit.**

⛔⛔ **AND IT INVALIDATED MY EVIDENCE, NOT ONLY MY CONCLUSION — THE PART THAT MATTERS MOST.** I reported to Langston that his ledger claim (*ladder config-gated off, 0 rungs all-time*) **HELD**, citing `ladder_rungs_hit=0` on 653/653 and `trade_mode='TARGET'` on 653/653. ⚠️ **BOTH ARE COLUMN DEFAULTS WITH EXPLICIT BACKFILLS** (`2026-04-25-b65-4-add-ladder-rungs.sql:29` `NOT NULL DEFAULT 0`; `2026-04-23-b65-2-….sql:72,77-78` `DEFAULT 'TARGET'` + backfill). ★ **I READ A COLUMN DEFAULT AS A MEASUREMENT, and 653/653 was itself the tell that the stamp does not discriminate on this population.** ⇒ **my confirmation of his claim was worthless; the claim needed different evidence.**

✅ **THE EVIDENCE THAT ACTUALLY DISCRIMINATES, and it does hold his conclusion up:** `latch_trigger_price` is NULL on **0 of 653** ⇒ **never stamped anywhere, unusable either way** (control caught it). `rung_target_history` is non-null on 138 rows — **and its value is `[]` on all 138**, so "non-null" was also not the measurement. ★★ **THE ONE THAT WORKS: `original_stop_price <> stop_loss` on ZERO of 653 rows ⇒ THE STOP NEVER RATCHETED, ON ANY TRADE, EVER.** Two independently-written columns; their equality is a fact, not a default.

⛔⛔ **WHICH RE-OPENS IT, AND THIS IS WHAT THE INVESTIGATION INHERITS: THE TAUTOLOGY EXPLANATION REQUIRES A RATCHETED STOP, AND THERE ISN’T ONE.** Sample rows: `tp 1.53142429, exit 1.55397000, original_stop = stop_loss = 1.37124143`. **The exit price sits far ABOVE the only stop the row ever recorded.** ⇒ **`currentPrice <= currentStopPrice` cannot be what fired on the persisted numbers.** Either the ladder ratcheted **in memory and was never written back** (`active-execution-engine.ts:1753-1757` writes on `newStop > stopLoss`), or something else closed these. ⚠️ **UNRESOLVED AND DELIBERATELY LEFT SO.**
★ **Timing, stated because it cuts against the standing belief: all 14 closed 2026-07-29 → 2026-08-22, i.e. AFTER the 2026-07-23 config epoch that trailing is believed disabled by.**
⚠️ **The 2 `target_hit` rows both closed 2026-07-15, a different era — one is 0.036% over (tick-scale, expected), one is ONDO at 4.5% over an exit that is supposed to be CLAMPED to the target. That single row is the sharpest object in the set.**

★★ **SPLIT 2026-08-27 (KYLE) — THE INVESTIGATION IS NOW ITS OWN SCHEDULED ITEM, AHEAD OF THE FIX, AND THE FIX’S TIMING IS DECIDED BY WHAT IT FINDS.**
⛔ **Kyle: *"I just wanna make sure it’s not a symptom of a much bigger and uglier problem before I just write it off as absolutely nothing."*** ⇒ **`B-EXIT-LATCH-INVESTIGATION`, owner CC-A, placed at `PHASE_19_PLAN.md` §governance queue position 4, after `B-MEASURE-GATE`** (§9.4 disposition 4). The fix `B-EXIT-LABEL-TRUTH` stays at the back of Phase 19 and is **re-timed on the investigation’s answer — Kyle decides, once an answer exists.**

⛔⛔ **THE QUESTION IS NOT THE LABEL, AND THIS IS WHY THE DEFERRAL SHOULD NOT HAVE BEEN TAKEN AS SETTLED. A WRONG LABEL EXPLAINS A WRONG *NAME*. IT DOES NOT EXPLAIN WHY A TRADE HELD PAST ITS OWN TARGET AND EXITED ABOVE IT.** Two of the seven did: `VVV/USD` tp `14.64157143` → exit **`14.79200000`** (held ≈23h), `CRV/USD` tp `0.27197786` → exit **`0.27254000`**. ★ **Consequence 2 was recorded as *"must be resolved BEFORE the label fix"* and then nothing resolved it — the severity measurement scored the LABEL and the deferral inherited that score.**

⚠️ **AND MY OWN TRIPWIRE CANNOT SEE THE BIGGER VERSION — STATED BECAUSE I BUILT IT AND IT READS AS COVERAGE.** It queries `where close_reason = 'trailing_stop_hit'`. **Its population IS the mislabelled rows.** ⇒ **if the underlying cause is an exit-EVALUATION defect, it would express on trades closing under OTHER reasons, and the tripwire would return CLEAR every week while the problem widened.** *(It has: 14 rows, 0 breaches, 2026-08-27 — a true statement about a population that excludes the failure mode being feared.)*

★ **HYPOTHESIS FOR THE INVESTIGATION TO TEST OR KILL — LABELLED A HYPOTHESIS, NOT A FINDING (rule 24.a: cause claims need tested reach).** The live `§10.5` alert class **"Exit checks SKIPPED — mark older than ceiling"** (`4da8950d` MOH/USD, `29c6ada8` TGT/USD, emitter `active-execution-engine.ts:176`, measured intermittent at 25-65% of cycles) describes **exit checks not running on a cycle.** ⇒ **an exit check that does not run cannot notice a target being reached, and the price keeps moving — which is the shape of "held past target, exited above it."** ⛔ **NOT ASSERTED: the skips are measured on quiet off-hours xStock names and both hold-past-target rows are CRYPTO, so the populations do not obviously overlap. That mismatch is the FIRST thing to test, not a reason to drop the link.** ⚠️ **The alert rows themselves are CC-C’s by Langston’s markers — this investigation tests the MECHANISM link, it does not take their items.**

**WHAT THE INVESTIGATION MUST DELIVER:** (a) for each of the seven, **whether the exit was evaluated late or evaluated on time and acted on wrongly** — the two have different fixes; (b) a **§9.5(a) census on the exit-evaluation path** — who reads the mark, who decides an exit, who writes the close reason, **and who else can close a trade** (the DELETE-equivalent question); (c) the same query run **without the `close_reason` filter**, so the population is trades-that-exited-past-target rather than trades-labelled-trailing; (d) an explicit **outcome (1)/(2)/(3)** per rule 24.

**DISPOSITION (rule 24): outcome (1) on the LABEL — a real defect with a one-line-placement root cause.** The fix is to branch the exit reason on **ladder entry** (`tradeMode === 'TRAILING_TAKE'` / `ladderRung > 0`) rather than on `targetLatched`, so the label reports what actually happened. ⚠️ **Consequence 2 must be resolved BEFORE the label fix, not after** — if the hold-past-target is unintended, relabelling would hide the symptom that surfaced it.
```

**B — `1-system-manual/MISTAKE_PATTERNS.md`**

```
**#732 was DEPRIORITISED on a measured 7-for-7 record: all seven `trailing_stop_hit` rows are winners that exited at or above target.** The deferral rests entirely on that pattern holding. **So the pass checks it, because a deferral with no tripwire is an intention:**
```sql
select symbol, net_pnl, exit_price, take_profit, closed_at from closed_trades
 where close_reason = 'trailing_stop_hit' and (net_pnl < 0 or exit_price < take_profit);
```
**ANY row ⇒ #732 returns to priority and is reported to Kyle that week.** **Zero rows ⇒ record "tripwire clear" in the run-log row.** *It rides this pass deliberately — no second scheduled job and no additional token cost.*
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## #906 — overlap 0.05

**A — `1-system-manual/RUNNING_ISSUES.md`**

```
### #906 — ✅ **CLOSED 2026-08-30** — Bitcoin and Dogecoin were never traded because the scanner sent Kraken a name Kraken rejects

**Batch `B-SCANNER-EGRESS-NORMALISE`, deployed `fd81ce18c` at 2026-08-30T16:36:32Z. Langston approved at the ref; CI 4/4. Closed same-day on functional verification, NO observation window.**

**ROOT CAUSE, complete chain:** the scanner emitted Kraken's raw `wsname`; **Kraken's own OHLC endpoint rejects Kraken's own wsname for exactly two bases** (`XBT/USD`, `XDG/USD` → `EQuery:Unknown asset pair`; `BTC/USD`, `DOGE/USD`, `ETH/USD` → 721) → `getPairHistoryDays` caches `null` → `passesHistoryFilter` fails closed → rejected on every scan, in every lane.
**FIX:** one statement at `market-scanner.ts:712-715` (`toCanonical`, slashed-only guard) **plus a guard at `:889`** denying the B63.3 strong-DBS bypass to BTC-quoted pairs.

**VERIFIED two-sided at the deploy boundary, pre-side captured before deploying:** `XBT/%` 65,268 rows/12 syms → **0** · `BTC/%` ABSENT → **126/11** · `XDG/%` 8,738/8 → **0** · `DOGE/%` ABSENT → **16/8** · `%/XBT` 42,098/30 → **0** · `%/BTC` ABSENT → **94/30** · controls `ETH/%`, `SOL/%` present throughout. Zero `XBT/USD` history rejections; `BTC/USD` reaching the guardrail check with `morning_star` assigned. **Guard verified: `%/BTC` rows carrying `threshold=0` = ZERO.**

⚠️ **THIS ISSUE'S OWN PREMISE WAS HALF-STALE AND IS CORRECTED HERE, NOT QUIETLY DROPPED.** `#906` said *"never evaluated."* The archive genuinely held zero rows — **because history rejections carry no `capturePreFilterReject` at all**, so the instrument could not have shown one. The pairs WERE being evaluated and rejected, invisibly. **Neither reading was wrong; they were different instruments, and one has a hole exactly where the defect lived.** That hole is `OBJ-5`, deliberately deferred — **so the archive may not be cited for or against the history leg until it lands.**

**SPAWNED, each placed in the plan:** `#965` (3b.j) · `#966` (5.a) · `#967` (5.b) · `#968` (3b.k).
**MISTAKE: silence-not-evidence [B-SCANNER-EGRESS-NORMALISE] — five consequence-claims killed in review; the last one read a lane-gated instrument's silence as an answer about the lane it cannot observe.**


---
```

**B — `Claude Comms and Packages/Scope Files/B_SCANNER_EGRESS_NORMALISE_SCOPE.md`**

```
### 8.1 ⛔ `#906`'s PREMISE IS OUT OF DATE — SAID PLAINLY
`#906` records *"`XBT/USD` and `BTC/USD` produce ZERO rows. **Not rejected — never evaluated.**"* ⇒ ⛔ **`XBT/USD` IS EVALUATED TODAY AND IS REJECTED.** Something moved between 08-25 and now. **A batch built on "never evaluated" would have been aimed at the wrong hop.**
```

**VERDICT (Langston):** ` `  — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

