# Claude Code Session-Transcript Trim — RUNBOOK

> **Purpose.** Shrink a bloated Claude Code **session transcript** (`~/.claude/projects/<project>/<session-uuid>.jsonl`) to fix the freeze/hang/can't-send/stuck-scroll bugs that hit long-running, screenshot-heavy sessions. Repeatable for any session. First executed 2026-06-18 on **Claude New** (CC-B); written so it can be re-run for Claude New again and for **Claude Old** (CC-A), which is on the same path.
>
> **Tools (live in `~/.claude/projects/<project>/memory/`):**
> - `distill_transcript.py` — **SAFE**, no-deletion: redacts base64 images + trims oversized tool-result blobs. Args: `IN OUT [CUTOFF_ISO]`.
> - `trim_transcript.py` — **AGGRESSIVE**: also deletes old raw entries before a cutoff, keeping every compaction summary + head + recent window, repairs dangling links. Args: `IN OUT CUTOFF_ISO [HEAD_KEEP]`.

---

## 1. Why this happens (root cause)
Each session's full history is stored append-only on disk as one `.jsonl`. It grows forever; compaction trims the *live context*, NOT the on-disk file. Two documented bugs bite once the file is large / image-heavy:
- **Can't send any message (hangs, can't delete the typed text):** accumulated **base64 images** push the resent request past a **20 MB cap** → every send fails, even text-only ([anthropics/claude-code #43056](https://github.com/anthropics/claude-code/issues/43056)).
- **Stuck scroll / window freeze / RAM-OOM:** large transcript chokes the renderer ([#22365](https://github.com/anthropics/claude-code/issues/22365), [#69009](https://github.com/anthropics/claude-code/issues/69009)).

The **1M-context model does NOT fix this** — the bloat is on disk, not in context. Bloat drivers (per a 70 MB autopsy + our own files): JSON envelope per entry (~54%), tool-result payloads embedding whole files (~25%), base64 images (~12%), thinking blocks (~4%), actual conversation text (~3%).

## 2. Diagnose
```bash
DIR="$HOME/.claude/projects/<project-dir>"
ls -laS "$DIR"/*.jsonl | head          # find the big ones (sizes in bytes)
```
Map a desktop session → its transcript file by its **project folder** (the slug of the clone it opened: `C--DawnTraderV3-old|-new|-analyst|-infra|-pm`, the same key `load-own-memory.mjs` uses), then the first user message + last timestamp. ⚠️ **Do NOT key on the roster's `session_id`** (`(repo)/.claude/cc-session-roster.json`): it is the id the name was first bound to, and a later conversation does not update it — measured 2026-11-06: Infra Claude's roster id began `e6446f21` while its live conversation was `644fc5fe` (B-TRANSCRIPT-ARCHIVE pre-audit A5; rebound by hand the same day on Kyle's say-so — a rebind only happens when someone notices). **Confirm the file is the intended session before touching it.**

**Before trimming, the readable archive already holds the conversation:** `~/.claude/transcript-archive/<alias>/` (redacted, appended nightly and before each compaction; index in `DT-SHARED-MEMORY/TRANSCRIPT_INDEX.md`). A trim rewrites the RAW file only; the archive keeps what it already took. The writer notices the rewrite (the file is shorter than where it stopped, or the bytes just before that point changed) and RE-READS that file from the start, skipping every line it already archived, so nothing new is lost and nothing is doubled; the run's result line says `REREAD <file>`. No operator action is needed. Detail: System Impact Map, "Transcript Archive, Restart Handoff and the PreCompact Trigger".
Age / distribution / compaction count (run on a COPY):
```bash
python3 - <<'PY'
import json; from collections import defaultdict
F="...jsonl"; first=last=None; byday=defaultdict(lambda:[0,0]); comp=0
for line in open(F,encoding='utf-8'):
    b=len(line.encode()); 
    try: d=json.loads(line)
    except: continue
    ts=d.get('timestamp')
    if ts: first=min(first or ts,ts); last=max(last or ts,ts); byday[ts[:10]][0]+=1; byday[ts[:10]][1]+=b
    if d.get('isCompactSummary'): comp+=1
print("first",first,"last",last,"compactions",comp)
cum=0;tot=sum(v[1] for v in byday.values())
for day in sorted(byday): cum+=byday[day][1]; print(day, f"{byday[day][1]/1e6:.1f}MB", byday[day][0],"lines", f"cum {100*cum/tot:.0f}%")
PY
```

## 2.5 Duplicate-ID corruption — scroll bounces / sticks on a repeated message (2026-06-19)
**Distinct from size bloat — a SEPARATE defect with its own fix.** Symptom (Kyle, both Claude New shells): the scrollbar starts at the top, scrolls down, then **sticks on one message that appears repeated multiple times**, and scrolling below it **snaps back to the top of those duplicates**. Cause: the on-disk transcript contains **duplicate message IDs (`uuid`)** — the renderer keys each message by its `uuid`, so a repeated id makes it loop. Two flavors: byte-identical copies (whole history blocks re-appended), and worse, the **same id stamped on *different* messages** (one id shared by up to 7 different user messages — that collision is what loops the renderer).

**Origin (autopsy):** the duplicates **cluster in a few large contiguous blocks**, and the biggest block begins **exactly at a `/compact` marker** → the mechanism is **compaction re-appending a block of history** instead of replacing it, accumulated over a very large, repeatedly-compacted session (the original 7f66d970 had ~25,000 duplicate ids; trimming shrank but didn't remove them). NOT introduced by the trim/distill tools — they preserve whatever ids exist; they just don't dedupe.

**Diagnose (on a COPY or read-only):**
```bash
python3 - "$F" <<'PY'
import json,sys; from collections import Counter
seen=Counter()
for line in open(sys.argv[1],encoding='utf-8'):
    s=line.strip()
    if not s: continue
    try: u=json.loads(s).get('uuid')
    except: continue
    if u is not None: seen[u]+=1
dup={u:c for u,c in seen.items() if c>1}
print("duplicate uuids:",len(dup),"  extra occurrences:",sum(c-1 for c in dup.values()))
PY
```
If `duplicate uuids` > 0, repair with `dedup_transcript.py` (lives in `memory/`):
- keeps the FIRST occurrence of each uuid,
- **drops** byte-identical repeats (lossless),
- **re-stamps a fresh uuid** on same-id-different-content collisions (preserves the message, fixes the clash).

**Procedure (session MUST be archived/closed first — never edit a live transcript):**
```bash
cp LIVE.jsonl LIVE.jsonl.BACKUP-<date>-pre-dedup            # 1. backup
python3 memory/dedup_transcript.py LIVE.jsonl OUT.tmp        # 2. dedup (pass paths as ARGS — MSYS path quirk on Windows)
python3 memory/validate.py OUT.tmp                           # 3. expect duplicate_uuids=0, bad_json=0, ONE distinct sessionId (must match the filename)
cp OUT.tmp LIVE.jsonl && rm OUT.tmp                          # 4. replace, keep backup
```
First run 2026-06-19: f9ed24c3 70→52 MB (dropped 1927 + re-stamped 316 → 0 dupes); 7f66d970 311→250 MB (dropped 7052 + re-stamped 1540 → 0 dupes). After reopen, scroll is smooth. **Prevention:** keep sessions lean (small, regularly-trimmed files barely accumulate dupes); run the §2.5 dupe-check as part of every trim; and a dedupe pass should be folded into any future re-home/seed build.

## 3. Method ladder (try least-destructive first)
1. **Distill (SAFE, no deletions)** — `distill_transcript.py`: redact ALL images (fixes the send-hang) + trim oversized tool blobs. Keeps every entry + chain. Typical cut ~20–35%. Use when the main symptom is **can't-send**.
2. **Aggressive distill** — same script, lower `BLOB_MAX`, no date cutoff. Bigger cut, still no deletions.
3. **Trim (AGGRESSIVE, deletes old raw entries)** — `trim_transcript.py`: drop raw messages before a cutoff, KEEP all compaction summaries + head + recent window, repair dangling links. Biggest cut (~60%). Use when the **file is still too large** after distill. Riskier (deletes + re-points chain) — the app rebuilding cleanly is only proven on reopen, so the BACKUP is the safety net.

## 4. The procedure (SAFE sequence)
1. **BACKUP first** (always): `cp LIVE.jsonl LIVE.jsonl.BACKUP-<date>-pre-trim`.
2. **Build + validate the trimmed file FROM THE BACKUP** (static, no lock risk), so the swap is instant later:
   ```bash
   python3 memory/trim_transcript.py LIVE.jsonl.BACKUP-... LIVE.jsonl.TRIMMED 2026-06-04
   ```
   Validate: line-count sane, **0 bad_json**, **0 dangling_parents**:
   ```bash
   python3 - LIVE.jsonl.TRIMMED <<'PY'
   import json,sys; P=sys.argv[1]; n=bad=0; u=set(); par=[]
   for line in open(P,encoding='utf-8'):
       n+=1; s=line.strip()
       if not s: continue
       try: d=json.loads(s); u.add(d.get('uuid')); par.append(d.get('parentUuid'))
       except: bad+=1
   print("lines",n,"bad",bad,"dangling",len([p for p in par if p and p not in u]))
   PY
   ```
3. **★ "Close" the session = ARCHIVE it in the desktop app.** There is **no per-session close/X button**. Right-click the session in Recents → **Archive** (NOT Delete — Archive is reversible). Archiving is REQUIRED, not optional: it drops the app's in-memory copy so that on reopen the app **re-reads the edited file from disk** (otherwise the live window would overwrite your edit). A session you're merely not viewing is idle but may still hold the file in memory.
4. **Swap** (after archive releases the file): `cp -f LIVE.jsonl.TRIMMED LIVE.jsonl`. Confirm new size + validity.
5. **Unarchive / reopen** the session → test: does it **load**, **scroll**, and **send a message**?
6. **Fallback ladder** if it loads wrong: swap in the safer DISTILLED version → if still wrong, **restore the BACKUP** (`cp -f ...BACKUP... LIVE.jsonl`) → back to exactly the pre-trim state, nothing lost. Keep ALL intermediate files until the session is confirmed healthy.

## 5. Trimming the ACTIVE/coordinating session (e.g. Claude Old / CC-A) — the self-trim wrinkle
The session doing the surgery can't archive + swap itself (once archived it's not running to do the swap). Recommended path:
1. While healthy, the session **pre-builds its own** `...TRIMMED` from a fresh backup (steps 1–2 above) and writes a one-line swap command to a `.sh`/`.bat`.
2. Kyle **archives that session**, runs the pre-staged swap (`cp -f ...TRIMMED LIVE.jsonl`) himself in a terminal (or a second healthy CC session runs it), then **reopens** the session.
3. Same fallback ladder. The session re-arms its wake watcher + re-checks alerts on reopen (session-start protocol).

## 6. Prevention
Screenshots + whole-file tool-result blobs are the bloat drivers. Any heavy session will re-bloat over weeks → schedule a periodic distill/trim, or proactively trim when a transcript passes ~300–400 MB. Keep MEMORY.md current as the cross-session lifeline.

## 7. First-run results (2026-06-18, Claude New / CC-B, session `7f66d970…`)
- Age 37 days (started 2026-05-11), 161,332 lines, **116 compaction summaries**, **784 MB**.
- Distill (images + blobs, no deletions): 784 → 636 MB; aggressive: → 582 MB.
- **Trim (drop raw before 2026-06-04, keep all 116 summaries + head + last 2 weeks): 784 → 309 MB**, 68,032 lines, 0 bad JSON, 0 dangling parents.
- **✅ CONFIRMED WORKING:** session reopened + running normally on the 309 MB trimmed file. The aggressive entry-delete + chain-repair approach is proven end-to-end.
- Files retained: `.BACKUP-20260618-pre-distill` (784 MB), `.DISTILLED` (636 MB), `.DISTILLED2` (582 MB), `.TRIMMED` (309 MB = now live).

## 8. Lessons from the first run (folded into the scripts)
- **Unarchive has NO desktop UI** (open bug). To restore an archived session: edit its metadata (`isArchived: true → false`) in the desktop app's session store and reload. (Kyle located + flipped it manually 2026-06-18.) Archiving is still the correct "close" for the surgery; just know unarchive is a manual flag flip.
- **Redact images by REPLACING the whole image block with a `{"type":"text","text":"[image redacted]"}` block — NOT by blanking `source.data`.** A blanked image slot makes the app warn "image couldn't be read / Rewind to remove it" when the model hits it. Both scripts were updated to the text-block method after the first run showed the warning (harmless, but avoidable).
- Keep ALL intermediate files until the reopened session is confirmed healthy; then delete everything except the BACKUP (retain that a while).

---

## Moved from CLAUDE.md — B-TOKEN-ECONOMY P5 (2026-11-19)

Verbatim passages moved out of the always-loaded rules file to cut what every session re-reads. Each block id is the pointer `CLAUDE.md` carries in its place. `scripts/crew-tooling/move-ledger-check.mjs` proves each block is here once, unchanged, and gone from `CLAUDE.md` (ledger: `Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json`).

<!-- P5-MOVED id=P5-10 -->
### P5-10 — moved from CLAUDE.md, under "3.1 MEMORY.md two-file pattern (Kyle directive 2026-04-29)"

> **★ MEMORY IS SHARED; TRANSCRIPTS ARE NOT — link ONLY the `memory\` subfolder (corrected 2026-07-27).** Claude Code derives the project slug from the folder a session opened, so the three sessions have three slugs — `C--DawnTraderV3-old` / `-new` / `-analyst`. **The rule: only the `memory\` SUBFOLDER is junctioned to ONE shared store** — so a memory write from any session is immediately visible to all, one copy of each memory file — while **each session keeps its OWN separate transcript/conversation folder.** ⚠️ **What was wrong (being fixed):** an earlier setup junctioned the ENTIRE project folder (not just `memory\`) of all three slugs onto one store (the retired `G--My-Drive-…` folder). That over-shared — it commingled every session's transcripts in one place, made the app render all three as confusing **"forks,"** and risked sessions corrupting each other's history. It is un-tangled by the **session-fix (2026-07-27)**: each session gets its own real folder with only its own transcripts (sorted by traced fork-lineage) plus a memory-only junction; conversations are trimmed by hand when they grow too large (the trim runbook) and backed up to Google Drive by TWO Windows tasks: `\DawnTrader-Claude-Conversations-Backup` zips the old/new/analyst session folders and the shared memory, overwriting the last zip (its folder list predates Infra and PM, `#1237`), and `\Claude Code Session Backup` copies every project folder additively and, since B-TRANSCRIPT-ARCHIVE, the readable transcript archive. Read each task's schedule and folder list from the task and its script, never from here. Full detail: `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` + `BUILD_METHOD_PLAYBOOK.md` §5.1. **Never re-junction a whole project folder to share memory — link `memory\` only.**
<!-- /P5-MOVED id=P5-10 -->

<!-- P5-MOVED id=P5-29 -->
### P5-29 — moved from CLAUDE.md, under "6.11 Session-transcript bloat + scroll-bounce repair — governed procedure (B-DISCORD OBJ-7"

When a CC session's transcript grows too large (context overhead climbs; ~195MB ≈ 87% context, ~311MB sticks) OR the window exhibits **scroll-bounce / stuck-on-a-repeated-message** (the renderer keys on `uuid`; **duplicate uuids** — caused by compaction re-appending history blocks — make it jump/freeze), the fix is **findable here, not buried**: runbook `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` (§2.5 = the duplicate-uuid defect + repair) + tools `memory/{trim,distill,dedup}_transcript.py` and `memory/validate.py`. **Dedup** (`dedup_transcript.py`) keeps the first entry per uuid, drops byte-identical repeats, and re-stamps same-id-different-content collisions; **validate** confirms zero dupes. The session must be ARCHIVED during a file swap; re-homing re-stamps each entry's `sessionId` + drops `custom-title`. Pass file paths as ARGS (Windows MSYS can't resolve `/tmp`-style literals inside the script). Prune aggressively (~20–70MB target).
<!-- /P5-MOVED id=P5-29 -->

<!-- P5-MOVED id=P5-46 -->
### P5-46 — moved from CLAUDE.md, under "3.1 MEMORY.md two-file pattern (Kyle directive 2026-04-29)"

**★ PER-SESSION MEMORY SPLIT (Kyle directive 2026-06-19; auto-load added 2026-07-25).** Three concurrent sessions share ONE memory folder (the slugs are junctions — §3.1 top), so the harness-native auto-load of the file NAMED `MEMORY.md` is necessarily SHARED. Therefore: the shared `MEMORY.md` holds ONLY the **operational session-start commands + project-consensus truths** (edit surgically; coordinate any big change; RULES live in this file). **Each session's VOLATILE working-state lives in its OWN file: Claude Old (CC-A) → `MEMORY_CC_A.md`; Claude New (CC-B) → `MEMORY_CC_B.md`; Claude Analyst (CC-C) → `MEMORY_CC_C.md`** (each mirrors to `.claude/memory/`).

**★ EACH SESSION'S OWN FILE IS AUTO-LOADED — `.claude/hooks/load-own-memory.mjs` (SessionStart, `startup|resume|compact`).** The harness natively auto-loads only `MEMORY.md`; this hook fills the gap. It identifies the session by its clone folder (`DawnTraderV3-old|-new|-analyst` → CC-A|B|C), reads that session's `MEMORY_CC_<X>.md` (live truth-file via the hook's `transcript_path`, falling back to the in-clone `.claude/memory/` mirror), and injects its contents — on every start, resume, AND compaction. **Fail-open by construction:** unmapped folder or missing file → inject nothing, exit 0 (never worse than the old manual-read world; never blocks a session). So the three things that auto-load every start/compaction are: **CLAUDE.md (rules) + shared MEMORY.md (ops + truths) + your own MEMORY_CC_<X>.md (state).** Each session still **WRITES ONLY its own** file. The §3.2 200-line cap applies per file.
<!-- /P5-MOVED id=P5-46 -->
