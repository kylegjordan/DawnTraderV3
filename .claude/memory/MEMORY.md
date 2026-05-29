# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language strengthened 2026-05-28; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: EVERY message, not just final summaries. TWO paragraphs default. Topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot.
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-28 — four morning closures DONE; volume/price-quality scope NEXT)

Overnight + morning: B-XSTOCK-CALIB B.1, B-NEW-45, the SCORING/TEC verify-gate close, and B-NEW-46 all CLOSED + pushed. Kyle authorized next work via DM 10:47Z: "proceed with the gate close governance and scoping out the volume/price quality sub-batch." Gate-close governance is DONE. Remaining authorized work = draft the volume/price-quality scope → Langston Step 1 → surface to Kyle DM for sign-off BEFORE implementation.

### 🟢 CLOSED — B-XSTOCK-CALIB B.1 (regime-threshold validation + sibling features)
Commit `27c8dcf` (close) on remote. CI `26548662643` green; deploy `9d0a102` PM2 #328 01:25Z. **A3 decision: NO threshold adjustments** — replay of 2,658 bars/260 symbols showed distribution within design envelope; sample too small for structural change; Phase 25 (with trade outcomes) is proper calibration cycle. New leaf modules: `time-of-day.ts` + `calendar.ts` + 19 unit tests. Langston Step 8 ACK-CLEAN (4 independent verifications). momentumFactor saturation (TFS confidence compressed near floor) → RUNNING_ISSUES #160 Phase 25 handoff (design-intent, not bug). Completion report `Batch Completion/B_1_COMPLETION_REPORT.md`.

### 🟢 CLOSED — B-NEW-45 (dispatcher SSH-invokes Langston on alerts)
Closed `eb0576d`. Scheduled alerts now phone Langston on the other computer automatically (was: alerts only posted to Telegram, Langston never auto-saw them). Fixes along the way: pre-create log file owned by langston; systemd KillMode=process so the detached call survives. RUNNING_ISSUES #135 CLOSED.

### 🟢 CLOSED — SCORING/TEC +48h verify-gate (alert cbe84d5b)
Governance close `17c50f4`. Both observability counters (TEC pick-fallback, SQE static-mirror-fallback) ZERO across full 48h window → gate PASSED. Greenlights: TEC.b strict 11-key HARD-FAIL restore (RUNNING_ISSUES #141, SLA 7d → 2026-06-04); SCORING.b wildcard-retirement (standalone-vs-bundle-into-sub-batch-18 decision noted for Kyle). Langston ACK'd alert in Telegram.

### 🟢 CLOSED — B-NEW-46 (Langston's alert response posts back to Telegram)
HEAD `9970a68`. When a scheduled alert reaches Langston, his plain-language response now auto-posts to topic 21 ("Langston here, re: [alert], here's the action") — was: silence. Failure-case posts an explicit "couldn't reach Langston" notice. Verified end-to-end TWICE (direct wrapper + cron-fired, both relay HTTP=200, alerts 60cdfb05 + 1a17cc0c). Langston Step 8 ACK-CLEAN. New: `infra/helsinki/langston-alert-handler.sh` + deploy script; dispatcher `invokeLangstonForAlert()` modified. 3 blockers caught+fixed (quote-nesting pre-push, CRLF at deploy, file-perm at Step 7). Completion report `Batch Completion/B_NEW_46_COMPLETION_REPORT.md`. Follow-up B-NEW-46.b (weekly synth health-check alert) deferred.

### ⏳ AWAITING KYLE SIGN-OFF — B.1.5 xStock Liquidity/Volume Data-Integrity + Cross-Asset Isolation
Scope **v3** at `Scope Files/B_XSTOCK_GLOBAL_FILTER_SCOPE.md` (commit `db33383`+ v3 edits). Langston Step 1 re-review = **CLEAN-CONDITIONAL**, all 6 conditions folded: (1) O0 empirical exec-model test (book-channel + tiny live order + Kraken ticket); (2) R3 xStock LQ as SEPARATE `xstock_spot/imf-liquidity.ts` module not shared-branch; (3) R4 min-viable depth-cap-sizing + thin-market exit IN-batch; (4) pattern-detector volume-use closure mandated in pre-audit; (5) RTB stored volume24h stop/annotate; (6) O6 script committed under scripts/. NOTHING implemented until Kyle approves; then Step 2 pre-audit (per-component SIM/Manual deep read + crypto-vs-xStock difference register + isolation proof plan).
**Cross-asset isolation pillar (Kyle mandate):** every liquidity/volume change must be asset_class-gated (or per-class module) + regression-lock test proving crypto path byte-identical — follows SIM §9.13 precedent (MCE cache key `${symbol}:${assetClass}`, SQE `${mode}:${assetClass}`, mce-cache-isolation + sqe-routing tests).

**RESEARCH-CONFIRMED FINDINGS (2026-05-28 — Kyle directed web research + Kraken-data cross-check; scope premise CHANGED):**
- **PRICES ARE CORRECT — no dislocation.** Kraken does NOT send typos (Kyle's instinct right). MU/USD $927 is REAL: Micron genuinely ~$905 on 2026-05-28 (hit $1T market cap, +19% on AI-memory boom, UBS target $1,625). My prior "MU 9x dislocation" was MY error (anchored on Micron's 2024 ~$120 price). NVDA $211 / TSLA $438 / AAPL $310 / QQQ $729 all match real current. xStocks are 1:1 with underlying, priced to underlying execution (Kraken docs). → DROP price-dislocation objective (O2); just spot-confirm.
- **VOLUME IS BROKEN — ~700× TOO HIGH, now PROVEN.** Kraken's own public page: TSLAx 24h volume = **~$926K USD** (matches Kyle screenshot ~$600K order-of-magnitude). OUR system computes **~$665M** for TSLA (1.52M × $438). ~700× inflation. Real xStock token volumes are HUNDREDS OF THOUSANDS of dollars, not millions/billions.
- **ROOT CAUSE CONFIRMED 2026-05-28 via live raw-WS capture (`_kraken_probe.cjs`, since deleted):** the ticker channel `volume` field we ingest = the UNDERLYING EQUITY's share volume, NOT the token's. Raw TSLA/USD ticker: `volume`=13.16M accumulating intraday toward `prev_day_volume`=44.83M = real Tesla daily share volume (NVDA prev_day 168M, AAPL 50M all match real underlying). We then × price → underlying turnover (billions). THAT is the inflation (varies intraday; ~700× off-hours, ~6000× mid-session). Kraken WS v2 docs: `volume` = "24h volume in base currency" — true, but on ws-equities the base-currency volume reported is the underlying's, not the token's.
- **BOTH Kraken-feed volume fields are UNUSABLE for token liquidity (verified vs authoritative CoinGecko 2026-05-28):** ticker `volume`×price ≈ $5.8B-$19.8B (underlying); OHLC-bars summed ≈ $1.77B (also inflated, NOT clean token vol — bars genuinely per-minute but ~170× too high vs real). AUTHORITATIVE cross-venue per-token 24h vol from CoinGecko `xstocks-ecosystem` (already used by universe-discoverer): GOOGLx $23M, AAPLx $11.3M, TSLAx $10.3M, NVDAx $8.75M … GLDx $306K. Kraken's OWN slice (consumer page TSLAx ~$926K) ≈ 9% of cross-venue.
- **EXECUTION PATH (CORRECTED 2026-05-28 — earlier "Kraken-user-only/~9% slice" RETRACTED as unverified):** our code's only order method = `addOrder`→`makePrivateRequest('AddOrder')` (MAIN Kraken API). BUT xStock pairs are NOT on Kraken's main REST (TSLAxUSD/TSLAX → "Unknown asset pair"); they live on the SEPARATE equities system (ws-equities.kraken.com) → our live xStock order path may not be fully wired yet (active xStock trading still off). And Kraken's xChange explicitly CONNECTS xStock order books to broader onchain + traditional-market liquidity via market makers (Kraken blog: $10B total xStock vol, ~$2B onchain) — so the book is liquidity-CONNECTED to the cross-venue pool, NOT walled to Kraken users. NET: don't assert Kraken-isolated. Real fillable liquidity = order-book DEPTH posted at trade time (the reliable signal we receive), not any single reported volume number.
- **FIX DIRECTION (reframed):** don't use ws-equities volume fields for liquidity at all. Use (a) order-book DEPTH `bid_qty`/`ask_qty` from ticker (reliably received; TSLA top-of-book ~40/120 tokens ≈ $18K-$53K = direct fillable-liquidity signal, best for stuck-trade risk), and/or (b) an authoritative Kraken-specific token 24h volume (Kraken REST equities if one exists, else CoinGecko cross-venue as upper bound). Open: is there a Kraken REST equities ticker giving token (not underlying) volume?
- Symbols stored as "TSLA/USD" / "MU/USD" (no 'x' suffix); Kraken tradeable tokens are TSLAx etc. — confirm symbol-mapping in pre-audit.
- Global filter `active_quant`: min_volume=$1M (MEANINGLESS vs real ~$100K-$1M volumes), **max_price=0 — KEEP DISABLED (Kyle directive: don't cap high-priced names like BTC/blue-chips)**, min_price=$5.
- **CORRECTION (still valid):** paper vs live screener_filters values diverge (NOT byte-identical artifact).
- **REVISED scope direction (await Kyle nod):** (1) root-cause + fix the ~700× volume inflation → real token liquidity; (2) DROP price-dislocation (prices correct); (3) keep max_price OFF; (4) recalibrate min_volume to true scale once volume fixed; (5) tradeable-universe count from corrected volume. Still GATE before B.2.
- **VERIFIED IN CODE 2026-05-28 (Kyle: stop assuming, verify via SIM/Manual/code):** (a) symbol MU↔MUx handled by `server/utils/symbol-normalize.ts` — canonical=`MU/USD` (no x), display=`MUx/USD`, WS feed emits canonical → our "MU/USD" records are correct, NOT a mapping bug. (b) Volume read-back faithful: scanner.ts:490,513 `parseFloat(volume_24h)` no transform; archiver stores `data.volume` verbatim → 700× is in RAW Kraken `volume` field, upstream of us. Root-cause needs raw-WS-payload capture + Kraken REST/page cross-check.
- **KYLE STRATEGIC FRAMING (2026-05-28):** xStocks are an IMMATURE/ILLIQUID asset class (NVDA/MU xStock several-hundred-$ price but <$1M 24h vol = few trades). Top risk = STUCK-OPEN TRADES that can't close in thin market. Fractional-token ownership means token-COUNT misleading → dollar-volume is the right liquidity unit. Calibration must be EVIDENCE-BASED (participation-rate / days-to-liquidate from real $-vol + position size), NOT crypto-ratio. Applies to BOTH global + IMF filters. Methodology must answer "how many of ~485 actually tradeable" honestly (likely far fewer than crypto's 100-200).

### FILTER-INFRA IMPACT (verified 2026-05-28 — imf-evaluator.ts read + agent map w/ line cites)
- **Bad volume corrupts BOTH filter stages:** (1) global filter `min_volume` gate uses `volume24hUSD` = ticker volume×price = UNDERLYING (global-filter.ts:118); (2) IMF **LQ (Log-Liquidity) factor** uses per-bar OHLC `candle.volume` via `calculateLogLiquidity` (imf-metrics.ts:68, called imf-evaluator.ts:104) — and OHLC bar volume is ALSO inflated. So liquidity gating is wrong at pre-screen AND IMF.
- **Order-book DEPTH (bid_qty/ask_qty) is ABSENT from filters** — only bid/ask *spread* used (B-NEW-14). We DO capture bidQty/askQty in ticker_snap but no filter reads it → using depth = NEW plumbing (scanner enrichment → global/IMF).
- **Architecture = mirror-of-crypto, DB-keyed:** xStock filters forked into dedicated modules (global-filter.ts, imf-evaluator.ts) but architecturally identical to crypto; IMF metric fns SHARED (imf-metrics.ts, asset-class-agnostic); ALL thresholds in `screener_filters` keyed by asset_class. → Changes needed = (a) re-source liquidity INPUTS at both stages, (b) add depth plumbing, (c) maybe xStock-specific LQ (crypto LQ = log10 of USD vol assumes deep mkt). Threshold *structure* unchanged (just data). LQ formula divergence is the main candidate for real code fork.

### DOWNSTREAM BLAST RADIUS (agent-mapped + spot-verified 2026-05-28) — bad volume goes WAY past filters
- Beyond global+IMF filters, volume/liquidity is consumed by: **MCE** (volume24h param → indicators + archive), **Directional Bias Store** (global DBS = VOLUME-WEIGHTED median → feeds regime classifier), **Volume-Regime modulator B68.2** (multiplicative confidence-chain factor [0.92-1.05] computed from per-bar OHLC volume), **~8 strategies** (volume gates + confidence bonuses incl. ORB). So inflated volume distorts regime detection + every signal's confidence, not just the liquidity gate. NOT consumed by: SQE, position-sizing, exits/TEC, cost-model (verify in Step 2 pre-audit before implementing).
- **GAP (Kyle stuck-trade concern):** position sizing is purely risk-based (NO liquidity cap / participation rate) and exits are purely price-based (NO thin-market input). So liquidity currently plays NO role in how an xStock is sized or closed. For an illiquid asset that's a gap to fix (liquidity-aware sizing + exit).

### TRADE REPORT (Kyle ask 2026-05-28) — xStock closed VTS virtual trades = `exit_strategy_alternates` (1,140 trades × 12 exit variants)
- Baseline (`current_trailing_baseline`) exit-reason mix: TRAIL_hit 66.8% (+0.31%), SL_hit 19.6% (−1.39%), INSUFFICIENT_DATA 9.2%, BE_stop 2.2%, **TP_target_hit 1.7%**, **TIMEOUT 0.5% (6 trades, avg ~7 DAYS stuck)**. Target hits very rare; timeouts rare but when they happen = ~7-day stuck (the stuck-trade signal).
- **Liquidity-correlation NOT possible from stored data:** `feature_snapshots.liquidity_score` is EMPTY/unpopulated; no per-trade LQ persisted; AND exit replays assume the trade can always fill at the bar price (NO liquidity modeled) → simulated closes OVERSTATE exitability, so real thin-market stuck risk is NOT captured. Net: can't show liquidity caused bad closes because liquidity isn't wired into sizing/exits at all.

### OTHER ASKS (Kyle 2026-05-28) — ALL DONE
1. **Scope rewrite → v3 DONE** (Langston-reviewed CLEAN-CONDITIONAL, 6 conditions folded). Awaiting Kyle sign-off.
2. **Langston independent investigation DONE:** confirms volume=underlying (magnitude + bare-symbol + documented SPV toggle); leans addOrder=CLOB but MM-willingness-bounded (depth IS the gate but a live moving target, no static LQ safe); gave O0 empirical settlement plan.
3. **LLM research prompt DONE + 4 LLMs answered** (`Scope Files/XSTOCK_VOLUME_RESEARCH_PROMPT.md`; responses in `Claude Comms and Packages/X-Stocks Volume Feed Research - Multi LLM.md`). CONSENSUS: ws-equities volume=underlying, gate on live order-book depth not volume, 3 numbers = different denominators, Kraken-slice-small expected. KEY DIVERGENCE: CLOB (Gemini/prior-CC) vs RFQ (Opus) execution — UNRESOLVED → O0. Opus unique catches: documented SPV/underlying toggle; Bybit delisted (others stale); bare-symbol tell. Our catch: Gemini's "use /0/public/Ticker" provably wrong (xStock pairs not on main REST).
4. **Trade report DONE** (see TRADE REPORT block above).
5. **Telemetry +48h gate PASSED+ACKED** (see watchlist).
**KYLE SIGNED OFF on v3 2026-05-28 ("Please proceed"); authorized autonomous CC+Langston iteration to completion.** Active trading stays OFF throughout (zero live-capital risk).
**O0 RESOLVED (read-only `_kraken_book_probe.cjs`):** ws-equities `book` channel returns FULL 20-level depth ladder for active (TSLA) AND thin (GLD) names → execution venue = CLOB (not RFQ); depth is the binding gate. MM depth real even on thin names. NO live order needed for this batch.
**ORDER-PATH PROVEN via validate-only AddOrder through app KrakenService (staging, no capital, Kyle-directed 2026-05-29):** crypto XBTUSD → `EOrder:Cost minimum not met` = path AUTHENTICATED + reached Kraken order engine (auth/perm/path OK, only too-small). xStock TSLAxUSD AND TSLA/USD → `EQuery:Unknown asset pair` = our order path (main api.kraken.com via addOrder) does NOT reach the xStock venue (xStocks on separate equities system). → **CONFIRMED Phase-19 wire-in item: point xStock order path at Kraken's equities trading endpoint.** Exactly the breakage Kyle predicted. DEFERRED to pre-active-trading gate: tiny live addOrder to confirm fills + verify our addOrder (main-API) path reaches the equities CLOB (xStock pairs absent from main REST = wiring unverified) — needs Kyle then.
**PAPER-VS-KRAKEN (verified in code 2026-05-29, Kyle pushed "do not assume"):** CURRENT clone-repo code — paper-mode active trading SIMULATES, does NOT call Kraken order API. Evidence: `trading-engine.ts` kraken.addOrder calls (335/550/562/641) ALL inside `if(mode==='live')`; paper branch = `else` line 394 "simulate execution" (random slippage, no Kraken); `paper-execution-engine.ts` = executeSimulatedTrade (sim); KrakenService = production-only `https://api.kraken.com` (kraken.ts:90), NO demo/sandbox endpoint; `addOrder` supports `validate` flag (kraken.ts:546) but NO caller uses it. **CORRECT ARCHITECTURE (Kyle taught 2026-05-29; CC kept getting this wrong — internalize):** TWO ORTHOGONAL axes: (1) mode = paper|live; (2) active-trading ON vs OFF. **ACTIVE trading (paper OR live)** = FULL pipeline: scanner→regime→DSS→signal-orchestrator generates ONE best signal/cycle (NOT one-per-strategy-per-regime)→SQE→RTB→TEC→execution engine; paper mode routes execution through Kraken's PAPER order system (Kraken DOES have a spot paper sandbox — verified), live through Kraken live. **Trading OFF → VTS/passive learning:** generates MANY virtual signals/trades (per strategy/regime) for MAX learning data; telemetry-only; internal simulator. VTS did NOT replace paper trading — it's a SEPARATE passive mode built (~Phase 8) to feed data continuously WHILE building the system. **Last ACTIVE-paper run = END OF PHASE 8** → Kraken trading key idle 6mo b/c active-paper hasn't run since; system in VTS/passive since. **Current state (Kyle corrected framing 2026-05-29):** active-paper system EXISTS — NOT "missing/unwired." It's DORMANT since end of Phase 8 while heavy change accreted around it (new pair/signal processing, asset-class awareness, multi-asset crypto+xStock — much incomplete/untested/error-laden) → will likely BREAK when turned on. **Phase 19 = turn Paper Mode Active Trading back ON + get it working again** (debug/repair/test the existing pipeline vs accumulated changes); that's WHEN exec-model/fills get answered for real. Do NOT say "not wired"; verify behavior in code, not docs (some doc wording imprecise). Avoid the term "clone" with Kyle (my term for working-copy repo; he doesn't use it). **The 1,140 "closed trades" I reported = VTS PASSIVE-LEARNING sims (exit_strategy_alternates), NOT active-paper outcomes.** **CLAUDE.md §5 #20 now canonicalizes this taxonomy (mine + Langston's CLAUDE.md).** Canonical refs: `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` + `_Complete_Project_History.md`. **Kraken email 2026-05-27 + key screenshots:** 2 keys — `dawntrader-staging` (order create/modify ON, IP-locked 188.245.193.8/32 = staging) and `TradingAppAPIKeys` (order create/modify REVOKED after 6mo idle, no IP restriction). Kyle restoring/updating the key himself (security boundary).
**Wire-in options surfaced:** route paper-mode through Kraken's paper sandbox (live prices, more realistic) vs internal sim; Kraken paper/validate could confirm exec-model once key restored. OPEN: does Kraken's paper sandbox cover xStock equities pairs (separate ws-equities venue)? **Restoring key perms = Kyle-only account action (security boundary — CC cannot touch API-key permissions); restore via Kraken site directly not email link; required before ANY real/validate Kraken round-trip; that's the active-trading wire-in, NOT this batch.**
**ONLY things needing Kyle in this batch:** none blocking. (Optional/non-blocking: Kraken support ticket for paper trail; the live-order confirmation is a future pre-active-trading gate, not this batch.) Surface at checkpoints (pre-audit done, pre-staging-deploy, completion); escalate on true deadlock / new architectural fork only.
**NEXT (autonomous):** Step 2 pre-audit — per-component SIM/Manual deep read + crypto-vs-xStock difference register + isolation proof plan; then implement (re-source liquidity inputs, depth plumbing R2, xStock imf-liquidity.ts R3, min-viable depth-cap sizing + thin-market exit R4), regression-lock isolation tests, threshold recalibration, Langston code review, staging deploy, verify, governance, completion.

### ⏳ LATER — B.2 IMF family threshold calibration
Umbrella scope v1.1 PENDING: screener_filters has 14 distinct filter_paths per asset_class (7 vts_* + 7 active_*); the VTS/active split lives ONLY here (regime classifier + per-strategy gates are SHARED across paths). xStock-side gaps: missing `vts_strong_trend` in live + 2 blank-filter_path rows. mode-column (paper/live) is byte-identical-value artifact — write same value to both. Needs commit + Langston ACK before B.2 work.

### KEY DOCS / COMMITS
- **Umbrella scope:** `Scope Files/B_XSTOCK_CALIB_SCOPE.md` (v1; v1.1 PENDING B.2 14-targets + filter-path/mode-column findings)
- **Halving provenance:** xstock_spot tfsMomentumScale=0.010 + tfsVolatilityScale=0.0125 intentional, from B79.0n.MCE (ref commit `9537794`). Gate cleared — "validate the halving" framing correct.
- **MCE close:** `aa0564107` (PM2 #311 2026-05-22)

### 🟢 VERIFY-GATE WATCHLIST (process if any promote)
- `1f34cf84` — B79.0n.TELEMETRY +48h ✅ PASSED + ACKED 2026-05-28 (cc-session): 0 xStock/perp telemetry records (dormant-3 recordCount=0 = healthy), crypto_spot recording normally. No cross-class mis-routing.
- `b83b1e4b` — B-NEW-40 14-day soak at 2026-05-31 12:46Z

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)
- **CLAUDE.md §1 strengthened 2026-05-28:** plain language on EVERY Kyle message — not just final summaries. No SSH/cron/systemd/process jargon. Substitute "phone call to Langston" / "AI helper on the other computer" / "scheduled alert" if unsure.
- **§5 #19 CI per-batch confirmation MANDATORY**.
- **§10.5 alerts every turn** — SURFACE actionable IN RESPONSE. Langston now auto-receives via SSH-invoke per B-NEW-45.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`.
- **§6.5.0.a embedded-diff** for Step 4 code reviews.
- **§7.1 code edits in `C:\dev` mirror ONLY** — governance in GDrive OK. Test gates: `cd /c/dev/DawnTraderV3 && npx tsc --noEmit` (494 baseline) + `node scripts/check-tsc-baseline.mjs`.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST then copy to in-repo + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines**.
- **Active trading = paper OR live (sub-states).** VTS = passive learning when active trading is OFF, no paper concept. (Kyle terminology fix 2026-05-28.)
- **NEVER push without Kyle review** per autonomous-run trust pattern — commit locally, surface for review.

---

## ACTIVE TASKS (volume/price-quality scope — Kyle-authorized 10:47Z)
1. Draft `Scope Files/B_XSTOCK_GLOBAL_FILTER_SCOPE.md` (§0 why / §1 scope / §2 out-of-scope / §3 risks / §4 Langston Qs). Findings: wrong volume source (underlying-equity not Kraken-tradeable), price dislocations, thin liquidity, tradeable-universe prune + global min_volume recalibration + multi-week consistency script.
2. Step 1.a architectural read (SIM + System Manual) for volume/price/global-filter surface BEFORE drafting claims.
3. SCP to Langston inbox + dispatch Step 1 ACK (file-first, embedded snippets).
4. Surface scope summary to Kyle DM (8734856533) for sign-off BEFORE implementation.

### .b follow-ups + open RUNNING_ISSUES (key only)
- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA → 2026-06-04
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #153 xstock pattern_max_position_pct 0.50 placeholder
- #160 momentumFactor saturation — Phase 25 handoff
- #135 ✅ CLOSED 2026-05-28 via B-NEW-45
- B-NEW-46.b weekly synth health-check alert — deferred (no SLA)
