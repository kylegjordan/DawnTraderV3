# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query, featuring a mobile-first, responsive design with dynamic mode-aware UI, voice transcription, and a System Truth Panel. The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Data storage is handled by PostgreSQL via Neon serverless driver and Drizzle ORM.

Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. The system supports 8 automated trading strategies, multi-layered risk management, and a Continuous Learning Engine (CLE). Authentication uses username/password with bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, provides insights and an AI SysAdmin Co-Pilot named Walter handles system configuration and optimization. Walter operates with a Unified Command & Conversation Layer, Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. A Paper Trading Simulation Engine provides real-time execution.

The system incorporates a multi-module intelligent caching system (Bob Core) and a Hybrid Cortex Intelligent Memory Layer. System Health & Diagnostic Intelligence includes `SystemHealthMonitor` and a `SelfRepairService` for automated recovery. A Natural Language Action Interpreter (NLAI) and Contextual Intent Engine (CIE) enable Walter's understanding and command execution.

The Real-Time Execution Layer includes `MarketDataWebSocket`, `ExecutionTimingService`, `SlippageFeeModelingService`, `RateControlService`, `MarketDataCoordinator`, `RealtimePaperExecutor`, and `ParityGateService`. Unified Portfolio & Strategy State ensures a single source of truth, maintained by a `portfolio_state` database table and `StrategySync` Service. System Truth Synchronization & Context Refresh establishes cross-layer data consistency validation.

Walter features a Hybrid Cognitive-Operational architecture with a Cognitive Layer for intent reflection and an Intent Gateway for validating operational commands with RBAC, risk assessment, and audit logging. Unified Conversational Walter routes all system outputs through natural language interpretation via a Cognitive Interpreter Service and Event Broker.

Data Provenance & Source Governance ensures end-to-end traceability with `data_lineage` and `bob_trace_log` tables. Schema Binding Validation & Learning Alignment provides comprehensive validation of data sources and cognitive learning alignment. A Purpose Layer (`purpose-layer.ts`) loads system purposes, and Corpus Domain Rebinding (`corpus-domain-service.ts`) manages knowledge domains.

Secure-Core Mode Toggle (`SecureCoreService`) restricts Walter's domains when enabled. The Continuous Learning Pipeline extends the Event Broker to capture trade events, generate insights, and transfer knowledge from paper to live trading.

A State Awareness Layer (`StateAwarenessService`) provides a single authoritative snapshot of the entire system state for Walter and UI components, which is injected into Walter's system prompt. An Intent Execution Framework provides safe, audited execution of validated intents from Walter AI with full RBAC, state validation, and provenance tracking, logging operations to `intent_audit_log`. A Pre-Execution Validator (`pre-execution-validator.ts`) ensures every trade intent undergoes comprehensive validation for risk compliance, goal alignment, and execution readiness before placement.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.