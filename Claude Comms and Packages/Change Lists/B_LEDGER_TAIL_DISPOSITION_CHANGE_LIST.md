# B-LEDGER-TAIL-DISPOSITION (#1169, row 1u) — CHANGE LIST (Step 4, r1)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) THAT CLASS'S DOC SET** | SCOPE — **present**, `Claude Comms and Packages/Scope Files/B_LEDGER_TAIL_DISPOSITION_SCOPE.md` (r2 `1f353111f`, approved) · PRE_AUDIT — **present**, `…/B_LEDGER_TAIL_DISPOSITION_PRE_AUDIT.md` (`cc2cc29e0`, approved with C-4..C-6) · COMPLETION_REPORT — **absent**, Step 11 · BATCH_CATALOG, PHASE_HISTORY — **absent**, Step 10 · SYSTEM_MANUAL — **judged N/A**: nothing under server/, client/ or shared/ changes · SYSTEM_IMPACT_MAP — **owed at Step 10**: the census table's self-contradicting list gains a tail leg · CHANGES_AND_FIXES — **judged N/A**: no trading-system bug (`#1178` is homed, not fixed) · RUNNING_ISSUES — **present** (`#395`, `#398` closed; `#1178` filed) · POST_AUDIT_ROADMAP, DELETED_COMPONENTS_LOG, ADJUSTMENT_FRAMEWORK — **judged N/A**: no roadmap item, nothing removed, no parameter · SPRINT_TO_LIVE_PLAN rows 1u, 52a and §6 — **present** · memory + task list — Step 10 |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_LEDGER_TAIL_DISPOSITION_PRE_AUDIT.md` at `cc2cc29e0` (APPROVED 2026-10-08) |

**Two parts, two refs.** Ledger + plan (P1, P5) on `migration/aws-supabase` at `45a442b0d`. Census code (P2, P3) on the review branch `migration/b-ledger-tail-disposition` at `26e599a2d` — NOT on `aws-supabase`. Two files, +67/−2. No untracked files in the change set.

## P2 — `census.mjs`
```js
// NEW, beside CONTRADICTS (:109)
const CONTRADICTS_WORDS = new Set(CONTRADICTS.source.match(/[A-Z]+/g));   // never CONTRADICTS.test() — `g` is stateful (C-2)

// NEW, before s1OnLine
export function tailStatusWord(line) {
  const k = line.lastIndexOf(' | ');
  if (k < 0) return '';
  if ((line.slice(0, k).match(/`/g) || []).length % 2 === 1) return '';   // the ` | ` is inside a code span
  const cell = line.slice(k + 3);
  if (/^[\s*_`]*#\d/.test(cell)) return '';                             // `#386 RETRACTED` is another issue's state (C-6)
  return statusWord(cell);
}

// parseLedger — NEW, between `reused.push` and the `:169` continue (that guard skips every OPEN-headed entry)
    if (e.words.has('OPEN') && !closed) {                                  // openR1 membership (C-1)
      for (const h of e.heads) {
        if (h.word !== 'OPEN') continue;
        const w = tailStatusWord(L[h.i]);
        if (w && CONTRADICTS_WORDS.has(w) && !selfContradicting.some((x) => x.issue === e.n)) {
          selfContradicting.push({ issue: e.n, headLine: h.i + 1, filer: filerOf(e), leg: 'tail', reason: `trailing cell carries "${w}" after an OPEN head` });
        }
      }
    }
// the existing head-leg push gains `leg: 'head'`
```
**Lists only** — `openR1`, `open`, placement and every count other than "self-contradicting N" are untouched (T8 pins it).

## P3 — `census.test.mjs` (181 passed, 0 failed; was 168)
T1 an OPEN-headed `| RESOLVED (…)` is listed · **T2 two tail hits in one parse are both listed** · T3 a ` | ` inside a code span is not a cell (+ control: the same tail without backticks reads RESOLVED) · T4 `| PARKED …`, `| OPEN …` not listed · **T5 an OPEN head + a later `✅ CLOSED` head is not listed** · **T6 `| #386 RETRACTED …` not listed** (+ control) · T7 `| **DONE** …` listed · T8 status unchanged · T9 every row has a leg · T10 no cell → '' · T11 the head leg's fixture still lists, as `leg: 'head'`.
**Mutations (each restored after):** drop the parity filter → only T3 fails · drop the `#N` skip → only T6 · `CONTRADICTS.test(w)` in place of the Set → only T2 (`901,908`: the second hit dropped) · drop the `!closed` gate → only T5. Poller suite 443/0 (Windows; 446 on Linux).

## P4 — measured on the live ledger with the new code (dry run, review-branch `census.mjs`)
- at `cc2cc29e0` (before P1): `self-contradicting sub-list (2): #395@L3099 · #398@L3102`, both `trailing cell carries "RESOLVED"`.
- at `45a442b0d` (after P1): `self-contradicting sub-list (0)`; OPEN 502 → 501 (#395 and #398 closed, #1178 filed).

## P1, P5 — the ledger (at `45a442b0d`)
- `#398` CLOSED in place, citation: `c1e5ef80c`; `parity-gate.ts:6`, `feed-health-aggregate.ts:115` `computeRollingWindowReadiness`, `feed-integrity-monitor.ts:281` (C-4's corrected pointers).
- `#395` CLOSED in place, citation: 0 of the ReferenceError in 7 daily error logs (4,016,987 lines) + `error.log`, control 6,557 `Error`; its refactor note now points at `#1178`.
- `#1178` filed with your bounded magnitude (2 exposed paths `:2337`, `:2580`; 0 fires; the microtask hop not an exposure) and the three comments incl. the tracker header (C-5). **HOME split as you ruled:** sprint **row 52a** `B-NULL-REASON-LOCAL`, CC-B, after row 52 (`B-SILENT-STRATEGY-CENSUS`, `#1070`'s strategies row — `3n.v4` is a `PHASE_19_PLAN` id, not a sprint row, so I took your alternative); after-live `B-NULL-REASON-RETURN-VALUE`, CC-B, under "Other — refactors" (217 → 218, section 77 → 78). §6: CC-B 79, Total 292, `recountS6` diffs `[]`. Handed to NEW Claude by number.

## JUDGEMENT CALLS TO ATTACK
1. The C-6 rule skips any tail cell opening with `#<digit>` — it could hide a tail like `| #1178 CLOSED this` that IS a disposition by reference. Chosen: a reference is never this entry's own state.
2. The `leg` field added to every self-contradicting row (a record schema addition; nothing reads it yet besides tests).
3. Row 52a (after row 52) instead of `3n.v4`.
