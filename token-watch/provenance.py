"""
token-watch — THE PROVENANCE STORE. Append-only, separate from the census.

★★ THIS IS THE PRIMARY CONTROL ON THE ACCEPT PATH, NOT A BACKSTOP — and it was
   promoted there by a measurement, not by caution.

   Langston asked for it while we both still believed the provider signed its
   payloads: *"Secret prevents; provenance recovers. I want both, and I'd
   rather have the second than the first if I could only have one."*

   Then the documentation settled what the provider actually sends: a STATIC
   `authHeader` VALUE that we choose and it echoes back. There is no digest and
   NOTHING IS COMPUTED OVER THE BODY. So the secret is:

     - REPLAYABLE — anyone who captures one valid request can repeat it for as
       long as the secret lives.
     - BLIND TO CONTENT — a valid header attests the sender knew a string. It
       attests NOTHING about what the body says.

   ⇒ the secret cannot tell a real launch from a forged one. THE RAW STORE CAN,
     after the fact, because it keeps what arrived and where it came from. That
     is the difference between "we were compromised, the census is worthless"
     and "we were compromised between these two timestamps from this source,
     and here are the rows to exclude." §4 makes census loss irreversible; this
     is what makes a POISONING recoverable instead.

⛔ SEPARATE FROM THE CENSUS ROWS, DELIBERATELY. If the raw bodies lived in the
   census the poisoning would be inside the thing we needed to audit. The whole
   point is a second, independent record to reconcile the first against.

⚠️ SIZE, STATED RATHER THAN DISCOVERED LATER: at ~20,700/day and an
   unmeasured body size (enhanced transaction payloads are verbose — plausibly
   1-5 KB), this store plausibly reaches 2-14 GB over 90 days. THAT SPANS THE
   8 GiB store cap, so the projection is not decorative. The body size is
   MEASURED in the proving run (`bytes_written` below is cumulative and
   reported), and the cap is the backstop that fires before the disk does.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone

from config import ROOT

UTC = timezone.utc
LOG = logging.getLogger("token-watch.provenance")

PROVENANCE_DIR = f"{ROOT}/provenance"
RAW_DIR = f"{PROVENANCE_DIR}/raw"
REJECTED_PATH = f"{PROVENANCE_DIR}/rejected.jsonl"

# The env var the unit sets. Kept as a name here so the unit and the code
# cannot drift apart silently.
SECRET_ENV = "TOKEN_WATCH_WEBHOOK_SECRET"


def _now() -> datetime:
    return datetime.now(UTC)


def secret() -> str | None:
    """The shared secret, or None if it is not configured.

    ⛔ RETURNS None RATHER THAN "" — the caller must be able to tell
       "not configured" from "configured as empty", because those get
       different answers and collapsing them is how a fail-open appears.
    """
    val = os.environ.get(SECRET_ENV)
    if val is None:
        return None
    val = val.strip()
    return val or None


def authorized(supplied: str | None) -> tuple[bool, str]:
    """Constant-time comparison against the configured secret.

    Returns (ok, reason). The reason is for the audit record, never for the
    response body — telling a caller WHY it failed is telling an attacker
    which half to fix.

    ⛔⛔ FAILS CLOSED WHEN THE SECRET IS ABSENT. Langston's hard condition, and
       he named the exact anti-pattern: never `if (!SECRET) skip`. A missing
       secret is a MISCONFIGURED service, and a misconfigured service that
       accepts everything is worse than one that accepts nothing — the first
       silently poisons a 90-day census, the second is noticed in minutes.

    ⚠️ `hmac.compare_digest` here is TIMING-SAFE COMPARISON, NOT an HMAC. The
       provider computes no digest. Using the function for its constant-time
       property is correct; calling what it protects "HMAC verification" was my
       error and it is not repeated in this file.
    """
    want = secret()
    if want is None:
        return False, "no_secret_configured"
    if not supplied:
        return False, "no_credential_presented"
    if hmac.compare_digest(supplied, want):
        return True, "ok"
    return False, "credential_mismatch"


def _raw_path(when: datetime) -> str:
    return f"{RAW_DIR}/{when.strftime('%Y-%m-%d')}.jsonl"


def record_accepted(raw_body: bytes, remote: str, when: datetime = None) -> dict:
    """Persist one accepted delivery, exactly as it arrived.

    ★ THE BODY IS STORED VERBATIM, not the parsed result. A parser that is
      wrong today is wrong in the census AND in a parsed provenance copy — the
      two would agree with each other and both be wrong. Keeping the bytes
      means the census can be REBUILT if the parser turns out to be defective,
      which is a different failure from poisoning and this store covers both.
    """
    when = when or _now()
    os.makedirs(RAW_DIR, exist_ok=True)
    rec = {
        "received_at": when.isoformat(),
        "remote": remote,
        "bytes": len(raw_body),
        "sha256": hashlib.sha256(raw_body).hexdigest(),
        "body": raw_body.decode("utf-8", errors="replace"),
    }
    path = _raw_path(when)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    return rec


def record_rejected(reason: str, remote: str, body_len: int,
                    body_sha: str | None = None, when: datetime = None) -> dict:
    """Audit one REJECTED delivery. Langston's negative control.

    ⛔ METADATA AND A HASH — NEVER THE BODY. Storing rejected bodies would hand
       an unauthenticated caller a write primitive against our disk, which is
       the flood direction the dead-man's switch cannot see. The rejection must
       be auditable without being an amplifier.

    ★ AND A REJECTION IS EVIDENCE, NOT NOISE: a rising rate of
      `credential_mismatch` from one source is somebody guessing, and it is the
      only warning we would get before a successful guess.
    """
    when = when or _now()
    os.makedirs(PROVENANCE_DIR, exist_ok=True)
    rec = {
        "rejected_at": when.isoformat(),
        "reason": reason,
        "remote": remote,
        "bytes": body_len,
        "sha256": body_sha,
    }
    with open(REJECTED_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    LOG.warning("webhook REJECTED (%s) from %s — %d bytes", reason, remote, body_len)
    return rec


def stats() -> dict:
    """Cumulative counts, so the size projection above becomes a measurement."""
    accepted = bytes_written = 0
    if os.path.isdir(RAW_DIR):
        for name in os.listdir(RAW_DIR):
            path = os.path.join(RAW_DIR, name)
            try:
                bytes_written += os.path.getsize(path)
                with open(path, encoding="utf-8") as fh:
                    accepted += sum(1 for line in fh if line.strip())
            except OSError:
                continue
    rejected = 0
    if os.path.exists(REJECTED_PATH):
        try:
            with open(REJECTED_PATH, encoding="utf-8") as fh:
                rejected = sum(1 for line in fh if line.strip())
        except OSError:
            pass
    mean = round(bytes_written / accepted, 1) if accepted else None
    return {"accepted": accepted, "rejected": rejected,
            "bytes_written": bytes_written, "mean_body_bytes": mean}
