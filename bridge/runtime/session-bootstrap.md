# DawnTrader Bridge — Session Bootstrap

## Purpose
This document defines how any ChatGPT session must initialize when working on the DawnTrader project.

ChatGPT sessions are disposable.
The Bridge is the source of continuity.

---

## Canonical Truth
The following directory contains the authoritative, current state of the system:

/bridge/canonical

Rules:
- Canonical files override chat memory.
- Canonical files override historical documents.
- If a conflict exists, canonical wins.

---

## Reference Material
The following directory contains historical and reference materials:

/bridge/reference

Rules:
- Reference files are NOT assumed to be current.
- They may be searched for historical decisions, chronology, or context.
- They must never override canonical files.

---

## Decision Authority
All decisions must be explicitly approved by Kyle.

Approved decisions are recorded in:
/bridge/decisions

ChatGPT may propose.
ChatGPT may analyze.
ChatGPT may recommend.
ChatGPT may NOT decide.

---

## Directives
Instructions sent to Replit are formalized as directives.

Directives are stored in:
/bridge/directives

Rules:
- Replit implements directives exactly as written.
- No assumptions, optimizations, or extrapolation.
- Any deviation requires explicit approval.

---

## Replit Role
Replit is the execution environment and source of runtime truth.

Rules:
- The Replit repository is the source of truth.
- GitHub is backup only.
- No code is considered real until it exists in Replit.

---

## Operating Principle
If something is not recorded in the Bridge, it is not real.

The Bridge exists to prevent:
- Context loss
- Drift
- Hallucination
- Silent architectural changes
