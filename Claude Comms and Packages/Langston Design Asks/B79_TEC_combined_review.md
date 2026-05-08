Read both files. Combined review:

---

## APPROVE — scope rev 2 + PIA rev 1 (with the clarifications below; not blocking Step 3)

**Verification: all 13 rev 1 review deltas applied.** Spot-checked each in PIA §0 cover against scope content:
- Q1-Q6 locked at scope §8 ✓
- Obj 3 non-optional `assetClass: AssetClass` + no fallback ✓
- Obj 8 cache-miss THROWS with `[TEC_CACHE_MISS_FATAL]` ✓
- Obj 15 `ASSET_CLASSES` SSOT ✓
- Obj 16 TS Check CI gate ✓
- Risk 8/9/10/11 ✓ (Risk 11 explicitly accepts boot-failure alert wiring as out of scope — fine, but log a `B79.TEC.c` follow-up so it doesn't drift)
- Migration 1 rewritten to `ON CONFLICT DO NOTHING` + post-INSERT assertion ✓ (the assertion correctly fails loud if a pre-existing row has a different value)
- §3 deploy ordering migration-before-code documented ✓
- PIA §5 #7-9 added ✓
- §7 `BATCH_79_TEC_b_VERIFY_CHECKLIST.md` artifact ✓

**PIA §1 line-citation work is thorough.** Six-hit grep on `breakEvenEnabled` showing exactly one read site (line 503) is exactly the kind of evidence I asked for. `paper-execution-engine.ts:972` confirmation that it consumes `decision.exitReason` only — no hidden second config read — is the most important verification in this PIA. State-vs-config separation holds.

**`primeTECConfig` is never called today** (PIA §1.4) — confirms the cold-start cache race diagnosis. The bootstrap order fix is mechanically straightforward.

---

## Q1-Q5 answers

**Q1 — `resolveTECConfig` async → sync: YES, sync.**

Cache pre-warmed at boot, runtime is pure `Map.get()`. Removes `await` from every caller.

One implementation clarification needed: **what happens on TTL refresh failure?** Spec it as: "TTL refresh runs on a per-class background timer; refresh failures log loudly (`[TEC_REFRESH_FAIL] assetClass=X reason=…`) but do NOT evict the existing entry. Cache entries are never evicted on TTL expiry — only OVERWRITTEN by successful refresh. Cache miss therefore can only occur for an unregistered asset class (programming error → throws per Objective 8)." Add this line to scope §8 Q1 row so the doctrine is durable: stale-but-known beats spurious-throw during transient DB blips.

**Q2 — Health endpoint placement: APPROVE.** New `/api/diagnostics/tec-bootstrap` near `/api/diagnostics/central-clock` (routes.ts:7003). Don't extend the broken `SystemHealthMonitor` surfaces — matches my Q5 lock.

**Q3 — `AssetClass` import from `shared/asset-classes.ts`: APPROVE.** Single SSOT path. While you're there, PIA should confirm what's currently in the enum — see "open items" below.

**Q4 — primeTECConfig failure granularity: APPROVE aggregate-error.** Try ALL classes, accumulate per-class failures, then exit with one structured report. One clear log beats "fix one row, restart, fail on next, fix it, restart" loops. Format suggestion:

```
[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for the following classes:
  - crypto_spot: missing row (trailing_exit, *, crypto_spot, *, *, break_even_enabled)
  - xstock_spot: missing row (trailing_exit, *, xstock_spot, *, *, break_even_enabled)
Aborting boot.
```

**Q5 — Retry policy: APPROVE WITH REFINEMENTS.**

Three changes to CC's lean:

1. **Distinguish retryable vs non-retryable errors.** Retry only on transient connectivity (ECONNREFUSED, timeout, postgres "the database system is starting up"). Logical errors (row missing, malformed JSON in `value` column) → no retry, hard-fail immediately. Retrying a "row missing" error is just delaying the inevitable and adds 7-14s to every PM2 restart for no benefit.
2. **Stretch the backoff to 2s/4s/8s = 14s total.** 7s is tight for postgres cold-restart scenarios on Supabase. 14s gives more headroom and is still bounded.
3. **Distinguish log lines.** `[TEC_PRIME_RETRY] attempt=N/3 reason=connection-error` vs `[TEC_BOOTSTRAP_FAIL] reason=missing-rows` — operator can immediately tell whether to wait-and-retry-restart or go fix data.

---

## Clarifications to fold (non-blocking — apply during Step 3)

**1. "Required keys" in Objective 5.** "If primeTECConfig cannot resolve `break_even_enabled` (or any required key)" — define the set explicitly. My recommendation: HARD-FAIL set = `{break_even_enabled}` for now (the one knob this batch is fixing per-class). Other knobs use TEC_DEFAULTS as their final backstop in the resolution chain (per-class → wildcard → TEC_DEFAULTS) until evidence drives per-class promotion per §0 boundary statement. When a future batch promotes a knob to per-class, that knob joins the HARD-FAIL set. State this in scope §1 #5 + PIA §1.4 so implementation isn't reading my mind.

**2. Step 7 (flip TEC_DEFAULTS) ordering.** PIA §7 lists "flip TEC_DEFAULTS to false" as step 7, AFTER `primeTECConfig` is wired (step 6). Good — that's the right order. But to eliminate any transitional risk between local commits, do steps 6+7 in a single commit: `primeTECConfig` wire-in + `TEC_DEFAULTS.breakEvenEnabled = false` together. Otherwise an intermediate state could ship with default-false-but-no-prime, which would silently disable BE. Note in scope §9 / PIA §7.

**3. Scope §2 stale row.** "server/services/health-monitor.ts (or whichever health surface…)" — Q2 already locked the answer (`/api/diagnostics/tec-bootstrap` in `routes.ts:7003`). Either drop that row from §2 Files modified, or replace it with `server/routes.ts | new endpoint /api/diagnostics/tec-bootstrap near central-clock (line ~7003)`.

**4. Adjacent moonbag-config note (PIA §1.5).** Worth being explicit: after the refactor, `cfg.moonbagQualifyingStrategies` and `cfg.moonbagQualifyingSourcePools` ARE per-class-resolved (because the WHOLE snapshot is per-class), so the MECHANICS are correct on Day 1. The "adjacent risk" is purely about whether the DATA should diverge between crypto_spot and xstock_spot — that's a B79.4 evidence question. Add this distinction to RUNNING_ISSUES so future-CC doesn't re-derive.

---

## Open items to close before Step 3 begins

**A. `ASSET_CLASSES` enum contents at HEAD.** PIA doesn't list them. If the enum contains anything beyond `[crypto_spot, xstock_spot]` today, primeTECConfig will HARD-FAIL on those classes on first boot because Migration 1 doesn't seed them. Two paths:
- (i) Confirm enum is exactly `[crypto_spot, xstock_spot]` and move on.
- (ii) If there are more (e.g., `crypto_perp`, `futures`, anything legacy/dormant), either extend Migration 1 to seed `break_even_enabled = false` for each, OR filter `ASSET_CLASSES` to a "registered/active" subset for primeTECConfig iteration.

Quick `cat shared/asset-classes.ts` should resolve in 10s. Please post the enum contents in your reply before kicking off Step 3.

**B. Test baseline re-capture (PIA §4).** Hasn't been run yet. Run `npm test` on staging now, post the actual numbers (passed / failed / skipped / total). That becomes the comparison line for Objective 16 / Risk 7. Don't ship Step 3 against a stale 2026-05-07 baseline.

**C. SSH IP inconsistency in PIA.** §3 hostile sim uses `root@188.245.193.8`; §4 test baseline uses `root@204.168.141.77`. If those are intentionally different hosts (staging vs build runner), confirm. If one is a typo, fix. Not blocking but worth a one-liner before Step 3.

---

## Bottom line

Architecture is sound. Migration 1 is now safe. Deploy ordering is documented. Line-citations are thorough. State-vs-config separation at `paper-execution-engine.ts:972` is verified the right way (read the case, not just trust the diff).

**APPROVE — proceed to Step 3 once items A/B/C above are answered in your reply.** No need for a rev 3 scope document; fold clarifications #1-4 into implementation commits with a short note in the completion report.

Q1-Q5 calls are above. Q5 is the only one with substantive refinement (retryable-vs-logical distinction + 2s/4s/8s + distinct log prefixes).
