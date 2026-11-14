#!/usr/bin/env bash
# FOLD-1 / FINDING-1 control for tools/p2a_driver.sh: EVERY way the driver stops after prepare must leave no run dir,
# because prepare refuses an existing run root and a dir left behind wedges every later invocation.
# Stand-ins: systemctl (call 1 far; call 2 per MODE), a prepare that creates --run-root and refuses an existing one
# (as cmd_prepare does), every path redirected into a temp dir. Run as root:
#   bash driver_fold1_test.sh <driver> <mode>     mode: near (after-prepare refusal, exit 3) | blank (an unreadable
#   elapse - a masked or absent timer returns empty, exit 1) | na (an elapse that cannot parse, exit 1) | prepfail (prepare creates the dir, then fails)
set -u
DRV=$1; MODE=$2
T=$(mktemp -d /root/fold1.XXXXXX); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/runs/results"
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
n=\$(cat "$T/n" 2>/dev/null || echo 0); n=\$((n+1)); echo \$n > "$T/n"
if [ "\$n" -eq 1 ]; then date -u -d '+5 hours' '+%a %Y-%m-%d %H:%M:%S UTC'
elif [ "$MODE" = blank ]; then echo ""
elif [ "$MODE" = na ]; then echo "n/a"
else date -u -d '+10 minutes' '+%a %Y-%m-%d %H:%M:%S UTC'; fi
EOF
cat > "$T/bin/prep.py" <<EOF
import os, sys
rr = sys.argv[sys.argv.index("--run-root") + 1]
if os.path.exists(rr):
    print("REFUSED: --run-root exists", file=sys.stderr); sys.exit(2)
os.makedirs(rr); open(os.path.join(rr, "PREPARE.json"), "w").write("{}")
sys.exit(2 if "$MODE" == "prepfail" else 0)
EOF
chmod +x "$T/bin/systemctl"
sed -e "s#^H=.*#H=$T/bin/prep.py#" -e "s#^R=.*#R=/bin/false#" \
    -e "s#/var/lib/token-watch-p1-runs#$T/runs#g" \
    -e "s#sudo -u tokenwatch env TOKEN_WATCH_ROOT=/var/lib/token-watch-scratch PYTHONDONTWRITEBYTECODE=1#env#" \
    -e "s#install -d -o tokenwatch -g tokenwatch -m 0700#install -d -m 0700#" "$DRV" > "$T/drv.sh"
PATH="$T/bin:$PATH" bash "$T/drv.sh"; rc=$?
case $MODE in near) want=3 ;; blank|na|prepfail) want=1 ;; esac
left=$(ls -d "$T"/runs/run-* 2>/dev/null || echo none)
echo "mode=$MODE driver rc=$rc (want $want); run dir left behind: $left"
grep -E "REFUSED|STOP|removed|FAILED" "$T/runs/p2a-driver.log"
[ "$rc" = "$want" ] && [ "$left" = none ] && echo "FOLD1-$MODE PASS" || echo "FOLD1-$MODE FAIL"
