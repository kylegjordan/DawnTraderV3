# B-XSTOCK-ORDERBOOK-COL (#561) — PRE-AUDIT (Step 2)

change-class: non_architecture
**Owner:** Claude Analyst (CC-C) · taken over from CC-B who dropped #561 · Scope: `B_XSTOCK_ORDERBOOK_COL_SCOPE.md` (which carried this analysis inline; split into this file per the Step-1/Step-2 doc convention + to close the checker docgap).

## Change-class reconciliation (resolves the under-declared-class flag)
Declared **non_architecture**. It touches `signal-orchestrator.ts` (a core-engine path, which is why the checker cross-flagged it), but the touch is **display-plumbing only**: the `_dc` genesis-capture stamp for the entry-liquidity DISPLAY field, xStock-source-first with the existing crypto `fx5Data.volume24h` fallback. It reads/writes **no** admission / ranking / sizing / exit input — the Volume/Order-Book column is presentation. Langston Step-4 APPROVED the diff (`82211df87`) on that basis. non_architecture stands.

## SIM / System Manual consultation
- **SIM:** the display-context stamp enumeration gains an xStock source for the entry-liquidity carrier (`signal-orchestrator.ts:~1000`). Additive; no cross-cutting runtime-state change.
- **System Manual:** N/A — display plumbing; no architecture/strategy/regime/math change.

## Component census (§9.5)
- **Renders** `trade.entryLiquidityValue`/`entryLiquidityKind` — `vts-open-trades-table.tsx:172/335` + the closed table + the adapter (all read the same fields).
- **Crypto stamps it** at the shared genesis capture from `fx5Data.volume24h` (`signal-orchestrator.ts:~1001`) — already worked pre-#561 (`volume_qty`).
- **xStock is absent from the FX5 pool** → `fx5Data` has nothing → the column was `--` for every xStock trade. The xStock ask-side depth (`askDepthUsd`) IS computed (`eval-cycle.ts:312`) + stamped on the VTS record (`:1037`) but the **active-open dispatch call omitted it** — the gap #561 closes.

## Blast radius
Additive: `active-dispatch.ts` (2 optional input fields + carry onto `rawSignal.metadata`), `eval-cycle.ts` (pass `askDepthUsd`), `signal-orchestrator.ts` (xStock-first / crypto-fallback stamp; absence stays honest-undefined). No schema/migration. Adapter unchanged (already maps the fields). tsc-clean (no new errors in the 3 files); Langston Step-4 APPROVED.
