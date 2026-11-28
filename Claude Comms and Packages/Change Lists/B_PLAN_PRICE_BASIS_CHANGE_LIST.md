# B-PLAN-PRICE-BASIS — Change List

## Step 1 — Scope

- [Scope](../Scope%20Files/B_PLAN_PRICE_BASIS_SCOPE.md) records #1223 and the absorbed #1221, today's distinct detection, birth and fill price paths, and the required verification for each objective.
- The review asks for agreement on the price-path inventory, the single paired xStock comparison and its controls, the separate proof for each strategy input, and the Price Feed Coverage dependency. Kyle's basis decision follows that evidence.
- Step 1 changes the scope and review record only. It uses the recorded Phase A ref as a source baseline and collects no market sample. The delivery card is in Scope. Implementation, settings and staging remain under their existing gates.

### Review revision 2

- Coltrane's 2026-11-27 08:58:47 UTC ruling on `7c2900f44ae1e3bf36e662ca96faf6c8834c6a99` identified two corrections. The scope now registers the cohort before VTS booking gates, reconciles pre-dispatch stops separately from active Entry Gate outcomes, and pins both readers' quotes and clocks. The two-case control changes the VTS ask while holding the later active quote available.
- The decision packet now requires derived, versioned and reviewed Price Feed Coverage bounds for the candidate basis and clock. Admission uses the bound at the changed plan distance and refuses unsupported cells, which the comparison retains as unassessable.

## Step 2 — Offline replay evidence

- [Pre-Implementation Audit and Implementation Plan](../Scope%20Files/B_PLAN_PRICE_BASIS_PRE_AUDIT.md) A5 records the exact joins and limits for the pre-VTS opportunity roster, bar revisions, VTS booking quote, and active price observation. It carries the A6 booking and dispatch controls and separately accounts for a VTS registration failure that still reaches active dispatch.
- All 21 tests in the three existing provenance, xStock aggregate and xStock cache unit suites passed locally. The controls exercise value equality, changed settled values, certified read ordering and whole-revision replacement. They do not grade an historical population.
- Formal Step 2 review still requires a replay registration with the roster, exact opportunity-to-revision and price receipts, session boundaries and minimum usable coverage, or a reviewed prospective route. Reviewed Price Feed Coverage bounds are required before grading admission or making a basis choice.

### Registration preparation

- The Pre-Implementation Audit and Implementation Plan now records the eligible source checks, proposal for a prospective two-session feasibility pilot, denominator reconciliation, independent price receipts, and positive and refusal controls. The reviewer question asks for the evidence route and the conditions for admitting sessions. The exact calendar, serving evidence and observation registration remain prerequisites for collection.
