# B-TOKEN-WATCH — SCOPE r1: capture-only observation of new Solana token launches

**change-class:** `non_architecture` · **Owner:** CC-INFRA (Infra Claude) · 2026-08-28
**Gates:** Langston concept review **NOT-A-REJECT** (2026-08-27, with conditions) → **this Step-1 scope**
**Companion, already committed:** `B_TOKEN_WATCH_PRE_REGISTRATION.md` (`492f12dce`) — written and pushed **before any data exists**, which is its whole point.

---

## 0. ⛔ THE FENCE, FIRST — Langston's condition, and it goes in paragraph one at his instruction

**This is an OBSERVATION RECORDER. It is not a new market for DawnTrader to trade.** His ruling: he would gate the recorder and reject *"point DawnTrader at a new market"* outright, **and warned the second hides inside the first.**

The reason is not caution, it is arithmetic: bounded-loss / frequent-modest-win and near-total-loss-on-nearly-all-with-survivors-carrying-the-book need **opposite sizing, opposite position counts and opposite kill-switch semantics.** They are different systems, not one system with a new input.

⛔ **HARD BOUNDARY, testable:** no entry in the canonical regime-strategy map · no strategy · no orchestrator contact · no appearance on the mode axis · no wallet, no custody, no execution, no order path. **If any live-path file appears in this batch's diff, the `non_architecture` class is wrong and the batch has drifted.** That is the check, not the promise.

## 1. WHAT THIS IS FOR

Record every new token launch on Solana **at birth**, then observe what becomes of it on a fixed schedule — so that in 90 days we hold something almost nobody collects: **the winners and the thousands of failures, recorded identically from the same starting line.**

**The durable prize is not tokens** (Langston's reframe, adopted). The published survival result already exists; re-deriving it is replicating a paper. What we keep is **case-control survival machinery, built where a published answer key exists to check our work against** — then pointed at our own strategy population, `#594` / `#596` / `#597`, which are the same statistical problem on data that is scarce, expensive and has no answer key. **A null result still delivers the machinery.**

## 2. PRE-AUDIT READS, NAMED (§1.6 — stated because a pre-audit that cannot name its sources did not happen)

- **Does it already exist?** `BATCH_CATALOG.md` + `RUNNING_ISSUES.md` searched for `solana` · `dexscreener` · `helius` · `token launch` · `pump.fun`: **zero hits, both files.** **Not a rebuild.**
- **`SYSTEM_IMPACT_MAP.md`** — **zero mentions** of any component here. This is new ground, so the batch **creates** a SIM node rather than extending one (§7). *(Recording the absence is itself the finding — rule 22: an asserted absence needs presence-evidence, and this is the evidence.)*
- **`SYSTEM_MANUAL.md`** — **not applicable, judged explicitly rather than skipped.** The Manual documents trading architecture, math and the signal pipeline; this trades nothing and touches none of it.
- **`STORAGE_POLICY.md` — READ IN FULL BEFORE ANY RETENTION WAS PROPOSED** (§4). ⚠️ This read is called out because designing storage *before* reading the document that governs it is the exact failure this session was caught on in August.
- **Nearest precedent:** `P19-B-PERPFEED` — capture-only feed, born-daily tables, tiered storage, **trading explicitly deferred.** Same shape, different source. Its scope, pre-audit and close notes are the template.

## 3. OBJECTIVES

**OBJ-1 — Birth capture.** Subscribe to token-creation events on Solana and record one row per launch: on-chain creation timestamp, first-sight timestamp, venue, initial size, initial liquidity, creator wallet, and advertised social presence.
**OBJ-2 — Discovery-lag instrument.** Persist **both** timestamps from OBJ-1 and report their distribution. ★ This is not telemetry: size-at-birth is the strongest published predictor, and any discovery delay silently converts it into *size-at-discovery* while we call it the published variable.
**OBJ-3 — Coverage positive control.** Cross-check our daily indexed launch count against an independently sourced count. **A discovery feed's silence is worth nothing until the feed is shown able to speak** (29(b)).
**OBJ-4 — Follow-up on the fixed grid.** 1h · 6h · 24h · 3d · 7d · 30d · 90d. Census on birth; **100% of trait-carriers plus a fixed random control of non-carriers.** Fixed ages, never an adaptive taper, so cohorts pool and censoring is uniform.
**OBJ-5 — Death classification.** Record *faded* vs *liquidity-pulled*, ex ante. Both end at zero and a win/lose column would treat them identically; they may differ on day one, and that difference is a primary object of the study.
**OBJ-6 — Storage + tiering** per §4, with the cold hand-off built **from day one** (§4, and see the #670 note).
**OBJ-7 — SIM node** (§7).
**OBJ-8 — Alert routing kept OFF the trading alert stream** (§6).

## 4. STORAGE — decided only after the policy read

**Classification: business data, never-drop, tiered** — the §7.5 predicate applied. Our follow-up series captures what a source looked like at a specific moment, and **that source keeps no history**; "what did this token look like at six hours old" is not reconstructable afterwards. Same reasoning that made the crew-status snapshots a primary record.

**Tier path:** **HOT** current day only · **WARM** daily `.jsonl.gz` · **COLD** indefinite. Each transition export → upload → **download-verified checksum** → only then remove from the tier above (§1), so a crash cannot lose a boundary.

**On the 30-day default rule (§2.5):** the standing rule constrains hot windows **longer** than 30 days, requiring a documented reader. One day is **shorter**, so it needs no exception — and is right here, because nothing queries this for 90 days. Stated rather than assumed, since departing from a default silently is how defaults rot.

**Substrate: a file store, OUTSIDE the trading database.** Follows §7.5's non-DB precedent and honours §0's fence — it cannot contend for the trading database's disk, which is at ~61% of cap.

★ **THE COLD HAND-OFF IS BUILT IN OBJ-6, NOT DEFERRED — and this corrects my own past work.** `#670` records that the crew-status store I built has **no cold hand-off and a warm tier growing unbounded.** Building another warm-growing store without one would repeat a defect I filed against myself. Doing it here also gives `#670` a proven pattern to copy.

## 5. COST — measured, not estimated (Langston's supply-vs-demand gate, discharged)

**Measured live against the chain 2026-08-27:** the launchpad program runs **500 txns/sec = 43.2M/day, 83% of them failed** (bot competition). Launches are **~0.05% of that traffic**. ⇒ **unfiltered ingestion is impossible at every tier** — 43M/day against a 33k/day free allowance, and still ~6× over the $999 tier.

**Verified on a real token: a creation parses as its own distinct type**, so creations are separable from the noise. That single fact is why this is viable at all.

| leg | source | volume | cost |
|---|---|---|---|
| births | chain-direct, filtered to creation events | ~20,700/day = **621k/month** | free tier (1M/month) |
| follow-ups | DEX aggregator, free, no key | ~19k/day vs a 432k/day ceiling | **free** |
| liquidity pre-graduation | chain-direct, spare allowance | within **379k/month spare** | free |

**Total $0/month**, at ~62% of the free allowance. ⛔ **Nothing is trimmed to fit** — the full observation grid and the control group are intact. Kyle approved the split and the spare-allowance use on 2026-08-27.

**Licensing, read not assumed:** ⛔ the aggregator we originally planned on **forbids storing or deriving from its data identically on free and every paid tier** — that forbids the *dataset*, not the tier, and would have surfaced after the build had licensing not been made a pre-code gate. Both chosen sources were read directly: **commercial use permitted, no storage or derivation prohibition.**

## 6. ALERT ROUTING — deliberately separate

Failures here route **off** the trading alert stream (Langston). That queue is already carrying rows nobody has discharged; a research recorder's failures must not compete with trading failures for the same attention.

## 7. GOVERNANCE

**Creates** a `token-watch` SIM node — read-only / non-trading — with inbound edges (chain event subscription, DEX aggregator) and outbound (file store) **enumerated**, because this tool's characteristic failure is upstream format drift and the edges are the entire value of the entry. Plus `BATCH_CATALOG`, `PHASE_HISTORY`, a `RUNNING_ISSUES` entry, and the Step-8 close item *SIM entry created, or explicitly waived with a written reason.*

## 8. VERIFICATION

1. **Birth capture:** a token created on-chain appears in our store, and its recorded creation timestamp **matches the chain**, not our clock.
2. **Discovery lag:** the distribution is reported with n; a median above a stated threshold is a **finding, not a footnote**.
3. **Coverage control:** our daily count against the independent count, both stated. **FAILS IF** the independent probe cannot return a positive on a day we know launches occurred.
4. **Grid integrity:** a sampled token carries checks at all seven ages, or a recorded reason it does not.
5. **Death classification:** at least one of each class present and hand-checked against the chain.
6. **Tiering:** kill the warm copy in a scratch location; confirm cold rehydrates and checksums match.
7. **Fence:** `git diff` for this batch touches **no** live-path file. **FAILS IF** it does.
8. **Cost:** measured credits/day after 72h against the 62% projection; a material overshoot re-opens §5.

## 9. OUT OF SCOPE
Trading, wallets, custody, execution · any signal, strategy or ranking use · historical backfill (we record forward) · any chain other than Solana · interim reporting before the 90-day read-out.

## 10. OPEN FOR THE REVIEWER
- The **trait-carrier definition** for OBJ-4's follow-up split is not yet pinned to a threshold. I would rather agree it with you than choose it and have it look fitted afterwards.
- **Control-sample size** — a fixed number per day, or a fixed fraction? Fixed number makes daily cohorts comparable; fixed fraction tracks launch-rate changes. I lean fixed number and would take a correction.
