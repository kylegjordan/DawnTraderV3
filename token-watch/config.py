"""
token-watch — configuration. ONE home for every number this study depends on.

⛔ THE FENCE (B_TOKEN_WATCH_SCOPE.md §0, Langston's condition):
   This is an OBSERVATION RECORDER. No trading, no wallet, no execution, no
   strategy, no orchestrator contact. It runs on Helsinki, NEVER on the
   trading box. Nothing here may import from, or write into, the trading
   application.

WHY THE NUMBERS LIVE HERE AND NOWHERE ELSE: the pre-registration fixes the
observation grid and the sampling policy BEFORE data exists, and an analysis
that quietly re-tunes them is no longer the study that was registered. Every
value below is traceable to a document, cited inline. Changing one means
amending that document first — the code is downstream of the registration,
not the other way round.
"""

import os
from datetime import timedelta

# ─────────────────────────────────────────────────────────────────────────────
# THE OBSERVATION GRID — pre-registration §6, UNCHANGED.
#
# ⛔ AMENDMENT 3 (a 12-point superset) was PROPOSED and then WITHDRAWN by Kyle
#    2026-08-28: "three and seven days are fine... we can limit this to the
#    days that you'd already set to track." The display was repriced instead
#    of the measurement. This is the ORIGINAL registered grid and it has never
#    been amended.
#
# ★ FIXED AGES, NOT AN ADAPTIVE TAPER — Langston's reason, and it is the whole
#   point of a grid: fixed ages let cohorts from different launch days POOL.
#   An adaptive schedule makes coverage "whatever we could afford", which is
#   unstateable at analysis time.
# ─────────────────────────────────────────────────────────────────────────────
GRID = (
    timedelta(hours=1),
    timedelta(hours=6),
    timedelta(hours=24),
    timedelta(days=3),
    timedelta(days=7),
    timedelta(days=30),
    timedelta(days=90),
)

GRID_LABELS = ("1h", "6h", "24h", "3d", "7d", "30d", "90d")
assert len(GRID) == len(GRID_LABELS)

# ⛔⛔ THE SWEEP CONSUMES A BUCKET WHILE ITS HOUR IS STILL OPEN. That is safe
#    ONLY while no checkpoint can fall due in the hour of its own birth --
#    which is exactly what a one-hour minimum guarantees: a token born at
#    12:30 has its earliest grid point at 13:30, in the NEXT bucket. Both
#    writers land at `open_hour + 1` or later: `schedule_grid` by this
#    arithmetic, and `_append_next_bucket` by `now + 1h` off a `now` captured
#    once at run start. Margin: one hour.
# ★ THIS ASSERT REPLACES A WHOLE MECHANISM (Langston, 2026-08-31). I built a
#   line high-water mark and an elapsed-hours-only cursor to make the sweep
#   safe against appends into an open bucket -- against a loss I had reported
#   and then measured to be ZERO. He went further than my withdrawal: the
#   loss is not merely unobserved, it is UNREACHABLE, and the reason is this
#   constant. The mechanism was reverted; three defects were found while
#   building it, two inside the failure family it was addressing.
# ⇒ SO THE EXPOSURE IS CONVERTED INTO AN IMPORT-TIME FAILURE AT THE EXACT
#   EDIT THAT WOULD MAKE THE SWEEP UNSAFE -- a sub-hour grid point. No
#   persistent state, no runtime cost, and it fails loudly at the change
#   rather than silently at 03:00. The cure for a silent-loss shape is a loud
#   row, not a recovery path for a loss that has never been reachable.
assert min(GRID) >= timedelta(hours=1), (
    "the hourly sweep consumes a bucket while its hour is still open; that is "
    "safe only while no checkpoint can fall due in the hour of its own birth")

# The aging tracker on the staging page (OBJ-10) may only offer ages the grid
# actually observes. Kyle's original request included 5/15/45/60/75d; those
# are NOT here because we do not look on those days and a column we cannot
# fill is worse than a column we did not offer.
# ⛔ THE SURVIVAL TABLE NOW OFFERS EVERY AGE WE OBSERVE (Kyle, 2026-09-01).
#    It offered 3d and up, while the DEATHS table offers 1h/6h/24h -- so on
#    a study one day old the deaths table was full and the survival table
#    was four zeros. Both numbers were correct and the page read as broken,
#    because the two tables were answering at different ages.
# ★ THIS DOES NOT WEAKEN THE ORIGINAL RULE, WHICH STANDS: the display may
#   only offer ages the grid ACTUALLY OBSERVES. Kyle struck 5d/15d/45d/60d/
#   75d for exactly that reason -- a column we cannot fill is worse than a
#   column we did not offer. 1h, 6h and 24h ARE observed, so offering them
#   satisfies the rule rather than bending it.
DISPLAY_AGES = GRID_LABELS
assert set(DISPLAY_AGES) <= set(GRID_LABELS), "display cannot offer an unobserved age"

# ─────────────────────────────────────────────────────────────────────────────
# SAMPLING — pre-registration §6 + AMENDMENT 1 §A1.3 + AMENDMENT 18.
# Births: a CENSUS from 2026-08-31 to the birth cap's switch-on (the base-rate anchor), then a TIME SAMPLE on a
# published timetable with a measured inclusion probability (KD-90; birthcap.py). Case-control on follow-up.
# ─────────────────────────────────────────────────────────────────────────────
# ⚠️ 20,700 WAS MEASURED AGAINST THE CHAIN ON 2026-08-27; THE RATE IS ~39,600/day BY 2026-11 (births rows, #1247).
#    Kept at 20,700 for its two live consumers — the control-sample design target (config CONTROL_INCLUSION_P; the
#    daily log wins) and promote.MAX_CHECKS_PER_RUN (moving it would change B-TOKEN-WATCH-FOLLOWUP-MEMORY's own P10
#    inputs mid-observation). The birth cap and the dead-man use the MEASURED rate instead. Removal point:
#    B-TOKEN-WATCH-FOLLOWUP-MEMORY P15 / #1246.
EXPECTED_LAUNCHES_PER_DAY = 20_700
CONTROL_SAMPLE_PER_DAY = 500          # fixed random non-carriers, A1.3

# ⛔ THE TRAIT THRESHOLD. It lived in receiver.py, OUTSIDE the file whose own
#    docstring claims "ONE home for every number this study depends on" — found
#    by a fresh reader. It is one of the two limbs of the trait definition and
#    therefore determines the exposure group, so it belongs under the same
#    amend-the-document-first discipline as everything else here.
# ⚠️ AND ITS PROVENANCE IS STATED RATHER THAN IMPLIED: this figure is MINE, not
#    the literature's. It is flagged to Langston as the weakest constant in the
#    batch, and the trait definition is PROVISIONAL pending the extraction
#    verification in the Phase-3 proving run. Do not cite the "set before our
#    cohort existed" argument for it — that argument protects thresholds
#    imported from published work, and this one was not.
PLATFORM_DEFAULT_SIZE = 1.0   # SOL. PROVISIONAL — see above.
EXPECTED_CARRIER_PREVALENCE = 0.20    # A1.3's published assumption, ~4,140/day
# ⛔ If MEASURED prevalence exceeds this, the TRAFFIC rises and the trait
#    definition does NOT narrow. A definition tightened to fit a ceiling is
#    trimming with the label moved (AMENDMENT 1).

# The per-token inclusion probability for the CONTROL arm, derived from the
# expected non-carrier population rather than tuned.
#   20,700/day x (1 - 0.20) = 16,560 non-carriers ; 500 / 16,560 = 0.0302
# ★ THE REALISED probability is LOGGED DAILY and is what the analysis uses —
#   inverse-probability weighting is pre-registered NOW rather than discovered
#   at analysis time (AMENDMENT 1). This constant is the DESIGN target; the
#   log is the truth, and where they disagree the log wins.
CONTROL_INCLUSION_P = CONTROL_SAMPLE_PER_DAY / (
    EXPECTED_LAUNCHES_PER_DAY * (1 - EXPECTED_CARRIER_PREVALENCE)
)

# ─────────────────────────────────────────────────────────────────────────────
# CREDIT BUDGET — scope §5.1, r3 (the r2 double-count is corrected here).
# 1,000,000 credits/month on the free tier.
# ─────────────────────────────────────────────────────────────────────────────
# ⛔ THE SPLIT — B-TOKEN-WATCH-BIRTH-CAP AMENDMENT 18 (Kyle KD-90; Langston ruling (A), Discord
#    `1571799979847057452`). It supersedes the 2026-08 split (births 803,000 · liquidity carve 190,000 · separation
#    7,000), whose derivation stays in git history and in the pre-registration §5.1 r2-r4. Two measured facts moved it:
#    (1) BIRTHS ALONE OVERRUN THE FREE CYCLE: ~39,600/day against 1,000,000 (`#1247`). Births are now CAPPED on a
#        timetable by birthcap.py, so the birth leg is an allowance the controller plans once per cycle, never a
#        variance band around a launch rate.
#    (2) THE LIQUIDITY LEG CANNOT BE FUNDED, AND AN EXHAUST-FIRST CARVE IS BIASED. Its natural demand is ~2.3k
#        credits/hour (~1.7M per cycle) because it is called per alive follow-up observation; and the follow-up
#        reads buckets OLDEST FIRST (follow_up._buckets_to_read), so any carve spends itself on the oldest backlog —
#        a bias that hourly pacing only repeats. ⇒ CARVE 0: the leg is suspended, every pool read records source
#        "shed", and a paced design is a proposal for Kyle's list, not this file.
# ⛔ THE CYCLE IS THE VENDOR'S (27th to 27th), NOT THE CALENDAR MONTH THIS LEDGER KEYS (budget._month_key). The
#    controller plans against the vendor counter; this ledger still governs the shed gate. At carve 0 the gate
#    sheds liquidity at every spend, so the two boundaries cannot disagree about that leg.
MONTHLY_CREDIT_CAP = 1_000_000
SWITCH_RESERVED = 75_000          # 12 windows x 2 switches x 31 days x 100 credits = 74,400 (pre-audit P5)
LIQUIDITY_AUDIT_CARVE = 0         # suspended (above): allowed("liquidity") is False at every spend
UNALLOCATED = 7_000               # the separation, NOT spare capacity
BIRTHS_RESERVED = MONTHLY_CREDIT_CAP - SWITCH_RESERVED - LIQUIDITY_AUDIT_CARVE - UNALLOCATED   # 918,000
assert BIRTHS_RESERVED == 918_000, "the AMENDMENT 18 split changed — amend the pre-registration, not this file"
assert SWITCH_RESERVED >= 12 * 2 * 31 * 100, "the switch reserve must cover the window ceiling for the longest cycle"


# ⛔ THE SHED ORDER (scope §5.1, OBJ-9). Enforced in code, not intention.
#    A DELIVERED BIRTH IS NEVER SHED: Helius has charged for it already, so discarding it saves nothing and loses
#    the row. How many births are DELIVERED is the birth cap's job (AMENDMENT 18), done by switching the
#    subscription off on a published timetable — never by refusing an arrival here.
SHED_ORDER = ("liquidity", "follow_up")   # first to go, then second
NEVER_SHED = ("birth", "delivery", "switch")

# ─────────────────────────────────────────────────────────────────────────────
# BURN MONITOR — OBJ-9, r3.
# ★ NOT a trailing mean. Langston: "a monitor projecting off a trailing mean
#   is blind in the same direction as the budget, and will under-project
#   during exactly the launch-rate spike that causes the exhaustion."
#   Two projections, alert on whichever exhausts SOONER.
# ─────────────────────────────────────────────────────────────────────────────
BURN_WARN_FRACTION = 0.80
BURN_CRITICAL_FRACTION = 0.90
BURN_TRAILING_WINDOW = timedelta(hours=24)
BURN_PEAK_WINDOW = timedelta(hours=1)
# ⛔ THE PEAK LEG ASKS A BOUNDED QUESTION: "if this hour's rate PERSISTED, would
#    we exhaust the allowance within a week?" It does NOT extrapolate one hour
#    across the whole month — doing that made the monitor read critical under
#    ordinary designed load, and an alarm that is always on is an alarm nobody
#    reads. Seven days is the horizon over which a sustained rate change would
#    still leave time to act.
SPIKE_HORIZON = timedelta(days=7)

# ─────────────────────────────────────────────────────────────────────────────
# COVERAGE CONTROL — OBJ-3, the windowed chain re-census.
# ⚠️ STATED REACH: catches DELIVERY LOSS (a webhook push that dropped silently
#    — the #704 class, which produces no local error). It does NOT catch
#    provider-side indexing gaps. A control covering one leg is never
#    described as covering three.
# ─────────────────────────────────────────────────────────────────────────────
CENSUS_WINDOW = timedelta(minutes=5)
CENSUS_RUNS_PER_DAY = 1

# ─────────────────────────────────────────────────────────────────────────────
# STORAGE — scope §4. Split store (BLOCKER-4 of the r1→r2 review).
# ★ The working index is hot for the FULL 90 days because the follow-up
#   scheduler is a named reader with a 90-day lookback: firing a 90-day
#   checkpoint means looking up a birth from 90 days ago. STORAGE_POLICY §2.5's
#   invariant is "hot retention >= the deepest reader window" — my r1 claim
#   that "nothing queries this for 90 days" was FALSE.
# ─────────────────────────────────────────────────────────────────────────────
# ROOT is overridable ONLY so the test suite can run against a scratch tree —
# in particular the shed-order injection, which is a hard close condition and
# must exercise the real decision function against a real store rather than a
# mock. The production default is the literal below; an unset variable yields
# production, never a silent temp directory.
ROOT = os.environ.get("TOKEN_WATCH_ROOT", "/var/lib/token-watch")
BIRTHS_DIR = f"{ROOT}/births"          # append-only census. NEVER deleted, never sampled.
OBSERVATIONS_DIR = f"{ROOT}/observations"
DUE_DIR = f"{ROOT}/due"                # hour-bucketed schedule; see store.py
TOMBSTONE_DIR = f"{ROOT}/dead"
COLD_DIR = f"{ROOT}/cold"              # the hand-off, built day one (OBJ-6)
STATE_DIR = f"{ROOT}/state"
LOCK_PATH = f"{STATE_DIR}/periodic.lock"

# ⛔ THE HOT WINDOW FOR EVERY BULKY STORE (was PAYLOAD_HOT_DAYS until
#    2026-08-28). Renamed when PAYLOAD_DIR was deleted: the constant governs
#    the tiering loop for ALL of TIERED_SOURCES, so a name tied to one store
#    would have read as if the provenance store had no stated retention.
BULKY_HOT_DAYS = 1
WORKING_INDEX_HOT_DAYS = 90

# ⛔ HOW LONG A SPENT `due/` BUCKET STAYS AFTER ITS HOUR (B-TOKEN-WATCH-STORAGE
#    amendment 1, OBJ-7). A bucket is SPENT when the follow-up cursor has
#    passed it: its one reader (`follow_up`, through `store.due_now`) never
#    reads it again. `tier.prune_due_buckets` removes a spent bucket once its
#    hour is this many days old; an unread bucket is never removed.
# ⚠️ NOT `WORKING_INDEX_HOT_DAYS`. That is the BIRTH index's window, sized to
#    the scheduler's 90-day lookback into births. The due buckets were pruned
#    on it until 2026-11-05, on the premise that "once an hour has passed,
#    nothing reads the bucket again" — false while the follow-up is behind,
#    where the unread buckets are exactly the ones it still has to read.
#    Seven days is only an audit margin on a scheduling artefact.
DUE_SPENT_HOT_DAYS = 7

# ─────────────────────────────────────────────────────────────────────────────
# THE STAGING SUMMARY (OBJ-10, Phase 4 — built only after the collector is
# proven). Size bound is DERIVED, not adjectival: ~4 KB of aggregates plus
# 100 rows x ~10 fields (~20 KB) ≈ 24 KB expected, ceiling at ~2.5x.
# A write exceeding it is REJECTED, not truncated — and the receiver-side
# wrapper on staging is what enforces it (Langston's Step-2 condition 1:
# a sender-side cap is a promise, not a control).
# ─────────────────────────────────────────────────────────────────────────────
SUMMARY_MAX_BYTES = 64 * 1024
SUMMARY_PUBLISH_INTERVAL = timedelta(days=1)

# ⛔ STALENESS THRESHOLD — Langston's Step-2 condition 2: "an unnamed threshold
#    at Step 2 is a reviewer's judgement at Step 4." Named here.
#    A daily publisher makes TWO missed cycles the natural bound: one missed
#    cycle is a transient, two is a pattern.
SUMMARY_STALE_AFTER = timedelta(days=2)

# ─────────────────────────────────────────────────────────────────────────────
# PROVIDERS — scope §5. Licensing was a PRE-CODE gate (Langston): without it
# the build finishes and is then unusable.
#   births    -> Helius webhook (key in /etc/token-watch/helius.env, mode 640)
#   follow-up -> DexScreener (no account, no key; commercial use permitted and
#                NO storage or derivation prohibition — materially unlike
#                CoinGecko/GeckoTerminal, whose terms 6.1/6.2 forbid the
#                DATASET on every tier, free and paid alike)
#   liquidity -> chain-direct on the spare Helius allowance, because
#                DexScreener reports no liquidity figure for bonding-curve
#                pools. ⚠️ It DOES see those pairs and returns price and
#                volume — the r1 claim that it "cannot see" them was FALSE and
#                is retracted in pre-reg AMENDMENT 2.
# ─────────────────────────────────────────────────────────────────────────────
HELIUS_ENV = "/etc/token-watch/helius.env"
DEXSCREENER_BASE = "https://api.dexscreener.com"
DEXSCREENER_RATE_PER_MIN = 300

# ⛔ THE PACE WE ACTUALLY CALL AT, AND WHY IT IS BELOW THE CEILING.
#    MEASURED 2026-08-31: the observation sweep fired ~1,250 calls/hour -- 7%
#    of what this provider allows per DAY -- and still had 40.5% REFUSED with
#    HTTP 429, because it fired them in an unspaced burst. Being far under a
#    daily limit says nothing about a per-MINUTE one.
# ★ 240 rather than 300 is a deliberate 20% margin: the ceiling is the
#   provider's and we do not control their accounting window, so calling AT
#   the limit means any clock skew between us and them is a refusal.
# ⛔ KEYED BY HOST, AND APPLIED AT THE ONE FUNCTION EVERY PROVIDER CALL PASSES
#   THROUGH -- not per caller. Two callers (the socials sweep and the
#   observation sweep) share this provider and ran with two different notions
#   of the rate: one paced itself at 240/min, the other did not pace at all,
#   and NEITHER knew the other was spending the same budget. A per-caller
#   pacer is correct for each caller and wrong for the provider.
RATE_PER_MIN_BY_HOST = {
    "api.dexscreener.com": int(os.environ.get("TOKEN_WATCH_REQ_PER_MIN", "240")),
}
# ⛔⛔ AND EVERY OTHER HOST MUST BE CLASSIFIED, NOT DEFAULTED (Langston,
#    2026-09-01). `_pace` used to `.get(host)` and silently return on a miss,
#    so an unlisted host was UNPACED BY OMISSION and looked identical to one
#    deliberately exempt. The trigger is named in our own docs: the
#    DexScreener fallback goes chain-direct on the spare Helius allowance, and
#    whoever makes that change adds a host to the table above and believes
#    they have paced everything.
# ⇒ TWO EXPLICIT SETS, EACH ENTRY CARRYING ITS REASON, AND `_pace` RAISES ON A
#   HOST IN NEITHER -- a silent no-op becomes a loud failure at the exact edit.
UNPACED_HOSTS = {
    "mainnet.helius-rpc.com":
        "credit-metered, not rate-metered: the liquidity read is gated by "
        "budget.allowed/charge against the monthly credit cap, and Helius "
        "publishes no per-minute ceiling we are near. If that changes, move "
        "it to RATE_PER_MIN_BY_HOST -- do not delete it from both.",
    "api.helius.xyz":
        "same account and same credit gate as the RPC host above.",
    "api-mainnet.helius-rpc.com":
        "the webhook management API (birthcap.py only). Each call costs 100 "
        "credits and is bounded by the birth cap's daily switch ceiling "
        "(birthcap_switch_ceiling), not by a rate: at most ~28 calls a day.",
    "admin-api.helius.xyz":
        "the project usage read (birthcap.py only): uncharged (pre-audit A1/A4), "
        "read at most once a minute by the controller.",
}
assert not (set(RATE_PER_MIN_BY_HOST) & set(UNPACED_HOSTS)), (
    "a host cannot be both paced and deliberately exempt")


CREDITS = {"birth": 1, "follow_up": 0, "liquidity": 1,
           # `delivery` is NOT spend. It is a webhook-delivery note carried on
           # the same journal so the received/recorded ratio survives beyond a
           # log line. Zero credits, and it is in NEVER_SHED so the shed
           # decision can never suppress an audit record.
           "delivery": 0,
           # `switch` is the birth cap's webhook management call (PUT, or the
           # rare GET): 100 credits each (B-TOKEN-WATCH-BIRTH-CAP pre-audit A3).
           # NEVER_SHED: it is charged AFTER a call that has already happened,
           # so there is nothing left to refuse; the cap's own breaker bounds it.
           "switch": 100}

# ⛔ THE RESERVE IS A FUNCTION OF THE PER-EVENT CREDIT, AND THE GUARD MUST SAY SO — WITH ITS UNITS (Langston's
#    tripwire on §5.1, kept; restated for AMENDMENT 18). Under the cap the reserve must cover the CAP, not the launch
#    rate: the old form (20,700/day x 31 x 1.25) passed by 875 only because 20,700 was 1.9x low, and at the measured
#    ~39,600/day it fails by ~731,900 — the cap is what makes the reserve hold at all.
#    BIRTHS_RESERVED [credits/cycle] >= BIRTHCAP_MAX_BIRTHS_PER_DAY [births/day] x 31 [days] x CREDITS["birth"] [credits/birth]
BIRTHCAP_MAX_BIRTHS_PER_DAY = 29_600   # the controller never plans more (birthcap.plan_cycle clamps to it)
assert BIRTHS_RESERVED >= BIRTHCAP_MAX_BIRTHS_PER_DAY * 31 * CREDITS["birth"], (
    "the births reserve no longer covers the cap's daily ceiling over the longest cycle at the per-birth credit")


# ═════════════════════════════════════════════════════════════════════════════
# THE DEAD-MAN'S SWITCH — the accept-side controls (Langston, 2026-08-28)
#
# ★ WHY THESE ARE CONTROLS AND NOT OPS HYGIENE, in his words: an outbound
#   collector fails SILENT and the switch catches that. An accept endpoint has
#   a second failure direction the switch cannot see — a FLOOD. Given a static
#   replayable header secret with no body integrity (see receiver.py), anyone
#   holding it can write unbounded rows into an append-only store, and an
#   append-only store cannot defend itself. SILENCE HAS A DETECTOR; VOLUME DOES
#   NOT. So the rate cap and the store cap are the accept-side DUAL of the
#   switch, not housekeeping — a future reader must not tune them off.
# ═════════════════════════════════════════════════════════════════════════════

# ⛔ DELIBERATELY LOOSE, AND IT IS A THRESHOLD TO INVESTIGATE, NOT A GATE.
#    20,700/day is a MEAN (0.24/s) and launches are bursty and diurnal, so
#    calibrating on the mean would false-fire every off-peak hour. Start wide;
#    tighten against the MEASURED off-peak floor from the first days of real
#    births and record the calibration in the pre-registration.
LIVENESS_GAP_SECONDS = 900             # 15 minutes of zero recorded census rows

# ⚠️ HONEST LIMIT, STATED RATHER THAN GLOSSED: the switch is driven by the
#    hourly job, so DETECTION LATENCY IS UP TO ONE HOUR even though the
#    threshold is 15 minutes. The retrospective leg (inter-arrival gaps read
#    off the rows themselves) is what makes a gap that opened AND CLOSED
#    between two checks still visible — without it, an hourly checker would
#    only ever see gaps that happen to still be open when it looks.
LIVENESS_CHECK_INTERVAL_SECONDS = 3600

# ⛔ THE STORE CAP — Langston's (b), and the precedent does NOT cover it.
#    The four passive-archive legs are cited as proof that capture-only work is
#    safe on the trading box, but MEASURED: DATABASE_URL points at Supabase, so
#    THEIR BYTES NEVER LAND ON THIS DISK. This study writes to local disk by
#    design (its own folder), which makes it the FIRST capture-only writer to
#    share filesystem fate with the trading app. A full `/` stops pm2 logging
#    and stops the app writing, with no database write anywhere in the story.
#    Measured 2026-08-28 on staging: / is 75G, 36G used, 37G available.
STORE_CAP_BYTES = 8 * 1024 * 1024 * 1024        # 8 GiB, ~22% of free space
STORE_CAP_WARN_BYTES = 6 * 1024 * 1024 * 1024   # warn with room to act

# ⛔ THE MEMORY CAP — Langston's (a), and it protects the TRADING process.
#    Measured on staging: 3,814 MB total and SWAP: 0. The trading node process
#    was at 605 MB RSS seven minutes into a restart and grows. With no swap the
#    OOM killer is the only backstop and IT SELECTS ON RSS — so a runaway study
#    process does not need to touch the trading database to kill the live
#    pipeline. User separation does nothing about this; a MemoryMax= line does.
#    Stated here AND in the unit, where it is visible in a listing.
UNIT_MEMORY_MAX = "512M"
UNIT_TASKS_MAX = 64

assert LIVENESS_GAP_SECONDS < LIVENESS_CHECK_INTERVAL_SECONDS, (
    "a gap threshold at or above the check interval can only ever fire on "
    "still-open gaps — the retrospective leg exists precisely to avoid that")
assert STORE_CAP_WARN_BYTES < STORE_CAP_BYTES, "warn must leave room to act"


def harden(directory: str, path: str) -> None:
    """Set the store's modes IN CODE, on every write, for the file AND its
    directory.

    ⛔ IT LIVES IN `config` BECAUSE THE DEFECT SPANS TWO MODULES AND A SECOND
       COPY WOULD DRIFT. `store` and `provenance` both write into the study
       tree; `provenance` deliberately does NOT import `store` (the accept
       path stays independent of the census path), and `config` is the only
       module both already import.

    Two defects, one cause. (1) The file chmod was `if _new`, so it fixed the
    causal path -- creation under the wrong umask -- but could not repair a
    mode that had already drifted; four files were still 0644/0664 when
    Langston measured on 2026-08-31. (2) `os.makedirs` takes its mode from the
    CALLER'S umask, so the same directory was 0700 created by the service
    (UMask=0077) and 0755 created by a manual repair run -- the very umask
    dependency this hardening exists to kill, reproduced inside the fix for it.

    Unconditional is affordable: the whole store takes ~0.24 writes/second.
    """
    for target, mode in ((directory, 0o700), (path, 0o600)):
        try:
            os.chmod(target, mode)
        except OSError:
            pass



# ═════════════════════════════════════════════════════════════════════════════
# THE BIRTH CAP (B-TOKEN-WATCH-BIRTH-CAP, KD-90) — a timetable that switches the
# Helius birth subscription on and off, so the study stays on the free tier.
#
# ⛔ THE CAP STOPS HELIUS SENDING; IT NEVER DISCARDS AN ARRIVAL. Helius charges a
#    birth "per event sent ... regardless of successful or failed endpoint
#    responses" (helius.dev/docs/billing/credits), so a dropped arrival saves
#    nothing and loses the row. NEVER_SHED keeps birth. The cap lives only in
#    birthcap.py, which flips the webhook's `active` flag.
# ⛔ SCHEDULED BY TIME, NOT BY COUNT (Langston ruling 1b): fixed on-duration
#    windows, so each birth's inclusion probability is a known constant and the
#    sample stays stateable. The credit allowance is a BACKSTOP; a day it binds is
#    logged `truncated_day` and analysed as its own stratum.
# Measured facts this rests on (pre-audit A1-A5): `active:false` on a FULL-body
#    PUT pauses the webhook (create refuses the field); a partial PUT is 400;
#    fields omitted from a full PUT persist (authHeader included, read off the
#    PUT RESPONSE); create/edit/delete/GET cost 100 credits each, a 400 is free;
#    the admin usage endpoint is uncharged; ~49 s of in-flight deliveries follow
#    a pause and deliveries resume ~55 s after a restore.
# ═════════════════════════════════════════════════════════════════════════════
BIRTHCAP_WEBHOOK_ID = "d3f861dd-3c9e-415c-8b07-7c6267fc2b67"
HELIUS_PROJECT_ID = "9913a9e5-651b-4fb5-ab1c-25942eecfba2"
HELIUS_WEBHOOKS_BASE = "https://api-mainnet.helius-rpc.com/v0/webhooks"
HELIUS_USAGE_URL = f"https://admin-api.helius.xyz/v0/admin/projects/{HELIUS_PROJECT_ID}/usage"
# ⛔ THE BODY CARRIES NO SECRET. `authHeader` is deliberately ABSENT: a full PUT
#    keeps the stored header (measured on the PUT response), and the controller
#    checks the echo still carries one. So the controller never holds the
#    receiver's secret; it can only switch the webhook, not re-point it.
BIRTHCAP_WEBHOOK_BODY = {
    "webhookURL": "https://188.245.193.8.sslip.io/token-watch/webhook",
    "transactionTypes": ["CREATE"],
    "accountAddresses": ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
    "webhookType": "enhanced",
    "txnStatus": "success",
}
BIRTHCAP_SWITCHES = f"{ROOT}/provenance/switches.jsonl"     # the weight record (OBJ-8)
BIRTHCAP_PLANNED_OFF = f"{ROOT}/provenance/planned_off.jsonl"
BIRTHCAP_TRUNCATED = f"{ROOT}/provenance/truncated_days.jsonl"
SWITCH_CREDITS = 100                 # per create/edit/delete/GET (pre-audit A3)
SWITCH_SHARE_MAX = 0.08              # switching <= 8% of the GROSS day allowance (ruling 1, L-11)
BIRTHCAP_W_MAX = 12
BIRTHCAP_W_MIN = 4                   # below 4 the longest off-block exceeds ~4.5 h of one day
BIRTHCAP_RESERVE_RATE_ERROR = 0.20   # one day of launch-rate error, as a share of a day's births
BIRTHCAP_OFF_GRACE_S = 60            # in-flight tail after a pause (A5: 49 s measured)
BIRTHCAP_RESTART_GRACE_S = 90        # deliveries resume after a restore (A5: 55 s measured)
BIRTHCAP_FAILED_OFF_MIN_ROWS = 4     # Langston r2-4: max(4, 0.25 x the on-window's last-5-min rate)
BIRTHCAP_FAILED_OFF_RATE_SHARE = 0.25
BIRTHCAP_DIVERGENCE_MIN = 200        # vendor-vs-census ratio computed only above this hourly delta
BIRTHCAP_DIVERGENCE_SHARE = 0.10
BIRTHCAP_PHASE_STEP = 0.618          # daily phase rotation, as a fraction of a block

# ⛔ THE BREAKER (Langston blocker 4): a lost applied-state file plus a minute
#    timer would PUT 1,440 times a day (144,000 credits). Hard ceiling per UTC
#    day, independent of the schedule; at the ceiling the controller stops
#    switching, leaves the feed ON, and pages.
def birthcap_switch_ceiling(windows_per_day: int) -> int:
    return 2 * windows_per_day + 4

assert BIRTHCAP_W_MIN <= BIRTHCAP_W_MAX
# A failed switch-ON is only visible as on-window silence > LIVENESS_GAP_SECONDS,
# so a schedule whose on-duration is shorter has no instrument (Langston C-5).
# birthcap.plan_cycle refuses such a schedule; this assert pins the constant.
assert LIVENESS_GAP_SECONDS < 86400 // BIRTHCAP_W_MAX
assert CREDITS["switch"] == SWITCH_CREDITS, "the ledger and the controller must charge one price per switch"
