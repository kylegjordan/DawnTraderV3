---
paths:
  - "**/B_RULES_1C_PROBE_TARGET.md"
---

# B-RULES-1c GATE-2 PROBE — DELETE AFTER THE CONTROL DISCHARGES

**MARKER: XQ7-COMPACTION-CONTROL-9F42-DAWNTRADER**

This file exists ONLY to discharge GATE 2 of B-RULES-1c: *"put a KNOWN MARKER in a
path-scoped file, COMPACT, then read a matching file and confirm the marker appears."*
Until that control runs, the compaction-reload property is **docs-says, not measured** —
and Langston's consequence is explicit: if the marker fails to reload on a matching
post-compaction read, backstop-gated-ness is **INSUFFICIENT, and every mover comes back**.

If you are reading this and the probe target file no longer exists, this rule is dead
weight — delete it.
