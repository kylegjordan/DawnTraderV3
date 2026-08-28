# B-TOKEN-WATCH — SCOPE r3: capture-only observation of new Solana token launches

**change-class:** `non_architecture` · **Owner:** CC-INFRA (Infra Claude) · 2026-08-28
**Gates:** concept review **NOT-A-REJECT** → Step-1 **CHANGES-NEEDED (4 blockers)** → **this r2**
**Companion:** `B_TOKEN_WATCH_PRE_REGISTRATION.md` + **AMENDMENT 1** (`c342427ad`) — both **pre-data**, and the amendment was verified byte-identical in sections 1-10 before commit.

> **r1→r2, all four blockers.** **B1** the free-tier headline was one leg of two and a discretionary leg could silently kill the irreplaceable one — reserve, shed order and burn monitor added (§5). **B2** the primary outcome was unobservable for most of the cohort — fixed in the pre-registration amendment, summarised at §3. **B3** the governed documents named no provider while a session memory file named all three — providers and licensing citations now here (§5). **B4** my 1-day hot window was justified on a false claim that nothing queries this for 90 days — the store is split (§4). Plus his four conditions (§0 host, §8.4, stop-rule numbers, board card) and his correction to my storage predicate (§4).

---

## 0. ⛔ THE FENCE — Langston's condition, paragraph one at his instruction

**This is an OBSERVATION RECORDER, not a new market for DawnTrader to trade.** He would gate the recorder and reject *"point DawnTrader at a new market"* outright, **and warned the second hides inside the first.** The reason is arithmetic, not caution: bounded-loss / frequent-modest-win and near-total-loss-on-nearly-all need **opposite sizing, opposite position counts and opposite kill-switch semantics.** Different systems, not one system with a new input.

⛔ **HARD BOUNDARY, testable:** no entry in the canonical regime-strategy map · no strategy · no orchestrator contact · no appearance on the mode axis · no wallet, custody, execution or order path. **If any live-path file appears in this batch's diff, the change class is wrong and it has drifted.**

★ **CO-TENANCY — the blind spot in that test (Langston condition 1).** The fence is a *diff* test, and **a webhook receiver taking ~20,700 POSTs/day plus an hourly scheduler produces NO DIFF while still contending for CPU, event loop and disk.**
**HOST: Helsinki (`204.168.141.77`), NOT the staging box.** Staging runs the trading engine; Helsinki runs the comms bridges and the reviewer. **Stated resource bound:** the receiver is append-only to a file store, single process, no database, capped at the §5 request budget. **It must never be hosted on the trading box** — that is a scope constraint, not a preference, and the diff test cannot enforce it.

## 1. WHAT THIS IS FOR

Record every new Solana token launch **at birth**, then observe it on a fixed schedule, so that in 90 days we hold **the winners and the thousands of failures, recorded identically from the same starting line.**

**The durable prize is the machinery, not the tokens.** The published survival result already exists; re-deriving it replicates a paper. What we keep is **case-control survival machinery built where a published answer key exists**, then pointed at `#594`/`#596`/`#597` — the same statistical problem on scarce data with no answer key. **A null result still delivers it.**

## 2. PRE-AUDIT READS, NAMED

- **Already exists?** `BATCH_CATALOG.md` + `RUNNING_ISSUES.md`, terms `solana` · `dexscreener` · `helius` · `token launch` · `pump.fun`: **zero hits, both files. Not a rebuild.**
  ⚠️ **INSTRUMENT NOTE — POINTER ONLY, the defect is homed in `RUNNING_ISSUES` (see below): `dt-review grep` with an unparsed flag SILENTLY RETURNS ZERO — no error, clean exit.** It nearly corrupted Langston's review of *this scope's own* zero-hits claim; a positive control caught it. **Never pass a flag to `dt-review grep` until it is fixed.** ⛔ Documenting a landmine is a patch — the real fix is that it **rejects unknown flags with a non-zero exit**, and that is filed rather than left in a batch scope that dies with the batch.
- **`SYSTEM_IMPACT_MAP.md`** — **zero mentions.** New ground; the batch **creates** a node (§7). Recording the absence *is* the presence-evidence rule 22 requires.
- **`SYSTEM_MANUAL.md`** — **not applicable, judged explicitly.** It documents trading architecture and math; this trades nothing.
- **`STORAGE_POLICY.md` — read in full BEFORE any retention was proposed** (§4). Called out because designing storage before reading its governing document is the exact failure this session was caught on in August.
- **Nearest precedent:** `P19-B-PERPFEED` — capture-only, born-daily, tiered, trading deferred.

## 3. OBJECTIVES

**OBJ-1 — Birth capture.** One row per launch: on-chain creation timestamp, first-sight timestamp, venue, initial size, initial liquidity, creator wallet, advertised social presence.
**OBJ-2 — Discovery-lag instrument.** Persist **both** timestamps and report the distribution. Not telemetry: size-at-birth is the strongest published predictor, and any delay silently converts it to *size-at-discovery*.
**OBJ-3 — Coverage control: WINDOWED CHAIN RE-CENSUS** (replaces r1's aggregator count — see pre-reg A1.6). One random N-minute window daily, every creation instruction enumerated from the chain, compared against what the webhook delivered. ⚠️ **Stated reach: catches DELIVERY LOSS, does NOT catch provider-side indexing gaps.** A control covering one leg is never described as covering three.
**OBJ-4 — Follow-up on the fixed grid** (1h · 6h · 24h · 3d · 7d · 30d · 90d). Census on birth; 100% of trait-carriers plus **500 non-carrier controls/day** (arithmetic in pre-reg A1.3).
**OBJ-5 — Death classification**, ex ante: *faded* vs *liquidity-pulled*.
**OBJ-6 — Storage + tiering** per §4, **cold hand-off built day one**.
**OBJ-7 — SIM node** (§7).
**OBJ-8 — Alert routing OFF the trading stream** (§6), **plus the OBJ-9 burn monitor.**
**OBJ-9 — Credit reserve, shed order and burn monitor** (§5) — **new in r2, and it protects OBJ-1.**

**Outcome hierarchy (pre-reg AMENDMENT 1):** **graduation is PRIMARY** for the out-of-sample test — near-fully observed, and the published comparators are already stated in graduation terms. **90-day survival is a RIGHT-CENSORED secondary** with launch-date entry. r1's *"censoring is uniform"* is **withdrawn as false**.

## 4. STORAGE

**Classification: business data, never-drop, tiered.** ⚠️ **r1 cited the wrong predicate** (Langston): §7.5's no-history argument is a *sufficient additional* reason for sources that mutate in place, **not the necessary test.** The operative test is §5.5's rule of thumb — ***"a structured record you might re-analyse from → never-drop, tiered"*** — which covers the whole store, chain-sourced rows included.

★ **AND THE DECISION IS OVER-DETERMINED, which is the point.** r1 said *"if that split is wrong, the retention decision is wrong with it."* **It isn't.** The birth census is the denominator of every rate in the study, and a sampled birth record destroys the base rate irrecoverably — so dropping it destroys the study **regardless of how policy classifies it.** Both reasons are stated here so that a future policy revision, or a reader who reopens the derived-vs-primary argument and wins it, still cannot strip the denominator.
*(The "chain is permanent so this is reconstructable" counter is answered by §5's own measurement: reconstruction means 43.2M txns/day and is unaffordable at every tier. Reconstructable-but-unaffordable is operationally not reconstructable. And the **first-sight timestamp is irreducibly primary** under any reading — it is a fact about our instrument, not about the chain.)*

⛔ **THE STORE IS SPLIT (BLOCKER-4). r1's justification was FALSE.** I wrote *"nothing queries this for 90 days"*; **the follow-up scheduler queries it every hour for 90 days** — firing a 90-day checkpoint means looking up a birth record from 90 days ago. §2.5's invariant is **hot retention ≥ the deepest reader window**, not *shorter-than-30-is-fine*.

| store | contents | hot | then |
|---|---|---|---|
| **working index** (tiny) | token id · birth ts · carrier flag · alive/dead · next-due-age | **90 days** | tiers after read-out |
| **birth payload + follow-up series** (bulky) | everything else | **1 day** | daily `.jsonl.gz` → warm → cold |

**The working index is the named reader with its 90-day lookback**, documented per §2.5's own requirement. Transitions: export → upload → **download-verified checksum** → only then remove above (§1).
**Substrate: a file store OUTSIDE the trading database** — §7.5's non-DB precedent, and it cannot contend for a database already at ~61% of cap (verified at `BATCH_CATALOG.md:424`).
★ **Cold hand-off built day one — correcting my own past work:** `#670` records that the crew-status store I built has none and its warm tier grows unbounded. Building a second the same way would repeat a defect I filed against myself; doing it here gives `#670` a proven pattern.

## 5. SOURCES, LICENSING AND COST

⛔ **r1 NAMED NO PROVIDER — the #641 shape running the damaging direction** (Langston): the governed, reviewable document lacked the facts while a session-private memory file carried all three. *"A licensing finding that lives only in a memory file is not a gate; it's a recollection."* Named here:

| leg | provider | licence, read directly | volume | cost |
|---|---|---|---|---|
| births | **Helius** (Solana RPC + webhooks) | Terms of Service read 2026-08-27: **no clause restricting storage or derivation of data**; restrictions cover reselling the service and reverse-engineering the platform | ~20,700/day = **621k/month** | free tier (1M/mo) |
| follow-ups | **DexScreener** (free, no key) | API Terms read 2026-08-27: *"may be used for both non-commercial and commercial purposes"*; **no storage or derivation prohibition**; restrictions cover reselling API access | ~19k/day vs 432k/day ceiling | **free** |
| liquidity pre-graduation + OBJ-3 audit | **Helius**, spare allowance | as above | see reserve below | free |

**Launch venue observed: pump.fun.** ⛔ **REJECTED AND WHY: CoinGecko / GeckoTerminal.** API Terms §6.1/§6.2 read 2026-08-27: *"We do not encourage caching or storage of Data"* (cache must refresh ≤24h) and *"you are not allowed to duplicate, reproduce, copy, store, derive from or translate any Data"* — **identical on free and every paid tier.** That forbids the **dataset**, not the tier, and would have surfaced *after* the build had licensing not been a pre-code gate.

**Secret handling:** the Helius key lives at `~/.claude/.helius-key`, mode 600, **never committed and not in any governed document**. Kyle supplied it knowingly and accepted the disclosure risk on 2026-08-27; rotate from his dashboard if that changes. *(Recorded here rather than only in a memory file, so a future auditor reads it in the artifact.)*

**Measured, live against the chain 2026-08-27** *(Langston tags these `RULED ON REPORTED FACT` — he cannot reach them; §8.8 is the agreed discharge)*: the launchpad runs **500 txns/sec = 43.2M/day, 83% failed**; launches are **~0.05%** of that. **Unfiltered ingestion is impossible at every tier** — 43M/day vs 33k/day free, still ~6× over the $999 tier. **Verified on a real token that a creation parses as its own distinct type**, which is the only reason this is viable.

### ⛔ 5.1 CREDIT RESERVE, SHED ORDER AND BURN MONITOR (BLOCKER-1) — this protects OBJ-1

**The defect r1 hid behind one number:** *"~62% of the free allowance"* was **the births leg alone** (621k/1M). The liquidity and audit legs draw from **the same 1M pool**, budgeted only as *"within the 379k spare"* — so the true ceiling is **100% of a hard cap with zero margin**, on an average launch rate with no stated variance.

**And the ordering is the real hazard.** §6 says a sampled birth record destroys the base rate **irrecoverably**; §5 called liquidity *"not optional colour."* **A liquidity leg overspending in week 3 exhausts credits and stops birth capture — silently converting the census into a sample, in the one direction that cannot be undone.** A discretionary leg was able to kill the irreplaceable one. *(This is the `#704` shape in new clothes: a push-side failure producing no local error.)*

1. **HARD RESERVE — r3 correction: r2 DOUBLE-COUNTED THE HEADROOM** (Langston condition 2). r2 said births get *"621k plus margin"*, the carve is *"≤300k"*, and ~79k remains *"unallocated as genuine headroom"* — but 621 + 300 = 921 and 1,000 − 921 = **79. The 79k IS the remainder; it cannot also be the birth margin.** Restated, and **variance is now stated rather than assumed**, since budgeting on a mean was itself part of B1's finding:
   - ⛔⛔ **r4 CORRECTION — THE r3 ARITHMETIC WAS FOR A 30-DAY MONTH AND DID NOT FIT EVEN THERE (Langston r2 ruling 1, APPROVED; he re-derived it himself).** r3 said *"776k = the 621k mean +25% variance"*. **621k is thirty days.** Checked across every month length: **28-day 724,500 fits · 30-day 776,250 EXCEEDS 776,000 by 250 · 31-day 802,125 EXCEEDS it by 26,125.** In the **seven 31-day months of the year** births at the stated variance exceed both the reserve *and* cap-minus-carve — so the only clause that can shed anything would have been firing on **births**, which is the one leg the design forbids shedding.
   - **BIRTHS: reserved 803,000/month** = 20,700/day × **31 days** × 1.25, rounded up. **Derived against the WORST month, not the convenient one.**
   - **LIQUIDITY + AUDIT: hard carve 190,000/month.** 803,000 + 190,000 = 993,000; **7,000 unallocated.**
   - ★ **THE CARVE SITS DELIBERATELY BELOW THE HEADROOM (190,000 < 197,000), AND THE 7,000 IS THE SEPARATION RATHER THAN SPARE CAPACITY.** With carve = headroom both discretionary legs refuse at the *same instant*, so **no state exists in which liquidity has shed and follow-up has not** — the shed ORDER becomes unobservable, which is Langston's own untested-guard condition applied to a sequence. The 7,000 is what makes the order visible to the injection test.
   - ⛔ **AND THE GUARD NOW CARRIES THE PER-EVENT CREDIT (his tripwire on this ruling):** the reserve is a function of credits-per-birth, so the assert in code multiplies by it. §8.8 measures that figure; **its result goes into the guard, not into a paragraph.** At 7,000 unallocated a measured 1.01 credits/birth breaks the reserve, and without the multiplicand the assert would still read green.
   - **~24k/month genuinely unallocated.**
   - ⚠️ **ABOVE +25% the shed order fires and the 190,000 becomes a residual by design — stated, because r2 called it a carve while budgeting it as a residual.** That is the design working, not a failure: births never shed.
2. **DECLARED SHED ORDER, enforced in code:** **liquidity reads shed FIRST · follow-ups SECOND · births NEVER.**
3. **BURN MONITOR** on the §6 non-trading stream, alerting on projected exhaustion **before** it happens, not at it.
   ★ **PROJECTED FROM WHAT (Langston, unprompted — and he is right that this is the trap):** *"a monitor projecting off a trailing mean is blind in the same direction as the budget, and will under-project during exactly the launch-rate spike that causes the exhaustion."* **So it does NOT use a trailing mean.** It projects from **BOTH a 24h trailing rate AND the peak 1h rate extrapolated forward, and alerts on whichever exhausts sooner** — at **80% of the month's allocation**, and again at 90%. The peak-derived leg exists specifically to see the spike the mean averages away.

## 6. ALERT ROUTING
Failures route **off** the trading alert stream. That queue already carries undischarged rows; a research recorder's failures must not compete with trading failures for the same attention.

## 7. GOVERNANCE
**Creates** a `token-watch` SIM node — read-only / non-trading — with **edges enumerated** (inbound: Helius webhook + RPC, DexScreener; outbound: file store), because this tool's characteristic failure is upstream format drift and the edges are the entry's whole value. Plus `BATCH_CATALOG`, `PHASE_HISTORY`, a `RUNNING_ISSUES` entry, and the Step-8 item *SIM entry created, or explicitly waived with a written reason.* **Board card created** (`Status: Scope · Owner: Infra Claude · Blocked on: Langston`).

## 8. VERIFICATION

1. **Birth capture:** a token created on-chain appears in the store with a creation timestamp **matching the chain**, not our clock.
2. **Discovery lag:** distribution reported with n; breaches of pre-reg A1.5's thresholds (median >60s, or >5% over 300s) are **findings, not footnotes**.
3. **Coverage:** windowed re-census vs delivered births. **FAILS IF** the chain enumeration cannot return a positive in a window we know contained launches. Reach stated per OBJ-3.
4. **Grid integrity:** a sampled token carries checks at **all seven ages it reached before read-out** — *(amended per Langston: r1 said "all seven ages", which only a day-0 token can satisfy; a criterion that cannot pass is not one).*
5. **Death classification:** one of each class, hand-checked against the chain.
6. **Tiering:** destroy the warm copy in a scratch location; cold rehydrates and checksums match.
7. **Fence:** batch diff touches **no** live-path file, **and** the receiver is not hosted on the trading box (§0).
8. **Cost:** **measured credits/day at 72h** against the §5.1 reserve — the agreed discharge for the legs Langston must otherwise rule on reported fact. **Material overshoot re-opens §5.**
9. ⛔ **HARD CLOSE CONDITION — THE SHED ORDER MUST BE OBSERVED FIRING UNDER A DELIBERATE INJECTION.** Promoted from a verification item at Langston's ruling, and the reasoning is his: *"an unverified guard on an irreversible silent loss is not a guard."* **"72h ran and it never had to fire" is absence of opportunity, not evidence of capability** — leg 3 of the reach test. The budget is therefore driven artificially past its threshold in a scratch run, and the close requires **observing liquidity reads shed while births continue**. Without that observation the batch does not close, because §4 makes the loss irreversible: a sampled birth record destroys the base rate, and §5 measures reconstruction as unaffordable at every tier.

## 9. OUT OF SCOPE
Trading, wallets, custody, execution · any signal/strategy/ranking use · historical backfill · any chain but Solana · **interim reporting before the 90-day read-out.**

## 10. OPEN
r1's two questions are **closed** — Langston answered both and they are pre-registered (A1.2, A1.3). Nothing withheld.
