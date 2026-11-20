# B-ENTRY-GATE (#1224) — STEP 2 PLAN + STEP 4 CHANGE LIST, INCREMENT C (the birth EntryWindow switch, per class)

> **Status: written 2026-11-20 ~21:50Z by CC-B.** Authority: Langston's ruling (b), 2026-11-20T21:31:45Z, on the P7 week read (`Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_WEEK_READ.md` §9 and §11) — *"APPROVED as its own Steps 3→8"*. The same push carries ruling (a), the xStock price-age seed. The commit sha is named in the dispatch (it does not exist while this file is written).
> change-class: sub_batch (an increment of B-ENTRY-GATE, whose scope r4 declared `architecture`; the doc-set at close is graded at the batch's class).

## 1. Why (the audit this plan falls out of)
| # | finding | source |
|---|---|---|
| F-1 | EntryWindow at birth ran in its own shadow because the birth magnitude was unknown (pre-audit A-2). The C-2 gate — *"at ≤25 % after one full session per class, opens the live switch with Langston"* — is now **met for xStock**: 3 would-refuse of 921 births (0.33 %), 3 of 93 judged (3.2 %), over a full week. | week read §4, §9; Langston second pass |
| F-2 | **Not met for crypto: UNEXERCISED, not passed.** Crypto is maker-only and EntryWindow judges only a taker-chosen plan, so its judged arm was never reached. | week read §5, §9 |
| F-3 | The switch was code, not a setting: `entryWindowShadow: true` hard-coded at the birth SQE call (`signal-orchestrator.ts:1330` at `9a3b34192`), one flag for both classes. Flipping it would open crypto unread the day its fill policy changes. | week read §9 |
| F-4 | **Direction for a missing setting is SHADOW.** Langston: absent ⇒ refused (as `:340` does for the window VALUE) would refuse every birth. The window value's own fail-closed path is a different object and is **unchanged**. | ruling (b) |

## 2. The plan → what was built
| item | what | falls out of |
|---|---|---|
| C-1 | `resolveBirthEntryWindowMode(assetClass)` in `server/core/filters/signal_quality_evaluator.ts`: reads `entry_gate.entry_window_birth_live` for that class (exchange/strategy/regime `*`). **Only boolean `true` ⇒ `live`.** `false` ⇒ `shadow_off`; no row ⇒ `shadow_absent`; any other value (the string `"true"`, `1`) ⇒ `shadow_invalid`, logged as an error; a cold cache (the read throws) ⇒ `shadow_unresolved`, logged as an error. Each non-live mode prints **one line per class per process** (`[B-ENTRY-GATE][INC_C][BIRTH_LIVE_OFF]` / `[BIRTH_LIVE_UNRESOLVED]`). | F-3, F-4 |
| C-2 | `signal-orchestrator.ts` birth call: `entryWindowShadow` = `resolveBirthEntryWindowMode(sqeAssetClass) !== 'live'`, read **per signal, per class** — never one class-independent value. | F-3 |
| C-3 | Migration `2026-11-20-b-entry-gate-inc-c.sql` (+ rollback, + MANIFEST): `xstock_spot = true`, `crypto_spot = false`, `updated_by = b-entry-gate-inc-c`, `ON CONFLICT DO NOTHING` on the six-column key, a DO-block that refuses unless both rows hold. Rollback deletes by `updated_by` ⇒ both classes back to shadow. | F-1, F-2 |
| C-4 | Ruling (a), same push: `2026-11-20-b-entry-gate-xstock-price-age.sql` (+ rollback, + MANIFEST) seeds `entry_gate.promotion_price_max_age_ms` for `xstock_spot` = 300000. Its record states items 2–4 UNSCORED, the thin-names cost UNKNOWN, FE 7/13 and A 8/13 leaning against, the `#1224` residual (≥ 20 overnight passes per named symbol), and the behavioural consequence: **an overnight xStock row stops being promoted unless priced inside the last 5 minutes; nothing is ever deleted by it.** | ruling (a) |

**Unchanged, stated:** `applyPlanGates` and its window-value read (`:340` path — a missing window value while enforcing still refuses as `settings_unresolved`); the refresh, which already enforces EntryWindow; crypto's behaviour (shadow, as before).

## 3. What changes for a trade
**A birth refused by EntryWindow never reaches the RTB queue** — the refusal is pushed into the SQE failures at birth, so the signal is dropped there instead of being queued and later evicted at refresh. For xStock this moves ~3 refusals a week from the refresh to the birth; it does not create a new refusal reason.

## 4. Tests — `server/tests/unit/b-entry-gate-inc-c.test.ts` (6, all green)
1. row absent ⇒ shadow, never a refusal; the line prints once per class per process;
2. `false` ⇒ shadow;
3. `true` ⇒ live: the same birth is refused (`EntryWindow` pushed);
4. a non-boolean (`"true"`, `1`) ⇒ shadow, logged as an error;
5. a cold cache (`clearModuleConstantsCache()`, the read throws) ⇒ shadow, logged as an error;
6. **per class:** xStock `true` while crypto has no row ⇒ xStock refuses, crypto stays shadow. **Mutation-verified:** replacing the class in the read with a fixed class turns test 6 red.

Local: `node scripts/check-tsc-baseline.mjs` at the baseline; inc C + inc B test files green (re-run before the commit, figures in the dispatch). CI 4/4 per job at the pushed sha is the authority.

## 5. Questions for the reviewer
1. Is `shadow_invalid` (a row present but not boolean `true`) right as SHADOW + error line, rather than refused? It follows ruling (b)'s direction (an unusable switch never refuses).
2. The resolver is read on every birth (a cache read, no I/O). The once-per-class line means a later row change from `true` to absent prints at the first birth after it; a change between two non-live modes of the same kind prints nothing. Acceptable?

## 6. Step 7 — pre-registered here, before the deploy
- **Read object:** `[B-ENTRY-GATE]` birth EntryWindow outcomes from the tally (`getEntryWindowTally`, `phase = birth`) and the error/out logs, **per class**, over the **first full xStock session after the inc-C deploy** (the venue reopens Sunday 11-22 ~01:00Z; the read covers through Monday 11-23 21:00Z, the end of the US regular session).
- **Carrier key (amended r2, Langston Step-4 condition 2):** after the deploy an xStock birth refusal tallies **`birth:xstock_spot:judged_refuse`** and prints `[B-ENTRY-GATE][P2][ENTRY_WINDOW_REFUSE:birth]` (condition 1). **`birth:xstock_spot:shadow_would_refuse = 0` is an EXPECTED STRUCTURAL ZERO** — the shadow arm is that key's only writer and it cannot run for a live class — so it is evidence of nothing. Its positive control is the three pre-window rows the week read counted (ORLY 11-18 14:53:58Z, SKHY 11-18 23:51:09Z, DRI 11-20 16:05:46Z).
- **Cost of birth enforcement (folded, Langston Step-4):** for each in-session xStock birth refusal, whether that (symbol, strategy) later opened a paper position inside the window. A refused birth never queues, so it loses its chance to pass at refresh; refresh judged 250 with 0 `judged_refuse` all week. This is the number that separates "protecting" from "blocking".
- **Expected:** xStock ≈ 3 refusals a week, ≈ 3.2 % of judged births. **INVESTIGATE if refusals exceed 25 % of judged xStock births in that session.** Crypto: zero refusals (shadow); its `BIRTH_LIVE_OFF mode=shadow_off` line present once per process.
- **Controls:** the xStock `BIRTH_LIVE_OFF` line must be ABSENT (it is live); the migration DO-block result in the deploy log; both rows read back with `dt-sql`.
- **Seed (C-4):** xStock `unpriced` promotion refusals per hour, night vs session, from the existing `[P7]` lines — the behavioural consequence above, observed.
- **Window row:** `1-system-manual/DEPLOY_WINDOWS.jsonl`, batch `B-ENTRY-GATE`, owner `cc-b`. A restart inside the session, or a rollback past inc C, disturbs it.

## 7. Files
`server/core/filters/signal_quality_evaluator.ts` · `server/services/signal-orchestrator.ts` · `server/tests/unit/b-entry-gate-inc-c.test.ts` (new) · `drizzle/migrations/2026-11-20-b-entry-gate-inc-c.sql` + `-rollback.sql` (new) · `drizzle/migrations/2026-11-20-b-entry-gate-xstock-price-age.sql` + `-rollback.sql` (new) · `drizzle/migrations/MANIFEST.txt` · this file · `1-system-manual/DEPLOY_WINDOWS.jsonl` · the week read (Langston's corrections).
**Step-4 r2 conditions (Langston PROCEED, Discord 1573463754962632838):** (1) `signal_quality_evaluator.ts` — the live refusal prints `[B-ENTRY-GATE][P2][ENTRY_WINDOW_REFUSE:<phase>]` with the shadow line's fields, + a test (9 tests in the inc-C file); (2) §6 carrier, structural zero and positive control, above; (3) two stale texts that said xStock is unseeded — `server/core/rtb/ready_to_buy_service.ts` (comment at the promotion price-age read) and `server/tests/unit/b-entry-gate-priced-pass.test.ts` (title only, assertions unchanged); plus the folded cost line in §6.
