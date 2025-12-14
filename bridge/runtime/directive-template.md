**This template is mandatory for all future directives.
Do not skip sections.
If a section is not applicable, explicitly state 'Not Applicable'.**

---

# Directive Title

## Phase
(e.g. Phase 8.8.3, Phase 9A, Bridge Phase 2A)

## Phase Context (Required)
Include 2–3 sentences explaining:
- The purpose of the current DawnTrader phase
- The problem or capability this directive addresses
- How this directive advances the phase

## Context
(Why this directive exists.
What problem is being solved, what limitation was discovered, or what new capability is being added.
This section explains the background and motivation.)

## Objective
(What success looks like once this directive is completed.
Clear, outcome-focused.)

## Scope
(What files, folders, or systems may be touched.)

## Test User Credentials (Required)

Username: testuser123
Password: SecurePass123!

## Explicit Instructions
(Numbered, unambiguous instructions.)

## Explicit Restrictions
(What must NOT be done.)

## Required Outputs
(Files, reports, confirmations expected.)

## Completion Confirmation Required
(Checkbox list Replit must explicitly confirm.)

## What Happens Next
(What ChatGPT will do after review.)

---

## Directive Lifecycle Control (MANDATORY)

### Execution State
- Initial State: DRAFT
- Post-Execution State: EXECUTED
- Canonicalization State: AWAITING_APPROVAL
- Final State: CANONICALIZED

### Post-Execution Requirements (Replit MUST DO ALL)
After implementing this directive, Replit MUST:

1. Produce an implementation report using:
   /bridge/runtime/replit-response-template.md

2. Explicitly ask the human authority (Kyle):
   "Is this directive approved for canonicalization?"

3. Pause all further work related to this directive until approval is granted.

### Canonicalization Instructions (DO NOT EXECUTE UNTIL APPROVED)
Upon explicit approval, Replit MUST:

- Write an execution trace using:
  /bridge/runtime/execution-trace-template.md

- Update or create any affected canonical artifacts in:
  /bridge/canonical

- Log the approval and outcome in:
  /bridge/decisions/decision-ledger.md

### Prohibitions
- Replit MUST NOT mark a directive complete without explicit approval.
- Replit MUST NOT advance phases or scopes without canonicalization.
- ChatGPT MUST NOT issue follow-on directives until lifecycle completion.
