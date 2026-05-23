# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix; §6 Langston comms; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Summaries TO KYLE go in THIS session (not Telegram-only); Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-23 — B-NEW-43 Phase 1 CLOSED, governance landed; Phase 2 NEXT)

### B-NEW-43 Phase 1 — CLOSED 2026-05-23 (Langston Phase-1-close ACK relayed to Telegram). Phase 2 next.

**Result:** 696 → 488 tsc errors across migration branch (−208 / 30%). Baseline frozen at 488 / 68 files in `.tsc-baseline.json`. CI typecheck baseline-comparison gate operational + green since chunk 5 (`continue-on-error: true` removal landed in same chunk). 18 chunks shipped, per-chunk Langston Step-4 ACK throughout; zero escalations to Kyle for arbitration after his autonomous-run grant.

**Anti-graveyard discipline upheld across all 18 chunks:** zero new `as any`, zero `@ts-expect-error`, zero `@ts-ignore`, zero new non-null `!`. One sanctioned `as unknown as` (chunk-4 `req.mode` x-app-mode boundary cast — same Langston-approved pattern as chunk-7 JSON-boundary).

**Behavior-capable surfacings landed:** (1) chunk 1 paper-portfolio-manager (7 sites) + paper-48hr-simulation (3 sites) userId-as-mode latent bug FIX → pre-fix historical metrics from those 2 surfaces are SUSPECT (`BUG-2026-05-23-A` in CHANGES_AND_FIXES, per Langston Phase-1-close note 2). (2) chunk 2 dead AI-Opportunities routes deleted (5 handlers) + orphaned frontend flagged in #136(c). (3) Chunks 13-14 four routes.ts diagnostic re-activations (low-risk, none trading).

**Mechanical sweep drained at the right line — Langston spot-check at Phase 1 close found zero misclassifications:** 20 TS2353 remain, all classified Phase 19 or Phase 16 in baseline `files[]`. diagnostic-controller `commandId` confirmed not dead code; `actuation-policy.ts:263 currentValue→oldValue` is latent persistence bug — both correctly belong to Phase 19's structured walkthrough not mid-Phase-1 picking.

**Phase 1 close commit landing in next push** — completion report `B_NEW_43_PHASE_1_COMPLETION_REPORT.md` + governance updates (POST_AUDIT_ROADMAP 19-before-16 swap landed; RUNNING_ISSUES #137 augmented with schema-drift-fingerprint sites per Langston note 1 + #136(h) bobInspector stub; CHANGES_AND_FIXES `BUG-2026-05-23-A` + `BUG-2026-05-23-B`; SIM "B-NEW-43 Phase 1 — CI typecheck baseline-comparison gate" addition). BATCH_CATALOG + PHASE_HISTORY deferred to full B-NEW-43 close (Phase 2/3/4 still ahead).

### Chunks 3-18 in summary (all Langston-ACK'd + pushed)

- Chunks 3-7: TS2304 settings + signal-orchestrator family-map + OpenAI legacy + TS2339 `req.user` (chunk 4 REDONE via `req.mode` after Kyle per-user-mode drift alarm). 646 → 621.
- Chunks 7-13: Mixed TS2554/TS2769/TS18046/TS2339 mechanical clearance + 4 routes.ts diagnostic re-activations. 621 → 519.
- Chunk 14: TS2554 signature-mismatch cluster. 519 → 513.
- Chunk 15: Phase 41F-L userId-purge stragglers, server-services subset (5 files / 7 sites). Initial broad-script attempt caused silent-tsc-crash (513→2); reverted, per-site Edit. 513 → 506.
- Chunk 16: routes.ts multi-line userId 5-of-6; routes.ts:14151 HELD per cascade bisect-and-hold (broken simulator). 506 → 501.
- Chunk 17: routes.ts 8 single-line userId TS2353. 501 → 493.
- Chunk 18: cle-orchestrator + market-scan-task 5 single-line userId; 2 files dropped from baseline. 493 → 488.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `616dfcf3` — **B79.0n.MCE 24h post-deploy soak — fires 2026-05-23T12:10Z (~2h from now).** Grep error.log for B79.0n.MCE fail-hard throws; confirm CACHE_REFRESH still firing; crypto regression vs baseline.

---

## NEXT IMMEDIATE STEPS (2026-05-23)

1. **Commit + push Phase 1 governance updates** (this session, from GDrive clone): `B_NEW_43_PHASE_1_COMPLETION_REPORT.md` + POST_AUDIT_ROADMAP + RUNNING_ISSUES (#136 + #137) + CHANGES_AND_FIXES + SIM. Single governance commit; push to migration/aws-supabase.
2. **Phase 2 NEXT** — test failures (~98 across 20 files):
   - `npm run db:migrate` (NOT `db:push` — broken on this schema per scope §13 Step-2 consensus) to seed `module_constants` rows that the ~54 module-not-warm tests need.
   - CI Postgres added at job-level per scope §3.
   - b-new-42b xstock-universe harness fix — `_replaceXstockUniverse()` in `beforeEach` so price-discontinuity-detector + ~4 b79-0f failures get the universe seed they need.
   - Assertion-tail fixes: ≈31 assertion + ≈9 DB-conn + 5 stale-knob-mock + 1 vi.mock-hoist.
3. **Phase 3** — lock CI (per-batch CI-status confirmation rule).
4. **Phase 4** — system-alerts active-push notification (RUNNING_ISSUES #135). Sole runtime change in B-NEW-43; runs strictly LAST; own pre-audit addendum + Step 4 + staging deploy + Step 7/8 verify. Per scope §5 escape clause: if Phases 0-3 close green but Phase 4 snags, B-NEW-43 closes on the CI work + Phase 4 splits to a follow-up.
5. **616dfcf3 alert** — fires 2026-05-23T12:10Z. Background monitor.

**Mirror workflow:** code on `C:/dev/DawnTraderV3` (commits use inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com`); before each push `git checkout -- package-lock.json` (npm-install dirties it) then `git pull --rebase`; push; GDrive clone is governance-docs + `git pull`-only for code per CLAUDE.md §7.1 ONE-DIRECTION-EDIT discipline.

### Recent commits (origin HEAD `ccf58e6`)
- `ccf58e6` — B-NEW-43 Phase 1 chunk 18 (5 single-line userId TS2353 — cle-orchestrator + market-scan-task; 493→488; 2 files dropped)
- `344b680` — B-NEW-43 Phase 1 chunk 17 (8 routes.ts single-line userId TS2353; 501→493)
- `b4585ca` — B-NEW-43 Phase 1 chunk 16 (routes.ts userId 5-of-6 + cascade-bisection; 506→501; 14151 HELD)
- `b24c213` — B-NEW-43 Phase 1 chunk 15 (Phase 41F-L userId-purge stragglers server-services; 513→506)
- `bf78c46` — B-NEW-43 Phase 1 chunk 2 (deleted 5 dead AI-Opps routes + 3 missing imports)
- `387b2d3` — B-NEW-43 Phase 1 chunk 1 (TS2304 TradingMode cluster + userId-bug fix)
- `7c7ca70e3` — B79.0n.MCE Step 10-11 governance close

### Parked items
- Roadmap sequencing changes (2026-05-21) in POST_AUDIT_ROADMAP — regime confidence-chain calibration → Phase 19; crypto_perp/Phase 25 → post-launch; VTS partition → post-launch; daily loss-budget → optional Phase 19.
- **NEW 2026-05-23:** Phase 19 runs BEFORE Phase 16 (joint CC + Langston advisory; Kyle approved at Phase 1 close).
- ML design preliminary research brief: `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` (untracked draft).
- Ops pending: xstock_spot BE-stop flip true→false.

### Phase 19 intake / Phase 16 register pointers
- Phase 19 intake list: RUNNING_ISSUES #137 (closing paragraphs enumerate schema-drift sites flagged at Phase 1 close per Langston note 1, plus active-shape-drift sites). Source of truth = baseline `files[]` with `phase_tag.startsWith("Phase 19")`.
- Phase 16 legacy register: RUNNING_ISSUES #136 entries (a)-(h). #136(h) added at Phase 1 close = diagnostic-controller bobInspector stub.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-17 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md` (Phase 1 close report — this session)
4. `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` (rev3) + pre-audit (incl. §13 Step-2 consensus + §13.3 b-new-42b verify) — Phase 2 starts from here
5. `.tsc-baseline.json` (frozen baseline — 488 errors / 68 files; per-file `phase_tag` + `context` from chunk-6 audit)
