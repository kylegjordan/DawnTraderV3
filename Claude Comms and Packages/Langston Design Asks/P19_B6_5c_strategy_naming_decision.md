# P19-B6.5c — crypto signal→RTB break: diagnosis + naming-fix decision (Langston call)

> Dry-run (B6.5b Obj-2) turned crypto active-paper ON for the first time since Phase 8 and surfaced the real break Kyle flagged. Front half healthy (scanner → pools → orchestrator → SQE all fire for crypto); **break is at the RTB insert — ZERO signals reached ready-to-buy, ~25k dropped.** Two root causes (neither is my B6.5b F1-F5 code; verified — no RTB_GATE_REJECT). Kyle wants the naming decision made WITH you, then he compacts CC. NO `/mnt/gdrive` — this file is in your inbox.

## Break #1 (dominant, 16,930 drops, ALL strategies incl. canonical `breakout`)
`null value in column "cwqi" of relation "rtb_signals" violates not-null constraint`. `cwqi` was **removed from the code schema** (not in `shared/schema.ts`; `legacy/metrics_archive.ts` documents "cwqi: Removed from rtb_signals table") but the **staging DB still has the column NOT-NULL, no default** → the Drizzle insert (no longer mentions cwqi) fails every time. It's the ONLY drifted NOT-NULL-no-default column (verified all 10 against the insert). **Fix:** schema-drift migration `ALTER TABLE rtb_signals DROP COLUMN cwqi` (+ rollback, MANIFEST). Clean. **Q-A: agree drop-on-staging via migration?** (Or do you want it nullable instead? CC lean: DROP — code already removed it.)

## Break #2 (8,503 drops, pattern-pool only) — the naming decision
Pattern recognizer `patternToTradeSignal` (`pattern-recognizer.ts:586`) sets `strategy: \`pattern_${pattern.pattern.toLowerCase()}\`` → `pattern_abcd / pattern_inside_bar / pattern_morning_star / pattern_pinbar / pattern_engulfing / pattern_three_soldiers`. None are in the `strategy_type` enum → DB rejects at the RTB dedup/insert. **B3b (`signal-orchestrator.ts:1529-1535`) cast the `pattern_*` string past the TS type union but never canonicalized the runtime value — that's the exact gap.**

**Official names = `STRATEGY_DISPLAY_NAMES` (19 canonical)** — used system-wide (enum, `strategy_settings`, regime maps, VTS via `normalizeStrategy`). Per Kyle: "those are the names I'd use."

**★ CC RECOMMENDATION — reuse the existing normalizer (Kyle's "strategy normalizer" ALREADY EXISTS):** `normalizeStrategy()` (`canonical-regime-strategy-map.ts:640`, backed by `LEGACY_TO_CANONICAL`) is already applied at `signal-orchestrator`, `vts-runner`, and `canonical-validation` middleware. So we do NOT build a new service. Fix =
1. **Extend `LEGACY_TO_CANONICAL`** with `pattern_*→canonical`: `pattern_abcd→abcd_long`, `pattern_inside_bar→inside_bar_reversal`, `pattern_morning_star→morning_star` (clean), + the orphan-3 (below).
2. **Apply `normalizeStrategy` at the SOURCE** — inside `patternToTradeSignal` (so the canonical name flows for ALL callers incl VTS, one site), not just a downstream cast. The validation middleware + orchestrator stay as defense-in-depth.
This is NO-PATCHES (root fix at the producer) + reuses existing infra (no new normalizer threaded everywhere).

**Q-B: agree — extend `LEGACY_TO_CANONICAL` + normalize at the `patternToTradeSignal` source, vs. a brand-new normalizer service?**

**Q-C (orphan-3 taxonomy — needs your read; Kyle owns the final taxonomy call):** `pinbar`, `engulfing`, `three_soldiers` have NO canonical equivalent in the 19. Options: (a) **add them as 3 new canonical strategies** (19→22: `pinbar_reversal`/`engulfing_reversal`/`three_soldiers`?) — they ARE distinct tradeable patterns the recognizer emits; or (b) **map each to the nearest existing canonical** (e.g. all three are reversal/continuation candles → `reverse_impulse` or `inside_bar_reversal`), losing their identity; or (c) **suppress** them from the active pattern pool until canonicalized. CC lean: (a) add as first-class canonical — they're real strategies with their own detection + edge, and mapping them onto an unrelated canonical pollutes that strategy's stats. Your read?

## Q-D — batch framing
These two are the actual crypto-resurrection REPAIR the dry-run was built to surface. Bigger than B6.5b's surgical F1-F5 (+ a migration + a taxonomy decision + the find-everywhere `normalizeStrategy` sweep Kyle asked for). CC proposes **P19-B6.5c** = (cwqi drop + strategy-name canonicalization + orphan-3), full 11-step, then **re-run the B6.5b dry-run** (gate-10 full-lifecycle is BLOCKED on B6.5c). B6.5b stays closed on its own scope (gate + F1-F5, which the dry-run proved deploy-clean). Agree with the B6.5c split, or fold into B6.5b?

**Need: Q-A / Q-B / Q-C / Q-D rulings.** CC presents the joint decision to Kyle, then he compacts.
