#!/usr/bin/env python3
"""B-TOKEN-ECONOMY OBJ-0 / P0 — token baseline for the Claude crew (PM Claude, 2026-11-19).

Rebuilds, in the repo, the method of the PM decision pack of 2026-11-05
(1-system-manual/pm/decisions/2026-11-05_cheaper-helpers-and-short-conversations.md §3.1):
  - a TURN is one assistant API call, de-duplicated by message.id (the last usage seen wins);
    `<synthetic>` model entries are excluded;
  - context per turn = input_tokens + cache_creation_input_tokens + cache_read_input_tokens.
Adds what B-TOKEN-ECONOMY needs: compactions (two markers, reported separately, never merged),
active crew-hours (UTC hours with >= 1 turn in any BUILDING session), helper turns by model
(subagent transcripts), and the always-loaded bytes from ~/.claude/instructions-loaded.jsonl.

Read-only. Streams line by line. Prints JSON to stdout. Population and window are printed with
every result; nothing is reported without its denominator.

Usage:
  python -I scripts/crew-tooling/token-baseline.py --start 2026-11-13T11:44:00Z --end 2026-11-16T19:45:00Z
  [--projects-dir ~/.claude/projects] [--sessions old:66dbb030,...]
"""
import argparse, glob, json, os, statistics, sys
from collections import defaultdict

VERSION = "token-baseline 1.0 (B-TOKEN-ECONOMY P0)"
# Session folder suffix -> alias. BUILDING sessions define active crew-hours (PM is not a builder).
FOLDERS = {"old": "CC-A", "new": "CC-B", "analyst": "CC-C", "infra": "CC-INFRA", "pm": "CC-PM"}
BUILDING = {"CC-A", "CC-B", "CC-C", "CC-INFRA"}


def in_window(ts, start, end):
    return ts is not None and start <= ts < end


def scan_transcript(path, start, end, acc):
    """Stream one transcript; fill acc (per-file result)."""
    turns = {}            # message.id -> (ts, usage, model)
    markers = {"compact_boundary": 0, "isCompactSummary": 0}
    agent_calls = defaultdict(int)  # requested model of Agent tool calls ("default" if none)
    lines = 0
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            lines += 1
            if '"timestamp"' not in line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                acc["unparsed_lines"] += 1
                continue
            ts = d.get("timestamp")
            if not in_window(ts, start, end):
                continue
            if d.get("subtype") == "compact_boundary":
                markers["compact_boundary"] += 1
            if d.get("isCompactSummary"):
                markers["isCompactSummary"] += 1
            if d.get("type") != "assistant":
                continue
            m = d.get("message") or {}
            model = m.get("model")
            if model == "<synthetic>":
                continue
            mid = m.get("id")
            u = m.get("usage")
            if mid and isinstance(u, dict):
                turns[mid] = (ts, u, model)
            for c in m.get("content") or []:
                if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("name") == "Agent":
                    agent_calls[(c.get("input") or {}).get("model") or "default"] += 1
    acc["lines"] += lines
    for k, v in markers.items():
        acc["markers"][k] += v
    for k, v in agent_calls.items():
        acc["agent_calls_by_requested_model"][k] += v
    return turns


def summarise(turns):
    ctx, tot = [], {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0}
    hours, models = set(), defaultdict(int)
    for ts, u, model in turns.values():
        i = u.get("input_tokens") or 0
        cc = u.get("cache_creation_input_tokens") or 0
        cr = u.get("cache_read_input_tokens") or 0
        o = u.get("output_tokens") or 0
        tot["input"] += i; tot["cache_creation"] += cc; tot["cache_read"] += cr; tot["output"] += o
        ctx.append(i + cc + cr)
        hours.add(ts[:13])
        models[model or "unknown"] += 1
    ctx.sort()
    p90 = ctx[int(0.9 * (len(ctx) - 1))] if ctx else None
    return {
        "turns": len(ctx), "tokens": tot, "total_tokens": sum(tot.values()),
        "median_context": statistics.median(ctx) if ctx else None, "p90_context": p90,
        "turns_by_model": dict(models), "active_hours": sorted(hours),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--projects-dir", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--loaded-log", default=os.path.expanduser("~/.claude/instructions-loaded.jsonl"))
    a = ap.parse_args()
    out = {"tool": VERSION, "window": [a.start, a.end], "population": {}, "sessions": {},
           "method": "turns de-duplicated by message.id; context = input+cache_creation+cache_read; "
                     "<synthetic> excluded; window on entry timestamp (UTC ISO compare)"}
    crew_hours = set()
    for suffix, alias in FOLDERS.items():
        folder = os.path.join(a.projects_dir, "C--DawnTraderV3-" + suffix)
        main_files = sorted(glob.glob(os.path.join(folder, "*.jsonl")))
        sub_files = sorted(glob.glob(os.path.join(folder, "*", "subagents", "*.jsonl")))
        acc = {"lines": 0, "unparsed_lines": 0, "markers": defaultdict(int),
               "agent_calls_by_requested_model": defaultdict(int)}
        turns = {}
        for f in main_files:
            turns.update(scan_transcript(f, a.start, a.end, acc))
        sacc = {"lines": 0, "unparsed_lines": 0, "markers": defaultdict(int),
                "agent_calls_by_requested_model": defaultdict(int)}
        sturns = {}
        for f in sub_files:
            sturns.update(scan_transcript(f, a.start, a.end, sacc))
        main = summarise(turns)
        sub = summarise(sturns)
        if alias in BUILDING:
            crew_hours.update(main["active_hours"])
        out["population"][alias] = {"folder": folder, "main_files": len(main_files),
                                    "subagent_files": len(sub_files), "lines_read": acc["lines"] + sacc["lines"],
                                    "unparsed_lines": acc["unparsed_lines"] + sacc["unparsed_lines"]}
        main["active_hours"] = len(main["active_hours"])
        sub["active_hours"] = len(sub["active_hours"])
        out["sessions"][alias] = {
            "main": main, "helpers": sub,
            "compaction_markers": dict(acc["markers"]),
            "agent_calls_by_requested_model": dict(acc["agent_calls_by_requested_model"]),
        }
    out["active_crew_hours"] = len(crew_hours)
    building_total = sum(out["sessions"][s]["main"]["total_tokens"] + out["sessions"][s]["helpers"]["total_tokens"]
                         for s in out["sessions"] if s in BUILDING)
    out["building_tokens_per_active_crew_hour"] = (building_total / len(crew_hours)) if crew_hours else None
    # Always-loaded bytes (start/resume/compact events) in the window.
    loaded = defaultdict(list)
    try:
        with open(a.loaded_log, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if in_window(d.get("ts"), a.start, a.end) and isinstance(d.get("context_bytes_total"), (int, float)):
                    loaded[d.get("alias") or "unknown"].append(d["context_bytes_total"])
        out["always_loaded_bytes"] = {k: {"events": len(v), "median": statistics.median(v)} for k, v in loaded.items()}
    except OSError as e:
        out["always_loaded_bytes"] = {"error": str(e)}
    json.dump(out, sys.stdout, indent=1, default=str)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
