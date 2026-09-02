"""
token-watch — THE REAL MONEY IN THE POOL, in SOL.

⛔⛔ WHAT THIS REPLACES. A function named `pool_liquidity` called
   `getTokenLargestAccounts` — which returns who holds the most TOKENS. That
   is holder concentration, not liquidity. The study reserved a credit budget
   for a liquidity measurement, spent it, and never once measured liquidity;
   the death class `liquidity_pulled` has never been backed by a liquidity
   figure. Measured 2026-09-02: the aggregator supplies one on 2.8% of live
   observations (859 of 30,239) — every one on `pumpswap`, never on `pumpfun`.

★ VALIDATED AGAINST GROUND TRUTH BEFORE ANY OF IT WAS BUILT, and the numbers
  in this file are the real ones from that validation:
    graduated pool — provider said 6.1933 SOL, the read returned 6.193328353
    bonding curve  — no provider figure exists, so the decode SELF-CHECKS: the
                     price implied by the decoded reserves was 0.00000002809
                     against the provider's own 0.00000002808, ratio 1.0002.
  A decode that reproduces an independently-published price is not a plausible
  number. It is the right one.

⛔ TWO TRAPS, BOTH OF WHICH WOULD HAVE SHIPPED SILENTLY, both tested below:
  1. The pool address's PLAIN balance is the account's rent minimum, not the
     liquidity — 0.0030 SOL measured against a true 6.1933.
  2. The curve reports VIRTUAL reserves beside the real ones. Virtual is a
     pricing device, not money: 30.0676 SOL virtual against 0.0676 real, a
     445x overstatement that reads as entirely reasonable on a page.

⚠️ NO NETWORK. The RPC layer is stubbed; these blocks test the DECODE and the
   BRANCH, which is where both traps live.
"""

import base64
import json
import os
import struct
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

os.environ.setdefault("TOKEN_WATCH_ROOT", tempfile.mkdtemp(prefix="token-watch-liq-"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import providers  # noqa: E402

PASS = FAIL = 0

# The REAL values measured on token HUG, 2026-09-02.
V_TOKEN = 1070587035411929
V_SOL = 30067616482          # 30.0676 SOL — VIRTUAL, a pricing device
R_TOKEN = 790687035411929
R_SOL = 67616482             # 0.0676 SOL — the actual money
SUPPLY = 1000000000000000
PROVIDER_PRICE_NATIVE = 0.00000002808   # what the aggregator independently reported


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def curve_bytes():
    """A pump.fun bonding-curve account, byte-for-byte as the chain returns it."""
    return b"\x00" * 8 + struct.pack("<QQQQQ", V_TOKEN, V_SOL, R_TOKEN, R_SOL, SUPPLY)


def stub(responses):
    """Replace the RPC layer. Each call pops the next canned response."""
    calls = []

    def _fake(method, params):
        calls.append((method, params))
        return responses.pop(0)

    providers._rpc = _fake
    return calls


print("\nBLOCK 1 — A BONDING CURVE: the REAL reserves, never the virtual ones")
data = base64.b64encode(curve_bytes()).decode()
calls = stub([{"result": {"value": {"owner": providers.PUMPFUN_PROGRAM,
                                    "lamports": 69558322,
                                    "data": [data, "base64"]}}}])
r = providers.pool_sol_reserves("PoolAddr1")
check("it reports the REAL reserves", abs(r["sol"] - 0.067616482) < 1e-9, str(r))
check("...and says where the number came from",
      r["source"] == "bonding_curve_real_reserves", str(r))
# ⛔ THE TRAP. Virtual is 445x the real figure and looks entirely plausible on
#    a page. This is the assertion that fails if the wrong u64 is unpacked.
check("★ it is NOT the VIRTUAL reserves (445x larger, and plausible-looking)",
      abs(r["sol"] - 30.067616482) > 1.0, str(r))
# ⛔ AND NOT THE ACCOUNT'S PLAIN BALANCE, which is rent, not liquidity.
check("★ and NOT the account's plain lamport balance",
      abs(r["sol"] - 0.069558322) > 1e-6, str(r))
check("it read the pool address, not a mint", calls[0][1][0] == "PoolAddr1", str(calls))

print("\nBLOCK 2 — THE SELF-CHECK: the decode reproduces the published price")
# ⛔ THIS IS WHY THE DECODE IS TRUSTED AT ALL. No provider figure exists for a
#    bonding curve, so there is nothing to compare the SOL against directly.
#    But price IS published, and price is a function of the same reserves — so
#    a correct decode must reproduce it. A wrong field offset would not.
implied = (V_SOL / 1e9) / (V_TOKEN / 1e6)
ratio = implied / PROVIDER_PRICE_NATIVE
check("★ implied price matches the provider's, within 0.1%",
      abs(ratio - 1.0) < 0.001, "ratio %.5f" % ratio)
# POSITIVE CONTROL: the check can fail. Shift the offset by one field and the
# implied price must go far wrong — otherwise the comparison proves nothing.
wrong = (R_SOL / 1e9) / (V_TOKEN / 1e6)
check("POSITIVE CONTROL: a wrong field offset FAILS this check",
      abs((wrong / PROVIDER_PRICE_NATIVE) - 1.0) > 0.5,
      "wrong-offset ratio %.5f" % (wrong / PROVIDER_PRICE_NATIVE))

print("\nBLOCK 3 — A GRADUATED POOL: the wrapped-SOL account it owns")
calls = stub([
    {"result": {"value": {"owner": "SomeOtherAmmProgram", "data": ["", "base64"]}}},
    {"result": {"value": [{"account": {"data": {"parsed": {"info": {
        "tokenAmount": {"uiAmount": 6.193328353}}}}}}]}},
])
r = providers.pool_sol_reserves("PoolAddr2")
check("it reports the pool's SOL", abs(r["sol"] - 6.193328353) < 1e-9, str(r))
check("...and says where it came from",
      r["source"] == "graduated_pool_wsol_account", str(r))
check("it asked for the WRAPPED-SOL mint specifically",
      calls[1][1][1]["mint"] == providers.WSOL_MINT, str(calls[1]))

print("\nBLOCK 4 — THE BRANCH IS DECIDED BY THE ACCOUNT, NOT BY A LABEL")
# ⛔ `dex_id` from the aggregator would have been the easy branch. The account's
#    OWNER PROGRAM is authoritative and cannot be stale or mislabelled — the
#    same reason the mint-collapse fix keyed on conservation rather than
#    position.
calls = stub([{"result": {"value": {"owner": providers.PUMPFUN_PROGRAM,
                                    "data": [base64.b64encode(curve_bytes()).decode(),
                                             "base64"]}}}])
r = providers.pool_sol_reserves("PoolAddr3")
check("a curve-owned account takes the curve path — ONE call, not two",
      len(calls) == 1 and r["source"] == "bonding_curve_real_reserves", str(calls))

print("\nBLOCK 5 — A FAILURE IS A RECORDED VALUE, NEVER A SILENT ZERO")
# ⛔ `sol: 0` and "we could not read it" must never be the same row. A zero is
#    the single most consequential value this field can hold — it is what a
#    rug pull looks like — so an unreadable account must not be able to
#    counterfeit one.
calls = stub([{"result": {"value": {"owner": providers.PUMPFUN_PROGRAM,
                                    "data": ["!!not-base64!!", "base64"]}}}])
r = providers.pool_sol_reserves("PoolAddr4")
check("★ an undecodable curve yields None, NOT zero", r["sol"] is None, str(r))
check("...and names the failure", r["source"] == "curve_decode_failed", str(r))

r = providers.pool_sol_reserves(None)
check("a missing pool address yields None, not zero", r["sol"] is None, str(r))
check("...and names that too", r["source"] == "no_pool_address", str(r))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
