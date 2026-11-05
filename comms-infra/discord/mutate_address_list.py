#!/usr/bin/env python3
"""B-WAKE-OPENING-LIST (#1241) P6 - mutation proof for the opening-list suites. Run: python3 mutate_address_list.py

Each mutation breaks ONE rule in a COPY of the repo's comms-infra/{discord,laptop,codex} and the filter suite, runs the
suite that guards that rule FROM THE COPY, and counts as CAUGHT only if the suite EXITS NON-ZERO **and** prints the
named FAIL line. ⛔ Judged by exit code AND the named line, never by grepping for "FAIL" alone: a mutant that crashes
the suite prints no named line and would otherwise read as caught. Each patch must APPLY EXACTLY ONCE before its result
is read. Before any mutant runs, every suite runs UNMUTATED in a copy and must exit 0 - the harness's own positive
control (a copy that cannot run the suites would make every mutant look caught).
(Model: token-watch/tests/mutate_due_storage.py.)"""
import os, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COPY = ["comms-infra/discord", "comms-infra/laptop", "comms-infra/codex", "scripts/analysis/test-wake-opening-list.py"]
SUITES = {
    "parser": "comms-infra/discord/address_list_test.py",
    "gates": "comms-infra/discord/test_address_gates.py",
    "coltrane": "comms-infra/codex/test_coltrane_address.py",
    "filter": "scripts/analysis/test-wake-opening-list.py",
}

MUTATIONS = [
    # (label, file, exact old line(s), replacement, suite, the named FAIL line that must appear)
    ("no separator rule: bare whitespace separates two names",
     "comms-infra/discord/address_list.py",
     "SEPARATOR = MARKUP + r'(?:,(?:' + MARKUP + r'and\\b)?|[&/+]|and\\b)' + MARKUP\n",
     "SEPARATOR = MARKUP + r'(?:,(?:' + MARKUP + r'and\\b)?|[&/+]|and\\b|)' + MARKUP\n",
     "parser", "FAIL: bare whitespace is not a separator: 'Langston Coltrane x' -> Langston only"),
    ("no position rule: a name is SEARCHED for after the list position instead of anchored there",
     "comms-infra/discord/address_list.py",
     "            m = rx.match(text, pos)\n", "            m = rx.search(text, pos)\n",
     "parser", "FAIL: 'SWITCH TO CODEX' -> nobody (a name only later)"),
    ("no guarded load in the session filter: a missing module raises at import",
     "comms-infra/laptop/cc-wake-filter.py",
     "    except Exception as load_error:  # absence, a syntax error, re.error at import - the latch, never a dead watcher\n",
     "    except ZeroDivisionError as load_error:\n",
     "filter", "FAIL: latch (absence): the first arm gives ONE WATCHER-DRIFT WAKE naming the cause"),
    ("no guarded load in the sender: a missing module raises at import",
     "comms-infra/discord/discord_common.py",
     "    except Exception as load_error:  # absence, a syntax error, re.error at import: all reach the caller as a cause\n",
     "    except ZeroDivisionError as load_error:\n",
     "gates", "FAIL: degraded (absent): importing discord_common does not raise"),
    ("no guarded load in the sender also reaches the bridge: it dies instead of refusing",
     "comms-infra/discord/discord_common.py",
     "    except Exception as load_error:  # absence, a syntax error, re.error at import: all reach the caller as a cause\n",
     "    except ZeroDivisionError as load_error:\n",
     "gates", "FAIL: bridge refuses to start (exit 2) on a absent module, naming the cause"),
    ("no guarded load in Coltrane's bot: a missing module raises at import",
     "comms-infra/codex/coltrane-bot.py",
     "    except Exception as load_error:  # absence, a syntax error, re.error at import: all reach main()'s refusal\n",
     "    except ZeroDivisionError as load_error:\n",
     "coltrane", "FAIL: main() refuses on an ABSENT module (exit 2, cause named)"),
    # Not in the scope's list; each proves a suite can see the change it is there to see.
    ("the bridge gate reverts to name-FIRST",
     "comms-infra/discord/discord-langston-bridge.py",
     '        elif author_is_cc_bot and "LANGSTON" in dc.opening_list(content)[0]:\n',
     '        elif author_is_cc_bot and dc.opening_list(content)[0][:1] == ["LANGSTON"]:\n',
     "gates", "FAIL: 'Coltrane, Langston' now wakes Langston (it did not before)"),
    ("the sender marks only a Langston-FIRST post (the r1 sender's rule)",
     "comms-infra/discord/discord_common.py",
     '        addressed_langston = "LANGSTON" in opening_list(content)[0]\n',
     '        addressed_langston = opening_list(content)[0][:1] == ["LANGSTON"]\n',
     "gates", "FAIL: bridge without --notify: reassembled COMPLETE n/n into ONE invoke holding the whole post"),
    ("the sender prepends the mention again",
     "comms-infra/discord/discord_common.py",
     "        if _names0:\n", "        if False:\n",
     "gates", "FAIL: sender with --notify: the mention sits AFTER the opening list"),
    ("the degraded sender drops the notice and the mention again (Langston C-2)",
     "comms-infra/discord/discord_common.py",
     "        chunks[-1] = chunks[-1].rstrip() + degraded_tail\n",
     "        pass\n",
     "gates", "FAIL: degraded (absent): ★ a SHORT post carries the notice and the phone push (Langston C-2)"),
    ("the timeout flush invokes every group again (Langston C-3)",
     "comms-infra/discord/discord-langston-bridge.py",
     '                if 1 in _e[\'parts\'] and "LANGSTON" not in dc.opening_list(_e[\'parts\'][1])[0]:\n',
     "                if False:\n",
     "gates", "FAIL: C-3: a timed-out group whose part 1 does NOT address Langston is dropped, no invoke"),
    ("deploy.sh leaves address_list.py out of the bridges group (Langston C-1)",
     "comms-infra/discord/deploy.sh",
     "bridges|comms-infra/discord/address_list.py|$BRIDGE_DIR/address_list.py|0644\n", "",
     "gates", "FAIL: ★ the bridges group installs address_list.py beside discord_common.py"),
    ("the CC-PM case lock is dropped (Langston part 1 F1)",
     "comms-infra/discord/address_list.py",
     '    "CC-PM": [r"(?<![0-9])(?<![0-9][\\s])(?-i:PM)[\\s_-]*claude", r"cc[\\s_-]*pm"],\n',
     '    "CC-PM": [r"(?<![0-9])(?<![0-9][\\s])PM[\\s_-]*claude", r"cc[\\s_-]*pm"],\n',
     "parser", "FAIL: ★ the CASE LOCK: lower-case 'pm claude' is not CC-PM -> Langston only"),
    ("the FIRST match wins instead of the longest (Langston part 1 F3)",
     "comms-infra/discord/address_list.py",
     "            if m and m.end() > pos and (best is None or m.end() > best[1]):\n",
     "            if m and m.end() > pos and best is None:\n",
     "parser", "FAIL: ★ the LONGEST match wins at one position (probe registry: 'old claude' -> CC-A, not X)"),
    ("KYLE leaves the registry: a Kyle-led list wakes nobody again (Langston part 3)",
     "comms-infra/discord/address_list.py",
     "REGISTRY = {**SESSION_NAMES, **REVIEWER_NAMES, **LIST_ONLY_NAMES}\n",
     "REGISTRY = {**SESSION_NAMES, **REVIEWER_NAMES}\n",
     "parser", "FAIL: ★ a Kyle-led list continues past him -> Langston and CC-A (part 3 MUST-FIX)"),
    ("the filter builds its registry without the list-only names (Langston part 3)",
     "comms-infra/laptop/cc-wake-filter.py",
     "        registry = {**NAMES, **mod.REVIEWER_NAMES, **mod.LIST_ONLY_NAMES}   # sessions = THIS file's NAMES\n",
     "        registry = {**NAMES, **mod.REVIEWER_NAMES}\n",
     "filter", "FAIL: ★ a Kyle-led list wakes the session in it (part 3 MUST-FIX)"),
    ("the filter's crew branch keeps the name-ANYWHERE rule",
     "comms-infra/laptop/cc-wake-filter.py",
     "                    deliver = bool(crew_post_names_me(full) or CREW_ALL_RE.search(full))\n",
     "                    deliver = bool(MY_RE.search(full) or CREW_ALL_RE.search(full))\n",
     "filter", "FAIL: a later-only mention in a session post does NOT wake (KD-21)"),
    ("the filter forgets a reported cause, so every arm re-reports it",
     "comms-infra/laptop/cc-wake-filter.py",
     "    elif ADDRESS_LATCH[0] not in _latched:\n", "    elif True:\n",
     "filter", "FAIL: latch (drift): the next arm on the SAME cause gives NO drift WAKE"),
]


def make_copy():
    work = tempfile.mkdtemp(prefix="addr-mutant-")
    for rel in COPY:
        src, dst = os.path.join(REPO, rel), os.path.join(work, rel)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy(src, dst)
    return work


def run_suite(work, suite):
    env = dict(os.environ, ADDRESS_LIST_R1_GIT=REPO)   # the copy is not a git repo; the pre-batch controls read REPO
    r = subprocess.run([sys.executable, os.path.join(work, SUITES[suite])], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=600, env=env)
    return r.returncode, r.stdout


def main():
    bad = 0
    work = make_copy()
    for suite in SUITES:
        rc, out = run_suite(work, suite)
        print("%s  unmutated %s suite in a copy (rc=%d)" % ("OK     " if rc == 0 else "BROKEN ", suite, rc))
        if rc != 0:
            print(out[-800:])
            bad += 1
    shutil.rmtree(work, ignore_errors=True)
    if bad:
        print("HARNESS BROKEN - an unmutated suite fails in a copy, so no mutant result would mean anything")
        return 2
    for label, rel, old, new, suite, expect in MUTATIONS:
        work = make_copy()
        path = os.path.join(work, rel)
        src = open(path, encoding="utf-8").read().replace("\r\n", "\n")
        n = src.count(old)
        if n != 1:
            print("NOT APPLIED (%d matches): %s" % (n, label))
            bad += 1
            shutil.rmtree(work, ignore_errors=True)
            continue
        open(path, "w", encoding="utf-8", newline="\n").write(src.replace(old, new))
        rc, out = run_suite(work, suite)
        caught = rc != 0 and expect in out
        print("%s  %s  (suite=%s, rc=%d, named line %s)" % ("CAUGHT  " if caught else "SURVIVED", label, suite, rc,
                                                            "present" if expect in out else "ABSENT"))
        bad += not caught
        shutil.rmtree(work, ignore_errors=True)
    print("%d of %d mutations caught" % (len(MUTATIONS) - bad, len(MUTATIONS)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
