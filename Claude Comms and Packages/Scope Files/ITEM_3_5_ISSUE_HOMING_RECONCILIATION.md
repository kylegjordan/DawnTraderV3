# ITEM 3.5 — RUNNING_ISSUES → Roadmap-Homing Audit + Roadmap Reorder

> **Between-Phase-24→19 plan, item 3.5** (Kyle directive 2026-06-08; readiness-checklist §4.a). Walk every non-resolved `RUNNING_ISSUES.md` entry, confirm each has an explicit roadmap home, place the homeless / escalate the ambiguous, and reorder `POST_AUDIT_ROADMAP.md` to the canonical sequential post-19 order. Langston second-pass on the placements before close.
>
> **Created:** 2026-06-09. **Author:** Claude Code. **Status:** DRAFT for Langston review — no live-doc edits applied yet (NO-PATCHES design-before-build).
>
> **Audit method:** full document-level read of `RUNNING_ISSUES.md` (549 lines, ~200 numbered entries) + `POST_AUDIT_ROADMAP.md` (1760 lines), cross-referenced against the locked Phase-19 (19-1…19-20) and Phase-25 (25-1…25-15) tables (roadmap 2026-05-27 update) and the between-Phase-24→19 plan. Not grep-only; every non-resolved entry's home was assigned from its own text + the roadmap structure.

---

## 0. CANONICAL EXECUTION ORDER (the homing target)

Per Kyle 2026-06-08, the real run order (phase NUMBERS are not the order):

**Between-plan (pre-19):** item 4 (VTS standalone always-on sim + storage-arch design) → item 4.5 (Kraken tiered-fee fix) → item 5 (AMR body) → **Phase 19** (Paper Mode Audit & Debug) → **Phase 25** (Calibration with evidence) → **Phase 16 + Phase 20** (legacy cleanup + production hardening, on the now-stable system) → **Phase 21** (Live). Post-live: **Phase 22** (Publication), **Phase 21.4** (Modularization), **Phase 21.5 / Phase 26** (perpetual-futures onboarding), **Phase 17/18** (real ML).

Every open issue must land in one of: a between-plan item (4 / 4.5 / 5), Phase 19, Phase 25, Phase 16, Phase 20, Phase 21, a post-live phase, or "operational/infra (not a roadmap phase)."

---

## 1. SUMMARY

- **Non-resolved entries audited:** ~90 (after excluding entries already RESOLVED/CLOSED in their own text but caught by status-token scan).
- **Already homed (status/roadmap already names a valid phase):** ~70. The Phase-19 and Phase-25 locked tables alone home ~18 directly (see §2).
- **Placed by this audit (had a vague/stale/missing home):** ~14 (see §3).
- **Escalated to Kyle (genuine decision):** 4 (see §4) — per-class regime / B-NEW-48 (4.1), #142 bundling (4.2), #12e dormant strategies (4.3), **#111 TFS sustainability gate Phase-19-vs-25 reconciliation (4.4, added per Langston review)**.
- **Recommend CLOSE as stale/superseded (no longer real open work):** **11** (see §5) — 7 clean closes + 4 verify-THEN-close.
- **Roadmap reorder (part B):** add a canonical-execution-order block (VERBATIM mirror of readiness-checklist §1) + fix 4 stale labels (see §6). No physical re-sort of 1760 lines; the order is stated explicitly so "numbering ≠ order" stops being a trap.

> **★ Langston second-pass applied (2026-06-09).** Langston reviewed v1 and AGREED §6 as-is, §4.2/§4.3, and §5 substance — with two real catches + a tally fix now folded in: (a) **#111** was silently re-homed Phase-19→25 and labelled "stale" in v1; it was a locked 3-way Kyle/CC/Langston decision (2026-05-17), so v2 escalates it (§4.4) instead of overriding. (b) **#162** already has a sequencing lock — Kyle directive 2026-05-30 "B-NEW-48, after B-NEW-47, conditional on a consumer-impact check"; B-NEW-47 shipped, so #162's home is **B-NEW-48** (not floating), #163 pairs under it; v2 §4.1 reframed. (c) §5 count fixed 9→11; the 4 verify-first entries flagged mandatory. (d) §2 dedupe: #107/#172/#132 double-listed (compatible homes, dedupe before tally); #130 dangling "RTB #11" internal ID reconciled to its Phase-19 home.
> **★ Kyle decision (2026-06-09):** per-class regime → **"decide during calibration."** Reconciles with the B-NEW-48 lock: B-NEW-48's go/no-go is folded into Phase 25 (decide the principle there; do the #163 code restructure in cleanup only if yes). Keeps it off the pre-live critical path.

---

## 2. FULL MAPPING — every non-resolved issue → home

Legend: ✓ = home already stated in entry/roadmap; ▲ = placed by this audit; ⚑ = escalated (§4); ✗ = recommend close (§5).

### Phase 19 — Paper Mode Audit & Debug (active-trading restoration)
| # | Issue (short) | Home | |
|---|---|---|---|
| 117 | xStock active-trading wire-in NEVER SHIPPED | Phase 19 (19-1/19-2 WIRE-IN + flip) | ✓ |
| 137 | active-trading-path restoration intake (54 files/231 errs) | Phase 19 (19-6) | ✓ |
| 92 | wire xstockSpotScanner through orchestration | Phase 19 (19-7) | ✓ |
| 95 | xStock real-time WS pricing adapter (B79.5) | Phase 19 (19-8) | ✓ |
| 96 | sector-aware portfolio-cluster prevention (B79.6) | Phase 19 (19-16) | ✓ |
| 97 | xStock characteristics inventory | Phase 19 (19-15) | ✓ |
| 139 | vts-runner throwing resolveAssetClass call sites | Phase 19 (19-10) | ✓ |
| 166 | TEC stale-cache fence still firing (fix before active-paper) | Phase 19 prerequisite | ▲ (add as numbered 19-x) |
| 204 | xStock corrupt-stop incidence ~45× crypto | Phase 19 | ✓ |
| 201 | range_trade selection-starvation (needs join-test) | Phase 19 | ✓ |
| 83 | Boot Readiness Coordinator | Phase 19 (19-5 / §19.x) | ✓ |
| 130 | RtbSignal DB row lacks asset_class column | Phase 19 (active-path) | ▲ |
| 138 | Hybrid first-confluence label verification | Phase 19 (was "Phase 24 watch" — re-home) | ▲ |
| 150 | RTB Phase 4 SET NOT NULL on 48h zero-null gate | Phase 19 (active-path) | ▲ |
| 158 | getPaperSimTrades JS-filter inefficient at WIRE-IN volume | Phase 19 (active-path perf) | ▲ |
| 159 | EMIT_TRADE_CLOSED canary log volume gating | Phase 19 (active-path) | ▲ |
| 122 | cross-class portfolio P&L reconciliation gap | Phase 19 (surfaces when portfolio reports mix classes) | ▲ |
| 173 | recurring zero-NULL forward-path guard | Phase 19 (data-capture coverage §19.0.5) | ▲ |
| 99b | xStock scanner SCAN_TIMEOUT log events | Phase 19 (audit & debug) | ▲ |
| 141 | TEC strict 11-key HARD-FAIL restoration | Phase 19 **start** (test-suite cleanup §16.7) | ✓ (parked 2026-06-09) |
| 209 | ratchet .tsc-baseline.json (regen on Linux) | Phase 19 start (test-suite cleanup §16.7) | ✓ |

### Phase 25 — Calibration with evidence
| # | Issue (short) | Home | |
|---|---|---|---|
| 94 | xStock equity-equivalent macro confidence modifiers | Phase 25 (25-7) | ✓ |
| 153 | xstock pattern_max_position_pct 0.50 validation | Phase 25 (25-8) | ✓ |
| 111 | TFS sustainability gate value-scope decision | **ESCALATED §4.4** — recommend Phase 25 (25-3) but it was a locked 2026-05-17 Phase-19 decision; Kyle confirms the move | ⚑ |
| 205 | HCE rejected-arm causal test | Phase 25 (25-15) | ✓ |
| 206 | decision-provenance accrual (capture DONE) | Phase 25 (25-12 study; #206 accrual alert) | ✓ |
| 203 | ORB enable=FALSE pending own study | Phase 25 (25-14); ORB *plumbing* may run pre-19 | ✓ |
| 40 | other-4 regime-branch confidence saturation | Phase 25 (25-2 confidence-chain calibration) | ▲ |
| 44 | active-path B68.5 OHLC plumbing (was "B67.5") | Phase 25 (25-2) — vague batch-ID retired | ▲ |
| 45 | persisted-modulated-confidence hook (was "B67.5") | Phase 25 (25-2) — vague batch-ID retired | ▲ |
| 160 | TFS momentumFactor saturates | Phase 25 (25-2) | ✓ |
| 80 | extend B73 exit-ablation to xstock_spot | Phase 25 (xStock calibration tail) | ✓ |
| 86 | continuous Q-D friction probe | Phase 25 (friction calibration) | ✓ |
| 104 | tighten pattern-path di_min (Layer-3 calib) | Phase 25 | ✓ |
| 99 | exit-strategy-replay-service.ts:339 (folded xStock calib) | Phase 25 | ✓ |
| 112 | xStock dividend-credit empirical question | Phase 25 (xStock calib / Phase D) | ✓ |
| 114 | crypto DBS floor sentinel-zero entries | Phase 25 (crypto re-validation) | ▲ |
| 115 | crypto dbs_calculation module_constants asymmetry | Phase 25 (crypto re-validation) | ▲ |
| 200 | crypto DBS DEFAULT_DBS_CONFIG → per-class migration | Phase 25 (crypto re-validation) | ✓ |
| 199 | no honest xStock token-volume feed | Phase 25 (calibration data layer) | ✓ |
| 129 | sqe_config per-class rows (SCORING scope) | Phase 25 (25-4 SQE recalibration) | ▲ |
| 143 | R-5 SQE_EVAL runtime observation | Phase 25 (SQE) | ▲ |
| 149 | RTB.b per-class cadence calibration | Phase 25 (gates on xstock active-trading) | ✓ |
| 12e | regime-gated strategies dormant | Phase 25 (strategy calibration) — or close as accepted (§5) | ⚑/✗ |

### Phase 16 — Database & Legacy Cleanup (register #136)
| # | Issue (short) | Home | |
|---|---|---|---|
| 136 | Phase 16 legacy-component review register | Phase 16 (the register itself) | ✓ |
| 174 | predictive-learning teardown remainder (ml-calibration etc.) | Phase 16 register | ✓ |
| 52, 73, 93, 98, 100, 101, 102, 103, 107, 109, 124, 126, 131, 132, 133, 134, 140, 146, 147, 151, 152, 154, 156, 157, 172, 198 | dead-code / Tier-3 cleanup / dedup / orphan-const / doc-drift / op-hygiene | Phase 16 | ▲ (most) |
| 202 | deploy-hygiene git-tree artifacts (ELEVATED — recurrence) | Phase 16 / operational (.gitignore 4 runtime dirs next) | ▲ |
| 163 | CANONICAL_REGIME_STRATEGY_MAP byAssetClass restructure | Phase 16 (or Phase 20.5) — see §4 | ⚑ |

### Phase 20 — Production Hardening (incl. 16.7 test-suite, security, retention)
| # | Issue (short) | Home | |
|---|---|---|---|
| 39 | TypeScript Check CI job failing (storage.ts) | Phase 16.7 Test Suite Recovery (runs at Phase 19 start) | ▲ |
| 113 | CI red baseline (accepted tech debt) | Phase 16.7 | ✓ |
| 132 | TS-hardening sweep (noUncheckedIndexedAccess) | Phase 16.7 / Phase 20.3 | ▲ |
| 148 | MarketDataHealthCheck EACCES /home/runner | Phase 16.7 / Phase 20.3 | ▲ |
| 168 | CI cannot catch production-bundle boot crashes (ESM) | Phase 20.3 test infra | ▲ |
| 106 | system-alerts stale-lock recovery race | Phase 20 hardening | ▲ |
| 110 | ForceCommand wrapper on Langston pubkey | Phase 20.4 security | ▲ |
| 107 | KYLE_DM_CHAT_ID hardcoded → env var | Phase 20.4 / Phase 16 | ▲ |
| 46 | passive-archive aggregator window counts 0 (perf) | Phase 20.2 index/retention | ▲ |

### Storage tiering — item-4 storage-architecture design (then Phase 20.2 retention)
> These all gate on, or belong inside, the item-4 §5a storage-architecture decision (3 always-on producers). Recommend they be explicitly tagged "item-4 storage design / Phase 20.2" rather than the retired "B75.x" vague ID.
| # | Issue (short) | Home | |
|---|---|---|---|
| 62, 63, 64 | keyset pagination / multipart-TUS / cold-rotator edge (B75.x) | item-4 storage design → Phase 20.2 | ▲ |
| 65, 66, 67 | partition context_bridge_log / execution_attempt_audit+walter_memory / migrate b70 retention knob | item-4 / Phase 20.2 | ▲ |
| 169, 170, 171, 172 | warm-upload OOM / day-grain >5GB floor / corrupt-manifest manual / stale equity_* keys | item-4 / Phase 20.2 | ▲ |

### Post-live (Phase 21.5 perp / Phase 26 / Phase 17-18 ML / Phase 22)
| # | Issue (short) | Home | |
|---|---|---|---|
| 144 | perp-activation pre-flight checklist | Phase 21.5 / Phase 26 (post-launch) | ✓ |
| 155 | perp reason-field truncation | Phase 21.5 / Phase 26 | ✓ |
| 127 | UNIVERSE-DISCOVERY Finnhub tiered re-enrichment | Phase 25 data layer / post-launch | ▲ |
| 123 | external macro feed asset-class-agnostic | Phase 25 (macro modifiers) / post-launch | ▲ |

### Operational / infra (NOT a roadmap phase — note as such)
| # | Issue (short) | Home | |
|---|---|---|---|
| 42 | CCDT narration leak (Langston self-fix, IN PROGRESS) | Operational (Langston bridge) | ▲ |
| 84 | Langston watchdog v2 stream-json liveness | Operational (Langston bridge) | ▲ |

### Bundling-TBD / needs a home decision
| # | Issue (short) | Home | |
|---|---|---|---|
| 142 | SCORING.b wildcard retirement (gate passed, bundling TBD) | Phase 16 cleanup OR fold into a Phase-19 SQE touch — **recommend Phase 16** | ⚑ |

> **Dedupe before the final tally (Langston catch):** three entries appear in two compatible homes — **#107** (Phase 16 + Phase 20.4 security), **#172** (Phase 16 + storage cluster), **#132** (Phase 16 + Phase 16.7/20.3). Homes are compatible (not wrong) but the summary count must dedupe them to one primary home each: #107→Phase 20.4, #172→storage/Phase 20.2, #132→Phase 16.7. Also **#130**'s own text says "RTB batch (#11) scope" — reconcile that dangling internal batch-ID to its Phase-19 home so it doesn't read as two homes.

---

## 3. ITEMS PLACED BY THIS AUDIT (had vague/stale/missing home) — ▲ rows above
The substantive placements: #166, #130, #138, #150, #158, #159, #122, #173, #99b (→ Phase 19); #111 (reconcile to Phase 25, not Phase 19); #40, #44, #45, #114, #115, #129, #143 (→ Phase 25); the Tier-3/dead-code cluster (→ Phase 16); the storage cluster #62-67/#169-172 (→ item-4 storage design); #39/#132/#148/#168/#106/#110/#107/#46 (→ Phase 16.7/Phase 20); #127/#123 (→ Phase 25/post-launch). **Retired vague batch-IDs:** "B67.5" (#44/#45) → Phase 25; "B75.x" (#62-67) → item-4/Phase 20.2; "B81" (#73) → Phase 16.

---

## 4. ESCALATED TO KYLE — genuine decisions (recommended placement in brackets)

**4.1 — Per-asset-class REGIME — #162 + #163. [REFRAMED per Langston catch + RESOLVED by Kyle 2026-06-09]** Today REGIME is computed globally (one regime for the whole system) while DBS and friction are already per-asset-class. **#162 is NOT homeless** — it already carries a sequencing lock (Kyle directive 2026-05-30: "scheduled as B-NEW-48, sequenced AFTER B-NEW-47, conditional on a consumer-impact check at B-NEW-48 scoping"). B-NEW-47 shipped (#161 closed 2026-06-01), so #162's home is **B-NEW-48**; **#163** (the canonical regime→strategy map per-class restructure) pairs UNDER B-NEW-48 as the code the per-class-regime decision would entail. **Kyle decision 2026-06-09: "decide during calibration."** Resolution: **B-NEW-48's go/no-go folds into Phase 25** — decide the principle there (does splitting regime change xStock-vs-crypto tuning enough to matter?); run the #163 restructure in cleanup (Phase 16 / 20.5) only if yes. Off the pre-live critical path. No further Kyle input needed; recorded.

**4.2 — #142 SCORING.b wildcard retirement (bundling TBD). [Langston AGREE]** Gate passed, cleared to ship, never bundled. **Resolution:** fold into the Phase-16 cleanup pass (dead-wildcard removal, same family as #73). Langston concurred.

**4.3 — #12e regime-gated strategies dormant. [Langston AGREE]** Deferred 2026-04-09 with no schedule. **Resolution:** fold into Phase 25 strategy calibration ("do these strategies ever earn their keep?"); close the standalone tracker. Langston concurred.

**4.4 — #111 TFS sustainability gate — Phase-19-vs-Phase-25 reconciliation. [ADDED per Langston catch — KYLE DECISION NEEDED]** v1 silently re-homed #111 from its "Phase 19 prerequisite" tag to Phase 25 (25-3) and called the tag "stale." Langston correctly flagged that #111 was a **locked 3-way Kyle/CC/Langston decision (2026-05-17)** — "table-until-Phase-19, TEC routing as candidate near-term hook, with a Phase-19 decision tree when calibration work opens" — so it must not be unilaterally reclassified. The tension is real: the issue tracker says Phase 19, but the roadmap's locked Phase-25 table lists the same item at **25-3** ("recalibrate / re-target / deprecate the sustainability gate **against paper-active data**"). Since the decision needs paper-active win/loss outcomes to make, my read is it belongs in Phase 25 — **but Kyle was party to the original Phase-19 call, so this is his to confirm.** **Recommended:** move #111 to Phase 25 (25-3); keep the Phase-19 entry as a pointer. **Kyle's call:** confirm move to calibration (Phase 25), or keep it tabled in Phase 19 per the 2026-05-17 lock?

---

## 5. RECOMMEND CLOSE — stale / superseded (no longer real open work)

These are flagged OPEN but their underlying work expired, shipped, or was superseded — they were never flipped. Recommend closing (with the cited reason) rather than carrying them into a phase. **Count: 11 — 7 clean closes (43*, 49*, 50*, 53*, 74, 78, 135-ORIG) + 4 verify-THEN-close (87, 128, 55, 81). The 4 verify-first steps are MANDATORY, not skipped (Langston). *The four window-trackers (43/49/50/53) close the OBSERVATION WINDOW only — their residual calibration analysis must land in Phase 25 (25-2 / 25-9), not evaporate.**

| # | Why close |
|---|---|
| 43 | B67.4 14-day observation window ended 2026-05-15; workstream paused → Phase 25 (25-2). The *window* is over; fold the residual into 25-2 and close the window tracker. |
| 49 | B68.2 window ended 2026-05-16 — same as #43 → fold to Phase 25, close window. |
| 50 | B68.3 window ended 2026-05-16 → fold to Phase 25 (25-9), close window. |
| 53 | B68.1 window ended ~2026-05-17 → fold to Phase 25 (25-2), close window. |
| 74 | B78 modularization 24-48h forward-watch (2026-05-07) — B78 has been stable-deployed for a month; close. |
| 78 | B79 xstock_spot scaffold forward-watch (2026-05-07) — long superseded by the live xStock arc; close. |
| 87 | B79.0a SQE wildcard DELETE +48h gate (due 2026-05-10) — gate window long passed; verify the wildcard delete held and close. |
| 128 | UNIVERSE-DISCOVERY cron self-fire one-shot watch — one-shot; verify it fired and close. |
| 55 | B69.x verification asks (2026-05-04) — verify the 4 fixes via the next replay-ablation cron, then close (or absorb any failure into Phase 19 debug). |
| 81 | Load-test policy "FIRST USE B79.0a" — first execution complete; close the tracker (policy stays documented). |
| 135-ORIG | Superseded by #135 RESOLVED (2026-05-23); close the original-surface duplicate. |

**Note (no silent caps):** closing these is a status-flip + reason, not a deletion. If Langston or Kyle wants any kept open, it stays.

---

## 6. ROADMAP REORDER (part B) — proposed edits, NOT yet applied

The roadmap presents phases in numeric order (16 → 17 → 18 → 17.5 → 19.0 → 19 → 20 → 21 → 22 → 21.4 → 21.5), which misleads because the real execution order differs. **Proposed edits (4):**

1. **Add a "★ CANONICAL EXECUTION ORDER" block at the top of "Where We Are"** stating the §0 order explicitly (between-plan items 4/4.5/5 → 19 → 25 → 16+20 → 21 → post-live 22/21.4/21.5/26/17-18), with the standing note "phase NUMBERS are not the run order." **GUARDRAIL (Langston): this block MUST be a VERBATIM mirror of `PHASE_24_TO_19_READINESS_CHECKLIST.md` §1 "CANONICAL EXECUTION ORDER AFTER PHASE 19," not a paraphrase** — a paraphrase creates a *third* divergent ordering statement and reintroduces the exact contradiction this fixes. Copy the checklist's wording literally; the readiness checklist remains the source, the roadmap block points back to it.

2. **Fix the Phase 19.0 stale label.** "Phase 19.0: VTS Partition + Exchange-Data Adapter — DEFERRED TO POST-LAUNCH (2026-05-21)" is now stale: the VTS standalone always-on sim is between-plan **item 4** (pre-19, Kyle 2026-06-08). Update the header to point at item 4 + the §5a storage-architecture design; keep the exchange-data-adapter piece as post-launch if still deferred.

3. **Add a Phase 25 anchor.** Phase 25 (calibration) has no `## Phase 25` heading — its locked 25-1…25-15 table lives inside the 2026-05-27 update prose. Add a short `## Phase 25: Calibration With Evidence` section that cross-references the locked table, so every "→ Phase 25" home resolves to a real section.

4. **State the post-live ordering of the high-numbered phases** in one line: Phase 22 (Publication) runs AFTER Phase 21 (live); Phase 26 = crypto_perp perpetual-futures onboarding (the old "Phase 25" label before reuse), post-launch no-SLA; Phase 17/18 (real ML) post-live.

**Explicitly NOT doing now:** the §19.x prose-vs-locked-table duplicate collapse — the roadmap itself flags that as a start-of-Phase-19 cleanup; leave it there.

---

## 7. NEXT STEPS
1. Langston second-pass on §2 placements + §4 escalations + §5 close-list + §6 reorder edits.
2. Surface §4 escalations to Kyle (plain language) for his 3 decisions.
3. After sign-off: apply the §6 roadmap edits, flip the §5 stale entries to RESOLVED/closed with reasons, re-tag the ▲ placements in `RUNNING_ISSUES.md`, regenerate the summary tally.
4. Update MEMORY + governance; sync gate 0; close item 3.5; advance to item 4.
