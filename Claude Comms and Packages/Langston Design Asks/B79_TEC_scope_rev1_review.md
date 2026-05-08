Reading the scope doc now.

---

**LANGSTON → CC (B79.TEC scope rev 1, Step 1+2 review):**

**Verdict: APPROVE WITH REVISIONS.** Scope is fundamentally sound and ready to advance to PIA after rev 2 applies the adjustments below. Nothing here is "back to drawing board" — these are tighten-ups, two of them load-bearing.

---

### §8 outstanding questions — architectural opinion

**Q1 — Cache TTL: keep 60s, uniform across classes.** Variable TTLs add complexity without payoff and create cross-class skew you'll debug six months from now. The point of immutable wholesale snapshots is consistency. One number. 60s.

**Q2 — Diagnostic endpoint: agree with your lean.** New `/api/diagnostics/tec-bootstrap`. The existing health surfaces are partly broken (per Risk 6 + Phase 19.x deferral). Don't build atop fragility — narrow new endpoint, leave unification to 19.x.

**Q3 — `[TEC_RESOLVE]` log volume: per-minute aggregated counter, NOT per-call.** Per-call floods PM2 — at 50 open positions × tick cadence × 48h, you'll rotate retention before the gate completes and lose the audit data. My recommendation:
- Aggregate counter dumped per minute: `[TEC_RESOLVE_AGGR] minute=… crypto_spot=explicit:N wildcard:0 default:0 xstock_spot=…`
- PLUS one immediate loud log on the FIRST `path=wildcard` hit per asset class per process lifetime (early-warning)
- This gives clean post-48h SQL/log audit AND no missed wildcard event, without log volume.

**Q4 — Wildcard removal Step 2 execution: agree with your lean.** Step 1 = automated deploy. Step 2 = deliberate operator action requiring Kyle go/no-go after 48h log audit. Codify the preconditions in the script header so the gate isn't a vibe — explicit checks: 48h elapsed since `<step1_deploy_timestamp>`, zero `path=wildcard` events for crypto_spot AND xstock_spot, signature-guarded SELECT confirms 1 row.

**Q5 — Health endpoint integration: defer to PIA, but constrained.** Don't extend `system-health-monitor` (its `startPeriodicChecks` path is the broken one Phase 19.x will revisit). Don't extend `SystemHealthMonitor` either. Acceptable surfaces: dedicated `/api/diagnostics/tec-bootstrap` AND/OR a minimal hook into the lightweight health summary endpoint if PIA confirms one exists and is non-fragile. PIA must name the file + line + confirm health surface isn't on the Phase 19.x rip-list before extending.

**Q6 — Test baseline: re-capture at PIA time.** 59/995/5/1059 was B79 ship. Drift since is possible. Run the suite once at PIA, capture fresh numbers, treat THAT as the comparison line. Objective wording: post-B79.TEC = baseline + N new tests, all new pass, zero existing regressions.

---

### §1 objectives — adjustments needed

**Objective 3 — DROP the `?? 'crypto_spot'` fallback.** The line `update.assetClass ?? 'crypto_spot'` reproduces the *exact* silent-fallback pattern that caused the original bug. The fix is type-level: change `assetClass?: AssetClass` → `assetClass: AssetClass` (non-optional) on the Update interface. TypeScript then catches every call site that doesn't pass it. If you genuinely cannot make it non-optional in this batch (e.g. some legacy caller can't supply it yet), HARD-FAIL with a `[TEC_UPDATE_MISSING_ASSET_CLASS]` log + throw, do NOT default. CLAUDE.md §11 (no silent fallbacks).

**Objective 8 — clarify cache-miss semantics vs HARD-FAIL doctrine.** If primeTECConfig HARD-FAILs at boot for any registered asset class, the cache cannot be missing an entry for a registered class at runtime. So `[TEC_CACHE_MISS]` should mean "asset class not in `ASSET_CLASSES` registered set" — i.e. a programming error, not a degraded fallback. My read: throw on miss, don't return `TEC_DEFAULTS`. Returning defaults silently is the same anti-pattern Objective 3 is fighting. If you want a documented "if the impossible happens, fail loud," fine — but the action is throw + emit `[TEC_CACHE_MISS_FATAL]`, NOT return defaults.

**Add Objective 15 — ASSET_CLASSES SSOT.** primeTECConfig must iterate from a single source-of-truth enum/constant (e.g. `ASSET_CLASSES` exported from one file), not a locally-hardcoded list. Reason: when B79.0a wires xstock live and future classes get added, the primer must pick them up automatically or the next class's first deploy reproduces this exact bug. Verification: grep `ASSET_CLASSES` shows exactly one definition + primeTECConfig consumes it.

**Add Objective 16 — TS Check CI gate green.** Implicit but worth being explicit given the signature change to `resolveTECConfig` will ripple through call sites. Standalone objective so Step 5 push has explicit pass criterion.

---

### §4 risks — adjustments + additions

**Risk 2 mitigation — name the alert wiring.** "Monitoring + alert plan for boot failures (Telegram or ops surface)" is too soft. Specify: PM2 boot failure on Hetzner emits `[TEC_BOOTSTRAP_FAIL]`; alert path is X (Telegram bot? log-watch script? Kyle ping?). If wiring isn't in place, say so explicitly + accept the risk explicitly + add the wiring as a Phase 19.x or follow-up batch line item. Don't paper over with vague "alert plan."

**Add Risk 8 — `update.assetClass` not set at every call site that builds an Update.** Mitigation: PIA grep for every place an Update object is constructed (vts-runner, paper-execution-engine, signal-orchestrator, anywhere downstream); confirm each passes assetClass. If type is made non-optional per Objective 3, TS compile catches this — but the audit + fix work needs to be planned BEFORE PIA submission, not surfaced during implementation.

**Add Risk 9 — Migration 1 `ON CONFLICT DO UPDATE` clobbers manual experimental values.** If someone has set `crypto_spot break_even_enabled = true` for a strategy experiment between scope-doc-time and migration-deploy-time, ON CONFLICT DO UPDATE silently overwrites it. **Mitigation: change to `ON CONFLICT DO NOTHING` + post-INSERT assertion that 2 rows now exist with `value = false`.** If conflict occurs, the migration logs the conflicting row and either passes (acceptable: row already correct) or fails (intentional override exists — operator decides). Loud, not silent. Net effect: §3 Migration 1 needs a small rewrite.

**Add Risk 10 — deploy ordering: migration must run BEFORE code rollout.** If TEC_DEFAULTS is `false` and primeTECConfig HARD-FAILs on missing rows, deploying code before migration = app refuses to start. Mitigation: Step 6 deploy sequence explicitly applies migration first, verifies psql shows both rows present, THEN PM2 restart on new code. Add this to §6 Step 7 first-pass criteria.

---

### §5 PIA acceptance — does it cover Q4? Mostly yes, two additions

Items 1-7 cover what I asked for. Two adds:

**PIA #8 — `resolveTECConfig` call-site audit.** `grep -rn "resolveTECConfig" server/ --include="*.ts"` — every hit must pass exactly one arg (assetClass), no leftovers passing strategy/regime, no calls without an explicit assetClass.

**PIA #9 — Update construction site audit.** Every place an Update / state object is built and passed to TEC must set assetClass. Grep all call sites that construct or mutate Update; confirm assetClass set explicitly. This is the corollary to Objective 3's type tightening.

PIA #7's check on `paper-execution-engine.ts:972` is good and load-bearing — I want explicit confirmation in PIA that close-reason mapping consumes `update.exitReason` produced by tec-evaluator and does NOT independently re-resolve `break_even_enabled` (which would be a hidden second call site that the per-class refactor wouldn't catch).

---

### Other adjustments

**§2 file table — resolve "or whichever health surface is most-canonical post-survey" before implementation.** Ambiguous file targets in scope = drift risk. PIA Q5 answer locks the file; rev 2 of the scope doc lists the specific path.

**§3 Migration 1 — rewrite to ON CONFLICT DO NOTHING + post-INSERT row count assertion.** Per Risk 9 above.

**§3 wildcard removal script — clarify the rollback comment.** The `<captured exchange>`/`<captured strategy>`/`<captured regime>` placeholders aren't auto-substituted; add a one-line comment "operator: paste captured values from step 1's SELECT into the rollback INSERT below." Cosmetic but it'll save someone five minutes when they're stressed.

**§7 sequencing — name the operator trigger for B79.TEC.b.** "48h+ after B79.TEC ship" is correct but who tracks the 48h? Recommendation: at B79.TEC Step 11 close, CC creates a draft `BATCH_79_TEC_b_VERIFY_CHECKLIST.md` in Scope Files containing the 48h gate criteria + audit SQL + rollback path. That file becomes the trigger artifact when 48h elapses — Kyle or CC opens it, runs the audit, gives go/no-go. Without an artifact, the gate gets dropped.

---

### Net

Rev 2 needs to land:
- Objective 3 — drop fallback, type non-optional
- Objective 8 — clarify cache-miss semantics (throw, don't default)
- Objective 15 + 16 — SSOT for ASSET_CLASSES, TS Check explicit
- Risks 8-10 — assetClass plumb, ON CONFLICT, deploy ordering
- §3 Migration 1 — ON CONFLICT DO NOTHING + assertion
- §5 PIA — items 8 + 9 added
- §8 Q1-Q6 — answers above folded back into scope as locked decisions
- §2 file table — health surface ambiguity resolved (post-PIA Q5)

After rev 2, proceed to PIA. PIA must include the line-citation work per §5 (1-7 + new 8-9), arrives at `BATCH_79_TEC_PRE_AUDIT.md`, file-first protocol per §6.5.0.

Sequencing call-out: rev 2 of the scope doc and the PIA can land in sequence (scope rev 2 first, my approve, then PIA) OR you can fold the rev 2 deltas into the PIA cover and we close both in one review pass. Your call — both are fine; the second is faster if you'd rather not bounce twice.

Standing by.
