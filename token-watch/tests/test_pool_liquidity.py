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
import provenance  # noqa: E402

# ⛔ NEUTERED STRUCTURALLY, NOT BY TRUSTING AN ENV VAR (Langston, 2026-09-02).
#    `pool_sol_reserves` persists every raw response. These blocks drive it
#    with fabricated pool addresses, so a run with TOKEN_WATCH_ROOT unset
#    would inject invented rows into the study's own provenance corpus.
#    Verified none ever reached the live store -- 0 `PoolAddr` rows against 15
#    real ones as the control -- but "it happened not to" is not a guard.
provenance.record_follow_up = lambda *a, **k: None

PASS = FAIL = 0

# The REAL values measured on token HUG, 2026-09-02.
V_TOKEN = 1070587035411929
V_SOL = 30067616482          # 30.0676 SOL — VIRTUAL, a pricing device
R_TOKEN = 790687035411929
R_SOL = 67616482             # 0.0676 SOL — the actual money
SUPPLY = 1000000000000000
ZERO8 = bytes(8)          # the 8-byte account discriminator
QUOTE_SOL = bytes(32)     # an all-zero quote mint means native SOL
QUOTE_USDC = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")
PROVIDER_PRICE_NATIVE = 0.00000002808   # what the aggregator independently reported


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def curve_bytes(quote=None, length=115):
    """A pump.fun bonding-curve account, byte-for-byte as the chain returns it.

    THE TRAILING BYTES ARE NOT PADDING, AND THIS HELPER USED TO OMIT THEM.
       Byte 48 is the `complete` flag and bytes 83..115 hold the QUOTE MINT.
       Real accounts are 115 or 151 bytes -- measured over 2,199 of them, with
       no third length -- so a 48-byte stub is a shape the chain never returns,
       and a test built on one cannot see either field. Default is a live
       SOL-quoted curve: flag clear, quote mint all zeroes.
    """
    body = ZERO8 + struct.pack("<QQQQQ", V_TOKEN, V_SOL, R_TOKEN, R_SOL, SUPPLY)
    acct = bytearray(body + bytes(length - len(body)))
    if quote is not None:
        acct[83:115] = quote
    return bytes(acct)


_REAL_RPC = providers._rpc


def stub(responses):
    """Replace the RPC layer. Each call pops the next canned response.

    ⚠️ The real `_rpc` is captured above and restored at the end of the file.
       A stub left installed leaks into whatever imports this module next.
    """
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
# ⛔⛔ THIS BLOCK USED TO COMPUTE `implied` FROM THE MODULE CONSTANTS AND NEVER
#    TOUCH `r`. Langston: "delete `pool_sol_reserves` entirely and BLOCK 2
#    still passes." It asserted that I had typed consistent literals. It is
#    the block my own commit message called "why the decode is trusted at
#    all", and it fenced nothing -- the same shape he had already ruled on
#    once, a fence re-pointed at a function that hardcodes the asserted value.
# ⇒ THE RATIO NOW COMES OUT OF THE DECODER'S OWN OUTPUT.
calls = stub([{"result": {"value": {"owner": providers.PUMPFUN_PROGRAM,
                                    "lamports": 69558322,
                                    "data": [data, "base64"]}}}])
r2 = providers.pool_sol_reserves("PoolAddrSelfCheck")
ratio = r2["implied_price_native"] / PROVIDER_PRICE_NATIVE
check("★ the DECODER's implied price matches the provider's, within 0.1%",
      abs(ratio - 1.0) < 0.001, "ratio %.5f" % ratio)

# ⛔ POSITIVE CONTROL: feed the DECODER a byte layout with the fields shifted
#    by one slot. A control built from the same literals proves the arithmetic
#    can go wrong; only feeding the decoder bad BYTES proves the DECODER can.
shifted = ZERO8 + struct.pack("<QQQQQ", V_SOL, V_TOKEN, R_SOL, R_TOKEN, SUPPLY)
shifted = shifted + bytes(115 - len(shifted))
calls = stub([{"result": {"value": {"owner": providers.PUMPFUN_PROGRAM,
                                    "data": [base64.b64encode(shifted).decode(),
                                             "base64"]}}}])
r3 = providers.pool_sol_reserves("PoolAddrShifted")
bad = r3["implied_price_native"] / PROVIDER_PRICE_NATIVE
check("POSITIVE CONTROL: shifted BYTES make the decoder fail this check",
      abs(bad - 1.0) > 0.5, "shifted ratio %.5f" % bad)

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

print("")
print("BLOCK 6 -- REAL CURVES FROM THE CHAIN, REPLAYED THROUGH THE DECODER")
# THE VALIDATION THAT UNTIL NOW EXISTED ONLY AS CONSOLE OUTPUT. Langston,
#    2026-09-02: "the eight-token run is not in the repo... until it is one,
#    that validation is not re-executable and I hold it as reported fact."
# AND BUILDING IT DESTROYED THE CLAIM IT WAS MEANT TO PRESERVE, TWICE.
#    (1) The original eight were captured without selecting for tokens that had
#    ever traded: FIVE sat at the identical standard opening state, so "eight
#    independent agreements" was TWO plus five copies of one constant that any
#    implementation returning the opening price would have reproduced.
#    (2) Re-captured properly, the population then exposed a 1,000x error in
#    the decoder itself -- see the USDC section below.
# A FIXTURE IS NOT EVIDENCE BECAUSE IT IS REAL. IT IS EVIDENCE BECAUSE IT
#   VARIES, so the spread controls below are load-bearing, not decoration.
# PROVENANCE: these are the study OWN recorded responses, joined out of
#   provenance/follow-up/ -- the raw getAccountInfo bodies production stored,
#   each paired with the aggregator response from the same sweep. Not a
#   side-channel capture: the same bytes the collector actually saw.
import pathlib  # noqa: E402
_fx = pathlib.Path(__file__).parent / "fixtures" / "pumpfun_curves.json"
_curves = json.loads(_fx.read_text(encoding="utf-8"))
_quiet = [c for c in _curves if c["kind"] == "quiet"]
_grad = [c for c in _curves if c["kind"] == "graduated"]
_qsol = [c for c in _quiet if c["quote"] == "SOL"]
_qusd = [c for c in _quiet if c["quote"] == "USDC"]
check("the fixture holds a real population, not a handful",
      len(_curves) >= 30 and len(_grad) >= 2 and len(_qusd) >= 3,
      "%d curves: %d quiet (%d SOL, %d USDC), %d graduated"
      % (len(_curves), len(_quiet), len(_qsol), len(_qusd), len(_grad)))

# THE SPREAD CONTROLS. Without these the block passes on one value repeated,
#    which is exactly how the first fixture fooled me.
# THE FIXTURE IS A DELIBERATELY DIVERSE SAMPLE, NOT A RANDOM ONE -- selected
#    one record per distinct price AND per distinct reserve level. So it
#    supports "the decoder is right across a wide range of inputs" and NOT any
#    claim about how the population is distributed. The population figure is a
#    separate measurement over all 2,149 quiet curves recorded that day:
#    96.84% within 0.1%, and every one of the 68 misses was the USDC scaling
#    error below, which is now fixed.
_prices = sorted({c["provider_price_native"] for c in _quiet})
check("the quiet curves carry many DISTINCT published prices",
      len(_prices) >= 20, "%d distinct of %d" % (len(_prices), len(_quiet)))
check("...spanning at least three orders of magnitude",
      _prices and _prices[-1] / _prices[0] > 1000.0,
      "%.3g to %.3g" % (_prices[0], _prices[-1]) if _prices else "none")
check("...and many distinct reserve levels, not one opening constant",
      len({round(c["real_sol"], 9) for c in _quiet}) >= 20,
      "%d distinct reserve values" % len({round(c["real_sol"], 9) for c in _quiet}))

# WHY ONLY THE QUIET CURVES CARRY THE TIGHT ASSERTION, and the rule was set
#   from the aggregator own 5-minute trade counts BEFORE the data was looked
#   at, not after a disagreement. MEASURED 2026-09-02 on an actively traded
#   token: the published price did not move at all across five samples over a
#   minute while the curve itself moved 7%. A price that predates the trades
#   cannot check a decode of the state that follows them.
_ratios = []
for _c in _quiet:
    stub([_c["account_info"]])
    _r = providers.pool_sol_reserves(_c["pair_address"])
    _ratios.append((_c["symbol"], _c["quote"],
                    _r["implied_price_native"] / float(_c["provider_price_native"])))
_worst = max(abs(x - 1.0) for _, _, x in _ratios)
check("EVERY quiet curve reproduces its published price within 0.1%",
      _worst < 0.001,
      "worst %.5f -- %s" % (_worst, [(n, q, round(v, 5)) for n, q, v in _ratios
                                     if abs(v - 1.0) >= 0.001][:6]))

# NOT EVERY CURVE IS QUOTED IN SOL, AND ASSUMING SO UNDERSTATED THE POOL BY A
#    FACTOR OF 1,000. MEASURED over the whole population of curve reads the
#    study had recorded that day -- 2,149 quiet curves -- 67 were quoted in
#    USDC, and every one decoded to exactly 0.001x the published price. Reading
#    the quote asset from the ACCOUNT takes those 67 from 0/67 agreeing to
#    67/67 and leaves the 2,082 SOL-quoted curves untouched. A fix that repairs
#    one group and moves nothing in the other is the discriminating evidence; a
#    fix that moved both would have been a fudge factor.
# AND THE CONSEQUENCE WAS NOT COSMETIC: a curve holding 394.04 USDC was
#    reported as 0.394036 and labelled SOL. A thousand-fold understatement of
#    pool depth reads as a pool with nothing in it -- the rug-pull signature
#    this read exists to detect.
for _c in _qusd:
    stub([_c["account_info"]])
    _r = providers.pool_sol_reserves(_c["pair_address"])
    check("a USDC-quoted curve is measured in USDC, at USDC scale (%s)" % _c["symbol"],
          _r["quote_symbol"] == "USDC" and _r["quote_decimals"] == 6
          and abs(_r["quote_amount"] - _c["real_sol"] * 1000.0) < 1e-6, str(_r))
    # AND THE FIELD NAMED sol STAYS SOL. A USDC amount in it is this batch own
    #    named-not-measured pattern, and mixing denominations in one column
    #    corrupts every distribution taken over pool size.
    check("...and the field named sol is NOT given a USDC amount (%s)" % _c["symbol"],
          _r["sol"] is None, str(_r))
for _c in _qsol[:3]:
    stub([_c["account_info"]])
    _r = providers.pool_sol_reserves(_c["pair_address"])
    check("a SOL-quoted curve still fills sol (%s)" % _c["symbol"],
          _r["sol"] is not None and _r["quote_symbol"] == "SOL", str(_r))

# A DRAINED CURVE IS NOT AN EMPTY ONE. On graduation the reserves go to zero
#    and the money moves to another pool. MEASURED on CERNEY and EGGS, whose
#    real liquidity was 5,703 and 20 dollars elsewhere while this account read
#    zero. Before the guard these returned sol 0.0 under an ordinary source
#    name -- a confident zero, which is what a rug pull looks like. Graduation
#    is the study SECONDARY OUTCOME, so the error pointed at an outcome.
for _c in _grad:
    stub([_c["account_info"]])
    _r = providers.pool_sol_reserves(_c["pair_address"])
    check("a graduated curve reports itself, NOT a zero balance (%s)" % _c["symbol"],
          _r["sol"] is None and _r["source"] == "curve_complete_graduated", str(_r))

# POSITIVE CONTROL ON THE GRADUATION GUARD: clear that one byte and the same
#    account must stop being called graduated. Without this the guard could be
#    keying on anything else these accounts happen to share.
_g = json.loads(json.dumps(_grad[0]))
_graw = bytearray(base64.b64decode(_g["account_info"]["result"]["value"]["data"][0]))
_graw[48] = 0
_g["account_info"]["result"]["value"]["data"][0] = base64.b64encode(bytes(_graw)).decode()
stub([_g["account_info"]])
_rg = providers.pool_sol_reserves(_g["pair_address"])
check("POSITIVE CONTROL: clearing the complete byte changes the verdict",
      _rg["source"] != "curve_complete_graduated", str(_rg))
check("...and a zero-reserve curve still never reports zero SOL",
      _rg["sol"] is None and _rg["source"] == "curve_uninitialised", str(_rg))

# POSITIVE CONTROL ON THE QUOTE BRANCH: an unrecognised quote mint has unknown
#    decimals, so any amount returned would be wrong by an unknown power of
#    ten. It must be refused and NAMED, never guessed into SOL.
_u = json.loads(json.dumps(_qsol[0]))
_uraw = bytearray(base64.b64decode(_u["account_info"]["result"]["value"]["data"][0]))
_uraw[83:115] = bytes([7]) * 32
_u["account_info"]["result"]["value"]["data"][0] = base64.b64encode(bytes(_uraw)).decode()
stub([_u["account_info"]])
_ru = providers.pool_sol_reserves(_u["pair_address"])
check("an UNKNOWN quote asset is refused and named, not assumed to be SOL",
      _ru["sol"] is None and _ru["source"] == "curve_unknown_quote_asset", str(_ru))
check("...and the unrecognised mint is recorded so it can be identified later",
      _ru.get("quote_mint_hex", "").startswith("0707"), str(_ru))

# AND AN ACCOUNT TOO SHORT TO STATE ITS DENOMINATION FAILS CLOSED. No such
#    account exists in the measured population -- both lengths there carry the
#    field -- which is exactly why the branch needs a test rather than a hope.
_s = json.loads(json.dumps(_qsol[0]))
_sraw = base64.b64decode(_s["account_info"]["result"]["value"]["data"][0])[:60]
_s["account_info"]["result"]["value"]["data"][0] = base64.b64encode(_sraw).decode()
stub([_s["account_info"]])
_rs = providers.pool_sol_reserves(_s["pair_address"])
check("an account too short to name its quote asset fails CLOSED",
      _rs["sol"] is None and _rs["source"] == "curve_quote_unreadable", str(_rs))

# POSITIVE CONTROL ON THE FIXTURE ITSELF: wreck a real account bytes and the
#    decoder must STOP agreeing. Without it, a fixture somehow built from the
#    expected answer would sail through and prove nothing.
_bad = json.loads(json.dumps(_qsol[0]))
_raw = bytearray(base64.b64decode(_bad["account_info"]["result"]["value"]["data"][0]))
_raw[8:16] = struct.pack("<Q", 1)
_bad["account_info"]["result"]["value"]["data"][0] = base64.b64encode(bytes(_raw)).decode()
stub([_bad["account_info"]])
_rb = providers.pool_sol_reserves(_bad["pair_address"])
_bad_ratio = _rb["implied_price_native"] / float(_bad["provider_price_native"])
check("POSITIVE CONTROL: corrupted fixture bytes FAIL the agreement",
      abs(_bad_ratio - 1.0) > 0.5, "corrupted ratio %.5f" % _bad_ratio)

# A stub left installed leaks into whatever imports this module next. This
#    restore line was believed to be in the file for several rounds and was
#    not: the edit that added it never matched its anchor and said so to
#    nobody. It is now asserted rather than merely written.
providers._rpc = _REAL_RPC
check("the real RPC layer is restored, not left stubbed",
      providers._rpc is _REAL_RPC, "still stubbed")

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
