#!/usr/bin/env python3
"""dt-unit-failure-alert suite: the COMMITTED script with only its three paths substituted, run with
the unit name systemd actually passes (%N = no ".service" — r2's blocker), against a fake npm that
records its arguments. Judge by exit code."""
import hashlib
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
        open(T + "/classes", "w").write(classes.replace(";", NL) + NL)
    r = subprocess.run(["/bin/sh", copy, unit], capture_output=True, text=True, timeout=30)
    calls = [json.loads(l) for l in open(T + "/calls")] if os.path.exists(T + "/calls") else []
    keys = [c[c.index("--dedupe-key") + 1] for c in calls]
    return r.returncode, keys, calls


def k(cls, subj):
    return "dt-unit-failure:dt-install-drift:%s:%s" % (cls, hashlib.sha1(subj.encode()).hexdigest()[:12])


c, keys, calls = run("dt-install-drift", "DRIFT /usr/local/bin/dt-api;STATE-x page")
check("r2 BLOCKER: under the real %N name the failures ARE read, one alert per line",
      c == 0 and keys == [k("DRIFT", "/usr/local/bin/dt-api"), k("STATE-x", "page")], str(keys))
c, keys, calls = run("dt-install-drift", "DRIFT /usr/local/bin/dt-api;DRIFT /etc/sudoers.d/dtapi")
check("r3 S2: the same CLASS on two files is TWO alerts (per class AND subject)",
      len(set(keys)) == 2 and keys == [k("DRIFT", "/usr/local/bin/dt-api"), k("DRIFT", "/etc/sudoers.d/dtapi")], str(keys))
check("r3: each alert's title names its subject", all(("/usr/local/bin/dt-api" in x[x.index("--title") + 1]) or
      ("/etc/sudoers.d/dtapi" in x[x.index("--title") + 1]) for x in calls), str([x[x.index("--title") + 1] for x in calls]))
check("each alert is a valid add (category, severity, triggers-at, metadata JSON)",
      all(x[:3] == ["run", "-s", "system-alerts"] and "breakage" in x and "warning" in x and json.loads(x[x.index("--metadata") + 1])
          for x in calls), str(calls[:1]))
c, keys, _ = run("dt-install-drift", "")
check("no classes -> one UNIT-FAILED alert, never none", keys == [k("UNIT-FAILED", "-")], str(keys))
c, keys, _ = run("dt-install-drift", None)
check("r3 S5: no classes FILE (the unit's ExecStartPre removed it) -> one UNIT-FAILED alert", keys == [k("UNIT-FAILED", "-")], str(keys))
c, keys, _ = run("other-unit", "DRIFT x")
check("another unit never reads the drift classes", keys == ["dt-unit-failure:other-unit:UNIT-FAILED:%s" % hashlib.sha1(b"-").hexdigest()[:12]], str(keys))
c, keys, calls = run("dt-install-drift", "DRIFT$(id) x`y`;PAGE'z' a\"b")
check("the lines are sanitised before they reach a key, a title or the metadata",
      len(keys) == 2 and all(re.fullmatch(r"dt-unit-failure:dt-install-drift:[A-Za-z0-9,_./@:-]+:[0-9a-f]{12}", x) for x in keys)
      and all(json.loads(x[x.index("--metadata") + 1]) for x in calls), str(keys))
r = subprocess.run(["/bin/sh", copy, "bad unit"], capture_output=True, text=True)
check("an unsafe unit name is refused", r.returncode == 2)
print("alert suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
