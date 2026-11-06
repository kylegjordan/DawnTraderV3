#!/usr/bin/env python3
"""B-LANGSTON-TWO-WORKERS (#1248): mutation runner for the lane rules. Each mutation breaks one rule in
langston_queue.py; the lane suite must FAIL (non-zero exit) for every one. Judged by exit code, never by
grepping output (a crashing mutant prints no FAIL line). Restores the file on exit.
Run from comms-infra/discord/: python3 mutate_langston_lanes.py  (exit 0 = every mutation caught)"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(HERE, "langston_queue.py")
SUITE = os.path.join(HERE, "test_langston_lanes.py")

MUTATIONS = {
    "no id gets its own lane per task": (
        "    return SHARED_LANE\n\n\nclass LaneTaskQueue",
        "    return \"solo:\" + str(task.get(\"message_id\"))\n\n\nclass LaneTaskQueue"),
    "two ids: first id wins": ("    if len(ids) == 1:\n", "    if len(ids) >= 1:\n"),
    "escalation keyed by template alone": ("return \"alert:\" + repr(tuple(k))", "return \"alert:\" + repr(k[0])"),
    "a quoted line counts as the opening": ("if not t or t.startswith(\">\"):", "if not t:"),
    "a taken task does not hold its lane": ("        self.running[task[\"_lane\"]] = worker\n", "        pass\n"),
    # the two prefix guards are redundant by design (a greedy tail AND a right-hand lookahead), so this
    # mutation removes BOTH; removing one alone is expected to survive.
    "ids matched as prefixes (non-greedy tail AND no lookahead)": [
        ("(?:[-_][A-Za-z0-9]+)*)|", "(?:[-_][A-Za-z0-9]+)*?)|"),
        ("    r\"(?![A-Za-z0-9_-])\")", "    r\"\")")],
    "no right-hand boundary": ("    r\"(?![A-Za-z0-9_-])\")", "    r\"\")"),
    "release does not free the lane": ("            self.running.pop(task.get(\"_lane\"), None)\n", "            pass\n"),
    "flags ignored": ("                if may_take is None or may_take(worker):\n", "                if True:\n"),
}


def main():
    src = open(SRC_PATH, encoding="utf-8").read()
    survived = []
    try:
        for name, pairs in MUTATIONS.items():
            pairs = pairs if isinstance(pairs, list) else [pairs]
            mutated = src
            if any(src.count(a) != 1 for a, _b in pairs):
                print(f"NOT APPLIED (an anchor is not unique): {name}")
                survived.append(name)
                continue
            for a, b in pairs:
                mutated = mutated.replace(a, b)
            open(SRC_PATH, "w", encoding="utf-8").write(mutated)
            r = subprocess.run([sys.executable, SUITE], capture_output=True, text=True, timeout=120)
            print(("CAUGHT   " if r.returncode != 0 else "SURVIVED ") + name)
            if r.returncode == 0:
                survived.append(name)
    finally:
        open(SRC_PATH, "w", encoding="utf-8").write(src)
    print(f"\n{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} caught")
    sys.exit(0 if not survived else 1)


if __name__ == "__main__":
    main()
