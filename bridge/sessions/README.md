# DawnTrader Bridge — Session Registration

## What Session Registration Is

Session registration is the formal declaration of intent, scope, and authority for any ChatGPT session working on DawnTrader.

Every session is:
- Temporary (context resets between sessions)
- Bounded (limited to declared scope)
- Accountable (registered in the session registry)

## When a Session Must Register

A session MUST register when:
- Beginning work on any phase
- Resuming work after a context reset
- Changing scope or authority level
- Responding to a new directive

## When a Session Must Stop

A session MUST stop when:
- It encounters work outside its declared scope
- It needs authority it does not have
- It discovers a conflict with canonical truth
- Human approval is required and not yet given
- A new session supersedes it

## When Human Approval Is Required

Human (Kyle) approval is required for:
- Any phase transition
- Any architectural change
- Any decision that affects canonical truth
- Any directive execution
- Any scope expansion

## Registry Location

All sessions are recorded in:
`/bridge/sessions/session-registry.md`

This registry is append-only. Sessions are never deleted, only marked as closed or superseded.
