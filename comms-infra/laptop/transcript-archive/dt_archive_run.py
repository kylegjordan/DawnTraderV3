#!/usr/bin/env python3
"""dt_archive_run — B-TRANSCRIPT-ARCHIVE P7: ONE archive run, the thing every trigger calls (nightly task, PreCompact
hook, the restart handoff). It owns the key handoff P3(c) promised and the stale-lock alarm Langston asked P7 for.

    python3 -I dt_archive_run.py [--projects DIR] [--root DIR] [--shared DIR] [--dry-run]

1. A THROWAWAY HMAC key per run (os.urandom(32)), in memory only - never written, never in argv.
2. The fingerprint producer streamed to each machine as a COPY with RUN_KEY_HEX set (ssh stdin; the laptop in-process
   via a pipe): staging, Helsinki, the laptop - the per-machine arguments of the P3(c) table. EVERY machine must answer;
   one that cannot -> the run REFUSES (exit 3): a partial fingerprint set would read as full coverage.
3. dt_archive.archive_all with the redactor built from those fingerprints; then dt_index.build.
4. A LOUD RESULT: exit 0 clean · 3 fingerprints incomplete · 4 a name collision (C-5) · 5 a file refused (a held lock, a
   shorter-than-committed file) · 6 a LOCK OLDER THAN ONE INTERVAL (25 h) - a run that died and left it; the writer
   never breaks a lock, so a human must: read the pid and stamp inside, confirm no run is alive, then delete it ·
   7 a session folder PRESENT but holding NO conversations (a moved or emptied folder, never a quiet zero).
   The last line printed is always one of: `ARCHIVE RUN OK`, `ARCHIVE RUN FAILED — <why>`.
5. OPERATOR NOTE (Langston P5 r2 obs 2): if the projects folder MOVES or is re-junctioned, every raw file's identity
   changes and EVERY file is refused (`state ... belongs to <old>, not <new>`, exit 5). Do NOT delete or empty `.state`:
   that restarts every file from offset 0 and appends the whole history again. Recovery is to confirm the bytes are the
   same files (sha256 of old path vs new) and re-point each state's `raw` to the new identity; no tool exists for it
   yet, because it has not happened - build it the first time it does, under review.
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive as da  # noqa: E402
import dt_index as di  # noqa: E402
import dt_transcript as dt  # noqa: E402

LOCK_MAX_S = 25 * 3600
HOME = os.path.expanduser("~")
MACHINES = {
    "staging": ("root@188.245.193.8", [
        "--env", "/home/deploy/dawntrader/.env", "--env", "/etc/token-watch/alchemy.env",
        "--env", "/etc/token-watch/helius.env", "--env", "/etc/token-watch/webhook.env",
        "--names", "DATABASE_URL,JWT_SECRET,JWT_REFRESH_SECRET,INTERNAL_SERVICE_KEY,OPENAI_API_KEY,KRAKEN_API_KEY,"
                   "KRAKEN_API_SECRET,COINGECKO_API_KEY,SUPABASE_SERVICE_ROLE_KEY,B2_APPLICATION_KEY,FINNHUB_API_KEY,"
                   "FRED_API_KEY,ALCHEMY_API_KEY,HELIUS_API_KEY,TOKEN_WATCH_WEBHOOK_SECRET",
        "--file", "B2_COLD_KEY=/etc/token-watch/b2-cold.key"]),
    "helsinki": ("root@204.168.141.77", [
        "--env", "/etc/langston/oauth.env", "--env", "/etc/langston/ccdt-bot.env", "--env", "/etc/langston/telegram-bot.env",
        "--env", "/etc/langston/discord-cc-bot.env", "--env", "/etc/langston/discord-langston-bot.env",
        "--env", "/etc/langston/github-board.env", "--env", "/etc/coltrane/discord-coltrane-bot.env",
        "--env", "/etc/dawntrader/discord-comms.env",
        "--names", "CLAUDE_CODE_OAUTH_TOKEN,TELEGRAM_BOT_TOKEN,DISCORD_BOT_TOKEN,GH_TOKEN,DISCORD_COLTRANE_BOT_TOKEN,CC_WEBHOOK_URL",
        "--json", "CODEX_REFRESH_TOKEN=/home/coltrane/.codex/auth.json:tokens.refresh_token"]),
    "laptop": (None, ["--file", "ALCHEMY_KEY_FILE=" + os.path.join(HOME, ".claude", ".alchemy-key"),
                      "--file", "HELIUS_KEY_FILE=" + os.path.join(HOME, ".claude", ".helius-key"),
                      "--file", "GH_BOARD_TOKEN=" + os.path.join(HOME, ".claude", ".gh-board-token")]),
}


def keyed_copy(key):
    src = open(os.path.join(HERE, "dt_secret_hashes.py"), "rb").read()
    if src.count(b'RUN_KEY_HEX = ""') != 1:
        raise RuntimeError("the producer has no single empty RUN_KEY_HEX line to set")
    return src.replace(b'RUN_KEY_HEX = ""', b'RUN_KEY_HEX = "' + key.hex().encode() + b'"')


def run_machine(host, args, copy):
    cmd = ([sys.executable, "-I", "-"] + args) if host is None else \
        ["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", host, "python3 -I - " + " ".join(args)]
    p = subprocess.run(cmd, input=copy, capture_output=True, timeout=180)
    if p.returncode != 0:
        raise RuntimeError("exit %d" % p.returncode)
    return json.loads(p.stdout.decode("utf-8"))


def fingerprints(key, machines=None, runner=run_machine):
    copy = keyed_copy(key)
    out, failed = [], []
    for name, (host, args) in (machines or MACHINES).items():
        try:
            out += runner(host, args, copy)
        except Exception as e:        # noqa: BLE001 - one missing machine refuses the run; never a partial set
            failed.append("%s (%s)" % (name, type(e).__name__ if not str(e) else str(e)[:80]))
    return out, failed


def old_locks(root, now):
    hits = []
    for dirpath, _d, files in os.walk(os.path.join(root, ".state")):
        for f in files:
            if f.endswith(".lock"):
                p = os.path.join(dirpath, f)
                if now - os.path.getmtime(p) > LOCK_MAX_S:
                    hits.append(p)
    return hits


def run(projects, root, shared, dry=False, now=None, machines=None, runner=run_machine):
    """Returns (exit_code, last_line). Never raises for an expected failure."""
    now = time.time() if now is None else now
    stale = old_locks(root, now)
    if stale:
        return 6, ("ARCHIVE RUN FAILED — %d lock(s) older than %d h: %s - a run died and left it; confirm no run is "
                   "alive (pid and stamp are inside), then delete it" % (len(stale), LOCK_MAX_S // 3600, ", ".join(stale)))
    # A session folder that is PRESENT but yields ZERO raw files is loud, never a silent empty (Langston P5 r3 §13 item,
    # folded here because the unattended nightly run is where it earns its keep; the real dry run measured all five
    # non-empty, 1,090 files). Read failures inside raw_files already refuse (exit 4).
    try:
        rfs = da.raw_files(projects)
    except da.Refused as e:
        return 4, "ARCHIVE RUN FAILED — %s" % e
    empty = [slug for slug, alias in sorted(da.SLUG_ALIAS.items())
             if os.path.isdir(os.path.join(projects, slug)) and not any(r[0] == alias for r in rfs)]
    if empty:
        return 7, "ARCHIVE RUN FAILED — session folder(s) present but holding no conversations: %s" % ", ".join(empty)
    key = os.urandom(32)
    try:
        hs, failed = fingerprints(key, machines, runner)
        if failed:
            return 3, "ARCHIVE RUN FAILED — fingerprints incomplete, nothing archived: " + "; ".join(failed)
        red = dt.Redactor(hs, key=key)
        if red.layer_c_wrong_key or red.layer_c_malformed or not red.layer_c_names:
            return 3, ("ARCHIVE RUN FAILED — fingerprints unusable (wrong key %d, malformed %d, loaded %d)"
                       % (red.layer_c_wrong_key, red.layer_c_malformed, red.layer_c_names))
        try:
            results, refused = da.archive_all(root, projects, red, dry=dry)
        except da.Refused as e:
            return 4, "ARCHIVE RUN FAILED — %s" % e
        if refused:
            return 5, "ARCHIVE RUN FAILED — %d file(s) refused: %s" % (len(refused), "; ".join(refused)[:400])
        if not dry:
            di.build(root, shared)
        n = sum(r["lines"] for r in results)
        return 0, "ARCHIVE RUN OK — %d raw files, %d lines%s, layer (c) %d values" % (len(results), n, " (dry run)" if dry else "",
                                                                                   red.layer_c_names)
    finally:
        del key


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    opts, it = {}, iter(argv[1:])
    for a in it:
        if a in ("--projects", "--root", "--shared"):
            v = next(it, None)
            if v is None or v.startswith("--"):
                print("ARCHIVE RUN FAILED — %s needs a value" % a)
                return 2
            opts[a] = v
        elif a == "--dry-run":
            opts[a] = True
        else:
            print("ARCHIVE RUN FAILED — unknown argument at position %d" % argv.index(a))
            return 2
    projects = opts.get("--projects") or os.path.join(HOME, ".claude", "projects")
    root = opts.get("--root") or os.path.join(HOME, ".claude", "transcript-archive")
    shared = opts.get("--shared") or os.path.join(HOME, ".claude", "projects", "DT-SHARED-MEMORY")
    code, line = run(projects, root, shared, dry=bool(opts.get("--dry-run")))
    print(line)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
