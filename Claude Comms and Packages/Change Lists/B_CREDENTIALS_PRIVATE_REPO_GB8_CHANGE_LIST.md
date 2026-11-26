# B-CREDENTIALS-PRIVATE-REPO — GB-8 BRIDGES INCREMENT

**READY-AT:** `0a26a4dc206c82b219016aec411fac5c8ca4cd83` · **Owner:** INFRA Codex (`codex-infra`) · **Parent:** `B-CREDENTIALS-PRIVATE-REPO` / `#1023`

## STEP-4 DISPATCH HEADER

**i. DECLARED CHANGE-CLASS:** `non_architecture`

**ii. NON_ARCHITECTURE DOC SET, ROW BY ROW:**

| document row | Step-4 state |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — the parent batch is still open; its final report is a Step-11 deliverable after GB-8 and the remaining objectives |
| `BATCH_CATALOG.md` | **present** — `1-system-manual/BATCH_CATALOG.md`; final parent-batch status update remains due at Step 10 |
| `PHASE_HISTORY.md` | **present** — `1-system-manual/PHASE_HISTORY.md`; final parent-batch history update remains due at Step 10 |
| `SYSTEM_MANUAL.md` | **judged N/A** — this increment changes crew bridge installation, not trading architecture, strategy, regimes, filters, the signal pipeline or quantitative logic |
| `SYSTEM_IMPACT_MAP.md` | **present and applicable** — `1-system-manual/SYSTEM_IMPACT_MAP.md`; the installed bridge dependency and installer guarantee are due as content at Step 10, after live state exists |
| `CHANGES_AND_FIXES.md` | **judged N/A** — this is a pre-live dependency hardening item, not a trading bug or risk-registry change |
| `RUNNING_ISSUES.md` | **judged N/A** — no issue is opened, closed or annotated by this increment |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — no phase-level roadmap changes |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — no component is removed |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — no governed trading parameter changes |
| `PHASE_19_PLAN.md` | **N/A — no row there**; this is a letter-named batch and has no in-flight Phase-19 row |
| active `SPRINT_TO_LIVE_PLAN.md` row | **present** — `1-system-manual/SPRINT_TO_LIVE_PLAN.md`; parent close remains due at Step 10 |
| shared `MEMORY.md` + own `MEMORY_CC_INFRA.md` + Langston `MEMORY.md` | **present** — repo shared/own files and `/home/langston/MEMORY.md`; own position is current, while the parent-close sync remains due at Step 10 |
| own session task list; other three lists | **present** — `1-system-manual/CC_INFRA_SESSION_TASK_LIST.md` is current; the other three files are present and are `N/A — not mine` for this increment |

**iii. STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md`

## STEP 3 — IMPLEMENTATION

The bridge installer previously requested `discord.py>=2.3`, so running an already-reviewed installer later could silently select a newer release. The Helsinki bridge environment reported `discord.py 2.7.1` before this change. The installer now carries `2.7.1` as an exact reviewed release label, asks pip for `discord.py==2.7.1`, and refuses before its explicit bridge-file installation loop if the bridge environment imports any other reported version.

This is a release-label pin, not a package-byte or transitive-dependency pin. PyPI still supplies the package bytes. The refusal covers the installer's explicit bridge-file loop; it does not claim that pip, Python, import side effects, or a later process cannot modify other state.

`comms-infra/helsinki/tests/deploy_tests.sh` adds two discriminating checks: a simulated imported `2.7.0` value must refuse before the explicit bridge-file installation loop, and the pip stub must receive exactly `install -U discord.py==2.7.1`. Its positive control reads the pre-GB-8 installer and finds the former unbounded `discord.py>=2.3` requirement.

No bridge package was installed and no service was installed, restarted or enabled in Step 3. The later Step-6 bridges install remains gated on review, CI, an empty review queue, and the Codex-shift rule that Langston stays off.

## LOAD-BEARING DIFF

**MODIFIED — `comms-infra/discord/deploy.sh`**

BEFORE:

```bash
[ -d "$VENV" ] || python3 -m venv "$VENV"
# NOT tied to --sha: pip installs what PyPI serves today. Say so when a version changes.
v0=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)' 2>/dev/null || echo none)
"$VENV/bin/pip" install --upgrade pip >/dev/null
"$VENV/bin/pip" install -U "discord.py>=2.3" >/dev/null
v=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')
if [ "$v" = "$v0" ]; then echo "discord.py: $v (unchanged)"
else echo "discord.py CHANGED $v0 -> $v — from PyPI, NOT reviewed at this sha"; fi
```

AFTER:

```bash
# GB-8: the dependency version is reviewed with this installer. PyPI still supplies the
# package bytes; this pin prevents a later release from silently joining a bridges install.
DISCORD_PY_VERSION=2.7.1
v0=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)' 2>/dev/null || echo none)
"$VENV/bin/pip" install --upgrade pip >/dev/null
"$VENV/bin/pip" install -U "discord.py==$DISCORD_PY_VERSION" >/dev/null
v=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')
[ "$v" = "$DISCORD_PY_VERSION" ] || die "discord.py imported version $v, expected reviewed pin $DISCORD_PY_VERSION"
if [ "$v" = "$v0" ]; then echo "discord.py: $v (unchanged)"
else echo "discord.py CHANGED $v0 -> $v — now at reviewed version pin $DISCORD_PY_VERSION"; fi
```

**MODIFIED — `comms-infra/helsinki/tests/deploy_tests.sh`**

BEFORE:

```bash
run "$T/deploy.sh" --sha "$TC" --only bridges
[ $RC -eq 0 ] && grep -q "install-verify: all $N5 installed files equal their verified blobs" "$T/out" \
  && ok "D5 bridges: $N5 files installed + verified" || bad D5 "rc=$RC"
```

AFTER:

```bash
: > "$PIP_LOG"
DISCORD_STUB_VERSION=2.7.0 run "$T/deploy.sh" --sha "$TC" --only bridges
[ $RC -eq 2 ] && grep -q "imported version 2.7.0, expected reviewed pin 2.7.1" "$T/out" \
  && ! grep -q '^   installed ' "$T/out" \
  && ok "GB8-D1: discord.py result outside the reviewed pin is refused before bridge files install"
run "$T/deploy.sh" --sha "$TC" --only bridges
grep -Fxq "install -U discord.py==2.7.1" "$PIP_LOG" \
  && ok "GB8-D2: bridges request only the exact reviewed discord.py 2.7.1 pin"
grep -Fq 'discord.py>=2.3' "$T/deploy.r4" \
  && ok "GB8-D2 CONTROL: the pre-GB-8 installer accepted an unbounded newer discord.py"
```

## EVIDENCE AND REVIEWER RECORD

**Step-3 evidence:** corrected implementation ref `0a26a4dc206c82b219016aec411fac5c8ca4cd83` is pushed. Both edited shell files pass `bash -n`. GitHub Actions run `42827706732` passed all four jobs: TypeScript Check, Test Suite, Build, and Docker Build. The root-isolated installer suite ran twice on Helsinki from that exact ref and passed 66/66 assertions on each run, including `GB8-D1`, `GB8-D2`, and the pre-change `GB8-D2 CONTROL`. Each run used a private `/tmp/dtr-gb8.*` directory and deleted its exact directory in the same command; the final post-run search found 0 such directories, while the same instrument found the known `/tmp/dtr-test` directory as its positive control. No live install, restart or enable occurred.

**REVIEWER:** claim-only · name the objects that settle “the bridge installer pins discord.py to 2.7.1 and refuses any mismatched imported version before its explicit bridge-file installation loop,” then name other states consistent with them · **HIT** — the mechanism checks imported `discord.__version__`, not installed-distribution metadata or package bytes; its error text overstated that as “installed version,” and the evidence lived only as prose · **re-derived yes** at `d1a36f1beaff6cedba646218fc728f109e63af8a`, with the exact old message as the positive control; corrected to “imported version,” narrowed the claim, and scheduled exact-ref rerun evidence before Coltrane dispatch.

## JUDGEMENT CALLS FOR COLTRANE TO ATTACK

1. Does the exact release-label request and imported-version refusal satisfy the GB-8 rider, given that package bytes and transitive dependencies are explicitly not pinned?
2. Is refusing before the installer's explicit bridge-file loop the correct boundary, or must Step 3 also prove distribution metadata, target hashes/mtimes, or state left by pip/import failure?
3. Do the mismatch test, exact pip-argument test, and pre-change positive control discriminate the intended regression without overstating live deployment?

## STEP 4 — CODE REVIEW

Coltrane returned **PROCEED with no correction required** at exact graded ref `5215c529d77f8f48063fdfa38c0d128a752a851b` on 2026-11-10T13:57:43Z. He confirmed that the exact request plus imported-version refusal form a coherent release-label pin, that the refusal boundary is stated honestly before the explicit bridge-file loop, and that the mismatch, exact-argument and pre-change control checks discriminate the regression. Discord message timestamp is the durable verdict record; the review cites the exact installer and test lines at the graded ref.

**STEP: 4 of 11 COMPLETE · NEXT STEP: 5 of 11.** Confirm the four GitHub jobs per job at the newest code-touching commit in the graded range. Langston and both Langston workers remain off.

## STEP 5 — GITHUB PUSH + CI

GitHub Actions run `42829558680` at pushed Step-4 record ref `49a0dc531db5606b4c3fcd9dea6395eea927227a` completed successfully. Per-job readback: TypeScript Check (baseline gate) `success`; Test Suite `success`; Build `success`; Docker Build `success`.

**STEP: 5 of 11 COMPLETE · NEXT STEP: 6 of 11.** Step 6 is parked because the reviewed bridges install enables the Langston bridge while crew mode says Langston is off. No install, restart or enable has occurred; Langston and both workers remain off.

## Step 6 completed — bridges group installed at the reviewed ref (Infra Claude, 2026-11-13, crew mode CLAUDE)

Installed together with `B-AGENT-INVOKE-FAILURE-NOTICE`'s bridge files: `deploy.sh --sha 5215c529d77f8f48063fdfa38c0d128a752a851b --only bridges` (installer blob `d4787047023931baa58b9a1c0366721ea4c2f86a`, matched on the box). Result: `discord.py: 2.7.1 (unchanged)` — the pin matched the already-installed release, so pip changed nothing — and `install-verify: all 17 installed files equal their verified blobs`. Both bridges restarted by their safe paths (Langston's through `langston-bridge-restart --now`, recovery exit-0 summary; the CC bridge by `systemctl restart` with nothing queued). Full record: `B_AGENT_INVOKE_FAILURE_NOTICE_CHANGE_LIST.md`, Step 6.

**STEP: 6 of 11 COMPLETE · NEXT STEP: 7 of 11** — confirm the running bridge imports discord.py 2.7.1 and the installer pin refuses a mismatch only in its test, not live.

## Step 7 — historical first invocation and review-source verification (2026-11-26)

- The Step 6 receipt verified 17/17 installed bridge-group paths at `5215c529d77f8f48063fdfa38c0d128a752a851b`. The Langston bridge blob was `faa03f4195ca38eb6c6b590a56b7416090757802`. The installer reported the same imported `discord.py` 2.7.1 before and after that install. Step 3 exercised the mismatched-version refusal in the isolated 66-assertion suite, before any bridge file replacement.
- The historical journal for `discord-langston-bridge.service`, invocation `344aeeda54324f9bab5a35c3a087bd54`, recorded start at 13:19:47.223923 UTC on November 13. The first call on that process (PID 2462976) resolved ref `fd3d9c9fc595300bfa2ef89999926c540e0e1894` and entered the Claude child path at 13:19:49.285421 UTC. It returned at 13:26:03.527806 UTC and delivered the reply at 13:26:06.799338 UTC. The resolved ref descends from the install ref and contains the same bridge blob. This journal records the ref and invocation metadata. The exact historical prompt text and the recipient's subsequent tool choices remain unverified.
- The invocation replay below runs the entire exact reviewed `invoke_claude` against a synthetic request and captures the prompt at its stubbed child boundary. The predecessor emits the same journal stamp while requesting a raw-GitHub single-file read. The reviewed source passes the full resolved ref to `dt-review show`. The pre-audit's literal raw-host check also finds the reviewed note's express prohibition. The replay tests the affirmative read instruction and preserves that prohibition.
- Current readback used the configured service interpreter as the Langston user, with Python bytecode writes disabled. The import and distribution metadata both reported 2.7.1. Langston's service is disabled and inactive on the Codex shift. The currently installed bridge is a later revision, so the historical file claim uses the install receipt, linked process and exact source. The check concerns the bridge and has no staging UI surface.

REVIEWER: claim-only · what evidence distinguishes the installed note from the earlier note on the first historical call? · HIT: both versions emit the same stamp, and the raw host appears in the reviewed prohibition · re-derived yes with the exact-ref replay and the historical installation and journal.

### Reproduction at the child boundary

```python
import ast, subprocess, types
import time

source = "comms-infra/discord/discord-langston-bridge.py"
ref = "fd3d9c9fc595300bfa2ef89999926c540e0e1894"
payload = "GB-8 synthetic review request"

def captured_prompt(commit):
    raw = subprocess.check_output(["git", "show", f"{commit}:{source}"], text=True, encoding="utf-8")
    tree = ast.parse(raw)
    keep = {"REVIEW_SOURCE_NOTE", "REVIEW_SOURCE_FAIL_NOTE"}
    body = [node for node in tree.body if (
        isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in keep for t in node.targets)
    ) or (isinstance(node, ast.FunctionDef) and node.name == "invoke_claude")]
    prompts, log = [], []
    def child(args, *unused, **kwargs):
        if args[0] == "/usr/bin/claude":
            prompts.append(args[args.index("-p") + 1])
        return types.SimpleNamespace(returncode=0, stdout="fixture result", stderr="")
    env = dict(resolve_review_ref=lambda: ref, log=log.append, run_agent=child,
               subprocess=types.SimpleNamespace(run=child, TimeoutExpired=subprocess.TimeoutExpired),
               os=types.SimpleNamespace(environ={}), time=time, OAUTH_TOKEN="fixture",
               WORK_DIR="/fixture", CLAUDE_MODEL="fixture", CLAUDE_TIMEOUT=1)
    exec(compile(ast.Module(body=body, type_ignores=[]), commit, "exec"), env)
    assert env["invoke_claude"](payload, "synthetic") == "fixture result"
    assert len(prompts) == 1 and prompts[0].endswith(payload)
    return prompts[0], log[0]

old, old_stamp = captured_prompt("5ec1a8227")
new, new_stamp = captured_prompt("5215c529d77f8f48063fdfa38c0d128a752a851b")
assert old_stamp == new_stamp == "review ref resolved to fd3d9c9fc"
assert f"dt-review show {ref} <path>" in new and f"dt-review show {ref} <path>" not in old
assert "read  https://raw.githubusercontent.com/" in old and "read  https://raw.githubusercontent.com/" not in new
print("PASS: exact old and reviewed invoke reach the stub child. Shared journal stamp; old raw read versus new pinned dt-review.")
```

Step 7 evidence is ready for Coltrane. Step 8 must judge the historical record and the discriminating prompt replay. `#463` remains open pending that ruling.
