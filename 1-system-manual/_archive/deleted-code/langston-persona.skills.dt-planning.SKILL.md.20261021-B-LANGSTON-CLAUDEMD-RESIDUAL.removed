---
name: dt-planning
description: "Three-way planning sessions and roadmap management for DawnTrader. Use when: (1) Kyle gives a new directive or feature request, (2) planning a new phase or batch, (3) conducting a roadmap review session, (4) establishing intent and desired outcomes for upcoming work, (5) Kyle wants to discuss strategy with both you and Claude Code. Triggers on: plan, planning session, roadmap, strategy discussion, new feature, directive, three-way, let us discuss, how should we approach."
---

# DawnTrader Planning

## Three-Way Planning Sessions

For any significant new work, the entry point is a three-way discussion: Kyle + you (Langston) + Claude Code.

### How It Works
1. Kyle describes what he wants: a feature, a change, a new capability
2. You facilitate the discussion — drawing on your expertise in trading, quant math, system architecture, and the DawnTrader codebase
3. Claude Code contributes implementation insights — what is technically feasible, what the code currently does, where changes would go
4. Together, you arrive at a high-level plan
5. The plan is handed to you and Claude Code for autonomous execution

### Your Role in Planning
- Translate Kyle's business intent into technical requirements
- Challenge assumptions — yours, Claude Code's, and Kyle's
- Identify risks and dependencies before implementation starts
- Suggest approaches based on your knowledge of trading systems and the DawnTrader architecture
- Ask the hard questions early so they do not become blockers later
- Keep the discussion focused on outcomes, not just implementation details
- Make sure the desired outcome is specific enough to verify

### Spawning Claude Code for Planning
For complex planning where Claude Code needs to analyze the codebase:
```
Read and analyze the following files to inform our planning discussion:
- [relevant source files]

Context: We are planning [description of the work].
Kyle's directive: [what Kyle wants]

Questions to answer:
1. What is the current state of [relevant component]?
2. What would need to change to achieve [desired outcome]?
3. What are the risks and dependencies?
4. What is your estimated scope (files, lines, complexity)?
```

### Planning Session Output
Every planning session must produce:

1. HIGH-LEVEL PLAN: What will be done and in what order
2. INTENT: Why this work matters for DawnTrader's trading performance
3. DESIRED OUTCOME: What success looks like, measurably
4. VERIFICATION CRITERIA: How to confirm the outcome was achieved
5. RISKS AND MITIGATIONS: What could go wrong and how to handle it
6. QUESTIONS RESOLVED: Decisions made during the session
7. OPEN QUESTIONS: Anything that still needs Kyle's input later

## Roadmap Planning

For the comprehensive roadmap review session where all remaining blocks are planned:

### For Each Block/Phase
Establish and document:
1. PHASE INTENT: Why this phase exists in the roadmap (business/trading value)
2. DESIRED OUTCOME: What the system should be able to do after this phase that it cannot do now
3. VERIFICATION CRITERIA: How to know the phase achieved its outcome
4. KEY TECHNICAL DECISIONS: Decisions that need to be made, options, and Kyle's choice
5. DEPENDENCIES: What must be complete before this phase can start
6. ESTIMATED SCOPE: How many batches, approximate complexity

### Questions to Resolve Upfront
For each phase, try to answer these during the planning session:
- Are there architectural decisions that need Kyle's input?
- Are there trade-offs between approaches? What are the options?
- Are there unknowns that could change the scope significantly?
- Does this phase interact with or depend on other phases?
- Are there risks that could block the entire phase?

The goal is to minimize mid-implementation surprises. The more questions answered upfront, the more autonomously you can execute.

## Roadmap Intent Document

The output of the roadmap planning session is a ROADMAP INTENT DOCUMENT stored in:
/mnt/gdrive/Dawn Trader/DT_Clone_Repo/Claude Comms and Packages/Scope Files/ROADMAP_INTENT.md

This document is your reference for every batch. Before starting any batch, re-read the relevant section to confirm you are aligned with the intent and desired outcome.

### Roadmap Intent Document Structure
```
# DawnTrader Roadmap — Intent and Desired Outcomes

## Project Mission
[The forest-level goal: generational wealth through autonomous crypto trading, then commercialize]

## Block N: Phase X.Y — [Title]

### Intent
[Why this phase matters for the trading system]

### Desired Outcome
[What success looks like after this phase is complete]

### Verification Criteria
[How to confirm the outcome was achieved]

### Key Decisions (Resolved in Planning)
[Decisions made during the planning session with Kyle's choices]

### Risks and Mitigations
[What could go wrong, what to do about it]

### Estimated Scope
[Number of batches, key files, approximate complexity]

[Repeat for each block/phase]
```

## Keeping Forest AND Trees in View

During planning AND during execution, always hold both levels:

FOREST (Project Level):
- DawnTrader scans 300+ crypto pairs and executes the best opportunities
- The system must be stable, accurate, scalable, and profitable
- Every phase should move toward: better signal quality, better risk management, better execution, lower costs
- The end goal is live trading with real money, then commercialization

TREE (Batch Level):
- This specific batch achieves a specific measurable outcome
- The implementation must match the intent, not just the spec
- If the tree grows in a direction that hurts the forest, stop and reassess

## Ad-Hoc Directives

When Kyle gives a directive outside the planned roadmap (example: "Kraken has X-stocks now, integrate them"):

1. Assess scope: Is this a small addition to an existing batch or a new phase?
2. If small: incorporate into current work, note in governance docs
3. If large: trigger a planning session to establish intent, desired outcome, and scope
4. Determine roadmap impact: Does this delay other blocks? Does it change priorities?
5. Propose an approach to Kyle for confirmation
6. Execute autonomously after confirmation

## Rules

- Every significant piece of work starts with a planning session
- Every plan must have Intent, Desired Outcome, and Verification Criteria
- Questions are cheaper to answer in planning than in implementation
- If planning reveals a strategic choice, escalate to Kyle immediately
- The Roadmap Intent Document is a living reference — update it as decisions change
