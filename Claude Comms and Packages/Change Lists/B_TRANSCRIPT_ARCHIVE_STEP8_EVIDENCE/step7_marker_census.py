"""Read-only complete-marker census over the live archive for Step-8 review."""
from collections import Counter
import os
import re
import sys

BIN = r"C:\Users\kyleg\.claude\transcript-archive-bin"
ROOT = r"C:\Users\kyleg\.claude\transcript-archive"
sys.path.insert(0, BIN)

import dt_archive as archive
import dt_transcript as transcript

VALUE_NAMES = {
    "ALCHEMY_API_KEY", "B2_APPLICATION_KEY", "B2_COLD_KEY#1", "B2_COLD_KEY#2",
    "CC_WEBHOOK_URL#1", "CLAUDE_CODE_OAUTH_TOKEN", "CODEX_REFRESH_TOKEN",
    "COINGECKO_API_KEY", "DATABASE_URL#1", "DATABASE_URL#2", "DISCORD_BOT_TOKEN",
    "DISCORD_COLTRANE_BOT_TOKEN", "FINNHUB_API_KEY", "FRED_API_KEY", "GH_BOARD_TOKEN",
    "GH_TOKEN", "HELIUS_API_KEY", "INTERNAL_SERVICE_KEY", "JWT_REFRESH_SECRET",
    "JWT_SECRET", "KRAKEN_API_KEY", "KRAKEN_API_SECRET", "OPENAI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_BOT_TOKEN#1", "TOKEN_WATCH_WEBHOOK_SECRET",
}
expected = ({kind for kind, _rx in transcript.SHAPES} | {"base64-image"} |
            {"named:" + name for name in transcript.SECRET_NAMES} |
            {"value:" + name for name in VALUE_NAMES})
marker = re.compile(r"\[REDACTED ([^\]\r\n]+)\]")


def fail_walk(error):
    raise error


files = []
for alias in sorted(set(archive.SLUG_ALIAS.values()) | set(archive.GATED.values())):
    base = os.path.join(ROOT, alias)
    if not os.path.isdir(base):
        continue
    for directory, dirs, names in os.walk(base, onerror=fail_walk):
        dirs[:] = [name for name in dirs if name.lower() != "sample"]
        for name in names:
            if name.endswith(".md"):
                files.append(os.path.join(directory, name))
index_path = os.path.join(ROOT, "INDEX.md")
if os.path.isfile(index_path):
    files.append(index_path)

counts = Counter()
unknown = Counter()
for path in files:
    with open(path, encoding="utf-8") as handle:
        for kind in marker.findall(handle.read()):
            (counts if kind in expected else unknown)[kind] += 1

control = Counter(marker.findall("\n".join("[REDACTED %s]" % kind for kind in sorted(expected))))
control_ok = set(control) == expected and all(value == 1 for value in control.values())
print("archive markdown files (sample excluded): %d" % len(files))
print("expected complete marker kinds: %d" % len(expected))
print("positive control recovered exactly once: %d of %d; ok=%s" %
      (sum(1 for kind in expected if control[kind] == 1), len(expected), control_ok))
print("recognised complete marker strings: %d" % sum(counts.values()))
print("unrecognised complete marker strings: %d" % sum(unknown.values()))
for kind in sorted(expected):
    print("%s %d" % (kind, counts[kind]))
for kind, value in sorted(unknown.items()):
    print("EXCLUDED %s %d" % (kind, value))

if len(expected) != 64 or not control_ok:
    raise SystemExit(1)
