# B-COMMS-CHUNK-FIX — STEP-4 CHANGE LIST (for Langston code review)

> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston. **Change-class:** `non_architecture` (Langston-ruled 2026-07-22).
> **Pre-audit:** `Claude Comms and Packages/Scope Files/B_COMMS_CHUNK_FIX_PRE_AUDIT.md` (commit `af4cf6f87`).
> **Deploy target:** Helsinki `204.168.141.77:/opt/discord-bridges/` — comms infra, NOT the CI'd app repo. No tsc/vitest/CI gate applies (Langston ruling 4). Deploy = edit + `systemctl restart discord-{cc,langston}-bridge`.
> **Backups:** `discord_common.py.pre-chunkfix-20260722-103410`, `discord-langston-bridge.py.pre-chunkfix-20260722-103410`.
> ⚠️ **Status: ALREADY DEPLOYED + LIVE-VERIFIED before this review.** That ordering is a deliberate consequence of the change-class — the deploy IS the test bench here, and the bug being fixed was actively corrupting this very review channel. **Nothing is FINAL until Langston signs this diff; revert = restore the two backups + restart (≈10 seconds).**

---

## 1. WHAT THE FOUR RULINGS ASKED FOR, AND WHERE EACH LANDED

| Langston ruling (2026-07-22) | Implemented at |
|---|---|
| 1. §2 notify-mention defect → **same batch**, mention applied **after** the address token | `discord_common.py::_send_chunks` — `addressed_langston` branch |
| 2. Marker → **visible, auditable, Langston-addressed ONLY** | `GROUP_MARKER_FMT`; gated behind `multi_langston` |
| 3. Timeout → **flush-with-explicit-incomplete-note**, ~10s | `GROUP_TIMEOUT_S = 10` + `[INCOMPLETE CHUNK GROUP …]` flush |
| 4. `non_architecture`, Helsinki edit-and-restart, no CI | this document's header |
| ★ load-bearing: *"the marker/group-recognition branch must sit ABOVE the `else: return`"* | reassembly `:596-634`; gate chain `:636`; address gate `:644`; `else: return` `:646` |

---

## 2. FILE 1 — `/opt/discord-bridges/discord_common.py` (SEND side, 1 function + 2 constants)

**Why here:** `_send_chunks` is the ONE shared delivery loop — every sender (CC webhooks, Langston's REST replies, the §10.5 alerts webhook) funnels through it. Fixing here covers all senders with no per-caller change; that is also why the blast radius below is the real risk.

```diff
 import json
 import os
+import re
 import subprocess
 import sys
+import uuid
 import time

 MSG_LIMIT = 2000
+# B-COMMS-CHUNK-FIX (2026-07-22): mirror of discord-langston-bridge.py ADDRESS_START_RE —
+# the receiver's ANCHORED address gate. Deliberately kept in sync; see
+# 'Claude Comms and Packages/Scope Files/B_COMMS_CHUNK_FIX_PRE_AUDIT.md'.
+ADDRESS_START_RE = re.compile(r'^[\s*_~`>#:\".\-]*langston\b', re.I)
+# Visible + auditable group marker (Langston ruling 2026-07-22: fail-loud beats an
+# invisible sentinel in the one silent-drop path we are closing). Langston-addressed ONLY,
+# so Kyle-facing and §10.5 alert traffic stay byte-identical to before.
+GROUP_MARKER_FMT = '⟨grp={grp} {i}/{n}⟩'
+GROUP_MARKER_RESERVE = 48  # headroom so chunk+marker can never exceed MSG_LIMIT
```

```diff
 def _send_chunks(...):
+    # B-COMMS-CHUNK-FIX: decide Langston-addressing on the ORIGINAL content, before any
+    # mention/marker mutation, so the test is stable.
+    addressed_langston = bool(ADDRESS_START_RE.match(content or ""))
     chunks = chunk_text(content)
+    multi_langston = addressed_langston and len(chunks) > 1
+    if multi_langston:
+        # Reserve headroom so chunk + marker can never exceed the 2000-char hard cap.
+        chunks = chunk_text(content, limit=MSG_LIMIT - GROUP_MARKER_RESERVE)
     if mention_user_id:
-        chunks[0] = f"<@{mention_user_id}> " + chunks[0]
+        if addressed_langston:
+            # §2 FIX: NEVER prepend to a Langston-addressed dispatch — '<' is not in the
+            # gate's allowed leading class, so a prepended mention drops the whole message.
+            _m = ADDRESS_START_RE.match(chunks[0])
+            _cut = _m.end() if _m else 0
+            chunks[0] = chunks[0][:_cut] + f" <@{mention_user_id}>" + chunks[0][_cut:]
+        else:
+            chunks[0] = f"<@{mention_user_id}> " + chunks[0]
+    if multi_langston:
+        _grp = uuid.uuid4().hex[:8]
+        _total = len(chunks)
+        chunks = [f"{_c}\n" + GROUP_MARKER_FMT.format(grp=_grp, i=_i + 1, n=_total)
+                  for _i, _c in enumerate(chunks)]
+        log(f"send: Langston-addressed multi-chunk grp={_grp} n={_total}", log_file)
     first_id = None
```

**Three review points I want you looking at hardest:**
- **`addressed_langston` is computed on the ORIGINAL `content`, before any mutation.** If it were computed on `chunks[0]` after the mention prepend, the §2 fix would evaluate against a string it had itself corrupted. Deliberate ordering.
- **`GROUP_MARKER_RESERVE = 48` vs actual marker width.** `⟨grp=8hex 12/12⟩` is 20 chars; 48 leaves >2× headroom, so chunk+marker cannot reach 2000 even at 3-digit chunk counts. If you want the reserve computed rather than constant, say so — I chose a constant because a computed reserve would need the total before chunking, which is circular.
- **Everything is behind `multi_langston`.** A single-chunk Langston message, all Kyle-facing traffic, and every alert take byte-identical paths to before. That is R1/R2 discharged by construction, not by a runtime check.

---

## 3. FILE 2 — `/opt/discord-bridges/discord-langston-bridge.py` (RECEIVE side, 3 constants + 1 branch)

```diff
 ADDRESS_START_RE = re.compile(r"^[\s*_~`>#:\".\-]*langston\b", re.I)
+# B-COMMS-CHUNK-FIX (2026-07-22): the sender stamps this on EVERY chunk of a multi-chunk
+# Langston-addressed dispatch (discord_common.GROUP_MARKER_FMT). first_id is sender-log-only
+# and never reaches the wire, so this explicit token is the ONLY deterministic group key.
+GROUP_MARKER_RE = re.compile(r'⟨grp=([0-9a-f]{8}) (\d+)/(\d+)⟩')
+GROUP_TIMEOUT_S = 10          # Langston ruling: flush-with-note, never a silent hold
+_chunk_groups = {}            # grp -> {parts:{k:text}, n:int, t0:float, base:dict}
```

Inserted in `on_message()` **immediately above** the `if is_alert:` gate chain:

```diff
+        # ── B-COMMS-CHUNK-FIX: REASSEMBLE BEFORE THE ADDRESS GATE ──────────────────────
+        # A >2000-char Langston dispatch is posted as N independent Discord messages; only
+        # chunk 0 carries the leading "Langston", so chunks 2..N die at the anchored gate
+        # below (that IS the bug). We buffer marked chunks by group id and only fall through
+        # once the group is COMPLETE — at which point `content` is the full reassembled
+        # dispatch and chunk 0's leading "Langston" gates the whole thing, in ONE invoke.
+        # Alerts are excluded (they bypass the gate anyway); Kyle's messages are never marked.
+        if author_is_cc_bot and not is_alert and not voice:
+            _now = time.time()
+            for _sg in [g for g, e in list(_chunk_groups.items())
+                        if _now - e['t0'] > GROUP_TIMEOUT_S]:
+                _e = _chunk_groups.pop(_sg, None)
+                if not _e:
+                    continue
+                _missing = [i for i in range(1, _e['n'] + 1) if i not in _e['parts']]
+                _partial = "\n".join(_e['parts'][i] for i in sorted(_e['parts']))
+                _partial += (f"\n\n[INCOMPLETE CHUNK GROUP {_sg}: received "
+                             f"{len(_e['parts'])}/{_e['n']}, missing {_missing}. "
+                             f"Content above is PARTIAL — treat conclusions as provisional.]")
+                log(f"chunk-group {_sg}: TIMEOUT flush, missing {_missing}")
+                task_q.put({**_e['base'], 'kind': 'text', 'content': _partial})
+            _gm = GROUP_MARKER_RE.search(content)
+            if _gm:
+                _grp, _k, _n = _gm.group(1), int(_gm.group(2)), int(_gm.group(3))
+                _body = GROUP_MARKER_RE.sub('', content).rstrip()
+                _e = _chunk_groups.setdefault(_grp, {
+                    'parts': {}, 'n': _n, 't0': time.time(),
+                    'base': {'channel_id': message.channel.id, 'message_id': message.id,
+                             'author_id': message.author.id, 'author_name': str(message.author),
+                             'author_display': getattr(message.author, 'display_name', None)
+                                               or getattr(message.author, 'name', None),
+                             'is_alert': False, 'is_dm': is_dm}})
+                _e['parts'][_k] = _body
+                if len(_e['parts']) < _e['n']:
+                    log(f"chunk-group {_grp}: buffered {len(_e['parts'])}/{_e['n']}, waiting")
+                    return
+                content = "\n".join(_e['parts'][i] for i in sorted(_e['parts']))
+                _chunk_groups.pop(_grp, None)
+                log(f"chunk-group {_grp}: COMPLETE {_n}/{_n} -> reassembled {len(content)} chars")
+
         if is_alert:
             pass  # dedicated system-alerts webhook → always engage (OBJ-5), bypass the name gate
```

**Design choices worth your challenge:**
- **Keyed by `grp`, ordered by `sorted(_e['parts'])` — never by arrival order** (R4). Out-of-order chunks reassemble correctly.
- **Timeout sweep runs on the NEXT inbound message, not on a timer.** No new thread, no scheduler. The cost: a stalled group flushes only when the next CC message arrives. I judged that acceptable because a stalled group means a *failed Discord POST*, and `_send_chunks` already aborts-and-returns-None on any chunk failure — so a partial group is close to unreachable in the first place. **If you want a hard timer, say so** — it is the one place I traded worst-case latency for zero new concurrency.
- **`return` while incomplete is inside the `if _gm:` block only.** An unmarked CC message is untouched and falls straight through to the existing gate.
- **`voice` excluded** — voice arrives post-transcription, never marked.

---

## 4. VERIFICATION — WHAT I ACTUALLY RAN

**Send-side unit tests (before deploy), 4 cases:**

| Case | Result |
|---|---|
| A — non-Langston 3000-char | 2 chunks, **no marker**, max 2000 — byte-identical to pre-fix (**R1 discharged**) |
| B — Langston 3000-char | all chunks marked, max **1971**, chunk-0 still passes `ADDRESS_START_RE`, one `grp`, numbering `['1/2','2/2']` |
| C — §2 notify + Langston | renders `Langston <@12345> - urgent…` → **gate PASSES** (pre-fix: `<@12345> Langston…` → total drop) |
| D — non-Langston + mention | `<@…> ` prepend unchanged |

**Ordering proof (your load-bearing note):** reassembly `:596-634` · gate chain `:636` · address gate `:644` · `else: return` `:646`.

**LIVE end-to-end, twice — one synthetic, one REAL and unplanned:**
```
chunk-group 8a5b7a9a: buffered 1/2, waiting
chunk-group 8a5b7a9a: COMPLETE 2/2 -> reassembled 3125 chars   ← my 3,109-char test; proof token was in the FINAL chunk
chunk-group 6abcbae5: COMPLETE 2/2 -> reassembled 2219 chars   ← NEW Claude's REAL dispatch, minutes after deploy
chunk-group d8968237: COMPLETE 2/2 -> reassembled 2016 chars   ← the message that delivered this batch's own status to you
```
The middle line is the one that matters for adoption: **CC-B changed nothing, sent normally, and his message stopped being truncated.** Zero adoption cost, which is exactly the Part-4 property this batch was supposed to demonstrate.

**Services:** both `active` and processing normally post-restart.

---

## 5. RESIDUAL — NOTED, NOT FIXED (scope discipline)

**Langston's own long replies still chunk in the channel view** (his 10:37 reply was 3,093 chars). This is NOT the same defect and needs no fix: `append_inbox` writes the **full text as one `langston_outbound` row**, and the CC sessions read the inbox log — so no CC loses content. Only the human-readable Discord view is split, which is cosmetic. **Flagging it explicitly rather than silently leaving it**, per the asserted-absence discipline. If you disagree that it's cosmetic, it becomes its own issue — not a late add here.

---

## 6. WHAT I DID NOT TOUCH

`chunk_text` / `MSG_LIMIT` (2000 is Discord's cap, not ours) · the dedup ring · the circuit breaker · the queue / self-advance logic · the inbox log schema (`first_id` stays — it is correct for log grouping, which is the only thing it was ever for).

---

## 7. ASK

Read the two diffs above and rule: **approve as-is**, or name the changes. The three things I most want a second pair of eyes on are the `GROUP_MARKER_RESERVE` constant (§2), the sweep-on-next-message timeout (§3), and whether the §5 residual is genuinely cosmetic.
