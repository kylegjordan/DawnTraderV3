# DawnTrader Bridge — Trace Rules

## When Execution Traces Are Required

An execution trace is required when:
- A directive is implemented
- Files are created, modified, or deleted
- Configuration is changed
- Any work affects canonical truth
- Phase transitions occur

## What Qualifies as "Material Execution"

Material execution includes:
- Creating new files or folders
- Modifying existing code or configuration
- Updating Bridge documents
- Schema changes
- Dependency additions or removals

Non-material work (no trace required):
- Reading files for analysis
- Asking clarifying questions
- Proposing options (without implementation)
- Session intake declarations

## How Partial or Failed Executions Are Recorded

Partial executions:
- Record what was completed
- List what was NOT completed
- Document the reason for incompletion
- Mark as "partial" in verification

Failed executions:
- Record the attempt
- Document the failure reason
- List any rollback actions taken
- Mark as "failed" in verification

## How Reversals Are Traced

When reversing previous work:
1. Reference the original execution trace
2. Document what is being reversed
3. Link to the reversal decision (DEC-XXXX)
4. Record the reversal execution steps
5. Verify system state after reversal

Every reversal creates a new trace entry.
