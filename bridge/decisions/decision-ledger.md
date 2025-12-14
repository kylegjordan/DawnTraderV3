# DawnTrader Bridge — Decision Ledger

**This is a canonical, append-only record of all material decisions.**

---

## Entry Format

Each decision entry must include:
- **Decision ID**: DEC-YYYYMMDD-XXXX
- **Date/Time**: ISO timestamp
- **Session ID**: Reference to originating session
- **Decision Type**: proposal / approval / rejection / reversal
- **Description**: Clear statement of what was decided
- **Impacted Areas**: Files, systems, or phases affected
- **Authority Level**: Who has authority to make this decision
- **Approval Status**: pending / approved / rejected / reversed
- **Human Approver**: Name/ID of approver (if applicable)
- **Notes**: Additional context or references

---

## Decision Log

### DEC-20251213-0001
- **Date/Time**: 2025-12-13T06:45:00Z
- **Session ID**: SESSION-20251213-0001
- **Decision Type**: approval
- **Description**: Implement Bridge Phase 1C through 2C structure
- **Impacted Areas**: /bridge directory structure and documentation
- **Authority Level**: Human (Kyle)
- **Approval Status**: approved
- **Human Approver**: Kyle
- **Notes**: Foundation for durable context management system

---

### DEC-20251213-0002
- **Date/Time**: 2025-12-13T17:55:00Z
- **Session ID**: SESSION-20251213-0001
- **Decision Type**: approval
- **Description**: Implement Phase M4.4 Directive Lifecycle Enforcement Templates
- **Impacted Areas**: /bridge/runtime/directive-template.md, /bridge/runtime/replit-response-template.md, /bridge/directives/README.md
- **Authority Level**: Human (Kyle)
- **Approval Status**: approved
- **Human Approver**: Kyle
- **Notes**: Closes governance loop. All directives now follow mandatory lifecycle.

---

### DEC-20251213-0003
- **Date/Time**: 2025-12-13T18:15:00Z
- **Session ID**: SESSION-20251213-0001
- **Decision Type**: approval
- **Description**: Replace DawnTrader Grounding Schema with Unified Expert + Creative Contract
- **Impacted Areas**: /chaplet/index.ts grounding endpoint
- **Authority Level**: Human (Kyle)
- **Approval Status**: approved
- **Human Approver**: Kyle
- **Notes**: Full schema replacement. Enables expert reasoning, creativity, pushback while preserving governance. Assistant now operates as Principal Architect & Trading Systems Advisor.

---

### DEC-20251214-0001
- **Date/Time**: 2025-12-14T00:00:00Z
- **Session ID**: SESSION-20251214-0001
- **Decision Type**: approval
- **Description**: Canonicalize GROUNDING-MISSION-COLLEAGUE-COLLABORATION directive (M4.5)
- **Impacted Areas**: /chaplet/index.ts (mission_and_purpose block, collaboration_model), /bridge/runtime/directive-template.md (phase context section)
- **Authority Level**: Human (Kyle)
- **Approval Status**: approved
- **Human Approver**: Kyle
- **Notes**: Mission statement now explicitly names Kyle as owner/beneficiary. Collaboration model treats Kyle as expert colleague. Directive template now requires Phase Context section.

---

### DEC-20251214-0002
- **Date/Time**: 2025-12-14T17:00:00Z
- **Session ID**: SESSION-20251214-0002
- **Decision Type**: approval
- **Description**: Fix Portfolio Value calculation and rename cashBalance to realizedBalance
- **Impacted Areas**: 
  - server/routes.ts (active-trades endpoint portfolio calculation)
  - client/src/components/trading/active-trades-v2.tsx (IntegrityBanner, PortfolioSummary interface)
- **Authority Level**: Human (Kyle)
- **Approval Status**: approved
- **Human Approver**: Kyle
- **Notes**: 
  - Clarified terminology: "Current Balance" = Starting Balance + Realized P/L (from closed trades)
  - Clarified terminology: "Portfolio Value (unrealized)" = Current Balance + Unrealized Net P/L from open trades
  - Renamed backend field `cashBalance` → `realizedBalance` to remove confusing "cash" terminology
  - The old `currentBalance` field (which was cashBalance + totalPositionValue) was identified as a "nonsense metric" and should not be used for display
  - Fixed green bar in Active Trades to correctly calculate: realizedBalance + sum(open trade netPnl)

---

*New decisions are appended below this line.*
