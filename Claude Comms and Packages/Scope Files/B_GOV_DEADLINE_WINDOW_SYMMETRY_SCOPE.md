# B-GOV-DEADLINE-WINDOW-SYMMETRY — Step-1 scope (#605)

**change-class: `non_architecture`**
**Owner:** CC-B — read from the entry's own `OWNER: NEW CLAUDE (CC-B)` token, **not** from a Discord hand-off. *(I stood down from this batch once on a window-grep that matched "filed by CC-A"; filed-by is not owned-by.)*
**Diagnosis confirmed independently by Langston at `339241340`.** Code citations below are content-anchored — **verify them at the ref rather than citing this scope.**

---

## 1. ★ PROVENANCE READ (§2 1.b + rule 24.0) — AND IT HAD TO BE DONE TWICE

**Corpora searched, named:** `git log -S` **unrestricted by path**; `BATCH_CATALOG.md`; `RUNNING_ISSUES.md` (#352, #490, #605, B-GOV-ORPHAN-CLASS); the poller's own in-code provenance comments. **`bridge/canonical/` NOT applicable** — the checker postdates the 2026-01/02 governance change (B-GOV, 2026-06-17).

**Origins, quoted verbatim:**
- **`3d3dce073`, 2026-06-17** — *"B-GOV Step-3: governance-checker (deterministic doc-set + deadline detector; inert scaffolding)"*
- **`ec37b2990`, 2026-06-19** — *"B-GOV-2: activate the governance-checker — change-class declaration + dead-man heartbeat + path-heuristic guard + shadow mode"*

### 1a. What the design intends, and it is CORRECT
`poller.mjs:206-207` — `if (s.hasGovernance) { toResolveKeys.push(deadlineKey); }`, commented *"first governance push clears the deadline obligation"* (C8). The docgap path carries the same discipline at `:257-262`: *"Iterate the FULL required set (not just the missing slice) so a doc-gap RESOLVES when the doc later lands — resolve-on-verified-state, Obj-13 (Langston Step-4 a)."*
⇒ **resolve-on-verified-state is the intended contract for BOTH mint paths, and it is present in both.** ⇒ **an operator should never need to resolve one of these by hand.**
⇒ **DISPOSITION for the design: (1) still relevant and correct.**

### 1b. ⚠️ MY FIRST PROVENANCE READ WAS INCOMPLETE, AND THE FAILURE IS THE INSTRUCTIVE PART
I read `anchorClosedBatches` (`:105-113`), saw it pin `lastCode` to `completionAddTime` and set `hasCompletionReport`, and concluded **"the fix #605 proposes is already implemented."** That was **true of the mechanism and false of the coverage.**
★ **I verified that the FUNCTION existed and never checked WHICH FIELD the deadline path gates on.** It gates on **`hasGovernance`** — a third field the anchor never touches.
★ **And #605's own title named the exact pair to compare** — *"`lastCode` IS WHOLE-HISTORY WHILE `hasGovernance` IS WINDOW-SCOPED"*. **I read the title as a description of the symptom rather than as the diagnosis it already was.**

---

## 2. THE DEFECT — a COVERAGE gap, bucket 1

- **`hasGovernance` is set at `:64`, inside the loop over the `-n300` window ⇒ WINDOW-SCOPED.**
- **`lastCode` is PINNED at `:110` to the immutable close event ⇒ WHOLE-HISTORY.**
- **`anchorClosedBatches` pins `lastCode` and sets `hasCompletionReport`. It never touches `hasGovernance`.**

⇒ ★★ **IT ANCHORS THE TRIGGER AND LEAVES THE CLEAR-CONDITION DRIFTING.**

**Full mechanism — both halves are required; neither alone produces the symptom:**
1. The governance commit scrolls out of the window → **`hasGovernance` flips FALSE**;
2. `:206` stops pushing to `toResolveKeys`; `:208` **re-opens** the deadline alert — with a freshly recomputed age from the still-pinned `lastCode`;
3. An operator **resolves it out-of-band**;
4. `:507-508` store-reconcile drops the cached key (#352's deliberate fail-open, so a stale key can't suppress a legitimate re-open);
5. Next tick **`hasGovernance` is still false → re-mints.**

★ **THE FREE DISCRIMINATOR, for anyone re-testing this: the title's age is recomputed on every mint (`:212`), and an out-of-window batch is absent from `batchStates` and cannot mint at all ⇒ an UPDATED age proves IN-WINDOW.** Measured: 4h→17h, 4h→5h, 179h→181h; **17 of 20 `Governance overdue:` rows in the 463-row store are `resolved`.**

---

## 3. Objectives

**OBJ-1 — ★ CENSUS FIRST, NOT THE FIX. Enumerate every reader of `hasGovernance` before changing how it is set.** `:70-77` propagates it **child→parent transitively**, and other consumers may exist. ⚠️ **Pinning it could mask a genuine post-close governance regression** — a batch that closed properly and then had its docs deleted would go on reading `true` forever. **That risk decides the fix's shape, so it is measured before anything is written** (§9.5(a-ii): a removed writer with a surviving reader throws nothing).

**OBJ-2 — anchor the clear-condition, mirroring the existing pin.** For a **closed, non-reopened** batch, `hasGovernance` derives from the immutable close event rather than the window — the same treatment `lastCode` already gets, in the same function, under the same `closed && !reopened` guard. **Shape decided by OBJ-1's census, not assumed here.**

**OBJ-3 — fence test that fails before it passes.** Simulate a batch whose governance commit is **outside** the window and whose completion report exists: assert the deadline alert **resolves and stays resolved across two consecutive ticks**. ★ **Mutation-proof it** — with OBJ-2 reverted the test must FAIL. *(A repaired self-check that always passes is worse than one that always fails; only the second gets investigated.)*

## 4. Explicitly OUT of scope
- ❌ **#625** — the sweep's missing `gov-deadline:` branch. **Different mechanism, different signature (one stable id that never clears vs. re-minting), different population.** **I fused these two once; they must not be re-fused.** #625 survives this fix untouched.
- ❌ **The null-`completionAddTime` silence risk** (Langston: a batch with a real completion report and a null `completionAddTime` is *silently ungraded* — arguably worse than a flapping alert). **Its own §13 item.**
- ❌ **`B-REGIME-INPUTS-LIVE`** — genuinely unclosed (verified: **zero** files matching in `Claude Comms and Packages/Batch Completion/`; `checkBatchDocset` reports `completion_report:false, batch_catalog:false, phase_history:false`). **It SHOULD stay surfaced, and it must still do so after this fix** — that is a verification criterion, not a footnote.

## 5. Verification
Unit: the OBJ-3 fence, plus a **cry-silence fence** — a genuinely-ungoverned batch still alerts after the change (`B-REGIME-INPUTS-LIVE` is the live case). Live (§9.3): after deploy, confirm the three currently-stranded deadline keys behave as predicted **and** that no previously-alerting genuine gap fell silent. ⚠️ **`[STALL]`-style absence proves nothing — the provoked case is the evidence.**

## 6. Governance
Tier 1 per §3. **SIM: judged applicable** — the checker's state derivation changes. **System Manual: not applicable** (no trading architecture/strategy/regime/math change). #605 updated at close; #625 cross-referenced as explicitly separate.
