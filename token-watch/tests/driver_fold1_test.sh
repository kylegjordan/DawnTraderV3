#!/usr/bin/env bash
# FOLD-1 control for tools/p2a_driver.sh: the updater refusal AFTER prepare must remove the run dir, so the next
# invocation's prepare is not blocked. Stand-ins: systemctl (first call far, second call near), a prepare that creates
# --run-root and refuses an existing one (as cmd_prepare:496-498 does), and every path redirected into a temp dir.
# Run as root: bash driver_fold1_test.sh <driver>
set -u
DRV=$1
T=$(mktemp -d /root/fold1.XXXXXX); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/runs/results"
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
n=\$(cat "$T/n" 2>/dev/null || echo 0); n=\$((n+1)); echo \$n > "$T/n"
if [ "\$n" -eq 1 ]; then date -u -d '+5 hours' '+%a %Y-%m-%d %H:%M:%S UTC'; else date -u -d '+10 minutes' '+%a %Y-%m-%d %H:%M:%S UTC'; fi
EOF
cat > "$T/bin/prep.py" <<'EOF'
import os, sys
rr = sys.argv[sys.argv.index("--run-root") + 1]
if os.path.exists(rr):
    print("REFUSED: --run-root exists", file=sys.stderr); sys.exit(2)
os.makedirs(rr); open(os.path.join(rr, "PREPARE.json"), "w").write("{}")
EOF
chmod +x "$T/bin/systemctl"
sed -e "s#^H=.*#H=$T/bin/prep.py#" -e "s#^R=.*#R=/bin/false#" \
    -e "s#/var/lib/token-watch-p1-runs#$T/runs#g" \
    -e "s#sudo -u tokenwatch env TOKEN_WATCH_ROOT=/var/lib/token-watch-scratch PYTHONDONTWRITEBYTECODE=1#env#" \
    -e "s#install -d -o tokenwatch -g tokenwatch -m 0700#install -d -m 0700#" "$DRV" > "$T/drv.sh"
PATH="$T/bin:$PATH" bash "$T/drv.sh"; rc=$?
echo "driver rc=$rc (want 3, the after-prepare refusal)"
echo "run dir left behind: $(ls -d "$T"/runs/run-* 2>/dev/null || echo none)"
grep -E "REFUSED|removed" "$T/runs/p2a-driver.log"
[ "$rc" = 3 ] && ! ls -d "$T"/runs/run-* >/dev/null 2>&1 && echo "FOLD1 PASS" || echo "FOLD1 FAIL"
