# P19-B8.5j — PRE-AUDIT (Step-2)
## The maximum-hold master switch (paper / live / VTS)

change-class: architecture · **Owner:** CC-B · **Scope:** `P19_B8_5J_SCOPE.md`
**Census method:** `git grep <ref>` at `origin/migration/aws-supabase`, complete results printed (the
2026-07-24 standing practice — a filesystem grep timed out and produced a false "not referenced" the day
before). Written BEFORE code, unlike B8.5i's (whose absence caused that batch's red CI).

## 1. ENFORCEMENT-SITE CENSUS (§9.5(a) — every time-based force-close, complete)
There are exactly **two** live enforcement sites for a max-hold force-close, and they are independent:

| # | Site | Fires when | Fed by | Governs |
|---|---|---|---|---|
| A | `active-execution-engine.ts:1652` (`checkExitConditions`, private async method) — `max_holding_period` | `elapsedMs >= metadata.maxHoldingMs` | the per-position stamped `maxHoldingMs` | **paper + live** (the 24h closes) |
| B | `tec-evaluator.ts:228`+`:242` (`evaluateTECExit`) — `stale_timeout`/`timeout` | `holdDurationMs > input.maxHoldMs` | injected `maxHoldMs` | **VTS** (real 7-day valve `vts-runner.ts:2969`; shadow 6h `:3694`) |

**Non-cross-contamination (verified):** the active path calls the evaluator with `maxHoldMs: Infinity`
(`active-execution-engine.ts:1523`), so site B is already inert for the active path — it only ever bites
VTS. Conversely site A reads `position.metadata.maxHoldingMs`, which VTS never routes through. So the two
sites are cleanly separable and the three switches never overlap.

**Everything else the census returned is NOT an enforcement site** (stated per rule 22, not inferred from
silence): `exit-strategy-replay*.ts` (backtest replay, offline), `historic-signal-generator.ts` (historic
gen), `strategy-engine.ts`/`signal-orchestrator.ts` (STAMPING, not enforcing), `aj19b`/`i1` diagnostics
(label vocabulary only). None force-close a live position.

## 2. MODE RESOLUTION AT EACH SITE (the switch key)
- **Site A:** `checkExitConditions` is a method with `this.mode ∈ {'paper','live'}` (proven live at
  `:1533` `callerMode: this.mode === 'live' ? 'live' : 'paper'`). ⇒ resolve `enabled_live` when
  `this.mode==='live'`, else `enabled_paper`.
- **Site B:** gated at the vts-runner CALL SITES, which are unambiguously the VTS lane (real `:2969`,
  shadow `:3694`). ⇒ `enabled_vts`. No mode inference needed.

## 3. RESOLVER + WARMUP (the B8.5e outage lesson)
- `getCachedConstant(module, constant, key)` (`module-constants-service.ts:375`) **THROWS** if the module
  is not warm, and returns `undefined` if the module is warm but the key is absent. ⇒ the read is wrapped
  `try { v = getCachedConstant<boolean>(...) } catch { v = undefined }`, and `enabled = v === true`. Both
  throw and undefined resolve to **OFF** — the fail-safe, non-destructive direction (OBJ-4).
- `max_hold_switch` MUST be added to `b72-warmup.ts PREFETCH_MODULES` (`:27`) or every sync read throws.
  In practice it is warm; the try/catch covers only the cold-start race.

## 4. TEST BLAST-RADIUS CENSUS (the B8.5i lesson — never seed 1 of N)
Files exercising site A or B (complete `git grep -l` at ref): `b5-w21-max-holding-ms`,
`p19-b8-5f-maxhold-carry`, `b65-tec-parity`, `b-new-42-tec-halt-resilience`, `b-new-42-tec-split-resilience`,
`p19-b6-5b-tec-atr-floor`, `b79-0n-strategy-se-key-factory`, `reorg-b4-shadow-isolation`.
- **Site A (inline flag) affects:** `b5-w21-max-holding-ms` (directly asserts the branch fires) — must add
  an explicit `enabled_paper=true` seed so its firing cases still pass, plus an OFF case. `p19-b8-5f`
  (carry/stamping) — verify whether it reaches `checkExitConditions`; seed if so.
- **Site B (call-site Infinity) affects:** only tests that drive `vts-runner`'s real/shadow passes end to
  end — `reorg-b4-shadow-isolation` is the candidate. The `evaluateTECExit`-direct tests
  (`b65-tec-parity`, `b-new-42-*`, `p19-b6-5b`) pass an explicit `maxHoldMs` and are UNCHANGED because the
  evaluator is untouched (the reason OBJ-3 gates at the call site).
- **Mandatory:** FULL `npx vitest run` A/B against a clean-origin baseline before push (not a subset).

## 5. FAIL-DIRECTION (OBJ-4, restated because it is the load-bearing safety property)
A force-close is irreversible; not-closing is not. So absent/cold/unset ⇒ **do not enforce**. This is the
opposite of TEC `requireKey` (there, absent ⇒ refuse-to-boot, because a missing exit param is unsafe).
Here the missing switch resolves to the *desired* state (off), so it is a correct default, not a rule-11
silent-fallback. Documented at both sites + System Manual.

## 6. SIM / SYSTEM MANUAL IMPACT
- **SIM:** new module `max_hold_switch` + two newly-gated sites ⇒ content update required.
- **System Manual:** the exit-control surface gains a mode-keyed governing switch with a documented
  fail-safe and the VTS-zombie-valve consequence ⇒ System-Manual scope (same reasoning that made B8.5i's
  System-Manual update applicable).

## 7. BLAST RADIUS
LOW for behaviour (additive, seeded off, gates existing branches). MODERATE for CI (a new governed read at
site A breaks `b5-w21` unless seeded — the B8.5i shape, now enumerated up front). Deploy ordering: migration
FIRST, rows verified present, THEN restart — but note the fail-safe means even a missed row degrades to OFF
(the safe direction), so this is less knife-edge than B8.5e's boot assertion.
