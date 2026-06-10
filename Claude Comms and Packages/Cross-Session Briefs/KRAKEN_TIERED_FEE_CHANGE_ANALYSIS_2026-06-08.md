# Kraken cross-platform fee tier change (July 2026) — analysis + system impact

> **From:** CC session in active Kyle-facing conversation (2026-06-08).
> **To:** the other CC session (peer awareness) + Langston (when the fix is scoped) + Kyle (decider).
> **Type:** Informational + heads-up. A new tracked work item was added to the between-Phase-24-and-19 sequence as a result of this analysis. No code changed yet.
> **Source:** Kraken's support page **"Cross-platform fee tier changes (July 2026)"**, last updated June 9, 2026, effective **July 9, 2026**. Originally a chat screenshot; Kyle then supplied a clearer PDF (`screencapture-support-kraken-articles-cross-platform-fee-tier-changes-2026-06-08-22_07_56.pdf`) which was rendered to images and read precisely. The fee table is transcribed in §3 as a durable text record. **§3 carries a correction note — the first rev of this doc (from the low-res screenshot) mis-read several cells, including Tier 1 spot taker; the numbers below are the corrected, high-confidence read.**

---

## §1 — What changed at Kraken (plain terms)

**Before:** your fee on each product was set only by your activity in that product — spot volume set your spot fee, futures volume set your futures fee, independently.

**After (July 9, 2026):** Kraken measures **three things** and puts you in the **most favorable tier any one of them earns:**
1. 30-day **spot** trading volume (USD)
2. 30-day **futures** trading volume (USD)
3. **Assets on Platform (AoP)** — the total USD value of eligible assets you simply hold on Kraken.

Once the tier is set, that tier's rate applies across **both** spot and futures. If more than one measure qualifies you for the same tier, the rates don't stack — it's just "best of the three."

**AoP specifics (from the page):**
- **Included:** wallet balances (incl. tokenized assets, crypto, fiat), assets in Opt-In Rewards, staked assets, dual-investment balances.
- **Excluded:** loans, embedded-parent-client balances, equities.
- Assessed **point-in-time** (your current balance, not a 30-day average), denominated in USD — if the market drops, your AoP drops and your tier can adjust immediately.

**Spot-volume specifics:** spot + margin trades on crypto-cash, crypto-crypto, and xStocks markets count. **Excluded:** forex/stablecoin fx pairs, Instant Buy, conversions.

**Futures-volume specifics:** Kraken Futures contract volume only; spot/margin counted separately; futures volume carries over to your spot fee (best-of logic) but not vice-versa in the same way.

---

## §2 — What this means vs. what DawnTrader currently models

### What we have today (verified in code 2026-06-08)
- **One hard-coded fee level for everything:** taker **0.26%** / maker **0.16%**, in `server/config/exchange-defaults.ts`, re-exported through the per-class friction modules (`server/asset_classes/crypto_spot/friction.ts`, `.../xstock_spot/friction.ts`).
- **Crypto and xStock currently use the SAME fee** (the only friction difference is the spread estimate: crypto 0.10% vs xStock 0.12%).
- **No tier concept exists.** No 30-day volume tracking, no AoP tracking, no tier lookup. A single flat fee.
- **Fees are NOT in the database** — they're hard-coded source constants, so changing them is a redeploy, not a settings edit.
- **Futures (perp) fees are not configured at all** — `crypto_perp` / `xstock_perp` friction modules are placeholders that error out until those classes onboard.
- **How it flows to decisions:** `cost-model.ts` computes round-trip friction = `(fee×2) + (slippage×2) + spread`, which feeds `totalFriction` into the Net-Expectancy kernel; a trade is rejected when `netEV = rawEV − totalFriction ≤ 0`.

### The gap
- At our current size (~$830 portfolio, negligible 30-day volume, negligible AoP), the resolved tier under the new structure is **Tier 1: 0.80% taker / 0.40% maker on spot** — roughly **3× the 0.26% taker / 0.16% maker we model.**
- Round-trip friction we currently assume for crypto ≈ `(0.26%×2) + (0.05%×2) + 0.10%` ≈ **~0.72%**.
- Round-trip friction in reality at Tier 1 (taker both sides, conservative) ≈ `(0.80%×2) + (0.05%×2) + 0.10%` ≈ **~1.80%**.
- So we **under-estimate friction by roughly 1.1 percentage points per round trip — real friction is about 2.5× what the model assumes.** The EV gate would admit trades that look marginally profitable in the model but are actually EV-negative once true fees apply — and active trading would underperform what VTS/paper suggest. (Even on maker fills, Tier 1 maker is 0.40% vs our modeled 0.16% — still ~2.5× on that side.)

### Why it's not an emergency (but must be fixed)
- We're in VTS + paper-active modes; **no real fees are being paid.** This is a **model-accuracy** problem, not a live money-leak.
- It becomes a real-money problem the moment live trading turns on. And it distorts the Phase 19 paper-audit if we don't fix it first — the whole point of Phase 19 is to observe realistic behavior.

### Three softening factors
1. **AoP works in our favor — but the bar to reach what we model is higher than first thought.** Holdings on Kraken (or 30-day spot volume) pull the tier down, and every step helps: ~$20K AoP → Tier 3 (0.38% taker), ~$50K → Tier 4 (0.35%), ~$100K → Tier 5 (0.30%), ~$200K → Tier 6 (0.25%). Note our currently-modeled 0.26% taker only matches **Tier 6** (~$100K 30-day spot volume OR ~$200K AoP) — so "the gap shrinks as the account grows" is true, but reaching the rate the model already assumes is a real milestone, not automatic.
2. **The cross-platform tier is account-wide**, which means our long-standing "crypto and xStock share one fee" equality is now **structurally correct**, not a coincidence. The AMR per-class work does NOT need a per-class fee dimension because of this.
3. **Failure mode is safe if we default high.** Over-estimating fees only ever rejects some good trades; it never admits a bad one.

---

## §3 — The new tier table (verified from Kyle's clearer PDF, 2026-06-08)

> **CORRECTION NOTE:** an earlier rev of this doc transcribed these from a small screenshot and got several cells wrong — most importantly Tier 1 spot taker (had 0.60%, **actually 0.80%**), plus Tier 3/4/5/8/9 maker+taker. The table below is read from the **clearer PDF** (`screencapture-support-kraken-articles-cross-platform-fee-tier-changes-2026-06-08-22_07_56.pdf`, pages 1–2 of the rendered capture) and is **high-confidence across all tiers**. Columns as published: **Tier | Spot 30-Day Vol (USD) OR | Futures 30-Day Vol (USD) OR | AoP (USD) | Spot Maker % | Spot Taker % | Futures Maker % | Futures Taker %.**

| Tier | Spot 30d Vol | Futures 30d Vol | AoP | Spot Maker | Spot Taker | Fut Maker | Fut Taker |
|------|-------------|-----------------|-----|-----------|-----------|-----------|-----------|
| Tier 1  | $0+      | < $5M    | N/A   | 0.40% | **0.80%** | 0.0200% | 0.0500% |
| Tier 2  | $2.5K+   | ≥ $5M    | N/A   | 0.30% | 0.60% | 0.0175% | 0.0450% |
| Tier 3  | $10K+    | ≥ $10M   | 20k   | 0.22% | 0.38% | 0.0150% | 0.0400% |
| Tier 4  | $25K+    | ≥ $15M   | 50k   | 0.20% | 0.35% | 0.0125% | 0.0350% |
| Tier 5  | $50K+    | ≥ $25M   | 100k  | 0.15% | 0.30% | 0.0100% | 0.0300% |
| Tier 6  | $100K+   | ≥ $40M   | 200k  | 0.12% | 0.25% | 0.0075% | 0.0275% |
| Tier 7  | $250K+   | ≥ $50M   | 400k  | 0.10% | 0.22% | 0.0050% | 0.0250% |
| Tier 8  | $500K+   | ≥ $75M   | 600k  | 0.08% | 0.20% | 0.0050% | 0.0225% |
| Tier 9  | $1M+     | ≥ $100M  | 1m    | 0.06% | 0.18% | 0.0000% | 0.0200% |
| Tier 10 | $2.5M+   | ≥ $150M  | 2.5m  | 0.04% | 0.15% | 0.0000% | 0.0180% |
| Tier 11 | $5M+     | ≥ $250M  | 5m    | 0.02% | 0.12% | −0.0030% | 0.0175% |
| Tier 12 | $10M+    | ≥ $300M  | 10m   | 0.0%  | 0.10% | −0.0030% | 0.0170% |
| Pro 1   | $50M+    | ≥ $400M  | 20m   | 0.0%  | 0.09% | −0.0030% | 0.0160% |
| Pro 2   | $100M+   | ≥ $500M  | 25m   | 0.0%  | 0.08% | −0.0050% | 0.0150% |
| Pro 3   | $250M+   | ≥ $1B    | 50m   | 0.0%  | 0.07% | −0.0060% | 0.0135% |
| Pro 4   | $400M+   | ≥ $2B    | 80m   | 0.0%  | 0.06% | −0.0060% | 0.0130% |
| Pro 5   | $500M+   | > $5B    | 100m  | 0.0%  | 0.05% | −0.0060% | 0.0125% |

**Reading notes:**
- Negative futures-maker values in the deep tiers are **maker rebates** (Kraken pays you to provide liquidity).
- The "OR" between the three qualifying columns is the best-of logic — you land in a row if **any** of spot-vol / futures-vol / AoP reaches that row's threshold.
- **Our row today = Tier 1** (spot $0+, no futures, AoP under $20K) → **0.80% taker / 0.40% maker spot.**
- **Where our currently-modeled 0.26% taker actually sits:** between Tier 5 (0.30%) and Tier 6 (0.25%) — i.e., our model is effectively assuming we're a ~**Tier 6** trader, which needs ~$100K of 30-day spot volume OR ~$200K AoP. That's a much higher bar than our actual standing.

---

## §4 — What was added to governance (already done)

A tracked work item was created in the between-Phase-24-and-19 sequence:
- **`PHASE_24_TO_19_READINESS_CHECKLIST.md` §5b — ITEM 4.5: Tiered fee-model accuracy fix.** Slotted after the VTS-standalone item (item 4), before AMR (item 5). Independent of AMR; must land before the Phase 19 paper-audit.
- **`POST_AUDIT_ROADMAP.md` §19.0.C** — the Phase-19-prep entry mirroring it.

**The fix has three parts (design-before-build with Langston, NO-PATCHES §5#15):**
1. Move fee values from the hard-coded source files into `module_constants` (DB-tunable, per-asset-class resolution; one account-wide fee is structurally correct now).
2. Add live-tier awareness (periodic read of the account's actual Kraken fee schedule → DB value); **default to Tier 1 (most expensive: 0.80% taker / 0.40% maker) until wired.**
3. Confirm the resolved rate flows through every fee consumer into the EV kernel.

**Account standing CONFIRMED (Kyle shared account page 2026-06-08): the live account is Tier 1 — the worst case, no softening.** Total balance / Assets-on-Platform ≈ **$835** (far below the ~$20K AoP needed even for Tier 3); 30-day spot volume negligible (the trading key has been idle ~6 months in VTS); no futures volume. Staking + Stablecoin Rewards are both ON — those balances *do* count toward AoP, but the total is ~$835 either way. So **default-to-Tier-1 is not just the conservative choice — it's the accurate one** for the foreseeable future; the model should use 0.80% taker / 0.40% maker until either 30-day volume or AoP climbs enough to earn a lower tier.

**Timing note:** the new tier structure **does not take effect until 2026-07-09.** Until then the existing (pre-change) Kraken Pro schedule applies — but at this account's size that entry-tier rate is also well above our modeled 0.26% taker, so the model is optimistic under both the old and new schedules. The fix is needed regardless; July 9 just locks in the 0.80%/0.40% entry-tier numbers above as the figures to default to.

---

## §5 — Why this is a heads-up to the peer session

No action required. Two reasons it's on record here:
1. **AMR friction-trend input:** the AMR weather-report (Phase 25 scope draft v2) reads a "friction trend" input. That input is about the *movement* of spread/slippage, which is largely independent of the fee *constant* — so this fee fix does NOT change the AMR friction-trend design. But it does mean the absolute friction baseline AMR's EV-gap input sees will shift once the fee fix lands; if AMR is being prototyped against friction numbers, use the post-fix (Tier-1-default) fee, not the old 0.26%.
2. **No per-class fee dimension needed:** because the new Kraken tier is account-wide, the crypto==xStock fee equality is now correct by design. If either session was about to add a per-asset-class fee split, don't — it's unnecessary.

Append a §6 below if you spot a dependency I've missed. Otherwise informational.

— CC (Kyle session), 2026-06-08
