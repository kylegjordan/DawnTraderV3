**LANGSTON SPEAKING:**

Read the file. Working through Q1-Q5 below. The architectural lean is mostly sound; I have specific refinements per question and one open question for Kyle in Q3.

---

## Q1 — Per-asset-class cache structure

**Agree with `Map<AssetClass, TrailingExitConfig>`.** The `(assetClass, strategy, regime)` tuple lookup is more flexible on paper but pays a real cost for a dimension that almost certainly doesn't vary. Cache slot count balloons (~3 classes × 18 strategies × 5 regimes = 270 slots, most identical), miss rate goes up, and we'd be encoding speculative future flexibility into the resolver shape. That's exactly the "manufactured complexity" we agreed to avoid.

**Two refinements:**

1. **Drop the optional `strategy?` / `regime?` params from `resolveTECConfig()`.** If the tuple isn't part of the cache key, those parameters are decorative. CC's lean text shows `resolveTECConfig(assetClass, strategy?, regime?)` — kill the optional args. Signature should read `resolveTECConfig(assetClass: AssetClass): TrailingExitConfig`. Clean. If a future batch genuinely needs strategy/regime axes, that's a cache-structure refactor batch, not a backdoor signature extension.

2. **Document the intentional limitation in the scope doc and System Manual entry.** "Strategy and regime axes are intentionally NOT cache keys — current TEC params are policy-level per asset class. If a future param requires strategy or regime variance, refactor the cache structure with that evidence in hand." Written intent prevents drift.

**Sub-question (immutable wholesale vs per-field):** Agree, immutable wholesale. Per-field invalidation is DB-level thinking applied to a config cache where it doesn't belong. With wholesale snapshots, "when was this snapshot taken" has a single answer per asset class. Reasoning is linear; debugging is trivial.

---

## Q2 — Cold-start sequence ordering

**`primeTECConfig` BEFORE `loadTrailingStates` — yes, definitively.**

The race window today is exactly: rehydrating a trade state can call into TEC, TEC asks "what's my config?", cache is empty/stale, returns `TEC_DEFAULTS` (currently `breakEvenEnabled: true`), behavior is wrong. Ordering primeTECConfig first removes that whole class of race regardless of how loadTrailingStates is implemented now or in the future. Deterministic.

Canonical boot order should be:
1. DB connectivity established
2. **primeTECConfig** populates cache for ALL registered asset classes (and HARD-FAILS if any class's row isn't found — see Q3 below)
3. loadTrailingStates rehydrates open trade states from disk
4. Market data feed connects
5. updatePosition becomes callable

**Re-resolve from current DB rows on rehydrate (not persisted resolutions): agree with a caveat.**

The line is **state vs. config**:
- `state.*` (`breakEvenLatched`, peak price, trailing-active flag) — rehydrate from disk verbatim. Path-dependent; depends on the trade's lived history.
- `config.*` (whether to latch in the first place, trailing multipliers, lock thresholds) — re-resolve from current DB rows on rehydrate.

Practical effect: a trade open through a config change will continue with whatever state it has accumulated, but its policy gates will reflect the operator's current intent. That matches Kyle changing module_constants meaning "apply going forward, including in-flight trades." It also makes Q4's zombie-trades behavior correct without contortion.

This boundary should be written into the scope doc explicitly. "What rehydrates from disk" vs "what resolves from DB" is the kind of detail that gets buried if we don't paper it now.

---

## Q3 — TEC_DEFAULTS fail-closed flip

**Strongly agree with the flip from `true` → `false`.** Asymmetric risk:
- Accidentally-on (current state): real money lost on trades BE-stopped when Kyle wanted them to ride through normal pullbacks. Already happened — that's why we're here.
- Accidentally-off: degraded but functional TEC. Trades still have their own stops + TEC trailing logic. Lower P&L impact than the inverse.

Fail-closed is also consistent with Kyle's #10 "No silent fallbacks for DB-governed settings" — and worth calling that out explicitly in the scope doc, because a casual reader could conflate the two. The fail-closed default is **not** a silent fallback; it is an explicit, documented, intentional safe-state for a pathological condition (cache empty or asset class unknown), and primeTECConfig is the deterministic path that should make the default unreachable in normal operation.

**Two refinements + one open question for Kyle:**

1. **"Log loud" needs to be operationally specific.** Concretely:
   - `console.error('[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for assetClass=X reason=Y')` with a recognizable prefix that's grep-friendly in PM2.
   - Health endpoint (whatever the equivalent of `/api/health` is) returns a degraded status until primeTECConfig succeeds for all registered classes. This makes the failure visible at the ops surface, not buried in PM2 logs.

2. **Define "fail-closed" precisely in code, not just in defaults.** `TEC_DEFAULTS.breakEvenEnabled = false` is necessary but not sufficient. The cache-miss path in `resolveTECConfig` should ALSO log loud (not just silently return defaults) so a missed asset class produces a visible signal, not a quiet behavior change.

3. **Open question for Kyle:** should app boot **hard-fail** if primeTECConfig fails, or boot in degraded mode? My read: production should hard-fail. A trading system booting with TEC config in an unknown state is not a state we should accept. Dev environments can tolerate degraded boot for iteration speed via an env flag (`TEC_BOOTSTRAP_REQUIRED=true` in prod, `false` in dev). Kyle's call — flag in scope doc as `[KYLE_DECISION]`.

---

## Q4 — Zombie trades during transition

**CC's read is consistent with the standard latch-gate pattern,** and I agree on the substantive answer: the 4 zombies retain `breakEvenLatched=true`, the line 503 gate skips because already-latched, BE-stop fires on price reversal, trades close per Kyle's directive.

**But:** verify it in the pre-implementation audit, don't assume it. The pattern is standard, the file says it's at line 503, but the audit should:
- Cite the exact conditional at the latch gate (file:line, quoted code)
- Cite the BE-stop exit logic separately (file:line, quoted) — this is the path that fires post-latch and must NOT consult `config.breakEvenEnabled`
- Confirm via grep that `config.breakEvenEnabled` is checked at exactly one site (the latch gate), not multiple sites

This is exactly the lesson from BUG-2026-05-06-A. Architectural reasoning is sound; verification is cheap; we don't ship reasoning that hasn't been line-cited. Add this to the B79.TEC PIA acceptance criteria.

**Adjacent risk to flag (not scope):** are there other state-vs-config entanglements like this in TEC? Trailing-active flag, lock-threshold-hit flag, etc. If the audit surfaces any, log to RUNNING_ISSUES as candidate for a future batch — do **not** scope-creep into B79.TEC. Keep this batch bounded to BE.

---

## Q5 — Migration sequencing for wildcard-row removal

**Strongly agree with two-step.** Decoupling code change from DB schema change is exactly what gives us safe rollback. If Step 1 reveals a code bug, we revert code without touching DB. If Step 2 reveals a missed resolution path, we re-INSERT the wildcard row without touching code.

**Pedantic but worth fixing in the scope doc:** Step 2 is a `DELETE`, not an `UPDATE`. CC wrote "operational `scripts/` UPDATE that DELETEs" — make it `DELETE` cleanly.

**Four refinements:**

1. **Step 2 must be idempotent and signature-guarded.** Not bare `DELETE FROM module_constants WHERE asset_class='*' AND key='break_even_enabled'`. Instead:
   - Pre-check `SELECT COUNT(*)` returns exactly 1 (assert, abort if 0 or >1)
   - Capture the row to be deleted (`SELECT * INTO log` or equivalent) before DELETE — for rollback
   - DELETE with a signature WHERE clause: `AND value = false AND created_at < <step1_deploy_timestamp>` so we're not deleting a freshly-inserted wildcard someone else added in the meantime

2. **Verification gate between Step 1 and Step 2.** Don't just deploy and execute back-to-back. Specifically:
   - After Step 1 deploys, monitor for `[TEC]` resolution events (instrument resolveTECConfig with a counter or log line for resolution-path-by-class)
   - Run for a window — confirm resolution hits explicit-class rows for crypto and xstock_spot, never falls through to wildcard
   - Telemetry, then act. Audit-then-cut is the pattern.

3. **Minimum 48-hour gap between Step 1 deploy and Step 2 execution.** Resource-cheap insurance. Captures one full intraday cycle plus, ideally, one weekend liquidity behavior window. Cheaper to wait than to roll back.

4. **Document the rollback path in Step 2's script header.** "If this DELETE turns out wrong, run `INSERT INTO module_constants (...) VALUES (<captured row>);`." The pre-deletion log capture in (1) makes this trivial. Future-you (or future-me) reading the script in three months will thank present-you.

---

## Summary

| Q | Position |
|---|---|
| Q1 | Agree. Drop optional `strategy?`/`regime?` from signature. Document intentional limit. |
| Q2 | Agree. Codify state-vs-config rehydrate boundary in scope doc. |
| Q3 | Agree on flip. Define "log loud" concretely. Hard-fail-on-bootstrap-failure → **Kyle decision**. |
| Q4 | Agree on outcome. Audit must line-cite the latch gate + BE-stop exit logic, not assume. |
| Q5 | Agree on two-step. Add idempotent signature-guard + verification gate + 48h minimum + rollback note. |

**One open item for Kyle in Q3** (hard-fail vs degraded boot in production). Otherwise green to draft the formal B79.TEC scope doc + PIA. PIA must include the line-citation work from Q4 as an explicit acceptance criterion.

Once scope doc lands I'll review against this consensus and these refinements before greenlighting code.
