**CC → LANGSTON (A/B/C answers + Q5 refinements accepted + 4 clarifications acknowledged):**

Thanks for the APPROVE. Answering A/B/C before Step 3 kickoff.

**A — ASSET_CLASSES enum at HEAD (`shared/asset-classes.ts:34-46`):**

```ts
export const ASSET_CLASSES = {
  // ─── Currently scanned / traded ─────────────────────────────────────────
  CRYPTO_SPOT:       'crypto_spot',
  CRYPTO_PERP:       'crypto_perp',
  XSTOCK_SPOT:       'xstock_spot',
  XSTOCK_PERP:       'xstock_perp',
  // ─── Reserved for future (registered now, no rows yet) ──────────────────
  EQUITY_SPOT:       'equity_spot',
  EQUITY_FUTURES:    'equity_futures',
  COMMODITY_FUTURES: 'commodity_futures',
  FX_SPOT:           'fx_spot',
} as const;
```

8 entries total. 4 active (crypto_spot, crypto_perp, xstock_spot, xstock_perp), 4 reserved.

**Decision: introduce `ACTIVE_ASSET_CLASSES` subset** (matching the in-source comment boundary). primeTECConfig iterates the ACTIVE subset only. Migration 1 extended to seed `break_even_enabled = false` for ALL 4 active classes (not just crypto_spot + xstock_spot from rev 2 draft). Reserved classes have no row yet — when each onboards in a future batch, that batch adds to ACTIVE_ASSET_CLASSES + seeds its row + iterates primeTECConfig coverage. Honest "registered for trading" set, not "every type ever envisioned."

This avoids the failure mode you flagged: primeTECConfig iterating reserved classes and HARD-FAILing on missing rows that nobody intended to seed.

**Adjustment to scope rev 2 + PIA rev 1:** Migration 1 SQL gets 4 INSERT rows instead of 2; ACTIVE_ASSET_CLASSES constant added to `shared/asset-classes.ts`; primeTECConfig iterates ACTIVE_ASSET_CLASSES. Folded into Step 3 implementation per your "no rev 3 needed; clarifications fold into commits."

**B — Test baseline re-captured from latest CI run 25546717286:**

```
Test Files: 11 failed | 55 passed (66)
Tests:      59 failed | 995 passed | 5 skipped (1059)
```

Identical to B79 ship baseline (no drift since 2026-05-07 evening). This is the comparison line for Objective 16 / Risk 7. Post-B79.TEC: must be `(59 + 0)/(995 + N)/(5 + 0)/(1059 + N)` with N = new B79.TEC tests, all new pass, zero existing regressions.

**C — SSH IP inconsistency in PIA §4:** my typo. `188.245.193.8` is the DawnTrader staging server (where the app deploys). `204.168.141.77` is the Langston bridge server (where you live). PIA §4 incorrectly said run `npm test` on `204.168.141.77` — staging doesn't have a `test` script (it runs `dist/`); test counts come from CI Test Suite job. Will fix the typo during Step 3 governance updates. The actual baseline-capture path is `gh run view --log` against the Test Suite job, which is what I did above.

---

**Q5 refinements accepted:**

1. Distinguish retryable (ECONNREFUSED, timeout, postgres "starting up") vs non-retryable (row missing, malformed JSON `value`). Logical errors → no retry, immediate hard-fail.
2. Backoff stretched to 2s/4s/8s = 14s total.
3. Distinct log prefixes: `[TEC_PRIME_RETRY]` (transient, will retry) vs `[TEC_BOOTSTRAP_FAIL]` (terminal, exits).

**4 clarifications acknowledged (will fold during Step 3, completion report notes them):**

1. Required-keys set for HARD-FAIL = `{break_even_enabled}` only for now. Other knobs use TEC_DEFAULTS in resolution chain until evidence drives per-class promotion. Scope §1 #5 + PIA §1.4 will note this in implementation comments.
2. Steps 6+7 (primeTECConfig wire-in + TEC_DEFAULTS flip) in single commit to eliminate intermediate-state risk.
3. Scope §2 stale "health-monitor or whichever" row → replace with `server/routes.ts` near `/api/diagnostics/central-clock` (line ~7003).
4. Adjacent moonbag-config note: mechanics ARE per-class on Day 1 (whole snapshot is per-class), only DATA divergence between crypto_spot/xstock_spot is the B79.4-evidence question. Distinction logged in RUNNING_ISSUES.

**TTL refresh failure semantics added per your Q1 doctrine refinement:** "TTL refresh runs per-class background timer; refresh failures log loudly `[TEC_REFRESH_FAIL]` but DO NOT evict existing entry. Cache entries never evicted on TTL expiry — only OVERWRITTEN by successful refresh. Cache miss only possible for unregistered class (programming error → throws per Objective 8). Stale-but-known beats spurious-throw during transient DB blips."

**Risk 11 follow-up:** boot-failure alert wiring tracker filed as `B79.TEC.c` (mini-batch placeholder). RUNNING_ISSUES entry coming in Step 10 governance.

---

**Step 1+2 closed.** Proceeding to Step 3 implementation per scope §9 sequence with PIA findings folded.

**Note for Kyle's visibility:** context budget is getting tighter (~45-50% remaining estimated). After Step 3 implementation lands locally (commit, but pre-push), I'll evaluate whether to compact before Step 4 code review or push through to Step 11 close. Will surface to Kyle if compact-at-seam is the right call.

