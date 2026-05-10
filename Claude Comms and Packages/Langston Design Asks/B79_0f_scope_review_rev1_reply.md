# B79.0f review

## Q1-Q5 calls
Q1 (collision behavior: A=throw / B=prefer-crypto / C=prefer-xstock): **(B) with observability** — agree crypto-preference is correct given B74 invariant that xStocks always route via `exchange='kraken-equities'`; add a WARN log when a collision ticker hits the regular `kraken` path without `x` suffix so future drift in that invariant is detectable.
Q2 (XSTOCK_SPOT_SYMBOLS set hygiene — keep all or remove collisions): **Keep + gate** — agree; preserves catalog enumeration utility, collision-set check is surgical, removal would scatter the truth.
Q3 (historical-row backfill: audit-only / audit+remediate / skip): **Audit + remediate** — agree; B73 ablation + regime_factor_alternates + signal_eval_archive carrying mis-tagged crypto rows as xstock_spot will corrupt downstream calibration. One-line UPDATE per affected table is low-cost / correctness-preserving.
Q4 (display-layer scope: A=fix persistence / B=UI re-resolve only): **(B) ONLY IF committed as B79.0g, not RUNNING_ISSUES.md #91 backlog** — UI re-resolve is fundamentally a patch (CLAUDE.md §8 #11 NO PATCHES). Persistence-at-open is the durable fix — single table, single writer. Acceptable to ship (B) now to stop the live mis-display, but the persistence work must be a committed next sub-batch with a number, not a floating issue.
Q5 (safeResolveAssetClass null-return audit needed): **Not needed** — agree; Q1=(B) keeps non-throwing behavior so callsite audit is out of scope.

## Concerns / Additions
- **Provenance comment on XSTOCK_SPOT_KRAKEN_COLLISIONS constant** — include a comment block citing "Kraken `/0/public/AssetPairs` 2026-05-10" as source + last-verified date. Future reviewers need to know how the 9 was derived and when to re-verify.
- **Standing re-audit cadence** — §5 mentions "B79.x periodic re-audit" but doesn't pin frequency. Recommend quarterly re-query against `/0/public/AssetPairs` lands as an explicit standing rule in MULTI_ASSET_VTS_EXPANSION_PLAN.md §10c.X with a calendar trigger, not just a passive note.
- **EUR-side test coverage is right** — 8 EUR regression-lock tests pre-empt the foot-gun if XSTOCK_SPOT_SYMBOLS is later extended to /EUR. Good catch in §7 of objectives.
- **Audit script must be read-only by default** — confirm `scripts/b79-0f-collision-audit.sql` UPDATE statements are commented-out + require manual uncomment after Kyle reviews the audit output. Don't let an autorun foot-gun ship.
- **Backfill governance** — if audit finds rows, the remediation UPDATE per table needs a one-line note in CHANGES_AND_FIXES with the row counts touched per table, for paper trail.

## Verdict
approved-with-revisions

## Ship recommendation
ship after Q4 revision (commit persistence fix as B79.0g with a number, not RUNNING_ISSUES.md backlog) + Q1 observability warning + provenance comment on the collision constant
