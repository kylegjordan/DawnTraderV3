# B-LANGSTON-CONTEXT — increment 2, chunk 2 part 1 — CHANGE LIST (Step 4)

**READY AT:** `ca67fb19a9993c040b3c215eca55cf21dbd37726` — two commits: `624cd1733` (the change; CI run `34625894318`, 4/4 per job on that exact commit) plus a follow-up widening `group_members` after a second reader's leads (below). CI for the follow-up is watched after the push.

## HEADER — the three fields

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (`B_LANGSTON_CONTEXT_SCOPE.md:3`) |
| **(ii) THAT CLASS'S DOC SET** | see the table below |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_LANGSTON_CONTEXT_PRE_AUDIT.md` §21.11. Your Step-6 FINDING-9 and FINDING-10 were dispositioned there as plan items **P-6a.1** and **P-6a.2** — the plan revision these two implement. |

| document (non_architecture) | required? | state |
|---|---|---|
| batch `SCOPE` | REQUIRED | **present** — `Scope Files/B_LANGSTON_CONTEXT_SCOPE.md` |
| batch `PRE_AUDIT` | REQUIRED | **present** — `Scope Files/B_LANGSTON_CONTEXT_PRE_AUDIT.md` (§1-§21.11) |
| `COMPLETION_REPORT` | REQUIRED at close | **absent — the batch is in flight.** ⚠️ **AND THERE IS NO PROGRESS REPORT EITHER, which is a gap:** increment 1 was verified at Step 7 on 2026-09-09 and reported as "a progress report, not a completion", but that was never a file. Measured: no file in `Batch Completion/` names the batch, while the same search finds `B-WAKE-LEAD-NAME`'s report. **§9.4 disposition 1 — folded into this chunk:** `B_LANGSTON_CONTEXT_PROGRESS_REPORT.md` is in this push, with pre-registered close criteria. |
| `BATCH_CATALOG.md` | REQUIRED at close | **absent** — 0 lines name the batch (control: `B-WAKE-LEAD-NAME` returns 1). Lands at close. |
| `PHASE_HISTORY.md` | REQUIRED at close | **absent** — 0 lines (control: 1). Lands at close. |
| `SYSTEM_MANUAL.md` | judged | **N/A** — nothing under `server/`, `client/` or `shared/`; a Helsinki root tool is outside the manual's scope |
| `SYSTEM_IMPACT_MAP.md` | judged | **✅ in this commit** — the `langston-privacy-check` CONTROLS cell no longer fixes the case count at 30; it points at the tool's own output and names the P-6a.1 assertion |
| `CHANGES_AND_FIXES.md` | judged | **N/A for this part** — two reach limits closed, no defect fixed (you ruled FINDING-9 "a reach limit, not an exposure") |
| `PHASE_19_PLAN.md` · both MEMORY files · your `MEMORY.md` | REQUIRED at close | in flight; my memory is updated at each step boundary |

## THE CHANGE — `comms-infra/langston-memory/bin/langston-privacy-check` (+67 / −5)

### P-6a.1 (your FINDING-9) — the fence itself is asserted, not only sampled through one account
**NEW (`group_members`, as of the follow-up commit):**
```python
def group_members(gid):
    """Every ENUMERABLE account that holds this group: the listed secondary members of EVERY group entry
    carrying this gid, AND every account whose PRIMARY group it is. ... REACH, stated: this sees what
    pwd/grp ENUMERATE ..."""
    members = set()
    for g in grp.getgrall():
        if g.gr_gid == gid:
            members |= set(g.gr_mem)
    members |= {pw.pw_name for pw in pwd.getpwall() if pw.pw_gid == gid}
    return members
```
The `624cd1733` version read `getgrgid(gid).gr_mem`, which returns ONE entry, so two group names sharing a gid would have hidden the second entry's members. That was the second reader's lead 5.
**MODIFIED, `evaluate()` `:231-251`**, per fenced directory, right after the other-bits check:
```python
        owner_uid = pwd.getpwnam(cfg["owner"]).pw_uid
        if dst.st_uid != owner_uid:
            findings.append({"kind": "directory-not-owned-by-" + cfg["owner"], "path": d,
                             "owner": pwd.getpwuid(dst.st_uid).pw_name})
        holders = group_members(dst.st_gid)
        if holders != {cfg["owner"]}:
            findings.append({"kind": "directory-group-not-" + cfg["owner"] + "-only", "path": d,
                             "group_holders": sorted(holders)})
```

### P-6a.2 (your FINDING-10) — the alert says how many, and where the rest are
**MODIFIED, `reconcile_alerts()` `:364-372`:** both bodies now start with
```python
        head = "%d finding(s); %d shown; full set at %s. " % (len(result["findings"]), len(lines), evidence)
```
`evidence` is `RUNLOG:<next line>` — the run-log row this run is about to write. It was already computed for the resolve path, so the arm now carries the same pointer.

### Self-test — 30 → 35 cases
- **The CLOSED fixture's fence is now owned by the owner** (`owned()`, `:485`), as the real ones are, and still PASSes with 0 findings.
- **P-6a.1:** a 750 owner-owned fence whose group coltrane holds → `directory-group-not-langston-only`, and other-bits alone would have passed it · a root-owned fence → `directory-not-owned-by-langston` · control: the owner-only fence raises neither.
- **P-6a.2:** a captured `add` call's `--body` starts with exactly `"<n> finding(s); <min(n,12)> shown; full set at <RUNLOG>:"`.

## EVIDENCE
- **Self-test, as root on Helsinki, on this file** (`/root/lc3-test/`): **35 PASS lines, 0 FAIL, exit 0.** ⚠️ **RULED ON REPORTED FACT for you, permanently** — the tool is root-only, as you noted at Step 6.
- **Live `--dry-run` against the real box** (`run_once(dry=True)` returns before `reconcile_alerts` and `log_row`, so no alert and no run-log row): **PASS, 0 findings, both controls held.** Measured directly beside it — each of the four fences is `langston:langston`, `gr_mem` empty, primary holders `[langston]`. ⇒ **the new assertion does not false-alarm on the live fences.** The case above shows it does flag a shared group.
- **Not installed:** the live check stays at `a3eac7b81` until this is approved; its first scheduled run is 06:00Z on the old code.
- `REVIEWER: claim-only · "a group's gr_mem omits accounts whose PRIMARY group it is; union with pwd primaries is complete" · core claim HOLDS; the union is complete only for enumerable local accounts with one group line per gid · re-derived y`
  - **Re-derived by me on Helsinki, not on report:**
    - `nsswitch` `passwd`/`group` = `files systemd` — no SSSD or LDAP, so the non-enumerating-source gaps do not apply here;
    - `getent group` shows ONE line with gid 987 (`langston:x:987:`), and 0 duplicate gids across 62 groups;
    - no `/run/systemd/dynamic-uid` directory, so no DynamicUser accounts are allocated;
    - of 35 enumerable accounts, 35 are absent from their own primary group's `gr_mem` and 0 are in both — the claim's core, measured.
  - **Folded:** lead 5 (the shared gid) is now closed in code.
  - **Stated, not built:** leads 1-4 (non-enumerating NSS, `ignore_group_members`, dynamic or homed users, `initgroups`-only membership) and 6 (a process keeping a removed group) — none apply on this box today.
  - ACLs, capabilities, sudo and setgid are not group membership at all. **The attempted reads as coltrane stay the check for that account's access, which is why this assertion supplements them rather than replacing them.**
- **Self-test re-run on the follow-up file, as root on Helsinki: 35 PASS, 0 FAIL, exit 0.** The file tested there hashes identical to the committed one (LF sha256 `7c92c9f2b374…`). **Live `--dry-run`: PASS, 0 findings, both controls held.**

## ATTACK THESE
1. **The claim is now narrowed to "every ENUMERABLE account"** (your FINDING-9 wording was "total over accounts"). On this box that is every account that exists (`files systemd`, no dynamic users). Is the narrowing right, or should the check also REFUSE — go INSTRUMENT — when `nsswitch` names a source that does not enumerate, so a future SSSD/LDAP join cannot silently shrink its reach?
2. **`holders != {owner}` is strict:** a fence whose group is `root` would be flagged. Correct for these four (all `langston:langston`), but it bakes the owner's own group into the invariant. Keep it, or accept a root group?
3. **The alert body's `N shown` is `min(N, 12)`** — the 12-line cap is unchanged from r4. Should the cap move, now that the count and the pointer are both in the body?
