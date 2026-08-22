# B-PHANTOM-FILL-RECONSTRUCT — PRE-AUDIT (Step 2)

> Owner: Claude Analyst (CC-C) · 2026-08-23 · change-class **architecture** (declared in the scope)

## 1. PREVIOUSLY-STATED-VS-NOW (§9.2)

| Quantity | Previously stated | Now | Reason |
|---|---:|---:|---|
| Overstatement, lifetime | $187.78 → 111 rows → ~$111 | **$58.63** | the three earlier figures were produced **without the maker negative control** and none was reproducible — all three are **WITHDRAWN**, and recorded as withdrawn rather than dropped |
| Affected trade count | 111 | **21** | the conservative detector (`exit_price > ask ±5s`) replaced a looser one |
| Corrected lifetime P&L | −$74.11 | **−$132.74** | the reconstruction, applied |
| Reconstruction source | ask | **bid** | the ask is the right *detector* (you cannot sell above it); a market sell takes the **bid** — corrected **before** any figure above was computed |

## 2. §9.5(a) COMPONENT CENSUS — the five questions, over `closed_trades` realized P&L

Repo-wide grep, tests excluded. Full reader list and dispositions are in the scope §5–6; the census
questions and their answers:

| Question | Answer |
|---|---|
| Who **writes** the P&L columns? | `active-execution-engine.closePosition` → `storage.createClosedTrade` (`storage.ts:3087`), plus the stranded-clear writer at `routes.ts:12975`. **Two writers, not one** — and they are not symmetric (the stranded-clear writes `pnl` only and lets `net_pnl` fall to its `'0'` default). Already documented by the `b-balance-truth-pnl-basis-fence`. |
| Who **reads** them for a money or risk figure? | `storage.ts` aggregates (→ kill switch, guardrail balance, dashboards), `routes.ts` analytics + equity curve, `dashboard-metrics.ts`. **All repointed.** |
| Who **mutates** them after the close? | Nothing, before this batch. **This migration is the first** — and it writes only NEW columns. |
| Who **DELETES** here? | Nothing deletes closed trades. Kyle: *"we don't delete these trades."* |
| Who **schedules** work against them? | the exit monitor (per-tick), the promotion loop, `daily-loss-budget` (per evaluation), `guardrail-settings` (per balance read). None writes P&L outside the close path. |

**★ The census's actual yield, and it changed the batch.** Two risk gates — the kill-switch 24h
numerator and the guardrail current-balance — reach the ledger through the SINGLE aggregate
`storage.getRealizedPnlSince()`. Repointing that one expression corrects both with no separate edit,
**and a path trace would not have told me that**: tracing forward from the dashboard reaches the
dashboard's own sum and stops, because the narrative is already complete there.

## 3. §9.5(b) PROVENANCE READ — stated including what was NOT found

- **`bridge/canonical/`** — `Phase_8_` and `Phase_11_Implementation_History.md` are the only files
  mentioning realized-P&L persistence, and **neither documents the paper close-fill's order-book
  walk**. ⚠️ **That absence is itself the finding**, recorded per the §9.5 recording rule: the
  mechanism whose defect this batch cleans up after was never written down in the pre-governance
  corpus, which is consistent with it having been latent from 8.9.4 until the B8.5 switch-on.
- **Git archaeology** was done at the parent hotfix (#507) and is not repeated here.

## 4. §9.5(b-ii) GOVERNANCE-LEDGER SEARCH — done BEFORE filing anything

Searched `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports for *phantom*, *ghost
bid*, *book truncat*, `#507`.

- **`#507`** — the parent. This batch is its **remedial half** (the code fix landed at `e6f7c70b3`);
  it is not a new finding and is not filed as one.
- **`#531` ADDENDUM-2** — the **xStock** "fresh-but-wrong exit price" / plausibility-band item, owner
  CC-B, Kyle-ruled accept-and-observe. ⚠️ **Adjacent and deliberately NOT merged**: different asset
  class, different mechanism (no order-book walk), and #545 records exactly this comparison-class
  error. My detector is crypto-only *by construction* — it needs a contemporaneous crypto ticker
  snapshot — which is stated in the scope rather than left as an unexplained gap.
- **`#547` CR-2** — fee-drag on inconsistent bases. Related family, **separate defect**, untouched here.

**Nothing in this batch is filed as a new defect.** The one genuinely new observation — that 4
recorded wins are losses once corrected — is an *effect measurement of the known defect*, and it
lands in the scope and the completion report, not as a fresh issue.

## 5. SIM / SYSTEM MANUAL CONSULT (§9 rule 1)

- **SIM** — `closed_trades` appears throughout as a *sink* (P19-B7.2b fee-mode columns, B8.6 exit-rest
  stamps, the B8.10 genesis capture). **No SIM entry describes who READS its P&L columns**, which is
  the gap this batch's census fills. ⇒ **SIM gets a content update at Step 10**: the reconstruction
  columns, and the `getRealizedPnlSince` → two-risk-gates edge that the census surfaced.
- **System Manual** — the canonical net-of-friction statement lives at the Net-Expectancy kernel
  (`:244`); the manual does **not** currently state the realized-P&L basis for closed trades.
  ⇒ **System Manual gets a content update at Step 10** stating the canonical basis, including that
  the honest basis prefers a reconstruction where one exists. This is the reason the change-class is
  `architecture`: the batch changes a canonical meaning.
- Neither doc is silent in a way that contradicts the scope; both are silent in a way that is itself
  a governance gap, flagged here per §9 rule 1.

## 6. BLAST RADIUS

| Dimension | Assessment |
|---|---|
| **Upstream** | none — the batch reads retained `crypto_spot_ticker_snap` data and the existing ledger; it adds no feed and changes no capture path. |
| **Downstream** | every money figure and both paper risk gates. **Direction is safety-positive:** phantom fills inflated profits, so the 24h loss budget read as *less* consumed than it was; the correction makes the kill switch strictly more conservative (≈3.3 points of loss-percent at the worst 24h window). |
| **Shared state** | none. No runtime singleton is touched; nothing in the SIM cross-cutting registry is involved. |
| **Background execution** | none added. The backfill runs once, inside the migration, and is idempotent (`reconstructed_exit_price IS NULL AND phantom_fill_suspect = false`). |
| **Rollback** | drop the four columns; every recorded value is untouched, so rollback is total and lossless. **That property is the reason for the beside-not-over shape.** |

## 7. RISKS ACCEPTED, NAMED

1. **The detector is conservative and will miss phantom fills that landed between bid and ask.**
   Accepted deliberately: a false positive *rewrites a real trade*. Under-correcting is recoverable;
   over-correcting silently is not.
2. **Reconstruction depends on a ticker snapshot within ±5s.** All 21 rows have one. A future
   affected row without one gets `reconstruction_basis = 'none_no_market_data'`, stays flagged, and
   keeps its recorded figure — **the truthful answer, not a zero.**
3. **The gross-vs-net split in win/loss classification predates this batch** and is not harmonised
   here; classification is moved onto the honest *net* figure only.

## 8. SEQUENCING — the one thing that must not be missed at deploy

⚠️ **TWO unapplied migrations will be on the branch at deploy time**:
`2026-08-21-b-balance-truth-closed-trades-mode.sql` (B-BALANCE-TRUTH Step F, still unapplied) and
this batch's. **Deploying the head without running both breaks every closed-trade read.** Both are
registered in `MANIFEST.txt`; the deploy must run migrations before the app restarts.
