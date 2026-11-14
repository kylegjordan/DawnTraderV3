#!/usr/bin/env bash
# B-TOKEN-WATCH-FOLLOWUP-MEMORY P2a - the measurement-only run (Langston's ruling, Discord 1571210672413343797):
# arms all_shed then live, ONE each, UNTRACED, with --sample (5 s cgroup samples + stage markers, kill-surviving), at the
# same caps as Step 7 (MemoryMax=512M, CPUQuota=40%, IPAddressDeny=any - set by run_followup_arm.sh). x4 is NOT run here:
# it is conditional on what live shows (his A-5) and is started by hand if it is needed.
# As root on staging. Same shape as the traced driver r2 (/root/p1_traced2.sh): prepare a fresh run dir per arm, run the
# arm, keep its PREPARE.json, remove the run dir, and REFUSE to start an arm whose allowed span (+ margin) would overlap
# the next apt-daily-upgrade elapse (his r9 rule; unattended-upgrade restarted the r1 driver on 2026-11-14 06:25Z).
#   bash p2a_driver.sh            (log: /var/lib/token-watch-p1-runs/p2a-driver.log; results: .../results/p2a/)
set -u
H=/opt/token-watch-p1/tools/measure_followup_memory.py
R=/opt/token-watch-p1/tools/run_followup_arm.sh
B=/var/lib/token-watch-p1-runs/bodies.sqlite
NOW=2026-10-02T13:00:00Z
RES=/var/lib/token-watch-p1-runs/results/p2a
LOG=/var/lib/token-watch-p1-runs/p2a-driver.log
ALLOW_S=$((40*60))         # untraced arms ran 5-19 min at Step 7 (his A-1 reading); 40 min allowed + the margin below
MARGIN_S=$((15*60))
[[ $EUID -eq 0 ]] || { echo "REFUSED: run as root" >&2; exit 2; }
install -d -o tokenwatch -g tokenwatch -m 0700 "$RES"
for arm in all_shed live; do
  if [ -e "$RES/$arm-unit.txt" ] && grep -q '^Result=' "$RES/$arm-unit.txt"; then
    echo "$(date -u +%FT%TZ) SKIP $arm: a result already exists in $RES (move it aside to re-run)" >> "$LOG"; continue
  fi
  updater_ok() {   # (Langston nit) checked again right before the arm: prepare runs inside the margin and eats it
    NEXT=$(systemctl show apt-daily-upgrade.timer -p NextElapseUSecRealtime --value)
    NEXT_S=$(date -u -d "$NEXT" +%s 2>/dev/null) || { echo "$(date -u +%FT%TZ) STOP: cannot read the updater's next elapse ('$NEXT')" >> "$LOG"; exit 1; }
    END_S=$(( $(date -u +%s) + ALLOW_S + MARGIN_S ))
    if [ "$NEXT_S" -le "$END_S" ]; then
      echo "$(date -u +%FT%TZ) REFUSED $arm ($1): apt-daily-upgrade next elapse $NEXT falls inside this arm's window (ends $(date -u -d @$END_S +%FT%TZ))" >> "$LOG"; exit 3
    fi
  }
  updater_ok "before prepare"
  # C-3: a previous run's sample file (a killed arm leaves no Result=, so it is re-run) is MOVED ASIDE, never appended to
  if [ -e "$RES/$arm-samples.jsonl" ]; then
    mv "$RES/$arm-samples.jsonl" "$RES/$arm-samples.jsonl.void-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "$(date -u +%FT%TZ) moved a previous $arm-samples.jsonl aside (a re-run is a new population)" >> "$LOG"
  fi
  RUN=/var/lib/token-watch-p1-runs/run-$arm-p2a
  echo "$(date -u +%FT%TZ) START p2a $arm (updater next $NEXT) free=$(df -B1 --output=avail / | tail -1)" >> "$LOG"
  sudo -u tokenwatch env TOKEN_WATCH_ROOT=/var/lib/token-watch-scratch PYTHONDONTWRITEBYTECODE=1 \
    /usr/bin/python3 "$H" prepare --pristine /var/lib/token-watch-scratch --run-root "$RUN" --now "$NOW" >> "$LOG" 2>&1
  prc=$?; echo "$(date -u +%FT%TZ) prepare rc=$prc" >> "$LOG"
  [ $prc -eq 0 ] || { echo "$(date -u +%FT%TZ) STOP: prepare failed" >> "$LOG"; exit 1; }
  updater_ok "after prepare"
  bash "$R" "$arm" "$RUN" "$B" "$NOW" "$RES" --sample >> "$LOG" 2>&1
  rc=$?
  echo "$(date -u +%FT%TZ) END p2a $arm rc=$rc samples=$(wc -l < "$RES/$arm-samples.jsonl" 2>/dev/null || echo none) free=$(df -B1 --output=avail / | tail -1)" >> "$LOG"
  cp "$RUN/PREPARE.json" "$RES/$arm-PREPARE.json" 2>>"$LOG"
  rm -rf --one-file-system "$RUN" && echo "$(date -u +%FT%TZ) removed $RUN" >> "$LOG"
  case $rc in 0|137) ;; *) echo "$(date -u +%FT%TZ) STOP: p2a $arm rc=$rc" >> "$LOG"; exit 1;; esac
done
echo "$(date -u +%FT%TZ) ALL DONE" >> "$LOG"
