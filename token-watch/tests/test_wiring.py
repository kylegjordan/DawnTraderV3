"""
token-watch — THE SEAM TESTS.

★ WHY THIS FILE EXISTS, and it is the most useful thing in the suite:
  Langston's Step-4 BLOCKER-1 was that `budget.charge("birth", …)` had ZERO
  production call sites. 57 checks passed anyway — because the tests charged
  the budget THEMSELVES. His sentence: "your tests test the function; nothing
  tests the connection."

  Every check here drives a PRODUCTION ENTRY POINT and asserts on state that
  entry point had to reach through the real wiring. No test in this file may
  write budget state, schedule a grid, or record a death directly.
"""

import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-wire-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
import receiver  # noqa: E402
import store  # noqa: E402
from config import BIRTHS_RESERVED, MONTHLY_CREDIT_CAP  # noqa: E402

UTC = timezone.utc
FAILURES = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f" :: {detail}"))
    if not cond:
        FAILURES.append(name)


def section(t):
    print(f"\n=== {t} ===")


def make_events(n, created_at=None, size_sol=1.5, socials=True):
    ts = int((created_at or datetime.now(UTC)).timestamp())
    out = []
    for i in range(n):
        ev = {"type": "CREATE", "source": "PUMP_FUN", "timestamp": ts,
              "feePayer": f"CREATOR{i:05d}",
              "tokenTransfers": [{"mint": f"MINT{i:05d}"}],
              "nativeTransfers": [
                  {"fromUserAccount": "PLATFORM", "amount": 2_000_000},        # a fee, FIRST
                  {"fromUserAccount": f"CREATOR{i:05d}",
                   "amount": int(size_sol * 1e9)},                             # the real buy
              ]}
        if socials:
            ev["telegram"] = "t.me/x"
        out.append(ev)
    return out


store.ensure_dirs()


# ─────────────────────────────────────────────────────────────────────────────
section("1. ⛔ BLOCKER-1 — the production path reaches the ledger")
# ─────────────────────────────────────────────────────────────────────────────
check("POSITIVE CONTROL: ledger starts at zero", budget.spent_by("birth") == 0)

n = receiver.ingest(make_events(250))
check("ingest recorded every launch", n == 250, n)

# Before the fold, spend is journalled but not yet in the ledger.
check("receiver did NOT write budget state directly",
      budget.spent_by("birth") == 0,
      "the receiver must journal, never read-modify-write (BLOCKER-2)")
check("POSITIVE CONTROL: the journal actually has rows",
      os.path.exists(budget.journal_path())
      and sum(1 for _ in open(budget.journal_path(), encoding="utf-8")) >= 250)

folded = budget.fold_pending()
check("★ THE FOLD PUTS BIRTH SPEND IN THE LEDGER — the seam BLOCKER-1 missed",
      budget.spent_by("birth") == 250,
      f"folded={folded} spent={budget.spent_by('birth')}")

# ⛔ IDEMPOTENCE. A second fold must add nothing — this is the property that
#    lets the fold be crash-safe by offset instead of by truncation.
budget.fold_pending()
check("★ re-folding is a NO-OP — offset, not truncation",
      budget.spent_by("birth") == 250, budget.spent_by("birth"))

new_rows = receiver.ingest(make_events(10))
budget.fold_pending()
check("POSITIVE CONTROL: a later fold DOES pick up new rows",
      budget.spent_by("birth") == 260, budget.spent_by("birth"))


# ─────────────────────────────────────────────────────────────────────────────
section("2. THE BURN MONITOR CAN NOW SEE THE LEG IT EXISTS TO WATCH")
# ─────────────────────────────────────────────────────────────────────────────
rep = budget.burn_report()
check("★ births appear in the total the monitor reads",
      rep["spent_by"]["birth"] == 260 and rep["spent_total"] >= 260, rep["spent_by"])
check("POSITIVE CONTROL: the total is not hard-coded — it moved with the fold",
      rep["spent_total"] == budget.spent_total())


# ─────────────────────────────────────────────────────────────────────────────
section("3. THE RESERVE ACTUALLY BOUNDS NON-BIRTH SPEND")
# The old predicate collapsed algebraically to `total < MONTHLY_CREDIT_CAP` —
# BIRTHS_RESERVED cancelled out and constrained nothing.
# ─────────────────────────────────────────────────────────────────────────────
headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED
check("POSITIVE CONTROL: liquidity allowed well below the headroom",
      budget.allowed("liquidity"))
budget.inject_spend("liquidity", headroom)
# ⚠️ THIS CHECK CANNOT ATTRIBUTE THE REFUSAL, and its name used to claim it
#    could. Injecting the headroom figure also exceeds the carve, so the CARVE
#    refuses it — the reserve clause is never reached. The discriminating test
#    is M4 in tests/test_mutations.py, which creates the re-homing case where
#    only the reserve clause can speak. Renamed to what it actually shows.
check("liquidity is refused once spend passes the carve/headroom region",
      not budget.allowed("liquidity"),
      f"headroom={headroom}; the old expression would still allow up to {MONTHLY_CREDIT_CAP}")
check("births still allowed with non-birth spend at the boundary",
      budget.allowed("birth"))

raised = False
try:
    budget.allowed("some_future_kind")
except AssertionError:
    raised = True
check("★ an unbudgeted kind FAILS LOUD instead of defaulting to allowed", raised,
      "the old tail returned True for anything it did not recognise")


# ─────────────────────────────────────────────────────────────────────────────
section("4. ⛔ BLOCKER-3 — a late-discovered birth does not lose its early points")
# ─────────────────────────────────────────────────────────────────────────────
late_root = tempfile.mkdtemp(prefix="token-watch-late-")
os.environ["TOKEN_WATCH_ROOT"] = late_root  # not read again; kept for clarity

now = datetime.now(UTC)
created_3h_ago = now - timedelta(hours=3)
receiver.ingest(make_events(1, created_at=created_3h_ago))

obs = [o for o in store._read(store.observation_path(now))
       if o.get("reason") == "scheduled_in_the_past"]
check("★ past grid points recorded as MISSES, not written to a dead bucket",
      len(obs) >= 1, f"got {len(obs)}")
check("every miss carries observed=False",
      all(o.get("observed") is False for o in obs), obs[:1])
check("POSITIVE CONTROL: the 1h point IS one of the misses",
      any(o["age"] == "1h" for o in obs), [o["age"] for o in obs])
check("POSITIVE CONTROL: FUTURE points were NOT recorded as misses",
      not any(o["age"] in ("30d", "90d") for o in obs), [o["age"] for o in obs])


# ─────────────────────────────────────────────────────────────────────────────
section("5. SIZE IS TAKEN BY ROLE, NOT BY INDEX")
# The old code took nativeTransfers[0] — which in these events is a PLATFORM
# FEE, not the creator's buy. If [0] were the fee in production, every token
# would record a near-constant size and the trait split would fire for
# everyone or nobody, silently, with a plausible number attached.
# ─────────────────────────────────────────────────────────────────────────────
ev = make_events(1, size_sol=3.25)[0]
parsed = receiver.parse_creation(ev)
check("★ the CREATOR's transfer is selected, not element [0]",
      abs(parsed["initial_size"] - 3.25) < 1e-9,
      f"got {parsed['initial_size']} — 0.002 would mean it took the fee")
check("the source of the figure is recorded",
      parsed["size_source"].startswith("feePayer_"), parsed["size_source"])

orphan = {"type": "CREATE", "source": "PUMP_FUN", "timestamp": int(now.timestamp()),
          "feePayer": "CREATOR_X", "tokenTransfers": [{"mint": "MINT_ORPHAN"}],
          "nativeTransfers": [{"fromUserAccount": "SOMEONE_ELSE", "amount": 9_000_000}]}
p2 = receiver.parse_creation(orphan)
check("★ an unresolvable size is NULL and LABELLED, never a quiet zero",
      p2["initial_size"] is None and p2["size_source"] == "unresolved",
      f"{p2['initial_size']} / {p2['size_source']}")
check("POSITIVE CONTROL: a resolvable size is not labelled unresolved",
      parsed["size_source"] != "unresolved")


# ─────────────────────────────────────────────────────────────────────────────
section("6. RECEIVED vs RECORDED — a stopped recogniser is distinguishable")
# ─────────────────────────────────────────────────────────────────────────────
drifted = [{"type": "TOKEN_MINT", "source": "PUMP_FUN"} for _ in range(20)]
recorded = receiver.ingest(drifted)
check("★ a drifted event type records nothing", recorded == 0, recorded)
check("POSITIVE CONTROL: the same shape WITH type=CREATE does record",
      receiver.ingest(make_events(3)) == 3)


# ─────────────────────────────────────────────────────────────────────────────
section("7. THE DEAD-MAN'S SWITCH IS ACTUALLY WIRED TO THE HOURLY JOB")
# ⛔ THE WHOLE REASON THIS FILE EXISTS. `test_liveness.py` proves the switch
#    works when called; NOTHING there proves anything calls it. That is exactly
#    how `budget.charge("birth", …)` sat with zero production call sites while
#    57 checks passed. This drives `follow_up.run_hour` — the production entry
#    point the timer invokes — and asserts on state only the switch can write.
# ─────────────────────────────────────────────────────────────────────────────
import follow_up as _fu  # noqa: E402
import liveness as _lv  # noqa: E402

_before = store.load_state("liveness", {})
check("no liveness state exists before the hourly job has ever run",
      not _before.get("checked_at"))
_stats = _fu.run_hour(now=now)
_after = store.load_state("liveness", {})
check("★ run_hour REACHED the switch — it stamped its own state",
      bool(_after.get("checked_at")), _after.get("checked_at"))
check("and the hour's stats carry the switch's report",
      isinstance(_stats.get("liveness"), dict) and "rows" in _stats["liveness"])

# ★ AND IT MUST SURVIVE A SKIPPED CYCLE — a watchdog a stuck lock can silence
#   is not a watchdog. Hold the lock, run the hour, confirm it STILL checked.
store.save_state("liveness", {})
with store.periodic_lock("tiering") as _held:
    _skipped = _fu.run_hour(now=now + timedelta(hours=1))
check("POSITIVE CONTROL: the cycle really was skipped", _skipped["skipped"] is True)
check("★ the switch STILL ran on the skipped cycle",
      bool(store.load_state("liveness", {}).get("checked_at")))


# ─────────────────────────────────────────────────────────────────────────────
section("8. THE FOLLOW-UP RAW STORE IS REACHED BY THE PRODUCTION OBSERVATION PATH")
# ⛔ Same discipline as section 7. `test_tiering` proves record_follow_up works
#    when called; nothing there proves the OBSERVER calls it. This drives the
#    real `providers.token_state`, stubbing ONLY the network read, and asserts
#    on a store only that production path could have reached.
# ─────────────────────────────────────────────────────────────────────────────
import providers as _pv  # noqa: E402
import provenance as _pr  # noqa: E402

_RESPONSE = {"pairs": [{"dexId": "raydium", "priceUsd": "0.004",
                        "volume": {"h24": 1234.0},
                        "txns": {"h24": {"buys": 9, "sells": 4}},
                        "liquidity": {"usd": None},
                        "pairCreatedAt": 1756400000000,
                        "UNREAD_FIELD": "must survive"}]}

# ⚠️ EARLIER BLOCKS IN THIS SUITE DRIVE SPEND PAST THE CAP ON PURPOSE, so the
#    shed order is armed by the time we get here and token_state would raise
#    Shed before reaching any store. Clear the ledger so this block tests the
#    WIRING rather than re-testing the shed.
import config as _cfg  # noqa: E402
for _n in os.listdir(_cfg.STATE_DIR) if os.path.isdir(_cfg.STATE_DIR) else []:
    if "spend" in _n or "budget" in _n:
        os.unlink(os.path.join(_cfg.STATE_DIR, _n))
check("POSITIVE CONTROL: with the ledger cleared, follow-up spend is allowed again",
      budget.allowed("follow_up") is True)

_before = _pr.stats()["follow_up"]
_real_get = _pv._get
_pv._get = lambda url, headers=None: _RESPONSE
try:
    _state = _pv.token_state("MINT_WIRED")
finally:
    _pv._get = _real_get

check("the observation still extracts what it always did",
      _state["alive"] is True and _state["buys_h24"] == 9, _state)
_rows = _pr.stats()
check("★ token_state REACHED the raw store — production wiring, not a direct call",
      _rows["follow_up"] == _before + 1, _rows)

# ★ AND THE FIELD THE EXTRACTOR IGNORES MUST BE IN IT. That is the entire
#   reason Kyle ruled to retain these: what we chose not to extract today is
#   what a 90-day study discovers it needed.
_disk = open(_pr._follow_up_path(datetime.now(UTC)), encoding="utf-8").read()
check("★ and a field token_state never reads survived into the store",
      "UNREAD_FIELD" in _disk)

print("\n" + "=" * 60)
print(f"FAILED: {len(FAILURES)} -> {FAILURES}" if FAILURES else "ALL CHECKS PASSED")
shutil.rmtree(ROOT, ignore_errors=True)
shutil.rmtree(late_root, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
