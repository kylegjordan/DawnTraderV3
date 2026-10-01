#!/usr/bin/env bash
# B-XSTOCK-BID-TRIGGER-RELAND (row 3n.q7) increment 2 P4 — THE DURABLE CORPUS FOR THE FALSE-HOLLOW CLASSIFIER.
#
# WHY: the `[3n.q7][XS_FRAME]` lines go to stderr (`error.log`), which pm2-logrotate keeps as 14 files (~14 days at
# today's daily rotation). The bid-trigger window is 21 days, so the corpus must be copied out while it exists.
# ONLY THE STDERR STREAM IS READ (Langston P4 r2): `EVAL_EXIT` is on stdout (~12.7 h of history) and is not needed —
# the emitted-vs-invoked reconciliation is already a stderr alarm (`XS_FRAME_RECONCILE_BROKEN`).
#
# EACH RUN (idempotent; run every 6 h from the `deploy` crontab):
#   1. every ROTATED `error__*.log` not yet in the manifest: its XS_FRAME + XS_FRAME_RECONCILE_BROKEN lines are gzipped
#      into the archive and a manifest row (file, bytes, lines) is appended. The live `error.log` is never read.
#   2. CONTIGUITY: every rotated file seen on the previous run must now be either present or in the manifest. A file that
#      vanished unextracted is a REALIZED GAP => alert `xs-frame-extract-gap`, exit 3 (the alarm of last resort).
#   3. PRE-LOSS RUNG: the age of the OLDEST retained `error__*.log`; under 2 x cadence (12 h) => alert
#      `xs-frame-extract-reach` BEFORE a file is lost (e.g. error.log crossing its 1 GB max_size and rotating sub-daily).
#   4. BOUNDARIES (P4 r3, Langston): the pm2.log `App [dawntrader:N] starting|online|exited` lines newer than the last run
#      and the deploy record VERBATIM (it is a single-record state file, overwritten every deploy) are appended to
#      `boundaries.log`, so the sha <-> deploy-time pairs inside the window survive to its close. pm2.log is unrotated by
#      configuration quirk, not policy (`rotateModule: true`, `max_size 1G`; `pm2 flush` truncates it): if it SHRANK since
#      the last run, a flush/rotation happened => warn on the reach alert and read it from the start.
#      A run that cannot read pm2.log or the deploy record exits 3 on the gap alert.
#   ALERT KEYS are one per condition (Langston inc-2 Step-4 r2 nit: nothing resolves these automatically, and an unresolved
#   row silences every later mint on its key): gap-contiguity, gap-subcadence, gap-boundaries, gap-reflog, reach,
#   reach-pm2, reach-reflog — all prefixed xs-frame-extract-.
#      THE DEPLOY RECORD IS SELF-DATING (sha + deployed_at) and is the primary source; pm2.log restarts carry a TIME
#      but no sha. The classifier splits runs at EVERY pm2 restart, a superset of code boundaries, so the degraded path
#      (no record sample, no reflog line) loses the SHA ATTRIBUTION of a span, never the BOUNDARY — and it cannot be silent:
#      an unreadable record, pm2.log or reflog exits 3 on xs-frame-extract-gap (Langston P4 r4 correction).
#   5. THE APP CLONE'S REFLOG (P4 r4, Langston): the `.git/logs/HEAD` lines added since the last run — one
#      `reset: moving to <sha>` per deploy, with a unix time — so EVERY deploy's sha<->time pair survives, including
#      two deploys inside one cadence. A manual `git reset` also lands here; it is a code boundary all the same.
#
# Usage: xs_frame_extract.sh            (env overrides for tests: LOG_DIR ARCHIVE PM2_LOG DEPLOY_RECORD APP_DIR REFLOG NOW_EPOCH NO_ALERT)
set -u
LOG_DIR="${LOG_DIR:-/var/log/dawntrader}"
ARCHIVE="${ARCHIVE:-/home/deploy/xs_frame_archive}"
PM2_LOG="${PM2_LOG:-/home/deploy/.pm2/pm2.log}"
DEPLOY_RECORD="${DEPLOY_RECORD:-/home/deploy/dawntrader-deploy.record}"
APP_DIR="${APP_DIR:-/home/deploy/dawntrader}"
REFLOG="${REFLOG:-$APP_DIR/.git/logs/HEAD}"
CADENCE_S=21600
NOW="${NOW_EPOCH:-$(date -u +%s)}"
NOW_ISO="$(date -u -d "@$NOW" +%Y-%m-%dT%H:%M:%SZ)"
MANIFEST="$ARCHIVE/manifest.tsv"
SEEN="$ARCHIVE/last_seen.txt"
BOUND="$ARCHIVE/boundaries.log"
PM2_OFF="$ARCHIVE/pm2_offset.txt"
REF_OFF="$ARCHIVE/reflog_offset.txt"
RUNLOG="$ARCHIVE/runs.log"
mkdir -p "$ARCHIVE"
touch "$MANIFEST" "$SEEN" "$BOUND" "$RUNLOG"

alert() {   # $1 dedupe key, $2 severity, $3 title, $4 body
  echo "$NOW_ISO ALERT $1 $3" >> "$RUNLOG"
  [ -n "${NO_ALERT:-}" ] && return 0
  (cd "$APP_DIR" && npm run -s system-alerts -- add --triggers-at "$NOW_ISO" --category breakage --severity "$2" \
     --title "$3" --body "$4" --dedupe-key "$1" >/dev/null 2>&1) || echo "$NOW_ISO alert raise FAILED for $1" >> "$RUNLOG"
}

status=0
present=$(ls -1 "$LOG_DIR" 2>/dev/null | grep -E '^error__.*\.log$' | sort)

# 1. extract every rotated file not yet in the manifest
extracted=0
for f in $present; do
  if ! cut -f1 "$MANIFEST" | grep -qxF "$f"; then
    out="$ARCHIVE/${f%.log}.xs.gz"
    # sequential, not a pipe into a background gzip: the manifest row must never precede a complete archive file
    grep -aE '\[3n\.q7\]\[XS_FRAME(_RECONCILE_BROKEN)?\]' "$LOG_DIR/$f" > "$out.tmp"
    n=$(wc -l < "$out.tmp")
    gzip -c "$out.tmp" > "$out" && rm -f "$out.tmp" || { echo "$NOW_ISO gzip FAILED for $f" >> "$RUNLOG"; status=3; continue; }
    printf '%s\t%s\t%s\t%s\n' "$f" "$(stat -c %s "$LOG_DIR/$f")" "$n" "$NOW_ISO" >> "$MANIFEST"
    extracted=$((extracted + 1))
  fi
done

# 2. contiguity: everything seen last run is still present or was extracted
gap=""
for f in $(cat "$SEEN"); do
  if ! printf '%s\n' $present | grep -qxF "$f" && ! cut -f1 "$MANIFEST" | grep -qxF "$f"; then gap="$gap $f"; fi
done
printf '%s\n' $present > "$SEEN"
if [ -n "$gap" ]; then
  alert "xs-frame-extract-gap-contiguity" warning "XS_FRAME archive gap: rotated error log evicted before extraction" \
    "The bid-trigger window's frame corpus lost rotated file(s):$gap. The classifier's population is incomplete for that span; state it in the read. (3n.q7 inc-2 P4)"
  status=3
fi

# 3. pre-loss rung: the oldest retained rotated file's age
oldest=$(printf '%s\n' $present | head -1)
if [ -n "$oldest" ]; then
  age=$(( NOW - $(stat -c %Y "$LOG_DIR/$oldest") ))
  if [ "$age" -lt "$CADENCE_S" ]; then
    # Langston inc-2 Step-4 attack (3): a loss the last_seen check cannot see needs >= retain rotations inside one cadence,
    # which forces oldest-age <= cadence — so this is not a warning any more, files may ALREADY be gone unseen.
    alert "xs-frame-extract-gap-subcadence" warning "XS_FRAME archive: rotation faster than the extraction cadence"       "The oldest retained error__ file ($oldest) is only ${age}s old (< the ${CADENCE_S}s cadence): rotated files can have been evicted between two runs without either run seeing them. Treat the corpus as possibly incomplete since the last run and shorten the cadence. (3n.q7 inc-2 P4)"
    status=3
  elif [ "$age" -lt $((2 * CADENCE_S)) ]; then
    alert "xs-frame-extract-reach" warning "XS_FRAME archive reach below 2x cadence" \
      "The oldest retained error__ file ($oldest) is only ${age}s old (< $((2 * CADENCE_S))s): rotation is outpacing the 6 h extraction. Shorten the cadence before a file is lost. (3n.q7 inc-2 P4)"
  fi
else
  age=-1
fi

# 4. boundaries: new pm2 restart markers + the deploy record verbatim
if [ ! -r "$PM2_LOG" ] || [ ! -r "$DEPLOY_RECORD" ]; then
  alert "xs-frame-extract-gap-boundaries" warning "XS_FRAME archive: restart/deploy boundaries unreadable" \
    "pm2.log or the deploy record could not be read, so this run's restart/deploy boundaries were not archived. (3n.q7 inc-2 P4 r3)"
  status=3
else
  size=$(stat -c %s "$PM2_LOG")
  off=$(cat "$PM2_OFF" 2>/dev/null || echo 0)
  first=$(head -c 20 "$PM2_LOG")
  if [ "$size" -lt "$off" ]; then
    alert "xs-frame-extract-reach-pm2" warning "XS_FRAME archive: pm2.log shrank (flush or rotation)" \
      "pm2.log is ${size} B, below the ${off} B already read: it was flushed or rotated. Reading from its start; restarts between the last run and the flush are lost unless the app logs recorded them. First line now starts '$first'. (3n.q7 inc-2 P4 r3)"
    off=0
  fi
  {
    echo "# run $NOW_ISO pm2.log bytes $off..$size first='$first'"
    tail -c +$((off + 1)) "$PM2_LOG" | grep -aE 'App \[dawntrader:[0-9]+\] (starting|online|exited)'
    echo "# deploy record at $NOW_ISO:"
    sed 's/^/  /' "$DEPLOY_RECORD"
  } >> "$BOUND"
  echo "$size" > "$PM2_OFF"
fi

# 5. the app clone's reflog: every deploy's sha + time (append-only; a shrink means it was rewritten)
if [ ! -r "$REFLOG" ]; then
  alert "xs-frame-extract-gap-reflog" warning "XS_FRAME archive: the app clone reflog is unreadable"     "$REFLOG could not be read, so this run's deploy sha/time pairs were not archived. (3n.q7 inc-2 P4 r4)"
  status=3
else
  rsize=$(stat -c %s "$REFLOG")
  roff=$(cat "$REF_OFF" 2>/dev/null || echo 0)
  if [ "$rsize" -lt "$roff" ]; then
    alert "xs-frame-extract-reach-reflog" warning "XS_FRAME archive: the app clone reflog shrank"       "$REFLOG is ${rsize} B, below the ${roff} B already archived: it was expired or rewritten. Re-reading from its start. (3n.q7 inc-2 P4 r4)"
    roff=0
  fi
  {
    echo "# run $NOW_ISO reflog bytes $roff..$rsize"
    tail -c +$((roff + 1)) "$REFLOG"
  } >> "$BOUND"
  echo "$rsize" > "$REF_OFF"
fi

echo "$NOW_ISO run extracted=$extracted present=$(printf '%s\n' $present | grep -c .) oldest=${oldest:-none} oldest_age_s=$age gap=${gap:-none} status=$status" >> "$RUNLOG"
exit $status
