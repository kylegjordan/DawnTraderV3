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

### ⏳ NEXT (Kyle-authorized 10:47Z) — Volume/price-quality sub-batch scope
Draft scope at `Scope Files/B_XSTOCK_GLOBAL_FILTER_SCOPE.md`. Findings driving it: (1) 24h-volume source is the UNDERLYING EQUITY (billions), not the Kraken-tradeable xStock token — wrong source; (2) price dislocations vs underlying (e.g. MU ~$916, SNDK ~$1555 flagged); (3) thin tradeable liquidity (median ~$168k, ~37 zero-volume symbols, ~250/485 over $100k); (4) need tradeable-universe pruning + global min_volume recalibration + multi-week consistency check (as a reusable indexed script). Workflow: draft → Langston Step 1 ACK → surface to Kyle DM (8734856533) for sign-off BEFORE any implementation. Kyle approves scope first.

### ⏳ LATER — B.2 IMF family threshold calibration
Umbrella scope v1.1 PENDING: screener_filters has 14 distinct filter_paths per asset_class (7 vts_* + 7 active_*); the VTS/active split lives ONLY here (regime classifier + per-strategy gates are SHARED across paths). xStock-side gaps: missing `vts_strong_trend` in live + 2 blank-filter_path rows. mode-column (paper/live) is byte-identical-value artifact — write same value to both. Needs commit + Langston ACK before B.2 work.

### KEY DOCS / COMMITS
- **Umbrella scope:** `Scope Files/B_XSTOCK_CALIB_SCOPE.md` (v1; v1.1 PENDING B.2 14-targets + filter-path/mode-column findings)
- **Halving provenance:** xstock_spot tfsMomentumScale=0.010 + tfsVolatilityScale=0.0125 intentional, from B79.0n.MCE (ref commit `9537794`). Gate cleared — "validate the halving" framing correct.
- **MCE close:** `aa0564107` (PM2 #311 2026-05-22)

### 🟢 VERIFY-GATE WATCHLIST (process if any promote)
- `1f34cf84` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z (xstock_perp/crypto_perp/xstock_spot recordCount=0 IS the gate signal)
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
