"""
token-watch — PROVIDER PACING: ONE LIMIT, ONE PACER, AT THE CHOKEPOINT.

⛔⛔ THE DEFECT THIS SUITE EXISTS FOR, MEASURED LIVE 2026-08-31: the
   observation sweep fired ~1,250 calls/hour -- SEVEN PERCENT of what the
   provider allows per DAY -- and had 40.5% REFUSED with HTTP 429, because it
   fired them in an unspaced burst. Being far under a DAILY limit says nothing
   about a per-MINUTE one.

★ AND THE PART THAT MAKES IT A CLASS RATHER THAN A BUG: the socials sweep had
  ALREADY hit this exact refusal on its first live run and had ALREADY been
  paced in response. The fix stayed in the caller it was written for. Two
  callers, one provider, one ceiling -- one paced at 240/min, the other not at
  all, and NEITHER knew the other was spending the same budget.

⇒ SO THE PACER LIVES AT `providers._get`, THE ONE FUNCTION EVERY PROVIDER CALL
  ALREADY PASSES THROUGH. Block 3 is the one that matters: it proves a caller
  cannot spend the budget without being paced, which is the property a
  per-caller pacer cannot have no matter how many callers implement it.

⚠️ NO NETWORK. `urlopen` is stubbed; these blocks time the PACER, not a host.
"""

import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ⛔ BEFORE importing config -- it reads the override at import time. A fast
#    rate keeps the suite quick while still being a REAL interval to measure.
os.environ["TOKEN_WATCH_REQ_PER_MIN"] = "600"          # 100 ms apart
os.environ.setdefault("TOKEN_WATCH_ROOT", os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "_pace_tmp"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import urllib.request  # noqa: E402

import config  # noqa: E402
import providers  # noqa: E402

INTERVAL = 60.0 / 600
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


class _Resp:
    def __init__(self, body):
        self._b = body.encode("utf-8")

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


_calls = []


def _stub_urlopen(req, timeout=None):
    _calls.append(time.monotonic())
    return _Resp('{"pairs": []}')


urllib.request.urlopen = _stub_urlopen

DEX = config.DEXSCREENER_BASE + "/latest/dex/tokens/AAA"
OTHER = "https://example.invalid/whatever"


def burst(url, n):
    _calls.clear()
    providers._LAST_CALL.clear()
    t0 = time.monotonic()
    for _ in range(n):
        providers._get(url)
    return time.monotonic() - t0


print("\nBLOCK 1 -- THE RATE IS CONFIGURED, NOT HARD-CODED, AND IT HAS A MARGIN")
check("the provider ceiling is recorded", config.DEXSCREENER_RATE_PER_MIN == 300,
      str(config.DEXSCREENER_RATE_PER_MIN))
check("the host we pace is the one we call",
      "api.dexscreener.com" in config.RATE_PER_MIN_BY_HOST,
      str(sorted(config.RATE_PER_MIN_BY_HOST)))
# The override is what makes this suite fast; without it the real 240/min
# would make a 6-call block take 1.5s and a realistic one take minutes.
check("the rate is overridable so a suite times the CODE, not a sleep",
      config.RATE_PER_MIN_BY_HOST["api.dexscreener.com"] == 600)

print("\nBLOCK 2 -- A BURST IS SPACED, AND THE UNPACED CASE IS THE CONTROL")
n = 6
elapsed = burst(DEX, n)
floor = (n - 1) * INTERVAL
check("%d calls took at least %.2fs" % (n, floor), elapsed >= floor,
      "elapsed %.3fs" % elapsed)
check("...and all %d actually went out" % n, len(_calls) == n, str(len(_calls)))
gaps = [b - a for a, b in zip(_calls, _calls[1:])]
check("every consecutive gap is at least the interval",
      all(g >= INTERVAL * 0.95 for g in gaps),
      "min gap %.4fs" % (min(gaps) if gaps else -1))

# ⛔ NEGATIVE CONTROL. Without this, a pacer that slept on EVERY host would
#    pass Block 2 identically -- and would throttle the launch feed, which has
#    no such limit and is the one leg we cannot afford to slow down.
un = burst(OTHER, n)
check("an unlisted host is NOT paced", un < floor / 2,
      "elapsed %.3fs vs paced floor %.2fs" % (un, floor))

print("\nBLOCK 3 -- TWO CALLERS SHARE ONE BUDGET  (THE ACTUAL DEFECT)")
# ⛔ THE DISCRIMINATING BLOCK. Both sweeps run in one process and hit the same
#    provider. Pacing each caller separately is correct for each and wrong for
#    the provider: their COMBINED rate is what gets refused.
providers._LAST_CALL.clear()
_calls.clear()
t0 = time.monotonic()
for i in range(6):
    # alternate the two real entry points into the same host
    if i % 2 == 0:
        providers._get(DEX)                       # as the observation sweep does
    else:
        providers._get(config.DEXSCREENER_BASE + "/latest/dex/tokens/BBB")
combined = time.monotonic() - t0
check("interleaved callers are spaced as ONE stream", combined >= 5 * INTERVAL,
      "elapsed %.3fs, needed %.2fs" % (combined, 5 * INTERVAL))
gaps = [b - a for a, b in zip(_calls, _calls[1:])]
check("no caller gets a free slot by being a different caller",
      all(g >= INTERVAL * 0.95 for g in gaps),
      "min gap %.4fs" % (min(gaps) if gaps else -1))

print("\nBLOCK 4 -- PACING IS NOT A RETRY, AND MUST NEVER BECOME ONE")
# ⛔ A retry would turn a refusal into a delay and DELETE THE SIGNAL: the shed
#    record is how the study knows a checkpoint was missed, and survival is
#    published as an UPPER BOUND only because those records exist. Pacing
#    PREVENTS the refusal; it must not swallow one that happens anyway.
import urllib.error  # noqa: E402


def _stub_429(req, timeout=None):
    _calls.append(time.monotonic())
    raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, None)


urllib.request.urlopen = _stub_429
_calls.clear()
raised = None
try:
    providers.token_state("SomeMint")
except Exception as exc:
    raised = exc
check("a 429 still surfaces as a shed, not a silent retry",
      type(raised).__name__ == "Shed", repr(raised))
check("...and it was attempted exactly once", len(_calls) == 1, str(len(_calls)))
check("...and the shed names the reason",
      "rate-limited" in str(raised), str(raised))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
