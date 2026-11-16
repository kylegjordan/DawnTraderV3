# B-TOKEN-WATCH-BIRTH-CAP — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r2)

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Scope:** r2 `ad55cb91e` (Step 1 closed by Langston, Discord `1571687052171288577`)
**r1 → r2:** Langston SENT BACK r1 (`102940515`, Discord `1571708212506263694`): 4 blocking, 8 conditions and 4 answers. Each is applied below and marked `[L-n]`.
**Audit first, plan second; every plan item cites its finding; anything with no audit treatment is marked `UNAUDITED`.**
**Evidence staged for re-derivation [L-A1..A5]:** `/home/langston/inbox/B-TOKEN-WATCH-BIRTH-CAP/` (Helsinki) holds:
- `c1.out` — the untouched counter control;
- `throwaway.out` and `throwaway2.out` — the semantics tests;
- `livepause.out` and `livepause.log.json` — the live pause, with every PUT/response pair and its clock;
- `c7_coverage.json` — per-day row and `first_seen_at` counts, and hour counts by month.
They were scanned for the Helius key and the receiver secret before copying: 0 hits each. The scan's positive control found each secret in its own source file (1 hit each).

---

## 0. PREVIOUSLY STATED vs NOW

- **PREVIOUSLY STATED:** the credit cycle resets on the 27th (an unconfirmed lead). **NOW:** confirmed at the vendor counter — `creditCycle` **2026-10-27 → 2026-11-27**, plan free, limit 1,000,000 (A1). **REASON:** the admin usage endpoint is reachable with our key.
- **PREVIOUSLY STATED:** 33,333 credits/day for "the full cycle". **NOW:** this cycle is **31 days = 32,258/day**; the next (11-27 → 12-27) is 30 days = 33,333/day [L-11]. W=12 holds for both (rule-max 12.9 / 13.3).
- **PREVIOUSLY STATED:** mean 39,594 births/day. **NOW:** **39,611** (594,163 ÷ 15.0) [L-11]. **REASON:** arithmetic slip.
- **PREVIOUSLY STATED:** "runs dry ~11-20". **NOW:** *projected* ~**2026-11-19 evening** — 155,583 remaining at 2026-11-16T00:44Z, at 39,611/day + ~1.2k/day RPC. A projection, never a fact for any document.
- **PREVIOUSLY STATED (to Langston, `1571687881439838391`):** the live webhook has "NO accountAddresses". **NOW:** it does — `["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"]`. **REASON:** the LIST endpoint omits the field; the single GET returns it. MISTAKE recorded on `102940515`.
- **PREVIOUSLY STATED:** the read-back GET is unpriced. **NOW:** a GET = **100 credits** (A3).
- **PREVIOUSLY STATED (r1 §C):** `NEVER_SHED` unchanged. **NOW:** it gains `switch` — disposition (2) [L-2].
- **PREVIOUSLY STATED (r1 B2):** five read sites. **NOW:** **four consumers in three modules** (`config.py:120`, `:337`, `liveness.py:97`, `promote.py:95`); `liveness.py:48` and `promote.py:66` are imports [L-12].

## 1. SOURCES READ (the six)

| # | source | read |
|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | `token-watch/config.py` (:86-92, :93, :106-121, :124-176, :323, :330-339, :360, :368, :391), `liveness.py` (:1-40, :88-97, :168-260), `ops/feed_watch.py` (:40-130), `promote.py` (:66, :88-95), `budget.py` (:1-60, :74, :445-490, :543, :563), `store.py` (:91, :338, :711), `token-watch/systemd/` (13 units) |
| 2 | runtime + vendor | staging `births/*.jsonl` (all 71 day files), `state/budget.json`, `cold/spend-journal-*.gz`; Helius webhooks API and admin usage endpoint (A1-A5) |
| 3 | System Impact Map | "token-watch — the launch-and-survival study, a CO-TENANT on the staging box" (`:1250-1263`) |
| 4 | System Manual | no token-watch chapter (not trading-system architecture); the SIM entry is the governed home |
| 5 | ledger | `RUNNING_ISSUES` `#1247` (cause confirmed), `#1246`, `#1257`; `B_TOKEN_WATCH_PRE_REGISTRATION.md` `:45`, `:47`, `:339`, AMENDMENTS 1-17; `DEPLOY_WINDOWS.jsonl` |
| 6 | provenance | `17713672b` (dead-man's switch), scope §5.1 r2-r4 (budget), pre-registration §6 (census). `bridge/canonical/` predates token-watch (2026-08): no coverage, expected. |

## 2. AUDIT

### A — the vendor, measured (staging, 2026-11-16 00:48-01:54Z; key read from `/etc/token-watch/helius.env`, never argv; production body captured verbatim to `/root/birthcap/prod-webhook.json`, mode 600, before any edit)
- **A1 — the counter is readable, free and near-real-time.** `GET admin-api.helius.xyz/v0/admin/projects/<id>/usage`. Positive control, nothing changed: 11 reads at 30 s from 00:48:44 to 00:53:51 — `webhooks` +157 vs +179 recorded births. Lumpy at 30 s, so it is read at minutes. The usage call itself is uncharged: +3 across 10 reads in a paused window (A4).
- **A2 — `active` is a real pause flag on EDIT, refused on CREATE** (400 *"property active should not exist"*). A full-body PUT with `active:false` → 200, and the object reads `active:false`, `disabledReason: "manually disabled"`, `disabledAt`. Throwaway webhooks on a no-match random address; both deleted.
- **A3 — edit semantics and costs.**
  - A partial PUT → 400 (URL, types, addresses and webhookType are required).
  - Fields omitted from a full PUT persist. **The `authHeader` evidence is the PUT RESPONSE itself** [L-answer 1]: `throwaway2.out`, step "PUT full, NO authHeader, new address", returned `authHeader` set — a field the request omitted. So the echo is rendered from stored state; the following GET agreed.
  - Costs: create, edit, delete and GET charge 100 each; a 400 charges nothing. 17 charged calls account for 1,704 of 1,774 credits between 01:36:24 and 01:40:07, and the other 70 are that span's 70 births. Charges land up to ~60 s late, in lumps.
- **A4 — the live pause** (Langston (A), conditions 1-4). PUT `active:false` at 01:40:42.585Z (`disabledAt`); PUT `active:true` at 01:47:52Z.
  - Census hole: 01:41:31.352Z → 01:48:47.222Z = **435.9 s** (< 900: no gap record, no page).
  - Counter, after the pause's charges settled: **+3** over 5.1 min off (01:42:45 → 01:47:51, births +0) vs **+91** over 4.6 min on (01:49:22 → 01:53:58, births +114).
  - Restore: receiver rows seen 60 s after the PUT, inside the 180 s stated in advance; the restore was held in a `finally`.
  - Other windows reading births: only `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (mine), effect ~170 rows.
- **A5 — in-flight tail and restart lag:** deliveries for ~49 s after the pause, resuming ~55 s after the restore (one measurement each). The measured on-time is the delivery span, not the PUT span.

### B — the code and data census (repo-wide, tests excluded)
- **Births writer: one** (`receiver.py` → `store._append`, `store.birth_path`, `store.py:91`, `:338`). **Readers:** `liveness`, `promote`, `store` (census `:711`), `summary`, `tools/derive_obs_window.py`. **Deleter: none** (tier `NEVER_TOUCH`).
- **Schedulers** (13 units): receiver (always on) · followup (hourly) · feed-watch (hourly) · summary (:12) · tier (04:30Z) · store-watch (06:00Z) · cold-offbox (05:30Z) · `token-watch-failed@`. **Nothing writes the webhook object today** (created by hand 2026-08-28) ⇒ the controller is its only writer.
- **B1 — the dead-man (C-4, C-13).** `liveness.check` records a retrospective gap for any inter-row delta > 900 s (`:225`) and opens a prospective gap for silence > 900 s (`:249`). `feed_watch --mint` mints under ONE dedupe key (`:52`), and a standing row suppresses every later gap (`:97-98`). `_estimate_rows` (`:97`) would stamp ~560 rows on a 39-min off window and ~4,053 on 4.7 h (Langston's re-derivation) into `provenance/gaps.jsonl`.
- **B2 — `EXPECTED_LAUNCHES_PER_DAY`: four consumers in three modules** [L-12]: `config.py:120` (control design target; *"where they disagree the log wins"*) · `config.py:337` (reserve assert) · `liveness.py:97` (gap estimate) · `promote.py:95` (`MAX_CHECKS_PER_RUN`). Imports at `liveness.py:48`, `promote.py:66`. `config.py:92` calls 20,700 *"measured against the chain"* — true on 2026-08-27, 1.9× low now.
- **B3 — TWO budget authorities, different boundaries** [L-8]. The ledger keys the CALENDAR month (`budget._month_key`, `:74`), and that drives the alarms AND the **shed gate**: `allowed()` computes `remaining` from `spent_total()` (`:485`). The vendor cycles on the 27th. After this batch the controller reads the vendor; the shed gate reads the ledger.
- **B4 — the census-on-birth rule lives in four governed bodies** [L-1]: `config.py:90` *"Census on birth (no sampling, ever)"* · `config.py:170-173` *"BIRTHS ARE NEVER SHED…"* · `budget.allowed()` docstring *"There is no state of the budget in which a birth is refused"* · pre-registration `:47` and `:339` (*"the census-on-birth rule … untouched"*).
- **B5 — the §5.1 split has no home for a fourth leg** [L-3]: 803,000 + 190,000 + 7,000 = 1,000,000, `assert UNALLOCATED == 7_000` (`config.py:166`, *"amend the scope, not this file"*). Switching at W=12 = 2,400/day = 74,400 per 31-day cycle, 10.6× `UNALLOCATED`.
- **B6 — the reference data (C-7)** [L-7]: **all 71 day files, 2,636,112 rows, carry `first_seen_at` (0 missing on any day; per-day counts in `c7_coverage.json`)**. Days under 20k rows: 2026-09-05 (19,775, the study's first full-day edge), 2026-10-20 (13, the blind period), 2026-11-16 (in progress). Hour-of-day share by month — Sep 956,273 rows, 2.80-5.67% per hour · Oct 1,056,784, 2.83-5.61% · Nov 1-16 598,230, 2.71-5.48%. **Largest spread in any hour's share across the three months: 0.64 percentage points.**

### C — dispositions (corrected [L-1], [L-2])
- **The census-on-birth rule (B4) — (2), updated by Kyle's decision (KD-90).** The scheduled, published, measured duty is weightable where an uncontrolled shed is not. All four bodies are rewritten in P5, not stacked on. The census stratum (2026-08-31 → switch-on) stays as the base-rate anchor (AMENDMENT 18 (d)).
- **`NEVER_SHED` — (2), gains `switch`** (a record of a management call that has already happened, charged after the fact; `charge()` asserts `kind in CREDITS`, and `allowed()` raises on any kind outside the two tuples). `SHED_ORDER` — (1), unchanged.
- **The dead-man — (2):** planned-off aware (P4).
- **The §5.1 split and the `:337` assert — (2):** re-derived in AMENDMENT 18 with a switching leg (P5).
- **`EXPECTED_LAUNCHES_PER_DAY` — (2):** its comment is rewritten; the value stays 20,700 for its two live consumers (P5).
- **The ledger's calendar month — (2) for the cap only:** the vendor governs the cap; the ledger keeps governing the shed gate. Every disagreement is recorded (P3). The re-key itself is out of scope (§4).

## 3. PLAN (each item → its finding)

- **P1 — the controller** (`token-watch/birthcap.py`, `token-watch-birthcap.timer` every minute; A2, A3, B).
  - **Desired vs applied.** It computes the desired state from the schedule. If that differs from the last applied state, it PUTs the full known-good body with `active` set.
  - **The PUT RESPONSE is the read-back** (A3; no GET). A non-200, or a response `active` ≠ request, pages.
  - **Known-good body:** runtime source **`/etc/token-watch/webhook-body.json`, `root:tokenwatch` 0640** (carries `authHeader`; same mode as `helius.env`) [L-10]. `/root/birthcap/prod-webhook.json` is the backup, not the source.
  - **Switch log:** every switch is appended to `provenance/switches.jsonl` (OBJ-8): requested time, response time, response `active` / `disabledAt`, status, credits.
  - **Ledger:** charged 100 per switch as kind `switch`, which joins `NEVER_SHED` (§C). It runs as `tokenwatch`, single instance by lock file.
  - **CIRCUIT BREAKER [L-4]:** a hard ceiling of **2W + 4 switches per UTC day** (28 at W=12), counted from `switches.jsonl`, independent of the schedule. At the ceiling it stops switching, leaves the webhook **ON** and pages. A missing or unreadable applied-state file costs **one** GET (100), and that GET counts against the same ceiling.
  - **HANDSHAKE [L-4]:** the controller refuses any off-switch unless the installed `liveness` exposes `PLANNED_OFF_READER` and its `SWITCHES_PATH` equals the controller's. On refusal it fails closed to **ON** and pages. Overspend is recoverable; a dark and blind census is not.
- **P2 — the schedule** (ruling 1, 1b; A5; [L-5], [L-11]).
  - **W** = min(12, max(4, floor(0.08 × gross day ÷ 200))), where gross day = cycle credits ÷ cycle days.
  - **Next cycle:** 33,333 → 13.3 → **12**. **This tail:** at a ~11-17T12:00Z switch-on, ~100k ÷ ~9.5 days ≈ 10.5k/day → rule-max ~3.8–4.2. **The floor of 4 binds**, so switching runs ~8.5% of gross, **over the rule, deliberately**.
  - **Why the floor is 4:** below 4 windows the longest off-block exceeds ~4.5 h, so a whole part of the day goes unseen for that day (phase rotation spreads it across days, but not within one).
  - **When rule-max < floor:** the floor applies and the excess switching is taken from the birth allowance (stated in AMENDMENT 18).
  - **On-duration:** fixed per window, evenly spaced. The daily phase = (day-of-cycle × 0.618) mod 1 of a block. Duty is fixed once per cycle (P3).
  - **ASSERT `on_duration > LIVENESS_GAP_SECONDS` (900 s)**, or a failed switch-ON has no instrument [L-5]. Indicative values: W=12 ≈ 1,950 s; W=4 ≈ 5,860 s. If the assert fails, W steps down until it holds. If W=1 still fails, the schedule is refused, the webhook is left ON and a decision is raised to Kyle.
- **P3 — the cycle, the reserve and the backstop** (A1, B3; OBJ-3; [L-answer 4], [L-6], [L-8]).
  - **Once per cycle** (and once at switch-on for the tail), from the vendor usage endpoint:
    - allowance/day = (remaining − reserve − switching − RPC at its trailing 7-day rate × days left) ÷ days left;
    - duty = allowance/day ÷ the trailing-7-day measured launch rate (B6).
  - **Reserve** = the max of: days-left × RPC rate, the counter's ~60 s lag × the rate, and one day of rate error (20% of a day's births).
  - **Backstop:** it counts recorded births today. At the allowance it switches off for the rest of the UTC day and writes a `truncated_day` record. **Truncated days are their own stratum, never pooled or weighted into the rest** [L-6] — their censoring correlates with the launch rate.
  - **Two authorities, stated:** the VENDOR governs the cap; the LEDGER governs the shed gate (`allowed()`). Each hour the controller compares the vendor's `webhooks` delta with the ledger's birth+switch delta, over the same aligned clock hour. The ratio is computed only when the vendor delta ≥ 200 (so an off window's 0/0 is skipped). A difference > 10% is recorded and paged. The month-vs-cycle offset is never compared, since it diverges by construction.
- **P4 — the dead-man made schedule-aware** (B1, C-13; **enforced by the P1 handshake, not by promise**).
  - `liveness` exposes `PLANNED_OFF_READER` / `SWITCHES_PATH` and reads `switches.jsonl`.
  - A delta or silence inside a planned off window (+60 s in-flight, +90 s restart grace, A5) → a `planned_off` record in `provenance/planned_off.jsonl`, with no row estimate. It never opens a gap.
  - Silence > 900 s in an on window → gap + page, as today.
  - **Failed switch-off [L-answer 2]:** page when **≥ 10 rows** arrive in the band (off + 60 s, off + 120 s). At 39,611/day the live feed delivers ~27.5/min, so a still-on feed yields ~27 in that band; a decaying in-flight tail yields far fewer. This survives a tail twice the one observation and still detects in ~2 min. It runs in the controller each minute, under a **dedupe key per off window** (`token-watch-birthcap-off-failed-<window_start>`), never a shared key.
  - Mutation-tested arms: planned-off silence → no page · on-window silence → page · rows in the band → page · echo mismatch → page · handshake absent → ON + page · breaker → ON + page.
- **P5 — constants and the rewrites** (B2, B4, B5; [L-1], [L-3], [L-answer 3]).
  - **Rewrite (not stack):** `config.py:90` and `:170-173`, the `budget.allowed()` docstring, `config.py:92` (*"measured 2026-08-27; ~39,600/day measured 2026-11; kept at 20,700 for two consumers — see `promote.py:95`, `config.py:120`; removal point: `B-TOKEN-WATCH-FOLLOWUP-MEMORY` P15 / `#1246`"*), and both of those sites cross-pointed.
  - **Re-derived split** (AMENDMENT 18, proposed for Langston's ruling): `SWITCH_RESERVED` 75,000 (W=12 × 2 × 31 × 100 = 74,400) · `LIQUIDITY_AUDIT_CARVE` 190,000 → 60,000 (measured RPC 17,829 in 15 days ≈ 36.8k per cycle; 1.6× headroom) · `UNALLOCATED` 7,000 kept as the separation · birth allowance = 1,000,000 − 75,000 − 60,000 − 7,000 = **858,000/cycle** (27,677/day over 31 days; 28,600 over 30). Recorded births/day = launches × duty. `assert UNALLOCATED == 7_000` stays, with the other three named.
  - **The `:337` assert, with units:** `BIRTHS_RESERVED [credits/cycle] ≥ BIRTH_ALLOWANCE_PER_DAY [births/day] × CYCLE_DAYS_MAX [31 days] × CREDITS["birth"] [credits/birth]`. **Load-bearing:** today it passes by 875 only because 20,700 is 1.9× low. At 39,611 the old form fails by 731,268 (Langston's figure at 39,594; re-derived: 39,611 × 31 × 1.25 = 1,534,926 → fails by 731,926).
  - `promote.py:95` keeps 20,700: moving it mid-P10 changes that observation's own inputs.
  - `liveness._estimate_rows` uses the measured rate × on-window membership.
- **P6 — AMENDMENT 18**, committed before the first capped birth: ruling 3 (a)-(e), the re-derived split (P5), the floor-binding rule (P2) and truncated days as a stratum (P3). **Plus a rider on AMENDMENT 17** [L-9]: the expected shed page from the calendar-month credit crossing (~11-21..11-26) is removed by this batch, so a clean no-shed week is NOT confirmation of the budget design. It lands in the same commit, with the `B-TOKEN-WATCH-FOLLOWUP-MEMORY` window row's note pointed at it.
- **P7 — verification instruments** (C-7, C-8; B6; [L-7]).
  - **Hour-share reference:** `first_seen_at` over Sep 1 → Oct 17 and Oct 28 → Nov 15, excluding 10-18 (partial), 10-19..10-26 (blind; 10-20 holds 13 rows) and 10-27 (partial).
  - **Stationarity is a pre-condition:** per-hour share by month must spread ≤ 1.0 pp (measured 0.64 pp, B6) or the reference is split by month.
  - **Pass band**, pre-registered in AMENDMENT 18: each hour's capped share within ±1.5 pp of the reference.
  - **Per-day coverage** is published (`c7_coverage.json`).
  - **OBJ-5 baseline:** the 7 days before switch-on (follow-up run counts, buckets behind).
- **P8 — governance and windows.** The `open` row in `DEPLOY_WINDOWS.jsonl` (landed `102940515`) gains its `detail` pointer to this document [L-12]. `PHASE_HISTORY` at Step 10. The SIM gets the controller as the only writer of external subscription state. A declared-`open` row in `GOVERNANCE_EXCEPTIONS` if observation runs on a progress report.
- **P9 — install and timing.** Step 4 review → staging install via `token-watch/deploy/install_storage.sh` (token-watch's own installer, not `dt-deploy`), with P1+P4 in one install. The handshake refuses an off-switch otherwise. Target: before the projected run-dry (~11-19 evening).

## 4. OUT-OF-SCOPE FINDINGS — dispositions (§9.4)
- **The ledger's calendar month governs the shed gate and the burn alarms; the vendor cycles on the 27th** (B3). DISPOSITION: this batch records every disagreement (P3). Re-keying the ledger itself: decision required — proposed for Kyle's list via PM (crew tooling; likely after live).
- **Follow-up runs lengthening** (93 → 127 → 155 min, runs 3-5; summary alert `a299883c` recurs). DISPOSITION: folded into `B-TOKEN-WATCH-FOLLOWUP-MEMORY` P10, which measures it; fewer births lower the due load, which is noted, not claimed as a fix.

`REVIEWER:` none spawned — NOT RE-READ by a fresh reader. Load-bearing vendor claims A1-A5 carry instrument, control and clock, and are staged for re-derivation.
