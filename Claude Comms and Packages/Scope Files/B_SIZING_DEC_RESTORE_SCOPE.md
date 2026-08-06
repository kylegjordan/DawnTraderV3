# B-SIZING-DEC-RESTORE — Scope (Step 1, r4 — Langston's ruled slot shape + the exposure invariant landed)

change-class: architecture

**Batch:** B-SIZING-DEC-RESTORE — make `maxPositionPercentPct` THE per-trade size, slots derived not configured, `portfolioRiskPerTradePct` + `maxOpenPositions` REMOVED AND DELETED loudly and re-entry-proof. **Owner CC-C. Kyle-directed 2026-08-05.**

**★ r2 CORRECTION (Blocker-1, stated first because objective 1 rested on it): THIS BATCH IS A KYLE DIRECTIVE, NOT A RESTORATION.** r1 claimed December's sizer used `portfolio × position%` directly and that objective 1 "restores the December arithmetic." **False — wrong-module provenance.** At `eb5b7368d`, `paper-position-sizing.ts:130-131` already computed `exposureBudget × (safeMaxPositionPct/100) × MAX_POSITION_BUFFER_FACTOR` — **today's formula, verbatim, in December**. The `risk-manager.ts:772-781` passage r1 quoted is a **reject gate** (`if (positionPercent > maxPositionPercent) return {approved:false}`, no `Math.min`) in a different module. ⇒ **The batch stands on Kyle's 2026-08-05 ruling and his worked example ($800 × 100% × 25% = 4 × $200). It does not stand on December's mechanism, and nothing in it may be justified as "how December did it."**

## 0. Kyle's ruling (the authority)

> *"Position sizes and trading slots are controlled by the portfolio balance, the exposure percentage of that balance, and the percentage of the balance allocated to any one trade. $800 × 100% × 25% = 4 slots at $200 each. The old additional fields have been re-added and need to be removed and deleted."* Plus 08-05: wire `maxPositionPercentPct` everywhere incl. live; preserve AMR intent; deep-audit `maxOpenPositions` before removal; deletions loud and re-entry-proof.

**★ DISCLOSED CHOICE (Blocker-3) — the formula is the TWO-TERM form, and that is not the literal sentence Kyle said.** His sentence names three terms (`B × e% × p%`); but with `slots = e/p`, the three-term product gives total exposure `B × e²` — incoherent. The two-term form `perTradeNotional = B × p%` with `slots = floor(e/p)` gives total `B × e` — coherent, and it reproduces his example exactly (because e = 100). **Objective 1 uses the two-term form; Kyle must see this choice, not discover it.** ⚠️ **COROLLARY, stated so nobody expects magic: at e = 100 and p = 20, objective 1 is NUMERICALLY A NO-OP** (B×p ≡ today's B×e×p when e=1). **Sizes change only when Kyle sets p** (e.g. p ≈ 6.6% at today's ~$2,268 → ~$150/trade, 15 slots; or whatever live-mirroring values he chooses). The formula work is structural: one authority, no hidden modulators.

## 1. Numbered objectives

1. **Sizing = fixed-notional:** `perTradeNotional = portfolioValue × maxPositionPercentPct/100`; `quantity = perTradeNotional / entryPrice`. The `riskAmount/stopDistance` path is deleted with its field. (Two-term form per the disclosed choice above.)
2. **Slots DERIVED — LANGSTON'S RULED SHAPE (r4): `slots = min( floor(maxTotalExposurePct / effectiveP), postureSlotCap )` — the SAME `effectiveP` (= p × posture size dial) on BOTH sides.**
   **★★ THE NAMED INVARIANT, with a test: `total committed notional ≤ B × e in EVERY posture`.** r3's shape (slots from nominal `p`, size from `effectiveP`) BREACHED it in the aggressive posture — **and Langston established the breach is LIVE TODAY, inherited, rule-24 outcome (1):** the multiplier is applied at `active-execution-engine.ts:3991-3992`/`:4045-4046` AFTER the sizer's clamp (`active-position-sizing.ts:211-213`), so ×1.25 already exceeds `bufferedMaxNotional` by 25%. Latent only because the system has sat pinned DEFENSIVE. **The exposure identity, Kyle's example (B=$800, e=100, p=25, crypto) — ★ RATIFIED BY KYLE 2026-08-06** (*"If you and Langston agree that the 4-posture table is the right way to handle it, then I agree"* — the condition holds: Langston ruled the shape and re-derived all four rows at `ffdeef959`; CC-C concurs):
   | posture | slots (ruled shape) | size B×effectiveP | committed |
   |---|---|---|---|
   | normal (×1.0) | min(4, 10)=4 | $200 | $800 = 100% ✓ |
   | defensive (×0.6) | min(6, 6)=6 | $120 | $720 = 90% ✓ |
   | aggressive (×1.25) | min(3, 12)=3 | $250 | $750 = 94% ✓ |
   | survival (×0.25) | min(16, 3)=3 | $50 | $150 = 19% ✓ |
   *(r3's shape gave aggressive 4 × $250 = $1,000 = 125% ✗.)* **No posture can breach `B × e` by construction.**
   **★ Blocker-2 discharge (unchanged from r3):** deliberately inverts the `getDynamicSlots` deletion (P19-B8.7 OBJ-3, `DELETED_COMPONENTS_LOG.md:650-655`) — REWRITE fresh, B8.8 loud-refuse contract, m5e twin dispositioned in pre-audit.
3. **`portfolioRiskPerTradePct` REMOVED AND DELETED** (schema, UI, sizer, every reader).
4. **`maxOpenPositions` REMOVED AND DELETED** after the census — **19 files, not 16 (Blocker-4):** the 14 server files from r1 + `core-four-guardrails.tsx` + schema + **`client/src/components/ConfigSnapshotViewer.tsx` + `client/src/components/trading/portfolio-metrics-strip.tsx` + `server/utils/numeric-normalizer.ts`** — the normalizer named explicitly as the site that keeps a deleted field alive tsc-clean; it gets a fence.
5. **★ AMR POSTURE — r3, ON KYLE'S MID-REVIEW DIRECTIVE (2026-08-05): *"Really dig into that .6 multiplier. I don't think it was accidentally added then hidden. It may need to be reconfigured to exist with the corrected formula."* THE DIG CONFIRMS HIM — the multiplier is DELIBERATE, DOCUMENTED, TWICE-DESIGNED:**
   - **Born 2026-01-30** (`9d00fa9c3`, class-less `STRATEGY_MODE_OVERLAYS`) with its intent in the header verbatim: *"professional volatility handling: smaller size, wider stops, reduced whipsaw in choppy/unstable regimes. DO NOT 'tighten stops' in volatile regimes — that causes near-100% stop-out rates. Risk is controlled by position size, not by shrinking stop distance."*
   - **Promoted by B-5 AMR (2026-06, `fb1d2bc57`)** to a per-(mode,class) **DB dial** — `amr_response_dials.*position_size_multiplier`, seeded, boot-asserted, resolved by `getModeOverlayForClass` (`strategy-modes.ts:175`) alongside stop/target/cooldown multipliers AND the slot caps. **It is a first-class limb of the AMR design, not a stowaway. The only defect was INVISIBILITY.**
   ⇒ **PROPOSAL (supersedes r2's slots-only, which Langston ruled before Kyle's directive): RECONFIGURE, PRESERVE BOTH DIALS, MAKE BOTH VISIBLE.** Posture keeps its size dial applied at ONE named point — `effectiveP = maxPositionPercentPct × postureSizeMultiplier` — logged in the sizing line, stamped on the trade, and shown on the AMR panel and wherever the per-trade size is displayed; slot caps combine per objective 2's `min()`. **This preserves the written intent exactly (volatile weather ⇒ fewer AND smaller positions, wider stops) and kills only the hiddenness.** Langston's split-brain concern is met by the explicit single application point + surfacing, not by amputating a designed dial. **Langston re-rules with Kyle's directive in hand; Kyle ratifies the final shape.** Pre-audit must also establish which resolution path produced the current 1,982×0.6 run (class-less `:3850` vs AMR per-class `:3865`) and the **LIVE `module_constants` dial rows — NOT the seeds** (Langston r3-rule: the table is operator-editable and has been re-tuned; the seeded values are the wrong population).
6. **★ THE THREE OTHER SURVIVING NOTIONAL MODULATORS (Blocker-5), each dispositioned — the "no hidden multipliers" thesis binds them all:**
   - **Pattern-pool cap** (`active-position-sizing.ts:186-196`, crypto 15% / xstock 50%): **(2) RATIFIED as `min(effectiveP, patternCap)` — applied at the SAME single point as the posture dial so the ordering is written down, never emergent.** Stated hazard: at Kyle's p=25 example, crypto pattern trades would size at 15% not 25% — a visible, logged divergence, surfaced in the sizing log line, for Kyle to ratify or re-tune at values-decision time.
   - **0.97 buffer** (`getMaxPositionBufferFactor`, `:213`): r1's formula silently dropped it; r2 states it. **(4) REMOVE — RATIFIED (Langston r3-rule), with the execution check moved to `>` + a stated tolerance IN THE SAME COMMIT, not after.** Its purpose was keeping risk-sized notionals from tripping the execution-time position cap; when size IS the cap the buffer's job collapses to guarding equality-vs-`>` at the execution check — solve that by making the execution check `>` with a stated tolerance, not by a hidden 3% shave.
   - **`correlationScale`** (`risk-concentration.ts:412`, post-sizing, never flips `wasClamped`): **(2) KEEP-BUT-SURFACED — RATIFIED, with the added condition that it must FLIP `wasClamped` or carry its own equivalent flag** (a log line nobody joins to the trade is not surfacing). It is a risk reducer with real intent (covariance concentration), but under this batch it must appear in the sizing log line and the trade's stamp, or it is the next hidden ×0.6. Pre-audit enumerates its consumers.
7. **Live mode wired identically** (per-mode guardrails row; no live activation — Phase 21).
8. **Loud, re-entry-proof deletions:** DELETED_COMPONENTS_LOG + `.removed` archives + tombstones citing this scope + **CI fence tests failing on reappearance of either field in schema/UI/sizer** (source-fence per `b-promotion-race-fix.test.ts:68`), mutation-proved; migration drops the columns.
9. **§9.3 verification:** guardrails tabs (both modes) show the reduced set; a new trade opens at `B × p`; **the `min()` RESULT renders where maxOpenPositions was — NEVER the raw `⌊e/p⌋`** (Langston: displaying the derivation rebuilds the phantom cap `getDynamicSlots` was deleted for); the AMR panel's posture reflects in slots.

## 2. Provenance (corrected, refs verified by Langston Step-1)

- `guardrails_v2` born 10-29 `aede2b491` "Core Four" without the two sizing fields — **superseded by Kyle's ruling.**
- `maxPositionPercentPct` re-added 12-01 `1b2d8b0fe`; `maxTotalExposurePct` 12-04 `321a4fd45` (born 25%).
- **December's paper sizer = today's formula** (`paper-position-sizing.ts@eb5b7368d:130-131`, header `:19-22`); the risk-manager position-percent check is a separate REJECT GATE. r1's contrary claim is retracted.
- `getDynamicSlots` deleted P19-B8.7 OBJ-3 (2026-07-16) — premise inverted by this batch, see objective 2.
- AMR B-5 (2026-06-12): posture dials include per-class slot caps — the slots-only preservation path.
- Dispositions: risk-based sizing path (4) remove · maxOpenPositions (4) remove · AMR overlay (2) RECONFIGURE-AND-SURFACE per objective 5 (Langston r3-rule; slots-only withdrawn) · pattern cap (2) · buffer (4) RATIFIED · correlationScale (2 surfaced) · `getDynamicSlots` archive: stays archived, logic rewritten fresh.

## 3. Blast radius / verification

Pre-audit: per-site read over the 19-file census + §9.5(a-ii) state-write census on BOTH deleted fields + the three modulators' consumers + the m5e twin. tsc delta 0; full suite; fences red-on-revert mutation-proved; CI 4-green; `dt-deploy` when landed (CC-B consensus recorded); §9.3 per objective 9. **Pre-audit UNBLOCKED by Langston's r3 re-rule (obj-5 approved, slots-only withdrawn) and audits against the r4 shape at `c8e3a1691`+.**

## 4. OUT

#618 dashboard build (precedes this) · #616 AMR-stuck (CC-B) · fee-ladder geometry card · live activation · the VALUES decision (Kyle sets e and p — including whether p mirrors live's intended slot count — at or before Step-3).
