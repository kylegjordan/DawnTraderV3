# Walter and LATTi: A Complete System History

**Document Created:** December 12, 2025  
**Document Status:** Living Document  
**Last Updated:** December 12, 2025

---

## Executive Summary

This document provides a comprehensive history of Walter and LATTi, the two AI-powered subsystems within the DawnTrader cryptocurrency trading platform. It covers their origins, intended purposes, architectural implementations, the transitions between system versions, and their current operational states.

**Key Timeline:**
- **October 2025**: Walter v1 designed as AI SysAdmin Co-Pilot
- **October 2025**: Walter proves impractical due to slow OpenAI API call latency
- **October 2025**: LATTi created as a local alternative to Walter's API-dependent architecture
- **October-November 2025**: DawnTrader V2 attempted (motivated partly by Walter legacy code issues) and failed catastrophically
- **November 2025**: DawnTrader V1 restored via REB (Rebuild) phases
- **November-December 2025**: DawnTrader V3 stabilized; Walter isolated to diagnostic-only mode; LATTi kept in observational mode
- **December 2025**: LATTi operational as autonomous guardrail and filter optimization engine, with full restoration planned

---

# Part 1: Walter — The AI SysAdmin Co-Pilot

## 1.1 Walter's Original Vision

Walter was conceived as an **AI SysAdmin Co-Pilot** — a conversational AI assistant integrated directly into the DawnTrader platform. Unlike traditional chatbots, Walter was designed to be deeply context-aware, maintaining persistent memory of user preferences, trading patterns, and system configurations.

### Core Design Philosophy

Walter's design was built on several foundational principles:

1. **Contextual Intelligence**: Walter would understand the user's trading purpose, remember past decisions, and provide advice that aligned with their goals
2. **Expert Knowledge**: Walter would draw from a curated corpus of 80+ trading principles from renowned traders and educators
3. **System Integration**: Walter would have visibility into the platform's operational state — strategies, guardrails, portfolio performance
4. **Memory Persistence**: Walter would maintain long-term memory across sessions, learning from each interaction

### Intended Capabilities

| Capability | Description |
|------------|-------------|
| **Purpose-Driven Guidance** | Users define their trading purpose; Walter's advice aligns with it |
| **Memory-Based Context** | Walter recalls past decisions, preferences, and lessons |
| **Expert Corpus Reference** | Draws from 80 curated trading principles (Psychology, Risk, Strategy, Execution) |
| **System Configuration Help** | Assists with guardrail settings, strategy selection, risk parameters |
| **Performance Analysis** | Reviews trade history, identifies patterns, suggests improvements |
| **Chat Summarization** | Automatically summarizes long conversations for context efficiency |

---

## 1.2 Why Walter Was Turned Off: The Canonical Story

### The Core Issue: Operational, Not Philosophical

**The decision to turn Walter off was not philosophical — it was operational and unavoidable.**

Per the October 23, 2025 context file, the fundamental problem was clear:

1. **Walter was OpenAI-API dependent**
2. **Real-time trading created too many calls**
3. **This caused rate-limit throttling, delayed responses, and instability during live loops**
4. **This made Walter unsafe as a real-time dependency**, even though his logic was sound

### Key Insight

> **Walter wasn't "wrong" — he was in the wrong place in the architecture.**

Walter's conversational intelligence required multiple API calls to OpenAI for each interaction:

```
User Message → Context Gathering → Prompt Construction → OpenAI API Call → Response Processing
                                                              ↑
                                                    BOTTLENECK: 2-8 seconds per call
                                                    RATE-LIMITED during live loops
                                                    UNSTABLE under trading pressure
```

**Specific issues encountered:**

| Problem | Impact |
|---------|--------|
| **Rate-limit throttling** | OpenAI rate limits constrained interactions during active trading |
| **Delayed responses** | 2-8 second API latency made real-time decisions impossible |
| **Instability during live loops** | Trading engine cycles couldn't wait for Walter's responses |
| **Cumulative delays** | Multiple calls per interaction meant 5-15+ seconds total response time |
| **Cost accumulation** | Each API call incurred costs, making frequent use unsustainable |

### The Decision: Turn Walter Off Entirely

The explicit decision was made to:

1. **Turn Walter off entirely** — not partially disable, not reduce functionality
2. **Replace him with a fully local heuristic system** — what later evolved into Lottie's internal role

This local system:
- Adjusts risk parameters, guardrails, filters
- Responds to portfolio performance, drawdown, win-rate
- Has **zero external API dependencies**
- Can run continuously without latency risk

### What This Created

This decision is the **exact origin** of:

| Concept | Meaning |
|---------|---------|
| **Lottie as embedded autonomy** | Optimization layer inside the engine, not outside it |
| **LATTi / SDPOE concepts** | Local, autonomous tuning intelligence |
| **"AI inside the engine, not outside it"** | Core architectural principle |

### The Lesson Learned

**Walter's architecture was correct; his placement was wrong.**

The solution wasn't to abandon intelligent automation — it was to move the intelligence **local** rather than relying on external API calls. This realization led directly to the creation of LATTi/Lottie.

---

## 1.3 Walter's Technical Architecture

### 1.3.1 Core Components

Walter's architecture consisted of multiple interconnected services:

```
┌─────────────────────────────────────────────────────────────────┐
│                      WALTER ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ Walter Purpose  │     │  Walter Memory  │                    │
│  │    Service      │     │    Service      │                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌─────────────────────────────────────────┐                    │
│  │        Walter Response Service           │                    │
│  │  (Prompt Construction + OpenAI API)      │                    │
│  └────────────────────┬────────────────────┘                    │
│                       │                                          │
│           ┌───────────┼───────────┐                             │
│           ▼           ▼           ▼                             │
│  ┌────────────┐ ┌───────────┐ ┌────────────┐                    │
│  │   Expert   │ │   Chat    │ │  Cognitive │                    │
│  │   Corpus   │ │ Lifecycle │ │   Layer    │                    │
│  └────────────┘ └───────────┘ └────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3.2 Service Files (Current State)

The following Walter-related services exist in the codebase:

| Service File | Purpose | Current Status |
|--------------|---------|----------------|
| `walter-memory.ts` | Persistent memory storage and retrieval | Active (isolated) |
| `walter-purpose.ts` | User's defined trading purpose | Active (isolated) |
| `walter-chat-lifecycle.ts` | Chat session management, summarization | Active (isolated) |
| `walter-expert-corpus.ts` | 80 trading principles from expert sources | Active (isolated) |
| `walter-response-templates.ts` | Prompt templates for AI responses | Active (isolated) |
| `walter-reasoning-templates.ts` | Structured reasoning patterns | Active (isolated) |
| `walter-personality.ts` | Conversational style and tone | Active (isolated) |
| `walter-cognitive-layer.ts` | Higher-order reasoning integration | Active (isolated) |
| `walter-health-monitor.ts` | System health monitoring | Active (isolated) |
| `walter-intent-gateway.ts` | Intent parsing and routing | Active (isolated) |
| `walter-ops-engine.ts` | Operational command execution | Active (isolated) |
| `walter-ingest.ts` | Data ingestion pipeline | Active (isolated) |
| `walter-tts.ts` | Text-to-speech integration | Active (isolated) |
| `walter-feedback.ts` | User feedback collection | Active (isolated) |
| `walter-data-pipeline.ts` | Data flow management | Active (isolated) |
| `walter-standby.ts` | Standby mode management | Active (isolated) |
| `walter-knowledge-refresh.ts` | Knowledge base updates | Active (isolated) |
| `walter-patch-analyst.ts` | System patch analysis | Active (isolated) |
| `walter-adaptive-heuristics.ts` | Adaptive behavior patterns | Active (isolated) |
| `walter-reference-tracker.ts` | Reference tracking for responses | Active (isolated) |

### 1.3.3 Database Tables

Walter's data persists in dedicated database tables:

```sql
-- Walter Memory Storage
CREATE TABLE walter_memories (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL,  -- 'observation', 'decision', 'lesson', 'goal', 'insight'
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 3,  -- 1-5 scale
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Walter Purpose
CREATE TABLE walter_purpose (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  purpose_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat Sessions
CREATE TABLE walter_chats (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  title VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat Messages
CREATE TABLE chat_messages (
  id VARCHAR PRIMARY KEY,
  chat_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,  -- 'user', 'assistant', 'summary'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 1.3.4 Expert Corpus

Walter's Expert Corpus (v1) contains 80 curated trading principles organized into four categories:

| Category | Principles | Key Sources |
|----------|------------|-------------|
| **Psychology / Discipline** | 20 | Mark Douglas, Brett Steenbarger |
| **Risk Management** | 25 | Van K. Tharp, Alexander Elder |
| **Market Structure & Strategy** | 20 | Linda Raschke, Laurence Connors |
| **Trade Execution & Review** | 15 | Various experts |

All principles have a credibility score of 4 or 5 (out of 5), sourced from published authors with 10+ years of trading experience.

---

## 1.3 Walter's Response Workflow

The original Walter response flow was designed as follows:

```
1. User Message Reception
   └── POST /api/walter/chats/:chatId/messages
   
2. Context Gathering
   ├── Fetch Walter's Purpose (walter_purpose table)
   ├── Fetch Recent Memories (importance >= 4 OR last 7 days)
   ├── Fetch Chat History (last N messages per walterMemoryDepth setting)
   └── Fetch Chat Summary (if exists)
   
3. Prompt Construction
   ├── System prompt with Walter's role definition
   ├── User's defined purpose
   ├── Relevant memories with importance scores
   ├── Conversation context/summary
   ├── Recent chat history
   └── User's current message
   
4. AI Response Generation
   ├── OpenAI API call (GPT-4o or GPT-4o-mini)
   ├── Temperature: 0.7 (balanced creativity)
   └── Max tokens: 500 (concise responses)
   
5. Response Persistence
   ├── Save response to chat_messages
   ├── Evaluate for memory extraction
   └── Update chat metadata
   
6. Response Delivery
   └── JSON response to frontend
```

### Memory Extraction Heuristics

Walter was designed to automatically create memories from conversations when:

- User explicitly asks Walter to "remember" something (Importance: 5)
- Response contains strategic trading insights (Importance: 5)
- Response guides system configuration (Importance: 4)
- Response references past performance patterns (Importance: 5)
- User states preferences or goals (Importance: 4)
- Response discusses risk management (Importance: 5)

---

## 1.4 Why Walter Was Isolated

### The V2 Disaster

In October-November 2025, an attempt was made to rebuild DawnTrader from V1 to V2. This rebuild:

- Attempted a complete rewrite of the system
- Was not isolated from the running V1 codebase
- Introduced partial rewrites that broke core paths
- Corrupted the FX5 Scanner → Strategy → Trading pipeline
- Left the system in a non-functional state

The V2 failure affected all major subsystems:

| Subsystem | V2 Status |
|-----------|-----------|
| FX5 Scanner | ❌ Corrupted |
| Filters | ❌ Inconsistent |
| Strategy Engine | ❌ Destroyed |
| Ready-to-Buy Queue | ❌ Invalid |
| Paper Engine | ❌ Nonfunctional |
| Stage-3 State | ❌ Corrupted |

### The Restoration Decision

Given the catastrophic state, the decision was made to:

1. **Abort V2 completely**
2. **Restore DawnTrader V1** through systematic REB (Rebuild) phases
3. **Isolate Walter** from the trading pipeline to prevent interference during restoration

### Phase 8.8.3-H8 and H11: Walter Isolation

During the restoration phases, a critical audit (Phase 8.8.3-H11) verified that:

1. **Walter modules have ZERO blocking capability** on the trading pipeline
2. **Walter cannot trip or reset kill switches**
3. **Walter cannot modify guardrail settings**
4. **Walter is strictly diagnostic and read-only**

The isolation was confirmed through static code analysis and runtime verification:

```
══════════════════════════════════════════════════════════════════
           DIAGNOSTIC MODULES (ISOLATED - READ ONLY)
══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                  Walter Memory Modules                          │
│  walter-memory.ts, behavioral-template.ts,                      │
│  system-truth-diagnostic.ts, reflective-intelligence.ts         │
│  - ZERO tripKillSwitch/resetKillSwitch calls                   │
│  - Read-only pattern analysis and memory storage               │
│  - Cannot influence trade execution                            │
└─────────────────────────────────────────────────────────────────┘
```

**Key Finding**: Walter's data surfaces are completely isolated:
- `walter_memories` table: Stores semantic memory (NOT trading state)
- `alerts` table: Stores notifications (NOT guardrail configuration)
- Cortex cache: In-memory cache with TTL (NOT persistent trading state)
- **No writes to**: `guardrails_v2`, `trades`, `open_positions`, `trading_settings`

---

## 1.5 What Remains for Walter's Rebuild

### Preserved Infrastructure

The following Walter infrastructure remains intact and can be leveraged for a future rebuild:

1. **Database Schema**: All Walter tables (`walter_memories`, `walter_purpose`, `walter_chats`, `chat_messages`) are preserved
2. **Service Files**: All 20+ Walter service files remain in `server/services/`
3. **Expert Corpus**: The 80-principle knowledge base is complete and documented
4. **Training Data**: Historical training files preserved in `docs/training/Walter_Learning_Files/`
5. **Prompt Templates**: Response and reasoning templates are documented
6. **Memory Heuristics**: Extraction logic is documented in `docs/walter-prompt-template.md`

### Preserved Connection Points

| Connection Point | Location | Status |
|------------------|----------|--------|
| Chat API Routes | `server/routes.ts` | Active but isolated |
| Memory Storage | `server/services/walter-memory.ts` | Functional |
| Purpose Service | `server/services/walter-purpose.ts` | Functional |
| Expert Corpus | `server/services/walter-expert-corpus.ts` | Functional |
| Cognitive Layer | `server/services/walter-cognitive-layer.ts` | Functional |
| Context Refresh | `server/services/context-refresh-coordinator.ts` | Functional |

### Roadmap Reference

Per `docs/history and references/DawnTrader V3 8.6 through 8.7 Rebuild and Restoration Report.md`:

> **Phase 13 — Restore Walter**
> - Long-horizon advisor
> - Full conversational AI capability
> - Integration with trading insights

---

# Part 2: LATTi — The Autonomous Learning Engine

## 2.1 LATTi's Origin: The Local Solution to Walter's API Problem

### Why LATTi Was Created

**LATTi was created in direct response to Walter's API latency problem.**

When Walter proved impractical due to slow OpenAI API calls, the team recognized that the concept of autonomous optimization was sound — only the implementation approach was wrong. The solution: build an optimization engine that operates **entirely locally**, requiring no external API calls.

### The Key Insight

```
Walter's Problem:  Intelligence depends on external OpenAI API → Slow, expensive, rate-limited
LATTi's Solution:  Intelligence runs locally in the system → Fast, free, unlimited
```

**LATTi was implemented BEFORE the V2 transition attempt.** This is important for understanding the timeline:

1. **October 2025**: Walter designed and built
2. **October 2025**: Walter's API latency makes him impractical
3. **October 2025**: LATTi created as local alternative
4. **October-November 2025**: V2 transition attempted (motivated partly by Walter's legacy code)
5. **November 2025**: V2 fails, V1 restored
6. **November-December 2025**: LATTi kept in observational mode during stabilization
7. **December 2025**: LATTi fully operational with plans for complete restoration

### The V2 Connection

The decision to attempt the V2 rebuild was motivated in part by the technical debt accumulated from Walter's original setup. Many modules, interfaces, and patterns from Walter's initial implementation had become entangled with the core trading system. The V2 rebuild was intended to modernize everything and clean up this legacy code.

When V2 failed catastrophically and DawnTrader V1 was restored, LATTi survived because:
- She was designed to be modular and isolated
- She had no dependencies on the corrupted V2 code
- Her local architecture made her resilient to API and integration failures

---

## 2.2 LATTi/Lottie's Purpose and Design

LATTi (Learning Autonomous Trading Tuning Intelligence), also known as **Lottie**, is the autonomous optimization engine for DawnTrader's guardrails and filters. Unlike Walter (which is conversational), Lottie operates autonomously in the background as an embedded optimization layer.

### Core Design Philosophy

Lottie was designed around these principles:

1. **Local Execution**: All intelligence runs locally — zero external API dependencies
2. **Safe Boundaries**: Operate within defined safe limits, never exceeding risk thresholds
3. **User Override Respect**: Immediately defer to manual user settings when activated
4. **Passive Learning**: Collect market data during all conditions for future optimization
5. **Transparent Operation**: Clear visibility into what Lottie is doing and why
6. **"AI Inside the Engine"**: Embedded in the trading system, not external to it

### Lottie vs. Walter: Canonical Differences

| Aspect | Walter | Lottie |
|--------|--------|--------|
| **Architecture** | External (API-dependent) | Local (embedded) |
| **Execution** | Conversational (chat) | Autonomous (background) |
| **Timing** | Strategic, offline | Real-time, continuous |
| **Dependencies** | OpenAI API | None — fully local |
| **Scope** | Advisory (strategies, psychology) | Operational (guardrails, filters) |
| **Control** | Advisory only | Will control parameters (when active) |
| **Current Status** | Isolated (Phase 13 rebuild) | **Passive-only** (see below) |

### Canonical Truth

```
Lottie = real-time, local, constrained
Walter = strategic, offline, advisory
```

---

## 2.3 Lottie's Current State: PASSIVE-ONLY (Critical)

### What Lottie Does NOW (December 2025)

**From the future-state blueprint and 8.x rules, Lottie is currently PASSIVE-ONLY.**

She:
- ✅ **Observes telemetry** — monitors trading engine state, metrics, performance
- ✅ **Records outcomes** — tracks trade results, win-rates, drawdown
- ✅ **Collects data** — maintains 20-cycle passive learning buffer
- ✅ **Tracks 24h statistics** — monitors volume, momentum, volatility trends

She does **NOT**:
- ❌ **Open or close trades** — no execution control
- ❌ **Change guardrails** — no parameter modification
- ❌ **Override user settings** — respects manual control
- ❌ **Make autonomous decisions** — observation only

### Why Passive-Only?

This is **BY DESIGN**, not a temporary limitation:

1. The trading pipeline needed verification after V1 restoration
2. Active autonomous control requires complete system stability
3. Passive learning is collecting data for future optimization
4. Risk of introducing new variables during stabilization was too high

### When Lottie Becomes Active

**Active control returns in Phase 10/11** (depending on roadmap variant):

| Phase | Lottie Capability |
|-------|-------------------|
| **Current (Post-8.x)** | Passive observation only |
| **Phase 10** | Guardrail optimization (tentative) |
| **Phase 11** | Full autonomous tuning (tentative) |

Until then, Lottie remains a **learning engine**, not a **control engine**.

---

## 2.4 LATTi's Technical Architecture

### 2.4.1 Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      LATTI ECOSYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    guardrails_v2 (Database)                  ││
│  │      Single Source of Truth for all risk parameters          ││
│  └────────────────────────┬────────────────────────────────────┘│
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   LATTi Manager Service                      ││
│  │  - Reads current guardrail/filter values                     ││
│  │  - Applies optimization algorithms                           ││
│  │  - Respects manual override flags                            ││
│  │  - Updates values within safe bounds                         ││
│  └────────────────────────┬────────────────────────────────────┘│
│                           │                                      │
│           ┌───────────────┼───────────────┐                     │
│           ▼               ▼               ▼                     │
│  ┌────────────────┐ ┌───────────┐ ┌────────────────┐           │
│  │  Guardrail     │ │  Filter   │ │   Passive      │           │
│  │   Policy       │ │   V2      │ │   Learning     │           │
│  └────────────────┘ └───────────┘ └────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4.2 Service Files

| Service File | Purpose | Current Status |
|--------------|---------|----------------|
| `latti-manager.ts` | Core LATTi optimization engine | **Active** |
| `lottie-oversight-service.ts` | LATTi oversight and safety checks | **Active** |
| `guardrail-policy.ts` | Guardrail management and coherency | **Active** |
| `adaptive-guardrails.ts` | Adaptive guardrail adjustments | **Active** |
| `dhma-tuning-service.ts` | DHMA strategy optimization | **Active** |
| `baseline-indicator.ts` | Performance baseline tracking | **Active** |

### 2.4.3 Database Schema (guardrails_v2)

```sql
CREATE TABLE guardrails_v2 (
  id SERIAL PRIMARY KEY,
  mode VARCHAR NOT NULL,  -- 'paper' or 'live'
  
  -- Core Four Guardrails (user-visible)
  max_total_portfolio_exposure_pct DECIMAL DEFAULT 100,
  portfolio_risk_per_trade_pct DECIMAL DEFAULT 3,
  symbol_cooldown_minutes INTEGER DEFAULT 5,
  max_open_positions INTEGER DEFAULT 15,
  daily_loss_kill_switch_pct DECIMAL DEFAULT 5,
  max_position_percent_pct DECIMAL DEFAULT 25,
  
  -- Control Flags
  is_manual_override BOOLEAN DEFAULT FALSE,
  tuned_by_latti BOOLEAN DEFAULT TRUE,
  locked_by_user JSONB DEFAULT '{}',
  
  -- Kill Switch State
  kill_switch_tripped BOOLEAN DEFAULT FALSE,
  kill_switch_tripped_at TIMESTAMP,
  kill_switch_reason TEXT,
  
  -- Timestamps
  last_modified_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.4.4 Control Flow: Manual Override vs. LATTi-Managed

```
User Action (Toggle Switch)
    │
    ▼
┌─────────────────────────────────────────────┐
│  is_manual_override = true?                  │
│                                              │
│  YES → LATTi CANNOT modify this parameter    │
│        User has full control                 │
│        Input field enabled                   │
│        Badge: "Manual Override Active" 🟡    │
│                                              │
│  NO  → LATTi CAN modify this parameter       │
│        Autonomous optimization active        │
│        Input field disabled                  │
│        Badge: "Auto-tuned by LATTi" 🟢       │
└─────────────────────────────────────────────┘
```

### 2.4.5 RULE_005: Mutual Exclusivity

A critical coherency rule prevents conflicts:

```
RULE_005: is_manual_override AND tuned_by_latti cannot both be TRUE

If user enables manual override → tuned_by_latti automatically set to FALSE
If LATTi tuning enabled → is_manual_override must be FALSE
```

---

## 2.3 LATTi's Current Functionality

### 2.3.1 Core Four Guardrails (Managed by LATTi)

LATTi manages four critical risk parameters:

| Parameter | Default | Range | LATTi Behavior |
|-----------|---------|-------|----------------|
| **Max Total Portfolio Exposure %** | 100% | 0-100% | Auto-tunes within safe bounds |
| **Portfolio Risk per Trade %** | 3% | 0-10% | Optimizes based on win rate |
| **Symbol Cooldown (minutes)** | 5 | 1-60 | Adjusts based on trading velocity |
| **Max Open Positions** | 15 | 1-50 | Scales with portfolio size |
| **Daily Loss Kill Switch %** | 5% | 1-20% | Conservative, rarely adjusted |
| **Max Position Percent %** | 25% | 5-50% | Dynamic based on market conditions |

### 2.3.2 Filter Parameters (Managed by LATTi)

LATTi manages 16 filter parameters across 6 categories:

| Category | Filters | LATTi Optimization |
|----------|---------|-------------------|
| **Volume & Liquidity** | minVolume, minLiquidity | Adjusts based on market activity |
| **Price Range** | minPrice, maxPrice | Tunes for opportunity discovery |
| **Market Quality** | maxBidAskSpread | Optimizes for execution quality |
| **Technical Indicators** | rsiMin, rsiMax | Adapts to market regime |
| **Volatility** | volatilityMin, volatilityMax | Responds to market conditions |
| **Asset Type** | excludeStablecoins, allowRegulatedOnly | User preference-driven |

### 2.3.3 Passive Learning System

LATTi maintains a passive learning buffer that:

- Records cycle data every 30 seconds (FX5 scan results)
- Stores a 20-cycle FIFO buffer for pattern analysis
- Captures filter decisions with reasons
- Accumulates 24-hour statistics for trend detection
- Operates even when the trading engine is stopped

```
[REB2.10][LearningBuffer] Cycle 18 stored (buffer size: 17/20)
[FX5-24h] Recording paper cycle cycle_paper_c5wi5fjeYj2z - passive learning mode
```

---

## 2.4 LATTi User Interface

### 2.4.1 Goals Engine Integration

LATTi's controls are integrated into the Goals Engine UI:

```
┌─────────────────────────────────────────────────────────────────┐
│  ○ Core Guardrails (LATTi-Managed)    PAPER                     │
│  Autonomous risk parameters optimized by LATTi.                 │
│  Toggle to manual control when needed.                          │
│                                                   [Auto-tuned]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Max Total Portfolio Exposure  ⓘ                    LATTI  🔒   │
│  Maximum % of portfolio in open positions.                      │
│  Current Balance = $829.00                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  100                                                   %  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Portfolio Risk per Trade  ⓘ                        LATTI  🔒   │
│  How much portfolio to risk per trade.                          │
│  Current Balance = $829.00                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  3                                                     %  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4.2 Visual Language

| State | Icon | Badge | Input Field |
|-------|------|-------|-------------|
| LATTi Managed | 🔒 Green | "LATTI" (green) | Disabled |
| Manual Override | 🔓 Amber | "Manual" (amber) | Enabled |

### 2.4.3 Real-Time Synchronization

LATTi changes are broadcast via WebSocket:

```typescript
// WebSocket Events
'guardrail.override.changed'  // When lock state changes
'filters.override.changed'    // When filter mode changes
'config_update'               // Generic config change
```

All connected clients receive updates within 1 second.

---

## 2.5 LATTi Connection Points

### 2.5.1 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/guardrails-v2` | GET | Fetch current guardrail values + lock states |
| `/api/guardrails-v2` | PUT | Update guardrails (respects manual override) |
| `/api/filters-v2` | GET | Fetch filter values + LATTi/Manual states |
| `/api/filters-v2` | PUT | Update filter mode |
| `/api/guardrails-v2/kill-switch/trip` | POST | Trip kill switch (admin only) |
| `/api/guardrails-v2/kill-switch/reset` | POST | Reset kill switch (admin only) |

### 2.5.2 Trading Pipeline Integration

LATTi integrates with the trading pipeline through `checkGuardrailRisk()`:

```
┌─────────────────────────────────────────────────────────────────┐
│                    guardrails_v2 (DATABASE)                      │
│      Single Source of Truth for all risk parameters             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   guardrail-policy.ts                            │
│  - tripKillSwitch(mode, reason, lossPercent, threshold)         │
│  - resetKillSwitch(mode, reason)                                │
│  - validateCoherency(settings)                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    trade-safety.ts                               │
│  checkGuardrailRisk() - SINGLE PRE-TRADE GATE                   │
│  - Reads from guardrails_v2 via getGuardrailsV2()               │
│  - Returns { allowed: boolean, reason: string }                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              TRADING PIPELINE (PROTECTED)                        │
│  trading-engine.ts, trade-executor.ts,                          │
│  paper-execution-engine.ts, pre-execution-validator.ts          │
│  - All call checkGuardrailRisk() before executing               │
└─────────────────────────────────────────────────────────────────┘
```

---

# Part 3: The Transition Timeline

## 3.1 DawnTrader V1 → V2 Attempt (October-November 2025)

### What V1 Had

DawnTrader V1 was a functional, production-ready trading platform:

- **FX5 Scanner**: Evaluated 1550+ trading pairs
- **Filter Engine**: 20+ filter types
- **Strategy Engine**: 9 strategies (VWAP Pullback, ABCD Long, etc.)
- **Ready-to-Buy Queue**: FIFO with cooldown and deduplication
- **Paper Trading Engine**: Full simulation capability
- **Stage-3 Event Store**: Central state management

### Why V2 Was Attempted

V1 had accumulated technical debt from multiple sources:

**General Technical Debt:**
- Fragmented logic across modules
- No strict schemas
- Strategy engine relied on deprecated helpers
- Stage-3 state had become cluttered

**Walter Legacy Code Issues:**
- Walter's initial setup created many entangled modules and interfaces
- Walter's 20+ service files had become intertwined with core trading logic
- Many patterns from Walter's architecture had spread throughout the codebase
- Walter's API-dependent design left orphaned code paths when he was sidelined

**Note:** LATTi was already created at this point (October 2025) as a local alternative to Walter. LATTi's modular design meant she survived the V2 disaster while V1 components were corrupted.

V2 was intended to modernize everything, clean up Walter's legacy code, and implement a fresh architecture.

### Why V2 Failed

V2 suffered from "Partial Rewrite Syndrome":

1. **Not Isolated**: Rewrites happened in the same codebase as V1
2. **Incremental Destruction**: Partial rewrites broke dependencies
3. **Interface Mismatch**: New modules couldn't communicate with old ones
4. **No Rollback Path**: Changes overwrote working code

Result: **Total system collapse across all major subsystems.**

---

## 3.2 V1 Restoration via REB Phases (November 2025)

### REB 1.0 - 2.0: Foundation Repair

- System integrity diagnostics
- Database repair
- FX5 structure normalization
- Initial passive learning buffers

### REB 2.1 - 2.8: Data Integrity Restoration

- Filter engine stabilization (20+ filters)
- Passive learning framework
- History filter restoration
- Active filter pool fix
- 24h aggregator cleanup

### REB 2.9 - 2.12F: Strategy & Trading Restoration

- Full cycle drift detection
- Passive learning deep tests
- Trading engine wiring
- All 9 strategies restored and verified healthy
- DHMA strategy fully restored

### Outcome

DawnTrader V3 (post-REB) became "the strongest version ever built."

---

## 3.3 Walter Isolation (December 2025)

During restoration, Phase 8.8.3-H8 and H11 audits established:

1. Walter modules are **diagnostic-only**
2. Walter has **ZERO blocking capability** on trading
3. Walter cannot modify guardrails or kill switches
4. Walter remains fully functional but isolated from trading pipeline

This isolation allows:
- Walter's infrastructure to remain intact
- Future rebuild without starting from scratch
- Clear separation of concerns

---

## 3.4 LATTi's Post-V1-Restoration State (November-December 2025)

### Kept in Observational Mode

After DawnTrader V1 was restored, LATTi was intentionally kept in **observational mode** during the stabilization period. This was a deliberate decision:

**Reasons for Observational Mode:**
- The trading pipeline needed to be verified stable before autonomous optimization
- Focus was on restoring core trading functionality first
- LATTi's passive learning continued to collect data for future optimization
- Risk of introducing new variables during critical restoration phases

### Observational Mode Characteristics

During this period, LATTi:
- **Did NOT** actively modify guardrails or filters
- **Did** continue passive learning (collecting FX5 cycle data)
- **Did** maintain the 20-cycle buffer for pattern analysis
- **Did** track 24-hour statistics for trend detection
- **Was** accessible in the UI but not actively tuning

### Full Restoration Planned

The roadmap includes complete LATTi restoration:
- Full autonomous guardrail optimization
- Active filter tuning based on market conditions
- Integration with the Strategic Drive Index (SDI)
- Adaptive learning system for preset boundary optimization

### Current Operational State (December 2025)

LATTi is now fully operational:

1. **Phase 3 Implementation**: Guardrails v2 schema with control flags
2. **Manual Override System**: Per-parameter lock/unlock capability
3. **Passive Learning**: 20-cycle buffer operational
4. **Real-Time Sync**: WebSocket broadcasts for instant updates
5. **Goals Engine Integration**: Full UI for LATTi controls
6. **Core Four Guardrails**: Active management of primary risk parameters

---

# Part 4: Current System State (December 2025)

## 4.1 Walter Status: Demoted and Deferred, Not Abandoned

### The Important Distinction

**Walter was never killed conceptually. He was demoted and deferred.**

The decision was not "Walter is bad" — it was "Walter cannot be a real-time execution dependency."

| Aspect | Status | Notes |
|--------|--------|-------|
| **Chat Functionality** | Active but isolated | Can receive/respond to messages |
| **Memory System** | Functional | Stores/retrieves memories |
| **Expert Corpus** | Complete | 80 principles available |
| **Trading Integration** | BLOCKED | Cannot influence trading pipeline |
| **Kill Switch Control** | BLOCKED | Cannot trip or reset |
| **Guardrail Modification** | BLOCKED | Read-only access |
| **UI Presence** | Active | Accessible via sidebar |
| **Rebuild Readiness** | HIGH | All infrastructure preserved |

### Walter's Future (Phase 13)

Walter returns in Phase 13 as:

| Role | Description |
|------|-------------|
| **Long-horizon advisor** | Strategic guidance, not real-time decisions |
| **Analytics engine** | Pattern analysis, performance insights |
| **Simulation & suggestion layer** | "What-if" scenarios, strategy recommendations |
| **Full conversational AI** | Chat-based interaction restored |

**The critical constraint**: Walter will **never again be a real-time execution dependency**.

His future role is **advisory and strategic** — operating on a different timescale than the trading engine. He will analyze, suggest, and advise, but Lottie (or the user) will control real-time execution.

---

## 4.2 LATTi/Lottie Status: Passive-Only, Learning Active

### Current Operational State

**Lottie is currently PASSIVE-ONLY by design.** Her infrastructure is operational, but she is observing rather than controlling.

| Aspect | Status | Notes |
|--------|--------|-------|
| **Telemetry Observation** | ✅ Active | Monitors engine state, metrics |
| **Outcome Recording** | ✅ Active | Tracks trade results, win-rates |
| **Passive Learning** | ✅ Active | 20-cycle buffer collecting data |
| **24h Statistics** | ✅ Active | Volume, momentum, volatility |
| **Manual Override System** | ✅ Functional | Users can control parameters |
| **UI Integration** | ✅ Complete | Goals Engine tab |
| **WebSocket Sync** | ✅ Active | Sub-1-second updates |
| **Dual Mode Support** | ✅ Active | Paper + Live modes |
| **Trade Execution Control** | ❌ Disabled | Opens/closes trades: NO |
| **Guardrail Modification** | ❌ Disabled | Changes parameters: NO |
| **Autonomous Decisions** | ❌ Disabled | Self-directed actions: NO |

### Why Passive-Only Is Correct

This is the **intended state**, not a bug or limitation:
1. Trading pipeline stability must be verified first
2. Passive learning collects optimization data
3. Active control returns in Phase 10/11
4. Risk mitigation during post-V1-restoration period

### LATTi Operational Metrics

```
Current Balance Source: /api/paper-sim/portfolio-summary (cashBalance)
Refresh Interval: 5 seconds
Passive Learning Buffer: 20 cycles
FX5 Scan Interval: 30 seconds
WebSocket Broadcast Latency: <100ms
```

---

## 4.3 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     DAWNTRADER V3                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    TRADING PIPELINE                          ││
│  │  FX5 Scanner → Filters → Strategies → Ready-to-Buy → Trade  ││
│  │                          │                                   ││
│  │                          ▼                                   ││
│  │              checkGuardrailRisk() GATE                       ││
│  │                          │                                   ││
│  │                          ▼                                   ││
│  │                   guardrails_v2                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                          ▲                                       │
│                          │                                       │
│           ┌──────────────┴──────────────┐                       │
│           │                             │                       │
│  ┌────────┴────────┐         ┌─────────┴─────────┐             │
│  │     LATTi       │         │      Walter       │             │
│  │  (ACTIVE)       │         │   (ISOLATED)      │             │
│  │                 │         │                   │             │
│  │ • Guardrails    │         │ • Chat System     │             │
│  │ • Filters       │         │ • Memory          │             │
│  │ • Optimization  │         │ • Expert Corpus   │             │
│  │ • Learning      │         │ • Intent Gateway  │             │
│  │                 │         │                   │             │
│  │ CAN WRITE ──────┼────────►│ READ ONLY         │             │
│  └─────────────────┘         └───────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# Part 5: Lessons Learned

## 5.1 From the Walter → Lottie Transition

### The Canonical Lesson

The most critical lesson from Walter's implementation:

> **Walter wasn't "wrong" — he was in the wrong place in the architecture.**

### What Actually Happened

| Event | Lesson |
|-------|--------|
| **Walter was API-dependent** | External dependencies create latency, rate limits, and cost issues |
| **Real-time trading needs speed** | 2-8 second API calls are incompatible with sub-second trading decisions |
| **Rate-limit throttling occurred** | OpenAI limits constrained interactions during active trading |
| **Instability during live loops** | Trading engine couldn't wait for Walter's responses |
| **Decision: Turn Walter off entirely** | Not partial — complete removal from real-time path |
| **Replacement: Fully local system** | What evolved into Lottie's internal role |

### The Solution Formula

```
If (operation requires real-time response) + (operation will be called frequently):
    → Build it LOCAL, not API-dependent
    → Put "AI inside the engine, not outside it"
```

### The Canonical Architecture

| System | Role | Timing | Dependencies |
|--------|------|--------|--------------|
| **Lottie** | Real-time optimization | Continuous | None (local) |
| **Walter** | Strategic advisor | Offline | OpenAI API (isolated) |

This separation is permanent. Walter's future role (Phase 13) is **advisory only**, never again a real-time execution dependency.

---

## 5.2 From the V2 Failure

1. **Never do partial rewrites** — Either isolate completely or don't start
2. **Type guarantees matter** — Loose typing caused cascading failures
3. **Event-driven architecture is fragile** — One broken event breaks everything
4. **Incremental improvement beats revolution** — V3 succeeded by fixing incrementally

## 5.3 From the Walter Isolation

1. **Isolation enables future flexibility** — Walter can be rebuilt without starting over
2. **Clear boundaries prevent interference** — Trading pipeline is protected
3. **Documentation preserves intent** — This document enables future developers
4. **Infrastructure preservation is strategic** — All Walter services remain functional

## 5.4 From the LATTi Implementation

1. **Single source of truth is critical** — `guardrails_v2` is authoritative
2. **User override must be respected** — Manual control always wins
3. **Real-time sync builds trust** — WebSocket updates show system is responsive
4. **Passive learning enables future optimization** — Data collection continues always

---

# Appendix A: File Reference

## Walter Service Files
```
server/services/walter-memory.ts
server/services/walter-purpose.ts
server/services/walter-chat-lifecycle.ts
server/services/walter-expert-corpus.ts
server/services/walter-response-templates.ts
server/services/walter-reasoning-templates.ts
server/services/walter-personality.ts
server/services/walter-cognitive-layer.ts
server/services/walter-health-monitor.ts
server/services/walter-intent-gateway.ts
server/services/walter-ops-engine.ts
server/services/walter-ingest.ts
server/services/walter-tts.ts
server/services/walter-feedback.ts
server/services/walter-data-pipeline.ts
server/services/walter-standby.ts
server/services/walter-knowledge-refresh.ts
server/services/walter-patch-analyst.ts
server/services/walter-adaptive-heuristics.ts
server/services/walter-reference-tracker.ts
```

## LATTi Service Files
```
server/services/latti-manager.ts
server/services/lottie-oversight-service.ts
server/services/guardrail-policy.ts
server/services/adaptive-guardrails.ts
server/services/dhma-tuning-service.ts
server/services/baseline-indicator.ts
```

## Key Documentation Files
```
docs/walter-expert-corpus-v1.md
docs/walter-ai-response-workflow.md
docs/walter-prompt-template.md
docs/manual_override_behavior.md
docs/ui_override_behavior.md
docs/schema_guardrails_v2_overview.md
docs/audits/phase_8.8.3-H11_autonomy_walter_isolation.md
docs/history and references/DawnTrader V1 Restoration after Failed V2 Build - Phases 0 - 7.md
docs/history and references/DawnTrader V3 8.6 through 8.7 Rebuild and Restoration Report.md
```

---

# Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Walter** | AI SysAdmin Co-Pilot — conversational trading advisor (currently isolated) |
| **LATTi** | Learning Autonomous Trading Tuning Intelligence — autonomous parameter optimizer |
| **Lottie** | Alternative spelling/reference to LATTi in some documentation |
| **guardrails_v2** | Database table storing all risk parameters |
| **Core Four** | The four primary guardrail parameters visible to users |
| **Manual Override** | User taking control of a parameter from LATTi |
| **Passive Learning** | Data collection that occurs even when engine is stopped |
| **FX5** | Five-minute data scanner evaluating trading pairs |
| **REB** | Rebuild phases that restored V1 after V2 failure |
| **Stage-3** | Central state store for event-driven architecture |
| **Kill Switch** | Emergency stop that halts all trading when triggered |

---

**Document Status:** Complete  
**Next Review:** Upon Phase 13 Walter rebuild initiation
