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

⛔⛔ **THAT FIRST MUTATION WAS TOO WEAK, AND A SECOND FRESH READER CAUGHT IT AT THE CODE. RECORDED IN FULL BECAUSE THE FAILURE IS THE INTERESTING PART.**
**I injected a key INTO `byAssetClass` — so ANY key that hashes `byAssetClass` at all passes it, INCLUDING THE EXACT DEGENERACY LANGSTON BLOCKED ON.** A `!k.startsWith("_")` filter — the sibling's approach, which BLOCKER-1 exists to prevent — **would have produced identical output at all four steps above.** So would a key hashing only key-NAMES, or only `Object.keys(byAssetClass)`.
⇒ ★ **My mutation excluded a TOTALLY degenerate key and nothing narrower. The claim "the key is not degenerate" was not what the test supported** — and the drift shape this batch's sibling assertion exists to catch (`RISK-017`) is a **VALUE** change, which a structure-only probe does not touch either.

**TWO DISCRIMINATING MUTATIONS RE-RUN ON THE DEPLOYED CODE, each with its expectation written first:**

| # | mutation | what a degenerate key would do | RESULT |
|---|---|---|---|
| **A** | bump **`_schema` ONLY** (`regime-mapping/v3.0.0` → `v9.9.9-PROBE`) — nothing else touched | a `!k.startsWith("_")` key **SKIPS** ⇒ BLOCKER-1 live | ✅ **`filesUpdated=[json,.md,.md]` — WRITE FIRED. `_schema` IS inside the key.** |
| **B** | change a **VALUE, no new key**: `crypto_spot / HIGH_VOLATILITY_UNSTABLE / favoredSignalTypes[0]` `QUANT` → `QUANT_PROBEVAL` | a key over names/structure only **SKIPS** | ✅ **`filesUpdated=[json,.md,.md]` — WRITE FIRED. The key is VALUE-SENSITIVE.** |
| — | restore, re-run | — | ✅ **`filesUnchanged=[json]`, tree `[]` — SKIP FIRED.** |

✅ **NOW the claim is earned: the key covers `_schema` (the blocked class) AND is value-sensitive (the real drift shape) — established by mutation on the deployed code, not by reading it.**
★ **AND THE SHAPE IS THE LESSON, not the fix: a mutation that changes the thing you already believe is covered proves nothing. The probe has to be aimed at the SPECIFIC degeneracy that was feared** — here, the one named in the code's own docblock at `:66-76`, which I had read and still did not aim at.

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
⛔ **THIS IS NOT INDEPENDENT EVIDENCE OF OBJ-1, AND THE WORDING BELOW INVITED THAT READ — corrected after a fresh reader checked the source.** `analytics.tsx:2848` is `const lastUpdated = canonicalData?._metadata?.updatedAt || 'Unknown'` — **the UI reads the same machine stamp it always read; the only code change is the LABEL at `:2874`.** ⇒ **the observed DOM is fully explained by "label renamed + committed JSON hand-edited" and would look IDENTICAL if the skip logic did nothing.** It corroborates the batch's UI objective and **carries no weight for OBJ-1**, which stands on §2/§2b alone.
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
⭐ **RE-DERIVED PINNED TO A SHA after a fresh reader noted the blob side named a MOVING REF (`origin/migration/aws-supabase`) while §1 pins identity at a sha — with three sessions pushing, "installed == branch head" is not "installed == reviewed":** the same `ad45948a…` is the blob at **`977e61d7d`** (the deployed sha) AND at **`ecd42d9a0`** — the sha Langston actually CONFIRMED `B-DRIFT-RUNTIME-PREDICATE` at. ⇒ **installed == REVIEWED, established rather than assumed.**
**Both sides name their surface** — the standing rule after `#751`, where a ref-side and a worktree-side reading were compared and the CRLF delta read as content drift.
Scheduling: `crontab -u langston -l` → `17 * * * * /usr/local/bin/dt-deploy-drift.sh`. **90 distinct run stamps**, `2026-09-05T14:04:57Z` → `2026-09-08T19:52:24Z` (`grep -oE '^20[0-9-]+T[0-9:]+Z' … | sort -u | wc -l`).
⚠️ **A CORRECTION MADE BEFORE DISPATCH, RECORDED BECAUSE IT IS THE PATTERN NOT THE SLIP:** I first reported **16** runs from a `grep -c` that counted only the `ZERO`/`rung` LINES. **A line count is not a run count** — same family as every other `grep -c` miscount in this project's history. Re-derived above.

## 6. ONE LINE CHECKED AND DELIBERATELY **NOT** FILED AS A DEFECT
`2026-09-06T08:23:40Z ZERO deployed=0000000000000000000000000000000000000000` — an all-zero base reported as zero drift, which is exactly the shape `B-DRIFT-RUNTIME-PREDICATE` closed (a broken read FILLING the field rather than emptying it).
**It is not live.** `DEPLOYED` is read from `dist/BUILD_SHA` with an empty-guard (`:174`) and a record-agreement guard (`:197`, `:203`); the all-zero value can only arrive via the `--base` test-mode override (`:176-179`), whose `TEST MODE` notice goes to **stdout, not the log** — hence a dry-run leaves a ZERO line with no visible marker. Dated **two days before** the installed copy. ⛔⛔ **DOWNGRADED FROM "NOT LIVE" TO "UNEXPLAINED" — a fresh reader caught the reasoning gap and it is a good one: I explained a 09-06 log line using the guards in the CURRENT object, while the same paragraph says the installed copy is dated 09-08. ⇒ THE GUARDS I VERIFIED MAY NOT BE THE GUARDS THAT PRODUCED THE LINE.** ★ **The alternative I cannot exclude without reading the THEN-installed script: it lacked the empty-guard and a broken read filled the field — which is precisely the `B-DRIFT-RUNTIME-PREDICATE` shape this paragraph was dismissing.** ⇒ **RECORDED AS UNEXPLAINED, NOT CLOSED.** The current object's guards (`:174`, `:197`, `:203`) are confirmed present and the `--base` path is confirmed to bypass them; that is all this establishes. **Same failure class as citing a stale rule: reasoning about an artifact using a DIFFERENT artifact's contents.**


## 6b. 🟨 A NEW FINDING THE SECOND READER SURFACED — "Map Updated" HAS NO KEEPER

⛔ **THE BATCH DELIBERATELY EXCLUDED THE TWO STAMPS FROM THE NEW `committed JSON matches generator` ASSERTION** — the test file calls them *"the only fields the sync is now allowed to leave stale."* **That exclusion is correct and is the whole point of the fix.**
⚠️ **BUT IT LEAVES THE FIELD THE UI NOW LABELS `Map Updated` WITH NOTHING WATCHING IT.** After a genuine map change: the sync rewrites the JSON with a true stamp, and **the stamp becomes durable ONLY IF A HUMAN COMMITS the regenerated file.** If instead someone runs `git checkout --` on it, or a deploy resets the worktree, **the stamp silently reverts to the older committed value and NOTHING DETECTS IT** — `byAssetClass` and `_schema` equality is enforced by the new test; **freshness of the labelled field is not.**
★ **I DEMONSTRATED THIS MYSELF WITHOUT NOTICING: §2b step 3 and both mutations above ended in exactly that `git checkout --`.**
⇒ ⭐ **IT IS A SMALLER VERSION OF THE PROBLEM §3 SAYS THIS BATCH FIXED — a stamp that overstates freshness — and the relabel to `Map Updated` RAISES the stakes, because the label now makes a stronger promise than the old `Last Sync` did.**

**DISPOSITION (§9.4 #2): ADDED AS AN ITEM TO `P19-B12`**, owner CC-A, alongside the two residuals already homed there. **NOT folded into this batch:** the fix is a monitoring/assertion decision (does the committed stamp get a keeper, or does the label retreat to something it can honour?), it is a design call rather than a defect in the shipped code, and this batch's class was confirmed on the basis that it changes no runtime behaviour.
⚠️ **NOT filed as a fresh issue number: it belongs to `#402`'s residual set** and is recorded on that entry with the other three (§9.5(b-ii) — a finding that duplicates an existing home is a cross-reference).

## 7. FRESH-READER ROUNDS (the record is mandatory — without a denominator the bar never rises above "one run")
`REVIEWER r1: claim-only (mode B, mandatory — mechanism + absence claims) · "name the settling objects, then what other states of the world are consistent with them?" · HITS on all five claims · re-derived y`
`REVIEWER r2: OBJECT round (the evidence doc + sync-canonical-bridge.ts + the test file at 977e61d7d) · same question, asked against the artifacts · 5 CONFIRMED hits + 3 flagged speculative · re-derived y`
⛔ **THE LOOP TERMINATED ON AN OBJECT ROUND, as required — a `claim-only` clean may never close it (a reader that never reached the artifact is silent with zero opportunity).**
**What r2 moved, and it is the round that mattered most:**
1. ⛔⛔ **It showed my mutation test did not test what I said it tested** — the probe passed every degeneracy except a totally-constant key, INCLUDING the exact BLOCKER-1 class. ⇒ two discriminating mutations re-run (§2b). **This is the one that would have shipped a ✅ the evidence did not support.**
2. It caught §3 being read as independent evidence for OBJ-1 when `analytics.tsx:2848` shows it cannot be.
3. It caught §5 comparing against a MOVING REF rather than a sha ⇒ re-pinned, and now stronger (matches at `ecd42d9a0`, the reviewed sha).
4. It caught §6 explaining a log line with a different artifact's code ⇒ downgraded to UNEXPLAINED.
5. It surfaced §6b, a genuine new residual, now homed.
⭐ **AND IT CLOSED THINGS TOO, at the code:** `contentKey` strips exactly two keys at exactly the level the generator stamps them (`:80-82` vs `:174-175`); null-handling falls through to the write on either side (`:303`) so *broken never reads as agreement* holds; `sortObjectKeys` plus string-only arrays plus parse-before-hash means **no ordering, locale, float or CRLF instability**; and a repo-wide search found no other production writer.
⚠️ **THREE SPECULATIVE POINTS IT FLAGGED AND DID NOT ESTABLISH, carried rather than actioned:** a possible CI false-green if vitest's cwd ever diverges from the repo root (the script resolves `BRIDGE_DIR` from `process.cwd()` at `:32` while the test resolves from `__dirname`); no lock between the scheduled task and a Force Sync click; and the unconditional `.md` rewrites could dirty a Windows clone under `core.autocrlf`. **Flagged as SPECULATIVE by the reader and not re-derived by me — they are leads, not findings, and are recorded as such.**

**What r1 actually moved, and it earned its keep twice:**
1. ⛔ **It caught a FALSE published claim** — "self-resolved, not mine" (§4). Corrected above.
2. ⛔ **It named the degenerate-key alternative** that §2 could not exclude ⇒ §2b's mutation test exists because of it. **That is the one that would have shipped a fix that never fires.**
3. It forced A(1) and A(5) to be closed at the object rather than argued.
⚠️ **NOT cited as support for anything.** A reviewer HIT is a lead that was then re-derived here; a reviewer CLEAN would have been no evidence at all (`#453`).

## 8. ⛔ PRE-REGISTERED CLOSE CRITERION — WRITTEN BEFORE THE DATA, WHICH IS THE ONLY THING THAT MAKES IT WORTH ANYTHING

★ **A criterion chosen AFTER seeing the window can always be made to pass.** Registered here at Step 7, `2026-09-08T20:1x Z`, with both remaining gaps stated as gaps.

**WHAT IS ALREADY PROVEN AND IS NOT WAITING ON ANYTHING:** the content key covers `_schema` and is value-sensitive (§2b, mutation A + B); the skip fires and leaves the tree clean; the write fires on real change; there is exactly one writer; both Langston conditions are in the running build.

⛔ **WHAT IS NOT PROVEN, AND BOTH ARE THE SAME SHAPE — *the UNATTENDED path doing what the MANUAL path did*:**

| # | gap | why the manual run does not settle it |
|---|---|---|
| **U-1** | **The DAILY SCHEDULED `canonical_bridge_sync` has not yet run post-fix.** | I invoked `POST /api/system/force-sync-canonical`. A fresh reader confirmed at the code that `autonomy-scheduler.ts:619-620` and `routes.ts:2102-2103` `await import` the **same module** and call the **same function in the same process**, so it is a genuine proxy for the **code path** — ⚠️ **but NOT for the SCHEDULING.** The daily fire is the thing that dirtied the tree for months. |
| **U-2** | **No UNATTENDED cron run of the drift monitor has been observed CLEARING rungs** (§4). | `resolved_by` does not encode who invoked. Cannot be re-observed on these rows — they are already resolved. |

**PASS — BOTH must hold, on a run NOBODY TRIGGERED:**
1. **U-1:** after the next daily `canonical_bridge_sync`, `git status --porcelain -uall` on staging is **EMPTY**, and the scheduler log line reads **`0 updated, 1 unchanged`** for the `.json` (`autonomy-scheduler.ts:629`). ⇒ **the log line IS the positive emission** — a clean tree alone would not distinguish "skipped correctly" from "never ran."
2. **U-2:** the next `:17` cron run logs a `ZERO` line and **NOTHING RE-MINTS** a `deploy-drift-rung-*` row while staging and the branch head agree.

**FAIL — any of:**
- the tree is dirty after the daily run with the `.json` modified and **only the two stamps changed** ⇒ **the fix did not take on the scheduled path**, and the batch reopens at Step 3;
- the scheduler logs `1 updated` for the `.json` on a day with no real map change ⇒ same;
- a `deploy-drift-rung-*` row re-mints while the shas agree ⇒ that is `B-DEPLOY-DRIFT-LINE`'s problem, not this batch's, and is homed there.

⚠️ **NEITHER GAP IS A DEFECT AND NEITHER BLOCKS THE FIX — they are the difference between *proved on the code path* and *proved on the schedule*.** ★ **Stated as a window rather than glossed, because "it works when I run it" is exactly the claim that hid the drift-monitor error in §4.**
**WINDOW SHAPE: a set QUANTITY, not a period — ONE unattended run of each. Expected within 24h; no due date on the batch (§9.4 — a date is only legitimate when the LENGTH is the content, and here the COUNT is).**


## 9. THE FIRST UNATTENDED CRON RUN AFTER THE DEPLOY — AND MY PREDICTION WAS WRONG WHILE THE SYSTEM WAS RIGHT

**Armed BEFORE the run, expectation written first:** *"a `:17` run stamp should exist, reporting ZERO, and NOTHING should re-mint."*

| run | what it logged |
|---|---|
| `19:17:01Z` (pre-deploy) | `RUNG=3 age=35h total=88 runtime=6 capped=0 deployed=17a1024776e… head=cb1be3a79…` |
| **`20:17:01Z` (post-deploy, UNATTENDED)** | **`NO_RUNTIME_PATHS age=0h total=5 — the range touches no runtime file, so there is nothing to be behind ON. Not reported.`** |

⚠️ **MY EXPECTATION WAS MIS-SPECIFIED AND I AM RECORDING THAT RATHER THAN THE FLATTERING READ.** I predicted `ZERO`. It logged `NO_RUNTIME_PATHS` — **because I had pushed five governance commits since the deploy, so `deployed == head` was no longer true and the run never reached the `ZERO` branch.** ⇒ **I wrote a prediction that did not account for my own actions during the window.**
✅ **THE SYSTEM WAS CORRECT, AND BETTER THAN THE PREDICTION:** those five commits are markdown only, `B-DRIFT-RUNTIME-PREDICATE`'s four-sink predicate classified them as touching **no runtime path**, and the job **stayed silent instead of raising a rung on a documentation-only gap.** ★ **That is the over-reporting half of `#1016` working in production, unprompted** — the half the plan row notes was widened by the comment-only episode.
⛔ **AND NOTHING RE-MINTED**, which was the other half of the expectation and did hold.

⛔ **U-2 (§8) REMAINS UNOBSERVED, AND THIS RUN COULD NOT HAVE SETTLED IT.** An unattended run CLEARING rungs needs open rungs to clear; my manual run had already cleared them. **Stated as still open rather than counted as satisfied by a run that had nothing to do.**
★ **This is the same discipline as §4: a run that had zero opportunity is not evidence, however good its output looks.**
