# P19-B8.5f — PRE-AUDIT (Step 2)

**Batch:** `P19-B8.5f` · **Ledger:** `#549` + `#550` · **Owner:** CC-B
**Step-1:** APPROVED by Langston (proceed to Step-2), with two carries: **assert only enforcement-required keys** (never `atr`, never the genesis display fields), and the **taxonomy split OBJ-1-fix / OBJ-3-surface-not-ship** endorsed.
All code coordinates read at `origin/migration/aws-supabase`.

---

## 1. The last unconfirmed link is now CLOSED — the orchestrator is the ONLY drop point

`#550` carried an honest caveat: *"I have not yet confirmed the active-paper OPEN path (`:2663` / `:3047` / `:3144`) persists this metadata UNCHANGED — if a later rebuild intervenes, the drop could be there instead."* **Resolved:**

| site | what it actually is | verdict |
|---|---|---|
| `:2663` | `metadata: { symbol }` on a **risk_check_passed event-log record** | ❌ not the position metadata — my listing it as a drop candidate was wrong |
| `:3047` | `metadata: signal.metadata \|\| {}` — the **trade record** write | ✅ wholesale, no rebuild |
| `:3143` | `metadata: { ...signal.metadata, tradeId, highWaterMark, …, atr_at_open, … }` — the **position** metadata | ✅ **spreads `signal.metadata`**, then augments |

⇒ **The downstream path preserves metadata faithfully. There is no second rebuild.** Fixing the orchestrator whitelist is **sufficient** — the carried value reaches `active_open_positions.metadata` through the `:3143` spread with no further plumbing.

It also closes the ATR story exactly: `:3151` is `atr_at_open: signal.metadata?.atr ?? 0`, and `signal.metadata.atr` is absent **only** because the orchestrator dropped it — hence `'0'` on 15/15.

## 2. The curation is a DELIBERATE WHITELIST — confirmed, with the tell

Langston's evidence verified at ref: `:1050` `sourcePool: rawSignal.metadata?.sourcePool || undefined` and `:1051` `signalType: … rawSignal.metadata?.signalType || 'QUANT'` **hand-re-pick out of `rawSignal.metadata`** in the same construction. **If a spread were intended those two lines would not exist.** Idiom, not accident.

**★ One precision the ruling should carry (I checked rather than accepted):** the `assetClass` fence sits **inside** the `metadata` block, with `..._displayContext` spread **after** it. So the clobber is genuinely **order-dependent**, exactly as Langston qualified — a spread placed *first* would not clobber the resolved class. **The spread is therefore not rejected because it must clobber; it is rejected because (a) ordering becomes a silent correctness dependency nobody can see at the call site, and (b) it dumps uncontrolled strategy-builder fields into a persisted position row.** (b) is the stronger reason. Recorded so a future reader does not "fix" this by reordering and think the objection is answered.

**Governance backing, not just code:** SIM `:76` carries the **P19-B6.5d ASSET-CLASS CARRY-THE-STAMP INVARIANT** as an explicit cross-cutting data-flow rule, and `:496-509` is the B4a `STAMP_MISSING` **throw**.

## 3. ★ BLAST RADIUS — fixing OBJ-1 PROMOTES a dormant documented risk to live

**System Manual `:4559`** documents `max_holding_period` as exit condition **priority 4** — *behaviour the manual describes and that has never once fired.* **System Manual `:5485` rates RISK-035 "LOW": `max_holding_period` exit maps to close reason `'UNKNOWN'`.** Confirmed at code: **`active-execution-engine.ts:1954` — `'max_holding_period': 'UNKNOWN',`**.

⇒ **RISK-035 is rated LOW only because the exit never fires. OBJ-1 makes it fire.** Without a paired fix, the first thing Kyle sees after this batch is a wave of trades closing for reason **"UNKNOWN"** in the trade tables — a fresh truthfulness regression in the exact surface B8.10 was about. **⇒ NEW OBJ-5: fix the close-reason mapping in the same batch, and re-rate RISK-035.** This is the pre-audit earning its place — it is invisible from the diff.

## 4. ★ OBJ-2 RE-DESIGNED — OLD Claude's critique is correct and the precedent is in this file

OLD Claude: *"the assertion set becomes a hand-maintained allow-list too — the same object that failed here. Make it derive the must-transit set from something that fails when the set drifts, or you have moved the problem one level up."* **That is right, and my Step-1 proposal was vulnerable to it.**

**The answer is the B4a pattern already living at `:496-509` in this same file:** *"The required `SizingContext.assetClass` field makes a missing stamp a **COMPILE** error on the typed path; this runtime backstop catches an `as any` / JSON-boundary bypass."* Two layers, and the primary one is **mechanical**.

**⇒ OBJ-2 becomes: make the enforcement-required transit set a TYPED REQUIRED field on the sized-signal metadata contract (compile-time), with a runtime throw as the `as any`/JSON-boundary backstop.** A future omission then fails **at build**, not in production five weeks later, and the must-transit set cannot silently drift because the compiler — not a human list — enforces it. This satisfies Langston's "narrow, enforcement-keys only" carry *and* OLD Claude's "don't move the problem up a level," and it reuses an in-file, Langston-spine precedent rather than inventing a mechanism (rule 15).

**Scope stays narrow per Langston:** the typed-required set is `maxHoldingMs` (OBJ-1) ONLY. `atr` stays deliberately absent (OBJ-3, B6.5b floor governs it) and the `_displayContext` genesis fields stay absent-is-absent, no fabrication — a blanket requirement would turn my own OBJ-3 into a throw.

## 5. Cross-cutting state (SIM) touched
**S20** `price-liveness._cache` — unaffected (sibling gate, no shared write). **S22** `active-funnel-tracker` — unaffected (skip buckets unchanged). **S4** `riskConcentrationAnalyzer` — a newly-firing time-exit changes position *duration* distribution, not weights, but concentration frees earlier ⇒ note, no change. **The B6.5d asset-class carry-the-stamp invariant (SIM `:76`) is the fence OBJ-2 must not breach.**

## 6. Objectives (amended from Step-1)
- **OBJ-1** close the max-hold drop; named test that FAILS on the current rebuild.
- **OBJ-2** typed-required transit contract + runtime backstop (§4) — **re-designed from Step-1**.
- **OBJ-3** surface the ATR consequence to Kyle; ship nothing.
- **OBJ-4** the residual 2/15 `regime` conditional-write gap.
- **★ OBJ-5 (NEW, from §3)** close-reason mapping for `max_holding_period` + re-rate RISK-035.

## 7. Governance (Step-10)
Unchanged from Step-1, **plus** `SYSTEM_MANUAL` RISK-035 re-rating + the `:4559` priority-4 row becoming true-in-fact for the first time.
