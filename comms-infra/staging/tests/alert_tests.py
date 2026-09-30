#!/usr/bin/env python3
"""dt-unit-failure-alert suite: the COMMITTED script with only its three paths substituted, run with
the unit name systemd actually passes (%N = no ".service" — r2's blocker), against a fake npm that
records its arguments. Judge by exit code."""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("ALERT_SRC") or os.path.join(HERE, "..", "dt-unit-failure-alert")
PASS = FAIL = 0
NL = chr(10)


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


T = tempfile.mkdtemp(prefix="alert-t-")
src = open(SRC, encoding="utf-8").read()
out = src
for k, v in (("APP_DIR", T), ("NPM", T + "/fake-npm"), ("CLASSES_FILE", T + "/classes")):
    out, n = re.subn(r"^%s=.*$" % k, "%s=%s" % (k, v), out, flags=re.M)
    check("the %s line is substituted exactly once" % k, n == 1)
copy = T + "/alert"
open(copy, "w").write(out)
os.chmod(copy, 0o755)
open(T + "/fake-npm", "w").write("#!/usr/bin/env python3" + NL + "import json, sys" + NL +
    "open(%r, 'a').write(json.dumps(sys.argv[1:]) + chr(10))" % (T + "/calls") + NL)
os.chmod(T + "/fake-npm", 0o755)


def run(unit, classes=None):
    for f in ("/calls", "/classes"):
        if os.path.exists(T + f):
            os.unlink(T + f)
    if classes is not None:
        open(T + "/classes", "w").write(classes + NL)
    r = subprocess.run(["/bin/sh", copy, unit], capture_output=True, text=True, timeout=30)
    calls = [json.loads(l) for l in open(T + "/calls")] if os.path.exists(T + "/calls") else []
    keys = [c[c.index("--dedupe-key") + 1] for c in calls]
    return r.returncode, keys, calls


c, keys, calls = run("dt-install-drift", "DRIFT,PAGE-token-refused")
check("r2 BLOCKER: under the real %N name the classes ARE read, one alert per class",
      c == 0 and keys == ["dt-unit-failure:dt-install-drift:DRIFT", "dt-unit-failure:dt-install-drift:PAGE-token-refused"], str(keys))
check("each alert is a valid add (category, severity, triggers-at, metadata JSON)",
      all(x[:3] == ["run", "-s", "system-alerts"] and "breakage" in x and "warning" in x and json.loads(x[x.index("--metadata") + 1])
          for x in calls), str(calls[:1]))
c, keys, _ = run("dt-install-drift", "")
check("no classes -> one UNIT-FAILED alert, never none", keys == ["dt-unit-failure:dt-install-drift:UNIT-FAILED"], str(keys))
c, keys, _ = run("other-unit", "DRIFT")
check("another unit never reads the drift classes", keys == ["dt-unit-failure:other-unit:UNIT-FAILED"], str(keys))
c, keys, _ = run("dt-install-drift", "DRIFT;rm -rf x,PAGE`x`")
check("the classes text is sanitised before it reaches a key", keys == ["dt-unit-failure:dt-install-drift:DRIFTrm-rf", "dt-unit-failure:dt-install-drift:xPAGEx"]
      or all(re.fullmatch(r"dt-unit-failure:dt-install-drift:[A-Za-z0-9_-]+", k) for k in keys), str(keys))
r = subprocess.run(["/bin/sh", copy, "bad unit"], capture_output=True, text=True)
check("an unsafe unit name is refused", r.returncode == 2)
print("alert suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
