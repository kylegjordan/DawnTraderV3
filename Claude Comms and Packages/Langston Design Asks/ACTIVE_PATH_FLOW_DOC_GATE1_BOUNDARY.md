# ACTIVE-PATH FLOW DOC — GATE-1 BOUNDARY ONE-PAGER

> **Owner:** Claude Analyst (CC-C) — Kyle standing assignment 2026-07-21 ("we should be creating an architectural document for the flow of our active trading path… everything that we change, rebuild, add in, remove, all of that is documented in our flow"). **This supersedes my exchange-research items.**
> **For:** Langston — Step-1 boundary ruling **before I write any content.** Prep doc: `Claude Comms and Packages/Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md`.

---

## 1. THE GAP, MEASURED — not asserted

| Fact | Evidence |
|---|---|
| The existing audit is **`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`**, 361 lines, stages A→H | file at `1-system-manual/` |
| **64 batch completion reports have landed since that audit date**, vs 135 before it | `git log --diff-filter=A` over `Claude Comms and Packages/Batch Completion/`, first-add date per file, split at 2026-06-18 |
| Those 64 include the entire **B7.x ranking + fee arc**, the **B8.x switch-on arc**, and **P19-B-RENAME** (which renamed the engine and its tables) | the enumerated list |
| **The audit is CRYPTO-ONLY** — its own title is "ACTIVE TRADING PIPELINE AUDIT — **CRYPTO**" | line 1 |

**⇒ Two independent problems, and they need different answers.** (a) The audit is 64 batches stale. (b) **xStock has never had a documented active-path flow at all** — that is a coverage hole, not staleness, and no amount of updating the crypto audit fixes it. I want the boundary ruled with both in view.

**And the deeper point (Kyle's own framing):** we ran that audit at the start of Phase 19 and *keep finding things it missed* — the dual RTB refresh (7 months, missed by two audits) being the canonical case. So a one-shot refresh reproduces the failure. **The deliverable has to be a thing that STAYS true, not a better snapshot.**

---

## 2. WHAT I NEED YOU TO RULE — the boundary, before content exists

**GATE-1 — is this a TRAVERSAL or a CHAPTER?** My position: a **traversal**. The System Manual already owns *what each component is and why*; the SIM owns *what connects to what*. A third document that re-explains components is a third place to drift, and drift is the disease we are treating.
So the flow doc owns **the EDGES ONLY**: for each hop, what is handed over, in what shape, under what preconditions, and what can silently drop it. **Where a link needs explaining, it links out and never explains.** If you think that boundary is unholdable in practice — that edges cannot be described without re-describing nodes — say so now, because it changes the whole shape.

**GATE-2 — how does it stay true?** A doc nobody can tell is stale is worse than no doc, because it is trusted. My proposal: a **committed manifest** of the files/symbols the flow depends on, plus a check that reads at the graded ref and **fails loudly when a manifest file changes without the flow doc changing**. Same principle as the pinned test CC-A argued for on #554 and the same principle that decided B-COMMS-CHUNK-FIX's Finding B: **the guarantee must come from something that fails on its own when it drifts, never from someone remembering.** Rule whether that is the right mechanism, or whether it is over-engineering for a doc.

**GATE-3 — scope of the first pass: BOTH classes, or crypto first?** The reorg D1 decision is "both in code, one live at a time." I read that as: the flow doc covers **both** from the start, marking per-hop where the classes diverge — because a crypto-only doc is exactly the artifact we already have and are complaining about. But it doubles the first pass. Your call.

---

## 3. METHOD I INTEND TO USE — §9.5, applied literally

**Not a path trace.** §9.5(a) is explicit about why: path-tracing is satisfied by the *first sufficient explanation* at each hop, so it structurally cannot find a second mechanism — the June audit traced end-to-end and still missed the dual RTB refresh. So at **every** hop I produce a **census**: who writes, who reads, who mutates, **who DELETES** (the highest-yield question — it is what surfaces duplicate mechanisms), and **who schedules/starts work against it**. Repo-wide grep per question, tests excluded, single-member lists stated explicitly as such (an asserted absence needs presence-evidence).

**Provenance read** per §9.5(b): for any hop whose behaviour is disputed or predates the governance change, consult `bridge/canonical/` and the introducing commit — recording explicitly when the canonical corpus has *no* coverage, since that absence was itself a finding last time.

**Verify as I go, against running code — not against the reports.** The 64 reports are the index of what to look at, not the source of truth. Where a report and the code disagree, the code wins and the disagreement gets recorded.

---

## 4. WHAT I AM NOT ASKING FOR

Not asking you to review content — none exists yet, deliberately. Not proposing a batch or any code change. Not touching the existing audit or the canonical corpus (frozen historical record). This is one ruling on shape, so I don't write 500 lines in the wrong form and have you tell me at the end.
