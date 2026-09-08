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

# ─────────────────────────────────────────────────────────────────────────────────────────
# ⛔ THE CAPPED/MANIFEST GATE — Langston's Step-4 condition (2026-09-08, B-DRIFT-RUNTIME-
#   PREDICATE #1016). It was the ONLY fix in that batch with no committed control: the four
#   cases below existed solely in his shell history. In a batch about instruments that cannot
#   fail, an uncontrolled two-token condition guarding an ABSENCE-claim is the wrong thing to
#   leave uncovered.
#
# WHY THE GATE EXISTS: the note's second clause asks whether NO migration .sql sits beside
#   MANIFEST.txt. That is an ABSENCE, read off a file list that GitHub truncates at 300 —
#   and the cap is reached exactly when a deploy has stalled (measured: 72h = 168 commits /
#   151 files), which is when a migration is most likely to be waiting. So under a cap the
#   note must stay silent and let `runtime_path: UNDECIDABLE` stand alone.
#
# EXPECTED RESULTS, STATED BEFORE THE RUN (#744 rider clause 2):
#   CAPPED=0, MANIFEST alone            -> NOTE
#   CAPPED=1, same list                 -> SILENT   (the absence is not decidable under a cap)
#   CAPPED=0, MANIFEST + a real .sql    -> SILENT   (ordinary migration commit: 78 of 109)
#   CAPPED=0, MANIFEST + rollback .sql  -> SILENT   (defensive: if one ever reached the list
#                                                    the regex matches it — documents the
#                                                    coupling to runtime()'s own filter,
#                                                    which is what keeps them out upstream)
#   CAPPED=0, no MANIFEST               -> SILENT
manifest_gate() {   # $1=CAPPED  $2=rtlist contents
  CAPPED="$1"
  RT="$(mktemp)"; printf '%s' "$2" > "$RT"
  MANIFEST_NOTE=""
  if [ "$CAPPED" != "1" ] \
     && grep -qx 'drizzle/migrations/MANIFEST\.txt' "$RT" 2>/dev/null \
     && ! grep -qE '^drizzle/migrations/.*\.sql$' "$RT" 2>/dev/null; then
    MANIFEST_NOTE="NOTE"
  fi
  rm -f "$RT"
  echo "      -> ${MANIFEST_NOTE:-SILENT}"
}

echo
echo "  CAPPED=0, MANIFEST alone (expect NOTE):"
manifest_gate 0 'drizzle/migrations/MANIFEST.txt
server/services/x.ts'
echo "  CAPPED=1, same list (expect SILENT):"
manifest_gate 1 'drizzle/migrations/MANIFEST.txt
server/services/x.ts'
echo "  CAPPED=0, MANIFEST + real .sql (expect SILENT):"
manifest_gate 0 'drizzle/migrations/MANIFEST.txt
drizzle/migrations/0100_real.sql'
# ⛔ MY FIRST DRAFT OF THIS CASE WAS A DUPLICATE OF CASE 1 — same input, different label,
#   proving nothing. Caught by writing it out. The rollback story needs TWO cases, because
#   the claim has two halves and only one of them is about this gate:
#   (a) upstream, runtime() filters rollbacks, so they never reach rtlist — a MANIFEST +
#       rollback-only RANGE therefore arrives here as MANIFEST-alone. That is case 1's input,
#       and asserting it twice is not evidence.
#   (b) DEFENSIVELY: if a rollback ever DID reach the list, this gate's regex would match it
#       as a .sql and go SILENT — the opposite of the intent recorded in dt-deploy-drift.sh.
#       That is a real coupling to runtime()'s filter, so it is asserted rather than assumed.
echo "  CAPPED=0, MANIFEST + rollback IN THE LIST (expect SILENT — documents the coupling):"
manifest_gate 0 'drizzle/migrations/MANIFEST.txt
drizzle/migrations/0099_x_rollback.sql'
echo "  CAPPED=0, no MANIFEST (expect SILENT):"
manifest_gate 0 'server/services/x.ts
drizzle/migrations/0100_real.sql'
