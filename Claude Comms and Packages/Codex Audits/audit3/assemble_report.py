from pathlib import Path
import json
O=Path(__file__).parent
header='''# DawnTrader — Assignment 3 (r3): audit report

**Pinned source sha (export's claim): `d0eda8ae4ab86e5968f08710be8e382a946126fd`.**
**`git rev-parse HEAD`: `fatal: not a git repository (or any of the parent directories): .git`.**
**`git status --porcelain`: `fatal: not a git repository (or any of the parent directories): .git`.**
Both commands were run in `C:\\DawnTrader-Codex-Repo`; this is an allowlisted/redacted export, not a clone. **Porcelain is unavailable, not clean.** The sha is read from EXPORT_PROVENANCE.md, not independently verified from git objects. Its referenced export manifest is absent. `source_hashes.json` identifies the inspected text and `data_profile.json` hashes every supplied data file. The data's one claimed deployed sha differs from the source pin; current-source findings are not claims of live deployment.

## Answer to the governing question

**The system's main demonstrated obstacles are a mismatch between some intended mathematical objects and their implementation, incomplete evidence connecting market observations to decisions and executions, and real trading-cost constraints.** The acknowledged xStock fee error contaminated selection; correctly recomputing fees cannot recover untraded counterfactuals. DHMA's raw monetary geometry is dimensionally inconsistent. Price-side and clock work needs fidelity to actual execution and observed timestamps, not a rule that makes every price a bid or ask. Several existing mechanisms already do the right job and should not be “fixed” as though absent.

The export does **not** identify the root cause of the reported strong-trend zero, an honest deployment-stratified holding-time distribution, attainable all-in costs for every instrument, an optimal staleness ceiling, or evidence that the platform can outperform retail and professional competitors. The ambition is the yardstick, not evidence of achievable returns. Market excursions exceeding a fee hurdle do not establish predictive edge, capture, high win rate or high capital productivity.

| Subject | Disposition | Consequence |
|---|---|---|
| Price and clock semantics | FINDING + INSUFFICIENT | Active-paper fills already use sides/limits; source time, receipt time and decision time remain different objects. No optimal threshold identified. |
| DHMA | FINDING, acknowledged defect | Fractional σ is added to price; the proposed $1.50 ceiling is conditional, and a unit fix alone leaves raw RR below 1 with a positive entry premium. |
| Strong-trend lane | INSUFFICIENT; positive design finding | Eligibility and detector calls exist. Output silence cannot locate a failed stage. Favored-list separation is deliberate and sound. |
| Q1 spread/ticks | Bounded FINDING + INSUFFICIENT | Archive spreads are measurable; full native tick resolution, latency and published historical tick metadata are not established. |
| Q2 holding period | INSUFFICIENT / REFUSE | Missing deployment enumeration and complete censor/risk sets forbid the required survival split. |
| Q3 tape/costs | Bounded FINDING + STRUCTURAL CONSTRAINT | Conditional fee hurdles and bar paths are measurable; execution/capture and some instrument fee groups are not. |

## Reading integrity and scope

Assignment 3 supersedes earlier assignments. Implementation and raw measurements come from the new read-only exports; public venue documentation was checked after Stage A for channel/fee-group semantics, never substituted for historical primitives or fee figures. Work products were written under `C:\\DawnTrader-Codex\\out\\audit3`. No source, data, deployment, account or trade was changed. No design annex, implementation proposal or per-strategy net-EV ranking was produced. Historical batch/ledger material was used for provenance and dispositions, not as current runtime truth or fresh economic evidence.

The literal nested brief path was absent. The corresponding exported filename is `Claude Comms and Packages/Scope Files/CODEX_AUDIT_3_BRIEF.md`; its title was read alone first and ends **(r3)**. Sections 1/1.b/2/2.a and the required provenance/manifests were read first. **The strict blind gate was not fully achieved:** line 62 exposed DHMA's proposed answer with its question, and line 73 exposed the price proposal before the standalone questions. This was disclosed immediately and recorded in READING_LOG.md. Separately written derivations and subsequent critiques are preserved below, but they must not be counted as blind independent agreement. Section 2.b has no separate hidden strong-trend conclusion after line 63. A fresh unexposed reader and physically separated question packet are required to restore that standard; this session cannot erase the exposure.

Work sequence: price derivation recorded → remaining §3 reading/history critique → Q1 archive measurements → restored-subject derivation and remaining reading → Q2 inventory/refusal → Q3 tape/fee scenarios → independent measurement checks → freeze. A Stage-A file is never rewritten to assimilate later findings. Post-derivation corrections appear in Stage B/addenda.

Source shorthand below resolves under `C:\\DawnTrader-Codex-Repo`. Basenames are paired with implementing line references; the source hash index has full relative paths. Data resolves under `C:\\DawnTrader-Codex-Data`. Measurement CSVs/JSONs resolve beside this report. These are snapshot claims with named limitations, not instructions or gates for the crew.

## §3 — price side and freshness, Stage A (verbatim recorded derivation)

'''
priceA=(O/'STAGE_A_PRICE.md').read_text(encoding='utf-8')
pq=(O/'PRICE_STAGE_B_AND_Q1.md').read_text(encoding='utf-8')
priceB,q1=pq.split('## Q1 — measured, bounded result',1)
restA=(O/'STAGE_A_RESTORED.md').read_text(encoding='utf-8')
rq=(O/'RESTORED_STAGE_B_AND_Q2.md').read_text(encoding='utf-8')
restB,q2=rq.split('## Q2 — INSUFFICIENT / REFUSE the requested holding-period distributions',1)
extra='''

### Subsequent price-path refinement (does not rewrite Stage A)

The brief §4 says `executionEntry` moves the entry level. At the traced active sizing site, `signal-orchestrator.ts:1930–1960` calls `computeNetGeometry` but builds the outgoing object by spreading **rawSignal**, overriding target with the normalized target and copying **netExpectedEdge/netRewardToRisk**. No `netGeometry.executionEntry` assignment appears in that file. Thus the confirmed cost adjustment there is an **economic-geometry input**, not evidence that that value replaces the persisted signal entry. Ask which path consumes a changed level before generalizing. The Stage-A warning about duplicate friction remains a conditional contract issue, not a newly proved double charge.

**The direction of the timestamp error matters.** With aligned clocks, `local_age = decision_time − local_stamp`, while `event_age = decision_time − venue_event_time = local_age + (local_stamp − venue_event_time)`. Contrary to the brief's wording that receipt-based age “includes” network transit, a local receipt/parse age **omits delay accumulated before that stamp**. A just-parsed old message can therefore have near-zero local age. Conversely a quiet, correctly maintained unchanged book can have an old last-update time without a broken connection. This algebra explains why the same numeric threshold cannot distinguish the two. Source evidence is the local stamp at `equity-spot-archiver.ts:162–176,188` and the separate crypto raw timestamp parser at `kraken-websocket-adapter.ts:819–838`. Confidence high in clock arithmetic; missing clock offsets, raw frames and timestamp semantics prevent quantifying either case. Falsifier for an incidence claim would be contemporaneous aligned event/receipt/decision records; none is supplied, so no frequency is asserted.

**Ranking also needs a job distinction.** Ranking a trend or valuation feature may legitimately use a midpoint/filtered price. Ranking deployable trades by expected net return requires feasible entry/exit economics, costs and fill probability. Calling all ranking an “estimate of value” does not establish that midpoint economics are sufficient. That distinction follows from the desired object (money attainable from execution), not from a proposal to replace all indicator inputs. No claim is made about which strategy ranks best on this contaminated selection history.

'''
session='''

### Session variation and weighting

`q1_hourly_crypto.csv` and `q1_hourly_xstock.csv` carry per-instrument/hour observations and sample sizes. Among the available **UTC hourly archive-event populations**, crypto's class median spread ranges from **4.991 bps at September 3 17:00Z** to **10.566 bps at September 4 12:00Z**; xStock ranges from **4.544 bps at September 4 19:00Z** to **42.550 bps at September 4 08:00Z**. These are descriptive hour buckets with different instrument/arrival mixes, not a causal session effect or a comparison of equal coverage. Full UTC buckets and n are in the class-hour CSVs; raw session classification and trading-calendar interpretation were not invented.

'''
end='''

## Validation and evidence index

Reproducible scripts and outputs accompany this report. Python/pandas/numpy were used locally; no application source was modified or installed. **No application/integration suite was run and no live execution was tested**—the source is a redacted read-only export and these are analytic/static claims.

- Q1 per-instrument row/valid-spread totals reconcile to the two complete CSV populations. Validity exclusions, locks/crosses, observation weighting, receipt gaps and zero-range exclusions are explicit. `q1_summary.json` is the compact index; instrument/hour CSVs hold the full result.
- Q2 is an inventory, not a survival estimate. Every populated strategy/class/reason row carries its population and n. The current deploy record and all 39 exit-touch rows are preserved separately from any inferred deployment boundary.
- Q3 uses strict minute alignment and continuous timestamps. An initial verification exposed a pandas datetime-unit mismatch (microseconds versus an assumed nanosecond conversion); it was corrected **before reporting results**. The final script explicitly normalizes units and asserts its first epoch against a timestamp conversion. No initial erroneous Q3 result is a finding in this report.
- An independent implementation using Python datetime keys and checking **every intervening minute** agrees on origin counts, median signed return and p90 upside excursion for BTC/USD, ETH/USD, NVDA/USD and A/USD at all four horizons (**16 checks**, including A/USD's zero-origin 60/240-minute cases with nonzero 5/15-minute controls). All **57** fee hurdle combinations were checked by substituting the break-even price into exact quote-cashflow settlement. `verification.json` contains the checks.
- `history_searches.json` records literal case-insensitive component/symbol searches across the ledger and batch reports, including NOT-FOUND results and positive controls. Examples: `detectDHMA` is absent by that spelling in the ledger but present in the Batch 32 report; DHMA component references and its constant migration are found. `favoredListExcludes` is found in both corpora. `bufferTickerSnap` is found in both. A zero search is not proof of no prior decision. The `realizedVol` ledger match is #371's different ATR/reachability object, not a units-defect closure.

Snapshot limitations and falsifiers are part of each section. The mandatory manifests themselves supplied assertions; several were narrowed or contradicted by row counts/source inspection. Their words are not treated as independent proof of sample completeness. The missing export content manifest and conflicting timestamp chronology prevent a stronger git/deploy certification. No outputs were matched against previous assignment reports.

### Files to use

- `REPORT.md`: full dispositions, recorded derivations and critique, measured populations and uncertainty.
- `QUESTIONS.md`: prioritized missing evidence, including the strict independence gate and live price decision primitives.
- `SUBMISSION.md`: freeze time, report/question hashes and the artifact manifest.
- `q1_instruments_*.csv`, `q1_hourly_*.csv`: per-symbol spreads, inferred observed lattices, receipt intervals, and UTC variation.
- `q2_strata_inventory.csv`, `q2_special_records.csv`, `q2_commit_inventory.csv`: bounded record and provenance inventories; no invented survival curves.
- `q3_fee_hurdles.csv`, `q3_tape_instruments_*.csv`, `q3_conditional_fee_clearance_*.csv`: all supplied fee-ladder combinations and per-instrument tape scenarios. These explicitly do not assert every instrument belongs to the standard fee group.
- `data_profile.json`, `source_hashes.json`, `history_searches.json`, `verification.json`, and measurement scripts: reproducibility and provenance.

## The four questions, answered directly against the intention

**What are we missing?** Matched decision/order/fill primitives with meaningful clocks, validated per-instrument fee/tick identity, reliable stage denominators for the supposedly silent lane, complete censored risk sets and historical deploy intervals. Also missing is evidence that price movement can be predicted and captured with enough net return and controlled exposure to support the stated competitive ambition. This audit cannot manufacture those observations from closed selected trades.

**What are we doing right?** Distinguishing actual fill accounting from intended-price telemetry; using bid/ask depth and explicit maker-limit booking in the active-paper path; retaining producer and age provenance; separating favored picks from detector eligibility; keeping the two passive censor walls distinct; refusing to score the contaminated selector. The current crypto timestamp/side plumbing is already a step in the right direction. The off-by-policy active time limit is an explicit Kyle decision, not a missed timer to enable silently.

**What needs improvement?** Price-object and timing contracts need to remain true across every consumer, sample and mode; the exported evidence must disclose its real sampling/windows and semantic gaps; effective settings and observer coverage must travel with causal measurements. Treat current documentation as a map to verify, because both the all-midpoint premise and the universal no-venue-timestamp claim overreach the inspected code. Keep existing observation-window dependencies explicit. These are mechanisms and evidence requirements for the next assignment, not designs built here.

**What is wrong?** DHMA adds a dimensionless return statistic to a monetary level; its units correction alone does not cure the raw reward/risk relationship. The acknowledged xStock fee value/sign error is a real, already-homed defect whose contaminated selection history must not be repurposed as market evidence. Some brief/manifest claims about full tick resolution, seven-day coverage and uniform current behaviour are unsupported by the provided objects. Reporting an unproved strong-trend root cause, a proxy deployment boundary, or a hindsight bar excursion as achievable profit would add errors rather than bring the system closer to its intention.

**Structural constraints remain real.** Fees, spread crossing, queue uncertainty and unobserved timing are not defects simply because the ambition is high. Change the applicable conditions and measure again; do not promise that a software correction removes them. The report supplies evidence for the crew's decisions and confers no approval or authority to change production.
'''
report=header+priceA+'\n\n## §3 — Stage B\n\n'+priceB+extra+(O/'PUBLIC_CONTRACT_CHECK.md').read_text(encoding='utf-8')+'\n\n## §2.b — Stage A (verbatim recorded derivation)\n\n'+restA+'\n\n## §2.b — Stage B\n\n'+restB+'\n\n## Q1 — spread and tick behaviour\n'+q1+session+'\n\n## Q2 — holding period: insufficient / refuse\n'+q2+'\n\n'+(O/'Q3_FINDINGS.md').read_text(encoding='utf-8')+end
(O/'REPORT.md').write_text(report,encoding='utf-8')
print(json.dumps({'report_bytes':len(report.encode()),'report_words':len(report.split()),'stage_a_price_retained':priceA in report,'stage_a_restored_retained':restA in report},indent=2))
