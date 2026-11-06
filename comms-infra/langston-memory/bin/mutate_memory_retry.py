#!/usr/bin/env python3
"""B-LANGSTON-TWO-WORKERS (#1248) P4: mutation runner for the race recovery in langston-memory-write. Each mutation
removes one guard; test_memory_retry.py must FAIL for every one. Run as root beside the suite (see its docstring):
    python3 mutate_memory_retry.py      (exit 0 = every mutation caught; judged by exit code; the writer is restored)"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WRITER = os.path.join(HERE, "langston-memory-write")
SUITE = os.path.join(HERE, "test_memory_retry.py")

MUTATIONS = {
    "--retry-part never merges (always refuses)": (
        "                if not opts.get(\"--retry-part\") or append:\n", "                if True:\n"),
    "an overlap is not detected": ("        if x[3] != y[3] and (y[0] < x[1] or (x[0] == y[0])):\n", "        if False:\n"),
    "the ledger absorb skips its prefix check": ("            if base is None or not old.startswith(base):\n",
                                                 "            if base is None:\n"),
    "the ledger absorb is silent": (
        "            sys.stderr.write(\"--ledger-append: absorbed %d B appended since your read (%s -> %s). What arrived:\\n%s\\n\"\n"
        "                             % (len(arrived.encode(\"utf-8\")), expect[:12], old_sha[:12], arrived[:4000]))\n",
        "            pass\n"),
    "the refusal does not show what landed": (
        "                                     \"Another write landed after you read it; what it changed:\\n%s\\nRe-run the SAME command \"\n",
        "                                     \"Another write landed after you read it; what it changed:%.0s Re-run the SAME command \"\n"),
}


def main():
    src = open(WRITER, encoding="utf-8").read()
    survived = []
    try:
        for name, (a, b) in MUTATIONS.items():
            if src.count(a) != 1:
                print(f"NOT APPLIED (anchor count {src.count(a)}): {name}")
                survived.append(name)
                continue
            open(WRITER, "w", encoding="utf-8").write(src.replace(a, b))
            r = subprocess.run([sys.executable, SUITE], capture_output=True, text=True, timeout=600)
            print(("CAUGHT   " if r.returncode != 0 else "SURVIVED ") + name)
            if r.returncode == 0:
                survived.append(name)
    finally:
        open(WRITER, "w", encoding="utf-8").write(src)
    print(f"\n{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} caught")
    sys.exit(0 if not survived else 1)


if __name__ == "__main__":
    main()
