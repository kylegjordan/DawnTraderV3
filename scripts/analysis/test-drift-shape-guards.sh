#!/usr/bin/env bash
# Control for r7's two shape guards. EXPECTED RESULTS ARE STATED IN THE SCRIPT before it runs
# (the second clause of the #744 rider): a control whose expectation is written afterwards can
# be read to match whatever it produced.
#
#   8 fields          -> FAIL
#   wrong leader      -> FAIL
#   exactly 7 + OK    -> PASS
#   ANOMALY, 3 fields -> PASS
#   ANOMALY truncated -> FAIL
set -uo pipefail

fail_measurement() { echo "      -> FAIL_MEASUREMENT ($1)"; return 9; }

ok_shape() {
  READ="$1"
  set -- $READ
  [ $# -eq 7 ] && [ "$1" = "OK" ] || { fail_measurement compare_reader; return; }
  echo "      -> PASS ($# fields, leader $1)"
}

anomaly_shape() {
  READ="$1"
  set -- $READ
  [ $# -eq 3 ] || { fail_measurement compare_reader; return; }
  echo "      -> PASS (status=$2 total=$3)"
}

echo "  8 fields (expect FAIL):";        ok_shape "OK ahead 5 1.00 2026-09-06T00:00:00Z 3 0 EXTRA"
echo "  wrong leader (expect FAIL):";    ok_shape "XX ahead 5 1.00 2026-09-06T00:00:00Z 3 0"
echo "  exactly 7 + OK (expect PASS):";  ok_shape "OK ahead 5 1.00 2026-09-06T00:00:00Z 3 0"
echo "  ANOMALY 3 fields (expect PASS):"; anomaly_shape "ANOMALY behind 4"
echo "  ANOMALY truncated (expect FAIL):"; anomaly_shape "ANOMALY behind"
