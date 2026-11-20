# B-ENTRY-GATE — P7 xStock week read (items 1-7), 2026-11-20

Owner CC-B. Alert `7de9caf9-c0b8-45c3-927d-678764c48b0f`. Window **2026-11-13T21:04Z → 2026-11-20T21:04Z** (increment B deploy `77f6fd5984aeb42a2c3a319dba32b116ca49b28b` + 7 days). Predictions and decision rule: `B_ENTRY_GATE_P7_XSTOCK_PREDICTION.md` (unchanged; quoted where scored). Read by hand from the staging PM2 logs; extracts frozen on staging at `/root/b-entry-gate-week-read-20261120/` (`extract_at=2026-11-20T21:05:32Z`, `pm2_restart=710`). Scripts: CC-B scratchpad `p7.py` (items 1-5), `p7b.py` (6-7), `p7c.py` (missing hours), `p7d.py` (deploy segments).

**What this asks Langston:** the second pass on the week (progress report §7 item 6), and two rulings — §8 (the seed) and §9 (the P2 live switch). **No row is written and no code is changed before that.**

## 1. Instrument bound — restarts, deploys, lost hours

**12 restarts inside the window (699–710).** Each loses up to one partial hour of `PRICED_SHARE_HOUR` counts (in-memory, `ready_to_buy_service.ts:1346`).

| restart | full sha | process start (UTC) | xStock hour affected |
|---|---|---|---|
| 699 | `9591ba8c22d2c0fb9adfd822d85462709e211ef9` | weekend | none (venue closed) |
| 700 | `415b3051f92f8fa315bacaf930b48c0a3b71ca0f` | weekend | none |
| 701 | `65132e2eb5f86a3098bb0997a7bbbb91a47ae0dc` | weekend | none |
| 702 | `cc1a1c2df5180617dda4f55681d3d9410610fde5` | weekend | none |
| 703 | `7c5b45c67cd943b577db7475eb00e006508a989c` | weekend | none |
| 704 | `f8fc531535541d8e5f47a54d9a45371bb07b7c51` | 11-15 03:09:44 | none |
| 705 | `3e2504129d2d03983354e9a75a355cf31ef4e77d` | 11-15 04:22:40 | none |
| 706 | `84eeb168ef8656fc9dc5d0e757c0a1afc8776b48` | 11-15 11:05:20 | none |
| 707 | `8fac86e5e33e34415a1ab21f309d3ffaf7275ac7` | 11-16 03:38:52 | 11-16 03Z (already inside a no-line run) |
| 708 | `8fac86e5e33e34415a1ab21f309d3ffaf7275ac7` | 11-16 06:08:13 | 11-16 06Z (already inside a no-line run) |
| 709 | `ecbdf882eec9ecf1e85904139b11b364eda230fa` | 11-20 00:03:49 | 11-20 00Z (partial; the hour line is present) |
| 710 | `85e7ce63893f614e318ab75ba5c0f295fc9a27e0` | 11-20 07:59:18 | 11-20 07Z |

**Unrecoverable:** 11-13 21:04Z → 11-14 01:00Z (Friday after-hours). The out log holding it has rotated away; that span is not in the read.

**Hours with no xStock line: 31** — 11-16T01..13, 11-17T11, 11-17T13, 11-19T23, 11-20T01..14, 11-20T20. The line prints only when a queued row passes in that hour. **Positive control:** crypto lines are present in every one of those hours except 11-20T07 (restart 710), so the refresh was running and xStock simply had nothing queued. These hours add nothing to either side of any share; they shrink the overnight sample. Why the two long overnight runs had no queued xStock rows was **not investigated**.

**Error-log control:** `REPRICE_UNRESOLVED` = 0 in every error log of the window (9 files); the same scan's positive control (`control_any`) is 353,129–1,224,600 lines per file, and `control_entrygate` totals 5, so the scan reaches the right lines.

**DST.** Item 1 states the session as 13:30–20:00Z. After the 11-02 US clock change the regular session is **14:30–21:00Z**. Both are computed; the bound is scored on the text as written and the true session is shown beside it.

**Deploy splits (prediction file, "A deploy boundary inside the read").** No row survives before `3e2504129` (all pre-split time was weekend or the rotated span). Later deploys, by files touched on the priced/unpriced, birth-price and window path (`rtb-retirement-ask.ts` and its imports, `signal_quality_evaluator.ts`, `signal-orchestrator.ts` birth path, `ready_to_buy_service.ts`): `84eeb168e→8fac86e5e` changes a book-state comment only, its engine change is exit-side; `ecbdf882e`, `85e7ce638` touch scripts, archive and alerts only. Per segment:

| segment | span | night (21–08Z) | other | session (true) | shadows | P6 lines |
|---|---|---|---|---|---|---|
| A `8fac86e5e` | 11-16 06:08Z → 11-20 00:03:49Z | 4232/10850 = 39.0 % | 2020/2902 = 69.6 % | 16819/16823 = 100.0 % | 2 | 21 |
| B `ecbdf882e` | → 11-20 07:59:18Z | 3/3 (one hour) | — | — | 0 | 0 |
| C `85e7ce638` | → window end | — | — | 43/43 (5 hours) | 1 | 1 |

Segment A carries the week; B and C agree with it where they have data. Pooled figures below.

## 2. Item 1 — hour shape: **HOLDS**
> "During the US regular session (13:30–20:00Z, Mon–Fri, non-holiday) at least 95 % of xStock passes are priced. Between 21:00Z and 08:00Z at most 40 % are priced."

| band | priced / passes | share |
|---|---|---|
| session as written (hours 14–19Z, fully inside 13:30–20:00) | 13277 / 13324 | **99.6 %** (≥ 95 % ✅) |
| session, true (hours 15–20Z) | 16862 / 16866 | 100.0 % |
| night 21–08Z | 4235 / 10853 | **39.0 %** (≤ 40 % ✅) |
| other hours, as written / true | — | 87.0 % / 69.6 % |

85 xStock hour lines, no duplicates. The night bound holds with one point to spare.

## 3. Items 2–4 — symbols
- **Item 2 (group "let through", ≥ 50 % overnight):** scored on **2 of 10** — AVGO 33/33, MU 151/153 (99 %); both hold. The other 8 are UNDERPOWERED (< 20 overnight passes).
- **Item 3 (group "refused", ≤ 20 % overnight):** **0 of 14 scored** — all UNDERPOWERED. Two unscored readings point the other way: FE 7/13 (54 %), A 8/13 (62 %).
- **Item 4 (separation ≥ 20 points):** **UNSCOREABLE** — group 3 has no scored member.

## 4. Item 5 — session: **HOLDS**
> "In session, no symbol in either group falls below 90 % priced."

No group-2 or group-3 symbol is below 90 % in session (as written or true). Outside the groups, two symbols dip in the as-written band only — SYK 197/219, TJX 10/19 — and none in the true session.

## 5. Item 6 — EntryWindow, judged arm, xStock
`[P2][ENTRY_WINDOW_HOUR]` totals over the window:

| phase:class | skip_maker | judged_pass | shadow_would_refuse | skip_price_refused | skip_mode_absent |
|---|---|---|---|---|---|
| birth:xstock_spot | 811 | 90 | 3 | 17 | 0 |
| refresh:xstock_spot | 22845 | 250 | — | 7504 | 22 |
| birth:crypto_spot | 5921 | 0 | 0 | 5286 | 0 |
| refresh:crypto_spot | 5147 | 0 | — | 6647 | 0 |

- **Birth would-refuse: 3 / 921 births = 0.33 %; 3 / 93 judged = 3.2 %.**
- Refresh is already live (the shadow flag is birth-only, `signal-orchestrator.ts:1330`): 250 judged, **0** refresh `SQE_REVALIDATION_FAIL` with reason `EntryWindow:`.
- Crypto: judged arm **UNEXERCISED** (maker_only — no taker-chosen plan reaches it).

**The three shadow refusals, checked against their own logged numbers** (price > planEntry + 0.25 × (planEntry − planStop)):

| time (UTC) | symbol | price | threshold | holds |
|---|---|---|---|---|
| 11-18 14:53:58 | ORLY | 92.67 | 92.44 + 0.25 × 0.6718 = 92.608 | ✅ |
| 11-18 23:51:09 | SKHY | 123.94 | 123.6735 + 0.25 × 0.9609 = 123.914 | ✅ |
| 11-20 16:05:46 | DRI | 230.92 | 230.6 + 0.25 × 1.0425 = 230.861 | ✅ |

No refusal fails its arithmetic.

## 6. Item 7 — P6, taker arm, xStock
- **22** `[P6][REPRICE:paper]` lines for xstock_spot: all `admitted=false`, `mode=none`, `reason=no_admissible_arm` (`windowRefused` true 20, false 2). **Taker arm UNEXERCISED** — no xStock row was re-priced to it.
- Spread: 11-16 ×5, 11-17 ×3, 11-18 ×5, 11-19 ×8, 11-20 ×1 (first 11-16 16:07:06Z, last 11-20 19:13:09Z).
- `REPRICE_UNRESOLVED`: 0 (§1 control).
- **A-4 numerator, per class:** xStock 22 refresh deletions whose only failure is `NetEV` at the ask, against 23117 xStock priced passes = **0.095 %**. Crypto: 0 NetEV-only, against 6605 priced passes. All 35 `SQE_REVALIDATION_FAIL` lines in the window = 22 NetEV (xStock) + 12 RegimeWeight (xStock) + 1 RegimeWeight (crypto).
- ⚠️ **The pre-audit's Step-7 INVESTIGATE line fired** (`B_ENTRY_GATE_PRE_AUDIT.md:138`: "INVESTIGATE if they exceed the RegimeWeight deletions, or if the queue's median size halves"): **22 NetEV > 12 RegimeWeight** on xStock. What the look found: the 22 are 21 distinct symbols (SNDK twice), every one `NetEV < 0 (chosen taker mode — non-positive net expectancy after friction)` at the fresh ask, values −0.0021 to −0.806, median about −0.08 — the designed OBJ-6 eviction stream (net EV re-decided at the live ask), not a malfunction. Part of why the ratio tripped is that RegimeWeight deletions fell: 41 over ~1.5 days in the pre-batch baseline (both classes) against 13 over this week. **The queue-size half of the trigger was NOT measured** — no pre-batch xStock queue-size record exists to compare to. Reported for Langston's ruling, not dismissed.
- Symbol sets: 229 xStock, 37 crypto; only STX/USD in both (0 STX failures).

## 7. Against the decision rule, as written
> "**1 and 5 hold:** seed `xstock_spot` at the crypto value, **300000 ms** … **2–4 also hold:** the overnight refusals land on thin names, and that is stated in the seed's record as the expected cost. **Any of 1–5 fails:** the seed goes back to Langston with the record before any row is written."

Items 1 and 5 hold. Items 2–4 did **not fail and did not hold**: 22 of 24 named symbols are UNDERPOWERED, which the file defines as "reported, not scored", and item 4 cannot be computed. So:
- the 300000 ms clause is met;
- the "expected cost" sentence is **not** written — the thin-names story is **UNPROVEN** on this week, and the two unscored group-3 readings (FE, A) lean against it;
- item 4's own fallback ("set from the class-level hour shape alone, one value for the class") gives the same single value, so the seed does not depend on how item 4 is read.

## 8. Ruling asked — the seed
**Proposed:** write `module_constants (entry_gate, *, xstock_spot, *, *, promotion_price_max_age_ms) = 300000`, recorded as **PREVIOUSLY: absent (xStock unseeded — crypto seeded 300000 on 2026-11-13). NOW: 300000. REASON: P7 items 1 and 5 held; symbol story unproven.** Ask: does UNDERPOWERED-not-failed read as above, or does the file's "any of 1–5 fails" reach an unscoreable item?

## 9. Ruling asked — the P2 live switch (C-2)
The C-2 gate: "at ≤25 % after one full session per class, opens the live switch with Langston." xStock: 0.33 % of births (3.2 % of judged) over a full week — **met**. Crypto: the judged arm was never reached — **not met, UNEXERCISED**, not passed.

**The switch is code, not a row:** `entryWindowShadow: true` is hard-coded at the birth SQE call (`signal-orchestrator.ts:1330`), one flag for both classes. Flipping it globally would change only xStock today (crypto is maker_only), but would open crypto unread the day its fill policy changes. **Proposed:** a small increment C under this batch — replace the literal with a per-class DB setting (`entry_gate / <class> / entry_window_birth_live`, fail-closed: absent ⇒ refused, never assumed, as `:340` already does for the window itself), seeded xStock = live, crypto = shadow until its judged arm has its own session read. Full workflow (Step 3 → 8). Ask: increment C as described, or flip the literal for xStock-only some other way?

## 10. Honest residual
- The read covers 11-14 01:00Z → 11-20 21:04Z; the first four hours are lost to log rotation.
- 31 xStock hours carry no queued passes; the cause of the two long overnight runs is not established.
- Items 2–4 are mostly unscored; nothing here supports or refutes the per-symbol story.
- The taker arm (item 7) and crypto's judged arm (item 6) were not exercised; nothing is claimed about them.
