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

# The aging tracker on the staging page (OBJ-10) may only offer ages the grid
# actually observes. Kyle's original request included 5/15/45/60/75d; those
# are NOT here because we do not look on those days and a column we cannot
# fill is worse than a column we did not offer.
DISPLAY_AGES = ("3d", "7d", "30d", "90d")
assert set(DISPLAY_AGES) <= set(GRID_LABELS), "display cannot offer an unobserved age"

# ─────────────────────────────────────────────────────────────────────────────
# SAMPLING — pre-registration §6 + AMENDMENT 1 §A1.3.
# Census on birth (no sampling, ever). Case-control on follow-up.
# ─────────────────────────────────────────────────────────────────────────────
EXPECTED_LAUNCHES_PER_DAY = 20_700    # measured against the chain, scope §5
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
MONTHLY_CREDIT_CAP = 1_000_000
BIRTHS_RESERVED = 776_000       # 621k mean + 25% launch-rate variance. PROTECTED FLOOR.
LIQUIDITY_AUDIT_CARVE = 200_000  # hard carve; becomes a residual above +25% variance
UNALLOCATED = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED - LIQUIDITY_AUDIT_CARVE  # 24,000

assert UNALLOCATED == 24_000, "the §5.1 arithmetic changed — amend the scope, not this file"

# ⛔ THE SHED ORDER (scope §5.1, OBJ-9). Enforced in code, not intention.
#    BIRTHS ARE NEVER SHED: a sampled birth record destroys the base rate
#    irrecoverably, and §5 measures reconstruction as unaffordable at every
#    tier. Reconstructable-but-unaffordable is operationally not reconstructable.
SHED_ORDER = ("liquidity", "follow_up")   # first to go, then second
NEVER_SHED = ("birth", "delivery")

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
PAYLOAD_DIR = f"{ROOT}/payload"        # bulky raw payloads — tiers at 1 day
COLD_DIR = f"{ROOT}/cold"              # the hand-off, built day one (OBJ-6)
STATE_DIR = f"{ROOT}/state"
LOCK_PATH = f"{STATE_DIR}/periodic.lock"

PAYLOAD_HOT_DAYS = 1
WORKING_INDEX_HOT_DAYS = 90

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

CREDITS = {"birth": 1, "follow_up": 0, "liquidity": 1,
           # `delivery` is NOT spend. It is a webhook-delivery note carried on
           # the same journal so the received/recorded ratio survives beyond a
           # log line. Zero credits, and it is in NEVER_SHED so the shed
           # decision can never suppress an audit record.
           "delivery": 0}
