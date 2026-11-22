#!/usr/bin/env python3
"""B-TOKEN-ECONOMY amendment 1, P6: mutation runner for the alert lane's owner-table routing. Each mutation breaks
ONE rule in alert_owner_route.py, alert_lane.py or the bridge's read block; alert_owner_route_test.py must FAIL
(non-zero exit) for every one. Judged by EXIT CODE, never by grepping output (a crashing mutant prints no FAIL line).
Every anchor must occur EXACTLY ONCE in its file or the mutation is reported NOT APPLIED and counts as survived -
so a mutation that silently did not apply can never read as caught. Restores every file on exit.
Run from comms-infra/discord/: python3 mutate_alert_owner_route.py  (exit 0 = every mutation caught)"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "alert_owner_route_test.py")
AOR, LANE, BRIDGE = "alert_owner_route.py", "alert_lane.py", "discord-langston-bridge.py"

# name -> [(file, anchor, replacement), ...]
MUTATIONS = {
    # --- alert_owner_route.py: the rules and the refuse-on-nothing guards ---
    "register: empty parse returns {} instead of raising": [
        (AOR, "        raise ValueError('the open-batch register parsed to zero batches')\n", "        pass\n")],
    "plan: empty parse returns {} instead of raising": [
        (AOR, "        raise ValueError('the active plan parsed to zero single-owner batches')\n", "        pass\n")],
    "plan: owner read from the right-hand cell only": [(AOR, "for k in (j - 1, j + 1):", "for k in (j + 1,):")],
    "plan: a prose cell counts as an owner (search, not fullmatch)": [
        (AOR, "m = _OWNER_FULL.fullmatch(c.strip().strip('*~').strip())", "m = _OWNER_FULL.search(c)")],
    "plan: two-owner batches kept (first owner wins)": [
        (AOR, "for b, o in found.items() if len(o) == 1}", "for b, o in found.items() if len(o) >= 1}")],
    "the plan wins over the register": [(AOR, "return dict(plan_owner, **register)", "return dict(register, **plan_owner)")],
    "prefixes tried shortest first": [
        (AOR, "for pre in sorted(prefixes, key=len, reverse=True):", "for pre in sorted(prefixes, key=len):")],
    "a table row ignored (register/plan only)": [(AOR, "    if row:\n        return (row['owner'],", "    if False:\n        return (row['owner'],")],
    "register/plan step skipped": [(AOR, "    if f[0] == 'batch' and f[1] in batch_owner:\n", "    if False:\n")],
    "title-names-a-batch uses an unknown batch": [(AOR, "        if b in batch_owner:\n", "        if b in batch_owner or True:\n")],
    "fallback hard-coded to CC-A": [(AOR, "    return (table['fallback'], 'fallback')", "    return ('CC-A', 'fallback')")],
    "table: an empty text loads": [(AOR, "        raise ValueError('the owner table is empty')\n", "        return {}\n")],
    "table: a Kyle-owned row trusted": [(AOR, "row.get('owner') not in SESSIONS:", "row.get('owner') not in SESSIONS + ('Kyle',):")],
    "table: zero rows trusted": [(AOR, "        raise ValueError('the owner table has zero rows')\n", "        pass\n")],
    "table: a Kyle fallback trusted": [(AOR, "if table.get('fallback') not in SESSIONS:", "if table.get('fallback') not in SESSIONS + ('Kyle',):")],
    "key: metadata.dedupe_key not read": [(AOR, "            k = md.get('dedupe_key')\n", "            pass\n")],
    # --- alert_lane.py: owner_routing, table_routes, apply_table ---
    "owner_routing: the plan never read": [
        (LANE, "    plan_owner, _multi = aor.parse_plan(read(OWNER_PLAN_PATH))\n", "    plan_owner = {}\n")],
    "table_routes: the top-level key only": [(LANE, "aor.table_route(aor.dedupe_key_of(row),", "aor.table_route(row.get(\"dedupe_key\") or \"\",")],
    "apply_table: the lane's Kyle routing accepted": [(LANE, "        if owner == \"Kyle\":\n            escalate[aid] = \"the lane would", "        if False:\n            escalate[aid] = \"the lane would")],
    "apply_table: fallback overrides a Langston precedent": [(LANE, "            if rows:\n                rest[aid] = (owner, action)\n", "            if False:\n                rest[aid] = (owner, action)\n")],
    "apply_table: the fallback owner is the lane's choice": [
        (LANE, "            routed[aid] = (t_owner, (action + \" (owner table: fallback", "            routed[aid] = (owner, (action + \" (owner table: fallback")],
    "apply_table: a clean Kyle precedent not escalated": [(LANE, "            if ok and eff == \"Kyle\":\n", "            if False:\n")],
    "apply_table: a contradicting precedent not escalated": [(LANE, "            if ok and eff != t_owner:\n", "            if False:\n")],
    "apply_table: the table never settles an interleave (escalates instead)": [
        (LANE, "            if not ok:\n                tag += \"; settles Langston's back-and-forth\"\n",
         "            if not ok:\n                escalate[aid] = \"interleave\"\n                continue\n")],
    "apply_table: the rule not stated in the post": [(LANE, "        tag = \"owner table: \" + rule\n", "        tag = \"owner table\"\n")],
    "apply_table: an alert with no table route dropped": [(LANE, "        if tr is None:\n            rest[aid] = (owner, action)\n", "        if tr is None:\n            pass\n")],
    # --- the bridge: a failed read escalates the whole batch and the lane is not invoked (R2-4) ---
    "bridge: a failed read still invokes the lane": [(BRIDGE, "            escalate += [(t, why) for _, t in ided]\n            ided = []\n",
                                                      "            escalate += [(t, why) for _, t in ided]\n")],
    "bridge: a failed read escalates nothing": [(BRIDGE, "            escalate += [(t, why) for _, t in ided]\n            ided = []\n",
                                                 "            ided = []\n")],
    # --- Step-4 verdict 2 (Langston 2026-11-20): BLOCKER-1, C-1, C-3, C-5 ---
    "register/plan: a non-session owner trusted (the escalation guard KD-115 keeps)": [(AOR, "    if owner in SESSIONS:\n        return (owner, rule)\n",
                                              "    if True:\n        return (owner, rule)\n")],
    # --- KD-115 (2026-11-22): CC-PM is an owner the lane routes to ---
    "KD-115: CC-PM dropped from SESSIONS": [(AOR, "SESSIONS = ('CC-A', 'CC-B', 'CC-C', 'CC-INFRA', 'CC-PM')", "SESSIONS = ('CC-A', 'CC-B', 'CC-C', 'CC-INFRA')")],
    "KD-115: CC-PM dropped from the lane's OWNERS": [(LANE, 'OWNERS = ("CC-A", "CC-B", "CC-C", "CC-INFRA", "CC-PM", "Kyle")', 'OWNERS = ("CC-A", "CC-B", "CC-C", "CC-INFRA", "Kyle")')],
    "KD-115: PM Claude not an owner opener": [(AOR, "ANALYST Claude|Infra Claude|PM Claude)", "ANALYST Claude|Infra Claude)")],
    "KD-115: PM Claude display name unmapped": [(AOR, "'Infra': 'CC-INFRA', 'PM Claude': 'CC-PM'}", "'Infra': 'CC-INFRA'}")],
    "KD-115: owner CC-PM suffix not read": [(AOR, "INFRA|PM)|Infra)", "INFRA)|Infra)")],
    "is_escalation always False": [(AOR, "    return bool(route) and str(route[1]).startswith(ESCALATE)\n", "    return False\n")],
    "apply_table: an escalation route not escalated": [(LANE, "        if aor.is_escalation(tr):", "        if False:")],
    "mirror age limit back to 15 h": [(LANE, "OWNER_MIRROR_MAX_AGE_S = 1800", "OWNER_MIRROR_MAX_AGE_S = 54000")],
    "pin: a stale mirror accepted": [(BRIDGE, "    if age > al.OWNER_MIRROR_MAX_AGE_S:\n", "    if False:\n")],
    "pin: a future stamp accepted": [(BRIDGE, "    if age < 0:\n", "    if False:\n")],
    "stamps: the first readable wins, not the newest": [(BRIDGE, "        if int(first) > best:\n", "        if not best:\n")],
    "stamps: a leading zero accepted": [(BRIDGE, ' or first.startswith("0"):', ":")],
    "read: at the moving ref, not the pinned sha": [(BRIDGE, '"%s:%s" % (sha, path)', '"%s:%s" % (al.OWNER_REF, path)')],
    "read: a non-40-hex sha accepted": [(BRIDGE, '    if not re.fullmatch(r"[0-9a-f]{40}", sha or ""):\n', "    if False:\n")],
    "bridge: the reads not given the pin": [(BRIDGE, "read_mirror_file(path, pin_sha))", "read_mirror_file(path, al.OWNER_REF))")],
    "git env: GIT_* inherited": [(BRIDGE, 'if not k.startswith("GIT_")}', "if True}")],
}


def main():
    files = sorted({f for muts in MUTATIONS.values() for f, _a, _b in muts})
    orig = {f: open(os.path.join(HERE, f), encoding="utf-8", newline="").read() for f in files}
    survived = []
    try:
        base = subprocess.run([sys.executable, SUITE], capture_output=True, text=True, timeout=300)
        if base.returncode != 0:
            print("BASELINE FAILS - the unmutated suite must pass first:\n" + base.stdout[-2000:] + base.stderr[-2000:])
            sys.exit(2)
        for name, muts in MUTATIONS.items():
            texts = dict(orig)
            if any(texts[f].count(a) != 1 for f, a, _b in muts):
                print("NOT APPLIED (an anchor is not unique or missing): " + name)
                survived.append(name)
                continue
            for f, a, b in muts:
                texts[f] = texts[f].replace(a, b)
            for f in {m[0] for m in muts}:
                open(os.path.join(HERE, f), "w", encoding="utf-8", newline="").write(texts[f])
            r = subprocess.run([sys.executable, SUITE], capture_output=True, text=True, timeout=300)
            for f in {m[0] for m in muts}:
                open(os.path.join(HERE, f), "w", encoding="utf-8", newline="").write(orig[f])
            print(("CAUGHT   " if r.returncode != 0 else "SURVIVED ") + name)
            if r.returncode == 0:
                survived.append(name)
    finally:
        for f in files:
            open(os.path.join(HERE, f), "w", encoding="utf-8", newline="").write(orig[f])
    print("\n%d/%d caught" % (len(MUTATIONS) - len(survived), len(MUTATIONS)))
    sys.exit(0 if not survived else 1)


if __name__ == "__main__":
    main()
