#!/usr/bin/env python3
"""Tests for langston-index-guard (B-LANGSTON-CLAUDEMD-RESIDUAL, #1197 rider, P12).

Every case runs on a FIXTURE: a temp home holding the three loaded files, a fixture ratchet state with a SYNTHETIC
ceiling (Langston's ruling - the real set is never pushed over), and the guard pointed at them through its LIG_* and
the writer's LANGSTON_HOME / LMW_RATCHET_STATE seams. Each case states the condition before the call and asserts the
exit code, the message class and the log row (C-1: a matched call logs exactly one row, an unmatched call none).

    python3 test_index_guard.py [--guard PATH] [--writer PATH]      exit 0 = all pass
"""
import json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "langston-index-guard")
WRITER = os.path.join(HERE, "langston-memory-write")
args = sys.argv[1:]
if "--guard" in args:
    GUARD = args[args.index("--guard") + 1]
if "--writer" in args:
    WRITER = args[args.index("--writer") + 1]

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  :: " + detail))


class Fx:
    def __init__(self, claude=1000, memory=2000, index="line a\nline b\nx x x\n", ceiling=None):
        self.d = tempfile.mkdtemp(prefix="lig-")
        os.chmod(self.d, 0o700)
        self.home = os.path.join(self.d, "home")
        mem_dir = os.path.join(self.home, ".claude", "projects", "-home-langston", "memory")
        os.makedirs(mem_dir)
        self.index = os.path.join(mem_dir, "MEMORY.md")
        with open(os.path.join(self.home, "CLAUDE.md"), "w") as fh:
            fh.write("c" * claude)
        with open(os.path.join(self.home, "MEMORY.md"), "w") as fh:
            fh.write("m" * memory)
        with open(self.index, "w", newline="") as fh:
            fh.write(index)
        self.base = claude + memory + len(index.encode())
        self.state = os.path.join(self.d, "ratchet-state.json")
        self.set_ceiling(self.base if ceiling is None else ceiling)
        self.log = os.path.join(self.d, "guard.jsonl")

    def set_ceiling(self, c, raw=None):
        with open(self.state, "w") as fh:
            fh.write(raw if raw is not None else json.dumps({"ceiling_bytes": c}))

    def run(self, tool, ti, cwd=None):
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LIG_INDEX": self.index, "LIG_WRITER": WRITER,
               "LIG_LOG": self.log, "LANGSTON_HOME": self.home, "LMW_RATCHET_STATE": self.state}
        if os.environ.get("LIG_CLI_PACKAGE"):
            env["LIG_CLI_PACKAGE"] = os.environ["LIG_CLI_PACKAGE"]
        ev = {"tool_name": tool, "tool_input": ti, "cwd": cwd or self.d, "hook_event_name": "PreToolUse"}
        p = subprocess.run([sys.executable, GUARD], input=json.dumps(ev), capture_output=True, text=True, env=env)
        return p.returncode, p.stderr

    def rows(self):
        if not os.path.exists(self.log):
            return []
        with open(self.log) as fh:
            return [json.loads(l) for l in fh if l.strip()]

    def size(self):
        return os.path.getsize(self.index)

    def done(self):
        shutil.rmtree(self.d)


# 1. growth over the synthetic ceiling -> refused, OVER wording, ordering named, one refused row
f = Fx()
before = f.size()
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\nline b\nx x x\nNEW FACT\n"})
r = f.rows()
check("1 growth over ceiling: exit 2", rc == 2, "rc=%d err=%s" % (rc, err))
check("1 says OVER, not could-not-establish (C-3)", "OVER its ceiling" in err and "COULD NOT" not in err, err)
check("1 names the ordering (C-4)", "remove lines in one call first" in err, err)
check("1 one refused row with bytes before/after (C-1)", len(r) == 1 and r[0]["verdict"] == "refused"
      and r[0]["bytes_before"] == before and r[0]["bytes_after"] == before + 9, str(r))
f.done()

# 1c. the row stamps the running CLI version and flags a mismatch (C-5: a bump is visible, not refused)
f = Fx()
pkg = os.path.join(f.d, "package.json")
with open(pkg, "w") as fh:
    json.dump({"version": "9.9.9"}, fh)
os.environ["LIG_CLI_PACKAGE"] = pkg
rc, err = f.run("Write", {"file_path": f.index, "content": "line a" + chr(10)})
del os.environ["LIG_CLI_PACKAGE"]
r = f.rows()
check("1c row stamps cli_running and cli_mismatch", r and r[0].get("cli_running") == "9.9.9" and r[0].get("cli_mismatch") is True, str(r))
f.done()

# 2. growth that stays under the ceiling -> allowed, one row
f = Fx()
f.set_ceiling(f.base + 100)
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\nline b\nx x x\nNEW FACT\n"})
check("2 growth under ceiling: exit 0", rc == 0, err)
check("2 one allowed-under-ceiling row", [x["verdict"] for x in f.rows()] == ["allowed-under-ceiling"], str(f.rows()))
f.done()

# 3. a shrink with the set already OVER -> allowed (non-increase gate; the trim is never locked out)
f = Fx()
f.set_ceiling(f.base - 500)
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\n"})
check("3 shrink while over: exit 0", rc == 0, err)
check("3 one allowed-no-growth row", [x["verdict"] for x in f.rows()] == ["allowed-no-growth"], str(f.rows()))
f.done()

# 4. replace_all growth: one replacement fits, three do not -> refused (C-5: an assumed single replacement under-counts)
f = Fx()
f.set_ceiling(f.base + 3)        # "x" -> "xxxx": +3 once, +9 for all three
rc, err = f.run("Edit", {"file_path": f.index, "old_string": "x", "new_string": "xxxx", "replace_all": True})
check("4 replace_all counted: exit 2", rc == 2, "rc=%d %s" % (rc, err))
check("4 row bytes_after counts all three", f.rows() and f.rows()[-1].get("bytes_after") == f.size() + 9, str(f.rows()))
rc, err = f.run("Edit", {"file_path": f.index, "old_string": "line a", "new_string": "line aaa"})
check("4b single replacement within ceiling: exit 0", rc == 0, err)
f.done()

# 5. an edit the tool rejects itself (old_string not unique, no replace_all) -> passthrough, logged
f = Fx()
f.set_ceiling(f.base - 500)
rc, err = f.run("Edit", {"file_path": f.index, "old_string": "x", "new_string": "xxxxxxxx"})
check("5 non-unique edit: exit 0 (tool refuses it)", rc == 0, err)
check("5 one passthrough row", [x["verdict"] for x in f.rows()] == ["passthrough"], str(f.rows()))
f.done()

# 6. a write to any other path -> exit 0 and NO row (C-1 control: no row means not matched)
f = Fx()
f.set_ceiling(f.base - 500)
other = os.path.join(f.d, "other.md")
rc, err = f.run("Write", {"file_path": other, "content": "y" * 5000})
rc2, _ = f.run("Bash", {"command": "echo hi"})
check("6 non-index write and a Bash call: exit 0", rc == 0 and rc2 == 0, err)
check("6 no log rows", f.rows() == [], str(f.rows()))
f.done()

# 7. state unreadable -> growth refused as COULD NOT BE ESTABLISHED (C-3 distinguishes it from OVER)
f = Fx()
f.set_ceiling(None, raw="{not json")
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\nline b\nx x x\nNEW\n"})
check("7 unreadable state: exit 2", rc == 2, err)
check("7 says COULD NOT BE ESTABLISHED, not OVER", "COULD NOT BE ESTABLISHED" in err and "OVER its" not in err, err)
f.done()

# 7b. state unreadable but the call shrinks -> allowed (the gate never blocks a trim)
f = Fx()
f.set_ceiling(None, raw="{not json")
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\n"})
check("7b unreadable state, shrink: exit 0", rc == 0, err)
f.done()

# 8. an unenumerated tool aimed at the index -> refused (C-5 fail closed)
f = Fx()
rc, err = f.run("NotebookEdit", {"notebook_path": f.index, "new_source": "z"})
check("8 NotebookEdit on index: exit 2", rc == 2 and "not a tool this guard was enumerated for" in err, err)
f.done()

# 9. the index reached by a symlink and by a relative path -> matched (realpath)
f = Fx()
link = os.path.join(f.d, "alias.md")
os.symlink(f.index, link)
rc, err = f.run("Write", {"file_path": link, "content": "line a\nline b\nx x x\nNEW FACT\n"})
check("9 symlink to index: refused", rc == 2, err)
rel = os.path.relpath(f.index, f.d)
rc, err = f.run("Write", {"file_path": rel, "content": "line a\nline b\nx x x\nNEW FACT\n"}, cwd=f.d)
check("9b relative path to index: refused", rc == 2, err)
f.done()

# 10. exactly at the ceiling -> allowed (the bar is "over", as in the writer's gate)
f = Fx()
f.set_ceiling(f.base + 9)
rc, err = f.run("Write", {"file_path": f.index, "content": "line a\nline b\nx x x\nNEW FACT\n"})
check("10 total == ceiling: exit 0", rc == 0, err)
f.done()

print("\n%d pass, %d fail" % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)
