#!/usr/bin/env python3
"""Mutation proof for the C-2 snapshot verifier."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


PKG = Path(__file__).resolve().parent.parent
MUTANTS = [
    ("copied byte hash is not checked",
     'if len(copied_data) != entry.get("bytes") or _sha(copied_data) != entry.get("sha256"):',
     'if len(copied_data) != entry.get("bytes"):',
     "FAIL C-2 one changed snapshot byte turns verification red"),
    ("the source-prefix binding is not checked, so an omitted row can be relabelled as complete",
     'if _sha(source_prefix) != entry.get("source_prefix_sha256") or source_prefix != copied_data:',
     'if False:',
     "FAIL C-2 one omitted switch row turns verification red"),
    ("snapshot removal can happen before durable deletion evidence",
     'if log_path:\n        _append_delete_record(log_path, prepared)',
     'if False:\n        _append_delete_record(log_path, prepared)',
     "FAIL C-2 deletion evidence failure preserves snapshot"),
]


def main():
    bad = 0
    for label, old, new, expected in MUTANTS:
        work = Path(tempfile.mkdtemp(prefix="tw-mut-birthcap-review-"))
        copy = work / "token-watch"
        shutil.copytree(PKG, copy, ignore=shutil.ignore_patterns("__pycache__"))
        path = copy / "tools" / "export_birthcap_review.py"
        source = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        count = source.count(old)
        if count != 1:
            print("NOT APPLIED (%d matches): %s" % (count, label))
            bad += 1
            shutil.rmtree(work, ignore_errors=True)
            continue
        path.write_text(source.replace(old, new), encoding="utf-8", newline="\n")
        result = subprocess.run([sys.executable, str(copy / "tests" / "test_birthcap_review_export.py")],
                                capture_output=True, text=True, encoding="utf-8", errors="replace")
        caught = result.returncode != 0 and expected in result.stdout
        print("%s  %s  (rc=%d, named line %s)" %
              ("CAUGHT " if caught else "SURVIVED", label, result.returncode,
               "present" if expected in result.stdout else "ABSENT"))
        bad += not caught
        shutil.rmtree(work, ignore_errors=True)
    print("%d of %d mutations caught" % (len(MUTANTS) - bad, len(MUTANTS)))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
