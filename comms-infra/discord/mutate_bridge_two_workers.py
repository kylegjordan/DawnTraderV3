#!/usr/bin/env python3
"""B-LANGSTON-TWO-WORKERS (#1248): mutation runner for the bridge's two-worker safety. Each mutation removes one
guard from discord-langston-bridge.py or langston_queue.py; test_bridge_two_workers.py must FAIL for every one.
A HAND-RUN GATE on Helsinki, like the suite itself (run as root with the bridge venv, from its directory):
    /opt/discord-bridges/venv/bin/python3 mutate_bridge_two_workers.py     (exit 0 = every mutation caught)
Judged by exit code; both files are restored on exit."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE = os.path.join(HERE, "discord-langston-bridge.py")
QUEUE = os.path.join(HERE, "langston_queue.py")
SUITE = os.path.join(HERE, "test_bridge_two_workers.py")

MUTATIONS = {
    "the queue read-modify-write is not locked": (QUEUE, "        fcntl.flock(fd, fcntl.LOCK_EX)\n        yield\n",
                                                  "        yield\n"),
    "self-advance does not mark the picked item in flight": (
        BRIDGE, "    nxt[\"advance_in_flight_ts\"] = time.time()", "    pass"),
    "each worker keeps its own breaker": (
        BRIDGE, "                process_task(task, state, BREAKER, task_q)",
        "                process_task(task, state, {\"bot_turns\": 0} if False else dict(BREAKER), task_q)"),
    "the breaker count is copied, not shared": (
        BRIDGE, "        with _SHARED:\n            breaker[\"bot_turns\"] += 1\n            _turns = breaker[\"bot_turns\"]\n",
        "        _turns = breaker[\"bot_turns\"] + 1\n"),
    "no per-invoke scratch directory": (BRIDGE, "    scratch = make_scratch_dir(task)\n", "    scratch = None\n"),
    "the sweep is not limited to inv-*": (BRIDGE, "os.path.join(SCRATCH_ROOT, \"inv-*\")", "os.path.join(SCRATCH_ROOT, \"*\")"),
    "one-worker flag ignored": (BRIDGE, "    if worker != WORKER_NAMES[0] and _flag_set(ONE_WORKER_FLAG):\n",
                                "    if False:\n"),
    "a task does not release its lane": (BRIDGE, "                task_q.release(task)\n", "                pass\n"),
    # Coltrane, Step 4 (4): os.path.exists() turns a stat failure into "clear" - the fail-open direction
    "an unreadable flag counts as clear (os.path.exists)": (
        BRIDGE, "    try:\n        os.lstat(path)\n        return True\n    except FileNotFoundError:\n        return False\n"
                "    except OSError:\n        return True\n",
        "    return os.path.exists(path)\n"),
}


def main():
    originals = {p: open(p, encoding="utf-8").read() for p in (BRIDGE, QUEUE)}
    survived = []
    try:
        for name, (path, a, b) in MUTATIONS.items():
            src = originals[path]
            if src.count(a) != 1:
                print(f"NOT APPLIED (anchor count {src.count(a)}): {name}")
                survived.append(name)
                continue
            open(path, "w", encoding="utf-8").write(src.replace(a, b))
            try:
                r = subprocess.run([sys.executable, SUITE], capture_output=True, text=True, timeout=90)
                rc = r.returncode
            except subprocess.TimeoutExpired:
                rc = "timeout"          # a hang (e.g. a lane never released) is a caught mutation, not a pass
            print(("CAUGHT   " if rc != 0 else "SURVIVED ") + name + f"  (rc={rc})")
            if rc == 0:
                survived.append(name)
            open(path, "w", encoding="utf-8").write(src)
    finally:
        for p, src in originals.items():
            open(p, "w", encoding="utf-8").write(src)
    print(f"\n{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} caught")
    sys.exit(0 if not survived else 1)


if __name__ == "__main__":
    main()
