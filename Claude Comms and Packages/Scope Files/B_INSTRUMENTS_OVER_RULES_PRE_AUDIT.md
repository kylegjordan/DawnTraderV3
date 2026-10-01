# B-INSTRUMENTS-OVER-RULES — PRE-AUDIT AND PLAN (Step 2, written 2026-10-01, CC-A)

change-class: non_architecture (unchanged from the scope)

**Why this exists now.** Langston ruled the close-out shape on 2026-10-01 (at `dbefaaf01`): a real Step 2 for the one code change still to do (OBJ-2), **not** a `na-skip` row. The checker requires a PRE_AUDIT for `non_architecture` (`scripts/governance-checker/config.mjs`, `CLASS_DOCSET.non_architecture.required`), and the fact-preservation work OBJ-2 needs is pre-audit work. §9.4 disposition of the gap: (1) folded into the work in hand.

## 1. THE STEP-2 GAP — FOUR FACTS, AND AN AMBIGUITY LEFT STANDING (Langston condition 6)

1. The scope header records Langston's Step 1 of 2026-08-30: *"STEP 1: CHANGES NEEDED (2026-08-30), ALL THREE APPLIED, marked `[L]`. OBJ-1 CLEARS AND PROCEEDED IMMEDIATELY; it did not wait for the other two."*
2. No PRE_AUDIT existed for this batch until this file (positive control, Langston: 239 PRE_AUDIT files exist in the tree).
3. No `GOVERNANCE_EXCEPTIONS.md` row covers it (positive control, Langston: 43 `na-skip` rows exist in the file).
4. OBJ-1 (the code-search tool) was installed, reopened under `#1038`, fixed and demonstrated **without a Step 2**.

⛔ **OBJ-1 RAN UNGATED, and this document may not be cited as having gated it** (the `#1005` precedent). Langston will not read his own "OBJ-1 CLEARS AND PROCEEDED IMMEDIATELY" as a Step-2 waiver — he states it does not say that and he cannot recall what he meant. **The ambiguity is recorded and left standing, not resolved in anyone's favour.**

## 2. WHAT OBJ-2 CHANGES

**Object:** the comment block above the symbol-normalisation line in `server/services/market-scanner.ts` — today 97 consecutive comment lines guarding 3 lines of code (`batch = batch.map(p => ({ ...p, symbol: p.symbol?.includes('/') ? toCanonical(p.symbol) : p.symbol }))`).
**97 vs 116 are different objects (condition 3):** 116 was the comment lines the whole `B-SCANNER-EGRESS-NORMALISE` diff shipped; 97 is the resident block. Not drift.
**Rule (scope OBJ-2):** a source comment states what the code does and why. It does not narrate its author's corrections. **Langston judges the result.**

### 2.1 Kept — the what and the why, plus one line of consequence (condition 4)
1. `pair.symbol` is Kraken's own wsname; Kraken's OHLC endpoint rejects its own wsname for two bases (XBT, XDG), a null that is cached and fails the history filter closed — a permanent, silent rejection.
2. Why here: this is the first point where the batch is final and unconsumed; the ticker/pairInfo join and the refill dedupe above key on the raw wsname.
3. Why here and not at the venue call: a venue-boundary fix would not reach the membership and archive legs.
4. Why `toCanonical`, not the resolver: the resolver's slashed branch maps only XBT; `toCanonical` maps both. The resolver's consolidation is `#229`.
5. Blast radius: one map serves base and quote, so 56 of 1,437 wsnames change, including the 31 BTC-quoted pairs.
6. **Consequence, kept as a conclusion:** those 31 become eligible to be assessed, not tradable — the volume gate compares a quote-denominated amount against a USD threshold (`#966`), and the active-path price floor is its own decision (`#967`).
7. The slashed-only guard: why non-slashed entries are left byte-identical.

### 2.2 Removed — and where each fact already lives (fact-preservation census, run 2026-10-01 by distinctive string)

| fact removed from the comment | present in |
|---|---|
| venue probes (`XBT/USD` EQuery vs `BTC/USD` 721) | completion report, change list, scope, `RUNNING_ISSUES` (#909) |
| two bases of 661 | completion report, change list, scope, `RUNNING_ISSUES` |
| "not later" argument (`kraken.ts:296` hands the string over verbatim) | completion report, change list, scope, `RUNNING_ISSUES` |
| Dogecoin in the VTS lane (`capturePreFilterReject` gated `!isPassiveLearning`) | completion report, change list, pre-audit, scope, `RUNNING_ISSUES` |
| VTS floor 0.05 vs Dogecoin 0.0851 | change list, scope, `RUNNING_ISSUES` |
| `logs/virtual_trades` Dogecoin/ADA counts over 151 daily files | change list, `RUNNING_ISSUES` |
| active floor 0.25 (Dogecoin 545 rows; ADA control 0.2013) | change list, scope, `RUNNING_ISSUES` (#967) |
| the resolver's one-entry table / `mapByWsPair` | change list, scope |
| 56 of 1,437 (26 + 31 − 1) | completion report, change list, scope, `RUNNING_ISSUES` |
| `/XBT` `low_volume` 21,574 rows, 31 of 31 | completion report, change list, pre-audit, scope, `RUNNING_ISSUES` |
| the units defect (medians 10,218 vs 0.08) | change list, `RUNNING_ISSUES` (#966) |
| `pairInfo.wsname` not recoverable when absent | change list, scope |
| compact-key hazards (`XTZUSD` → `T/USD`; the `PF_`/`PI_` throw) | completion report, change list, scope |
| every first-person correction ("my first version… was wrong") | the B-SCANNER-EGRESS-NORMALISE change list and review record — narration, deliberately not kept in source |

**Instrument limit:** a match on a distinctive string shows the fact is recorded there; it does not prove the wording is identical. Nothing removed is unrecorded.

### 2.3 Citations (condition 5)
The new comment cites **issue numbers and symbol names, never `file:line`** — the current block's `RUNNING_ISSUES:4571` already points into a different issue (`#735`) because the ledger grew. No positional reference is kept: the new text names `pairsObj[pairName]?.wsname`, the ticker/pairInfo join and the refill dedupe by what they are.

## 3. BLAST RADIUS

Comment-only. No executable line changes: verified at Step 3 by `git diff --stat` and a diff restricted to non-comment lines returning nothing. TypeScript baseline unchanged. No runtime effect; it rides the next release, no deploy or window of its own. SIM: N/A (no component, state or caller changes). System Manual: N/A.

## 4. PLAN

Step 3: replace the block with §2.1's seven points (target ≈25 lines), no `file:line` citations, no first person. Step 4: Langston reads the prose at the ref and judges it (scope: *"Langston judges it; I do not grade my own prose"*). Step 5: CI 4/4 per job. Steps 6-8: no deploy for a comment; verification is the diff (no executable change) and Langston's reading. Step 10-11: close the batch — OBJ-3 to the after-live list with `B-RULES-1e`, governance, the completion report carrying the FAIL verdict.
