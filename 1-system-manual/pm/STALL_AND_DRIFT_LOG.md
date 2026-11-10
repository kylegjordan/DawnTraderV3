# PM stall and drift log

> Append-only coordination record. Technical diagnosis and decisions remain with the owner and reviewers.

| UTC | owner or reviewer | stall id | evidence and source | action | destination or message id | observed result |
|---|---|---|---|---|---|---|
| 2026-11-10T09:06:08Z | INFRA Codex | infra-transcript-step7-eligible | Chat and POSITION showed B-AGENT-INVOKE-FAILURE-NOTICE legitimately blocked at Step 6 while approved B-TRANSCRIPT-ARCHIVE Step 7 was eligible and overdue | nudge 1 | existing INFRA Codex chat | Cleared 2026-11-10T09:32:58Z; visible owner reply named `2fadd2019`, four green CI jobs, and Step 8 resumed with Coltrane |
| 2026-11-10T09:40:15Z | OLD Codex | old-weekly-alerts-2026-w46 | Chat idle at B-DB-SIZE-RELIEF Step 7 timed wait while handover alerts `890d6c3d` and `70b88eb1` remained due; clone seven shared commits behind | nudge 1 | existing OLD Codex chat | Visible receipt and follow-on commands observed; OLD pulled and began both procedures, preserving the disk alert and Step 7 return point; final evidence pending |

Use one stable stall id until the condition changes. Record `nudge 1`, `nudge 2`, `ruling routed`, `alert routed`, or `Kyle action required`. The result must name visible movement and its source; queued or accepted delivery is `pending`, not receipt.
