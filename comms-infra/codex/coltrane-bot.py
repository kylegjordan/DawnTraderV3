"""Coltrane's Discord bot — its OWN identity on the channel, and its own DM inbox.

⛔⛔ THIS REPLACES THE LOG-TAILING BRIDGE, AND THE REASON IS DMs. Tailing
    `cc-discord-inbox.jsonl` worked for channel traffic and could never work for
    direct messages: a bot receives those over the gateway, and nothing writes
    them to that file. Kyle asked to message Coltrane privately, so the bridge had
    to become a real gateway client. Posting under its own identity — rather than
    the shared CC webhook — came with it rather than being a second job.

★ WHAT CHANGED FOR EVERYONE ELSE: Coltrane's posts now come from the Coltrane bot,
  not from the webhook the four Claude sessions share. Kyle's concern about
  messages getting crossed is answered structurally: it is a different Discord
  identity, so it can carry its own colour and take its own DMs.

⛔ THE LOOP GUARD IS NOT A BLANKET BOT-IGNORE, AND THAT DISTINCTION MATTERS.
   Langston is ALSO a bot, and Coltrane iterating with Langston is the entire
   point of putting them in one channel. So:
     · IGNORE our own messages — the only genuinely unbounded loop.
     · IGNORE the automated notice senders by NAME (push notices, heartbeats).
     · ENGAGE everything else that names us, human or bot.
   ⚠️ A blanket `if message.author.bot: return` would have silently made
     Langston unable to reach Coltrane, and it would have looked like working code.

⛔ NO RATE LIMIT. Kyle, 2026-09-08: *"I don't want any limitations on that. If that
   happens, it's a cost. I will make sure to pay."* Every invoke is logged with its
   token count so the spend is readable; nothing is throttled.
"""

import tempfile
import asyncio, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

import discord

TOKEN_FILE = "/etc/coltrane/discord-coltrane-bot.env"
COMMS_FILE = "/etc/dawntrader/discord-comms.env"
RUNLOG = "/var/log/coltrane-invokes.jsonl"
INBOX = "/var/log/cc-discord-inbox.jsonl"
CREW_STATE = "/var/lib/crew-switch/state.json"
USER, HOME = "coltrane", "/home/coltrane"
# ⛔ cwd is a SCRATCH directory, and that is the fence rather than a tidiness choice.
#    Codex's workspace-write sandbox makes the working directory writable. With cwd
#    = /home/coltrane that would have handed the agent write access to its whole home,
#    including ~/.codex. Pointing cwd at a scratch dir means the writable set is exactly
#    scratch + its memory store (config.toml writable_roots), and nothing else.
WORKDIR = "/home/coltrane/work"
MEMDIR = "/home/coltrane/memory"
# ⛔⛔ THE SANDBOX IS SET BY THESE FLAGS, NOT BY config.toml — MEASURED, AND THE CONFIG
#    ROUTE LOOKS LIKE IT WORKS. `sandbox_mode = "workspace-write"` was written into
#    ~/.codex/config.toml and the very next probe still came back
#    "mkdir: cannot create directory: Read-only file system" for the agent's OWN store.
#    `codex exec` defaults to read-only and takes the flag; nothing warns that the config
#    key was ignored.
#    ⇒ WITHOUT THIS LINE the agent is told in its instructions to record what it learns,
#      is handed a store it cannot write to, and every write fails silently inside its own
#      shell. The store would read as "it never had anything worth recording."
# ★ MEASURED FENCE, with the negative controls that make it mean something:
#      writable: the memory store, and the scratch cwd
#      REFUSED:  /home/coltrane itself, /etc, and Langston's OAuth token
#                (`cat /etc/langston/oauth.env` -> Permission denied)
# ⛔ NETWORK IS ON, AND IT IS ON FOR EXACTLY ONE REASON: PUSHING ITS OWN WORK.
#    MEASURED 2026-09-08 with it off: the agent could `git commit` fine and the push died
#    with "Could not resolve hostname github.com". Committing without pushing is the worst
#    of both — work exists, nobody can see it, and the agent reports success on the commit.
# ⚠️ THIS IS A REAL WIDENING AND IS NOT DRESSED UP AS ANYTHING ELSE: the shell can now reach
#    the internet generally, not just GitHub. Codex's workspace-write sandbox has no
#    per-host allowlist to narrow it to.
# ★ WHAT STILL HOLDS, measured, so the widening is bounded rather than trusted:
#      · it can write ONLY its memory store and its scratch cwd — /home/coltrane itself,
#        /etc, /opt and /var all still refuse
#      · `cat /etc/langston/oauth.env` -> Permission denied
#      · its GitHub key reaches the WORK repo alone: aimed at the real repo, GitHub answers
#        "Permission to kylegjordan/DawnTraderV3.git denied to deploy key"
#      · every invoke is logged with its token count
# ⇒ THE ALTERNATIVE, IF THIS EVER NEEDS TIGHTENING: keep the network off and have a timer
#   OUTSIDE the sandbox push whatever it has committed. Costs a delay and a background
#   actor; it was not worth those today.
# ⛔⛔ `--approve-for-me` REPLACED `-s workspace-write`, AND THE TWO CANNOT BOTH BE PASSED
#    (codex refuses the combination). The reason is the BROWSER: an MCP tool call raises an
#    approval request, and under the headless default policy of "never" every single one is
#    REFUSED — measured, three navigations in a row came back "MCP tool call requires
#    approval, but approval policy is never".
# ★ THE FENCE WAS RE-PROVED UNDER THE NEW FLAG RATHER THAN ASSUMED TO SURVIVE IT, because
#   swapping the flag that names the sandbox is exactly when a fence quietly disappears.
#   Identical results to the -s form: /home/coltrane read-only, /etc read-only,
#   `cat /etc/langston/oauth.env` -> Permission denied, memory store writable.
#   The refusals are the OS sandbox, not the approval layer, which is why they still fire.
SANDBOX = ("--add-dir " + MEMDIR
           + " -c sandbox_workspace_write.network_access=true --approve-for-me")
NL = chr(10)

NAME_RE = re.compile(r"\b(coltrane|codex)\b", re.I)
# ⛔ KYLE MAY NAME COLTRANE ANYWHERE; EVERYONE ELSE MUST LEAD WITH THE NAME (Kyle, 2026-09-11).
#    NAME_RE alone woke it on ANY mention, so a session or Langston merely writing ABOUT
#    Coltrane spent a paid invoke nobody asked for. Same address gate as the Langston bridge
#    (ADDRESS_START_RE), same tolerated leading markup.
NAME_START_RE = re.compile(r"^[\s*_~`>#:\".\-]*(coltrane|codex)\b", re.I)
CREW_RE = re.compile(r"@crew\b|\bALL SESSIONS\b", re.I)
# ⛔ By NAME, not by bot-ness — see the docstring. These are automated notices only.
MUTE_SENDERS = {"push notice", "heartbeat"}
PROMPT_MAX = 12_000


def env(path, key):
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


# ⚠️ Fails toward FEWER invokes: with no Kyle id on file, Kyle must lead with the name too.
KYLE_ID = env(COMMS_FILE, "KYLE_DISCORD_ID") or ""


def engage_reason(text, author_id, who, is_dm):
    """Why Coltrane should answer this message, or None. on_message's ONLY gate after its
    two brakes - a plain function so a replay drives the same decision the bot makes."""
    if is_dm:
        return "direct message from " + who
    name_re = NAME_RE if (KYLE_ID and str(author_id) == KYLE_ID) else NAME_START_RE
    if name_re.search(text):
        return "named directly by " + who
    if CREW_RE.search(text):
        return "crew-wide call from " + who
    return None


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mirror_to_inbox(text, channel_id, is_dm):
    """⛔⛔ WRITE OUR OWN POSTS INTO THE SHARED INBOX LOG, OR THEY WAKE NOBODY.

    MEASURED 2026-09-08: Coltrane's first reply through its own bot landed in the channel
    correctly — and was ABSENT from `cc-discord-inbox.jsonl`. That file is written by the
    CC bridge, which does not observe another bot's messages, and it is what the CC wake
    filter tails.
    ⇒ A Coltrane reply naming OLD Claude would have woken NOBODY. It would sit in the
      channel looking perfectly answered while reaching no one — the worst shape of
      failure, because it is invisible from both ends.
    ★ Fixed HERE rather than in the CC bridge on purpose: that bridge carries Langston's
      traffic and Kyle's inbound, and this does not need to touch it. The row shape
      matches what the filter already parses (`kind: cc_outbound` + `sender`), so the
      existing routing applies with no filter change.
    ⚠️ DMs are deliberately NOT mirrored — a private message is not channel traffic, and
      copying it into a log four sessions read would be a disclosure nobody asked for."""
    if is_dm:
        return "not mirrored (DM)"
    try:
        row = {"ts": utc(), "kind": "cc_outbound", "sender": "Coltrane",
               "text": text, "channel_id": str(channel_id),
               # transport MUST read "discord" verbatim. MEASURED 2026-09-08: with
               # "coltrane-bot" here the wake line came out as "via Telegram" — the filter
               # tests that one string and falls back to Telegram for anything else
               # (cc-wake-filter.py:326). Telegram was decommissioned in July, so a woken
               # session would have been pointed at a channel that no longer exists, and
               # MEMORY 4.6 keys the reply channel off exactly that label.
               "transport": "discord", "source": "coltrane-bot.py"}
        with open(INBOX, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + NL)
        return "mirrored"
    except Exception as e:
        return "MIRROR FAILED: %s: %s" % (type(e).__name__, e)


def log(row):
    try:
        with open(RUNLOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + NL)
    except Exception:
        pass


# ---- restart recovery (B-LANGSTON-RELIEF OBJ-4, Coltrane's Step-8 finding 2026-10-17; Langston r1 2026-10-17) -------
# A named post that arrived while this process was down was never seen: on_ready only logged, and the one history read
# lives inside an already-received on_message. Parity with Langston's OBJ-1 recovery, keyed on what was ANSWERED, not
# on what was seen (a seen-watermark would skip a post whose invoke was in flight when the process died): at a ready,
# every channel post since max(FLOOR, now - 24 h) is re-fed through on_message - which applies the same brakes and
# gate - unless the run log records it as answered. The floor is written once, at the first ready of this code, so
# posts handled by the earlier code (none of its run-log rows carry a message id - 305 rows, Langston's read
# 2026-10-17) are never replayed.
# ⛔ NO DUPLICATE INVOKES (Langston r1, exercised): an invalid-session re-IDENTIFY fires a second on_ready while the
#    first pass is still running, and invoke times vary 4.5 s -> 864 s, so a slower first pass reached ids the second had
#    already answered - fed order [11, 12, 13, 12, 13]. So: a second pass SKIPS while one runs (`_recovering`), and every
#    id is re-checked against the run log at FEED time, not only in a start-of-pass snapshot. That re-check covers ONLY
#    an id answered AND logged between the snapshot and its feed. It does NOT cover two processes: the run-log row is
#    written at the END of _handle, after the invoke, so a second process reading during the first's in-flight invoke
#    sees no answer and feeds the same id (Langston r2). Two processes are not guarded here.
# ⛔ THE WINDOW IS THE CLOCK, NOT A COUNT: the history read is `after=` the window start with no limit - a 500-message cap
#    bound at ~10-17 h on busy days (>500 channel messages/day on 6 of 14 days, peak ~1,134).
# ⚠️ The answered-dedupe depends on the run log NOT being rotated inside 24 h (no logrotate rule exists for it today,
#    measured 2026-10-17); a sub-24 h rotation would re-enable replays of answered posts.
# Limits, stated: DMs are not recovered (no single history to read); a post older than 24 h is not; an invoke that
# FAILED (nothing posted) is recorded `answered: false` and IS retried at the next ready; an invoke that TIMED OUT
# raises before its log row, so it is retried by the ABSENCE of a row. There is no attempt cap: an unanswerable post is
# re-invoked at every ready for 24 h (homed on B-LANGSTON-RELIEF's own list, Langston r2).
FLOOR = "/var/lib/coltrane-bot/recover-floor.json"
RECOVER_MAX_AGE_S = 24 * 3600


def read_floor(path=None):
    """Epoch seconds or None - an unreadable or malformed file is None (then the floor is re-stamped to now and
    nothing earlier is replayed - the safe direction)."""
    path = path or FLOOR             # resolved at CALL time, so a test (or a config) can move it
    try:
        with open(path, encoding="utf-8") as fh:
            return float(json.load(fh)["since_epoch"])
    except Exception:
        return None


def ensure_floor(now_epoch, path=None):
    """Write the floor once if absent; return the floor in force (None if it could not be written)."""
    path = path or FLOOR
    cur = read_floor(path)
    if cur is not None:
        return cur
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".recover-floor-")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"since_epoch": now_epoch, "written": utc()}, fh)
        os.replace(tmp, path)
        return read_floor(path)
    except Exception:
        return None


def handled_ids(path=None):
    """Message ids the run log records as ANSWERED (rows carry `message_id` and `answered` since this change). Only a
    row saying `answered: true` counts - a failed invoke, a row without the field, or a line that is not a JSON object
    does not."""
    path = path or RUNLOG
    out = set()
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(row, dict) or not row.get("message_id") or row.get("answered") is not True:
                    continue
                try:
                    out.add(int(row["message_id"]))
                except (TypeError, ValueError):
                    continue
    except OSError:
        pass
    return out


def window_start(floor, now_ts, max_age_s=RECOVER_MAX_AGE_S):
    """The recovery window's start as epoch seconds - max(floor, now - 24 h) - or None when there is no floor."""
    if floor is None:
        return None
    return max(floor, now_ts - max_age_s)


def recoverable(msgs, floor, handled, now_ts, max_age_s=RECOVER_MAX_AGE_S):
    """Pure: from [(message_id, created_epoch)] oldest first, the ids to re-feed - inside the window, not answered."""
    start = window_start(floor, now_ts, max_age_s)
    if start is None:
        return []
    return [mid for mid, created in msgs if created > start and mid not in handled]


def reviewer_role(state_path=CREW_STATE):
    """Return ((mode, generation), prompt) from the root-owned live crew state."""
    try:
        with open(state_path, encoding="utf-8") as fh:
            state = json.load(fh)
        mode = str(state.get("mode", "")).strip().lower()
        generation = state.get("mode_generation")
        if type(generation) is not int or generation < 0:
            raise ValueError("mode_generation must be a non-negative integer")
    except Exception as exc:
        return ("unknown", None), (
            "CURRENT CREW MODE: UNKNOWN. The trusted crew-switch state could not be trusted "
            "(%s: %s). Refuse routine workflow reviews and report this exact failure; do "
            "not guess which reviewer is on duty." % (type(exc).__name__, exc)
        )
    if mode == "codex":
        return (mode, generation), (
            "CURRENT CREW MODE: CODEX (generation %d). You replace Langston as the on-duty reviewer for "
            "this shift. Perform routine scope, pre-audit, code-diff, staging-verification, "
            "iteration, and completion reviews when addressed; Langston is off duty." % generation
        )
    if mode == "claude":
        return (mode, generation), (
            "CURRENT CREW MODE: CLAUDE (generation %d). Langston is the on-duty routine reviewer. "
            "You are an additional advisor only when addressed and do not replace his workflow gates."
            % generation
        )
    return ("unknown", generation), (
        "CURRENT CREW MODE: UNKNOWN. The trusted crew-switch state contains unsupported "
        "mode %r. Refuse routine workflow reviews and report this exact failure; do not "
        "guess which reviewer is on duty." % mode
    )


def reviewer_mode_transition(invocation_identity, state_path=CREW_STATE):
    """Compare mode and monotonic generation immediately before publication."""
    publish_identity, _ = reviewer_role(state_path)
    return publish_identity != invocation_identity, publish_identity


def _identity_text(identity):
    mode, generation = identity
    suffix = "" if generation is None else " generation " + str(generation)
    return mode.upper() + suffix


def response_after_mode_check(invocation_identity, response, recipient, state_path=CREW_STATE):
    """Discard a generated response when its reviewer authority changed while it ran."""
    changed, publish_identity = reviewer_mode_transition(invocation_identity, state_path)
    if not changed:
        return False, response
    return True, (
        recipient + " — Coltrane discarded the response because reviewer authority changed from "
        + _identity_text(invocation_identity) + " to " + _identity_text(publish_identity)
        + " while it was running. Re-send the request if it is still needed."
    )


def invoke(message_text, why, history, role_prompt):
    """Run codex as the coltrane user. ⛔ Prompt on STDIN, never argv."""
    prompt = (
        "You have been addressed on Discord." + NL
        + "Reason you were woken: " + why + "." + NL + NL
        + role_prompt + NL
        + "⛔ Follow your AGENTS.md. The trusted current-mode line above decides whether "
        + "you or Langston owns routine review for this invocation." + NL
        + "⛔ Reply with the MESSAGE TEXT ONLY. It is posted verbatim." + NL
        + "⛔ LEAD your reply with the NAME of whoever you are answering so their session "
        + "wakes. Answering Langston? His name must be the FIRST WORD." + NL
        + "✅ Nothing worth saying? Reply with exactly: SILENT" + NL + NL
        + "--- recent context (oldest first) ---" + NL + history + NL + NL
        + "--- the message that woke you ---" + NL + message_text + NL
    )
    # ⛔ 0600 + unpredictable name, never a fixed-shape path chmod-ed 644: root opens it and
    #    passes it as stdin, so no other account needs to read it (B-LANGSTON-CONTEXT §20.6, 3(c)).
    fd, p = tempfile.mkstemp(prefix="coltrane-prompt-", suffix=".md", dir="/tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(prompt)
    try:
        with open(p, encoding="utf-8") as fh:
            r = subprocess.run(
                ["sudo", "-u", USER, "env", "HOME=" + HOME, "sh", "-c",
                 "cd " + WORKDIR + " && codex exec --skip-git-repo-check "
                 + SANDBOX + " -"],
                stdin=fh, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=900)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "")
    finally:
        try:
            os.unlink(p)
        except OSError:
            pass


def chunks(text, n=1900):
    """Discord caps a message at 2000 characters. Split on line boundaries so a
    `path:line`, a sha or a URL is never cut in half — this project has been bitten
    by exactly that in the Langston dispatch path."""
    out, cur = [], ""
    for line in text.split(NL):
        if len(cur) + len(line) + 1 > n:
            if cur:
                out.append(cur)
            while len(line) > n:            # a single unbreakable long line
                out.append(line[:n])
                line = line[n:]
            cur = line
        else:
            cur = (cur + NL + line) if cur else line
    if cur:
        out.append(cur)
    return out or [text[:n]]


class Coltrane(discord.Client):
    _inflight = set()
    _recovering = False

    async def on_ready(self):
        log({"ts": utc(), "event": "bot online", "as": str(self.user),
             "id": self.user.id})
        print("Coltrane online as", self.user, flush=True)
        await self.recover()

    async def recover(self):
        """Re-feed channel posts missed while the process was down (see the restart-recovery block above)."""
        if self._recovering:     # a re-IDENTIFY's second on_ready while a pass runs: SKIP, never queue a second pass
            log({"ts": utc(), "event": "recovery skipped", "reason": "a pass is already running"})
            return
        self._recovering = True
        scanned = fed = failed = 0
        try:
            now = time.time()
            floor = ensure_floor(now)
            ch_id = env(COMMS_FILE, "DISCORD_CHANNEL_ID")
            if floor is None or not ch_id:
                log({"ts": utc(), "event": "recovery skipped", "floor": floor, "channel": bool(ch_id)})
                return
            start = window_start(floor, now)
            ch = self.get_channel(int(ch_id)) or await self.fetch_channel(int(ch_id))
            msgs = [x async for x in ch.history(limit=None, after=datetime.fromtimestamp(start, timezone.utc),
                                                oldest_first=True)]
            scanned = len(msgs)
            by_id = {x.id: x for x in msgs}
            for mid in recoverable([(x.id, x.created_at.timestamp()) for x in msgs], floor, handled_ids(), now):
                if mid in handled_ids():     # FEED-time re-check: answered since the snapshot (another pass/process)
                    continue
                try:
                    await self.on_message(by_id[mid], _recovered=True)
                    fed += 1
                except Exception as e:       # one bad post never aborts the rest of the queue
                    failed += 1
                    log({"ts": utc(), "event": "recovery feed FAILED", "message_id": mid,
                         "error": "%s: %s" % (type(e).__name__, e)})
            log({"ts": utc(), "event": "recovery done", "scanned": scanned, "fed": fed, "failed": failed})
        except Exception as e:
            log({"ts": utc(), "event": "recovery FAILED", "scanned": scanned, "fed": fed,
                 "error": "%s: %s" % (type(e).__name__, e)})
        finally:
            self._recovering = False

    async def on_message(self, m, _recovered=False):
        # ⛔ BRAKE 1 — self. The only unbounded loop.
        if m.author.id == self.user.id:
            return
        text = (m.content or "").strip()
        if not text:
            return
        who = str(m.author.display_name or m.author.name)
        # ⛔ BRAKE 2 — automated notices, matched by NAME so Langston still gets through.
        if who.strip().lower() in MUTE_SENDERS:
            return

        is_dm = isinstance(m.channel, discord.DMChannel)
        why = engage_reason(text, m.author.id, who, is_dm)
        if why is None:
            return
        # a post already being handled (live arrival racing the recovery pass) is never invoked twice
        if m.id in self._inflight:
            return
        self._inflight.add(m.id)
        try:
            await self._handle(m, text, who, is_dm, why, _recovered)
        finally:
            self._inflight.discard(m.id)

    async def _handle(self, m, text, who, is_dm, why, _recovered):
        if _recovered:          # say so: the channel may have moved on since it was posted
            why += " (re-fed after a restart: it was posted at %s while Coltrane was down)" % m.created_at.isoformat()[:19]

        history = ""
        if not is_dm:
            try:
                msgs = [x async for x in m.channel.history(limit=25)]
                msgs.reverse()
                buf, used = [], 0
                for x in msgs:
                    piece = "[%s] %s: %s" % (str(x.created_at)[:19],
                                             x.author.display_name, (x.content or "")[:600])
                    if used + len(piece) > PROMPT_MAX:
                        break
                    buf.append(piece)
                    used += len(piece)
                history = NL.join(buf)
            except Exception:
                history = ""

        invocation_identity, role_prompt = reviewer_role()
        async with m.channel.typing():
            t0 = time.time()
            rc, out, err = await asyncio.to_thread(invoke, text, why, history, role_prompt)

        role_changed, out = response_after_mode_check(invocation_identity, out, who)
        if role_changed:
            rc = 0

        toks = ""
        mt = re.search(r"tokens used[\s:]*([\d,]+)", err)
        if mt:
            toks = mt.group(1)

        posted, silent, mirrored = None, (out.strip().upper() == "SILENT" if out else False), None
        if rc == 0 and out and not silent:
            try:
                for part in chunks(out):
                    await m.channel.send(part)
                posted = "ok (%d part(s))" % len(chunks(out))
                mirrored = mirror_to_inbox(out, m.channel.id, is_dm)
            except Exception as e:
                posted = "SEND FAILED: %s: %s" % (type(e).__name__, e)
                mirrored = "not attempted (send failed)"
        elif rc != 0:
            posted = "invoke failed rc=%d" % rc

        # `answered` is what restart recovery keys on: true only when the reply was POSTED, or the invoke SUCCEEDED and
        # the model chose SILENT. A failed invoke (even one whose stdout reads SILENT - Langston r2, measured), a failed
        # send or an empty reply is `false`, so it is retried at the next ready.
        answered = bool((rc == 0 and silent) or (posted or "").startswith("ok "))
        log({"ts": utc(), "why": why, "dm": is_dm, "rc": rc, "message_id": m.id, "recovered": _recovered,
             "answered": answered,
             "seconds": round(time.time() - t0, 1), "tokens_used": toks,
             "silent": silent, "posted": posted, "mirrored": mirrored, "woken_by": who,
             "measures": ("one row per wake that led to an invoke; token count is the "
                          "spend surface, and nothing here is rate-limited by design")})


def main():
    token = env(TOKEN_FILE, "DISCORD_COLTRANE_BOT_TOKEN")
    if not token:
        print("no token at " + TOKEN_FILE, file=sys.stderr)
        return 2
    intents = discord.Intents.default()
    intents.message_content = True      # matches the portal toggle; without it, content is blank
    intents.dm_messages = True
    Coltrane(intents=intents).run(token, log_handler=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
