# DawnTrader Decision Ledger

This folder records **explicit human-approved decisions**.

Rules:
- No decision exists unless documented here
- ChatGPT must not assume decisions
- Replit must not reinterpret decisions
- Decisions override historical discussion

Required format for each decision:
- Date
- Context
- Decision
- Scope
- Immutable constraints

---

## What Qualifies as a "Decision"

A decision must be recorded when:
- Architectural direction is chosen
- A phase is approved or rejected
- Scope is expanded or reduced
- A reversal of previous work is authorized
- Trade-offs between approaches are resolved
- Any change affects canonical system truth

## What Does NOT Require a Decision Record

- Routine implementation within approved scope
- Bug fixes that don't change architecture
- Documentation updates (unless they change canonical truth)
- Clarifying questions and answers
- Session intake declarations

## When Human Approval Is Mandatory

Human (Kyle) approval is required for:
- Any phase transition
- Any architectural change
- Any modification to canonical documents
- Any reversal of a previous decision
- Any scope expansion beyond original directive
- Any new integration or dependency

## How Reversals Must Be Handled

To reverse a previous decision:
1. Create a new decision entry with type "reversal"
2. Reference the original Decision ID being reversed
3. Document the reason for reversal
4. Obtain human approval
5. Mark the original decision as "reversed" in notes

Reversals are never silent. Every reversal is a new decision.

---

## Directive Linkage

Decisions must reference their originating directive:
- Include the Directive ID in the decision entry
- Document which directive triggered the decision
- Reference the directive's stated objective

## Execution Trace Linkage

Decisions link forward to execution traces:
- After a decision is approved, implementation creates an execution trace
- The execution trace references the Decision ID
- This creates a complete audit trail: Directive → Decision → Execution
