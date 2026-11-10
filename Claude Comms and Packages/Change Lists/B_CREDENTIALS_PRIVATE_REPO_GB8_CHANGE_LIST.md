# B-CREDENTIALS-PRIVATE-REPO — GB-8 BRIDGES INCREMENT

**READY-AT:** pending correction commit · **Owner:** INFRA Codex (`codex-infra`) · **Parent:** `B-CREDENTIALS-PRIVATE-REPO` / `#1023`

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

**Step-3 evidence:** implementation ref `2b1c83999837c787b7fce277fa5f3663053dc449` was pushed before the fresh-reader correction. Both edited shell files passed `bash -n`. The root-isolated installer suite ran on Helsinki from that exact implementation and passed 66/66 assertions, including `GB8-D1`, `GB8-D2`, and the pre-change `GB8-D2 CONTROL`. It ran under a private `/tmp/dtr-gb8.*` directory and deleted that directory in the same command; the post-run search found 0 such directories, while the same instrument found the known `/tmp/dtr-test` directory as its positive control. The correction changes only the refusal label and its matching test expectation; the exact replacement ref and repeated evidence will be recorded before dispatch.

**REVIEWER:** claim-only · name the objects that settle “the bridge installer pins discord.py to 2.7.1 and refuses any mismatched imported version before its explicit bridge-file installation loop,” then name other states consistent with them · **HIT** — the mechanism checks imported `discord.__version__`, not installed-distribution metadata or package bytes; its error text overstated that as “installed version,” and the evidence lived only as prose · **re-derived yes** at `d1a36f1beaff6cedba646218fc728f109e63af8a`, with the exact old message as the positive control; corrected to “imported version,” narrowed the claim, and scheduled exact-ref rerun evidence before Coltrane dispatch.

## JUDGEMENT CALLS FOR COLTRANE TO ATTACK

1. Does the exact release-label request and imported-version refusal satisfy the GB-8 rider, given that package bytes and transitive dependencies are explicitly not pinned?
2. Is refusing before the installer's explicit bridge-file loop the correct boundary, or must Step 3 also prove distribution metadata, target hashes/mtimes, or state left by pip/import failure?
3. Do the mismatch test, exact pip-argument test, and pre-change positive control discriminate the intended regression without overstating live deployment?

**STEP: 3 of 11 COMPLETE · NEXT STEP: 4 of 11.** Dispatch the exact correction ref and repeated suite evidence to Coltrane. Langston and both Langston workers remain off.
