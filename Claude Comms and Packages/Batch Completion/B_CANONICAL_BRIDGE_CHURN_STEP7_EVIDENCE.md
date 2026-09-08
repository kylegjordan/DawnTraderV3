# B-CANONICAL-BRIDGE-CHURN — STEP 7 VERIFICATION EVIDENCE

**Deployed sha `977e61d7d7b57c78fc971410604a8160ab765f95`, by `cc-a`, 2026-09-08T19:49:42Z.** Reviewed and APPROVED by Langston at `238c2a321`; both his conditions applied; CI 4/4 at the deployed sha.
**Committed per `workflow-08`: a measurement only the implementer can see is not second-party checkable. Every figure below names the command that re-derives it.**

## 1. IDENTITY — what is actually running
```
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git rev-parse HEAD && cat dist/BUILD_SHA && git status --porcelain'"
```
`HEAD` = `BUILD_SHA` = `977e61d7d7b57c78fc971410604a8160ab765f95`; worktree empty.
⛔ **A 200 from a process running last week's build is not a deploy** — this is the identity assertion, not a health check.

## 2. OBJ-1 — THE SUBJECT, VERIFIED AT THE FILE AND NOT ONLY IN THE REPORTING
The **real daily path in the running process** was invoked (not a test double): `POST /api/system/force-sync-canonical`, 2026-09-08T19:52:09Z.

| field | value |
|---|---|
| `filesUpdated` | `DawnTrader_Regime_Strategy_Mapping.md`, `DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md` |
| `filesUnchanged` | `bridge/canonical/mapping-regime-strategy.json` |
| `errors` | `[]` |

Then, on staging:
```
git status --porcelain -uall          -> EMPTY
ls -l --time-style=+%H:%M:%S bridge/canonical/
   mapping-regime-strategy.json                    19:49:19   (the deploy's own checkout — NOT touched by the sync)
   DawnTrader_Regime_Strategy_Mapping.md           19:52:09   (written by the sync)
   DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md 19:52:09
```

★ **THE NON-INERTNESS CONTROL, and it is why this evidence discriminates.** A clean tree alone is consistent with "the task never ran." It did run: **two files were written during that same call, with mtimes to prove it**, while the `.json` mtime stayed at the deploy's checkout. ⇒ the skip is observed **at the file**, not merely asserted in the response body.
★ **THE INSTRUMENT IS PROVEN ABLE TO SPEAK:** `git status` reported this exact file dirty **three minutes earlier** on the same tree (cleared by hand pre-deploy — the last time that clear should ever be needed). A silence from an instrument that has just shown it can speak is evidence; one that has not, is not.
**POPULATION:** the three tracked files `syncCanonicalBridge` writes. Not a sample.

⭐ **AND IT UPGRADES THE `.md` EVIDENCE LANGSTON ASKED FOR.** The snapshot/restore in the test suite means *"tree clean after the suite"* no longer says anything about the `.md` files (`afterAll` restores them unconditionally), so their determinism had to be shown on staging instead. It now is, **post-deploy**: both `.md` are rewritten every run and the tree is still clean ⇒ byte-stable. Stronger than the pre-deploy reading taken at `17a1024776e`.

## 2b. ⭐ BOTH BRANCHES MUTATION-PROVED ON THE LIVE INSTRUMENT (added after a fresh reader named the gap)

⛔ **THE ALTERNATIVE THAT WOULD HAVE CHANGED WHAT SHIPS, and §2 alone did NOT exclude it: a DEGENERATE CONTENT KEY.** A key that hashes the wrong thing — or normalises away too much — **skips FOREVER**, including when the mapping genuinely changes. **The file then silently goes stale while the tree stays clean and every reading in §2 looks exactly the same.** ⇒ *"it did not write"* is over-determined: **skipped-because-unchanged and never-reached-the-branch are indistinguishable from the filesystem.**

**EXPECTATION WRITTEN BEFORE RUNNING** (`#744` rider): a real content change must put the `.json` in `filesUpdated`, NOT `filesUnchanged`.

| step | action | result |
|---|---|---|
| 1 | inject `byAssetClass.__MUTATION_PROBE__` into the file on staging | `git status` → ` M` |
| 2 | invoke the real sync | `filesUpdated` = **[json, both .md]**, `filesUnchanged` = **[]** ⇒ ✅ **WRITE BRANCH FIRED** |
| 3 | `git checkout --` restore | tree clean |
| 4 | invoke the real sync again | `filesUnchanged` = **[json]** ⇒ ✅ **SKIP BRANCH FIRED**, tree clean |

✅ **The key is NOT degenerate: it discriminates a real content change from a stamp-only one, proved by mutation on the deployed code, not by reading it.**

⭐ **AND STEP 2 EXERCISED THE SIGNAL THIS BATCH'S OWN DOCBLOCK TEACHES.** The write left the tree dirty — `git diff` = **exactly 2 insertions / 2 deletions, both stamps** (`generatedAt`/`updatedAt` → `2026-09-08T20:01:40.706Z`). **That is correct and by design:** a genuine content change moves the stamp, and the resulting dirty file IS the intended signal that the committed JSON disagrees with the TypeScript map. **The batch did not remove the dirty-tree signal; it removed the FALSE one.**

⛔ **THE POSITIVE SIGNAL THAT CLOSES "NEVER REACHED THE BRANCH", re-derived at the deployed sha** (`git show 977e61d7d…:server/scripts/sync-canonical-bridge.ts`):
```
:303   if (existingKey !== null && candidateKey !== null && existingKey === candidateKey) {
:304     filesUnchanged.push(jsonPath);          <- ONLY reachable INSIDE the skip branch
:307   } else { atomicWrite(jsonPath, jsonContent);
:308     filesUpdated.push(jsonPath);
:315   filesUpdated.push(regimeMdPath);          <- DOWNSTREAM of the json block
:321   filesUpdated.push(signalMdPath);
```
★ **So the response naming the `.json` under `filesUnchanged` is a POSITIVE EMISSION FROM THE SKIP BRANCH ITSELF — not an inference from an absent write.** ★ **And the two `.md` pushes are DOWNSTREAM at `:315`/`:321`, so reaching them proves the json block completed without throwing** — the control is stronger than the mtime argument I originally made for it.

**AND THE SUPPRESSED-MODIFICATION ALTERNATIVE IS EXCLUDED AT THE OBJECT:** `git ls-files -v bridge/canonical/` returns **`H` for all 14 entries** — no lowercase flag, so no `assume-unchanged` and no `skip-worktree`; `git check-ignore` exits 1 (not ignored). ⇒ **the `.md` files ARE tracked and NOT ignored, so "rewritten every run AND tree clean" genuinely means byte-identical** — the reading §2 rests on.

## 2c. §9.5(a) WRITER CENSUS — RUN BECAUSE A FIX THAT COVERS ONE WRITER OF MANY IS NOT A FIX

⛔ **The drift gate next door turned out to have FOUR sinks where the predicate named one. That is the same directory and the same month, so "only one writer" is a claim that has to be EARNED here, not assumed.**

**`mapping-regime-strategy.json` — WRITERS: exactly ONE.** `server/scripts/sync-canonical-bridge.ts:307`, via `atomicWrite` (`:52`), which is the file's only write path (`:307`, `:314`, `:320` are the only call sites; `writeFileSync` appears only inside `atomicWrite` at `:54`).
**Everything else is a READER, and each is named rather than waved at:** `schema-validator.ts:37` (disk read) · `routes.ts:2083` (disk read) · `strategy-mapper.ts:22` and `validate-canonical.ts:18` (bundled STATIC IMPORTS — they read the build-time copy, not the disk) · `canonical-regime-strategy-map.ts` (comments only) · `dt-deploy-drift.sh:306` (sink classification).
**The two `.md` — WRITERS: exactly ONE**, the same file at `:314`/`:320`. Only other references are the two test files.
✅ **So the fix covers the whole writer population. Stated explicitly because an asserted absence needs presence-evidence (rule 22).**

★ **AND THE ONE STEP OVER, CHECKED RATHER THAN ASSUMED — this is `fix-follows-pointer`, the pattern I have repeated ~7 times: I fix what is pointed at and never ask whether the same hole stands one file across.**
`bridge/canonical/phase9_predictive-learning.json` is a **tracked** file (`git ls-files -v` → `H`) in the **same directory**, written by `recalibrate-predictive-weights.ts:269` on a **weekly** schedule (`autonomy-scheduler.ts:642`, `:1063`), and it stamps `updatedAt: new Date().toISOString()` at `:236`. **Identical churn shape on its face.**
✅ **IT DOES NOT HAVE THE DEFECT. It already carries the guard**, at `:255-258`:
```
if (checksum === previousChecksum) { console.log("[11.7D] No significant change — skip overwrite."); return true; }
```
⚠️ **Its checksum excludes ALL top-level `_`-prefixed keys (`.filter(([k]) => !k.startsWith("_"))`) — the WEAKER exclusion, and precisely the one Langston's BLOCKER-1 stopped me copying** (it would have left `_schema` outside detection). **NOT filed as a new issue:** it errs toward NOT writing (a stale file, not a dirty tree), it is pre-existing, and **it is already on record in this batch's own change list §1** as the contrast that motivated my key set. **§9.5(b-ii): a cross-reference, not a fresh finding.**
**DISPOSITION: none required — no finding survived the check.**

## 3. UI (§9.3) — and it is the half that makes the relabel honest
Claude-in-Chrome, `https://188.245.193.8.sslip.io/analytics` → **Mapping Drift** tab. Rendered DOM:
```
Schema: regime-mapping/v3.0.0    Map Updated: 2026-05-24T00:30:18Z
```
Not `Last Sync:`, and carrying the **derived** value. Source at the deployed sha: `client/src/pages/analytics.tsx:2874`.
⚠️ **The label and the value had to change together.** `Map Updated` would have been a false claim while the field still held a sync timestamp, and the old value (`2026-06-11T01:17:10.255Z`) **overstated the map's freshness by 18 days**.
⚠️ **RECORD POINT (Langston's Condition-C instruction, so nobody hunts for it in the file's history):** `2026-05-24T00:30:18Z` is **`af99bd5dd`'s COMMIT timestamp**, NOT the value the file carried at that commit — which was `2026-05-24T00:00:00Z`. The derived number is the better one (the round value was hand-authored); this line exists so a future reader does not conclude it was invented.

## 4. B-DEPLOY-DRIFT-LINE (#1002) — CRITERION 4, THE ONE THAT REQUIRED A DEPLOY
Criteria 1-3 passed previously. Criterion 4 as pre-registered: *"a deploy clears every rung on the next run, resolved by `deploy-drift-monitor`, with no row left open."*
`/var/log/dt-deploy-drift.log` (Helsinki):
```
2026-09-08T19:52:24Z ZERO deployed=977e61d7d… head=977e61d7d… — clearing open drift rows
2026-09-08T19:52:24Z ZERO resolved=2 failed=0
```
Both rungs → `state=resolved`, `resolved_by_claimed=deploy-drift-monitor`, `resolution_evidence` naming the two matched shas:
- `aaa13da0-19f0-4ab0-a70b-c3b19996cb48` — rung 3
- `81135510-4a92-4b3e-a153-dd049d4b30f5` — rung 2

⛔⛔ **CORRECTION, CAUGHT BY A FRESH READER BEFORE THIS LEFT MY HANDS — I FIRST WROTE *"the resolve was the monitor's own, not mine."* THAT IS FALSE.**
**The hourly cron fired at `19:17:01Z`, BEFORE the deploy. The `19:52:24Z` run was MY OWN MANUAL INVOCATION** (`bash /usr/local/bin/dt-deploy-drift.sh`). Re-derived: `grep -oE '^2026-09-08T[0-9:]+Z' /var/log/dt-deploy-drift.log | sort -u` returns an unbroken `:17` series through `19:17:01Z`, then `19:52:24Z` — which is not on the `:17` schedule.
✅ **WHAT ACTUALLY PASSES, STATED HONESTLY: the SCRIPT'S RESOLVING LOGIC required no manual resolve command** — I ran the script; the script found the rungs, matched the shas and resolved both under its own actor. **The criterion is about the clearing logic, and that is satisfied.**
⚠️ **WHAT IS NOT YET OBSERVED: an UNATTENDED cron run clearing rungs.** It cannot be re-observed now (the rows are already resolved, so the next run has nothing to clear). **Stated as unproven rather than glossed.** The next `:17` run confirms only that nothing RE-MINTS, which is a weaker but real check.
★ **THE SHAPE, RECORDED BECAUSE IT IS THE POINT: "self-resolved" and "I triggered the run" produce the IDENTICAL log line and the IDENTICAL alert row.** `resolved_by=deploy-drift-monitor` is a string the script passes; **it does not encode who invoked it.** An over-determined observation, and I read it the flattering way. ★ Langston's read that rung 3 was the instrument's **first genuine true positive** stands: the undeployed runtime file was CC-C's `market-scanner.ts` plus this batch in flight, and it cleared the moment the batch shipped.

## 5. INSTALLED-VS-REVIEWED — because a script does not install itself (`#1004`)
| surface | sha256 | bytes |
|---|---|---|
| installed file `/usr/local/bin/dt-deploy-drift.sh` (filesystem) | `ad45948a847f112a658944d9abc449659f3a7e160e3149ea756919117d6aa7d2` | 41535 |
| blob `git show origin/migration/aws-supabase:comms-infra/discord/dt-deploy-drift.sh` (object store) | `ad45948a847f112a658944d9abc449659f3a7e160e3149ea756919117d6aa7d2` | 41535 |
**Both sides name their surface** — the standing rule after `#751`, where a ref-side and a worktree-side reading were compared and the CRLF delta read as content drift.
Scheduling: `crontab -u langston -l` → `17 * * * * /usr/local/bin/dt-deploy-drift.sh`. **90 distinct run stamps**, `2026-09-05T14:04:57Z` → `2026-09-08T19:52:24Z` (`grep -oE '^20[0-9-]+T[0-9:]+Z' … | sort -u | wc -l`).
⚠️ **A CORRECTION MADE BEFORE DISPATCH, RECORDED BECAUSE IT IS THE PATTERN NOT THE SLIP:** I first reported **16** runs from a `grep -c` that counted only the `ZERO`/`rung` LINES. **A line count is not a run count** — same family as every other `grep -c` miscount in this project's history. Re-derived above.

## 6. ONE LINE CHECKED AND DELIBERATELY **NOT** FILED AS A DEFECT
`2026-09-06T08:23:40Z ZERO deployed=0000000000000000000000000000000000000000` — an all-zero base reported as zero drift, which is exactly the shape `B-DRIFT-RUNTIME-PREDICATE` closed (a broken read FILLING the field rather than emptying it).
**It is not live.** `DEPLOYED` is read from `dist/BUILD_SHA` with an empty-guard (`:174`) and a record-agreement guard (`:197`, `:203`); the all-zero value can only arrive via the `--base` test-mode override (`:176-179`), whose `TEST MODE` notice goes to **stdout, not the log** — hence a dry-run leaves a ZERO line with no visible marker. Dated **two days before** the installed copy. **Recorded here so the next reader does not re-find it and re-open it.**


## 7. FRESH-READER ROUNDS (the record is mandatory — without a denominator the bar never rises above "one run")
`REVIEWER r1: claim-only (mode B, mandatory — mechanism + absence claims) · "name the settling objects, then what other states of the world are consistent with them?" · HITS on all five claims · re-derived y`
**What r1 actually moved, and it earned its keep twice:**
1. ⛔ **It caught a FALSE published claim** — "self-resolved, not mine" (§4). Corrected above.
2. ⛔ **It named the degenerate-key alternative** that §2 could not exclude ⇒ §2b's mutation test exists because of it. **That is the one that would have shipped a fix that never fires.**
3. It forced A(1) and A(5) to be closed at the object rather than argued.
⚠️ **NOT cited as support for anything.** A reviewer HIT is a lead that was then re-derived here; a reviewer CLEAN would have been no evidence at all (`#453`).
