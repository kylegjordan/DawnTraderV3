# -*- coding: utf-8 -*-
"""The daily wake-watcher CONTROL, decided from files (B-WAKE-HEARTBEAT-CONTROL-DATE, #1162, row 1q).

The hourly heartbeat used to let a model infer from prompt text whether each session had answered the
day's control line. On 2026-10-16 that paged Kyle five times for watchers that were alive: an arm that
starts from the log END (a saved position over 12 h old, or none at all) never sees a control line written
before it started. This script replaces the inference with file reads and an ordered decision table
(scope `B_WAKE_HEARTBEAT_CONTROL_DATE_SCOPE.md` §3, approved by Langston at Steps 1 and 2).

Usage (the heartbeat's step 2c):
    python control_state.py --liveness CC-A=alive CC-B=DEAD CC-C=STUCK CC-INFRA="not armed"
liveness values come from step 2b: alive | DEAD | STUCK | CENSUS-FAILED | not armed.

It prints exactly two lines and always exits 0, so the heartbeat still posts:
    control: <verdict and per-alias states>
    NOTIFY yes|no

Test seams (never touch live files from a test - the #1192 fixture-not-process lesson):
    --state-dir DIR   in place of C:/Users/kyleg/.claude/cc-wake-state
    --log PATH        a LOCAL copy of the wake log, in place of SSH to Helsinki
    --today YYYYMMDD  the issuer's UTC date in --log mode (remote mode reads it on Helsinki)
    --now ISO         the current UTC instant (re-issue write times, lock age)
    --ssh-target / --ssh-port   the remote, so the failure branch can run against a real refusing host
"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timezone, timedelta

ALIASES = ("CC-A", "CC-B", "CC-C", "CC-INFRA")
LIVE_LOG = "/var/log/cc-wake.log"      # the key the watchers use in pos{} and the file on Helsinki
LOCK_STALE = timedelta(minutes=30)     # Langston, Step 2: self-healing against the 60-min cadence
MAX_REISSUE_ARMS = 3                   # R1: two re-issues, then page AT the third distinct arm against one token
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]+")   # a control token that is safe to echo back into the log

# The remote scan: ONE pass over the WHOLE log, never a tail (step 2's own lesson). It mirrors the filter's
# own parse of a control line (`cc-wake-filter.py:996-1002`: strip, startswith WATCHER-CONTROL, alias =
# parts[1].upper(), token = parts[2]) and records the BYTE OFFSET of each alias's newest control line.
SCAN = r'''
import os, json
from datetime import datetime, timezone
p = "%s"
st = os.stat(p)
res = {"ino": st.st_ino, "D": datetime.now(timezone.utc).strftime("%%Y%%m%%d"), "aliases": {}}
off = 0
with open(p, "rb") as f:
    for raw in f:
        parts = raw.decode("utf-8", "replace").strip().split()
        if len(parts) >= 3 and parts[0] == "WATCHER-CONTROL":
            res["aliases"][parts[1].upper()] = {"N": parts[2], "O": off}
        off += len(raw)
res["size"] = off
print(json.dumps(res))
''' % LIVE_LOG


class RemoteFailed(Exception):
    pass


def utc_iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


class Remote:
    """Helsinki over SSH, or a local log file (tests)."""

    def __init__(self, a):
        self.a = a

    def _ssh(self, cmd, stdin=None):
        args = ["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes"]
        if self.a.ssh_port:
            args += ["-p", str(self.a.ssh_port)]
        args += [self.a.ssh_target, cmd]
        r = subprocess.run(args, input=stdin, capture_output=True, text=True, timeout=90)
        if r.returncode != 0:
            raise RemoteFailed(f"ssh exit {r.returncode}")
        return r.stdout

    def scan(self):
        if self.a.log:
            return local_scan(self.a.log, self.a.today)
        out = self._ssh("python3 -", stdin=SCAN)
        try:
            return json.loads(out.strip().splitlines()[-1])
        except Exception:
            raise RemoteFailed("unreadable scan output")

    def append(self, alias, token):
        """Append one control line; return the byte offset it was written at."""
        line = f"WATCHER-CONTROL {alias} {token}"
        if self.a.log:
            off = os.path.getsize(self.a.log)
            with open(self.a.log, "ab") as f:
                f.write((line + "\n").encode())
            return off
        out = self._ssh(f"stat -c %s {LIVE_LOG} && echo '{line}' >> {LIVE_LOG}")
        try:
            return int(out.strip().splitlines()[0])
        except Exception:
            raise RemoteFailed("unreadable append offset")


def local_scan(path, today):
    st = os.stat(path)
    res = {"ino": st.st_ino, "D": today, "aliases": {}}
    off = 0
    with open(path, "rb") as f:
        for raw in f:
            parts = raw.decode("utf-8", "replace").strip().split()
            if len(parts) >= 3 and parts[0] == "WATCHER-CONTROL":
                res["aliases"][parts[1].upper()] = {"N": parts[2], "O": off}
            off += len(raw)
    res["size"] = off
    return res


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def read_A(state_dir, alias):
    """The token a watcher answered: the FIRST field of <alias>.json.control (`:1002` writes "<token> <utc>")."""
    try:
        with open(os.path.join(state_dir, alias + ".json.control"), encoding="utf-8") as f:
            parts = f.read().split()
        return parts[0] if parts else None
    except OSError:
        return None


def read_P(state_dir, alias, key):
    st = read_json(os.path.join(state_dir, alias + ".json"))
    try:
        ino, off = st["pos"][key]
        return [int(ino), int(off)]
    except Exception:
        return None


def read_T(state_dir, alias):
    lease = read_json(os.path.join(state_dir, alias + ".lease"))
    return parse_iso(lease.get("taken_at")) if isinstance(lease, dict) else None


def take_lock(path, now):
    """O_CREAT|O_EXCL, the filter's lease primitive (`:492`). Returns (taken, note)."""
    note = ""
    for _ in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w") as f:
                f.write(utc_iso(now))
            return True, note
        except FileExistsError:
            try:
                with open(path) as f:
                    held = parse_iso(f.read().strip())
            except OSError:
                held = None
            if held is None or now - held > LOCK_STALE:
                try:
                    os.replace(path, path + ".stale." + now.strftime("%Y%m%dT%H%M%SZ"))
                    note = "stale heartbeat lock taken over"
                    continue
                except OSError:
                    return False, ""
            return False, ""
    return False, ""


def load_record(path, now):
    """Absent -> new; unparseable -> moved aside, RESET. Either one PAGES (Step-1 condition 1)."""
    if not os.path.exists(path):
        return {"aliases": {}}, "new"
    rec = read_json(path)
    if isinstance(rec, dict) and isinstance(rec.get("aliases"), dict):
        return rec, "ok"
    try:
        os.replace(path, path + ".bad-" + now.strftime("%Y%m%dT%H%M%SZ"))
    except OSError:
        pass
    return {"aliases": {}}, "RESET"


def write_and_read_back(path, rec):
    """Write, then READ BACK in the same run (Step-1 BLOCKER-2). False = NOT PERSISTING."""
    try:
        tmp = path + ".tmpw"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, sort_keys=True)
        os.replace(tmp, path)
        return read_json(path) == json.loads(json.dumps(rec, sort_keys=True))
    except Exception:
        return False


def decide(a, now):
    """Returns (control_line, notify)."""
    state_dir = a.state_dir
    remote = Remote(a)
    rec_path = os.path.join(state_dir, "heartbeat-control.json")
    rec, rec_state = load_record(rec_path, now)
    held = rec_state != "ok"                   # no 4b/5/6/ISSUER-NOT-RUN decision from a new or reset record
    checks = []                                # CHECK FAILED reasons (all page)
    if rec_state == "new":
        checks.append("control record new")
    elif rec_state == "RESET":
        checks.append("control record RESET (unreadable)")

    try:
        s1 = remote.scan()
    except (RemoteFailed, OSError, subprocess.TimeoutExpired) as e:
        return f"control: CHECK FAILED — remote read failed ({e})", True

    D = s1["D"]
    # ARMED, not alive: a session has a .alive file (DEAD, STUCK and CENSUS-FAILED all have one); "not armed" = none.
    # This is the old step-2c human gate, which now lives only here (Langston gate A r2, condition 2).
    armed = [x for x in ALIASES if a.liveness.get(x) != "not armed"]
    gated = [x for x in ALIASES if x not in armed]
    issued = []
    if not gated:
        for x in ALIASES:
            if s1["aliases"].get(x, {}).get("N") != D:
                try:
                    remote.append(x, D)
                    issued.append(x)
                except (RemoteFailed, OSError, subprocess.TimeoutExpired):
                    pass                                 # the re-read below reports it as ISSUER NOT RUN
    try:
        s2 = remote.scan() if issued else s1     # the decision uses POST-issue reads (Step-2 BLOCKER-3)
    except (RemoteFailed, OSError, subprocess.TimeoutExpired) as e:
        return f"control: CHECK FAILED — remote read failed after issue ({e})", True

    notes = []
    if issued:
        notes.append("issued " + "/".join(issued))
    if gated and any(s2["aliases"].get(x, {}).get("N") != D for x in ALIASES):
        notes.append("ISSUER GATED BY " + "/".join(gated))
    not_run = [x for x in ALIASES if not gated and s2["aliases"].get(x, {}).get("N") != D]
    fails = rec.get("issuer_fail", 0)
    if not_run:
        if held:
            notes.append("ISSUER NOT RUN " + "/".join(not_run) + " held (record reset)")
        else:
            fails += 1
            (checks if fails >= 2 else notes).append("ISSUER NOT RUN " + "/".join(not_run))
    else:
        fails = 0

    ino = s2["ino"]
    rotated = (not held) and rec.get("log_ino") is not None and rec.get("log_ino") != ino
    if rotated:
        notes.append("log rotated")

    not_answered, states, new_aliases = [], [], {}
    for x in ALIASES:
        lv = a.liveness.get(x, "")
        ent = s2["aliases"].get(x)
        N, O = (ent["N"], ent["O"]) if ent else (None, None)
        prev = rec.get("aliases", {}).get(x, {}) if not held else {}
        same_token = prev.get("token") == N
        reissues = list(prev.get("reissues", [])) if same_token else []
        P = read_P(state_dir, x, a.log_key)
        new_aliases[x] = {"token": N, "prev_P": P, "reissues": reissues}

        def say(label):
            states.append(f"{x} {label}")

        if lv == "DEAD":
            say("DEAD"); continue                                    # 1: already pages as DEAD
        if lv == "not armed":
            say("not armed"); continue                               # 2: reported; it gates the issue
        if lv == "CENSUS-FAILED":
            say("CENSUS-FAILED (control not judged)"); continue      # 1b
        if N is None:
            say("not yet issued"); continue                          # only reachable while the issue is GATED
        A = read_A(state_dir, x)
        if A == N:
            say("answered"); continue                                # 3 (before STUCK: the .control write
        if lv == "STUCK":                                            #    is independent of the position save)
            say("STUCK (control pending)"); continue                 # 1a
        if lv != "alive":
            checks.append(f"UNDETERMINED {x} (liveness={lv!r})"); continue
        T = read_T(state_dir, x)
        if P is None or T is None:
            checks.append(f"UNDETERMINED {x} (N={N} O={O} ino={ino} A={A} P={P} T={T and utc_iso(T)})"); continue
        pino, poff = P
        if pino != ino and not rotated:
            checks.append(f"UNDETERMINED {x} (N={N} O={O} ino={ino} A={A} P={P} T={utc_iso(T)})"); continue
        if pino == ino and poff <= O:
            if not held and same_token and prev.get("prev_P") == P:
                not_answered.append(f"{x} NOT delivering"); continue  # 4b: frozen for two runs
            say("awaiting"); continue                                 # 4 (4b cannot be judged on a reset record)
        # P > O, or a rotation: consumed-and-failed, or skipped by a start from the log end
        if held:
            say("held (record reset)"); continue
        if rotated or pino != ino:
            reissues = []                                              # a rotation voids old offsets: re-issue, never
            new_aliases[x]["reissues"] = reissues                      # persist the clear HERE, before any early exit
                                                                       # (gate B r2 blocker: a failed append kept the
                                                                       # void stamp and paged two runs later)
                                                                       # page on them (gate B condition 1: on `rotated`
                                                                       # too, not only on a foreign position inode)
        # an unparseable re-issue stamp counts as "now", i.e. later than T: it errs toward paging, never toward silence
        live_before = [r for r in reissues if (parse_iso(r.get("at")) or now) > T]
        arms = {r.get("T") for r in reissues} | {utc_iso(T)}        # this arm counts: page AT the third
        if live_before or len(arms) >= MAX_REISSUE_ARMS:
            not_answered.append(f"{x} NOT answered"); continue        # 5
        if not TOKEN_RE.fullmatch(str(N)):                             # N is read back out of the log and goes into
            checks.append(f"UNDETERMINED {x} (unsafe token {N!r})"); continue   # a shell command: validate it first
        try:
            off = remote.append(x, N)                                  # 6: one re-issue, no page
        except (RemoteFailed, OSError, subprocess.TimeoutExpired) as e:
            checks.append(f"re-issue failed {x} ({e})"); continue
        # "offset" is DIAGNOSTIC only (where the line landed, for a human reading the record); no decision reads it
        reissues.append({"offset": off, "at": utc_iso(now), "T": utc_iso(T)})
        new_aliases[x]["reissues"] = reissues
        say("re-issued" + (" (log rotated)" if rotated else ""))

    if getattr(a, "emit_states", False):                     # tests: every alias must land in EXACTLY one state
        per = {}
        for x in ALIASES:
            per[x] = (sum(1 for s_ in states + not_answered if s_.startswith(x + " "))
                      + sum(1 for c in checks if c.startswith((f"UNDETERMINED {x} ", f"re-issue failed {x} "))))
        print(json.dumps(per), file=sys.stderr)

    new_rec = {"log_ino": ino, "issuer_fail": fails, "aliases": new_aliases}
    if not write_and_read_back(rec_path, new_rec):
        checks.append("control record NOT PERSISTING")

    body = "; ".join(not_answered + checks + notes + states)
    if not_answered:
        return f"control: NOT answered — {body}", True
    if checks:
        return f"control: CHECK FAILED — {body}", True
    return f"control: {body}", False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--liveness", nargs="+", required=True, help="ALIAS=state from step 2b")
    ap.add_argument("--state-dir", default=os.path.join(os.path.expanduser("~"), ".claude", "cc-wake-state"))
    ap.add_argument("--log")
    ap.add_argument("--log-key", default=LIVE_LOG)
    ap.add_argument("--today")
    ap.add_argument("--now")
    ap.add_argument("--ssh-target", default="root@204.168.141.77")
    ap.add_argument("--ssh-port", type=int)
    ap.add_argument("--emit-states", action="store_true", help="tests: print per-alias state counts to stderr")
    # The prologue is inside the same fail-loud guard as decide() (Langston Step-4 gate B, condition 2): a malformed
    # --liveness, an unparseable --now or a missing state folder must still print a control line and NOTIFY, or step 3
    # is back to a model inferring the state - the one thing this script exists to remove.
    try:
        a = ap.parse_args(argv)
        a.liveness = dict(kv.split("=", 1) for kv in a.liveness)
        now = parse_iso(a.now) if a.now else datetime.now(timezone.utc)
        if now is None:
            raise ValueError(f"--now {a.now!r} is not an ISO instant")
        if a.log and not a.today:
            a.today = now.strftime("%Y%m%d")
        lock = os.path.join(a.state_dir, "heartbeat-control.lock")
        taken, note = take_lock(lock, now)
    except (Exception, SystemExit) as e:          # SystemExit too: argparse exits on a bad argument (and on --help,
                                                  # which therefore prints a CHECK FAILED line - harmless, never run so)
        print(f"control: CHECK FAILED — UNDETERMINED (script start failed: {type(e).__name__}: {e})")
        print("NOTIFY yes")
        return 0
    if not taken:
        print("control: held — another heartbeat run is in progress")
        print("NOTIFY no")
        return 0
    try:
        try:
            line, notify = decide(a, now)
        except Exception as e:                                   # never let the heartbeat go silent
            line, notify = f"control: CHECK FAILED — UNDETERMINED (script error: {type(e).__name__}: {e})", True
    finally:
        try:
            os.remove(lock)
        except OSError:
            pass
    if note:
        line += f" ({note})"
    print(line)
    print("NOTIFY " + ("yes" if notify else "no"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
