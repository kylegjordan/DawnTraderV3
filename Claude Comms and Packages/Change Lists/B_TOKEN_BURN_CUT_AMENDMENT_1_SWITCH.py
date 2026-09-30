# -*- coding: utf-8 -*-
"""B-TOKEN-BURN-CUT amendment 1 (OBJ-5, OBJ-6) — the RULE-TEXT SWITCH and the owner SEED, applied at Step 6, NOT at Step 3.

Held for the same reason as B_TOKEN_BURN_CUT_ARM_SWITCH.py: the live filter must be installed first (its
OBJ-5 routing and OBJ-6 recorder ship together — Langston: the ~5 alert routings a day that OBJ-5 stops
delivering are picked up only by the owner record). Order at Step 6: (1) this script's gate verifies the live
filter against its blob at --ref; (2) it SEEDS each session's owner record from the whole inbox (the follower
from offset 0 into the filter's --seed-owners mode); (3) it applies the rule-text edits below (Kyle approved
changing his 2026-05-17 per-turn rule, 2026-09-30).
usage: python B_TOKEN_BURN_CUT_AMENDMENT_1_SWITCH.py <repo-root> --ref=<reviewed sha> [--dry]
"""
import sys, os, hashlib, subprocess
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = sys.argv[1]
DRY = "--dry" in sys.argv
REF = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--ref=")), None)
if not REF:
    sys.exit("ABORT: --ref=<reviewed sha> is required")
S = "C:/Users/kyleg/.claude"

# (1) the gate: the live filter and follower are the reviewed blobs (#1004)
bad = []
for rel, live in (("comms-infra/laptop/cc-wake-filter.py", f"{S}/cc-wake-filter.py"),
                  ("comms-infra/laptop/cc-wake-follow.py", f"{S}/cc-wake-follow.py")):
    blob = subprocess.run(["git", "-C", ROOT, "show", f"{REF}:{rel}"], capture_output=True, check=True).stdout
    got = hashlib.sha256(open(live, "rb").read()).hexdigest() if os.path.exists(live) else None
    if got != hashlib.sha256(blob).hexdigest():
        bad.append(f"{live} != {REF[:9]}:{rel}")
    else:
        print("verified", live)
if bad:
    if not DRY:
        sys.exit("ABORT (gate): " + "; ".join(bad))
    print("gate WOULD ABORT:", "; ".join(bad))

# (2) the seed: one pass over the whole inbox, then the same record copied to each session's own file
if not DRY and not bad:
    ino = subprocess.run(["ssh", "root@204.168.141.77", "stat -c %i /var/log/cc-discord-inbox.jsonl"],
                         capture_output=True, text=True, check=True).stdout.strip()
    fol = subprocess.Popen(["ssh", "-o", "ConnectTimeout=15", "root@204.168.141.77", f"python3 - /var/log/cc-discord-inbox.jsonl:{ino}:0"],
                           stdin=open(f"{S}/cc-wake-follow.py", "rb"), stdout=subprocess.PIPE)
    # FINDING-3 (Langston): seed into a THROWAWAY dir — seeding at the live path would race CC-A's running watcher.
    import tempfile
    tmpd = tempfile.mkdtemp(prefix="owner-seed-")
    r = subprocess.run(["python3", "-u", f"{S}/cc-wake-filter.py", "CC-A", "--seed-owners",
                        "--state", f"{tmpd}/SEED.json"], stdin=fol.stdout, capture_output=True)
    fol.kill()
    lines = r.stderr.decode("utf-8", "replace").strip().splitlines()
    print(lines[-1] if lines else "(the seed printed nothing on stderr)")
    data = open(f"{tmpd}/CC-A.alert-owners.json", "rb").read()
    if b'"seeded_at"' not in data:
        sys.exit("ABORT: the seed did not finish (no seeded_at) — nothing copied")
    # Round 3 finding (3): an ATOMIC replace into each live record (a running watcher reads and writes these), then every
    # one READ BACK and checked for seeded_at — a clobbered seed falls open to the full list, which looks like "not seeded".
    for a in ("CC-A", "CC-B", "CC-C", "CC-INFRA"):
        dst = f"{S}/cc-wake-state/{a}.alert-owners.json"
        open(dst + ".seedtmp", "wb").write(data)
        os.replace(dst + ".seedtmp", dst)
    import json as _json
    for a in ("CC-A", "CC-B", "CC-C", "CC-INFRA"):
        back = _json.load(open(f"{S}/cc-wake-state/{a}.alert-owners.json", encoding="utf-8"))
        if not (back.get("_meta") or {}).get("seeded_at"):
            sys.exit(f"ABORT: {a}'s owner record has no seeded_at after the copy — the seed was clobbered; re-run")
    print("seeded", len(data), "bytes into the four owner records, each read back with seeded_at")

# (3) the rule text
EDITS = [
    ("CLAUDE.md",
     "2. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()`: surface to user **as part of your response in plain language** (not raw JSON, not file paths); cite `id`, `title`, `severity`, `body`, `metadata`; state whether action this turn or FYI.",
     "2. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()` **that the hook lists for YOUR session** — routed to you, not yet routed to anyone, or critical: surface to user **as part of your response in plain language** (not raw JSON, not file paths); cite `id`, `title`, `severity`, `body`, `metadata`; state whether action this turn or FYI. **The rest are routed to other sessions or to Kyle and are NOT yours to raise** (Kyle 2026-09-30, `B-TOKEN-BURN-CUT` OBJ-6 — every session narrating the same list every turn is what he asked to stop). The owner comes from Langston's `[[ALERT … owner=…]]` markers, which your wake filter records; with no record the hook shows the full list. **Langston: before writing an `[[ALERT … owner=…]]` marker, re-derive that id's current owner from the inbox and RE-AFFIRM it unless you are deliberately moving it** — an owner that changed within 24 h reads as unrouted in every session, so re-guessing it each turn undoes the narrowing (Langston, `B-TOKEN-BURN-CUT` amendment 1 round 3 condition 3)."),
    (".claude/memory/MEMORY.md",
     "surface (a) state=active + acknowledged_at=null + triggers_at≤now,",
     "surface (a) state=active + acknowledged_at=null + triggers_at≤now **that the hook lists for YOU (routed to you, unrouted, or critical — the rest are other sessions' or Kyle's, not yours to raise; Kyle 2026-09-30, `B-TOKEN-BURN-CUT` OBJ-6)**,"),
]
files = {}
for rel, a, b in EDITS:
    p = os.path.join(ROOT, *rel.split("/"))
    if p not in files:
        raw = open(p, "rb").read().decode("utf-8")
        files[p] = ["\r\n" if "\r\n" in raw else "\n", raw.replace("\r\n", "\n")]
    if files[p][1].count(a) != 1:
        sys.exit(f"ABORT {rel}: {files[p][1].count(a)} matches for {a[:80]!r}")
    files[p][1] = files[p][1].replace(a, b)
    print("ok", rel)
if DRY:
    print(f"DRY RUN: {len(EDITS)} edits match exactly once; nothing written")
elif not bad:
    for p, (nl, t) in files.items():
        open(p, "wb").write(t.replace("\n", nl).encode("utf-8"))
    print(f"wrote {len(EDITS)} edits")
