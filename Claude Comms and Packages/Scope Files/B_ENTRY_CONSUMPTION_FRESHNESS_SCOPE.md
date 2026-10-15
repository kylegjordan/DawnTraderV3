# B-ENTRY-CONSUMPTION-FRESHNESS — Scope r1 (Step 1 review pending)

change-class: sub_batch

**Owner:** ANALYST Codex / CC-C

**Parent / placement:** pre-sprint P1b, the entry half of sprint row 40 `B-XSTOCK-SESSION-FRESHNESS`, in parallel with Stage 1 and before P1c.

**Issue:** `#684`

**Reviewer:** Coltrane for the Codex shift; CC-B is the named cross-lane reviewer in the pre-sprint plan.

## 1. Goal

Make book freshness true at the instant an immediate entry actually consumes the book, not merely at the earlier depth-gate read. A snapshot that passes the per-class warmth gate must still be inside that same class's governed limit after every intervening wait and immediately before the first potentially side-effecting `OrderPlacer.openOrder` call.

This is the bounded P1b repair already named in `PRE_SPRINT_SIMULATION_TRUTH_PLAN`: the engine currently captures one snapshot, then can await xStock price-discovery liveness and paper venue validation before walking the original asks. The repair is class-agnostic because the delays differ by class but the consumption seam is shared.

## 2. Decisions already made — this batch does not reopen them

1. **No freshness-threshold change.** `fill_depth_gate.warmth_max_age_ms` remains DB-governed and fail-closed: crypto `5,000 ms`, xStock `15,000 ms`. The `B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION` relaxation test was inconclusive, and Kyle's one xStock entry standard at every hour stands. No session-based loosening, risk-derived relaxation, or new hard-coded constant is in scope.
2. **The upstream xStock dispatch guard stays.** `active-dispatch.ts` rejects an already-old archived xStock quote before a signal enters the active pipeline. It answers a different question—freshness at signal dispatch—and does not replace freshness at fill consumption.
3. **Depth, liveness, VPG, and VOG retain their order and purpose.** The final consumption check follows those waits; it does not bypass or weaken any of them.
4. **The fill uses a book it has actually certified.** The default design preserves the B4b.1 single-snapshot identity and advances its age by measured local elapsed time. Step 2 may propose a replacement read only if the replacement is fully re-gated for warmth, side validity, depth sufficiency, and order/venue equivalence; silently swapping in a new book is forbidden.
5. **Pending maker fills are not this seam.** A maker order that is left resting consumes no depth snapshot at placement. Its later-tick fill-age and quote-arrival contract belongs to P1c's named `[C3]` precondition. A maker-marketable-to-taker fallback does fill immediately and is inside this batch.

## 3. Architectural read

The required direct reads were `SYSTEM_IMPACT_MAP` §9.14 and §9.14c, `SYSTEM_MANUAL` P19-B4b.1 and the xStock liveness section, plus the current engine, depth-source, config, order-port, liveness, and venue-validation code.

### 3.1 Current path and the defect boundary

1. `ActiveExecutionEngine._evaluateOpenDepthGate` resolves `fill_depth_gate`, fetches one `DepthSnapshot`, applies warmth and ask-side sufficiency, and returns the snapshot for later use.
2. `DepthSnapshot.ageMs` is a number evaluated only when the snapshot is fetched. Crypto derives it from the in-process WS book's last update; xStock derives it in SQL as database `NOW() - captured_at`. The object carries no later-age function or elapsed-time anchor.
3. After the gate, xStock awaits `evaluateXstockPriceLiveness`. The shared path then performs maker marketability handling and, in paper mode, VPG size normalization plus `validatePaperOrderWithVenue`; VOG is an asynchronous network round-trip for mapped Kraken pairs and a visible skip where no oracle exists.
4. An immediate taker or maker→taker fallback then calls `orderPlacer.openOrder` with `_gate.snapshot.asks`. No existing check adds the elapsed waits to `_gate.snapshot.ageMs`.
5. `OrderPlacer` is the single paper/live swap seam. The guard therefore must run before the call, not after a paper-only pure walk: a future/live implementation may place a real order as its side effect.
6. A non-marketable maker becomes a pending position without calling `openOrder`; it is excluded from the immediate-fill check and remains governed by the later pending-maker contract.

### 3.2 Existing evidence fields and observability

- `closed_trades.entry_book_age_ms` deliberately means **depth-gate-time age**, not fill-time age. `B-EXIT-BOOK-AGE-STAMP` corrected the schema/code comments after proving that three awaits can sit between that stamp and the walk. This batch must not repurpose or overwrite it.
- The admitted immediate-fill record needs a separately named consumption/fill age so the old gate-time and new consumption-time facts cannot be confused. Step 2 chooses the exact schema/API name and propagation path.
- A consumption refusal happens before a trade row exists. It must be loud and separately attributable in the existing `recordOpenFailed`/depth-gate telemetry. Durable per-attempt refusal storage remains owned by Stage-4 `#1083`; this sub-batch must not duplicate that larger instrument.

### 3.3 Blast radius

**High at the engine, narrow in surface.** The change is on the active immediate-open path for both `crypto_spot` and `xstock_spot`, immediately before the single order-placement boundary. A bad placement can either admit a fill on obsolete evidence or block all entries. Downstream position, closed-trade, risk, learning, and broadcast writes are unchanged and occur only after the guard. The depth snapshot/type change is shared by both classes; liveness and venue-validation implementations are read/called but not redesigned.

## 4. Provenance read (Step 1.b)

**Corpora searched:** `BATCH_CATALOG`, the P19-B4a/B4b.1/B6.6/B7.2c/B8.5 completion and scope records, `RUNNING_ISSUES #684`, `B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION`, `SYSTEM_IMPACT_MAP`, `SYSTEM_MANUAL`, `PRE_SPRINT_SIMULATION_TRUTH_PLAN`, unrestricted `git log -S` history for the gate/liveness/VOG/pending-maker symbols, and the current source/tests. The active engine's former `paper-execution-engine.ts` name was included through unrestricted history.

### 4.1 Tier 1 — behavior this batch changes

| surface | verbatim introducing/deciding evidence | intent and disposition |
|---|---|---|
| **xStock dispatch freshness gate** | `df00c27c89fcc69901f27c01e9012db34ca0f0a8`: *“xStock fill-safety gate (freshness 15s + liquid-fill-window RTH + silent-stall watchdog), DB-resolved fail-closed”*. `RUNNING_ISSUES #684`: *“RULE-24 DISPOSITION: (2) WORKING AS DESIGNED, UNADDRESSED — decision needed, NOT a defect fix.”* | **(1) still relevant and correct.** Preserve it as the earlier dispatch-time screen. The withdrawn mixed-window 59.6% headline is not evidence for a threshold change; the later RTH replication was 23/480 (4.8%), and the registered relaxation proof was inconclusive. |
| **fill-time depth snapshot, warmth gate, and same-snapshot walk** | `b74526dc36698749188baa4579cfa500d2a2d03d`: *“depth-source.ts (per-class fill-time depth: crypto WS book / xStock ticker top-of-book + warmth/sufficiency assessors + observable block counter)”* and *“engine open seam: 24/5 depth gate before fill”*. The same commit says the engine passes the book to the depth walk. | **(2) relevant but needs updating to today's intent.** Single-snapshot identity and per-class config stay; the age contract must cover the elapsed interval until consumption. |
| **entry depth-age provenance** | `279f4c2c6e5ce20dfe713031dd57df83a2738059`: *“entry_book_age_ms called itself the fill instant when it is the depth-gate reading, three awaits earlier.”* | **(2) relevant but needs updating.** Preserve the gate-time fact and add a separately named consumption-time fact; never rename the old value into a claim it did not measure. |
| **shared consumption seam before `OrderPlacer.openOrder`** | `b74526dc36698749188baa4579cfa500d2a2d03d`: *“order-placer.ts: flat 0.05% slippage REPLACED by depth-walk”*. `SYSTEM_IMPACT_MAP` §9.14 calls `OrderPlacer` *“the single typed order-placement boundary every order passes through.”* | **(2) relevant but needs updating.** Keep the port and walk; add a fail-closed precondition immediately before the call so both paper and future/live placers receive only a still-fresh snapshot. |

### 4.2 Tier 2 — called, preserved, or explicitly excluded

| surface | original intent | disposition |
|---|---|---|
| **xStock price-discovery liveness** | `2398702e821b1bdf2d22b37e156785fb60798029`: *“xStock price-discovery-liveness fill gate (#236) — open-seam gate after depth, 45min window, fail-closed.”* | **(1) still relevant and correct.** Its wait remains; the final warmth check follows it. |
| **VPG/VOG paper validation** | `adf06d028f78dc0da3d1f5c594a485f389b5910e`: *“Kraken validate=true vetting leg (paper-only, conservative classifier, precision from pair metadata, visible skips).”* | **(1) still relevant and correct.** VPG still establishes expressibility, VOG still asks acceptance, and consumption freshness is checked afterward. |
| **pending-maker lifecycle** | `b48aef51ff36085af438acf56d847efe1d6c654f`: *“maker-chosen promotion -> PENDING open trade holding a slot; fills ONLY on honest side-aware trade-through.”* | **(5) disconnected from the immediate depth-walk and should stay disconnected here.** Later fill timing belongs to P1c/[C3]; only its marketable→taker fallback enters this batch. |
| **depth and venue refusal telemetry** | B4b.1 introduced the observable depth-gate block counter; B8.5 made definitive venue rejections counted and visible. | **(1) still relevant and correct.** Reuse and distinguish; do not build Stage-4 `#1083` early. |

### 4.3 Provenance conclusion

Rule-24 outcome **(3): legacy no longer fits today's complete intent**, narrowly. The original one-fetch/same-book design was intentional and remains the right identity rule, but its freshness proof stopped at the gate while later approved waits were inserted before consumption. The fix is to extend the existing freshness contract across that elapsed interval, not to loosen the threshold, remove the waits, or fetch an unvalidated replacement book.

## 5. Numbered objectives and verification criteria

| # | objective | verification criterion |
|---|---|---|
| **1** | **Give every `DepthSnapshot` a non-fabricated way to age after capture.** Preserve `ageMs` and source semantics while carrying a local elapsed-time anchor sufficient to compute a conservative current age. Do not manufacture a venue observation timestamp as `Date.now() - ageMs`. | Pure tests prove the consumption age equals gate age plus non-negative elapsed time, never decreases on wall-clock movement, and remains class/source explicit. xStock query time is conservatively covered; crypto reads remain in-process. A mutation that freezes the gate age fails. |
| **2** | **Fail closed at the shared immediate-fill consumption boundary.** Re-resolve/use the same class config and compare current snapshot age immediately before `openOrder`, after all liveness/VPG/VOG waits and before any order side effect. | Engine tests show a snapshot fresh at the first gate but stale after an injected xStock-liveness delay is refused; the same for a crypto venue-validation delay. Boundary−1 ms and boundary pass, boundary+1 ms refuses, using each class's existing DB value. `openOrder` is not called on refusal. Missing config also refuses. |
| **3** | **Cover every immediate arm and exclude the later-fill arm precisely.** Direct taker and maker-marketable→taker fallback use the final check in paper and live/shared mode; a genuinely resting maker does not claim to have consumed the depth book. | Branch tests assert both immediate arms pass through one helper/check, including a side-effecting fake live placer; pending maker placement does not emit a false consumption-age stamp and retains its existing lifecycle. A source fence prevents a second immediate `openOrder` call from bypassing the check. |
| **4** | **Keep one book identity from gate through fill.** The ask levels walked must be the levels whose source, sufficiency, and current age were certified. | Identity/mutation test changes a second available book after the gate and proves the engine either walks the certified original or, if Step 2 approves a replacement, re-runs the full contract before use. A blind late re-fetch or asks-array substitution fails. |
| **5** | **Make the outcome observable without rewriting history.** Admitted immediate fills retain gate-time `entry_book_age_ms` and add a distinct consumption-age fact; refusals use a distinct typed/reason token through the existing open-failed and depth-block surfaces. | Migration/schema/API readback if a column is added; admitted fixture contains both ages with consumption age ≥ gate age. Refusal fixture produces one attributable reason and no trade/position write. Existing pre-cutover and pending-maker rows remain honestly NULL for the new fact. |
| **6** | **Prove no threshold, session, or adjacent-path drift.** | Config census at the implementation ref shows crypto 5,000 ms and xStock 15,000 ms unchanged and DB-resolved; source/test fence finds no new freshness literal. The upstream xStock dispatch guard, liveness policy, VPG/VOG classifier, depth sufficiency, exit fills, RTB refresh, and P1c pending-maker behavior remain unchanged. |
| **7** | **Verify promptly without a calendar hold.** | Step 7 uses (a) deterministic delay mutations as the positive control that the detector can catch an expiry, and (b) the first bounded post-deploy immediate-open population that reaches the new seam, reporting attempts by class/arm and every pass/refusal reason. Zero natural expiry is reported only with a positive opportunity count. No five-session/eight-day observation window is created, and unrelated reviewed deploys remain allowed. |

## 6. Non-goals

- No change to `active_fill_max_age_ms`, `fill_depth_gate.warmth_max_age_ms`, session rules, or the one-standard-at-every-hour decision.
- No removal or relocation of the upstream xStock dispatch guard.
- No change to depth sufficiency, min levels, beyond-depth penalty, liveness classification, VPG rounding, or VOG reject/skip policy.
- No RTB admission/refresh change; P1a owns that lane.
- No pending-maker later-fill fix, maker/target fill-mode switch, or `[C3]` implementation; P1c owns those and remains strictly later.
- No exit freshness/fill change and no alert-notification redesign; those remain in their placed batches.
- No duplicate durable refusal archive; Stage-4 `#1083` owns the general durable open-failure instrument.

## 7. Dependencies and stopping conditions

1. The implementation must rebase on the current shared branch before Step 3 because CC-B owns adjacent P1a code and is the named cross-lane reviewer.
2. Step 2 must choose a monotonic/conservative elapsed-time representation that does not fabricate venue timestamp precision and must state how xStock database-query latency is bounded.
3. If the design requires a replacement snapshot rather than aging the certified snapshot, stop for reviewer approval with the complete re-gating and venue-equivalence argument.
4. This batch may deploy while `B-XSTOCK-BAR-AVAILABILITY` and `B-PRICE-FEED-TRUTH` observation/event waits continue. Those waits are evidence gates for their own batches, not a global deployment freeze.
