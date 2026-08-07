#!/usr/bin/env python3
"""crew-status-post — maintain ONE status message in #general, edited in place.

B-CREW-STATUS. Runs on Helsinki so the bot token never leaves the box it already lives on;
the laptop job pipes the rendered body in over ssh.

WHY BOT-AUTHORED (Langston e1, decided before any code was written): the CC bridges post via
WEBHOOK when given a sender name — and a webhook message CANNOT be pinned, while a bot token
CANNOT edit a webhook's message. "Edited in place AND pinned via the existing send path" was
therefore not achievable as originally assumed. Bot authorship buys edit + pin with one
credential, and — the part that matters for correctness — this poster does NOT route through
`cc-send`, so the status message never passes through `append_inbox` and therefore never
enters the log the status job itself reads. The job's output cannot become the job's input.

Usage:  crew-status-post.py  < body.txt
"""
import json, os, re, sys, urllib.request, urllib.error

API = "https://discord.com/api/v10"
STATE = "/var/lib/crew-status/message.json"
CFG = "/etc/dawntrader/discord-comms.env"
TOKEN_ENV = "/etc/langston/discord-cc-bot.env"


def env_val(path, key):
    try:
        for line in open(path, encoding="utf-8"):
            if line.strip().startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        return None
    return None


def req(method, url, token, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bot {token}", "Content-Type": "application/json",
        "User-Agent": "DawnTraderCrewStatus/1.0"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def main():
    # --new posts a FRESH message (the needs-you ping) instead of editing the
    # standing status message. Pinning is not used: neither bot holds Manage Messages, and a
    # tool that depends on Kyle remembering a manual step is a tool he will not use.
    fresh_post = "--new" in sys.argv[1:]
    body = sys.stdin.read().strip()
    if not body:
        print("crew-status-post: empty body, refusing", file=sys.stderr)
        return 2
    # ★ NEVER lead with "Langston": his bridge's address gate is anchored on a leading name,
    # so a status message starting with it would invoke him on EVERY edit cycle (Langston R1).
    if re.match(r"^\s*langston\b", body, re.I):
        body = "Crew status — " + body

    token = env_val(TOKEN_ENV, "DISCORD_BOT_TOKEN")
    chan = env_val(CFG, "DISCORD_CHANNEL_ID")
    if not token or not chan:
        print("crew-status-post: missing token or channel id", file=sys.stderr)
        return 2

    # R2.1: Discord resolves mentions in ALL text. parse:[] on the create AND on every edit —
    # a quoted @everyone inside somebody's message must never ping from Kyle's status post.
    payload = {"content": body[:1990], "allowed_mentions": {"parse": []}}

    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    mid = None
    if os.path.exists(STATE) and not fresh_post:
        try:
            mid = json.load(open(STATE)).get("message_id")
        except Exception:
            mid = None

    if mid:
        try:
            req("PATCH", f"{API}/channels/{chan}/messages/{mid}", token, payload)
            print(f"edited {mid}")
            return 0
        except urllib.error.HTTPError as e:
            # The message may have been deleted. Do NOT assume a cached id still exists —
            # read-back-after-write is the lesson the board clobber taught this crew.
            if e.code not in (404, 403):
                print(f"crew-status-post: edit failed {e.code}", file=sys.stderr)
                return 1
            mid = None

    created = req("POST", f"{API}/channels/{chan}/messages", token, payload)
    mid = created.get("id")
    if fresh_post:
        print(f"posted needs-you ping {mid}")
        return 0
    if not mid:
        print("crew-status-post: create returned no id", file=sys.stderr)
        return 1
    json.dump({"message_id": mid}, open(STATE, "w"))
    # Pinning is DELIBERATELY not attempted. Measured 2026-08-07: neither the CC bot nor the
    # Langston bot holds MANAGE_MESSAGES, and pinning is the only capability here that needs it.
    # (The first implementation also used the wrong endpoint — v10 is /channels/{id}/pins/{msg},
    # not /messages/{id}/pin — so the original 404 hid a real 403 behind a bug of mine.)
    # The message is edited in place, so its URL is permanent and can simply be bookmarked.
    print(f"created {mid} (not pinned by design — permanent URL, see the needs-you ping)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
