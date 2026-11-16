# B-TOKEN-WATCH-BIRTH-CAP — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Scope:** r2 `ad55cb91e` (Step 1 closed by Langston, Discord `1571687052171288577`) · **Step 2 written 2026-11-16 ~02:00Z**
**Audit first, plan second; every plan item cites the finding it falls out of. Anything with no audit treatment is marked `UNAUDITED`.**

---

## 0. PREVIOUSLY STATED vs NOW

- **PREVIOUSLY STATED:** the Helius credit cycle resets on the 27th, an unconfirmed lead (scope §1, `#1247`). **NOW:** confirmed at the vendor's own counter — `creditCycle` start **2026-10-27**, end **2026-11-27**, plan free, limit 1,000,000 (A1). **REASON:** the admin usage endpoint is reachable with our key and the project id from our own webhook object.
- **PREVIOUSLY STATED:** "runs dry ~11-20". **NOW:** *projected* about **2026-11-19 evening** — 155,583 remaining at 2026-11-16T00:44Z, at the 11-01 → 11-15 mean birth rate of 39,594/day (594,163 ÷ 15.0 days, `budget.json` at 00:01Z) plus ~1.2k/day RPC. **REASON:** remaining credits read rather than inferred. A projection, never a fact for any document (Langston).
- **PREVIOUSLY STATED (to Langston, `1571687881439838391`):** the live webhook has "NO accountAddresses". **NOW:** it does — `["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"]` (the pump.fun program). **REASON:** the LIST endpoint omits the field; the single-object GET returns it. MISTAKE: wrong-object — I read the list view as the object.
- **PREVIOUSLY STATED (scope §1, C-2):** a read-back GET is "unpriced". **NOW:** a GET costs **100 credits** (A3). **REASON:** measured.
- **PREVIOUSLY STATED (scope §4.3):** "off" by edit-to-no-match vs delete/recreate. **NOW:** a vendor pause flag exists — `active:false` on edit (A2). **REASON:** found on the object and tested.
- **PREVIOUSLY STATED (scope §5 tail):** ~8,500 births/day, from ~95k ÷ 9 days. **NOW:** recomputed at switch-on from the counter (P3); the 95k and Langston's 10,310 are not one figure (his note).

## 1. SOURCES READ (the six)

| # | source | read |
|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | `token-watch/config.py` (:92, :93, :106-121, :124-176, :323, :330-339, :360, :368, :391), `liveness.py` (:1-40, :88-97, :168-260), `ops/feed_watch.py` (:40-130), `promote.py` (:88-95), `budget.py` (:1-60, :445, :543, :563), `store.py` (:91, :338, :711), `token-watch/systemd/` (13 units) |
| 2 | runtime + vendor | staging `births/*.jsonl`, `state/budget.json`, `cold/spend-journal-*.gz`; Helius webhooks API and admin usage endpoint (A1-A5, measured 01:36-01:54Z) |
| 3 | System Impact Map | "token-watch — the launch-and-survival study, a CO-TENANT on the staging box" (`:1250-1263`) |
| 4 | System Manual | no token-watch chapter (it is not trading-system architecture); the SIM entry is the governed home. Silence here is consistent with the class, not a gap. |
| 5 | ledger | `RUNNING_ISSUES` `#1247` (cause now confirmed), `#1246` (store growth), `#1257`; `B_TOKEN_WATCH_PRE_REGISTRATION.md` `:45`, `:47`, AMENDMENTS 1-17; `DEPLOY_WINDOWS.jsonl` (one token-watch window: `B-TOKEN-WATCH-FOLLOWUP-MEMORY`) |
| 6 | provenance | `17713672b` (dead-man's switch, B-TOKEN-WATCH Step 6), scope §5.1 r2-r4 (budget), pre-registration §6 (census rule). `bridge/canonical/` predates token-watch (2026-08); no coverage, expected. |

## 2. AUDIT

### A — the vendor, measured (staging, 2026-11-16 01:36-01:54Z; key read from `/etc/token-watch/helius.env`, never argv; production body captured verbatim to `/root/birthcap/prod-webhook.json`, mode 600, before any edit)
- **A1 — the counter is readable, free and near-real-time.** `GET admin-api.helius.xyz/v0/admin/projects/<id>/usage`. Positive control before touching anything (Langston condition 1): 11 reads at 30 s, 00:48:44 → 00:53:51, nothing changed: `webhooks` +157 against +179 recorded births (88%), the RPC leg moving independently. Reach: lumpy at 30 s, so a window must be read at minutes, not seconds. The usage call itself shows no charge: `webhooks` +3 across 10 usage reads in a paused window (A4).
- **A2 — `active` is a real pause flag on EDIT, refused on CREATE.** CREATE with `active` → 400 *"property active should not exist"*. PUT with the full body + `active:false` → 200, the object then reads `active:false`, `disabledReason: "manually disabled"`, `disabledAt`. Throwaway webhooks only (no-match random address, so no events); both deleted.
- **A3 — the edit semantics (Langston condition 2).** A PUT carrying only `{"active": …}` → 400, listing `webhookURL`, `transactionTypes`, `accountAddresses` and `webhookType` as required. So an edit must carry the full body. Fields omitted from a full PUT **persist**: a PUT without `authHeader` kept it (`'throwaway-test-header'` read back), and a later PUT without `active` kept `active:false`. **Costs:** management calls including GET charge 100 each, and a refused 400 charges nothing — 17 charged calls account for 1,704 of the 1,774 credits between 01:36:24 and 01:40:07, with the other 70 being the 70 births in that span. Charges land up to ~60 s late and in lumps.
- **A4 — the live pause (Langston (A), conditions 1-4).** PUT `active:false` at **01:40:42.585Z** (the vendor's `disabledAt`); PUT `active:true` at **01:47:52Z**.
  - **Census hole:** last row before = `first_seen_at` 01:41:31.352Z (49 s of in-flight deliveries after the pause); first row after = 01:48:47.222Z (55 s after the restore). **435.9 s**, under `LIVENESS_GAP_SECONDS` 900, so no gap record and no page.
  - **Primary instrument (C-1):** counter `webhooks` 01:42:45 → 01:47:51 (5.1 min, after the pause charges settled) **+3**, births **+0**. Control, the equal window right after the restore (01:49:22 → 01:53:58, 4.6 min): **+91**, births **+114**. Paused = not charged; it discriminates.
  - **Restore criterion (condition 3):** receiver rows were seen arriving 60 s after the restore PUT, inside the 180 s wait stated in advance. The script holds the restore in a `finally`.
  - **Condition 4 (who else counts births in a window):** `DEPLOY_WINDOWS.jsonl` holds one token-watch window, `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (mine, P10). Its reads are run duration, buckets behind, store growth, `promote_retry_census` and tier. A 436 s, ~170-row hole moves store growth by ~0.1 MB and the due load by ~170 entries, and is recorded here. The other four windows (`B-DEPLOY-WINDOW-GUARD`, `B-ALERT-INSERT-CONTRACT`, `B-PRICE-SIDE-BY-JOB`, `B-DISK-FILE-TIERING`) do not read token-watch births.
- **A5 — in-flight tail and restart lag.** Deliveries keep arriving for **~49 s** after a pause and resume **~55 s** after a restore (one measurement each). A window's measured on-time is therefore the delivery span, not the PUT span — which is why the weight must be measured (ruling 3a), and why the failed-off check needs a grace period.

### B — the code census (repo-wide, tests excluded)
- **Births writer: one.** `receiver.py` → `store._append` into `store.birth_path(day)` (`store.py:91`, `:338`).
- **Births readers:** `liveness.py` (the dead-man), `promote.py`, `store.py` (census, `:711`), `summary.py`, `tools/derive_obs_window.py`.
- **Births deleter: none, by design** (tier's `NEVER_TOUCH`).
- **Schedulers (`token-watch/systemd/`, 13 units):** receiver (always on) · followup timer (hourly) · feed-watch timer (hourly) · summary timer (:12) · tier timer (04:30Z) · store-watch timer (06:00Z) · cold-offbox timer (05:30Z) · `token-watch-failed@` (on failure). **Nothing today writes the webhook object;** it was created by hand on 2026-08-28. ⇒ the controller is the first and only writer of external subscription state. Two writers would need mutual exclusion; there is one.
- **B1 — the dead-man (C-4, C-13).** `liveness.check` records a retrospective gap for any inter-row delta > 900 s (`:225`) and opens a prospective gap for silence > 900 s (`:249`). `feed_watch --mint` mints `token-watch-feed-gap` under ONE dedupe key (`:52`), and its own body says a standing row suppresses every later gap (`:97-98`). Every scheduled off window exceeds 900 s (39 min at W=12, ~4.7 h at W=4). ⇒ **without the planned-off change, the first switch-off mints a row that hides every real gap for the rest of the cycle** (Langston C-13). `_estimate_rows` (`:88-97`) would also stamp a four-figure "missed" count into `provenance/gaps.jsonl`, the record the study reads.
- **B2 — `EXPECTED_LAUNCHES_PER_DAY` read sites (C-14), five:** `config.py:120` (control inclusion design target; *"the realised probability is LOGGED DAILY … where they disagree the log wins"*, `:113-117`) · `config.py:337` (the reserve assert, passing by 875 today) · `liveness.py:48/:97` (the gap estimate) · `promote.py:95` (`MAX_CHECKS_PER_RUN`, which is inside my own open P10 observation).
- **B3 — the budget ledger** keys the calendar month (`budget._month_key`). The vendor cycle is the 27th, so the ledger's month total is not the vendor's, and its burn alarms (`BURN_WARN` 800k / `BURN_CRITICAL` 900k) fire against the wrong boundary.
- **B4 — births carry exact arrival time** (C-7 leg 1): `created_at` (chain) and `first_seen_at` on 31,363 of 31,363 rows (2026-09-02) and 50,199 of 50,199 (2026-10-05). The hour-of-day reference can be built from the rows themselves, not from the summary's approximated birth-day split. Leg 2 (excluding October's 7 blind days and 2 partial days) is applied in P7.

### C — dispositions
- `NEVER_SHED` / `SHED_ORDER` — **(1)** unchanged (scope C-5).
- The dead-man (`liveness`, `feed_watch`) — **(2)** updated: planned-off aware (P4).
- `config.py:337` assert and its `:330-336` comment — **(2)** rewritten to the cap term (P5, C-6).
- `EXPECTED_LAUNCHES_PER_DAY` — **(2)**: kept at 20,700 for its existing consumers in this batch (P5 says why); the cap uses a separate measured rate.
- The budget ledger's calendar month — **(2)** for the cap only: the cap reads the vendor cycle (P3). Re-keying the ledger's burn monitor to the vendor cycle is **`UNAUDITED` beyond B3** and is NOT in this batch — §9.4 disposition proposed in §4.

## 3. PLAN (each item → its finding)

- **P1 — the controller** (`token-watch/birthcap.py` + `token-watch-birthcap.timer`, every minute; A2, A3, B census). Each minute it computes the desired state from the day's schedule. If that differs from the last *applied* state, it PUTs the full captured body (URL, types, addresses, webhookType, txnStatus, authHeader from the known-good capture) with `active` set. The **PUT's own response is the read-back** (it returns the object), so no GET (A3: GET = 100). A response whose `active` differs from the request, or a non-200, pages. Every switch is appended to `provenance/switches.jsonl` (ruling 1c / OBJ-8) with: requested time, response time, the response's `active` / `disabledAt`, status, and credits charged. The ledger is charged 100 per switch under a new `CREDITS` kind `switch`, which joins `NEVER_SHED` (a record, not a discretionary leg). It runs as the `tokenwatch` user with read access to the captured body, never as root, and only one controller exists (a lock file; B census).
- **P2 — the schedule** (ruling 1, 1b; A5). W windows/day: switching ≤ 8% of the **gross** day allowance (cycle credits ÷ cycle days; Langston's correction): full cycle 33,333 → rule-max 13.33 → ceiling 12; this tail ~(remaining ÷ days left at switch-on) → rule-max ~4 (floor 4). Fixed on-duration per window, evenly spaced; the daily phase offset = (day-of-cycle × 0.618) mod 1 of a block. Duty fixed once per cycle at cycle start (P3); never recomputed daily.
- **P3 — the cycle and the backstop** (A1, B3; OBJ-3). At each cycle start (and once at switch-on for the tail) read the vendor usage: `creditCycle`, `creditsRemaining`. Compute, once:
  - allowance/day = (remaining − reserve 10% − RPC at its trailing 7-day rate − switching) ÷ days left;
  - duty = allowance/day ÷ the measured launch rate (trailing 7 days of recorded births, from the rows themselves — B4).
  The backstop counts recorded births today; at the allowance it switches off for the rest of the UTC day and writes a `truncated_day` record. The vendor counter is read once an hour as a cross-check (free, A1). A divergence of more than 10% from the ledger pages.
- **P4 — the dead-man made schedule-aware** (B1, C-13 — **ships in the same install as the first switch-off**).
  - `liveness` reads `switches.jsonl`. An inter-row delta or a silence that falls inside a planned off window (+60 s in-flight grace, +90 s restart grace, A5) writes a `planned_off` record to `provenance/planned_off.jsonl` (NOT `gaps.jsonl`, and carrying no `estimated_rows_missed`), and opens no gap.
  - Silence > 900 s inside an on window still opens a gap and pages, as today.
  - **Births whose `first_seen_at` is later than off-switch + 60 s grace page as a failed switch-off** (C-2(ii)). The controller checks this every minute, so detection is ~1-2 min, not hourly.
  - Mutation-tested arms: planned-off silence → no page; on-window silence → page; births in an off window → page; PUT echo mismatch → page (OBJ-4).
- **P5 — constants** (B2, C-6, C-14). Add `LAUNCHES_PER_DAY_MEASURED` (from the trailing-7-day rows, P3) for the cap math and for `liveness._estimate_rows` on on-window gaps. Leave `EXPECTED_LAUNCHES_PER_DAY` = 20,700 for `config.py:120` (design target only; the log wins) and for `promote.py:95`. Changing the latter mid-P10 would change the follow-up observation's own throughput numbers; it is named on `#1246`/P15, not moved here. Rewrite the `:337` assert as *reserve ≥ the per-cycle birth allowance × cycle days*, with the `:330-336` comment rewritten rather than stacked.
- **P6 — the pre-registration amendment** (ruling 3; OBJ-6) — AMENDMENT 18, committed before the first capped birth, carrying (a)-(e) as ruled. Weights come from `switches.jsonl` plus the measured delivery spans (A5).
- **P7 — verification instruments** (C-7, C-8). The hour-of-day reference is built from `first_seen_at` over Sep 1 → Oct 17 and Oct 28 → Nov 15, excluding Oct 18-27 (the 7 blind days, 10-20's 13 rows, and the partial boundary days 10-18 and 10-27). The pass band is pre-registered in AMENDMENT 18. OBJ-5's baseline is the 7 days before switch-on (run counts, buckets behind).
- **P8 — governance and window** (C-9, C-10). An `open` row in `DEPLOY_WINDOWS.jsonl` for this batch **in this Step-2 commit**. `PHASE_HISTORY` at Step 10. The SIM token-watch entry gains the controller as the one writer of external subscription state. A declared-`open` row in `GOVERNANCE_EXCEPTIONS` if it enters observation on a progress report.
- **P9 — install and timing** (OBJ-9). Code reviewed at Step 4. Then a staging install via `token-watch/deploy/install_storage.sh` (not `dt-deploy`; token-watch is its own installer), with P4 in the same install, before the projected run-dry (~11-19 evening).

## 4. OUT-OF-SCOPE FINDINGS — dispositions (§9.4)
- **The budget ledger keys the calendar month while the vendor cycles on the 27th** (B3): its burn alarms watch the wrong boundary. DISPOSITION: added to `B-TOKEN-WATCH-BIRTH-CAP` as P3's hourly cross-check only; re-keying the ledger itself — decision required, proposed for Kyle's list via PM (crew/tooling, likely after live).
- **The follow-up runs are lengthening** (P10 of `B-TOKEN-WATCH-FOLLOWUP-MEMORY`: 93 → 127 → 155 min for runs 3-5; the summary page alert `a299883c` therefore recurs). DISPOSITION: folded into that batch's P10 observation, which measures it. This batch reduces new births and so the due load; noted, not claimed as a fix.

`REVIEWER:` none spawned for this document — NOT RE-READ by a fresh reader; the load-bearing claims (A1-A5) are measurements with their instruments, controls and timestamps stated, for Langston to re-derive.
