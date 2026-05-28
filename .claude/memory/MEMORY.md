# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + TWO-paragraph default; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: TWO paragraphs default. Telegram topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot (Kyle 2026-05-27 evening).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-28 — B-XSTOCK-CALIB umbrella sub-batch 1 (B.1) Step 2 ACK clean + B-NEW-45 CLOSED)

### 🟢 B-NEW-45 CLOSED 2026-05-28 — Alert-dispatcher Langston SSH credential setup
Strictly verified end-to-end via cron-tick-driven test alert `64790fff` promoted 00:03:50Z + Langston ACK 00:04:07Z (17s round-trip). Surfaced TWO bugs inherited from B-NEW-43 Phase 4 (2026-05-23): (1) SSH credential chain never deployed — fixed via ed25519 keypair on deploy@staging + IP-restricted (`from="188.245.193.8"`) entry in Helsinki root authorized_keys + known_hosts seed + logrotate config; (2) systemd `KillMode=control-group` (oneshot default) was killing the detached SSH child before round-trip completed — fixed by adding `KillMode=process` to `system-alerts-dispatcher.service` + daemon-reload. Closing commit pending in this governance push. RUNNING_ISSUES #135 closure addendum noting both root causes added.

**Sequenced follow-ups (not yet started):**
- B-NEW-46.a (code-change): exit-code capture via `on('exit')` handler on dispatcher spawn so future SSH failures surface in dispatcher log.
- B-NEW-46.b (config + scheduled alert): recurring weekly synthesized health-check alert so silent regression surfaces within a week.

### 🟢 B79.0n.EXECUTION (#13) CLOSED 2026-05-27 evening
Closing commit `f283c2c` + governance close `6d6fc4c7a`. Last per-class plumbing sub-batch in B79.0n umbrella v4 (13 of 16 done).

### 🟢 Phase 19 / Phase 25 SPLIT LOCKED (commit `7ab09cac3`)
Phase 19 = functional from scan to closed trade + calibrations without trade outcomes (18 items). Phase 25 = calibration with trade outcomes (10 items). Phase 19 entry 19-19 = AMR body pre-Phase-19 + shadow-mode boot gate (commit `e78e2ecf7`).

### 🟡 B-XSTOCK-CALIB umbrella — sub-batch 1 (B.1) Step 2 pre-audit ACK + B.2 scope correction PENDING Kyle approval
**B.1 pre-audit drafted + dispatched + Langston Step 2 reply received.** Langston Q1 pushback on Option B (promote regime-thresholds to module_constants) — concedes, keep as TS-leaf-module constants. Concur Read A (validate halving, not blank-slate retune). 5 Q5 catches absorbed: commit-hash verification for halving provenance (pre-A1 gate), RTB ranking surface stability framing for Kyle's Read A/B framing, calendar estimate +1d for review/CI/deploy, SIM §5.1 in Step 10 governance, sibling-features helper-file locations confirmed leaf.

**B.2 scope correction PENDING Kyle authorization.** Kyle clarified terminology (active=paper-or-live; VTS=passive learning, no paper concept). Empirical probe confirmed crypto vts_* AND active_* `screener_filters` rows are BYTE-IDENTICAL across mode=paper and mode=live — mode column is artifact, paper-vs-live duplicate rows carry same values. **Actual B.2 scope: 14 distinct calibration targets per asset_class** (7 vts_* + 7 active_*) — not 28 as my v1 scope or 5 as the original umbrella scope said. xStock-side gaps to close: missing `vts_strong_trend` in live mode + 2 blank-filter_path rows. Awaiting Kyle's auth to commit umbrella scope v1.1 + re-dispatch.

**Crypto vts vs active are differently tuned per family** — confirms Kyle's intuition that path-split exists at IMF stage. Examples: `vts_quant.di_min=15` vs `active_quant.di_min=25` (active stricter); `vts_oscillator.di_max=35` vs `active_oscillator.di_max=30` (active stricter); `vts_strong_trend.lq_min=30` vs `active_strong_trend.lq_min=35` (active stricter). So the VTS-permissive vs active-conservative pattern IS the load-bearing distinction. Regime classifier + per-strategy gates have NO path split (single set of values shared).

**Umbrella shape (10 sub-batches + A.3 pre-kickoff DONE):**
1. **B.1 regime threshold + TFS confidence-formula** — Step 2 ACK clean. B.1a regime threshold (Option A TS-constants kept). B.1b validate-the-halving (Kyle-ACK gate at Step 2 → leaning Read A keep with §2.4 evidence; final auth pending).
2. **B.2 IMF family threshold calibration** — SCOPE CORRECTION NEEDED. 14 distinct rows per asset_class (7 vts + 7 active). Mode-column duplicate handling: write same value to paper + live rows (artifact, not load-bearing).
3. B.3 per-strategy gate calibration (no path split).
4. B.4+B.5 friction + spread (coupled).
5. B.6 TEC archive-replay priors.
6. B.7 sector concentration gate + roadmap 19-16 folded.
7. C.1+C.2 equity macro modifier (parallel-capable).
8. D.1 strategy + regime audit.
9. CRYPTO-FRICTION review (sibling parallel).
10. F-NOW asset-class-tag plumbing (dispatched FIRST into parallel slots).

**Model C hybrid sequencing** with **2-sub-batch Langston review queue cap.** Critical path A.3 (done) → B.1 → B.4+B.5 → B.6. Estimated 12-17 days total.

### 🟢 VERIFY-GATE WATCHLIST
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47Z (fires later today; probe already GREEN — ACK at promote)
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z (fires today)
- `b83b1e4b-4870-43d9-9ba0-a45a7d3949be` — B-NEW-40 14-day soak at 2026-05-31 12:46Z

### KEY DOCS / COMMITS
- **Umbrella scope:** `Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_SCOPE.md` (v1; v1.1 PENDING with B.2 14-rows correction)
- **B.1 pre-audit:** `Claude Comms and Packages/Scope Files/B_1_PRE_AUDIT.md` (Langston Step 2 ACK clean)
- **B-NEW-45 scope:** `Claude Comms and Packages/Scope Files/B_NEW_45_SCOPE.md`
- **B-NEW-45 completion report:** `Claude Comms and Packages/Batch Completion/B_NEW_45_COMPLETION_REPORT.md`
- **A.3 closure memo:** `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md`
- **Calibration plan SSOT:** `1-system-manual/XSTOCK_CALIBRATION_PLAN.md`
- **Roadmap:** `1-system-manual/POST_AUDIT_ROADMAP.md`
- **Recent commits:** `f283c2c` (EXECUTION Step 3) → `6d6fc4c7a` (EXECUTION close) → `7ab09cac3` (Phase 19/25 split) → `7f06d47b8` (B-XSTOCK-CALIB pre-kickoff) → `e78e2ecf7` (AMR consensus) → `b9614407b` (MEMORY sync pre-compact)
- **Langston inbox staging:** `/home/langston/inbox/b-xstock-calib/` + `/home/langston/inbox/b-new-45/`

### .b follow-ups + open RUNNING_ISSUES (key only)
- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA after 48h gate close
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #153 xstock pattern_max_position_pct 0.50 placeholder — HARD pre-condition for WIRE-IN
- #155 perp `reason` field truncation
- #157-#159 Langston EXECUTION Step 4 C5 follow-ups
- #135 ✅ CLOSED 2026-05-28 via B-NEW-45 (SSH credential + KillMode=process)

---

## REMAINING UMBRELLA V4 SUB-BATCHES (3 of 16 left)
- #14 WIRE-IN (Phase 19a) — gated on active-trading flip authorization
- #15 ML-CALIBRATION T2 — Phase 25
- #16 OBSERVABILITY T2 + active-trading flip — Phase 19

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)
- **§5 #19 CI per-batch confirmation MANDATORY** — never close a batch with red CI.
- **§10.5 alerts every turn** — SURFACE actionable IN RESPONSE. Langston now auto-receives via SSH-invoke per B-NEW-45.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`, NEVER /mnt/gdrive paths in Langston prompts.
- **§6.5.0.a embedded-diff** for Step 4 code reviews.
- **§7.1 code edits in `C:\dev` mirror ONLY** — governance docs in GDrive OK. Test gates: `cd /c/dev/DawnTraderV3 && npx tsc --noEmit` (494 baseline) + `node scripts/check-tsc-baseline.mjs`.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST then copy to in-repo + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines** — `wc -l` after edit; prune before commit.
- **Plain-language summaries:** TWO paragraphs default; post Telegram topic 21 + Claude Desktop. NO @CCDTCommsBot DMs.
- **xStock 24/5** (NOT US RTH). US market holidays pause cadence.
- **Active trading vs VTS (Kyle terminology fix 2026-05-28):** active trading = paper OR live (sub-states of one mode); VTS = passive learning that runs when active is OFF, no paper concept.
- **Langston SSH-invoke now works** post-B-NEW-45: `/var/log/langston-alert-invokes.log` on Helsinki receives output from dispatcher-triggered claude-cli sessions. Logrotate weekly + IP-restricted credential.
- **§6.5.0.b hung-instance check** — kill Langston find/claude PIDs if stuck on FUSE-mount paths >5 min.
- **Autonomy with Langston:** iterate to consensus per §6.7. Escalate to Kyle only on deadlock / architectural decisions / risk boundaries.
- **Phase 24 standing rule:** completion reports MUST include "Asset-class onboarding workflow learnings" 4-section block (a/b/c/d).
- **All-8-docs ACTUALLY edited at Step 10** per Kyle PATTERN-DETECT directive.

---

## ACTIVE TASKS
1. **B.2 scope correction v1.1** — PENDING Kyle authorization (14 distinct rows confirmed, mode-column duplicate handling noted).
2. **B.1 Step 3 chunk A1 archive-replay harness** — UNBLOCKED to start once Kyle auths B.1b Read A keep + Q5.1 commit-hash provenance check for halving completed.
3. **cbe84d5b alert ACK** — pending 02:47Z promote; probe already GREEN (zero PICK_FALLBACK + zero SQE_STATIC_MIRROR_FALLBACK across full 48h PM2 log window).
