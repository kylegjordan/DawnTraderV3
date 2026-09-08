"""Coltrane's wake bridge — invoke the headless Codex agent when it is named in
the crew channel, and post its reply back.

★ NAMING, SETTLED 2026-09-08: `codex` is the TOOL (the CLI binary), `Coltrane` is
  the AGENT (the unix user, the personality, the thing you address). Both names
  wake it, because Kyle asked for both.

⛔⛔ WHY THIS TAILS A LOG INSTEAD OF BEING A DISCORD BOT. Langston's bridge is a
    `discord.py` client with its own bot application and its own token. Coltrane
    needs none of that: `/var/log/cc-discord-inbox.jsonl` is ALREADY the unified
    record every message lands in, written by the CC bridge. Reusing it means no
    second bot app, no second token to rotate, no second thing that can silently
    stop being authorised — and it fails in the same way, at the same moment, as
    everything else that reads that file.

⛔⛔ THE RUNAWAY GUARD IS THE POINT, NOT A NICETY. Kyle's standing constraint is
    COST: *"it's gonna cost more, and so I want to be mindful of the usage."* An
    agent that replies in a channel it also reads is one bad predicate away from
    talking to itself at several thousand tokens a turn.
    THREE INDEPENDENT BRAKES, because any one of them can be wrong:
      1. NEVER engage on our own post (`sender == "Codex"`). Self-wake is the
         loop that actually happens.
      2. NEVER engage on automated traffic — push notices, heartbeats, alerts.
      3. A COOLDOWN and a per-hour ceiling. Exceeded, it logs and stays silent
         rather than queueing, because a queue drains into the same spend.

⚠️ EVERY INVOKE IS LOGGED WITH ITS TOKEN COUNT. If this thing ever costs more than
   expected, the answer must be readable rather than reconstructed from a bill.
"""

import json, os, re, subprocess, sys, time
from datetime import datetime, timezone

INBOX = "/var/log/cc-discord-inbox.jsonl"
RUNLOG = "/var/log/coltrane-invokes.jsonl"
USER = "coltrane"
HOME = "/home/coltrane"
NL = chr(10)

# ⛔ BOTH NAMES WAKE IT (Kyle 2026-09-08), plus the crew-wide call. `@crew` and
#    `ALL SESSIONS` are the EXISTING crew trigger — taken from the CC wake filter so
#    there is one convention, not two.
NAME_RE = re.compile(r"\b(coltrane|codex)\b", re.I)
CREW_RE = re.compile(r"@crew\b|\bALL SESSIONS\b", re.I)

# ⛔ Senders whose traffic must NEVER trigger a paid invoke.
MACHINE_SENDERS = {"Codex", "Push notice", "Heartbeat"}
MACHINE_KINDS = {"cc_outbound_media", "langston_alert_inbound"}

COOLDOWN_SECONDS = 45          # minimum gap between invokes
MAX_PER_HOUR = 12              # ceiling; exceeded => stay silent and say so in the log
PROMPT_MAX = 12_000            # bytes of channel context handed to one invoke


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(row):
    try:
        with open(RUNLOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + NL)
    except Exception:
        pass


def should_engage(row):
    """Returns (engage: bool, why: str). ⚠️ The `why` is recorded even when we DON'T
    engage — a bridge that silently declines is indistinguishable from a dead one."""
    kind = row.get("kind") or ""
    sender = str(row.get("sender") or "")
    text = str(row.get("text") or row.get("message") or row.get("body") or "")

    if not text.strip():
        return False, "empty body"
    if sender in MACHINE_SENDERS:
        # ⛔ BRAKE 1 — self-wake. `sender == "Codex"` is our own post coming back.
        return False, "machine sender: " + sender
    if kind in MACHINE_KINDS:
        return False, "machine kind: " + kind
    if kind == "langston_outbound" and not NAME_RE.search(text):
        return False, "Langston talking to someone else"

    if NAME_RE.search(text):
        return True, "named directly"
    if CREW_RE.search(text):
        return True, "crew-wide call"
    return False, "not addressed to Coltrane"


def recent_context(n=25):
    """The last few channel messages, so a named agent is not answering a fragment.
    ⚠️ It is CONTEXT, not memory: this bridge holds no state between invokes."""
    try:
        rows = []
        with open(INBOX, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue
        out, used = [], 0
        for r in reversed(rows[-200:]):
            b = str(r.get("text") or r.get("message") or "").strip()
            if not b:
                continue
            who = str(r.get("sender") or r.get("kind") or "?")
            piece = "[%s] %s: %s" % (str(r.get("ts"))[:19], who, b)
            if used + len(piece) > PROMPT_MAX or len(out) >= n:
                break
            out.append(piece)
            used += len(piece)
        out.reverse()
        return NL.join(out)
    except Exception:
        return ""


def invoke(message, why):
    """Run codex as the coltrane user. ⛔ The prompt goes in on STDIN, never in argv —
    it is arbitrary channel prose, and this project has had six separate artifacts
    mangled by putting text on a command line."""
    prompt = (
        "You have been addressed in the DawnTrader crew channel on Discord." + NL
        + "Reason you were woken: " + why + "." + NL + NL
        + "⛔ Follow your AGENTS.md. In particular: you are NOT part of the routine batch "
        + "and review loop — that is Langston's, every time. You are here because someone "
        + "asked for you specifically." + NL + NL
        + "⛔ Reply with the MESSAGE TEXT ONLY — no preamble, no 'here is my reply'. It is "
        + "posted verbatim to the channel as `Codex`." + NL
        + "⛔ LEAD your reply with the NAME of whoever you are answering, so their session "
        + "wakes. If you are answering Langston, his name must be the FIRST WORD." + NL
        + "✅ If you have nothing worth the channel's attention, reply with exactly: SILENT" + NL + NL
        + "--- recent channel context (oldest first) ---" + NL
        + recent_context() + NL + NL
        + "--- the message that woke you ---" + NL + message + NL
    )
    ppath = "/tmp/coltrane-prompt-%d.md" % int(time.time() * 1000)
    with open(ppath, "w", encoding="utf-8") as fh:
        fh.write(prompt)
    os.chmod(ppath, 0o644)
    try:
        with open(ppath, encoding="utf-8") as stdin_fh:
            p = subprocess.run(
                ["sudo", "-u", USER, "env", "HOME=" + HOME,
                 "sh", "-c", "cd " + HOME + " && codex exec --skip-git-repo-check -"],
                stdin=stdin_fh, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=900)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "")
    finally:
        try:
            os.unlink(ppath)
        except OSError:
            pass


def post(text):
    p = subprocess.run(["/usr/local/bin/codex-send"], input=text, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=180)
    return p.returncode, (p.stdout or "").strip()


def main():
    # start at the END of the log — a restart must not replay and re-answer history,
    # which would be both wrong and expensive.
    with open(INBOX, encoding="utf-8", errors="replace") as fh:
        fh.seek(0, os.SEEK_END)
        pos = fh.tell()
    log({"ts": utc(), "event": "bridge started", "tail_from_byte": pos})

    last_invoke, hour_bucket, hour_count = 0.0, None, 0

    while True:
        time.sleep(5)
        try:
            with open(INBOX, encoding="utf-8", errors="replace") as fh:
                fh.seek(pos)
                new = fh.readlines()
                pos = fh.tell()
        except Exception as e:
            log({"ts": utc(), "error": "inbox read: %s" % e})
            continue

        for line in new:
            try:
                row = json.loads(line)
            except Exception:
                continue
            engage, why = should_engage(row)
            if not engage:
                continue

            now = time.time()
            bucket = int(now // 3600)
            if bucket != hour_bucket:
                hour_bucket, hour_count = bucket, 0
            # ⛔ BRAKE 3 — cooldown and ceiling. Declining is LOGGED, never silent.
            if now - last_invoke < COOLDOWN_SECONDS:
                log({"ts": utc(), "declined": "cooldown", "why": why})
                continue
            if hour_count >= MAX_PER_HOUR:
                log({"ts": utc(), "declined": "hourly ceiling %d reached" % MAX_PER_HOUR,
                     "why": why})
                continue

            text = str(row.get("text") or row.get("message") or "")
            t0 = time.time()
            rc, out, err = invoke(text, why)
            last_invoke, hour_count = time.time(), hour_count + 1

            toks = ""
            m = re.search(r"tokens used[\s:]*([\d,]+)", err)
            if m:
                toks = m.group(1)

            posted = None
            if rc == 0 and out and out.strip().upper() != "SILENT":
                prc, pdetail = post(out)
                posted = pdetail if prc == 0 else "POST FAILED: " + pdetail
            log({"ts": utc(), "why": why, "rc": rc,
                 "seconds": round(time.time() - t0, 1), "tokens_used": toks,
                 "silent": out.strip().upper() == "SILENT" if out else None,
                 "posted": posted,
                 "woken_by": str(row.get("sender") or row.get("kind") or "?"),
                 "measures": ("one row per wake decision that led to an invoke; declines are "
                              "logged too, so a quiet bridge is distinguishable from a dead one")})


if __name__ == "__main__":
    sys.exit(main())
