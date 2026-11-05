"""langston_memory_allowlist - THE AUTHORITY on what Langston's account may ask the root memory service to run
(B-LANGSTON-MEMORY-WRITE-FENCE A5, design D1). The service never forwards whatever is spooled: a request is parsed from
the bytes the service read ONCE, checked here, and only the argv this module RETURNS is executed.

Kept under 150 lines on Langston's condition - D1 beats D2 only if this file reviews in one sitting.

The shapes are his own 173 calls (pre-audit §0): part-ledger-append / ledger-file-append (one argv shape - the writer
picks by whether LEDGER.md exists), part-whole-file / whole-file (likewise), and compose. Everything else REFUSES:
--trim, --split-ledger, --rename-part, --to (root-only maintenance), --self-test (root-only), and --allow-growth
(r2, RULED DROPPED: a party bound by a ratchet who can lift it on his own word is not bound). --by is never taken
from the request: the service sets it to FORCED_BY.
"""
import base64, binascii, json, os, re, stat

MAX_REQUEST_BYTES = 2 * 1024 * 1024     # the spooled file, as read
MAX_STDIN_BYTES = 1024 * 1024           # his part is ~140 KB against a ~144 KB loaded-set ceiling
MAX_ARGS = 24
MAX_TEXT = 1000                         # --reason / --by, in characters
FORCED_BY = "langston"

SHA = re.compile(r"[0-9a-fA-F]{64}")
INT = re.compile(r"-?[0-9]{1,6}")
POSITIVE = re.compile(r"[1-9][0-9]{0,5}")

# flag -> the kind of value it takes (None = a switch)
FLAGS = {"--expect-sha": "sha", "--ledger-delta": "int", "--retractions-delta": "int", "--entries": "positive",
         "--reason": "text", "--by": "text", "--part": "part", "--ledger-append": None, "--compose": None}

# shape -> (required, optional). ⛔ STRUCK (Langston Step-4 C-2): --dry-run (the writer accepts it only with --trim,
# which is root-only, so it could only ever return exit 2 - a line that reads as a capability and is one coupling change
# from becoming one nobody re-reviewed), and --part on "append" (after the ledger split the append writes LEDGER.md
# and ignores --part, which parse_args does not refuse: an ignored flag answered exit 0).
SHAPES = {
    "append": ({"--expect-sha", "--ledger-append", "--entries", "--reason"}, {"--by"}),
    "whole": ({"--expect-sha", "--ledger-delta", "--retractions-delta", "--reason"}, {"--part", "--by"}),
    "compose": ({"--compose", "--reason"}, {"--by"}),
}


class Refusal(Exception):
    pass


def parse_request(data, rid):
    """(argv, stdin bytes) from the bytes the service read, or Refusal. The request's own id must equal its file's."""
    if len(data) > MAX_REQUEST_BYTES:
        raise Refusal("the request is too large (%d B; the limit is %d B)" % (len(data), MAX_REQUEST_BYTES))
    try:
        req = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise Refusal("the request is not JSON")
    if not isinstance(req, dict) or set(req) != {"v", "id", "argv", "stdin_b64"} or req["v"] != 1:
        raise Refusal("the request does not have the version-1 shape {v, id, argv, stdin_b64}")
    if req["id"] != rid:
        raise Refusal("the request's id does not match its file name")
    argv = req["argv"]
    if not isinstance(argv, list) or len(argv) > MAX_ARGS or not all(isinstance(a, str) for a in argv):
        raise Refusal("argv must be a list of at most %d strings" % MAX_ARGS)
    if not isinstance(req["stdin_b64"], str):
        raise Refusal("stdin_b64 must be a string")
    try:
        stdin = base64.b64decode(req["stdin_b64"], validate=True)
    except (binascii.Error, ValueError):
        raise Refusal("stdin_b64 is not base64")
    if len(stdin) > MAX_STDIN_BYTES:
        raise Refusal("stdin is too large (%d B; the limit is %d B)" % (len(stdin), MAX_STDIN_BYTES))
    return argv, stdin


def check_value(flag, kind, value, parts_dir):
    if "\x00" in value:
        raise Refusal("%s carries a NUL byte" % flag)
    if kind == "sha" and not SHA.fullmatch(value):
        raise Refusal("%s must be 64 hex characters (a part is never created through this service)" % flag)
    if kind == "int" and not INT.fullmatch(value):
        raise Refusal("%s must be an integer" % flag)
    if kind == "positive" and not POSITIVE.fullmatch(value):
        raise Refusal("%s must be a positive integer" % flag)
    if kind == "text" and len(value) > MAX_TEXT:
        raise Refusal("%s is longer than %d characters" % (flag, MAX_TEXT))
    if kind == "part":
        if not value or value != os.path.basename(value) or value.startswith(".") or "/" in value:
            raise Refusal("--part must be a bare part file name - no path, no leading '.'")
        try:
            st = os.lstat(os.path.join(parts_dir, value))
        except OSError:
            raise Refusal("--part %r names no existing part" % value)
        if not stat.S_ISREG(st.st_mode):
            raise Refusal("--part %r is not a regular file (a link or a directory)" % value)


def validate(argv, stdin, parts_dir):
    """(shape, the argv to execute). The executed argv is built HERE from the checked tokens, with --by forced."""
    seen, order, i = {}, [], 0
    while i < len(argv):
        flag = argv[i]
        if flag not in FLAGS:
            raise Refusal("%r is not allowed through this service (allowed: %s)" % (flag, ", ".join(sorted(FLAGS))))
        if flag in seen:
            raise Refusal("%s is given twice" % flag)
        kind = FLAGS[flag]
        if kind is None:
            seen[flag] = True
            i += 1
        else:
            if i + 1 >= len(argv):
                raise Refusal("%s needs a value" % flag)
            check_value(flag, kind, argv[i + 1], parts_dir)
            seen[flag] = argv[i + 1]
            i += 2
        order.append(flag)
    present = set(seen)
    shape = next((n for n, (req, opt) in SHAPES.items() if req <= present <= req | opt), None)
    if shape is None:
        raise Refusal("these flags (%s) are none of the shapes allowed: an append (--ledger-append --entries N), a "
                      "whole-part write (--ledger-delta --retractions-delta), or --compose - each with --reason, and "
                      "--expect-sha unless --compose" % " ".join(order))
    if shape == "compose" and stdin:
        raise Refusal("--compose takes no stdin")
    out = []
    for flag in order:
        if flag == "--by":
            continue
        out += [flag] if seen[flag] is True else [flag, seen[flag]]
    return shape, out + ["--by", FORCED_BY]
