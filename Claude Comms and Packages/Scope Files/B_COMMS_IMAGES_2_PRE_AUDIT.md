# B-COMMS-IMAGES-2 — pre-audit

> ⚠ **FILED RETROACTIVELY 2026-08-07, labelled not back-dated** (companion to the scope, same
> checker sweep: alert `e0adbf8c`). `pre_audit` is REQUIRED for `non_architecture`
> (`config.mjs:131`), and it was missing. As with the scope: the **analysis below was actually
> performed before implementation** — the full read of the filter, the reader census, the blast
> radius, and the log measurement all preceded and shaped the code, and Langston reviewed the
> design at invocation #10 before anything was installed. What was skipped is the ARTIFACT.
> Nothing here is reconstructed from memory; every claim is re-verifiable at the ref or on the
> box, and the two items I did NOT check beforehand are named as such at the end.

## Component census (§9.5(a): writers / readers / mutators / deleters / schedulers)
**`cc-wake-filter.py`** — the single wake path for all three desktop sessions.
- **Readers of its output:** each session's Monitor (one stdout line = one wake event).
- **Writers of its input:** `discord-cc-bridge.py` (Kyle-authored rows), `discord-langston-bridge.py`
  (its own `langston_*` mirrors), and `cc-send` (`cc_outbound` rows).
- **Invoked as:** `tail -F … | python cc-wake-filter.py <ALIAS>` inside a session's Monitor.
  ★ **Therefore a running Monitor holds the OLD code**: the change is inert for a session until
  it re-arms. This is the single most important operational consequence and it drove the
  announcement wording.
- **Mutators/deleters/schedulers:** none — it is a pure stream filter with no state and no writes.
**`dt-media-get` / `dt-media-post`** — new, no existing callers, invoked by hand by a session.
**Deleters over the media dir:** only `cc-discord-media-prune` (B-COMMS-IMAGES), unchanged here.

## State written vs read (§9.5(a-ii))
No writer is removed. The new consumers read two OPTIONAL fields (`media_paths`,
`media_failed`) whose producers shipped in B-COMMS-IMAGES; no reader loses a writer.
`dt-media-post` adds files into the existing media dir — already governed by the existing prune.

## Blast radius, and why the mitigations are what they are
Breaking this filter stops every wake for every session **with no error** — the failure is
silence, which is the worst shape. Hence: `media_suffix()` fails OPEN (any exception returns
empty, so a wake line is never lost to a media bug); it rides events that ALREADY wake rather
than adding routing; offline fixtures ran before install; a dated backup was taken; and the
install gate re-ran both fixtures against the INSTALLED file, not the repo copy.

## Measurement performed before deciding (not assumed)
- **Repo-vs-live drift:** the only versioned copy of the filter sat in `comms-infra/telegram-reference/`
  and was **three weeks stale**, predating ANALYST Claude — restoring from it would have silently
  broken CC-C routing. Re-homed and made byte-identical to live BEFORE any feature edit.
- **Body-forgery question (Langston's rider):** 11,799 logged bodies — **62%** carry a newline
  inside the printed window, so flattening bodies would change what all three sessions see;
  **zero** have ever carried a `WAKE[` token, so defanging without flattening closes the class
  as a provable no-op over the whole history.
- **Media-field presence:** confirmed on a real row before building the consumer.

## What I did NOT verify beforehand — named, because both then bit
1. **`scp` remote-path quoting.** Assumed a remote shell expands it; OpenSSH 9+ speaks SFTP and
   does not, so my inner quotes became literal filename characters. Present in BOTH helpers.
2. **Date-dir ownership.** I did not consider that the stager runs as root while Langston's
   bridge runs as `langston`, so a root-created date dir locks his bridge out of saving inbound
   images. **He caught this minutes after I announced success — the batch's own criterion was
   false for his session while I called it true.**
Both surfaced only on first live execution. Recorded here because a pre-audit that lists only
what was checked, and never what was assumed, is a comfort document.
