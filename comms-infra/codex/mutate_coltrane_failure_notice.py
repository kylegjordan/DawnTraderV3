"""Mutation runner for test_coltrane_failure_notice.py (B-AGENT-INVOKE-FAILURE-NOTICE, Coltrane's half). Runs anywhere:
    python3 mutate_coltrane_failure_notice.py      (exit 0 = every mutant caught, none by a crash)
CONTROL FIRST; each mutant is applied to a scratch COPY of coltrane-bot.py beside a copy of the test."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = "coltrane-bot.py"
MUTANTS = [
    ("P6: an invoke that raises escapes the row again",
     '            except Exception as e:   # P6: an invoke that raises still writes its row',
     '            except ZeroDivisionError as e:   # mutant'),
    ("P7 note 2: notified is set even when the notice failed to post",
     "        except Exception:\n            return False\n        mirror_to_inbox(line, m.channel.id, is_dm)\n        return True",
     "        except Exception:\n            return True\n        mirror_to_inbox(line, m.channel.id, is_dm)\n        return True"),
    ("P7: no notice on a no-reply outcome",
     "        if not answered:\n            notified = await self._notify(m, who, is_dm, outcome, time.time() - t0)",
     "        if False:\n            notified = await self._notify(m, who, is_dm, outcome, time.time() - t0)"),
    ("P4b: handled_ids ignores notified",
     '        if mid is not None and (row.get("answered") is True or row.get("notified") is True):',
     '        if mid is not None and row.get("answered") is True:'),
    ("C-7: the reader skips the rotated file",
     '    for p in (path + ".1", path):', '    for p in (path,):'),
    ("C-7: the cap does not count recovery feed FAILED rows",
     '        if "rc" in row or "outcome" in row or row.get("event") == "recovery feed FAILED":',
     '        if "rc" in row:'),
    ("P4b: no cap at feed time",
     "                if attempt_counts().get(mid, 0) >= ATTEMPT_CAP:", "                if False:"),
    ("P11: Langston's notice engages Coltrane",
     "        if is_langston_failure_notice(m.author.id, text):\n            return",
     "        if False:\n            return"),
    ("C-6 page: an untagged escape is not paged",
     '        if info.get("escaped_untagged"):\n            await self._page_escape(m, info)',
     '        if False:\n            await self._page_escape(m, info)'),
]


def run(d):
    p = subprocess.run([sys.executable, "test_coltrane_failure_notice.py"], cwd=d, capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def copy():
    d = tempfile.mkdtemp(prefix="mut-cfn-")
    for n in (BOT, "test_coltrane_failure_notice.py"):
        shutil.copy(os.path.join(HERE, n), d)
    os.makedirs(os.path.join(os.path.dirname(d), "discord"), exist_ok=True)
    return d


os.environ["COLTRANE_ADDRESS_LIST"] = os.path.join(os.path.dirname(HERE), "discord", "address_list.py")
ctl = copy()
rc, out = run(ctl)
shutil.rmtree(ctl, ignore_errors=True)
if rc != 0:
    print("CONTROL FAILED\n" + out[-800:])
    sys.exit(2)
print("control: the unmutated copy passes")
caught = odd = 0
for name, a, b in MUTANTS:
    d = copy()
    src = open(os.path.join(d, BOT), encoding="utf-8").read()
    if src.count(a) != 1:
        print("ANCHOR   %s (found %d)" % (name, src.count(a)))
        odd += 1
        continue
    open(os.path.join(d, BOT), "w", encoding="utf-8").write(src.replace(a, b))
    rc, out = run(d)
    shutil.rmtree(d, ignore_errors=True)
    if rc != 0 and ("FAIL:" in out or "AssertionError" in out):
        caught += 1
        print("caught   " + name)
    elif rc != 0:
        odd += 1
        print("CRASH    " + name + "   " + out.strip().splitlines()[-1][:160])
    else:
        print("SURVIVED " + name)
print("\n%d/%d caught (%d by a crash or a bad anchor)" % (caught, len(MUTANTS), odd))
sys.exit(0 if caught == len(MUTANTS) else 1)
