# P19-B7.2d Scope — wire the maker/taker decision + pending/twin lifecycle into the xStock VTS lane (#434)

**Batch:** P19-B7.2d · **change-class: non_architecture** (wiring an EXISTING shared architecture into the lane that missed it — no new design) · **Drafted:** 2026-07-03 (CC-B) · **Issue:** #434 (Kyle screenshot find — all 116 open xStock VTS rows have NULL fee mode incl. post-B7.2b opens) · **Sequencing (Kyle 2026-07-03):** B7.2d FIRST, then B-RENAME resumes.

## The gap, precisely

The xStock VTS opens trades through its own path (`server/asset_classes/xstock_spot/eval-cycle.ts` — its Net-EV gate at :716 uses raw kernel `netEV`; zero references to `buildVirtualTrade`/`decideMakerTaker`). The B7.2b/c wiring (decision → best-of-both gate → fee-mode stamp → pending → twins) landed only in the crypto lane (`vts-runner.buildVirtualTrade`). xStock economics remain HONEST (taker-priced by the kernel) — what's missing is the maker option, the fee-mode visibility, and the B7.2c learning machinery. Violates D1 (both classes get shared pieces).

## Objectives

1. **Decision at the xStock open seam:** run the shared `decideMakerTaker` (per-class `maker_taker` knobs already seeded for `xstock_spot` since B7.2) at the eval-cycle open seam, BEFORE its Net-EV floor — the floor gates on **`chosenNetEV`** (best-of-both), mirroring the crypto lane's B7.2b placement exactly; canonical strategy key via `normalizeStrategy` (the confirm-B discipline). Stamp `chosen_entry_mode` + `entry_fee_rate` (entry-leg, per mode) on the opened trade.
   *Verify:* new xStock VTS opens show Maker/Taker + "chosen" in the ML table; DB: post-deploy xStock opens have non-null mode; legacy rows stay dashed (dash-by-design preserved).
2. **Pending lifecycle parity:** a maker-chosen xStock VTS open is born `state='pending'` at the limit + `maker_max_pending_ms` deadline (already seeded 1h for xstock_spot); marketable-at-placement → the stored takerNetEV check (same bifurcation as crypto). **Pre-audit question Q1:** confirm xStock opens land in the SAME `openVirtualTrades` Map + resolve loop as crypto — if yes (expected), the B7.2c resolve pre-pass, weekend guard (R3 — already xStock-aware), fill/drop, never-filled records, and rehydrate cover them with ZERO new resolve code; this batch touches only the OPEN seam.
   *Verify:* first xStock pending on staging (PENDING badge); the R3 weekend guard exercised at the next weekend boundary (soak note).
3. **Twins parity:** the not-chosen leg opens as a tagged twin (same `mtTwin`/`mtPairId` pattern, `twin_enabled` knob already seeded per class, same degenerate skips + slot/cap exemptions + close short-circuit).
   *Verify:* first xStock twin pair (chosen/not-chosen line) on staging; twin counts logged.
4. **Tests + governance:** unit coverage for the xStock seam decision + bifurcation (mirroring the B7.2b/c test shapes); #434 RESOLVED; SIM (eval-cycle component row gains the decision + pending/twin seam) + System Manual one-line lane-parity note; **completion-report language discipline: lane-scoped claims stated as lane-scoped** (the §16/17 lesson Langston logged from B7.2b — this report says "BOTH lanes now wired" only because this batch makes it true).

## Out of scope
The active/paper path (already correct via B7.2b/c). B-RENAME (resumes after this). Any knob/threshold change. The 28 crypto + 116 xStock LEGACY null rows (stay dashed — historical truth).

## Risks
Small: the eval-cycle open seam is one function; the decision + bifurcation code is a near-transcription of the crypto lane's reviewed pattern. Watch: xStock VTS volume ticks up (maker-marginal signals now pass the best-of-both gate — same expected effect as B7.2b crypto, call out at close, not a regression); twins double the xStock VTS open count (twin_enabled kill-knob available).
