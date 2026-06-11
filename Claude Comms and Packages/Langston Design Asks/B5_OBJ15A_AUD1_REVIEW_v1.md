# B-5 Obj-15a AUD-1 review — audit dump surface (commit 1cc292fe9, NOT yet pushed)

**From:** Claude Code · **To:** Langston · **Date:** 2026-06-11
**Context:** the Obj-15a correctness audit you gated with the §7 R4 pinned bars needs per-pair aggregation inputs that exist only in process memory (vote tally over the MCE cache; DBS per-pair scores are publishSnapshot() locals; friction per-symbol spreads are loop locals). EXACT/1e-6 comparisons demand inputs + system aggregate from the SAME instant (proven tonight: xstock flipped CALM→STORMY between two reads minutes apart). Design doc: `Claude Comms and Packages/Scope Files/B_5_OBJ15A_AUDIT_HARNESS_DESIGN.md` (committed). 126 insertions / 4 files. Push gated on your APPROVE.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git on the gdrive mount. All load-bearing diff EMBEDDED below. Commit is local-only.

## D1 — MCE vote refactor (market-context-engine.ts)

`getDominantRegimeForClass` becomes a 1-liner over two new private pieces; behavior preserved by construction:

```ts
getDominantRegimeForClass(assetClass: AssetClass) {
  return this.tallyClassRegimeVote(this.collectClassRegimeEntries(assetClass));
}
private collectClassRegimeEntries(assetClass) {  // ONE cache pass → exact tally inputs
  // identical filters to the old loop: key.endsWith(`:${assetClass}`), expiry skip, regime-null skip;
  // pushes {symbol: key.slice(0, -suffix.length), regime, regimeScore: entry.context.raw?.regimeScore ?? 50}
}
private tallyClassRegimeVote(entries) {  // the old math verbatim over the collected array:
  // regimeCounts accumulation, totalPairs<MIN_CLASS_VOTE_PAIRS→null, sort by count,
  // winner {regime, avgScore: Math.round(totalScore/count), pairCount, percentage: Math.round(count/totalPairs*100)}
}
getRegimeVoteDumpForClass(assetClass) {  // audit surface
  const pairs = this.collectClassRegimeEntries(assetClass);
  return { pairs, winner: this.tallyClassRegimeVote(pairs) };
}
```

**JUDGMENT CALL A1:** refactor-not-duplicate — the consumer vote and the dump winner are the same code over the same array, so the audit's EXACT bar tests the real tally math, and the two paths cannot drift. The alternative (a copy-paste tally in the dump) would let a future edit split them silently.

## D2 — DirectionalBiasStore.getAuditDump (directional-bias-store.ts; covers BOTH classes — crypto + xstock instances; mce.computeGlobalBias is a thin delegate to the crypto store)

```ts
getAuditDump(): { entries; computed: GlobalDirectionalBias | null; latestSnapshot; mode } {
  const now = Date.now();
  for (const [sym, entry] of this.store.entries()) {
    if (now - entry.timestamp > PAIR_HARD_EXPIRY_MS) continue; // expiry FILTER, no prune
    if (this.opts.mode === 'xstock' && !(entry.sector && GICS_SECTORS.has(entry.sector) && !entry.sentinelZero)) continue;
    // push {symbol, score, volume, sentinelZero, sector, timestamp} + build the three Maps
  }
  const computed = entries.length > 0 ? computeGlobalDirectionalBias(pairScores, volumes, undefined, sentinelFlags) : null;
  return { entries, computed, latestSnapshot: this.latestSnapshot, mode: this.opts.mode };
}
```

**JUDGMENT CALL A2 (read-only contract):** unlike publishSnapshot it (a) filters expiry instead of pruning, (b) never publishes, never touches latestSnapshot/history/transitions, (c) applies the SAME eligibility partition (xstock GICS + non-sentinel) so `computed` is formula-faithful. The audit recomputes the weighted median from `entries` with an independent implementation vs `computed.score` at 1e-6. `latestSnapshot` rides along for reference only (it is from a different instant — the capture-correctness leg compares ledger stamps to the PUBLISHED log lines instead).

**JUDGMENT CALL A3 (floor not applied to the dump):** the dump returns `computed` even below the publish floor (it never publishes, so floor semantics don't apply); the audit script knows the floor and only scores cycles where the system itself had a published value.

## D3 — Friction collector (market-indicators.ts)

NOT a duplicate loop — an optional collector threaded through the existing sampling passes:

```ts
export interface FrictionAuditCollector { samples: Array<{symbol; spread; slippage; fee; friction}> }
export function computeGlobalFrictionWithDetails(assetClass, auditOut?: FrictionAuditCollector): FrictionResult
// crypto loop, inside the existing `if (metrics && metrics.spread >= 0)` guard:
auditOut?.samples.push({ symbol, spread: metrics.spread, slippage: metrics.slippage, fee: metrics.fee, friction });
// xstock store loop (computeXstockFrictionFromStore(auditOut?)), same pattern with
// spread: s.bidAskSpreadPct / 100 and the class's defaults.slippage/fee.
```

All existing callers unchanged (parameter optional). The xstock loop changed `for (const s of read.samples.values())` → `for (const [sym, s] of read.samples.entries())` — value usage identical.

## D4 — endpoint (routes.ts)

`GET /api/diagnostics/amr/audit-dump` (auth-gated, read-only): per class `{ vote: mce.getRegimeVoteDumpForClass(klass), dbs: <class store>.getAuditDump(), friction: { result, samples } }` where friction result+samples come from ONE `computeGlobalFrictionWithDetails(klass, collector)` call. Same error envelope as the other amr diagnostics endpoints.

**JUDGMENT CALL A4 (permanent, not throwaway):** this stays as a diagnostics surface — repeatable audits (critical-rule-13 rolling-window preference) and future shadow-week evidence pulls. Critical rule 11's instrumentation exception covers shipping it inside the audit objective.

## Bench evidence
- tsc baseline: OK, no regressions.
- Targeted suites: b5-amr-body 28/28, b-phase-a2-xstock-dbs-store green; b63-item16-dbs-store fails at COLLECTION with `ECONNREFUSED ::1:5432` (needs local Postgres; in the pre-existing env-gated set proven on clean checkout earlier tonight; CI runs it with the DB service).

## Ask
APPROVE / REVISE + verdicts on A1-A4. On APPROVE: push → CI → deploy, then I run the offline audit script (read-only, B.3-replay pattern) against the live dump + ledger SQL + equity-feed state + external sources, and the evidence tables go in the completion report per the pinned bars (miss = NO-CLOSE).
