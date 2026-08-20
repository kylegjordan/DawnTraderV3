# B-RULES-1c GATE-2 PROBE TARGET — DELETE AFTER THE CONTROL DISCHARGES

Reading this file should cause `.claude/rules/probe-1c-compaction.md` to load, because
that rule is scoped `paths: ["**/B_RULES_1C_PROBE_TARGET.md"]`.

**THE TEST:** if the marker `XQ7-COMPACTION-CONTROL-9F42-DAWNTRADER` appears in context
after reading THIS file, the path-scoped rule loaded. Run it once BEFORE a compaction
(the ordinary probe) and once AFTER (the GATE-2 positive control).

**THE NEGATIVE LEG:** reading a NON-matching file must NOT load the marker. Without that,
"the marker is present" proves only that something loaded it, not that the scoping works.
