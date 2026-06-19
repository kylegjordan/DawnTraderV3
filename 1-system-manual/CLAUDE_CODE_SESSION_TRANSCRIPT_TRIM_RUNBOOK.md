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
Map a desktop session → its transcript file via `(repo)/.claude/cc-session-roster.json` (name → session_id = filename) and/or the first user message + last timestamp. **Confirm the file is the intended session before touching it.**
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
