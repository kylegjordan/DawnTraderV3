#!/usr/bin/env python3
# langston-memory — Phase B: pull-only archive index + recall for Langston.
# r3 (2026-08-06): folds Langston's r2 ruling — N1 (banner/header predicate union),
# N2 (in-body dates are per-record; pad minute-precision), N3 (coverage line),
# N4 (dedupe carries recurrence), C3 ruling (cross-corpus id caution, exact predicate),
# slot ruling (4-tier deprioritise-never-exclude, self-output = exact marker match).
# Pull-only by construction: writes ONLY under /opt/langston-memory/index/.

import json, os, re, sys, glob, datetime, hashlib

ROOT = "/opt/langston-memory"
INDEX = os.path.join(ROOT, "index", "records.jsonl")
META = os.path.join(ROOT, "index", "meta.json")

SHARDS = [
    ("discord",     "/var/log/cc-discord-inbox.jsonl",                          True),
    ("telegram",    ROOT + "/corpus/telegram/*",                                True),
    ("openclaw",    ROOT + "/corpus/openclaw/*",                                True),
    ("transcripts", "/home/langston/.claude/projects/-home-langston/*.jsonl",   True),
]
LEDGER_SOURCES = ["/home/langston/LEDGER.md", "/home/langston/MEMORY.md"]

MAX_STORE = 20000        # stored+searchable text cap (the tail must be findable)
MAX_DISPLAY = 3000       # display clip; truncation is MARKED, never silent
MAX_SHOW = 8
ID_RE = re.compile(r"#\d{2,4}\b|\b(?:P\d+-B[\dA-Za-z.\-]+|B-[A-Z][A-Z0-9\-]{2,}|B\d{2}(?:\.\d+)?[a-z]?)\b")
# a sha must contain at least one hex letter — bare digit runs are message/run ids
SHA_RE = re.compile(r"\b(?=[0-9a-f]*[a-f])[0-9a-f]{8,40}\b")
ISO_RE = re.compile(r"20\d\d-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?")
FOOTER = "Lead, not evidence. Verify against the graded ref before citing."
SELF_MARKERS = ("=== langston-recall:", FOOTER)   # exact self-generated output markers

def now_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def rec(ts, cls, ref, text, ts_quality="exact"):
    if not ts or not text or not str(text).strip():
        return None  # undated or empty never enters the index
    t = str(text).strip()
    if len(t) > MAX_STORE:
        t = t[:MAX_STORE] + " [STORED-TRUNCATED at 20000 chars — full text only at the source ref]"
    return {"ts": ts, "tq": ts_quality, "cls": cls, "ref": ref,
            "ids": sorted(set(ID_RE.findall(t))), "shas": sorted(set(SHA_RE.findall(t)))[:8], "text": t}

def shard_of(ref):
    if ref.startswith("openclaw/"): return "openclaw"
    if ref.startswith("telegram/"): return "telegram"
    if ref.startswith("transcript/"): return "transcripts"
    return "discord"

def tier_of(r):
    """Slot-allocation tiers (Langston ruling, r2): deprioritise, never exclude.
    t0 posted replies / dispatches / crew+Kyle messages · t1 archive records ·
    t2 tool-evidence · t3 the tool's own emitted output (exact marker match)."""
    if any(m in r["text"] for m in SELF_MARKERS):
        return 3
    if r["cls"] == "tool-evidence":
        return 2
    if r["cls"] in ("telegram-archive", "openclaw-langston", "openclaw-channel", "system-notice"):
        return 1
    return 0

# ---------------- indexing ----------------

def classify_sender(e):
    sender = str(e.get("sender") or e.get("sender_username") or "")
    low = sender.lower()
    if "kyle" in low: return "kyle-message"
    if sender in ("Push notice", "Heartbeat") or "heartbeat" in low: return "system-notice"
    return "crew-message"

def parse_discord_like(path, out):
    seen_msg_ids = set()
    kind_cls = {"langston_outbound": "langston-reply", "langston_inbound": "crew-message",
                "langston_alert_inbound": "alert", "voice_inbound": "kyle-message",
                "langston_inbound_voice": "kyle-message"}
    for i, line in enumerate(open(path, encoding="utf-8", errors="replace")):
        try: e = json.loads(line)
        except Exception: continue
        kind = e.get("kind", ""); text = e.get("text") or ""
        if not text: continue
        mid = str(e.get("message_id") or "")
        if kind == "cc_outbound":
            if mid and mid in seen_msg_ids: continue  # dedupe vs langston_inbound mirror
            cls = classify_sender(e)
        elif kind in kind_cls:
            cls = kind_cls[kind]
            if kind == "langston_inbound": cls = classify_sender(e) if "kyle" in str(e.get("sender_username","")).lower() else "crew-message"
            if mid: seen_msg_ids.add(mid)
        elif text:
            cls = classify_sender(e)  # unhandled kinds with text still classified, not dropped
        else:
            continue
        r = rec(e.get("ts", ""), cls, f"{os.path.basename(path)} message_id={mid or '?'} line={i+1}", text)
        if r: out.append(r)

def parse_openclaw(path, out):
    for i, line in enumerate(open(path, encoding="utf-8", errors="replace")):
        try: e = json.loads(line)
        except Exception: continue
        if e.get("type") != "message": continue
        msg = e.get("message") or {}
        role = msg.get("role", "")
        content = msg.get("content")
        parts = []
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "text":
                    parts.append(b.get("text", ""))
                # thinking blocks and tool internals deliberately skipped
        if not parts: continue
        cls = "openclaw-langston" if role == "assistant" else "openclaw-channel"
        r = rec(e.get("timestamp", ""), cls, f"openclaw/{os.path.basename(path)} line={i+1}", "\n".join(parts))
        if r: out.append(r)

def parse_transcript(path, out):
    # Claude Code session transcripts. thinking blocks EXCLUDED AT INDEX TIME, no flag exists.
    for i, line in enumerate(open(path, encoding="utf-8", errors="replace")):
        try: e = json.loads(line)
        except Exception: continue
        msg = e.get("message") or {}
        role = msg.get("role", ""); ts = e.get("timestamp", "")
        content = msg.get("content")
        if isinstance(content, str):
            # string-content user messages ARE the dispatches — index them
            cls = "transcript-reply" if role == "assistant" else "dispatch"
            r = rec(ts, cls, f"transcript/{os.path.basename(path)} line={i+1}", content)
            if r: out.append(r)
            continue
        if not isinstance(content, list): continue
        for b in content:
            if not isinstance(b, dict): continue
            bt = b.get("type", "")
            if bt == "thinking":
                continue  # HARD EXCLUSION
            if bt == "text":
                cls = "transcript-reply" if role == "assistant" else "dispatch"
                r = rec(ts, cls, f"transcript/{os.path.basename(path)} line={i+1}", b.get("text", ""))
                if r: out.append(r)
            elif bt == "tool_use":
                body = f"TOOL CALL {b.get('name','?')}: {json.dumps(b.get('input',{}), ensure_ascii=False)[:900]}"
                r = rec(ts, "tool-evidence", f"transcript/{os.path.basename(path)} line={i+1}", body)
                if r: out.append(r)
            elif bt == "tool_result":
                c = b.get("content")
                if isinstance(c, list):
                    c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                body = f"TOOL RESULT: {str(c)[:4000]}"
                r = rec(ts, "tool-evidence", f"transcript/{os.path.basename(path)} line={i+1}", body)
                if r: out.append(r)

def parse_telegram(path, out):
    if path.endswith(".jsonl"):
        parse_discord_like(path, out)
        return
    if path.endswith(".md"):
        # never stamp an archive chunk with the file's copy mtime as the record date
        fname = os.path.basename(path)
        lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
        m = re.search(r"(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})", fname)
        range_ts = (m.group(1) + "T00:00:00Z") if m else None
        for start in range(0, len(lines), 60):
            chunk = "\n".join(lines[start:start + 60]).strip()
            if not chunk: continue
            inbody = ISO_RE.findall(chunk)
            if inbody:
                t = min(inbody).replace(" ", "T")
                if len(t) == 16:      # N2 nit: pad minute-precision so lexical sort is correct
                    t += ":00"
                ts, tq = t + "Z", "in-body"
            elif range_ts:
                ts, tq = range_ts, "range-start(filename)"
            else:
                continue  # no honest date derivable -> not indexed (provenance-or-nothing)
            r = rec(ts, "telegram-archive", f"telegram/{fname} lines={start+1}-{min(start+60,len(lines))}", chunk, ts_quality=tq)
            if r: out.append(r)

def build_index():
    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    out, counts = [], {}
    for name, pattern, required in SHARDS:
        paths = sorted(glob.glob(pattern)) if any(ch in pattern for ch in "*?") else [pattern]
        paths = [p for p in paths if os.path.isfile(p)]
        unreadable = [p for p in paths if not os.access(p, os.R_OK)]
        if (not paths and required) or unreadable:
            print(f"REFUSING TO INDEX: shard '{name}': " +
                  (f"no files at {pattern}" if not paths else f"unreadable: {', '.join(unreadable[:5])}"), file=sys.stderr)
            sys.exit(2)
        before = len(out)
        for p in paths:
            try:
                if name == "discord": parse_discord_like(p, out)
                elif name == "openclaw": parse_openclaw(p, out)
                elif name == "transcripts": parse_transcript(p, out)
                elif name == "telegram": parse_telegram(p, out)
            except (PermissionError, OSError) as ex:
                print(f"REFUSING TO INDEX: {p}: {ex}", file=sys.stderr)
                sys.exit(2)
        shard_recs = out[before:]
        # N3: record each shard's coverage span at build time.
        # NOTE (Langston r3 verification): spans are computed PRE-dedupe; the searchable
        # index is post-dedupe — a span can cover text whose surviving copy lives in a
        # different shard (benign today: the overlap is the telegram→discord cutover
        # window). Bucket by SHARD, not by class, when auditing coverage.
        span = ({"min": min(r["ts"] for r in shard_recs)[:10], "max": max(r["ts"] for r in shard_recs)[:10]}
                if shard_recs else None)
        counts[name] = {"files": len(paths), "records": len(shard_recs), "span": span}
    # dedupe on text hash, keep EARLIEST; N4: the survivor carries recurrence (n, last_ts)
    out.sort(key=lambda r: r["ts"])
    seen_hash, deduped, dupes = {}, [], 0
    for r in out:
        h = hashlib.sha1(r["text"].encode("utf-8", "replace")).hexdigest()
        if h in seen_hash:
            surv = deduped[seen_hash[h]]
            surv["n"] = surv.get("n", 1) + 1
            surv["last_ts"] = r["ts"]
            dupes += 1
            continue
        seen_hash[h] = len(deduped)
        deduped.append(r)
    tmp = INDEX + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for r in deduped:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, INDEX)
    meta = {"built_at": now_utc(), "counts": counts, "total": len(deduped),
            "duplicates_removed": dupes,
            "shards": [{"name": n, "pattern": p, "required": req} for n, p, req in SHARDS]}
    with open(META + ".tmp", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    os.replace(META + ".tmp", META)
    print(json.dumps(meta, indent=2))

# ---------------- ledger overlay ----------------

def load_retractions():
    for src in LEDGER_SOURCES:
        if not os.path.isfile(src) or not os.access(src, os.R_OK): continue
        text = open(src, encoding="utf-8", errors="replace").read()
        m = re.search(r"###\s*Retractions.*?(?=\n##|\Z)", text, re.S)
        if not m: continue
        entries = []
        for para in re.split(r"\n- ", m.group(0))[1:]:
            body = "- " + para.strip()
            entries.append({"src": src, "text": body,
                            "ids": set(ID_RE.findall(body)), "shas": set(SHA_RE.findall(body)),
                            "terms": set(w.lower() for w in re.findall(r"[A-Za-z][\w\-/]{5,}", body))})
        if entries:
            return src, entries
    return None, []

# ---------------- query ----------------

def freshness(meta):
    """A freshness failure must be VISIBLE, never a clean zero."""
    built = meta["built_at"]
    try:
        newer = 0
        for line in open("/var/log/cc-discord-inbox.jsonl", encoding="utf-8", errors="replace"):
            try:
                ts = json.loads(line).get("ts", "")
            except Exception:
                continue
            if ts and ts[:19] > built[:19]:
                newer += 1
    except Exception:
        newer = None
    try:
        built_epoch = datetime.datetime.strptime(built, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
        tdir = "/home/langston/.claude/projects/-home-langston"
        newer_files = sum(1 for p in glob.glob(tdir + "/*.jsonl") if os.path.getmtime(p) > built_epoch)
    except Exception:
        newer_files = None
    return built, newer, newer_files

def query(terms):
    if not os.path.isfile(INDEX) or not os.path.isfile(META):
        print("REFUSED: index not built. Run: langston-recall index"); sys.exit(2)
    meta = json.load(open(META))
    problems = []
    for sh in meta["shards"]:
        pattern = sh["pattern"]
        paths = glob.glob(pattern) if any(ch in pattern for ch in "*?") else ([pattern] if os.path.isfile(pattern) else [])
        if sh["required"] and not paths:
            problems.append(f"{sh['name']}: no files at {pattern}")
            continue
        unreadable = [p for p in paths if not os.access(p, os.R_OK)]
        if sh["required"] and unreadable:
            problems.append(f"{sh['name']}: {len(unreadable)} unreadable file(s), e.g. {unreadable[0]}")
    if problems:
        print("REFUSED: corpus degraded — results would be silently partial: " + "; ".join(problems))
        sys.exit(2)

    lsrc, retr = load_retractions()
    if not retr:
        print("REFUSED: no parseable Reviewer Ledger found (checked: " + ", ".join(LEDGER_SOURCES) + "). "
              "Recall without the retraction overlay is a machine for re-asserting withdrawn conclusions.")
        sys.exit(2)

    built, newer_rows, newer_files = freshness(meta)
    if not terms:
        print(f"langston-recall — usage: langston-recall <term> [more terms]   (index: {meta['total']} records, built {built})")
        print("REFUSED: empty query returns no dump by design. Give an issue id (#605), a batch id, or a subject term.")
        sys.exit(1)

    tl = [t.lower() for t in terms]
    hits = []
    for line in open(INDEX, encoding="utf-8", errors="replace"):
        try: r = json.loads(line)
        except Exception: continue
        hay = (r["text"] + " " + " ".join(r["ids"])).lower()
        if all(t in hay for t in tl):
            hits.append(r)

    query_ids = [t for t in terms if ID_RE.fullmatch(t)]
    hits_recent = sorted(hits, key=lambda r: r["ts"], reverse=True)   # pure recency
    hits_display = sorted(hits_recent, key=tier_of)                   # stable sort: tier asc, ts desc within tier

    # force-include per queried ID: newest per-record-dated + oldest (origin);
    # N2: in-body counts as per-record — only range-start(filename) is excluded from "newest".
    forced = []
    for qid in query_ids:
        newest = next((r for r in hits_recent if qid in r["ids"] and r.get("tq", "exact") != "range-start(filename)"), None)
        oldest = next((r for r in reversed(hits_recent) if qid in r["ids"]), None)
        if newest: forced.append(newest)
        if oldest and oldest is not newest:
            oldest["_origin"] = True
            # C3 ruling: exact cross-corpus predicate, no invented threshold
            if newest and shard_of(oldest["ref"]) != shard_of(newest["ref"]):
                oldest["_xcorpus"] = (qid, shard_of(oldest["ref"]), shard_of(newest["ref"]))
            forced.append(oldest)
    shown, seen = [], set()
    for r in forced + hits_display:
        key = r["ref"]
        if key in seen: continue
        seen.add(key); shown.append(r)
        if len(shown) >= MAX_SHOW: break
    not_shown = [r for r in hits_recent if r["ref"] not in {s["ref"] for s in shown}]

    # N1: ONE ledger-entry list serving both the header and the banners — union of
    # term-matched entries and entries flagged by any SHOWN hit, each labelled En.
    def hit_flags(r):
        return [e for e in retr if (e["ids"] & set(r["ids"])) or (e["shas"] & set(r["shas"]))]
    entries, entry_no = [], {}
    def entry_label(e, reason):
        k = e["text"]
        if k not in entry_no:
            entry_no[k] = f"E{len(entries)+1}"
            entries.append({"label": entry_no[k], "e": e, "reasons": []})
        for item in entries:
            if item["label"] == entry_no[k]:
                item["reasons"].append(reason)
        return entry_no[k]
    for e in retr:
        if any(t in " ".join(e["terms"]) or any(t in i.lower() for i in e["ids"]) for t in tl):
            entry_label(e, "matches query terms")
    hit_banner = {}
    for idx, r in enumerate(shown, 1):
        labels = [entry_label(e, f"flags hit [{idx}]") for e in hit_flags(r)]
        if labels:
            hit_banner[r["ref"]] = sorted(set(labels))

    print(f"=== langston-recall: {' '.join(terms)} ===")
    fr_disc = "FRESHNESS UNKNOWN (discord check failed)" if newer_rows is None else f"{newer_rows} discord rows"
    fr_tr = "FRESHNESS UNKNOWN (transcript check failed)" if newer_files is None else f"{newer_files} transcript files"
    warn = " — ⚠ a miss here is NOT an absence" if (newer_rows or newer_files or newer_rows is None or newer_files is None) else ""
    print(f"INDEX: built {built}, {meta['total']} records ({meta.get('duplicates_removed',0)} dupes removed at build). Newer than index: {fr_disc}, {fr_tr}{warn}")
    cov = []
    for name in ("openclaw", "telegram", "discord", "transcripts"):
        sp = (meta["counts"].get(name) or {}).get("span")
        cov.append(f"{name} {sp['min']}→{sp['max']}" if sp else f"{name} EMPTY")
    print("COVERAGE: " + " · ".join(cov) + " — a query outside a shard's span cannot hit that shard; thin results there are not absences")
    if entries:
        print(f"★ LEDGER CHECK ({lsrc}): {len(entries)} retraction entr{'y' if len(entries)==1 else 'ies'} relevant — READ BEFORE USING ANY HIT:")
        for item in entries:
            reasons = "; ".join(sorted(set(item["reasons"])))
            print(f"  [{item['label']}] ({reasons}) " + item["e"]["text"][:400].replace("\n", " "))
    else:
        print(f"LEDGER CHECK: no retraction entries match this query or its hits ({len(retr)} on file at {lsrc})")
    print()
    for n, r in enumerate(shown, 1):
        drift = " · drift unknown (changed-since pending)" if r["shas"] else ""
        tq = r.get("tq", "exact")
        if tq == "exact": tqnote = ""
        elif tq == "in-body": tqnote = " · date from in-body timestamp"
        else: tqnote = f" · date is {tq}, NOT a per-record timestamp"
        seen_note = f" · seen {r['n']}× through {r['last_ts'][:10]}" if r.get("n", 1) > 1 else ""
        origin = " · [ORIGIN — oldest record for a queried id]" if r.get("_origin") else ""
        banner = f" ⚠⚠ RETRACTED/SUPERSEDED — see ledger entr{'y' if len(hit_banner.get(r['ref'],[]))==1 else 'ies'} {', '.join(hit_banner[r['ref']])} above" if r["ref"] in hit_banner else ""
        print(f"[{n}] {r['ts']} · {r['cls']}(t{tier_of(r)}) · {r['ref']} · ids: {', '.join(r['ids']) or '—'}{drift}{tqnote}{seen_note}{origin}{banner}")
        if r.get("_xcorpus"):
            qid, o_sh, n_sh = r["_xcorpus"]
            print(f"    ⚠ CROSS-CORPUS ID — the {qid} namespace in {o_sh} is not known to be continuous with today's ({n_sh}); treat as a different item until proven")
        body = r["text"]
        if len(body) > MAX_DISPLAY:
            body = body[:MAX_DISPLAY] + " [DISPLAY-TRUNCATED — full text searchable; read source at the ref above]"
        for ln in body.splitlines():
            print("    " + ln)
        print()
    if not shown:
        print("0 hits shown. (An empty result is NOT evidence of absence — check the INDEX and COVERAGE lines.)")
    if not_shown:
        rng = f"{min(r['ts'] for r in not_shown)[:10]} → {max(r['ts'] for r in not_shown)[:10]}"
        print(f"NOT SHOWN: {len(not_shown)} more ({rng}). Narrow with additional terms.")
    classes = {}
    for r in shown:
        key = (tier_of(r), r["cls"])
        classes[key] = classes.get(key, 0) + 1
    if shown:
        mix = ", ".join(f"{v} {cls}(t{tier})" for (tier, cls), v in sorted(classes.items()))
        only_classes = {cls for (_, cls) in classes}
        mirror = "  ⚠ ALL hits are one class — you are holding a mirror, not the record" if len(only_classes) == 1 and len(shown) > 1 else ""
        print(f"CLASS MIX (tier order t0 posted/dispatch/crew → t1 archives → t2 tool-evidence → t3 self-output): {mix}{mirror}")
    print("---")
    print(FOOTER)

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "index":
        build_index()
    else:
        query(args)
