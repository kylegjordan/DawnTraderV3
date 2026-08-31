"""
token-watch — THE SOCIALS CHECK AND PROMOTION SWEEP (#973).

⛔⛔ BLOCK 3 AND BLOCK 9 ARE WHY THIS SUITE EXISTS. At birth only SIZE is
   knowable, so a control drawn there comes from "not big enough" — NOT from
   "not a carrier". A control token with a channel is a CARRIER SITTING INSIDE
   THE COMPARISON GROUP, and it would bias every rate the study reports
   without ever announcing itself.

★ THE DESIGN REMOVES THAT RATHER THAN CORRECTING IT (Kyle, 2026-08-31): a
  non-carrier is `deferred` at birth, in no arm, and the sweep assigns ONE arm
  once both facts are known. Block 9 proves both directions with a single mint
  that hashes INTO the draw: without a channel it becomes control; WITH one it
  becomes a carrier and never reaches the draw at all.
"""

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-prom-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import promote  # noqa: E402
import providers  # noqa: E402
import store  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
NOW = datetime(2026, 8, 31, 12, 0, 0, tzinfo=UTC)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % detail) if detail else ""))


def reset():
    for n in os.listdir(ROOT):
        shutil.rmtree(os.path.join(ROOT, n), ignore_errors=True)
        try:
            os.unlink(os.path.join(ROOT, n))
        except (OSError, PermissionError):
            pass
    store.ensure_dirs()


def birth(mint, reason, followed, created=None):
    """Through the PRODUCTION writer."""
    return store.record_birth(
        mint=mint, created_at=created or (NOW - timedelta(minutes=30)),
        first_seen_at=created or (NOW - timedelta(minutes=30)),
        venue="PUMP_FUN", initial_size=0.1, initial_liquidity=None, creator="C",
        size_source="feePayer_sole_transfer", socials={}, followed=followed,
        follow_reason=reason)


def stub(mapping):
    """Replace ONLY the network read; token_state itself still runs."""
    real = providers._get
    providers._get = lambda url, headers=None: {
        "pairs": [{"volume": {"h24": 5.0}, "txns": {"h24": {}},
                   "liquidity": {"usd": 1.0}, "dexId": "pumpfun",
                   "info": {"socials": [{"type": t} for t in
                                        mapping.get(url.rsplit("/", 1)[-1], [])]}}]
    }
    return real




def stub_nopair():
    """The provider indexes nothing for this token yet.

    This is the BLOCKER-A case: `token_state` returns evidence=no_pairs_returned
    and socials=None. It is NOT "no channels" -- it is "we could not look".
    """
    real = providers._get
    providers._get = lambda url, headers=None: {"pairs": []}
    return real


def checks():
    if not os.path.exists(promote.CHECKS_PATH):
        return []
    with open(promote.CHECKS_PATH, encoding="utf-8") as fh:
        return [json.loads(x) for x in fh if x.strip()]


print("\n=== 1. A TOKEN WITH NO CHANNEL IS RECORDED AS CHECKED, NOT SKIPPED")
reset()
birth("NOSOC1", "deferred", False)
real = stub({})
try:
    st = promote.run(NOW)
finally:
    providers._get = real
check("it was checked", st["checked"] == 1, st)
check("no channel found", st["with_channel"] == 0, st)
check("not scheduled - no channel and not drawn into the control",
      st["scheduled"] == 0, st)
rows = checks()
check("★ the NEGATIVE result is PERSISTED — 'checked, none' must be "
      "distinguishable from 'never checked'", len(rows) == 1, rows)
check("and it records what it stayed", rows[0]["becomes"] in ("not_sampled", "control_sample"), rows[0])
check("with the age it was observed at, so it cannot read as 'at launch'",
      rows[0]["observed_at_age_s"] is not None and rows[0]["observed_at_age_s"] > 0,
      rows[0].get("observed_at_age_s"))

print("\n=== 2. A NON-FOLLOWED TOKEN WITH A CHANNEL IS PROMOTED AND SCHEDULED")
reset()
birth("HASX", "deferred", False)
real = stub({"HASX": ["twitter"]})
try:
    st = promote.run(NOW)
finally:
    providers._get = real
check("the channel is seen", st["with_channel"] == 1, st)
check("★ and it is PROMOTED", st["scheduled"] == 1, st)
check("the check records the new arm", checks()[0]["becomes"] == "trait_carrier")
# ★ Promotion is worthless unless it actually starts being followed.
due = []
for name in os.listdir(os.path.join(ROOT, "due")):
    with open(os.path.join(ROOT, "due", name), encoding="utf-8") as fh:
        due += [json.loads(x) for x in fh if x.strip()]
check("★ its observation grid was SCHEDULED — promotion without a schedule "
      "would be a label change and nothing else",
      any(e["mint"] == "HASX" for e in due), len(due))

print(chr(10) + "=== 3. ONE ASSIGNMENT, MADE ONCE - no token ever changes arm")
# * KYLE'S DESIGN, better than the reclassification it replaced: do not make
#   the wrong assignment and then correct it - do not make it yet. The control
#   is drawn HERE, from tokens CONFIRMED to have no channel, which is the
#   population it was always meant to sample. Drawn at birth it came from
#   "not big enough", a different and wrong set.
reset()
birth("CARRIER", "deferred", False)
birth("PLAINX", "deferred", False)
real = stub({"CARRIER": ["telegram"]})
try:
    st = promote.run(NOW)
finally:
    providers._get = real
by = {r["mint"]: r for r in checks()}
check("* the one WITH a channel is assigned carrier",
      by["CARRIER"]["becomes"] == "trait_carrier", by.get("CARRIER"))
check("* the one without is control or not-sampled - never carrier",
      by["PLAINX"]["becomes"] in ("control_sample", "not_sampled"), by.get("PLAINX"))
check("NOTHING was reclassified - the stat does not exist any more",
      "reclassified_control" not in st, st)
check("every token arrived DEFERRED, so none was in an arm to be moved out of",
      all(r["was"] == "deferred" for r in checks()), [r["was"] for r in checks()])

# A RESOLVED TOKEN IS NEVER RECONSIDERED. A second look is how an arm
# assignment starts moving again, which is what this design removes.
real = stub({"CARRIER": ["telegram"], "PLAINX": ["twitter"]})
try:
    st2 = promote.run(NOW + timedelta(hours=1))
finally:
    providers._get = real
check("* a resolved token is NOT re-examined even if its channels change",
      st2["checked"] == 0, st2)
check("and no second record was written", len(checks()) == 2, len(checks()))

print("\n=== 4. AN EXISTING CARRIER IS NEVER LOOKED UP — no wasted request")
reset()
birth("BIG", "trait_carrier", True)
real = stub({"BIG": ["twitter"]})
try:
    st = promote.run(NOW)
finally:
    providers._get = real
check("★ no lookup at all — its channels cannot change what we do with it",
      st["checked"] == 0, st)
check("and nothing was written", checks() == [])

print("\n=== 5. THE CURSOR — a token is checked ONCE, not every hour")
reset()
birth("ONCE", "deferred", False)
real = stub({})
try:
    a = promote.run(NOW)
    b = promote.run(NOW + timedelta(hours=1))
finally:
    providers._get = real
check("checked on the first pass", a["checked"] == 1, a)
check("★ NOT re-checked on the second", b["checked"] == 0, b)
check("and only one record exists", len(checks()) == 1, len(checks()))

print("\n=== 6. A SHED STOPS THE SWEEP WITHOUT LOSING THE TOKEN")
reset()
birth("SHED1", "deferred", False)
real = providers._get
def _raise(url, headers=None):
    raise providers.Shed("follow_up")
providers.token_state, _real_ts = (lambda m: (_ for _ in ()).throw(providers.Shed("x"))), providers.token_state
try:
    st = promote.run(NOW)
finally:
    providers.token_state = _real_ts
    providers._get = real
check("★ the shed is REPORTED, not silent", st["shed"] is True, st)
check("nothing was checked", st["checked"] == 0, st)
# ⛔ THE POINT: the token must come back next hour, not be lost.
real = stub({"SHED1": ["twitter"]})
try:
    st2 = promote.run(NOW + timedelta(hours=1))
finally:
    providers._get = real
check("★ and the token is picked up on the NEXT pass — a shed defers, "
      "it does not discard", st2["checked"] == 1 and st2["scheduled"] == 1, st2)

print("\n=== 7. THE PER-RUN BOUND HOLDS AND REPORTS WHAT IT LEFT")
reset()
saved = promote.MAX_CHECKS_PER_RUN
promote.MAX_CHECKS_PER_RUN = 3
for i in range(7):
    birth("M%d" % i, "deferred", False)
real = stub({})
try:
    st = promote.run(NOW)
finally:
    providers._get = real
    promote.MAX_CHECKS_PER_RUN = saved
check("the bound holds", st["checked"] == 3, st)
check("★ and what it left behind is COUNTED, not silently dropped",
      st["bounded_out"] > 0, st)

print(chr(10) + "=== 8. THE TWO SHED CAUSES ARE DISTINGUISHABLE (found live)")
# The first live run reported shed:True with the budget at 0.4% of cap -- a
# provider 429 and an exhausted credit budget raised the same bare flag. They
# need opposite responses: slow down, versus stop until the month rolls.
for _msg, _want in (("follow_up rate-limited", "rate_limited"), ("follow_up", "budget")):
    reset()
    birth("S_%s" % _want, "deferred", False)
    _real_ts2 = providers.token_state
    providers.token_state = (lambda m, _m=_msg: (_ for _ in ()).throw(providers.Shed(_m)))
    try:
        st = promote.run(NOW)
    finally:
        providers.token_state = _real_ts2
    check("a %s shed is NAMED %s, not just flagged" % (_msg, _want),
          st["shed"] is True and st["shed_reason"] == _want, st)

reset()
# PACING NEEDS MORE THAN ONE REQUEST TO BE VISIBLE. The first version of this
# check used a single token, so there was no interval to measure and it read
# 0.03s -- the TEST was wrong, not the code. Three tokens means two gaps.
for _i in range(3):
    birth("PACED%d" % _i, "deferred", False)
_r = stub({})
_t0 = __import__("time").monotonic()
try:
    _pst = promote.run(NOW)
finally:
    providers._get = _r
_elapsed = __import__("time").monotonic() - _t0
check("all three were checked", _pst["checked"] == 3, _pst)
check("* requests are PACED - three checks take at least two intervals",
      _elapsed >= promote._MIN_INTERVAL_S * 2, "%.3fs for 3 checks" % _elapsed)

print(chr(10) + "=== 9. THE CONTROL IS DRAWN FROM CONFIRMED NON-CARRIERS")
# The whole point of the deferral. C00012 hashes INTO the control draw.
reset()
birth("C00012", "deferred", False)
_r = stub({})                       # no channel -> eligible for the control
try:
    st = promote.run(NOW)
finally:
    providers._get = _r
check("* a confirmed non-carrier IS drawn into the control",
      st["control_drawn"] == 1 and checks()[0]["becomes"] == "control_sample", st)
check("and it is scheduled, so the control arm is actually observed",
      st["scheduled"] == 1, st)

# NEGATIVE CONTROL: the SAME mint, but WITH a channel, must never reach the
# control draw -- that is precisely the contamination the old order allowed.
reset()
birth("C00012", "deferred", False)
_r = stub({"C00012": ["twitter"]})
try:
    st = promote.run(NOW)
finally:
    providers._get = _r
check("* NEGATIVE CONTROL - the same mint WITH a channel is a carrier, "
      "never a control", st["control_drawn"] == 0
      and checks()[0]["becomes"] == "trait_carrier", st)

print(chr(10) + "=== 10. BLOCKER-A: A NO-PAIR LOOKUP IS UNRESOLVED, NOT A NON-CARRIER")
# The provider returning no pair is what an INDEXING GAP looks like as well as
# a dead token -- providers.py says so in its own comment -- and its indexing
# latency is UNMEASURED (A2.2). Treating it as "confirmed no channels" hung the
# arm assignment on an unmeasured quantity, in the ADVERSE direction: no-pairs
# correlates with dying fast, which is the outcome. Measured live: 4 of 385.
reset()
birth("C00012", "deferred", False)      # this mint hashes INTO the control draw
_r = stub_nopair()
try:
    st = promote.run(NOW)
finally:
    providers._get = _r
check("* it is counted as UNRESOLVED, with its own counter",
      st["unresolved_no_pairs"] == 1, st)
check("** and it is NOT drawn into the control, though the mint qualifies",
      st["control_drawn"] == 0, st)
check("no arm was assigned - it stays deferred for another look",
      checks()[0]["becomes"] == "deferred", checks()[0])
check("* the record NAMES why it is unresolved",
      checks()[0]["socials_status"] == "no_pairs", checks()[0])
check("* and had_channel is None, not False - we did not observe an absence",
      checks()[0]["had_channel"] is None, checks()[0])

# POSITIVE CONTROL: the SAME mint, once the provider resolves, IS drawn.
_r = stub({})
try:
    st2 = promote.run(NOW + timedelta(hours=1))
finally:
    providers._get = _r
check("* POSITIVE CONTROL - once resolved, the same mint IS drawn into control",
      st2["control_drawn"] == 1, st2)

print(chr(10) + "=== 11. BLOCKER-A: the retry is BOUNDED and ends on the record")
reset()
birth("NEVER", "deferred", False)
_r = stub_nopair()
try:
    runs = [promote.run(NOW + timedelta(hours=h)) for h in range(4)]
finally:
    providers._get = _r
check("it is retried, not abandoned on the first miss",
      sum(r["unresolved_no_pairs"] for r in runs) == promote.MAX_RESOLUTION_ATTEMPTS,
      [r["unresolved_no_pairs"] for r in runs])
check("* the retry is BOUNDED - it does not loop for ever",
      sum(r["resolution_exhausted"] for r in runs) == 1,
      [r["resolution_exhausted"] for r in runs])
last = checks()[-1]
check("** it ends in `unresolved` - NEITHER carrier NOR control, so it can "
      "never contaminate the comparison group",
      last["becomes"] == "unresolved", last)
check("and it is excludable BY NAME, not by inference",
      last["mint"] == "NEVER" and last["attempts"] == promote.MAX_RESOLUTION_ATTEMPTS,
      last)

print(chr(10) + "=== 12. BLOCKER-B: A FAILED CHECK IS RECORDED, NOT DROPPED")
# The error path used to log a counter and advance the cursor, so the token
# stayed deferred FOR EVER -- in no arm, never scheduled, with no row saying
# why, and the only trace an integer that cannot be joined to a mint.
reset()
birth("BOOM", "deferred", False)
_real_ts3 = providers.token_state
providers.token_state = (lambda m: (_ for _ in ()).throw(RuntimeError("provider exploded")))
try:
    st = promote.run(NOW)
finally:
    providers.token_state = _real_ts3
check("the failure is counted", st["errors"] == 1, st)
check("** and A RECORD EXISTS - the third state is not recorded as neither",
      len(checks()) == 1, checks())
check("* the record names the failure and carries the mint",
      checks()[0]["socials_status"] == "error"
      and "provider exploded" in checks()[0]["error"]
      and checks()[0]["mint"] == "BOOM", checks()[0])
check("it stays deferred for a retry rather than vanishing",
      checks()[0]["becomes"] == "deferred", checks()[0])

# POSITIVE CONTROL: it really does come back and resolve.
_r = stub({"BOOM": ["twitter"]})
try:
    st2 = promote.run(NOW + timedelta(hours=1))
finally:
    providers._get = _r
check("* POSITIVE CONTROL - the failed token returns and is assigned",
      st2["checked"] == 1 and checks()[-1]["becomes"] == "trait_carrier", st2)

print(chr(10) + "=== 13. BLOCKER-C: A COLLAPSED MINT IS SUBSTITUTED, NOT SWEPT AS-IS")
# The census is append-only, so the 19 pre-fix birth rows still carry USDC. A
# sweep reading them at face value would look up USDC (whose channels always
# resolve), assign it to the TREATMENT arm, and re-create the contamination
# the conservation fix removed.
reset()
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
REAL = "3ESCWpPJQbau34D77Pw1bGB19E2kXZSeWvedqC9apump"
birth(USDC, "deferred", False)
os.makedirs(os.path.dirname(promote.CORRECTIONS_PATH), exist_ok=True)
with open(promote.CORRECTIONS_PATH, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"recorded_mint": USDC, "corrected_mint": REAL}) + chr(10))
_r = stub({USDC: ["twitter", "telegram"]})   # USDC always resolves channels
try:
    st = promote.run(NOW)
finally:
    providers._get = _r
rec = checks()[0]
check("* the substitution happened and is COUNTED", st["mint_corrected"] == 1, st)
check("** the REAL launched token is studied, not the payment currency",
      rec["mint"] == REAL, rec["mint"])
check("* and the collapsed mint is kept on the record, so it is auditable",
      rec["recorded_mint"] == USDC, rec)
check("** USDC did NOT reach the treatment arm off its own channels",
      rec["mint"] != USDC)

# POSITIVE CONTROL: an uncorrected mint is untouched.
reset()
os.makedirs(os.path.dirname(promote.CORRECTIONS_PATH), exist_ok=True)
with open(promote.CORRECTIONS_PATH, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"recorded_mint": USDC, "corrected_mint": REAL}) + chr(10))
birth("ORDINARY", "deferred", False)
_r = stub({})
try:
    st = promote.run(NOW)
finally:
    providers._get = _r
check("POSITIVE CONTROL - an uncorrected mint is swept unchanged",
      st["mint_corrected"] == 0 and checks()[0]["mint"] == "ORDINARY", st)

print("\n%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
