-- ═══════════════════════════════════════════════════════════════════════════
-- B-NEW-43 Phase 2 chunk 4 (2026-05-23): Initial schema — captures the state
-- that existed on staging Supabase before B65.1-HF3 (2026-04-23) introduced
-- the file-based db-migrate.ts runner. Every subsequent migration in
-- drizzle/migrations/ is a delta against this baseline.
--
-- Source: pg_dump --schema-only --no-owner --no-privileges --schema=public
--         --no-comments against staging Supabase (PG 17.6), 2026-05-23.
-- Cleaned: stripped psql meta-commands (backslash-restrict / backslash-unrestrict);
--          CREATE SCHEMA public → CREATE SCHEMA IF NOT EXISTS public.
-- All other CREATE TABLE / TYPE / INDEX / SEQUENCE / VIEW statements emit
-- as-is per Langston Q3.6 idempotency policy (hard-fail if a fresh PG already
-- has them — signals state inconsistency).
--
-- Staging coordination: this migration MUST be marked applied on staging
-- before the next db:migrate run on staging, via the script at
-- 1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql.
-- See SYSTEM_MANUAL.md "DB bootstrap (B-NEW-43 Phase 2 chunk 4)" section
-- for the bootstrap-from-dump-vs-fresh-empty-PG branch.
-- ═══════════════════════════════════════════════════════════════════════════

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: agent_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_state AS ENUM (
    'active',
    'idle',
    'suspended',
    'terminated'
);


--
-- Name: alignment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alignment_status AS ENUM (
    'compliant',
    'at_risk',
    'violated'
);


--
-- Name: alignment_strategy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alignment_strategy AS ENUM (
    'accept',
    'reject',
    'blend'
);


--
-- Name: alignment_verification_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alignment_verification_result AS ENUM (
    'approved',
    'flagged',
    'rejected'
);


--
-- Name: approval_display_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_display_mode AS ENUM (
    'inline',
    'notification'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'dismissed'
);


--
-- Name: audit_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_entity_type AS ENUM (
    'guardrails',
    'filters'
);


--
-- Name: autonomy_action_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.autonomy_action_type AS ENUM (
    'self_check',
    'self_reasoning',
    'exploration',
    'optimization'
);


--
-- Name: awareness_emotional_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.awareness_emotional_state AS ENUM (
    'stable',
    'focused',
    'alert',
    'fatigued',
    'overloaded',
    'recovering'
);


--
-- Name: behavioral_trigger_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.behavioral_trigger_type AS ENUM (
    'adaptive_change',
    'user_override',
    'risk_trigger',
    'performance_feedback',
    'coherency_violation'
);


--
-- Name: bias_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bias_type AS ENUM (
    'confirmation',
    'recency',
    'anchoring',
    'overconfidence',
    'availability',
    'optimism'
);


--
-- Name: bus_event_topic; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bus_event_topic AS ENUM (
    'task_assigned',
    'task_completed',
    'node_status_change',
    'rebalance_triggered',
    'circuit_breaker',
    'health_alert',
    'learning_delta',
    'model_sync'
);


--
-- Name: circuit_breaker_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.circuit_breaker_state AS ENUM (
    'closed',
    'open',
    'half_open'
);


--
-- Name: cluster_task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cluster_task_status AS ENUM (
    'queued',
    'assigned',
    'running',
    'completed',
    'failed',
    'cancelled'
);


--
-- Name: cluster_task_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cluster_task_type AS ENUM (
    'trading_signal',
    'market_analysis',
    'risk_assessment',
    'compliance_check',
    'research',
    'optimization',
    'general'
);


--
-- Name: cognitive_test_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cognitive_test_result AS ENUM (
    'PASS',
    'WARN',
    'FAIL'
);


--
-- Name: collaboration_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.collaboration_role AS ENUM (
    'coordinator',
    'analyst',
    'executor',
    'reviewer',
    'observer'
);


--
-- Name: compliance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.compliance_status AS ENUM (
    'compliant',
    'warning',
    'violation',
    'override'
);


--
-- Name: conflict_resolution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conflict_resolution AS ENUM (
    'open',
    'resolved',
    'escalated'
);


--
-- Name: consensus_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consensus_state AS ENUM (
    'forming',
    'discussing',
    'evaluating',
    'agreed',
    'disagreed',
    'overridden'
);


--
-- Name: daily_brief_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.daily_brief_status AS ENUM (
    'in_progress',
    'final'
);


--
-- Name: domain_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.domain_channel AS ENUM (
    'research_to_trading',
    'compliance_to_trading',
    'analytics_to_research',
    'trading_to_analytics'
);


--
-- Name: ethical_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ethical_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


--
-- Name: ethical_verdict; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ethical_verdict AS ENUM (
    'approved',
    'rejected',
    'requires_review'
);


--
-- Name: evaluation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evaluation_status AS ENUM (
    'pending',
    'simulating',
    'completed',
    'failed'
);


--
-- Name: event_significance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_significance AS ENUM (
    'minor',
    'significant',
    'critical'
);


--
-- Name: execution_block_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_block_reason AS ENUM (
    'KILL_SWITCH',
    'NO_STOP_LOSS',
    'INVALID_STOP_LOSS',
    'POSITION_LIMIT',
    'COOLDOWN',
    'MAX_POSITION',
    'LPCP_LOW_PRICE',
    'LPCP_MIN_NOTIONAL',
    'FX_CONVERSION_FAILED',
    'PORTFOLIO_RISK',
    'INSUFFICIENT_BALANCE',
    'MAX_EXPOSURE',
    'MAX_TRADES',
    'MAX_TOTAL_EXPOSURE'
);


--
-- Name: execution_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_decision AS ENUM (
    'OPENED',
    'BLOCKED'
);


--
-- Name: execution_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_event_type AS ENUM (
    'trade',
    'balance_update',
    'risk_report',
    'engine_event',
    'anomaly',
    'strategy_signal'
);


--
-- Name: federated_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.federated_scope AS ENUM (
    'global',
    'trading',
    'devops',
    'ux',
    'fullstack'
);


--
-- Name: feedback_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.feedback_source AS ENUM (
    'self',
    'peer',
    'system'
);


--
-- Name: gate_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gate_type AS ENUM (
    'safety',
    'federated_ethics',
    'ethical_reasoning',
    'knowledge_acquisition'
);


--
-- Name: goals_preset_name; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goals_preset_name AS ENUM (
    'conservative',
    'baseline',
    'optimistic',
    'maximum',
    'custom'
);


--
-- Name: knowledge_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.knowledge_source AS ENUM (
    'web',
    'api',
    'research',
    'market',
    'internal'
);


--
-- Name: learning_delta_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learning_delta_type AS ENUM (
    'model_update',
    'discovery',
    'insight',
    'strategy_adjustment',
    'risk_parameter'
);


--
-- Name: learning_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learning_mode AS ENUM (
    'slow',
    'normal',
    'aggressive',
    'disabled'
);


--
-- Name: learning_phase; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learning_phase AS ENUM (
    'observation',
    'adjustment',
    'evaluation'
);


--
-- Name: market_regime; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.market_regime AS ENUM (
    'EXTREME_NOISE',
    'BULL_STABLE',
    'BULL_VOLATILE',
    'BEAR_STABLE',
    'BEAR_VOLATILE',
    'LOW_VOL_CHOP'
);


--
-- Name: memory_audit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.memory_audit_status AS ENUM (
    'VERIFIED',
    'UNVERIFIED',
    'REPAIRED'
);


--
-- Name: memory_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.memory_scope AS ENUM (
    'short_term',
    'medium_term',
    'long_term'
);


--
-- Name: meta_analysis_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meta_analysis_result AS ENUM (
    'coherent',
    'inconsistent',
    'requires_correction'
);


--
-- Name: node_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.node_role AS ENUM (
    'coordinator',
    'trading',
    'research',
    'analysis',
    'compliance',
    'general'
);


--
-- Name: node_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.node_status AS ENUM (
    'healthy',
    'degraded',
    'draining',
    'offline'
);


--
-- Name: opportunity_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.opportunity_status AS ENUM (
    'new',
    'watchlist',
    'executed',
    'dismissed',
    'expired'
);


--
-- Name: opportunity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.opportunity_type AS ENUM (
    'long_term_hold',
    'moonshot',
    'momentum',
    'breakout',
    'mean_reversion'
);


--
-- Name: optimization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.optimization_type AS ENUM (
    'parameter_tuning',
    'architecture_adjustment',
    'policy_refinement'
);


--
-- Name: outcome_confidence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.outcome_confidence AS ENUM (
    'very_low',
    'low',
    'medium',
    'high',
    'very_high'
);


--
-- Name: outcome_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.outcome_status AS ENUM (
    'success',
    'partial',
    'failed',
    'timeout'
);


--
-- Name: oversight_flag_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.oversight_flag_type AS ENUM (
    'instability',
    'bias',
    'low_confidence',
    'conflict',
    'performance_drop'
);


--
-- Name: patch_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.patch_severity AS ENUM (
    'critical',
    'high',
    'medium',
    'low',
    'info'
);


--
-- Name: patch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.patch_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'applied'
);


--
-- Name: pattern_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pattern_type AS ENUM (
    'PINBAR',
    'ENGULFING',
    'INSIDE_BAR',
    'MORNING_STAR',
    'THREE_SOLDIERS'
);


--
-- Name: plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed'
);


--
-- Name: policy_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.policy_type AS ENUM (
    'ethical',
    'functional',
    'operational',
    'risk'
);


--
-- Name: principle_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.principle_type AS ENUM (
    'foundational',
    'operational',
    'contextual'
);


--
-- Name: propagation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.propagation_status AS ENUM (
    'pending',
    'success',
    'failed',
    'retrying'
);


--
-- Name: quality_rating; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quality_rating AS ENUM (
    'poor',
    'fair',
    'good',
    'excellent'
);


--
-- Name: reasoning_queue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reasoning_queue_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed'
);


--
-- Name: reflection_depth; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reflection_depth AS ENUM (
    'surface',
    'analytical',
    'deep',
    'meta'
);


--
-- Name: retrieval_trust_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.retrieval_trust_level AS ENUM (
    'low',
    'medium',
    'high',
    'verified'
);


--
-- Name: rtb_signal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rtb_signal_status AS ENUM (
    'queued',
    'promoted',
    'expired',
    'rejected',
    'reconfirmed',
    'active'
);


--
-- Name: safety_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.safety_scope AS ENUM (
    'global',
    'trading',
    'autonomy',
    'analysis'
);


--
-- Name: safety_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.safety_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: scenario_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.scenario_type AS ENUM (
    'risk_assessment',
    'strategy_optimization',
    'market_condition',
    'decision_replay',
    'what_if_analysis'
);


--
-- Name: signal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.signal_type AS ENUM (
    'QUANT',
    'PATTERN',
    'HYBRID'
);


--
-- Name: strategy_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.strategy_type AS ENUM (
    'vwap_pullback',
    'abcd_long',
    'sma_trend_ride',
    'breakout',
    'mean_reversion',
    'range_trading',
    'vwap_bounce',
    'liquidity_trap',
    'dhma',
    'range_trade',
    'momentum_breakout',
    'volatility_squeeze',
    'trend_following',
    'range_bound',
    'breakout_pullback',
    'divergence',
    'accumulation_distribution',
    'order_flow',
    'morning_star',
    'inside_bar_reversal',
    'support_bounce',
    'pivot_shift',
    'reverse_impulse',
    'defensive_hedge',
    'adaptive_flow',
    'volatility_edge',
    'strong_bull_trend'
);


--
-- Name: trace_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trace_stage AS ENUM (
    'filter',
    'strategy',
    'signal'
);


--
-- Name: trade_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trade_status AS ENUM (
    'open',
    'closed',
    'cancelled'
);


--
-- Name: trade_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trade_type AS ENUM (
    'buy',
    'sell'
);


--
-- Name: trading_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trading_mode AS ENUM (
    'live',
    'paper',
    'passive',
    'learning'
);


--
-- Name: trading_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trading_status AS ENUM (
    'active',
    'stopped'
);


--
-- Name: tuning_aggressiveness; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tuning_aggressiveness AS ENUM (
    'conservative',
    'balanced',
    'aggressive'
);


--
-- Name: tuning_approval_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tuning_approval_type AS ENUM (
    'auto',
    'manual'
);


--
-- Name: tuning_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tuning_status AS ENUM (
    'pending',
    'success',
    'failed'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'editor',
    'viewer'
);


--
-- Name: value_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.value_category AS ENUM (
    'safety',
    'fairness',
    'transparency',
    'accountability',
    'user_welfare'
);


--
-- Name: violation_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.violation_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: walter_action_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_action_category AS ENUM (
    'feed',
    'formula',
    'system',
    'risk',
    'performance'
);


--
-- Name: walter_action_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_action_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'acknowledged',
    'approved',
    'rejected'
);


--
-- Name: walter_action_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_action_type AS ENUM (
    'feed_reconnect',
    'feed_pause',
    'formula_recalc',
    'cache_refresh',
    'health_check',
    'threshold_adjust',
    'auto_suppress',
    'escalate'
);


--
-- Name: walter_chat_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_chat_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: walter_memory_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_memory_type AS ENUM (
    'observation',
    'decision',
    'result',
    'goal',
    'lesson',
    'purpose',
    'system_state',
    'development_history',
    'contextual_reference'
);


--
-- Name: walter_theme; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_theme AS ENUM (
    'light',
    'dark',
    'system'
);


--
-- Name: walter_tone; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_tone AS ENUM (
    'professional',
    'analytical',
    'warm',
    'concise'
);


--
-- Name: walter_view_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.walter_view_mode AS ENUM (
    'compact',
    'expanded'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum text
);


--
-- Name: actuation_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actuation_policies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    variable_name character varying(100) NOT NULL,
    variable_category character varying(50) NOT NULL,
    min_value numeric(20,8) NOT NULL,
    max_value numeric(20,8) NOT NULL,
    step_size numeric(20,8) NOT NULL,
    cooldown_hours integer DEFAULT 24,
    max_daily_changes integer DEFAULT 3,
    confidence_threshold integer DEFAULT 70,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: adaptive_learning; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adaptive_learning (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    strategy_id character varying(50) NOT NULL,
    mode public.trading_mode NOT NULL,
    regime public.market_regime NOT NULL,
    weights jsonb NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_learning_delta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_learning_delta (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    origin_node_id character varying NOT NULL,
    delta_type public.learning_delta_type NOT NULL,
    payload jsonb NOT NULL,
    payload_hash character varying(64) NOT NULL,
    trace_id character varying NOT NULL,
    trust_score double precision DEFAULT 0.5 NOT NULL,
    recency_score double precision DEFAULT 1.0 NOT NULL,
    success_rate double precision DEFAULT 0.0 NOT NULL,
    overall_score double precision DEFAULT 0.0 NOT NULL,
    is_accepted boolean DEFAULT false NOT NULL,
    accepted_by character varying,
    accepted_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_learning_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_learning_feedback (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    agent_name character varying(100) NOT NULL,
    domain character varying(100) NOT NULL,
    session_id character varying(50),
    feedback_source public.feedback_source NOT NULL,
    accuracy_score double precision,
    consensus_alignment double precision,
    improvement_notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_registry (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    agent_name character varying(100) NOT NULL,
    domain character varying(100) NOT NULL,
    state public.agent_state DEFAULT 'active'::public.agent_state NOT NULL,
    performance double precision DEFAULT 0.5 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    action_type character varying(100) NOT NULL,
    setting_name character varying(100),
    old_value jsonb,
    new_value jsonb,
    confirmation_method character varying(50),
    gpt_response text,
    status character varying(20) DEFAULT 'completed'::character varying
);


--
-- Name: ai_chat_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    conversation_id character varying,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    total_tokens integer NOT NULL,
    estimated_cost numeric(10,6) NOT NULL,
    model character varying(50) DEFAULT 'gpt-4o'::character varying,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    messages jsonb NOT NULL,
    context jsonb,
    last_updated timestamp with time zone DEFAULT now(),
    title text DEFAULT 'New Chat'::text,
    max_context_messages integer DEFAULT 20,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_lessons (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    lesson_type character varying(50) NOT NULL,
    symbol character varying(20),
    strategy public.strategy_type,
    lesson text NOT NULL,
    confidence numeric(5,2),
    trade_id character varying,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: ai_market_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_market_analyses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    mode public.trading_mode NOT NULL,
    regime text NOT NULL,
    confidence integer,
    summary text,
    recommendations jsonb,
    snapshot jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_opportunities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    run_id character varying,
    symbol character varying(20) NOT NULL,
    type public.opportunity_type NOT NULL,
    entry_zone jsonb NOT NULL,
    stop_floor numeric(20,8) NOT NULL,
    target_ceiling jsonb NOT NULL,
    time_horizon character varying(50),
    risk_amount_rule jsonb,
    notes text,
    probability_score integer,
    risk_reward_rating numeric(5,2),
    eligibility_flags jsonb,
    status public.opportunity_status DEFAULT 'new'::public.opportunity_status,
    executed_trade_id character varying,
    conversation_id character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_opportunity_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_opportunity_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    pairs_considered integer DEFAULT 0,
    pairs_sent_to_ai integer DEFAULT 0,
    opportunities_created integer DEFAULT 0,
    model_used character varying(50) DEFAULT 'gpt-4o-mini'::character varying,
    input_tokens_est integer DEFAULT 0,
    output_tokens_est integer DEFAULT 0,
    cost_estimate numeric(10,6) DEFAULT '0'::numeric,
    errors jsonb,
    sample_payload jsonb
);


--
-- Name: ai_orchestrator_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_orchestrator_logs (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    category character varying(50) NOT NULL,
    recommendation text NOT NULL,
    action_taken text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    urgency_level character varying(20) DEFAULT 'low'::character varying,
    metadata jsonb
);


--
-- Name: ai_orchestrator_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_orchestrator_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_orchestrator_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_orchestrator_logs_id_seq OWNED BY public.ai_orchestrator_logs.id;


--
-- Name: ai_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    report_type character varying(50) NOT NULL,
    period character varying(50) NOT NULL,
    content text NOT NULL,
    insights jsonb,
    recommendations jsonb,
    metrics jsonb,
    generated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_transparency_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_transparency_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    task_name character varying(100) NOT NULL,
    mode public.trading_mode,
    executed_at timestamp with time zone DEFAULT now(),
    duration numeric(10,3),
    result_summary text,
    success boolean NOT NULL,
    notes text
);


--
-- Name: alignment_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alignment_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    audit_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    verification_result public.alignment_verification_result NOT NULL,
    proposed_change jsonb NOT NULL,
    violated_policies text[] DEFAULT ARRAY[]::text[],
    alignment_score double precision,
    recommendations text[] DEFAULT ARRAY[]::text[],
    metadata jsonb
);


--
-- Name: alignment_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alignment_policies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    policy_id character varying(50) NOT NULL,
    policy_type public.policy_type NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    constraints jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_capabilities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    asset_type character varying(20) NOT NULL,
    allows_fractional boolean DEFAULT true NOT NULL,
    lot_size numeric(20,8) NOT NULL,
    tick_size numeric(20,8) NOT NULL,
    min_notional numeric(10,2) NOT NULL,
    fees_model character varying(50) DEFAULT 'maker_taker'::character varying,
    venue character varying(50) NOT NULL,
    last_synced timestamp with time zone DEFAULT now(),
    metadata jsonb
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    entity_type public.audit_entity_type NOT NULL,
    field character varying(100) NOT NULL,
    old_value text,
    new_value text,
    changed_by character varying NOT NULL,
    trading_mode public.trading_mode NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: autonomy_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autonomy_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    action_type public.autonomy_action_type NOT NULL,
    trigger_source character varying(50) NOT NULL,
    trace_id character varying(50),
    assessment_result jsonb NOT NULL,
    actions_triggered text[] DEFAULT ARRAY[]::text[],
    success boolean NOT NULL,
    execution_time_ms integer,
    metadata jsonb
);


--
-- Name: awareness_state_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.awareness_state_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    state_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_id character varying(50),
    health_score double precision NOT NULL,
    cognitive_score double precision NOT NULL,
    emotional_state public.awareness_emotional_state NOT NULL,
    dominant_domain character varying(50),
    active_domains text[] DEFAULT ARRAY[]::text[],
    mission_focus text,
    recent_actions jsonb,
    reflection_summary text,
    confidence_score double precision,
    anomaly_detected boolean DEFAULT false,
    metadata jsonb
);


--
-- Name: b62_retroactive_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b62_retroactive_labels (
    id bigint NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    asset_class text NOT NULL,
    trade_opened_at timestamp with time zone NOT NULL,
    original_label text,
    retroactive_label text,
    label_diff_flag boolean NOT NULL,
    classifier_version_original text,
    classifier_version_retroactive text,
    retroactive_inputs jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    labeled_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: b62_retroactive_labels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.b62_retroactive_labels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b62_retroactive_labels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.b62_retroactive_labels_id_seq OWNED BY public.b62_retroactive_labels.id;


--
-- Name: behavioral_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.behavioral_log (
    id integer NOT NULL,
    trading_mode public.trading_mode NOT NULL,
    parameter character varying(100) NOT NULL,
    old_value text,
    new_value text NOT NULL,
    trigger_type public.behavioral_trigger_type NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: behavioral_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.behavioral_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: behavioral_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.behavioral_log_id_seq OWNED BY public.behavioral_log.id;


--
-- Name: behavioral_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.behavioral_state (
    id integer NOT NULL,
    mode character varying(10) NOT NULL,
    confidence_delta double precision DEFAULT 0.0 NOT NULL,
    drawdown_penalty double precision DEFAULT 0.0 NOT NULL,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: behavioral_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.behavioral_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: behavioral_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.behavioral_state_id_seq OWNED BY public.behavioral_state.id;


--
-- Name: bias_correction_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bias_correction_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    bias_type public.bias_type NOT NULL,
    correction_strategy character varying(100) NOT NULL,
    parameter_adjustments jsonb NOT NULL,
    effectiveness_score double precision,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bias_observation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bias_observation_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    bias_type public.bias_type NOT NULL,
    detected_context text NOT NULL,
    confidence_score double precision NOT NULL,
    decision_id character varying(100),
    impact_assessment text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bob_trace_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bob_trace_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    bob_module character varying(50) NOT NULL,
    operation character varying(50) NOT NULL,
    source_table character varying(100),
    mode public.trading_mode,
    global_context_id character varying(50),
    cache_hit boolean,
    execution_time_ms integer,
    row_count integer,
    metadata jsonb
);


--
-- Name: cluster_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    task_id character varying NOT NULL,
    node_id character varying NOT NULL,
    user_id character varying,
    gate_type public.gate_type NOT NULL,
    gate_passed boolean NOT NULL,
    gate_result text,
    execution_time_ms integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cluster_bus_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_bus_event (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    topic public.bus_event_topic NOT NULL,
    source_node character varying(100),
    payload jsonb NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cluster_circuit_breaker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_circuit_breaker (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    node_id character varying NOT NULL,
    state public.circuit_breaker_state DEFAULT 'closed'::public.circuit_breaker_state NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    last_failure_at timestamp with time zone,
    last_success_at timestamp with time zone,
    state_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    next_retry_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cluster_node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_node (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    role public.node_role NOT NULL,
    status public.node_status DEFAULT 'healthy'::public.node_status NOT NULL,
    version character varying(50),
    last_heartbeat timestamp with time zone DEFAULT now() NOT NULL,
    capacity integer DEFAULT 100 NOT NULL,
    current_load integer DEFAULT 0 NOT NULL,
    cpu_usage double precision,
    memory_usage double precision,
    queue_depth integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cluster_result_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_result_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    task_id character varying NOT NULL,
    node_id character varying NOT NULL,
    user_id character varying,
    outcome_status public.outcome_status NOT NULL,
    result_summary text,
    metrics jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cluster_task_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cluster_task_queue (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    task_type public.cluster_task_type NOT NULL,
    payload jsonb NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    status public.cluster_task_status DEFAULT 'queued'::public.cluster_task_status NOT NULL,
    assigned_node_id character varying,
    user_id character varying,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone
);


--
-- Name: cognitive_core_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cognitive_core_state (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    cycle_id character varying(100) NOT NULL,
    active_agents integer DEFAULT 0 NOT NULL,
    optimization_type public.optimization_type NOT NULL,
    score double precision NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cognitive_tuning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cognitive_tuning_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying(50) NOT NULL,
    scenario text NOT NULL,
    avg_latency_ms double precision,
    domain_accuracy jsonb,
    memory_checksum_status character varying(20),
    queue_throughput double precision,
    result public.cognitive_test_result NOT NULL,
    metrics jsonb,
    errors jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collaboration_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collaboration_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    message_id character varying(50) NOT NULL,
    session_id character varying(50) NOT NULL,
    agent_id character varying(100) NOT NULL,
    role public.collaboration_role NOT NULL,
    content text NOT NULL,
    contribution_type character varying(50),
    confidence_level double precision,
    supporting_data jsonb,
    reply_to character varying(50),
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collaboration_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collaboration_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(50) NOT NULL,
    user_id character varying(50),
    topic character varying(255) NOT NULL,
    participants text[] NOT NULL,
    consensus_state public.consensus_state DEFAULT 'forming'::public.consensus_state NOT NULL,
    consensus_score double precision,
    resolution_outcome text,
    context_snapshot jsonb,
    metadata jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: confidence_drift_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.confidence_drift_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    session_window character varying(100) NOT NULL,
    average_confidence double precision NOT NULL,
    variance_score double precision NOT NULL,
    drift_direction character varying(50),
    decisions_analyzed integer NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: config_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    type character varying(20) NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    updated_by character varying(100)
);


--
-- Name: consensus_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consensus_snapshots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id character varying(50) NOT NULL,
    session_id character varying(50) NOT NULL,
    evaluation_point timestamp with time zone NOT NULL,
    participant_inputs jsonb NOT NULL,
    agreement_scores jsonb NOT NULL,
    overall_consensus double precision NOT NULL,
    dissenter_agents text[] DEFAULT ARRAY[]::text[],
    consensus_rationale text,
    deciding_factors jsonb,
    resolution_path text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: context_bridge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_bridge_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    event_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    user_id character varying,
    mode public.trading_mode,
    success boolean NOT NULL,
    error_message text
);


--
-- Name: context_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_chats (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    context character varying(50) NOT NULL,
    role character varying(20) NOT NULL,
    message text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: context_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.context_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: context_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.context_chats_id_seq OWNED BY public.context_chats.id;


--
-- Name: conversation_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_summaries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying NOT NULL,
    user_id character varying NOT NULL,
    start_message_id character varying,
    end_message_id character varying,
    start_timestamp timestamp with time zone NOT NULL,
    end_timestamp timestamp with time zone NOT NULL,
    message_count integer NOT NULL,
    summary_text text NOT NULL,
    participant_roles text[] DEFAULT ARRAY['user'::text, 'assistant'::text, 'system'::text],
    key_decisions jsonb,
    action_items jsonb,
    user_preferences jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cross_agent_ethics_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cross_agent_ethics_session (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(100) NOT NULL,
    actor character varying(100) NOT NULL,
    action character varying(200) NOT NULL,
    domains text[] NOT NULL,
    mode public.trading_mode NOT NULL,
    agent_inputs jsonb NOT NULL,
    verdict public.ethical_verdict NOT NULL,
    confidence double precision NOT NULL,
    rationale text NOT NULL,
    has_conflict boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cross_node_alignment_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cross_node_alignment_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_node_id character varying NOT NULL,
    target_node_id character varying NOT NULL,
    pre_alignment_hash character varying(64) NOT NULL,
    post_alignment_hash character varying(64),
    alignment_strategy public.alignment_strategy NOT NULL,
    alignment_score double precision DEFAULT 0.0 NOT NULL,
    drift_detected boolean DEFAULT false NOT NULL,
    reconciliation_success boolean DEFAULT false NOT NULL,
    trace_id character varying NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
)
PARTITION BY RANGE (interval_begin);


--
-- Name: crypto_spot_ohlc_1m_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crypto_spot_ohlc_1m_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crypto_spot_ohlc_1m_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crypto_spot_ohlc_1m_id_seq OWNED BY public.crypto_spot_ohlc_1m.id;


--
-- Name: crypto_spot_ohlc_1m_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_04 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_05 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_06 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_07 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_08 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_09 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_10 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_11 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2026_12 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2027_01 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2027_02 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2027_03 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ohlc_1m_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ohlc_1m_2027_04 (
    id bigint DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: crypto_spot_ticker_snap_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crypto_spot_ticker_snap_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crypto_spot_ticker_snap_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crypto_spot_ticker_snap_id_seq OWNED BY public.crypto_spot_ticker_snap.id;


--
-- Name: crypto_spot_ticker_snap_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_04 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_05 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_06 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_07 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_08 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_09 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_10 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_11 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2026_12 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2027_01 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2027_02 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2027_03 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: crypto_spot_ticker_snap_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_spot_ticker_snap_2027_04 (
    id bigint DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL
);


--
-- Name: daily_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_briefs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    date character varying(10) NOT NULL,
    status public.daily_brief_status DEFAULT 'in_progress'::public.daily_brief_status,
    headline character varying(200),
    summary text,
    narrative text,
    metrics jsonb,
    trades jsonb,
    learnings jsonb,
    system_health jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    finalized_at timestamp with time zone,
    email_sent_at timestamp with time zone
);


--
-- Name: daily_performance_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_performance_summary (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode character varying(10) NOT NULL,
    date date NOT NULL,
    portfolio_start numeric(20,2) NOT NULL,
    daily_profit numeric(20,2) NOT NULL,
    ade_percent numeric(10,4) NOT NULL,
    trades_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT daily_performance_summary_mode_check CHECK (((mode)::text = ANY (ARRAY[('live'::character varying)::text, ('paper'::character varying)::text])))
);


--
-- Name: data_archive_manifest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_archive_manifest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_table text NOT NULL,
    partition_label text NOT NULL,
    tier text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    storage_uri text NOT NULL,
    min_ts timestamp with time zone NOT NULL,
    max_ts timestamp with time zone NOT NULL,
    date_range_start timestamp with time zone NOT NULL,
    date_range_end timestamp with time zone NOT NULL,
    row_count bigint NOT NULL,
    bytes_compressed bigint NOT NULL,
    original_partition_size_bytes bigint,
    archive_schema_version integer DEFAULT 1 NOT NULL,
    format text DEFAULT 'jsonl.gz'::text NOT NULL,
    compression text DEFAULT 'gzip'::text NOT NULL,
    checksum_algo text DEFAULT 'sha256'::text NOT NULL,
    checksum text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    hot_partition_dropped_at timestamp with time zone,
    tier_changed_at timestamp with time zone,
    CONSTRAINT data_archive_manifest_format_chk CHECK ((format = ANY (ARRAY['jsonl.gz'::text, 'parquet'::text]))),
    CONSTRAINT data_archive_manifest_state_chk CHECK ((state = ANY (ARRAY['pending'::text, 'uploaded'::text, 'verified'::text, 'active'::text, 'migrating'::text, 'migrated'::text]))),
    CONSTRAINT data_archive_manifest_tier_chk CHECK ((tier = ANY (ARRAY['warm'::text, 'cold'::text])))
);


--
-- Name: data_lineage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_lineage (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    originating_service character varying(50) NOT NULL,
    target_service character varying(50),
    source_table character varying(100),
    mode public.trading_mode,
    global_context_id character varying(50),
    data_hash character varying(64),
    row_count integer,
    operation character varying(20),
    metadata jsonb
);


--
-- Name: database_size_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_size_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    size_mb numeric(10,2) NOT NULL,
    size_gb numeric(10,4) NOT NULL,
    checked_at timestamp with time zone DEFAULT now()
);


--
-- Name: decision_quality_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decision_quality_audit (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    decision_id character varying NOT NULL,
    user_id character varying,
    decision_type character varying NOT NULL,
    initial_reasoning text,
    outcome_observed text,
    quality_rating public.quality_rating NOT NULL,
    accuracy_score double precision,
    bias_detected text[],
    lessons_learned text,
    alternative_approaches text[],
    would_repeat boolean DEFAULT true,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    evaluated_at timestamp without time zone DEFAULT now()
);


--
-- Name: decision_trace_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decision_trace_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    decision_id character varying(50) NOT NULL,
    user_id character varying(50),
    decision_type text NOT NULL,
    context_snapshot jsonb NOT NULL,
    reasoning text NOT NULL,
    alternatives jsonb DEFAULT '[]'::jsonb NOT NULL,
    chosen_action jsonb NOT NULL,
    outcome jsonb,
    outcome_quality double precision,
    simulation_ref character varying(50),
    linked_experiences text[] DEFAULT ARRAY[]::text[],
    metadata jsonb,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discovery_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_runs (
    run_id bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    source_chain_status jsonb NOT NULL,
    symbols_discovered integer DEFAULT 0 NOT NULL,
    symbols_marked_stale integer DEFAULT 0 NOT NULL,
    symbols_marked_delisted integer DEFAULT 0 NOT NULL,
    error_log text,
    triggered_by text NOT NULL,
    CONSTRAINT discovery_runs_triggered_by_check CHECK ((triggered_by = ANY (ARRAY['cron_daily'::text, 'manual_endpoint'::text, 'boot_smoke'::text])))
);


--
-- Name: discovery_runs_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discovery_runs_run_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discovery_runs_run_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discovery_runs_run_id_seq OWNED BY public.discovery_runs.run_id;


--
-- Name: xstock_perp_ohlc_1m; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
)
PARTITION BY RANGE (interval_begin);


--
-- Name: equity_perp_ohlc_1m_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_perp_ohlc_1m_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_perp_ohlc_1m_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_perp_ohlc_1m_id_seq OWNED BY public.xstock_perp_ohlc_1m.id;


--
-- Name: xstock_perp_ticker_snap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: equity_perp_ticker_snap_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_perp_ticker_snap_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_perp_ticker_snap_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_perp_ticker_snap_id_seq OWNED BY public.xstock_perp_ticker_snap.id;


--
-- Name: xstock_spot_ohlc_1m; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
)
PARTITION BY RANGE (interval_begin);


--
-- Name: equity_spot_ohlc_1m_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_spot_ohlc_1m_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_spot_ohlc_1m_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_spot_ohlc_1m_id_seq OWNED BY public.xstock_spot_ohlc_1m.id;


--
-- Name: xstock_spot_ticker_snap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap (
    id bigint NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: equity_spot_ticker_snap_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equity_spot_ticker_snap_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equity_spot_ticker_snap_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equity_spot_ticker_snap_id_seq OWNED BY public.xstock_spot_ticker_snap.id;


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    "timestamp" timestamp with time zone DEFAULT now(),
    error_type character varying(100) NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    context jsonb,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    notes text
);


--
-- Name: ethical_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethical_audit_log (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id character varying,
    action_type character varying NOT NULL,
    action_id character varying,
    rules_evaluated character varying[] NOT NULL,
    compliance_status public.compliance_status NOT NULL,
    violations_detected jsonb,
    override_reason text,
    recommendations text[],
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ethical_principle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethical_principle (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    type public.principle_type NOT NULL,
    description text NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    constraints jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ethical_rule_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethical_rule_set (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id character varying,
    rule_name character varying NOT NULL,
    category public.value_category NOT NULL,
    description text,
    constraint_logic jsonb NOT NULL,
    priority public.ethical_priority DEFAULT 'medium'::public.ethical_priority NOT NULL,
    is_active boolean DEFAULT true,
    violation_action character varying DEFAULT 'block'::character varying,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: ethical_violation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethical_violation_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    actor character varying(100) NOT NULL,
    action character varying(200) NOT NULL,
    principle_violated character varying(100) NOT NULL,
    verdict public.ethical_verdict NOT NULL,
    severity public.violation_severity NOT NULL,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ethics_conflict_register; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethics_conflict_register (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(100) NOT NULL,
    conflicting_sources text[] NOT NULL,
    conflicting_verdicts jsonb NOT NULL,
    resolution_status public.conflict_resolution DEFAULT 'open'::public.conflict_resolution NOT NULL,
    resolution_method character varying(100),
    resolution_rationale text,
    final_verdict public.ethical_verdict,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: ethics_propagation_journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ethics_propagation_journal (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    propagation_id character varying(100) NOT NULL,
    target_domain public.federated_scope NOT NULL,
    mode public.trading_mode NOT NULL,
    delta_type character varying(50) NOT NULL,
    delta_payload jsonb NOT NULL,
    status public.propagation_status DEFAULT 'pending'::public.propagation_status NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: execution_attempt_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_attempt_audit (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mode public.trading_mode NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy public.strategy_type NOT NULL,
    signal_id character varying,
    decision public.execution_decision NOT NULL,
    block_reason public.execution_block_reason,
    block_detail text,
    entry_price numeric(20,8),
    stop_price numeric(20,8),
    target_price numeric(20,8),
    confidence numeric(5,2),
    portfolio_value numeric(20,2),
    risk_amount numeric(20,2),
    position_size numeric(20,8),
    trade_id character varying
);


--
-- Name: execution_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_config (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    action_type public.walter_action_type NOT NULL,
    auto_execute_enabled boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT true NOT NULL,
    max_impact_threshold numeric(5,2) DEFAULT 50.00,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exit_decision_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: exit_decision_archive_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exit_decision_archive_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exit_decision_archive_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exit_decision_archive_id_seq OWNED BY public.exit_decision_archive.id;


--
-- Name: exit_decision_archive_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_05 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_06 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_07 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_08 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_09 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_10 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_11 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2026_12 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2027_01 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2027_02 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2027_03 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_decision_archive_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_decision_archive_2027_04 (
    id bigint DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    trade_id text NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text,
    exit_reason text NOT NULL,
    entry_price numeric(20,10),
    exit_price numeric(20,10),
    pnl_pct numeric(12,6),
    r_multiple numeric(12,6),
    duration_min numeric(12,4),
    regime_at_entry text,
    regime_at_exit text,
    dbs_at_entry numeric(10,6),
    dbs_at_exit numeric(10,6),
    atr_at_exit numeric(20,10),
    state_snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: exit_strategy_alternates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exit_strategy_alternates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    trade_source character varying NOT NULL,
    variant_id character varying NOT NULL,
    variant_name character varying NOT NULL,
    virtual_exit_price numeric(20,8),
    virtual_exit_reason character varying NOT NULL,
    virtual_exit_time timestamp with time zone,
    virtual_pnl_pct numeric(10,4),
    virtual_duration_min integer,
    baseline_pnl_pct numeric(10,4),
    regime text,
    strategy text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    CONSTRAINT exit_strategy_alternates_trade_source_check CHECK (((trade_source)::text = ANY ((ARRAY['paper'::character varying, 'vts'::character varying])::text[])))
);


--
-- Name: experience_memory_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_memory_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    memory_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    context_domain character varying(50) NOT NULL,
    insight text NOT NULL,
    confidence double precision NOT NULL,
    impact character varying(20) NOT NULL,
    recommendation text,
    source_events jsonb,
    metadata jsonb
);


--
-- Name: expert_compliance_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_compliance_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    report_date date NOT NULL,
    week_of date NOT NULL,
    trades_reviewed integer NOT NULL,
    psychology_adherence numeric(5,2),
    risk_management_adherence numeric(5,2),
    market_structure_adherence numeric(5,2),
    trade_execution_adherence numeric(5,2),
    overall_adherence numeric(5,2),
    top_violated_principles jsonb,
    violations_count integer DEFAULT 0,
    recommendations jsonb,
    status character varying(20) DEFAULT 'completed'::character varying,
    alert_level character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb
);


--
-- Name: expert_principles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_principles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    principle text NOT NULL,
    category character varying(50) NOT NULL,
    source_id character varying NOT NULL,
    source_name text NOT NULL,
    source_author text NOT NULL,
    credibility_score integer NOT NULL,
    date_added timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    metadata jsonb
);


--
-- Name: expert_response_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_response_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    chat_id character varying,
    chat_log_id character varying,
    principles_injected jsonb NOT NULL,
    response_type character varying(50),
    expert_context_used boolean DEFAULT false,
    explainability_score integer,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: expert_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_sources (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    author text NOT NULL,
    type character varying(50) NOT NULL,
    category character varying(50) NOT NULL,
    credibility_score integer NOT NULL,
    url text,
    publication_year integer,
    rationale text,
    key_topics text[],
    date_added timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: expert_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expert_updates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_id character varying NOT NULL,
    source_name text NOT NULL,
    author text NOT NULL,
    insight text NOT NULL,
    url text,
    credibility_score integer NOT NULL,
    date date NOT NULL,
    week_of date NOT NULL,
    is_active boolean DEFAULT true,
    applied_to_corpus boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: feature_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_snapshots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    price_normalized numeric(10,4),
    volume_normalized numeric(10,4),
    momentum_index numeric(10,4),
    rsi numeric(5,2),
    sma_slope numeric(10,6),
    volume_delta numeric(10,4),
    volatility_score numeric(10,4),
    liquidity_score numeric(10,4),
    sentiment_score numeric(5,4),
    sector_correlation numeric(5,4),
    raw_features jsonb,
    normalization_window integer DEFAULT 30
);


--
-- Name: federated_ethics_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federated_ethics_state (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    domain public.federated_scope NOT NULL,
    mode public.trading_mode NOT NULL,
    snapshot_hash character varying(64) NOT NULL,
    principles_active jsonb NOT NULL,
    policies_active jsonb NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: filter_calibration_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filter_calibration_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    min_volume numeric(15,2),
    min_price numeric(10,8),
    max_price numeric(10,2),
    min_market_cap numeric(15,2),
    max_bid_ask_spread numeric(5,2),
    min_daily_range numeric(5,2),
    reason text,
    source character varying(20) DEFAULT 'system'::character varying,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: filter_diagnostics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filter_diagnostics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    pairs_scanned integer DEFAULT 0 NOT NULL,
    eligible_pairs integer DEFAULT 0 NOT NULL,
    top_failure_reason character varying(100),
    failure_percent numeric(5,2),
    filter_breakdown jsonb,
    metadata jsonb
);


--
-- Name: goal_alignment_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_alignment_profile (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    profile_id character varying(50) NOT NULL,
    user_id character varying(50),
    objectives jsonb NOT NULL,
    target_metrics jsonb NOT NULL,
    current_status public.alignment_status DEFAULT 'compliant'::public.alignment_status NOT NULL,
    last_adjustment timestamp with time zone,
    adjustment_history jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: goal_analysis_history_live; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_analysis_history_live (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying,
    user_message text,
    ai_response text,
    goals_proposed jsonb,
    goals_accepted jsonb,
    config_changes_proposed jsonb,
    config_changes_applied jsonb,
    feasibility_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: goal_analysis_history_paper; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_analysis_history_paper (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying,
    user_message text,
    ai_response text,
    goals_proposed jsonb,
    goals_accepted jsonb,
    config_changes_proposed jsonb,
    config_changes_applied jsonb,
    feasibility_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: goal_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode character varying(10) NOT NULL,
    action character varying(50) NOT NULL,
    metric_name character varying(100),
    previous_value jsonb,
    new_value jsonb,
    analysis_id character varying,
    source character varying(50) DEFAULT 'user'::character varying,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: goals_learning_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals_learning_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    avg_daily_return numeric(6,3),
    avg_risk_per_trade numeric(5,3),
    avg_drawdown numeric(5,3),
    trades_count integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: goals_live; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals_live (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    metric_name character varying(100) NOT NULL,
    goal_value numeric(15,2),
    actual_value numeric(15,2),
    percent_achieved numeric(5,2),
    ai_validation_notes text,
    last_updated timestamp with time zone DEFAULT now(),
    metric_key character varying(100) NOT NULL
);


--
-- Name: goals_paper; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals_paper (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    metric_name character varying(100) NOT NULL,
    goal_value numeric(15,2),
    actual_value numeric(15,2),
    percent_achieved numeric(5,2),
    ai_validation_notes text,
    last_updated timestamp with time zone DEFAULT now(),
    metric_key character varying(100) NOT NULL
);


--
-- Name: goals_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals_presets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    name public.goals_preset_name NOT NULL,
    portfolio_risk_per_trade_pct numeric(5,2) NOT NULL,
    daily_loss_kill_switch_pct numeric(5,2) NOT NULL,
    symbol_cooldown_minutes integer NOT NULL,
    max_open_positions integer NOT NULL,
    trades_per_day_est numeric(5,2) NOT NULL,
    target_daily_avg_earning_pct numeric(5,2) NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_adjusted_at timestamp with time zone,
    learning_active boolean DEFAULT false NOT NULL
);


--
-- Name: guardrails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardrails (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    max_daily_loss numeric(10,2) DEFAULT 1000.00,
    max_drawdown numeric(5,2) DEFAULT 10.00,
    max_position_size numeric(10,2) DEFAULT 5000.00,
    max_open_positions integer DEFAULT 5,
    risk_per_trade numeric(5,2) DEFAULT 1.5,
    ai_can_adjust boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    max_required_capital numeric(12,2) DEFAULT 100000.00,
    max_risk_per_trade_limit numeric(10,2) DEFAULT 1000.00,
    last_updated_by character varying,
    cooldown_minutes integer DEFAULT 15,
    micro_loop_interval integer DEFAULT 8,
    price_delta_trigger numeric(5,2) DEFAULT 0.30
);


--
-- Name: guardrails_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardrails_v2 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    portfolio_risk_per_trade_pct numeric(5,2) DEFAULT 1.50 NOT NULL,
    symbol_cooldown_minutes integer DEFAULT 15 NOT NULL,
    max_open_positions integer DEFAULT 5 NOT NULL,
    daily_loss_kill_switch_pct numeric(5,2) DEFAULT 7.00 NOT NULL,
    is_manual_override boolean DEFAULT false NOT NULL,
    tuned_by_latti boolean DEFAULT true NOT NULL,
    last_updated timestamp with time zone DEFAULT now(),
    locked_by_user jsonb DEFAULT '{}'::jsonb,
    kill_switch_tripped boolean DEFAULT false NOT NULL,
    kill_switch_reason text,
    kill_switch_tripped_at timestamp with time zone,
    managed_by_lottie boolean DEFAULT true NOT NULL,
    manual_override_enabled boolean DEFAULT false NOT NULL,
    last_updated_by character varying(255),
    universe_profile character varying(50) DEFAULT 'TOP_100'::character varying NOT NULL,
    max_position_percent_pct numeric(5,2) DEFAULT 30.00 NOT NULL,
    low_price_min_stop_atr_mult numeric(6,3) DEFAULT 3.000 NOT NULL,
    low_price_min_position_notional numeric(12,2) DEFAULT 25.00 NOT NULL,
    low_price_threshold numeric(10,4) DEFAULT 0.5000 NOT NULL,
    max_total_exposure_pct numeric(5,2) DEFAULT 25.00 NOT NULL,
    CONSTRAINT guardrails_v2_check CHECK ((NOT (is_manual_override AND tuned_by_latti))),
    CONSTRAINT guardrails_v2_daily_loss_kill_switch_pct_check CHECK (((daily_loss_kill_switch_pct >= 1.00) AND (daily_loss_kill_switch_pct <= 20.00))),
    CONSTRAINT guardrails_v2_max_open_positions_check CHECK (((max_open_positions >= 1) AND (max_open_positions <= 20))),
    CONSTRAINT guardrails_v2_portfolio_risk_per_trade_pct_check CHECK (((portfolio_risk_per_trade_pct >= 0.10) AND (portfolio_risk_per_trade_pct <= 5.00))),
    CONSTRAINT guardrails_v2_symbol_cooldown_minutes_check CHECK ((symbol_cooldown_minutes >= 1))
);


--
-- Name: historic_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historic_signals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    exchange character varying(50) DEFAULT 'Kraken'::character varying NOT NULL,
    strategy_id public.strategy_type NOT NULL,
    trigger_time timestamp with time zone NOT NULL,
    exit_time timestamp with time zone,
    entry_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    pnl_percent numeric(10,4),
    filters_used text[],
    confidence numeric(5,2),
    market_context jsonb,
    evaluated_at timestamp with time zone DEFAULT now(),
    source character varying(20) DEFAULT 'historic'::character varying,
    source_pool text
);


--
-- Name: intent_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intent_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_id character varying NOT NULL,
    user_role public.user_role NOT NULL,
    intent_action character varying(100) NOT NULL,
    intent_payload jsonb NOT NULL,
    pre_state_hash character varying(64),
    post_state_hash character varying(64),
    success boolean NOT NULL,
    result jsonb,
    execution_time_ms integer,
    error_message text,
    metadata jsonb
);


--
-- Name: intraday_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intraday_adjustments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    adjustment_type character varying(50) NOT NULL,
    previous_value numeric(20,8),
    new_value numeric(20,8),
    reason text,
    market_condition character varying(50),
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: introspection_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.introspection_report (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    report_date date NOT NULL,
    bias_index integer NOT NULL,
    confidence_stability double precision NOT NULL,
    total_bias_events integer NOT NULL,
    top_bias_types jsonb NOT NULL,
    mitigations_applied integer NOT NULL,
    summary text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kill_switch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kill_switch (
    id character varying DEFAULT 'global_kill_switch'::character varying NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    reason text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kill_switch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kill_switch_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    triggered_at timestamp with time zone DEFAULT now(),
    event_type character varying(20) NOT NULL,
    portfolio_value_before numeric(15,2) NOT NULL,
    portfolio_value_after numeric(15,2) NOT NULL,
    loss_amount numeric(15,2) NOT NULL,
    loss_percent numeric(8,4) NOT NULL,
    kill_switch_threshold numeric(5,2) NOT NULL,
    trades_closed jsonb,
    resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_method character varying(50),
    notes text
);


--
-- Name: knowledge_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_cache (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    query_hash character varying(64) NOT NULL,
    query text NOT NULL,
    source public.knowledge_source NOT NULL,
    cached_data text NOT NULL,
    trust_level public.retrieval_trust_level NOT NULL,
    relevance_score double precision,
    hit_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_retrieval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_retrieval_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    query text NOT NULL,
    source public.knowledge_source NOT NULL,
    url text,
    trust_level public.retrieval_trust_level NOT NULL,
    relevance_score double precision,
    retrieved_data text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_trust_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_trust_record (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    domain character varying(255) NOT NULL,
    trust_level public.retrieval_trust_level NOT NULL,
    verification_method character varying(100),
    successful_retrievals integer DEFAULT 0 NOT NULL,
    failed_retrievals integer DEFAULT 0 NOT NULL,
    average_relevance double precision,
    last_audit_date timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: latti_baseline_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.latti_baseline_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trading_mode character varying(20) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    trigger_reason text NOT NULL,
    trades_since_anchor integer,
    win_rate_before numeric(8,4),
    win_rate_after numeric(8,4),
    profit_factor_before numeric(8,4),
    profit_factor_after numeric(8,4),
    drawdown_before numeric(8,4),
    drawdown_after numeric(8,4),
    risk_per_trade_before numeric(8,4),
    risk_per_trade_after numeric(8,4),
    trades_per_day_before numeric(8,2),
    trades_per_day_after numeric(8,2),
    expected_profit_per_trade_before numeric(10,2),
    expected_profit_per_trade_after numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: latti_motivation_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.latti_motivation_state (
    id integer NOT NULL,
    mode character varying(10) NOT NULL,
    satisfaction integer DEFAULT 50,
    discipline integer DEFAULT 50,
    patience integer DEFAULT 50,
    optimism integer DEFAULT 50,
    engagement integer DEFAULT 50,
    motivation_data jsonb,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: latti_motivation_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.latti_motivation_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: latti_motivation_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.latti_motivation_state_id_seq OWNED BY public.latti_motivation_state.id;


--
-- Name: learning_fragments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_fragments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    event_type public.execution_event_type NOT NULL,
    significance public.event_significance NOT NULL,
    narrative text NOT NULL,
    reasoning text,
    implications text[],
    actionable_suggestion text,
    follow_up_question text,
    event_category character varying(100),
    user_context jsonb,
    response_effectiveness integer,
    improvement_suggestion text,
    original_event_data jsonb NOT NULL,
    source character varying(50) DEFAULT 'ExecutionCore'::character varying NOT NULL,
    interpreted_by character varying(50) DEFAULT 'CognitiveLayer'::character varying NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    analyzed_at timestamp with time zone,
    trace_id character varying(32)
);


--
-- Name: learning_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_history (
    id integer NOT NULL,
    trading_mode public.trading_mode NOT NULL,
    snapshot_version integer NOT NULL,
    guardrails_snapshot jsonb NOT NULL,
    filters_snapshot jsonb NOT NULL,
    learning_mode public.learning_mode NOT NULL,
    change_count integer DEFAULT 0 NOT NULL,
    is_stable boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.learning_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: learning_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.learning_history_id_seq OWNED BY public.learning_history.id;


--
-- Name: learning_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_sources (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    source_name character varying(100) NOT NULL,
    source_type character varying(50) NOT NULL,
    weight numeric(8,4) DEFAULT 1.0000,
    relevance_score numeric(5,4) DEFAULT 0.5000,
    accuracy_score numeric(5,4) DEFAULT 0.5000,
    total_predictions integer DEFAULT 0,
    correct_predictions integer DEFAULT 0,
    last_accuracy_update timestamp with time zone,
    last_relevance_update timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    metadata jsonb
);


--
-- Name: learning_weight_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_weight_profile (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    profile_id character varying(50) NOT NULL,
    user_id character varying(50),
    current_phase public.learning_phase DEFAULT 'observation'::public.learning_phase NOT NULL,
    cognitive_weights jsonb NOT NULL,
    behavioral_tendencies jsonb DEFAULT '{}'::jsonb NOT NULL,
    performance_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    feedback_history jsonb[] DEFAULT ARRAY[]::jsonb[],
    confidence_score double precision DEFAULT 0.5,
    last_retraining timestamp with time zone,
    revision_history jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lottie_oversight_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lottie_oversight_log (
    id integer NOT NULL,
    event character varying(100) NOT NULL,
    strategy character varying(50),
    status character varying(50) NOT NULL,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lottie_oversight_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lottie_oversight_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lottie_oversight_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lottie_oversight_log_id_seq OWNED BY public.lottie_oversight_log.id;


--
-- Name: macro_feed_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: macro_feed_archive_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.macro_feed_archive_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: macro_feed_archive_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.macro_feed_archive_id_seq OWNED BY public.macro_feed_archive.id;


--
-- Name: macro_feed_archive_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_05 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_06 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_07 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_08 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_09 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_10 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_11 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2026_12 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2027_01 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2027_02 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2027_03 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: macro_feed_archive_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.macro_feed_archive_2027_04 (
    id bigint DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    btc_dominance_pct numeric(10,6),
    mcap_momentum numeric(12,8),
    funding_rate numeric(12,8),
    modifier_value numeric(8,6),
    fallback_active boolean DEFAULT false NOT NULL,
    snapshot jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: memory_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    checksum character varying(64) NOT NULL,
    status public.memory_audit_status DEFAULT 'VERIFIED'::public.memory_audit_status NOT NULL,
    trace_id character varying(50),
    user_id character varying,
    memory_snapshot jsonb,
    repair_details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_cognition_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_cognition_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_agent character varying(100),
    flag_type public.oversight_flag_type NOT NULL,
    severity double precision NOT NULL,
    message text NOT NULL,
    context jsonb,
    recommendations text[] DEFAULT ARRAY[]::text[],
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_reasoning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_reasoning_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    analysis_id character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    target_trace_id character varying(50) NOT NULL,
    analysis_result public.meta_analysis_result NOT NULL,
    integrity_score double precision,
    detected_issues jsonb,
    correction_plan jsonb,
    correction_applied boolean DEFAULT false,
    correction_result jsonb,
    execution_time_ms integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: model_calibration_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_calibration_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    agent_name character varying(100) NOT NULL,
    parameter character varying(200) NOT NULL,
    old_value double precision NOT NULL,
    new_value double precision NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: model_consistency_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_consistency_snapshot (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    node_id character varying NOT NULL,
    model_hash character varying(64) NOT NULL,
    domain_channel public.domain_channel NOT NULL,
    version character varying NOT NULL,
    parameter_count integer DEFAULT 0 NOT NULL,
    last_updated timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: module_constants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_constants (
    module_name text NOT NULL,
    exchange text DEFAULT '*'::text NOT NULL,
    asset_class text DEFAULT '*'::text NOT NULL,
    strategy text DEFAULT '*'::text NOT NULL,
    regime text DEFAULT '*'::text NOT NULL,
    constant_name text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: pair_scan_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: pair_scan_archive_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pair_scan_archive_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pair_scan_archive_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pair_scan_archive_id_seq OWNED BY public.pair_scan_archive.id;


--
-- Name: pair_scan_archive_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_05 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_06 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_07 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_08 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_09 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_10 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_11 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2026_12 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2027_01 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2027_02 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2027_03 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: pair_scan_archive_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pair_scan_archive_2027_04 (
    id bigint DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    regime_label text,
    regime_confidence numeric(8,6),
    dbs_score numeric(10,6),
    dbs_category text,
    atr_pct numeric(12,8),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    scan_stage_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: paper_ai_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_ai_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    report_type character varying(50) NOT NULL,
    period character varying(50) NOT NULL,
    content text NOT NULL,
    insights jsonb,
    recommendations jsonb,
    metrics jsonb,
    generated_at timestamp with time zone DEFAULT now()
);


--
-- Name: paper_daily_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_daily_briefs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    date character varying(10) NOT NULL,
    status public.daily_brief_status DEFAULT 'in_progress'::public.daily_brief_status,
    headline character varying(200),
    summary text,
    narrative text,
    metrics jsonb,
    trades jsonb,
    learnings jsonb,
    system_health jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    finalized_at timestamp with time zone,
    email_sent_at timestamp with time zone
);


--
-- Name: paper_signal_trace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_signal_trace (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    pair character varying(20) NOT NULL,
    mode public.trading_mode DEFAULT 'paper'::public.trading_mode NOT NULL,
    trace_stage public.trace_stage NOT NULL,
    scan_cycle_id character varying,
    scan_started_at timestamp with time zone,
    evaluated_at timestamp with time zone DEFAULT now(),
    filter_verdict jsonb,
    strategy_outputs jsonb,
    signal_verdict jsonb,
    metadata jsonb,
    schema_version integer DEFAULT 1
);


--
-- Name: paper_sim_ghost_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_ghost_trades (
    id character varying NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy_name character varying(50),
    side character varying(10),
    quantity character varying(30),
    entry_price character varying(30),
    exit_price character varying(30),
    stop_loss character varying(30),
    take_profit character varying(30),
    pnl character varying(30),
    pnl_percent character varying(30),
    fees character varying(30),
    slippage character varying(30),
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    close_reason character varying(50),
    confidence character varying(30),
    metadata jsonb,
    quarantined_at timestamp with time zone DEFAULT now(),
    quarantine_reason character varying(100)
);


--
-- Name: paper_sim_open_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_open_positions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy_name public.strategy_type NOT NULL,
    side character varying(10) NOT NULL,
    quantity numeric(20,8) NOT NULL,
    avg_price numeric(20,8) NOT NULL,
    current_price numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    unrealized_pnl numeric(20,8),
    unrealized_pnl_percent numeric(10,4),
    opened_at timestamp with time zone DEFAULT now(),
    last_updated timestamp with time zone DEFAULT now(),
    confidence numeric(5,2),
    metadata jsonb,
    volume_24h numeric(20,2),
    volume_bucket character varying(20),
    entry_fee numeric(20,8) DEFAULT 0,
    intended_entry_price numeric(20,8),
    entry_slippage numeric(20,8) DEFAULT 0,
    trade_mode character varying(20) DEFAULT 'TARGET'::character varying,
    signal_type public.signal_type DEFAULT 'QUANT'::public.signal_type NOT NULL,
    pattern_type public.pattern_type,
    pattern_strength numeric(4,3),
    source_pool character varying(20),
    filter_tier text,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL
);


--
-- Name: paper_sim_open_positions_user_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_open_positions_user_archive (
    id character varying,
    user_id character varying,
    symbol character varying(20),
    strategy_name public.strategy_type,
    side character varying(10),
    quantity numeric(20,8),
    avg_price numeric(20,8),
    current_price numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    unrealized_pnl numeric(20,8),
    unrealized_pnl_percent numeric(10,4),
    opened_at timestamp with time zone,
    last_updated timestamp with time zone,
    confidence numeric(5,2),
    metadata jsonb
);


--
-- Name: paper_sim_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(100) NOT NULL,
    mode character varying(10) DEFAULT 'paper'::character varying NOT NULL,
    status character varying(20) NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    starting_balance numeric(20,2) DEFAULT 10000,
    ending_balance numeric(20,2),
    run_for_ms integer,
    ends_at timestamp with time zone,
    started_by character varying(50) DEFAULT 'manual'::character varying,
    metadata jsonb,
    source_pool character varying(20)
);


--
-- Name: paper_sim_sessions_backup_20251023; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_sessions_backup_20251023 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(100) NOT NULL,
    user_id character varying NOT NULL,
    mode character varying(10) DEFAULT 'paper'::character varying NOT NULL,
    status character varying(20) NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    starting_balance numeric(20,2) DEFAULT 10000,
    ending_balance numeric(20,2),
    run_for_ms integer,
    ends_at timestamp with time zone,
    started_by character varying(50) DEFAULT 'manual'::character varying,
    metadata jsonb
);


--
-- Name: paper_sim_sessions_user_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_sessions_user_archive (
    id character varying,
    session_id character varying(100),
    user_id character varying,
    mode character varying(10),
    status character varying(20),
    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    starting_balance numeric(20,2),
    ending_balance numeric(20,2),
    run_for_ms integer,
    ends_at timestamp with time zone,
    started_by character varying(50),
    metadata jsonb
);


--
-- Name: paper_sim_trade_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_trade_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying,
    position_id character varying,
    "timestamp" timestamp with time zone DEFAULT now(),
    event_type character varying(50) NOT NULL,
    message text NOT NULL,
    metadata jsonb
);


--
-- Name: paper_sim_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_trades (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy_name public.strategy_type NOT NULL,
    side character varying(10) NOT NULL,
    quantity numeric(20,8) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    pnl numeric(20,8),
    pnl_percent numeric(10,4),
    fees numeric(20,8) DEFAULT '0'::numeric,
    slippage numeric(20,8) DEFAULT '0'::numeric,
    opened_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason character varying(50),
    confidence numeric(5,2),
    metadata jsonb,
    entry_fee numeric(20,8) DEFAULT 0,
    exit_fee numeric(20,8) DEFAULT 0,
    total_fee numeric(20,8) DEFAULT 0,
    intended_entry_price numeric(20,8),
    actual_entry_price numeric(20,8),
    entry_slippage numeric(20,8) DEFAULT 0,
    target_exit_price numeric(20,8),
    actual_exit_price numeric(20,8),
    exit_slippage numeric(20,8) DEFAULT 0,
    total_cost numeric(20,8) DEFAULT 0,
    gross_pnl numeric(20,8) DEFAULT 0,
    net_pnl numeric(20,8) DEFAULT 0,
    net_pnl_percent numeric(10,4) DEFAULT 0,
    signal_type public.signal_type DEFAULT 'QUANT'::public.signal_type NOT NULL,
    pattern_type public.pattern_type,
    pattern_strength numeric(4,3),
    source_pool text,
    filter_tier text,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    base_currency character varying(10) NOT NULL,
    trade_mode character varying(20) DEFAULT 'TARGET'::character varying NOT NULL,
    ladder_rungs_hit integer DEFAULT 0 NOT NULL,
    original_stop_price numeric(20,8),
    latch_trigger_price numeric(20,8),
    rung_target_history jsonb,
    pair_id_hash smallint,
    regime_confidence_raw real,
    macro_modifier_value real,
    phase text,
    phase_age_seconds integer,
    strategy_phase_weight real,
    regime_confidence_modulated real,
    CONSTRAINT paper_sim_trades_phase_check CHECK (((phase IS NULL) OR (phase = ANY (ARRAY['EARLY'::text, 'PRIME'::text, 'LATE'::text])))),
    CONSTRAINT paper_sim_trades_trade_mode_chk CHECK (((trade_mode)::text = ANY ((ARRAY['TARGET'::character varying, 'TRAILING_TAKE'::character varying])::text[])))
);


--
-- Name: paper_sim_trades_user_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_sim_trades_user_archive (
    id character varying,
    user_id character varying,
    symbol character varying(20),
    strategy_name public.strategy_type,
    side character varying(10),
    quantity numeric(20,8),
    entry_price numeric(20,8),
    exit_price numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    pnl numeric(20,8),
    pnl_percent numeric(10,4),
    fees numeric(20,8),
    slippage numeric(20,8),
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    close_reason character varying(50),
    confidence numeric(5,2),
    metadata jsonb
);


--
-- Name: paper_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_trades (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy public.strategy_type NOT NULL,
    status public.trade_status DEFAULT 'open'::public.trade_status,
    entry_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    quantity numeric(20,8) NOT NULL,
    stop_price numeric(20,8) NOT NULL,
    target_price numeric(20,8) NOT NULL,
    simulated_order_id character varying,
    entry_fee numeric(10,4) DEFAULT '0'::numeric,
    exit_fee numeric(10,4) DEFAULT '0'::numeric,
    entry_slippage numeric(5,2) DEFAULT '0'::numeric,
    exit_slippage numeric(5,2) DEFAULT '0'::numeric,
    simulated_latency_ms integer DEFAULT 250,
    risk_amount numeric(10,2) NOT NULL,
    realized_pl numeric(10,2),
    realized_pl_percent numeric(8,4),
    realized_pl_r numeric(8,4),
    entry_time timestamp with time zone DEFAULT now(),
    exit_time timestamp with time zone,
    metadata jsonb,
    mfe numeric(10,2),
    mae numeric(10,2),
    ngc numeric(6,4),
    cwqi numeric(6,4),
    confidence numeric(6,4),
    profit_rate numeric(6,4),
    source_pool text,
    filter_tier text
);


--
-- Name: parameter_baseline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parameter_baseline (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode character varying NOT NULL,
    snapshot_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: patch_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patch_proposals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    proposal_id character varying(100) NOT NULL,
    user_id character varying NOT NULL,
    source_report character varying(100) NOT NULL,
    file text NOT NULL,
    issue text NOT NULL,
    proposed_fix text NOT NULL,
    reason text NOT NULL,
    severity public.patch_severity NOT NULL,
    estimated_impact character varying(50) NOT NULL,
    testing_required boolean DEFAULT true,
    status public.patch_status DEFAULT 'pending'::public.patch_status NOT NULL,
    kyle_approved boolean DEFAULT false NOT NULL,
    approved_at timestamp with time zone,
    applied_at timestamp with time zone,
    approval_notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: portfolio_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_adjustments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    adjustment_type character varying(50) NOT NULL,
    parameter character varying(100),
    previous_value numeric(20,8),
    new_value numeric(20,8),
    reason text,
    performance_impact numeric(10,4),
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: portfolio_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_state (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    balance numeric(20,2) DEFAULT 1000.00 NOT NULL,
    last_update timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL
);


--
-- Name: portfolio_state_backup_20251023; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_state_backup_20251023 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    mode public.trading_mode NOT NULL,
    balance numeric(20,2) DEFAULT 1000.00 NOT NULL,
    last_update timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL
);


--
-- Name: prediction_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prediction_outcomes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    trade_id character varying,
    mode public.trading_mode NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy public.strategy_type NOT NULL,
    prediction_timestamp timestamp with time zone DEFAULT now(),
    predicted_direction character varying(10) NOT NULL,
    prediction_confidence numeric(5,4) NOT NULL,
    signal_type character varying(100),
    rationale text,
    risk_score numeric(5,4),
    actual_direction character varying(10),
    actual_outcome numeric(10,2),
    delta_percent numeric(8,4),
    correct boolean,
    completed_at timestamp with time zone,
    metadata jsonb
);


--
-- Name: price_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_data (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(20,8) NOT NULL,
    vwap numeric(20,8),
    sma numeric(20,8)
);


--
-- Name: proposed_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposed_adjustments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    variable_name character varying(100) NOT NULL,
    variable_category character varying(50) NOT NULL,
    old_value numeric(20,8) NOT NULL,
    proposed_value numeric(20,8) NOT NULL,
    confidence_score integer NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying,
    proposed_at timestamp with time zone DEFAULT now(),
    applied_at timestamp with time zone,
    reviewed_by character varying(50)
);


--
-- Name: reasoning_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reasoning_queue (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    task_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status public.reasoning_queue_status DEFAULT 'pending'::public.reasoning_queue_status NOT NULL,
    result jsonb,
    error_message text,
    locked_at timestamp with time zone,
    locked_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    retry_at timestamp with time zone
);


--
-- Name: reasoning_trace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reasoning_trace (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(50) NOT NULL,
    user_id character varying NOT NULL,
    intent_action character varying(100),
    steps jsonb NOT NULL,
    domain_context text[] DEFAULT ARRAY[]::text[],
    decision_summary text,
    status character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reflection_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reflection_log (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id character varying,
    trigger_source character varying NOT NULL,
    reflection_depth public.reflection_depth DEFAULT 'analytical'::public.reflection_depth NOT NULL,
    subject_area character varying NOT NULL,
    analysis_text text NOT NULL,
    insights jsonb,
    questions_raised text[],
    improvement_suggestions text[],
    confidence_score double precision,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: regime_factor_alternates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regime_factor_alternates (
    id integer NOT NULL,
    source_type text NOT NULL,
    signal_id integer,
    vts_trade_id text,
    pair_symbol text NOT NULL,
    evaluated_at timestamp with time zone DEFAULT now() NOT NULL,
    factor_name text NOT NULL,
    factor_state text NOT NULL,
    real_decision jsonb NOT NULL,
    alternate_decision jsonb NOT NULL,
    replay_outcome jsonb,
    replay_completed_at timestamp with time zone,
    strategy text,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    CONSTRAINT regime_factor_alternates_factor_state_check CHECK ((factor_state = ANY (ARRAY['alternate_disabled'::text, 'alternate_enabled'::text]))),
    CONSTRAINT regime_factor_alternates_source_type_check CHECK ((source_type = ANY (ARRAY['active_signal'::text, 'vts_trade'::text]))),
    CONSTRAINT regime_factor_alternates_source_xor CHECK ((((source_type = 'active_signal'::text) AND (signal_id IS NOT NULL) AND (vts_trade_id IS NULL)) OR ((source_type = 'vts_trade'::text) AND (signal_id IS NULL) AND (vts_trade_id IS NOT NULL))))
);


--
-- Name: regime_factor_alternates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regime_factor_alternates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regime_factor_alternates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regime_factor_alternates_id_seq OWNED BY public.regime_factor_alternates.id;


--
-- Name: response_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_cache (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    cache_key character varying(256) NOT NULL,
    endpoint character varying(200) NOT NULL,
    request_payload jsonb,
    response_data jsonb NOT NULL,
    hit_count integer DEFAULT 1,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now()
);


--
-- Name: rtb_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rtb_signals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    signal_id character varying(100) NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy public.strategy_type NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    stop_price numeric(20,8) NOT NULL,
    target_price numeric(20,8),
    quantity numeric(20,8),
    notional numeric(20,2),
    confidence numeric(5,4) NOT NULL,
    risk_score numeric(5,4) NOT NULL,
    expected_return numeric(5,4) NOT NULL,
    cwqi numeric(5,4) NOT NULL,
    status public.rtb_signal_status DEFAULT 'queued'::public.rtb_signal_status NOT NULL,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    promoted_at timestamp with time zone,
    expired_at timestamp with time zone,
    expires_at timestamp with time zone,
    block_reason character varying(50),
    promoted_trade_id character varying,
    metadata jsonb,
    ngc numeric(5,4),
    current_price numeric(20,8),
    volume_24h numeric(20,2),
    last_refreshed_at timestamp with time zone,
    missed_refreshes integer DEFAULT 0,
    final_score numeric(5,4),
    regime_weight numeric(5,4),
    hybrid_score numeric(5,4),
    decay_penalty numeric(5,4),
    source_pool text
);


--
-- Name: safety_event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_event_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    actor character varying(100) NOT NULL,
    action character varying(200) NOT NULL,
    policy_hits text[] DEFAULT ARRAY[]::text[] NOT NULL,
    severity public.safety_severity NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: safety_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_policy (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    policy_name character varying(100) NOT NULL,
    scope public.safety_scope NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    constraints jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: safety_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_telemetry (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    daily_drawdown numeric(8,4),
    exposure_percent numeric(8,4),
    open_position_count integer DEFAULT 0,
    portfolio_value numeric(15,2),
    check_type character varying(50) NOT NULL,
    check_passed boolean NOT NULL,
    failure_reason text,
    spot_only_violation boolean DEFAULT false,
    position_limit_violation boolean DEFAULT false,
    position_size_violation boolean DEFAULT false,
    stop_loss_violation boolean DEFAULT false,
    symbol character varying(20),
    strategy public.strategy_type,
    signal_id character varying,
    metadata jsonb
);


--
-- Name: scheduled_tasks_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_tasks_audit (
    id integer NOT NULL,
    task_name character varying(64) NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    fired_at timestamp with time zone,
    status character varying(32) NOT NULL,
    error_message text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_tasks_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_tasks_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_tasks_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_tasks_audit_id_seq OWNED BY public.scheduled_tasks_audit.id;


--
-- Name: screener_filters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screener_filters (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    min_volume numeric(15,2) DEFAULT 1000000.00,
    min_price numeric(10,8) DEFAULT 0.01,
    max_price numeric(10,2) DEFAULT 10000.00,
    min_market_cap numeric(15,2) DEFAULT 100000000.00,
    max_bid_ask_spread numeric(5,2) DEFAULT 1.00,
    rsi_min integer DEFAULT 30,
    rsi_max integer DEFAULT 70,
    volatility_min numeric(5,2) DEFAULT 0.50,
    volatility_max numeric(5,2) DEFAULT 5.00,
    exclude_stablecoins boolean DEFAULT true,
    min_liquidity numeric(15,2) DEFAULT 500000.00,
    allow_regulated_only boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_updated_by character varying,
    universe_size integer DEFAULT 100,
    quote_currencies jsonb DEFAULT '[]'::jsonb,
    active_timeframes jsonb DEFAULT '["5m", "15m", "1h"]'::jsonb,
    confidence_threshold integer DEFAULT 60,
    managed_by_lottie boolean DEFAULT true NOT NULL,
    manual_override_enabled boolean DEFAULT false NOT NULL,
    locked_by_user jsonb DEFAULT '{}'::jsonb,
    filter_overrides jsonb DEFAULT '{}'::jsonb,
    min_history_days integer DEFAULT 30,
    final_score_min numeric(5,4) DEFAULT 0.35,
    regime_weight_min numeric(5,4) DEFAULT 0.30,
    filter_path text,
    lq_min numeric(10,4),
    vn_max numeric(10,4),
    di_min numeric(10,4),
    di_max numeric(10,4),
    volume_24h_min numeric(15,2),
    strategies jsonb,
    description text,
    enabled boolean DEFAULT true,
    corr_max numeric(5,4) DEFAULT 0.9200,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    tunable_status text DEFAULT 'active'::text NOT NULL
);


--
-- Name: screener_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screener_results (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    symbol character varying(20) NOT NULL,
    exchange character varying(20) DEFAULT 'kraken'::character varying,
    score numeric(5,2),
    passed_filters text[] DEFAULT ARRAY[]::text[],
    failed_filters text[] DEFAULT ARRAY[]::text[],
    market_cap numeric(20,2),
    volume_24h numeric(20,2),
    price numeric(20,8),
    volatility numeric(5,2),
    rsi numeric(5,2),
    bid_ask_spread numeric(5,2),
    scanned_at timestamp with time zone DEFAULT now()
);


--
-- Name: semantic_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semantic_memory (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    embedding public.vector(1536) NOT NULL,
    content text NOT NULL,
    source_table character varying(100) NOT NULL,
    source_id character varying NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    relevance numeric(3,2) DEFAULT 0.50,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signal_eval_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
)
PARTITION BY RANGE (captured_at);


--
-- Name: signal_eval_archive_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.signal_eval_archive_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: signal_eval_archive_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.signal_eval_archive_id_seq OWNED BY public.signal_eval_archive.id;


--
-- Name: signal_eval_archive_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_05 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_06 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_07 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_08 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_09 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_10 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_11 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2026_12 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2027_01 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2027_02 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2027_03 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_eval_archive_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_eval_archive_2027_04 (
    id bigint DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass) NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text NOT NULL,
    exchange text NOT NULL,
    asset_class text NOT NULL,
    mode text NOT NULL,
    source text NOT NULL,
    strategy text NOT NULL,
    regime_label text,
    reject_stage text NOT NULL,
    final_score numeric(8,6),
    confidence_modulated numeric(8,6),
    features jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    modulators jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    gate_decision jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL
);


--
-- Name: signal_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_weights (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    strategy public.strategy_type NOT NULL,
    mode public.trading_mode NOT NULL,
    signal_name character varying(100) NOT NULL,
    weight numeric(8,4) DEFAULT 1.0000,
    correlation_score numeric(8,4),
    sample_size integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now(),
    metadata jsonb
);


--
-- Name: strategic_memory_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategic_memory_archive (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    agent_name character varying(100) NOT NULL,
    memory_scope public.memory_scope NOT NULL,
    summary text NOT NULL,
    insights jsonb NOT NULL,
    performance_delta double precision,
    adjustments jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategic_memory_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategic_memory_snapshot (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id character varying(50) NOT NULL,
    user_id character varying(50),
    lesson_title character varying(255) NOT NULL,
    lesson_content text NOT NULL,
    source_simulations text[] DEFAULT ARRAY[]::text[],
    source_decisions text[] DEFAULT ARRAY[]::text[],
    applicable_contexts jsonb NOT NULL,
    confidence_level public.outcome_confidence DEFAULT 'medium'::public.outcome_confidence NOT NULL,
    times_applied integer DEFAULT 0,
    success_rate double precision,
    last_applied timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategic_plan_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategic_plan_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    plan_id character varying(50) NOT NULL,
    user_id character varying(50),
    title character varying(255) NOT NULL,
    description text,
    status public.plan_status DEFAULT 'draft'::public.plan_status NOT NULL,
    phases jsonb NOT NULL,
    success_criteria jsonb NOT NULL,
    current_progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    linked_experiences text[] DEFAULT ARRAY[]::text[],
    alignment_score double precision DEFAULT 0,
    metadata jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategic_simulation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategic_simulation_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    simulation_id character varying(50) NOT NULL,
    user_id character varying(50),
    scenario_type public.scenario_type NOT NULL,
    scenario_description text NOT NULL,
    input_state jsonb NOT NULL,
    simulated_actions jsonb NOT NULL,
    predicted_outcome jsonb NOT NULL,
    actual_outcome jsonb,
    evaluation_status public.evaluation_status DEFAULT 'pending'::public.evaluation_status NOT NULL,
    outcome_confidence public.outcome_confidence DEFAULT 'medium'::public.outcome_confidence NOT NULL,
    success_score double precision,
    lessons_learned text[] DEFAULT ARRAY[]::text[],
    linked_decisions text[] DEFAULT ARRAY[]::text[],
    metadata jsonb,
    simulated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategies (
    id integer NOT NULL,
    name character varying(64) NOT NULL,
    description text,
    enabled boolean DEFAULT true,
    config jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: strategies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: strategies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.strategies_id_seq OWNED BY public.strategies.id;


--
-- Name: strategy_drive_guardrail_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_drive_guardrail_policy (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    max_delta_per_cycle double precision DEFAULT 0.15 NOT NULL,
    max_total_shift_per_hour double precision DEFAULT 0.40 NOT NULL,
    min_confidence double precision DEFAULT 0.50 NOT NULL,
    min_smoothed_sdi double precision DEFAULT 0.45 NOT NULL,
    max_exposure_per_strategy double precision DEFAULT 0.50 NOT NULL,
    cooling_minutes integer DEFAULT 20 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100)
);


--
-- Name: strategy_drive_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_drive_metrics (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    strategy character varying(50) NOT NULL,
    mode character varying(10) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    total_profit_usd double precision DEFAULT 0 NOT NULL,
    total_trades integer DEFAULT 0 NOT NULL,
    win_rate double precision DEFAULT 0 NOT NULL,
    avg_r_multiple double precision DEFAULT 0 NOT NULL,
    alpha_strength double precision DEFAULT 0 NOT NULL,
    risk_exposure double precision DEFAULT 0 NOT NULL,
    drive_score double precision DEFAULT 0 NOT NULL
);


--
-- Name: strategy_drive_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_drive_summary (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    global_sdi double precision NOT NULL,
    best_strategy character varying(50) NOT NULL,
    weakest_strategy character varying(50) NOT NULL,
    dhma_weight double precision DEFAULT 1 NOT NULL,
    quantflow_weight double precision DEFAULT 1 NOT NULL,
    trendpulse_weight double precision DEFAULT 1 NOT NULL,
    volsurf_weight double precision DEFAULT 1 NOT NULL,
    momentumx_weight double precision DEFAULT 1 NOT NULL,
    sdi_smoothed double precision DEFAULT 0 NOT NULL,
    forecast_best character varying(100),
    forecast_weakest character varying(100),
    forecast_confidence double precision DEFAULT 0 NOT NULL,
    drive_index double precision DEFAULT 0.5,
    personal_best double precision DEFAULT 0.0
);


--
-- Name: strategy_mix_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_mix_log (
    id integer NOT NULL,
    strategy character varying(50) NOT NULL,
    old_weight double precision,
    new_weight double precision NOT NULL,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strategy_mix_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.strategy_mix_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: strategy_mix_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.strategy_mix_log_id_seq OWNED BY public.strategy_mix_log.id;


--
-- Name: strategy_param_schema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_param_schema (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    strategy_type public.strategy_type NOT NULL,
    trading_mode public.trading_mode NOT NULL,
    key character varying(100) NOT NULL,
    label character varying(200) NOT NULL,
    value numeric(20,8) NOT NULL,
    min numeric(20,8) NOT NULL,
    max numeric(20,8) NOT NULL,
    step numeric(20,8) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: strategy_parameters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_parameters (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    parameter_name character varying(100) NOT NULL,
    parameter_value numeric(20,8) NOT NULL,
    description text,
    category character varying(50),
    updated_by character varying(20) DEFAULT 'user'::character varying,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: strategy_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    strategy public.strategy_type NOT NULL,
    params jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    enabled boolean DEFAULT true NOT NULL,
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL,
    last_updated_by character varying
);


--
-- Name: strategy_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_settings_audit (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    strategy public.strategy_type NOT NULL,
    prev_params jsonb,
    next_params jsonb NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_alerts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying,
    message text NOT NULL,
    metadata jsonb,
    acknowledged boolean DEFAULT false,
    "timestamp" timestamp with time zone DEFAULT now(),
    category character varying(20) DEFAULT 'informational'::character varying,
    action_buttons jsonb
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id character varying(36) DEFAULT gen_random_uuid() NOT NULL,
    system_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(100)
);


--
-- Name: system_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_context (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trading_mode public.trading_mode DEFAULT 'paper'::public.trading_mode NOT NULL,
    last_safe_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_engine_active boolean DEFAULT false NOT NULL,
    last_mode_change timestamp with time zone,
    changed_by character varying(50),
    change_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_started_by uuid,
    last_stopped_by uuid,
    last_heartbeat timestamp with time zone,
    lhts_enabled boolean DEFAULT false,
    lhts_last_run timestamp with time zone,
    lhts_adjustments_count integer DEFAULT 0,
    latti_mode character varying(20) DEFAULT 'paper'::character varying,
    latti_last_anchor_time timestamp with time zone,
    latti_last_mode_sync_time timestamp with time zone,
    trading_pace character varying(20) DEFAULT 'baseline'::character varying,
    maker_fee_pct numeric(5,4) DEFAULT 0.0016,
    taker_fee_pct numeric(5,4) DEFAULT 0.0026,
    default_fee_mode character varying(10) DEFAULT 'taker'::character varying,
    min_net_profit_threshold numeric(5,4) DEFAULT 0.0030,
    balance_last_confirmed timestamp with time zone,
    baseline_mode character varying(20) DEFAULT 'per_simulation'::character varying
);


--
-- Name: system_context_backup_20251023; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_context_backup_20251023 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    trading_mode public.trading_mode DEFAULT 'paper'::public.trading_mode NOT NULL,
    last_safe_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_engine_active boolean DEFAULT false NOT NULL,
    last_mode_change timestamp with time zone,
    changed_by character varying(50),
    change_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying
);


--
-- Name: telemetry_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetry_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode public.trading_mode NOT NULL,
    symbol character varying(20) NOT NULL,
    regime public.market_regime NOT NULL,
    final_score numeric(5,4) NOT NULL,
    hybrid_score numeric(5,4),
    regime_weight numeric(5,4),
    predictive_confidence numeric(5,4),
    success_rate numeric(5,4),
    sample_count integer DEFAULT 1,
    timeframe character varying(10),
    checksum character varying(64),
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    persisted_at timestamp with time zone DEFAULT now() NOT NULL,
    pool text DEFAULT 'ideal'::text,
    position_size double precision,
    size_multiplier double precision
);


--
-- Name: telemetry_lineage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetry_lineage (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trace_id character varying(100) NOT NULL,
    stage character varying(50) NOT NULL,
    symbol character varying(20),
    mode character varying(10) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    metadata jsonb,
    CONSTRAINT telemetry_lineage_mode_check CHECK (((mode)::text = ANY (ARRAY[('live'::character varying)::text, ('paper'::character varying)::text])))
);


--
-- Name: telemetry_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetry_state (
    id integer NOT NULL,
    mode character varying(10) NOT NULL,
    cycle_count integer DEFAULT 0,
    last_cycle_time_ms integer,
    avg_cycle_time_ms integer,
    health_status character varying(20) DEFAULT 'healthy'::character varying,
    metrics jsonb,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: telemetry_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telemetry_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telemetry_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telemetry_state_id_seq OWNED BY public.telemetry_state.id;


--
-- Name: trade_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_logs (
    id integer NOT NULL,
    mode character varying(10) NOT NULL,
    symbol character varying(20) NOT NULL,
    side character varying(10) NOT NULL,
    quantity numeric(18,8) NOT NULL,
    price numeric(12,2) NOT NULL,
    strategy_id integer,
    executed_at timestamp without time zone DEFAULT now(),
    status character varying(20) DEFAULT 'executed'::character varying,
    metadata jsonb
);


--
-- Name: trade_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_logs_id_seq OWNED BY public.trade_logs.id;


--
-- Name: trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trades (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    strategy public.strategy_type NOT NULL,
    mode public.trading_mode NOT NULL,
    status public.trade_status DEFAULT 'open'::public.trade_status,
    entry_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    quantity numeric(20,8) NOT NULL,
    stop_price numeric(20,8) NOT NULL,
    target_price numeric(20,8) NOT NULL,
    entry_order_id character varying,
    stop_order_id character varying,
    target_order_id character varying,
    entry_fee numeric(10,4) DEFAULT '0'::numeric,
    exit_fee numeric(10,4) DEFAULT '0'::numeric,
    entry_slippage numeric(5,2) DEFAULT '0'::numeric,
    exit_slippage numeric(5,2) DEFAULT '0'::numeric,
    risk_amount numeric(10,2) NOT NULL,
    realized_pl numeric(10,2),
    realized_pl_percent numeric(8,4),
    realized_pl_r numeric(8,4),
    entry_time timestamp with time zone DEFAULT now(),
    exit_time timestamp with time zone,
    metadata jsonb,
    mfe numeric(10,2),
    mae numeric(10,2),
    trade_mode character varying(20) DEFAULT 'TARGET'::character varying,
    signal_type public.signal_type DEFAULT 'QUANT'::public.signal_type NOT NULL,
    pattern_type public.pattern_type,
    pattern_strength numeric(4,3),
    source_pool text,
    filter_tier text,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL,
    base_currency character varying(10) NOT NULL
);


--
-- Name: trading_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trading_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    action character varying(50) NOT NULL,
    mode character varying(10) NOT NULL,
    triggered_by character varying(50) DEFAULT 'manual'::character varying,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trading_settings_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trading_settings_legacy (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    risk_per_trade numeric(10,2) DEFAULT 150.00,
    max_exposure_percent numeric(5,2) DEFAULT 25.00,
    max_open_trades integer DEFAULT 3,
    slippage_tolerance_majors numeric(5,2) DEFAULT 0.50,
    slippage_tolerance_midcaps numeric(5,2) DEFAULT 2.00,
    slippage_tolerance_small numeric(5,2) DEFAULT 5.00,
    stop_buffer_percent numeric(5,2) DEFAULT 0.30,
    sma_length integer DEFAULT 20,
    min_volume numeric(15,2) DEFAULT 30000000.00,
    min_daily_range numeric(5,2) DEFAULT 6.50,
    ai_capital_allocation boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    timezone character varying(50) DEFAULT 'Asia/Dubai'::character varying,
    time_format character varying(10) DEFAULT '12hr'::character varying,
    min_price numeric(10,8) DEFAULT 0.01,
    max_bid_ask_spread numeric(5,2) DEFAULT 1.00,
    exclude_stablecoins boolean DEFAULT true,
    min_data_history_days integer DEFAULT 90,
    allowed_trading_pairs text[] DEFAULT ARRAY['USD'::text, 'USDT'::text],
    blacklisted_symbols text[] DEFAULT ARRAY[]::text[],
    whitelisted_symbols text[] DEFAULT ARRAY[]::text[],
    vwap_timeframe integer DEFAULT 60,
    vwap_pullback_threshold numeric(5,2) DEFAULT 2.00,
    vwap_volume_multiplier numeric(5,2) DEFAULT 1.50,
    vwap_max_holding_period integer DEFAULT 24,
    abcd_min_consolidation integer DEFAULT 10,
    abcd_breakout_threshold numeric(5,2) DEFAULT 1.50,
    abcd_volume_multiplier numeric(5,2) DEFAULT 1.50,
    abcd_exit_type character varying(20) DEFAULT 'target'::character varying,
    abcd_target_percent numeric(5,2) DEFAULT 3.00,
    abcd_trailing_stop_percent numeric(5,2) DEFAULT 2.00,
    sma_entry_condition character varying(20) DEFAULT 'crossover'::character varying,
    sma_exit_condition character varying(20) DEFAULT 'break'::character varying,
    sma_trailing_stop_percent numeric(5,2) DEFAULT 2.00,
    daily_loss_kill_switch numeric(5,2) DEFAULT 7.00,
    daily_loss_warning_trigger numeric(5,2) DEFAULT 75.00,
    trading_suspended boolean DEFAULT false,
    partial_fill_threshold numeric(5,2) DEFAULT 90.00,
    partial_fill_action character varying(20) DEFAULT 'scale'::character varying,
    ai_opportunities_enabled boolean DEFAULT true,
    ai_opportunities_frequency integer DEFAULT 60,
    ai_opportunities_max_pairs integer DEFAULT 150,
    ai_opportunities_max_saved integer DEFAULT 40,
    walter_memory_depth integer DEFAULT 20,
    walter_memory_limit integer DEFAULT 500,
    walter_auto_summarize boolean DEFAULT true,
    portfolio_value numeric(15,2) DEFAULT 50000.00,
    max_position_percent numeric(5,2) DEFAULT 10.00,
    show_system_alerts boolean DEFAULT true,
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL,
    auto_start_paper_trading boolean DEFAULT false,
    risk_per_trade_pct numeric(5,2) DEFAULT 4.00
);


--
-- Name: trading_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trading_signals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    mode character varying DEFAULT 'paper'::character varying NOT NULL,
    symbol character varying(20) NOT NULL,
    base_currency character varying(10) NOT NULL,
    quote_currency character varying(10) NOT NULL,
    strategy character varying NOT NULL,
    confidence numeric(5,4) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    stop_price numeric(20,8) NOT NULL,
    target_price numeric(20,8) NOT NULL,
    current_price numeric(20,8) NOT NULL,
    vwap numeric(20,8),
    volume_24h numeric(20,2),
    daily_range numeric(5,2),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    detected_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    executed_at timestamp with time zone,
    metadata jsonb,
    quantity numeric(20,8),
    estimated_value numeric(20,2),
    source_pool text,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL
);


--
-- Name: tuning_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tuning_event (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode character varying NOT NULL,
    field character varying NOT NULL,
    old_value character varying NOT NULL,
    new_value character varying NOT NULL,
    confidence numeric(4,2) NOT NULL,
    reason text NOT NULL,
    approval_type public.tuning_approval_type NOT NULL,
    status public.tuning_status NOT NULL,
    reverted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tuning_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tuning_policy (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode character varying NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    aggressiveness public.tuning_aggressiveness DEFAULT 'balanced'::public.tuning_aggressiveness NOT NULL,
    max_step_percent numeric(5,2) DEFAULT 10.00 NOT NULL,
    cooldown_minutes integer DEFAULT 60 NOT NULL,
    max_daily_adjustments integer DEFAULT 10 NOT NULL,
    field_bounds jsonb DEFAULT '{}'::jsonb NOT NULL,
    current_counters jsonb DEFAULT '{"reverts": 0, "adjustmentsToday": 0}'::jsonb NOT NULL,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    policy_version integer DEFAULT 1 NOT NULL
);


--
-- Name: user_goals_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_goals_audit (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    mode public.trading_mode NOT NULL,
    metric_name character varying(100) NOT NULL,
    attempted_value numeric(20,8) NOT NULL,
    feasibility_status character varying(20) NOT NULL,
    feasibility_reason text,
    risk_limit numeric(20,8),
    exceeds_by numeric(20,8),
    exploratory_mode boolean DEFAULT false,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password text,
    display_name text,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    is_admin boolean DEFAULT false NOT NULL,
    role character varying DEFAULT 'owner'::character varying NOT NULL,
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL,
    trading_mode character varying DEFAULT 'paper'::character varying,
    trading_status character varying DEFAULT 'stopped'::character varying,
    approval_matrix jsonb DEFAULT '{"autoExecute": {"adjustGoals": true, "deployStrategies": true, "modifyGuardrails": false, "startLiveTrading": true}, "requiresApproval": {"editStrategy": false, "stopLiveTrading": false, "editRiskSettings": true, "changeTradingMode": false}}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_filters_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_filters_active AS
 SELECT id,
    mode,
    min_volume,
    min_liquidity,
    min_price,
    max_price,
    min_market_cap,
    max_bid_ask_spread,
    rsi_min,
    rsi_max,
    volatility_min,
    volatility_max,
    exclude_stablecoins,
    allow_regulated_only,
    universe_size,
    quote_currencies,
    active_timeframes,
    confidence_threshold,
    created_at,
    updated_at
   FROM public.screener_filters;


--
-- Name: v_goals_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_goals_active AS
 SELECT id,
    mode,
    name AS preset_name,
    target_daily_avg_earning_pct,
    trades_per_day_est,
    portfolio_risk_per_trade_pct,
    daily_loss_kill_switch_pct,
    symbol_cooldown_minutes,
    max_open_positions,
    is_active,
    last_adjusted_at,
    learning_active,
    created_at,
    updated_at
   FROM public.goals_presets;


--
-- Name: v_goals_learning_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_goals_learning_summary AS
 SELECT mode,
    round(avg(avg_daily_return), 3) AS avg_daily_return_30d,
    round(avg(avg_risk_per_trade), 3) AS avg_risk_per_trade_30d,
    round(avg(avg_drawdown), 3) AS avg_drawdown_30d,
    sum(trades_count) AS total_trades_30d
   FROM public.goals_learning_metrics
  WHERE (date >= (CURRENT_DATE - '30 days'::interval))
  GROUP BY mode;


--
-- Name: v_guardrails_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_guardrails_active AS
 SELECT id,
    mode,
    portfolio_risk_per_trade_pct,
    symbol_cooldown_minutes,
    max_open_positions,
    daily_loss_kill_switch_pct,
    is_manual_override,
    tuned_by_latti,
    locked_by_user,
    kill_switch_tripped,
    kill_switch_reason,
    kill_switch_tripped_at,
    last_updated
   FROM public.guardrails_v2;


--
-- Name: v_guardrails_compliance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_guardrails_compliance AS
 SELECT mode,
    portfolio_risk_per_trade_pct,
    daily_loss_kill_switch_pct,
    max_open_positions,
    symbol_cooldown_minutes,
        CASE
            WHEN (portfolio_risk_per_trade_pct <= (daily_loss_kill_switch_pct / (10)::numeric)) THEN 'PASS'::text
            WHEN (portfolio_risk_per_trade_pct <= (daily_loss_kill_switch_pct / (5)::numeric)) THEN 'WARN'::text
            ELSE 'FAIL'::text
        END AS coherency_status,
    is_manual_override,
    tuned_by_latti,
    locked_by_user,
    last_updated
   FROM public.guardrails_v2;


--
-- Name: v_guardrails_transitional; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_guardrails_transitional AS
 SELECT g.mode,
    g.portfolio_risk_per_trade_pct AS risk_pct,
    g.daily_loss_kill_switch_pct AS kill_switch_pct,
    g.symbol_cooldown_minutes AS cooldown,
    g.max_open_positions AS positions,
    g.is_manual_override,
    g.tuned_by_latti,
    g.last_updated,
    legacy.max_daily_loss,
    legacy.max_drawdown,
    legacy.max_position_size,
    legacy.risk_per_trade AS legacy_risk_pct,
    legacy.cooldown_minutes AS legacy_cooldown,
    legacy.max_open_positions AS legacy_positions,
    legacy.ai_can_adjust AS legacy_ai_adjust,
        CASE
            WHEN (g.portfolio_risk_per_trade_pct <= (g.daily_loss_kill_switch_pct / (10)::numeric)) THEN 'PASS'::text
            ELSE 'FAIL'::text
        END AS coherency_rule_001,
        CASE
            WHEN (((g.max_open_positions)::numeric * g.portfolio_risk_per_trade_pct) <= (100)::numeric) THEN 'PASS'::text
            ELSE 'WARN'::text
        END AS coherency_rule_002,
        CASE
            WHEN (NOT (g.is_manual_override AND g.tuned_by_latti)) THEN 'PASS'::text
            ELSE 'FAIL'::text
        END AS coherency_rule_005
   FROM (public.guardrails_v2 g
     LEFT JOIN public.guardrails legacy ON ((legacy.mode = g.mode)));


--
-- Name: value_alignment_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.value_alignment_matrix (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    objective_name character varying NOT NULL,
    value_category public.value_category NOT NULL,
    alignment_score numeric(3,2) NOT NULL,
    weighting numeric(3,2) DEFAULT 1.00 NOT NULL,
    constraints jsonb,
    last_evaluated timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    mode public.trading_mode NOT NULL
);


--
-- Name: vts_open_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vts_open_trades (
    id text NOT NULL,
    symbol text NOT NULL,
    asset_class text NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    stop_loss numeric(20,8) NOT NULL,
    take_profit numeric(20,8) NOT NULL,
    position_size numeric(20,8) NOT NULL,
    dollar_value numeric(20,2) NOT NULL,
    quantity numeric(20,8) NOT NULL,
    regime text NOT NULL,
    signal_type text NOT NULL,
    strategy text NOT NULL,
    pool text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed boolean DEFAULT false NOT NULL,
    closed_at timestamp with time zone,
    state character varying(32) DEFAULT 'open'::character varying NOT NULL,
    CONSTRAINT vts_open_trades_state_consistency CHECK (((((closed = false) AND ((state)::text = ANY ((ARRAY['open'::character varying, 'weekend_suspended'::character varying])::text[]))) OR ((closed = true) AND ((state)::text = 'closed'::text))) AND (((state)::text <> 'weekend_suspended'::text) OR (asset_class = 'xstock_spot'::text))))
);


--
-- Name: walter_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_actions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode public.trading_mode NOT NULL,
    action_type public.walter_action_type NOT NULL,
    category public.walter_action_category NOT NULL,
    status public.walter_action_status DEFAULT 'pending'::public.walter_action_status NOT NULL,
    impact_score numeric(5,2) NOT NULL,
    affected_component text NOT NULL,
    detected_anomaly text NOT NULL,
    context_data jsonb,
    suggested_fix text NOT NULL,
    executed_action text,
    resolution_status character varying(50),
    resolution_notes text,
    confidence_score numeric(3,2),
    incident_key character varying(255) NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    cooldown_until timestamp with time zone,
    parent_action_id character varying,
    trading_paused boolean DEFAULT false NOT NULL,
    detected_at timestamp with time zone DEFAULT now(),
    action_at timestamp with time zone,
    resolved_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    requires_approval boolean DEFAULT false NOT NULL,
    escalated boolean DEFAULT false NOT NULL,
    suppress_reason text,
    user_feedback text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: walter_approvals_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_approvals_audit (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    approval_id character varying NOT NULL,
    user_id character varying NOT NULL,
    decision character varying(20) NOT NULL,
    decision_method character varying(50),
    notes text,
    execution_result jsonb,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: walter_chat_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_chat_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id character varying NOT NULL,
    user_id character varying NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: walter_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_chats (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    title text DEFAULT 'New Chat'::text,
    status public.walter_chat_status DEFAULT 'active'::public.walter_chat_status,
    is_approval_thread boolean DEFAULT false,
    approval_id character varying,
    message_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone,
    pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    global_context_id character varying(50) DEFAULT 'default'::character varying NOT NULL
);


--
-- Name: walter_execution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_execution_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode character varying(10) NOT NULL,
    command_text text NOT NULL,
    action_type character varying(100) NOT NULL,
    source character varying(50) NOT NULL,
    approval_status character varying(30) NOT NULL,
    approval_reason text,
    execution_status character varying(20) NOT NULL,
    result_message text,
    result_details jsonb,
    projected_risk numeric(5,2),
    actual_risk numeric(5,2),
    execution_time_ms integer,
    chat_session_id character varying,
    approval_id character varying,
    cluster_event_id character varying,
    created_at timestamp with time zone DEFAULT now(),
    executed_at timestamp with time zone,
    CONSTRAINT walter_execution_log_mode_check CHECK (((mode)::text = ANY (ARRAY[('live'::character varying)::text, ('paper'::character varying)::text])))
);


--
-- Name: walter_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_memory (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type public.walter_memory_type NOT NULL,
    content text NOT NULL,
    importance integer DEFAULT 3 NOT NULL,
    chat_id character varying,
    metadata jsonb,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: walter_pending_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_pending_approvals (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    strategy_name character varying(100),
    parameter_name character varying(100) NOT NULL,
    current_value jsonb NOT NULL,
    proposed_value jsonb NOT NULL,
    projected_risk numeric(5,2) NOT NULL,
    risk_details jsonb,
    status public.approval_status DEFAULT 'pending'::public.approval_status,
    chat_session_id character varying,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    approved_by character varying,
    created_at timestamp with time zone DEFAULT now(),
    mode public.trading_mode NOT NULL,
    trace_id character varying(100),
    action character varying(100),
    display_mode public.approval_display_mode DEFAULT 'inline'::public.approval_display_mode,
    expires_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    cleared_at timestamp with time zone
);


--
-- Name: walter_purpose; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_purpose (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    content text NOT NULL,
    updated_by character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mode public.trading_mode NOT NULL
);


--
-- Name: walter_user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walter_user_preferences (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    view_mode public.walter_view_mode DEFAULT 'compact'::public.walter_view_mode NOT NULL,
    theme public.walter_theme DEFAULT 'system'::public.walter_theme NOT NULL,
    tone public.walter_tone DEFAULT 'professional'::public.walter_tone NOT NULL,
    send_key_preference character varying(20) DEFAULT 'enter'::character varying NOT NULL,
    sidebar_collapsed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: watchlist_pairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist_pairs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    symbol character varying(20) NOT NULL,
    base_currency character varying(10) NOT NULL,
    quote_currency character varying(10) NOT NULL,
    market_cap numeric(20,2),
    volume_24h numeric(20,2),
    current_price numeric(20,8),
    vwap numeric(20,8),
    sma numeric(20,8),
    daily_range numeric(5,2),
    last_scanned timestamp with time zone,
    is_active boolean DEFAULT true,
    added_at timestamp with time zone DEFAULT now(),
    mode public.trading_mode DEFAULT 'paper'::public.trading_mode NOT NULL,
    exchange text DEFAULT 'kraken'::text NOT NULL,
    asset_class text DEFAULT 'crypto_spot'::text NOT NULL
);


--
-- Name: watchlist_pairs_backup_20251023; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist_pairs_backup_20251023 (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    symbol character varying(20) NOT NULL,
    base_currency character varying(10) NOT NULL,
    quote_currency character varying(10) NOT NULL,
    market_cap numeric(20,2),
    volume_24h numeric(20,2),
    current_price numeric(20,8),
    vwap numeric(20,8),
    sma numeric(20,8),
    daily_range numeric(5,2),
    last_scanned timestamp with time zone,
    is_active boolean DEFAULT true,
    added_at timestamp with time zone DEFAULT now(),
    mode public.trading_mode DEFAULT 'paper'::public.trading_mode NOT NULL
);


--
-- Name: watchlist_pairs_user_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist_pairs_user_archive (
    id character varying,
    user_id character varying,
    symbol character varying(20),
    base_currency character varying(10),
    quote_currency character varying(10),
    market_cap numeric(20,2),
    volume_24h numeric(20,2),
    current_price numeric(20,8),
    vwap numeric(20,8),
    sma numeric(20,8),
    daily_range numeric(5,2),
    last_scanned timestamp with time zone,
    is_active boolean,
    added_at timestamp with time zone,
    mode public.trading_mode
);


--
-- Name: xstock_dbs_backfill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_dbs_backfill (
    symbol text NOT NULL,
    sector text NOT NULL,
    ts timestamp with time zone NOT NULL,
    final_score double precision NOT NULL,
    slope_component double precision NOT NULL,
    return_component double precision NOT NULL,
    ema_component double precision NOT NULL,
    sentinel_zero boolean NOT NULL,
    atr double precision,
    volume_24h_usd double precision,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: xstock_perp_ohlc_1m_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_04 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_05 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_06 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_07 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_08 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_09 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_10 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_11 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2026_12 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2027_01 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2027_02 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2027_03 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ohlc_1m_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ohlc_1m_2027_04 (
    id bigint DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_04 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_05 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_06 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_07 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_08 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_09 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_10 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_11 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2026_12 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2027_01 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2027_02 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2027_03 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_perp_ticker_snap_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_perp_ticker_snap_2027_04 (
    id bigint DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_perp'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-futures'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_04 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_05 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_06 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_07 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_08 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_09 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_10 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_11 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2026_12 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2027_01 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2027_02 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2027_03 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_1m_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_1m_2027_04 (
    id bigint DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    interval_begin timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) NOT NULL,
    vwap numeric(20,8),
    trade_count integer,
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ohlc_60m_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ohlc_60m_snapshot (
    symbol character varying(32) NOT NULL,
    bucket_ts timestamp with time zone NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    volume numeric(28,8) DEFAULT 0 NOT NULL,
    source_bar_count integer DEFAULT 0 NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_04 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_05 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_06 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_07 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_08 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_09 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_10 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_11 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2026_12 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2027_01 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2027_02 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2027_03 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_ticker_snap_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_ticker_snap_2027_04 (
    id bigint DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass) NOT NULL,
    symbol text NOT NULL,
    asset_class text DEFAULT 'xstock_spot'::text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    bid numeric(20,8),
    bid_qty numeric(28,8),
    ask numeric(20,8),
    ask_qty numeric(28,8),
    last numeric(20,8),
    volume_24h numeric(28,8),
    vwap_24h numeric(20,8),
    high_24h numeric(20,8),
    low_24h numeric(20,8),
    open_24h numeric(20,8),
    prev_day_close numeric(20,8),
    prev_day_volume numeric(28,8),
    is_extended_hours boolean,
    open_interest numeric(28,8),
    funding_rate numeric(12,8),
    metadata jsonb DEFAULT '{"schema_version": 1}'::jsonb NOT NULL,
    exchange text DEFAULT 'kraken-equities'::text NOT NULL
);


--
-- Name: xstock_spot_universe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_universe (
    symbol text NOT NULL,
    name text NOT NULL,
    sector text NOT NULL,
    crypto_adjacent boolean DEFAULT false NOT NULL,
    adr boolean DEFAULT false NOT NULL,
    source_chain jsonb NOT NULL,
    is_delisted boolean DEFAULT false NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xstock_spot_universe_sector_chk CHECK ((sector = ANY (ARRAY['XLK'::text, 'XLV'::text, 'XLF'::text, 'XLC'::text, 'XLY'::text, 'XLP'::text, 'XLE'::text, 'XLI'::text, 'XLRE'::text, 'XLU'::text, 'XLB'::text, 'BROAD_ETF'::text, 'INDEX_PROXY'::text, 'INTL_ETF'::text, 'UNCATEGORIZED'::text])))
);


--
-- Name: xstock_spot_universe_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xstock_spot_universe_overrides (
    symbol text NOT NULL,
    sector_override text,
    crypto_adjacent_override boolean,
    adr_override boolean,
    name_override text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xstock_spot_universe_overrides_sector_chk CHECK (((sector_override IS NULL) OR (sector_override = ANY (ARRAY['XLK'::text, 'XLV'::text, 'XLF'::text, 'XLC'::text, 'XLY'::text, 'XLP'::text, 'XLE'::text, 'XLI'::text, 'XLRE'::text, 'XLU'::text, 'XLB'::text, 'BROAD_ETF'::text, 'INDEX_PROXY'::text, 'INTL_ETF'::text, 'UNCATEGORIZED'::text]))))
);


--
-- Name: crypto_spot_ohlc_1m_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: crypto_spot_ohlc_1m_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: crypto_spot_ticker_snap_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ATTACH PARTITION public.crypto_spot_ticker_snap_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: exit_decision_archive_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: exit_decision_archive_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: exit_decision_archive_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: exit_decision_archive_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: exit_decision_archive_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ATTACH PARTITION public.exit_decision_archive_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: macro_feed_archive_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: macro_feed_archive_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: macro_feed_archive_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: macro_feed_archive_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: macro_feed_archive_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ATTACH PARTITION public.macro_feed_archive_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: pair_scan_archive_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: pair_scan_archive_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: pair_scan_archive_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: pair_scan_archive_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: pair_scan_archive_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ATTACH PARTITION public.pair_scan_archive_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: signal_eval_archive_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: signal_eval_archive_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: signal_eval_archive_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: signal_eval_archive_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: signal_eval_archive_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ATTACH PARTITION public.signal_eval_archive_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: xstock_perp_ohlc_1m_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: xstock_perp_ticker_snap_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ATTACH PARTITION public.xstock_perp_ticker_snap_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: xstock_spot_ohlc_1m_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: xstock_spot_ticker_snap_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ATTACH PARTITION public.xstock_spot_ticker_snap_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: ai_orchestrator_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_orchestrator_logs ALTER COLUMN id SET DEFAULT nextval('public.ai_orchestrator_logs_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: b62_retroactive_labels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b62_retroactive_labels ALTER COLUMN id SET DEFAULT nextval('public.b62_retroactive_labels_id_seq'::regclass);


--
-- Name: behavioral_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_log ALTER COLUMN id SET DEFAULT nextval('public.behavioral_log_id_seq'::regclass);


--
-- Name: behavioral_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_state ALTER COLUMN id SET DEFAULT nextval('public.behavioral_state_id_seq'::regclass);


--
-- Name: context_chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_chats ALTER COLUMN id SET DEFAULT nextval('public.context_chats_id_seq'::regclass);


--
-- Name: crypto_spot_ohlc_1m id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m ALTER COLUMN id SET DEFAULT nextval('public.crypto_spot_ohlc_1m_id_seq'::regclass);


--
-- Name: crypto_spot_ticker_snap id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap ALTER COLUMN id SET DEFAULT nextval('public.crypto_spot_ticker_snap_id_seq'::regclass);


--
-- Name: discovery_runs run_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_runs ALTER COLUMN run_id SET DEFAULT nextval('public.discovery_runs_run_id_seq'::regclass);


--
-- Name: exit_decision_archive id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive ALTER COLUMN id SET DEFAULT nextval('public.exit_decision_archive_id_seq'::regclass);


--
-- Name: latti_motivation_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.latti_motivation_state ALTER COLUMN id SET DEFAULT nextval('public.latti_motivation_state_id_seq'::regclass);


--
-- Name: learning_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_history ALTER COLUMN id SET DEFAULT nextval('public.learning_history_id_seq'::regclass);


--
-- Name: lottie_oversight_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lottie_oversight_log ALTER COLUMN id SET DEFAULT nextval('public.lottie_oversight_log_id_seq'::regclass);


--
-- Name: macro_feed_archive id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive ALTER COLUMN id SET DEFAULT nextval('public.macro_feed_archive_id_seq'::regclass);


--
-- Name: pair_scan_archive id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive ALTER COLUMN id SET DEFAULT nextval('public.pair_scan_archive_id_seq'::regclass);


--
-- Name: regime_factor_alternates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regime_factor_alternates ALTER COLUMN id SET DEFAULT nextval('public.regime_factor_alternates_id_seq'::regclass);


--
-- Name: scheduled_tasks_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_tasks_audit ALTER COLUMN id SET DEFAULT nextval('public.scheduled_tasks_audit_id_seq'::regclass);


--
-- Name: signal_eval_archive id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive ALTER COLUMN id SET DEFAULT nextval('public.signal_eval_archive_id_seq'::regclass);


--
-- Name: strategies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategies ALTER COLUMN id SET DEFAULT nextval('public.strategies_id_seq'::regclass);


--
-- Name: strategy_mix_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_mix_log ALTER COLUMN id SET DEFAULT nextval('public.strategy_mix_log_id_seq'::regclass);


--
-- Name: telemetry_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_state ALTER COLUMN id SET DEFAULT nextval('public.telemetry_state_id_seq'::regclass);


--
-- Name: trade_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_logs ALTER COLUMN id SET DEFAULT nextval('public.trade_logs_id_seq'::regclass);


--
-- Name: xstock_perp_ohlc_1m id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m ALTER COLUMN id SET DEFAULT nextval('public.equity_perp_ohlc_1m_id_seq'::regclass);


--
-- Name: xstock_perp_ticker_snap id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap ALTER COLUMN id SET DEFAULT nextval('public.equity_perp_ticker_snap_id_seq'::regclass);


--
-- Name: xstock_spot_ohlc_1m id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m ALTER COLUMN id SET DEFAULT nextval('public.equity_spot_ohlc_1m_id_seq'::regclass);


--
-- Name: xstock_spot_ticker_snap id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap ALTER COLUMN id SET DEFAULT nextval('public.equity_spot_ticker_snap_id_seq'::regclass);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (name);


--
-- Name: actuation_policies actuation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actuation_policies
    ADD CONSTRAINT actuation_policies_pkey PRIMARY KEY (id);


--
-- Name: adaptive_learning adaptive_learning_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adaptive_learning
    ADD CONSTRAINT adaptive_learning_pkey PRIMARY KEY (id);


--
-- Name: agent_learning_delta agent_learning_delta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_learning_delta
    ADD CONSTRAINT agent_learning_delta_pkey PRIMARY KEY (id);


--
-- Name: agent_learning_feedback agent_learning_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_learning_feedback
    ADD CONSTRAINT agent_learning_feedback_pkey PRIMARY KEY (id);


--
-- Name: agent_registry agent_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_registry
    ADD CONSTRAINT agent_registry_pkey PRIMARY KEY (id);


--
-- Name: ai_audit_log ai_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_audit_log
    ADD CONSTRAINT ai_audit_log_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_logs ai_chat_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_logs
    ADD CONSTRAINT ai_chat_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_lessons ai_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_lessons
    ADD CONSTRAINT ai_lessons_pkey PRIMARY KEY (id);


--
-- Name: ai_market_analyses ai_market_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_market_analyses
    ADD CONSTRAINT ai_market_analyses_pkey PRIMARY KEY (id);


--
-- Name: ai_opportunities ai_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_opportunities
    ADD CONSTRAINT ai_opportunities_pkey PRIMARY KEY (id);


--
-- Name: ai_opportunity_runs ai_opportunity_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_opportunity_runs
    ADD CONSTRAINT ai_opportunity_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_orchestrator_logs ai_orchestrator_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_orchestrator_logs
    ADD CONSTRAINT ai_orchestrator_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_reports ai_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_reports
    ADD CONSTRAINT ai_reports_pkey PRIMARY KEY (id);


--
-- Name: ai_transparency_log ai_transparency_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_transparency_log
    ADD CONSTRAINT ai_transparency_log_pkey PRIMARY KEY (id);


--
-- Name: alignment_audit_log alignment_audit_log_audit_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alignment_audit_log
    ADD CONSTRAINT alignment_audit_log_audit_id_unique UNIQUE (audit_id);


--
-- Name: alignment_audit_log alignment_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alignment_audit_log
    ADD CONSTRAINT alignment_audit_log_pkey PRIMARY KEY (id);


--
-- Name: alignment_policies alignment_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alignment_policies
    ADD CONSTRAINT alignment_policies_pkey PRIMARY KEY (id);


--
-- Name: alignment_policies alignment_policies_policy_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alignment_policies
    ADD CONSTRAINT alignment_policies_policy_id_unique UNIQUE (policy_id);


--
-- Name: asset_capabilities asset_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_capabilities
    ADD CONSTRAINT asset_capabilities_pkey PRIMARY KEY (id);


--
-- Name: asset_capabilities asset_capabilities_symbol_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_capabilities
    ADD CONSTRAINT asset_capabilities_symbol_unique UNIQUE (symbol);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: autonomy_audit_log autonomy_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_audit_log
    ADD CONSTRAINT autonomy_audit_log_pkey PRIMARY KEY (id);


--
-- Name: awareness_state_log awareness_state_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awareness_state_log
    ADD CONSTRAINT awareness_state_log_pkey PRIMARY KEY (id);


--
-- Name: awareness_state_log awareness_state_log_state_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awareness_state_log
    ADD CONSTRAINT awareness_state_log_state_id_unique UNIQUE (state_id);


--
-- Name: b62_retroactive_labels b62_retroactive_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b62_retroactive_labels
    ADD CONSTRAINT b62_retroactive_labels_pkey PRIMARY KEY (id);


--
-- Name: b62_retroactive_labels b62_retroactive_labels_trade_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b62_retroactive_labels
    ADD CONSTRAINT b62_retroactive_labels_trade_id_key UNIQUE (trade_id);


--
-- Name: behavioral_log behavioral_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_log
    ADD CONSTRAINT behavioral_log_pkey PRIMARY KEY (id);


--
-- Name: behavioral_state behavioral_state_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_state
    ADD CONSTRAINT behavioral_state_mode_key UNIQUE (mode);


--
-- Name: behavioral_state behavioral_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_state
    ADD CONSTRAINT behavioral_state_pkey PRIMARY KEY (id);


--
-- Name: bias_correction_log bias_correction_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bias_correction_log
    ADD CONSTRAINT bias_correction_log_pkey PRIMARY KEY (id);


--
-- Name: bias_observation_log bias_observation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bias_observation_log
    ADD CONSTRAINT bias_observation_log_pkey PRIMARY KEY (id);


--
-- Name: bob_trace_log bob_trace_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bob_trace_log
    ADD CONSTRAINT bob_trace_log_pkey PRIMARY KEY (id);


--
-- Name: cluster_audit_log cluster_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_audit_log
    ADD CONSTRAINT cluster_audit_log_pkey PRIMARY KEY (id);


--
-- Name: cluster_bus_event cluster_bus_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_bus_event
    ADD CONSTRAINT cluster_bus_event_pkey PRIMARY KEY (id);


--
-- Name: cluster_circuit_breaker cluster_circuit_breaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_circuit_breaker
    ADD CONSTRAINT cluster_circuit_breaker_pkey PRIMARY KEY (id);


--
-- Name: cluster_node cluster_node_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_node
    ADD CONSTRAINT cluster_node_name_key UNIQUE (name);


--
-- Name: cluster_node cluster_node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_node
    ADD CONSTRAINT cluster_node_pkey PRIMARY KEY (id);


--
-- Name: cluster_result_log cluster_result_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_result_log
    ADD CONSTRAINT cluster_result_log_pkey PRIMARY KEY (id);


--
-- Name: cluster_task_queue cluster_task_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_task_queue
    ADD CONSTRAINT cluster_task_queue_pkey PRIMARY KEY (id);


--
-- Name: cognitive_core_state cognitive_core_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_core_state
    ADD CONSTRAINT cognitive_core_state_pkey PRIMARY KEY (id);


--
-- Name: cognitive_tuning_log cognitive_tuning_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_tuning_log
    ADD CONSTRAINT cognitive_tuning_log_pkey PRIMARY KEY (id);


--
-- Name: collaboration_messages collaboration_messages_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaboration_messages
    ADD CONSTRAINT collaboration_messages_message_id_key UNIQUE (message_id);


--
-- Name: collaboration_messages collaboration_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaboration_messages
    ADD CONSTRAINT collaboration_messages_pkey PRIMARY KEY (id);


--
-- Name: collaboration_sessions collaboration_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaboration_sessions
    ADD CONSTRAINT collaboration_sessions_pkey PRIMARY KEY (id);


--
-- Name: collaboration_sessions collaboration_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collaboration_sessions
    ADD CONSTRAINT collaboration_sessions_session_id_key UNIQUE (session_id);


--
-- Name: confidence_drift_log confidence_drift_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_drift_log
    ADD CONSTRAINT confidence_drift_log_pkey PRIMARY KEY (id);


--
-- Name: config_registry config_registry_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_registry
    ADD CONSTRAINT config_registry_key_key UNIQUE (key);


--
-- Name: config_registry config_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_registry
    ADD CONSTRAINT config_registry_pkey PRIMARY KEY (id);


--
-- Name: consensus_snapshots consensus_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consensus_snapshots
    ADD CONSTRAINT consensus_snapshots_pkey PRIMARY KEY (id);


--
-- Name: consensus_snapshots consensus_snapshots_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consensus_snapshots
    ADD CONSTRAINT consensus_snapshots_snapshot_id_key UNIQUE (snapshot_id);


--
-- Name: context_bridge_log context_bridge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_bridge_log
    ADD CONSTRAINT context_bridge_log_pkey PRIMARY KEY (id);


--
-- Name: context_chats context_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_chats
    ADD CONSTRAINT context_chats_pkey PRIMARY KEY (id);


--
-- Name: conversation_summaries conversation_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (id);


--
-- Name: cross_agent_ethics_session cross_agent_ethics_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_agent_ethics_session
    ADD CONSTRAINT cross_agent_ethics_session_pkey PRIMARY KEY (id);


--
-- Name: cross_node_alignment_log cross_node_alignment_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_node_alignment_log
    ADD CONSTRAINT cross_node_alignment_log_pkey PRIMARY KEY (id);


--
-- Name: crypto_spot_ohlc_1m crypto_spot_ohlc_1m_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m
    ADD CONSTRAINT crypto_spot_ohlc_1m_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_04 crypto_spot_ohlc_1m_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_04
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m crypto_spot_ohlc_1m_symbol_interval_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m
    ADD CONSTRAINT crypto_spot_ohlc_1m_symbol_interval_unique UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_04 crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_04
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_05 crypto_spot_ohlc_1m_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_05
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_05_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_05 crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_05
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_06 crypto_spot_ohlc_1m_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_06
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_06_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_06 crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_06
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_07 crypto_spot_ohlc_1m_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_07
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_07_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_07 crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_07
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_08 crypto_spot_ohlc_1m_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_08
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_08_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_08 crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_08
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_09 crypto_spot_ohlc_1m_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_09
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_09_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_09 crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_09
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_10 crypto_spot_ohlc_1m_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_10
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_10_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_10 crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_10
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_11 crypto_spot_ohlc_1m_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_11
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_11_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_11 crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_11
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2026_12 crypto_spot_ohlc_1m_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_12
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_12_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2026_12 crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2026_12
    ADD CONSTRAINT crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2027_01 crypto_spot_ohlc_1m_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_01
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_01_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2027_01 crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_01
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2027_02 crypto_spot_ohlc_1m_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_02
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_02_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2027_02 crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_02
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2027_03 crypto_spot_ohlc_1m_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_03
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_03_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2027_03 crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_03
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ohlc_1m_2027_04 crypto_spot_ohlc_1m_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_04
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: crypto_spot_ohlc_1m_2027_04 crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ohlc_1m_2027_04
    ADD CONSTRAINT crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: crypto_spot_ticker_snap crypto_spot_ticker_snap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap
    ADD CONSTRAINT crypto_spot_ticker_snap_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_04 crypto_spot_ticker_snap_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_04
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_05 crypto_spot_ticker_snap_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_05
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_05_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_06 crypto_spot_ticker_snap_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_06
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_06_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_07 crypto_spot_ticker_snap_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_07
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_07_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_08 crypto_spot_ticker_snap_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_08
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_08_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_09 crypto_spot_ticker_snap_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_09
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_09_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_10 crypto_spot_ticker_snap_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_10
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_10_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_11 crypto_spot_ticker_snap_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_11
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_11_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2026_12 crypto_spot_ticker_snap_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2026_12
    ADD CONSTRAINT crypto_spot_ticker_snap_2026_12_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2027_01 crypto_spot_ticker_snap_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2027_01
    ADD CONSTRAINT crypto_spot_ticker_snap_2027_01_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2027_02 crypto_spot_ticker_snap_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2027_02
    ADD CONSTRAINT crypto_spot_ticker_snap_2027_02_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2027_03 crypto_spot_ticker_snap_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2027_03
    ADD CONSTRAINT crypto_spot_ticker_snap_2027_03_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: crypto_spot_ticker_snap_2027_04 crypto_spot_ticker_snap_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_spot_ticker_snap_2027_04
    ADD CONSTRAINT crypto_spot_ticker_snap_2027_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: daily_briefs daily_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_briefs
    ADD CONSTRAINT daily_briefs_pkey PRIMARY KEY (id);


--
-- Name: daily_performance_summary daily_performance_summary_mode_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_performance_summary
    ADD CONSTRAINT daily_performance_summary_mode_date_unique UNIQUE (mode, date);


--
-- Name: daily_performance_summary daily_performance_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_performance_summary
    ADD CONSTRAINT daily_performance_summary_pkey PRIMARY KEY (id);


--
-- Name: data_archive_manifest data_archive_manifest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_archive_manifest
    ADD CONSTRAINT data_archive_manifest_pkey PRIMARY KEY (id);


--
-- Name: data_archive_manifest data_archive_manifest_source_table_partition_label_tier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_archive_manifest
    ADD CONSTRAINT data_archive_manifest_source_table_partition_label_tier_key UNIQUE (source_table, partition_label, tier);


--
-- Name: data_lineage data_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_lineage
    ADD CONSTRAINT data_lineage_pkey PRIMARY KEY (id);


--
-- Name: database_size_logs database_size_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_size_logs
    ADD CONSTRAINT database_size_logs_pkey PRIMARY KEY (id);


--
-- Name: decision_quality_audit decision_quality_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decision_quality_audit
    ADD CONSTRAINT decision_quality_audit_pkey PRIMARY KEY (id);


--
-- Name: decision_trace_log decision_trace_log_decision_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decision_trace_log
    ADD CONSTRAINT decision_trace_log_decision_id_key UNIQUE (decision_id);


--
-- Name: decision_trace_log decision_trace_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decision_trace_log
    ADD CONSTRAINT decision_trace_log_pkey PRIMARY KEY (id);


--
-- Name: discovery_runs discovery_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_runs
    ADD CONSTRAINT discovery_runs_pkey PRIMARY KEY (run_id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: ethical_audit_log ethical_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethical_audit_log
    ADD CONSTRAINT ethical_audit_log_pkey PRIMARY KEY (id);


--
-- Name: ethical_principle ethical_principle_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethical_principle
    ADD CONSTRAINT ethical_principle_name_key UNIQUE (name);


--
-- Name: ethical_principle ethical_principle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethical_principle
    ADD CONSTRAINT ethical_principle_pkey PRIMARY KEY (id);


--
-- Name: ethical_rule_set ethical_rule_set_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethical_rule_set
    ADD CONSTRAINT ethical_rule_set_pkey PRIMARY KEY (id);


--
-- Name: ethical_violation_log ethical_violation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethical_violation_log
    ADD CONSTRAINT ethical_violation_log_pkey PRIMARY KEY (id);


--
-- Name: ethics_conflict_register ethics_conflict_register_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethics_conflict_register
    ADD CONSTRAINT ethics_conflict_register_pkey PRIMARY KEY (id);


--
-- Name: ethics_propagation_journal ethics_propagation_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ethics_propagation_journal
    ADD CONSTRAINT ethics_propagation_journal_pkey PRIMARY KEY (id);


--
-- Name: execution_attempt_audit execution_attempt_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_attempt_audit
    ADD CONSTRAINT execution_attempt_audit_pkey PRIMARY KEY (id);


--
-- Name: execution_config execution_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_config
    ADD CONSTRAINT execution_config_pkey PRIMARY KEY (id);


--
-- Name: execution_config execution_config_user_id_mode_action_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_config
    ADD CONSTRAINT execution_config_user_id_mode_action_type_key UNIQUE (user_id, mode, action_type);


--
-- Name: exit_decision_archive exit_decision_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive
    ADD CONSTRAINT exit_decision_archive_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_05 exit_decision_archive_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_05
    ADD CONSTRAINT exit_decision_archive_2026_05_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_06 exit_decision_archive_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_06
    ADD CONSTRAINT exit_decision_archive_2026_06_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_07 exit_decision_archive_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_07
    ADD CONSTRAINT exit_decision_archive_2026_07_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_08 exit_decision_archive_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_08
    ADD CONSTRAINT exit_decision_archive_2026_08_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_09 exit_decision_archive_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_09
    ADD CONSTRAINT exit_decision_archive_2026_09_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_10 exit_decision_archive_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_10
    ADD CONSTRAINT exit_decision_archive_2026_10_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_11 exit_decision_archive_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_11
    ADD CONSTRAINT exit_decision_archive_2026_11_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2026_12 exit_decision_archive_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2026_12
    ADD CONSTRAINT exit_decision_archive_2026_12_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2027_01 exit_decision_archive_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2027_01
    ADD CONSTRAINT exit_decision_archive_2027_01_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2027_02 exit_decision_archive_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2027_02
    ADD CONSTRAINT exit_decision_archive_2027_02_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2027_03 exit_decision_archive_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2027_03
    ADD CONSTRAINT exit_decision_archive_2027_03_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_decision_archive_2027_04 exit_decision_archive_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_decision_archive_2027_04
    ADD CONSTRAINT exit_decision_archive_2027_04_pkey PRIMARY KEY (captured_at, trade_id, id);


--
-- Name: exit_strategy_alternates exit_strategy_alternates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_strategy_alternates
    ADD CONSTRAINT exit_strategy_alternates_pkey PRIMARY KEY (id);


--
-- Name: exit_strategy_alternates exit_strategy_alternates_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exit_strategy_alternates
    ADD CONSTRAINT exit_strategy_alternates_unique UNIQUE (trade_id, variant_id);


--
-- Name: experience_memory_log experience_memory_log_memory_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_memory_log
    ADD CONSTRAINT experience_memory_log_memory_id_unique UNIQUE (memory_id);


--
-- Name: experience_memory_log experience_memory_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_memory_log
    ADD CONSTRAINT experience_memory_log_pkey PRIMARY KEY (id);


--
-- Name: expert_compliance_reports expert_compliance_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_compliance_reports
    ADD CONSTRAINT expert_compliance_reports_pkey PRIMARY KEY (id);


--
-- Name: expert_principles expert_principles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_principles
    ADD CONSTRAINT expert_principles_pkey PRIMARY KEY (id);


--
-- Name: expert_response_logs expert_response_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_response_logs
    ADD CONSTRAINT expert_response_logs_pkey PRIMARY KEY (id);


--
-- Name: expert_sources expert_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_sources
    ADD CONSTRAINT expert_sources_pkey PRIMARY KEY (id);


--
-- Name: expert_updates expert_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_updates
    ADD CONSTRAINT expert_updates_pkey PRIMARY KEY (id);


--
-- Name: feature_snapshots feature_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_snapshots
    ADD CONSTRAINT feature_snapshots_pkey PRIMARY KEY (id);


--
-- Name: federated_ethics_state federated_ethics_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federated_ethics_state
    ADD CONSTRAINT federated_ethics_state_pkey PRIMARY KEY (id);


--
-- Name: filter_calibration_log filter_calibration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_calibration_log
    ADD CONSTRAINT filter_calibration_log_pkey PRIMARY KEY (id);


--
-- Name: filter_diagnostics filter_diagnostics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_diagnostics
    ADD CONSTRAINT filter_diagnostics_pkey PRIMARY KEY (id);


--
-- Name: goal_alignment_profile goal_alignment_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_alignment_profile
    ADD CONSTRAINT goal_alignment_profile_pkey PRIMARY KEY (id);


--
-- Name: goal_alignment_profile goal_alignment_profile_profile_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_alignment_profile
    ADD CONSTRAINT goal_alignment_profile_profile_id_unique UNIQUE (profile_id);


--
-- Name: goal_analysis_history_live goal_analysis_history_live_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_analysis_history_live
    ADD CONSTRAINT goal_analysis_history_live_pkey PRIMARY KEY (id);


--
-- Name: goal_analysis_history_paper goal_analysis_history_paper_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_analysis_history_paper
    ADD CONSTRAINT goal_analysis_history_paper_pkey PRIMARY KEY (id);


--
-- Name: goal_audit_log goal_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_audit_log
    ADD CONSTRAINT goal_audit_log_pkey PRIMARY KEY (id);


--
-- Name: goals_learning_metrics goals_learning_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_learning_metrics
    ADD CONSTRAINT goals_learning_metrics_pkey PRIMARY KEY (id);


--
-- Name: goals_presets goals_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_presets
    ADD CONSTRAINT goals_presets_pkey PRIMARY KEY (id);


--
-- Name: guardrails guardrails_mode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardrails
    ADD CONSTRAINT guardrails_mode_unique UNIQUE (mode);


--
-- Name: guardrails guardrails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardrails
    ADD CONSTRAINT guardrails_pkey PRIMARY KEY (id);


--
-- Name: guardrails_v2 guardrails_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardrails_v2
    ADD CONSTRAINT guardrails_v2_pkey PRIMARY KEY (id);


--
-- Name: historic_signals historic_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historic_signals
    ADD CONSTRAINT historic_signals_pkey PRIMARY KEY (id);


--
-- Name: intent_audit_log intent_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intent_audit_log
    ADD CONSTRAINT intent_audit_log_pkey PRIMARY KEY (id);


--
-- Name: intraday_adjustments intraday_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intraday_adjustments
    ADD CONSTRAINT intraday_adjustments_pkey PRIMARY KEY (id);


--
-- Name: introspection_report introspection_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.introspection_report
    ADD CONSTRAINT introspection_report_pkey PRIMARY KEY (id);


--
-- Name: kill_switch_events kill_switch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kill_switch_events
    ADD CONSTRAINT kill_switch_events_pkey PRIMARY KEY (id);


--
-- Name: kill_switch kill_switch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kill_switch
    ADD CONSTRAINT kill_switch_pkey PRIMARY KEY (id);


--
-- Name: knowledge_cache knowledge_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_cache
    ADD CONSTRAINT knowledge_cache_pkey PRIMARY KEY (id);


--
-- Name: knowledge_cache knowledge_cache_query_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_cache
    ADD CONSTRAINT knowledge_cache_query_hash_key UNIQUE (query_hash);


--
-- Name: knowledge_retrieval_log knowledge_retrieval_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_retrieval_log
    ADD CONSTRAINT knowledge_retrieval_log_pkey PRIMARY KEY (id);


--
-- Name: knowledge_trust_record knowledge_trust_record_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_trust_record
    ADD CONSTRAINT knowledge_trust_record_domain_key UNIQUE (domain);


--
-- Name: knowledge_trust_record knowledge_trust_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_trust_record
    ADD CONSTRAINT knowledge_trust_record_pkey PRIMARY KEY (id);


--
-- Name: latti_baseline_history latti_baseline_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.latti_baseline_history
    ADD CONSTRAINT latti_baseline_history_pkey PRIMARY KEY (id);


--
-- Name: latti_motivation_state latti_motivation_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.latti_motivation_state
    ADD CONSTRAINT latti_motivation_state_pkey PRIMARY KEY (id);


--
-- Name: learning_fragments learning_fragments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_fragments
    ADD CONSTRAINT learning_fragments_pkey PRIMARY KEY (id);


--
-- Name: learning_history learning_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_history
    ADD CONSTRAINT learning_history_pkey PRIMARY KEY (id);


--
-- Name: learning_sources learning_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_sources
    ADD CONSTRAINT learning_sources_pkey PRIMARY KEY (id);


--
-- Name: learning_weight_profile learning_weight_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_weight_profile
    ADD CONSTRAINT learning_weight_profile_pkey PRIMARY KEY (id);


--
-- Name: learning_weight_profile learning_weight_profile_profile_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_weight_profile
    ADD CONSTRAINT learning_weight_profile_profile_id_unique UNIQUE (profile_id);


--
-- Name: lottie_oversight_log lottie_oversight_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lottie_oversight_log
    ADD CONSTRAINT lottie_oversight_log_pkey PRIMARY KEY (id);


--
-- Name: macro_feed_archive macro_feed_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive
    ADD CONSTRAINT macro_feed_archive_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_05 macro_feed_archive_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_05
    ADD CONSTRAINT macro_feed_archive_2026_05_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_06 macro_feed_archive_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_06
    ADD CONSTRAINT macro_feed_archive_2026_06_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_07 macro_feed_archive_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_07
    ADD CONSTRAINT macro_feed_archive_2026_07_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_08 macro_feed_archive_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_08
    ADD CONSTRAINT macro_feed_archive_2026_08_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_09 macro_feed_archive_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_09
    ADD CONSTRAINT macro_feed_archive_2026_09_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_10 macro_feed_archive_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_10
    ADD CONSTRAINT macro_feed_archive_2026_10_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_11 macro_feed_archive_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_11
    ADD CONSTRAINT macro_feed_archive_2026_11_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2026_12 macro_feed_archive_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2026_12
    ADD CONSTRAINT macro_feed_archive_2026_12_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2027_01 macro_feed_archive_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2027_01
    ADD CONSTRAINT macro_feed_archive_2027_01_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2027_02 macro_feed_archive_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2027_02
    ADD CONSTRAINT macro_feed_archive_2027_02_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2027_03 macro_feed_archive_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2027_03
    ADD CONSTRAINT macro_feed_archive_2027_03_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: macro_feed_archive_2027_04 macro_feed_archive_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.macro_feed_archive_2027_04
    ADD CONSTRAINT macro_feed_archive_2027_04_pkey PRIMARY KEY (captured_at, source, id);


--
-- Name: memory_audit_log memory_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_audit_log
    ADD CONSTRAINT memory_audit_log_pkey PRIMARY KEY (id);


--
-- Name: meta_cognition_log meta_cognition_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_cognition_log
    ADD CONSTRAINT meta_cognition_log_pkey PRIMARY KEY (id);


--
-- Name: meta_reasoning_log meta_reasoning_log_analysis_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_reasoning_log
    ADD CONSTRAINT meta_reasoning_log_analysis_id_unique UNIQUE (analysis_id);


--
-- Name: meta_reasoning_log meta_reasoning_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_reasoning_log
    ADD CONSTRAINT meta_reasoning_log_pkey PRIMARY KEY (id);


--
-- Name: model_calibration_log model_calibration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_calibration_log
    ADD CONSTRAINT model_calibration_log_pkey PRIMARY KEY (id);


--
-- Name: model_consistency_snapshot model_consistency_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_consistency_snapshot
    ADD CONSTRAINT model_consistency_snapshot_pkey PRIMARY KEY (id);


--
-- Name: module_constants module_constants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_constants
    ADD CONSTRAINT module_constants_pkey PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name);


--
-- Name: pair_scan_archive pair_scan_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive
    ADD CONSTRAINT pair_scan_archive_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_05 pair_scan_archive_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_05
    ADD CONSTRAINT pair_scan_archive_2026_05_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_06 pair_scan_archive_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_06
    ADD CONSTRAINT pair_scan_archive_2026_06_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_07 pair_scan_archive_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_07
    ADD CONSTRAINT pair_scan_archive_2026_07_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_08 pair_scan_archive_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_08
    ADD CONSTRAINT pair_scan_archive_2026_08_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_09 pair_scan_archive_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_09
    ADD CONSTRAINT pair_scan_archive_2026_09_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_10 pair_scan_archive_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_10
    ADD CONSTRAINT pair_scan_archive_2026_10_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_11 pair_scan_archive_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_11
    ADD CONSTRAINT pair_scan_archive_2026_11_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2026_12 pair_scan_archive_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2026_12
    ADD CONSTRAINT pair_scan_archive_2026_12_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2027_01 pair_scan_archive_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2027_01
    ADD CONSTRAINT pair_scan_archive_2027_01_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2027_02 pair_scan_archive_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2027_02
    ADD CONSTRAINT pair_scan_archive_2027_02_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2027_03 pair_scan_archive_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2027_03
    ADD CONSTRAINT pair_scan_archive_2027_03_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: pair_scan_archive_2027_04 pair_scan_archive_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pair_scan_archive_2027_04
    ADD CONSTRAINT pair_scan_archive_2027_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: paper_ai_reports paper_ai_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_ai_reports
    ADD CONSTRAINT paper_ai_reports_pkey PRIMARY KEY (id);


--
-- Name: paper_daily_briefs paper_daily_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_daily_briefs
    ADD CONSTRAINT paper_daily_briefs_pkey PRIMARY KEY (id);


--
-- Name: paper_signal_trace paper_signal_trace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_signal_trace
    ADD CONSTRAINT paper_signal_trace_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_ghost_trades paper_sim_ghost_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_ghost_trades
    ADD CONSTRAINT paper_sim_ghost_trades_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_open_positions paper_sim_open_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_open_positions
    ADD CONSTRAINT paper_sim_open_positions_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_sessions_backup_20251023 paper_sim_sessions_backup_20251023_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_sessions_backup_20251023
    ADD CONSTRAINT paper_sim_sessions_backup_20251023_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_sessions_backup_20251023 paper_sim_sessions_backup_20251023_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_sessions_backup_20251023
    ADD CONSTRAINT paper_sim_sessions_backup_20251023_session_id_key UNIQUE (session_id);


--
-- Name: paper_sim_sessions paper_sim_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_sessions
    ADD CONSTRAINT paper_sim_sessions_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_sessions paper_sim_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_sessions
    ADD CONSTRAINT paper_sim_sessions_session_id_key UNIQUE (session_id);


--
-- Name: paper_sim_trade_logs paper_sim_trade_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_trade_logs
    ADD CONSTRAINT paper_sim_trade_logs_pkey PRIMARY KEY (id);


--
-- Name: paper_sim_trades paper_sim_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_trades
    ADD CONSTRAINT paper_sim_trades_pkey PRIMARY KEY (id);


--
-- Name: paper_trades paper_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trades
    ADD CONSTRAINT paper_trades_pkey PRIMARY KEY (id);


--
-- Name: parameter_baseline parameter_baseline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parameter_baseline
    ADD CONSTRAINT parameter_baseline_pkey PRIMARY KEY (id);


--
-- Name: patch_proposals patch_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patch_proposals
    ADD CONSTRAINT patch_proposals_pkey PRIMARY KEY (id);


--
-- Name: patch_proposals patch_proposals_proposal_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patch_proposals
    ADD CONSTRAINT patch_proposals_proposal_id_unique UNIQUE (proposal_id);


--
-- Name: portfolio_adjustments portfolio_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_adjustments
    ADD CONSTRAINT portfolio_adjustments_pkey PRIMARY KEY (id);


--
-- Name: portfolio_state_backup_20251023 portfolio_state_backup_20251023_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_state_backup_20251023
    ADD CONSTRAINT portfolio_state_backup_20251023_pkey PRIMARY KEY (id);


--
-- Name: portfolio_state portfolio_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_state
    ADD CONSTRAINT portfolio_state_pkey PRIMARY KEY (id);


--
-- Name: prediction_outcomes prediction_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prediction_outcomes
    ADD CONSTRAINT prediction_outcomes_pkey PRIMARY KEY (id);


--
-- Name: price_data price_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_data
    ADD CONSTRAINT price_data_pkey PRIMARY KEY (id);


--
-- Name: proposed_adjustments proposed_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposed_adjustments
    ADD CONSTRAINT proposed_adjustments_pkey PRIMARY KEY (id);


--
-- Name: reasoning_queue reasoning_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reasoning_queue
    ADD CONSTRAINT reasoning_queue_pkey PRIMARY KEY (id);


--
-- Name: reasoning_trace reasoning_trace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reasoning_trace
    ADD CONSTRAINT reasoning_trace_pkey PRIMARY KEY (id);


--
-- Name: reasoning_trace reasoning_trace_trace_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reasoning_trace
    ADD CONSTRAINT reasoning_trace_trace_id_unique UNIQUE (trace_id);


--
-- Name: reflection_log reflection_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reflection_log
    ADD CONSTRAINT reflection_log_pkey PRIMARY KEY (id);


--
-- Name: regime_factor_alternates regime_factor_alternates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regime_factor_alternates
    ADD CONSTRAINT regime_factor_alternates_pkey PRIMARY KEY (id);


--
-- Name: response_cache response_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_cache
    ADD CONSTRAINT response_cache_pkey PRIMARY KEY (id);


--
-- Name: rtb_signals rtb_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rtb_signals
    ADD CONSTRAINT rtb_signals_pkey PRIMARY KEY (id);


--
-- Name: safety_event_log safety_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_event_log
    ADD CONSTRAINT safety_event_log_pkey PRIMARY KEY (id);


--
-- Name: safety_policy safety_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_policy
    ADD CONSTRAINT safety_policy_pkey PRIMARY KEY (id);


--
-- Name: safety_policy safety_policy_policy_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_policy
    ADD CONSTRAINT safety_policy_policy_name_key UNIQUE (policy_name);


--
-- Name: safety_telemetry safety_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_telemetry
    ADD CONSTRAINT safety_telemetry_pkey PRIMARY KEY (id);


--
-- Name: scheduled_tasks_audit scheduled_tasks_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_tasks_audit
    ADD CONSTRAINT scheduled_tasks_audit_pkey PRIMARY KEY (id);


--
-- Name: screener_filters screener_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screener_filters
    ADD CONSTRAINT screener_filters_pkey PRIMARY KEY (id);


--
-- Name: screener_results screener_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screener_results
    ADD CONSTRAINT screener_results_pkey PRIMARY KEY (id);


--
-- Name: semantic_memory semantic_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semantic_memory
    ADD CONSTRAINT semantic_memory_pkey PRIMARY KEY (id);


--
-- Name: signal_eval_archive signal_eval_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive
    ADD CONSTRAINT signal_eval_archive_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_05 signal_eval_archive_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_05
    ADD CONSTRAINT signal_eval_archive_2026_05_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_06 signal_eval_archive_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_06
    ADD CONSTRAINT signal_eval_archive_2026_06_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_07 signal_eval_archive_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_07
    ADD CONSTRAINT signal_eval_archive_2026_07_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_08 signal_eval_archive_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_08
    ADD CONSTRAINT signal_eval_archive_2026_08_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_09 signal_eval_archive_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_09
    ADD CONSTRAINT signal_eval_archive_2026_09_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_10 signal_eval_archive_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_10
    ADD CONSTRAINT signal_eval_archive_2026_10_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_11 signal_eval_archive_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_11
    ADD CONSTRAINT signal_eval_archive_2026_11_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2026_12 signal_eval_archive_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2026_12
    ADD CONSTRAINT signal_eval_archive_2026_12_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2027_01 signal_eval_archive_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2027_01
    ADD CONSTRAINT signal_eval_archive_2027_01_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2027_02 signal_eval_archive_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2027_02
    ADD CONSTRAINT signal_eval_archive_2027_02_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2027_03 signal_eval_archive_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2027_03
    ADD CONSTRAINT signal_eval_archive_2027_03_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_eval_archive_2027_04 signal_eval_archive_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_eval_archive_2027_04
    ADD CONSTRAINT signal_eval_archive_2027_04_pkey PRIMARY KEY (captured_at, symbol, strategy, id);


--
-- Name: signal_weights signal_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_weights
    ADD CONSTRAINT signal_weights_pkey PRIMARY KEY (id);


--
-- Name: strategic_memory_archive strategic_memory_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_memory_archive
    ADD CONSTRAINT strategic_memory_archive_pkey PRIMARY KEY (id);


--
-- Name: strategic_memory_snapshot strategic_memory_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_memory_snapshot
    ADD CONSTRAINT strategic_memory_snapshot_pkey PRIMARY KEY (id);


--
-- Name: strategic_memory_snapshot strategic_memory_snapshot_snapshot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_memory_snapshot
    ADD CONSTRAINT strategic_memory_snapshot_snapshot_id_key UNIQUE (snapshot_id);


--
-- Name: strategic_plan_log strategic_plan_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_plan_log
    ADD CONSTRAINT strategic_plan_log_pkey PRIMARY KEY (id);


--
-- Name: strategic_plan_log strategic_plan_log_plan_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_plan_log
    ADD CONSTRAINT strategic_plan_log_plan_id_unique UNIQUE (plan_id);


--
-- Name: strategic_simulation_log strategic_simulation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_simulation_log
    ADD CONSTRAINT strategic_simulation_log_pkey PRIMARY KEY (id);


--
-- Name: strategic_simulation_log strategic_simulation_log_simulation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategic_simulation_log
    ADD CONSTRAINT strategic_simulation_log_simulation_id_key UNIQUE (simulation_id);


--
-- Name: strategies strategies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategies
    ADD CONSTRAINT strategies_name_key UNIQUE (name);


--
-- Name: strategies strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategies
    ADD CONSTRAINT strategies_pkey PRIMARY KEY (id);


--
-- Name: strategy_drive_guardrail_policy strategy_drive_guardrail_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_drive_guardrail_policy
    ADD CONSTRAINT strategy_drive_guardrail_policy_pkey PRIMARY KEY (id);


--
-- Name: strategy_drive_metrics strategy_drive_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_drive_metrics
    ADD CONSTRAINT strategy_drive_metrics_pkey PRIMARY KEY (id);


--
-- Name: strategy_drive_summary strategy_drive_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_drive_summary
    ADD CONSTRAINT strategy_drive_summary_pkey PRIMARY KEY (id);


--
-- Name: strategy_mix_log strategy_mix_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_mix_log
    ADD CONSTRAINT strategy_mix_log_pkey PRIMARY KEY (id);


--
-- Name: strategy_param_schema strategy_param_schema_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_param_schema
    ADD CONSTRAINT strategy_param_schema_pkey PRIMARY KEY (id);


--
-- Name: strategy_parameters strategy_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_parameters
    ADD CONSTRAINT strategy_parameters_pkey PRIMARY KEY (id);


--
-- Name: strategy_settings_audit strategy_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_settings_audit
    ADD CONSTRAINT strategy_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: strategy_settings strategy_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_settings
    ADD CONSTRAINT strategy_settings_pkey PRIMARY KEY (id);


--
-- Name: system_alerts system_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: system_context_backup_20251023 system_context_backup_20251023_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_context_backup_20251023
    ADD CONSTRAINT system_context_backup_20251023_pkey PRIMARY KEY (id);


--
-- Name: system_context_backup_20251023 system_context_backup_20251023_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_context_backup_20251023
    ADD CONSTRAINT system_context_backup_20251023_user_id_key UNIQUE (user_id);


--
-- Name: system_context system_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_context
    ADD CONSTRAINT system_context_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: telemetry_history telemetry_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_history
    ADD CONSTRAINT telemetry_history_pkey PRIMARY KEY (id);


--
-- Name: telemetry_lineage telemetry_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_lineage
    ADD CONSTRAINT telemetry_lineage_pkey PRIMARY KEY (id);


--
-- Name: telemetry_state telemetry_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetry_state
    ADD CONSTRAINT telemetry_state_pkey PRIMARY KEY (id);


--
-- Name: trade_logs trade_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_logs
    ADD CONSTRAINT trade_logs_pkey PRIMARY KEY (id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: trading_audit_log trading_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_audit_log
    ADD CONSTRAINT trading_audit_log_pkey PRIMARY KEY (id);


--
-- Name: trading_settings_legacy trading_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_settings_legacy
    ADD CONSTRAINT trading_settings_pkey PRIMARY KEY (id);


--
-- Name: trading_signals trading_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trading_signals
    ADD CONSTRAINT trading_signals_pkey PRIMARY KEY (id);


--
-- Name: tuning_event tuning_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuning_event
    ADD CONSTRAINT tuning_event_pkey PRIMARY KEY (id);


--
-- Name: tuning_policy tuning_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuning_policy
    ADD CONSTRAINT tuning_policy_pkey PRIMARY KEY (id);


--
-- Name: tuning_policy tuning_policy_user_id_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuning_policy
    ADD CONSTRAINT tuning_policy_user_id_mode_key UNIQUE (user_id, mode);


--
-- Name: tuning_policy tuning_policy_user_mode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuning_policy
    ADD CONSTRAINT tuning_policy_user_mode_unique UNIQUE (user_id, mode);


--
-- Name: system_alerts unique_global_alert; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT unique_global_alert UNIQUE (mode, alert_type, message);


--
-- Name: paper_sim_open_positions unique_symbol_side; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_sim_open_positions
    ADD CONSTRAINT unique_symbol_side UNIQUE (symbol, side);


--
-- Name: user_goals_audit user_goals_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_goals_audit
    ADD CONSTRAINT user_goals_audit_pkey PRIMARY KEY (id);


--
-- Name: goals_live user_goals_live_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_live
    ADD CONSTRAINT user_goals_live_pkey PRIMARY KEY (id);


--
-- Name: goals_paper user_goals_paper_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals_paper
    ADD CONSTRAINT user_goals_paper_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: value_alignment_matrix value_alignment_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.value_alignment_matrix
    ADD CONSTRAINT value_alignment_matrix_pkey PRIMARY KEY (id);


--
-- Name: vts_open_trades vts_open_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vts_open_trades
    ADD CONSTRAINT vts_open_trades_pkey PRIMARY KEY (id);


--
-- Name: walter_actions walter_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_actions
    ADD CONSTRAINT walter_actions_pkey PRIMARY KEY (id);


--
-- Name: walter_approvals_audit walter_approvals_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_approvals_audit
    ADD CONSTRAINT walter_approvals_audit_pkey PRIMARY KEY (id);


--
-- Name: walter_chat_logs walter_chat_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_chat_logs
    ADD CONSTRAINT walter_chat_logs_pkey PRIMARY KEY (id);


--
-- Name: walter_chats walter_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_chats
    ADD CONSTRAINT walter_chats_pkey PRIMARY KEY (id);


--
-- Name: walter_execution_log walter_execution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_execution_log
    ADD CONSTRAINT walter_execution_log_pkey PRIMARY KEY (id);


--
-- Name: walter_memory walter_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_memory
    ADD CONSTRAINT walter_memory_pkey PRIMARY KEY (id);


--
-- Name: walter_pending_approvals walter_pending_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_pending_approvals
    ADD CONSTRAINT walter_pending_approvals_pkey PRIMARY KEY (id);


--
-- Name: walter_pending_approvals walter_pending_approvals_trace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_pending_approvals
    ADD CONSTRAINT walter_pending_approvals_trace_id_key UNIQUE (trace_id);


--
-- Name: walter_purpose walter_purpose_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_purpose
    ADD CONSTRAINT walter_purpose_pkey PRIMARY KEY (id);


--
-- Name: walter_user_preferences walter_user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_user_preferences
    ADD CONSTRAINT walter_user_preferences_pkey PRIMARY KEY (id);


--
-- Name: walter_user_preferences walter_user_preferences_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_user_preferences
    ADD CONSTRAINT walter_user_preferences_user_id_unique UNIQUE (user_id);


--
-- Name: watchlist_pairs_backup_20251023 watchlist_pairs_backup_20251023_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_pairs_backup_20251023
    ADD CONSTRAINT watchlist_pairs_backup_20251023_pkey PRIMARY KEY (id);


--
-- Name: watchlist_pairs watchlist_pairs_mode_symbol_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_pairs
    ADD CONSTRAINT watchlist_pairs_mode_symbol_unique UNIQUE (mode, symbol);


--
-- Name: watchlist_pairs watchlist_pairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_pairs
    ADD CONSTRAINT watchlist_pairs_pkey PRIMARY KEY (id);


--
-- Name: xstock_dbs_backfill xstock_dbs_backfill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_dbs_backfill
    ADD CONSTRAINT xstock_dbs_backfill_pkey PRIMARY KEY (symbol, ts);


--
-- Name: xstock_perp_ohlc_1m xstock_perp_ohlc_1m_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m
    ADD CONSTRAINT xstock_perp_ohlc_1m_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_04 xstock_perp_ohlc_1m_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_04
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m xstock_perp_ohlc_1m_symbol_interval_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m
    ADD CONSTRAINT xstock_perp_ohlc_1m_symbol_interval_unique UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_04 xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_04
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_05 xstock_perp_ohlc_1m_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_05
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_05_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_05 xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_05
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_06 xstock_perp_ohlc_1m_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_06
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_06_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_06 xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_06
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_07 xstock_perp_ohlc_1m_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_07
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_07_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_07 xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_07
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_08 xstock_perp_ohlc_1m_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_08
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_08_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_08 xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_08
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_09 xstock_perp_ohlc_1m_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_09
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_09_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_09 xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_09
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_10 xstock_perp_ohlc_1m_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_10
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_10_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_10 xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_10
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_11 xstock_perp_ohlc_1m_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_11
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_11_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_11 xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_11
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2026_12 xstock_perp_ohlc_1m_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_12
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_12_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2026_12 xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2026_12
    ADD CONSTRAINT xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2027_01 xstock_perp_ohlc_1m_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_01
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_01_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2027_01 xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_01
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2027_02 xstock_perp_ohlc_1m_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_02
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_02_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2027_02 xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_02
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2027_03 xstock_perp_ohlc_1m_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_03
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_03_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2027_03 xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_03
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ohlc_1m_2027_04 xstock_perp_ohlc_1m_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_04
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_perp_ohlc_1m_2027_04 xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ohlc_1m_2027_04
    ADD CONSTRAINT xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_perp_ticker_snap xstock_perp_ticker_snap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap
    ADD CONSTRAINT xstock_perp_ticker_snap_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_04 xstock_perp_ticker_snap_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_04
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_05 xstock_perp_ticker_snap_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_05
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_05_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_06 xstock_perp_ticker_snap_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_06
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_06_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_07 xstock_perp_ticker_snap_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_07
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_07_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_08 xstock_perp_ticker_snap_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_08
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_08_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_09 xstock_perp_ticker_snap_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_09
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_09_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_10 xstock_perp_ticker_snap_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_10
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_10_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_11 xstock_perp_ticker_snap_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_11
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_11_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2026_12 xstock_perp_ticker_snap_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2026_12
    ADD CONSTRAINT xstock_perp_ticker_snap_2026_12_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2027_01 xstock_perp_ticker_snap_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2027_01
    ADD CONSTRAINT xstock_perp_ticker_snap_2027_01_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2027_02 xstock_perp_ticker_snap_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2027_02
    ADD CONSTRAINT xstock_perp_ticker_snap_2027_02_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2027_03 xstock_perp_ticker_snap_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2027_03
    ADD CONSTRAINT xstock_perp_ticker_snap_2027_03_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_perp_ticker_snap_2027_04 xstock_perp_ticker_snap_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_perp_ticker_snap_2027_04
    ADD CONSTRAINT xstock_perp_ticker_snap_2027_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ohlc_1m xstock_spot_ohlc_1m_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m
    ADD CONSTRAINT xstock_spot_ohlc_1m_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_04 xstock_spot_ohlc_1m_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_04
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m xstock_spot_ohlc_1m_symbol_interval_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m
    ADD CONSTRAINT xstock_spot_ohlc_1m_symbol_interval_unique UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_04 xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_04
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_05 xstock_spot_ohlc_1m_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_05
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_05_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_05 xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_05
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_06 xstock_spot_ohlc_1m_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_06
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_06_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_06 xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_06
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_07 xstock_spot_ohlc_1m_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_07
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_07_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_07 xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_07
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_08 xstock_spot_ohlc_1m_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_08
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_08_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_08 xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_08
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_09 xstock_spot_ohlc_1m_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_09
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_09_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_09 xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_09
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_10 xstock_spot_ohlc_1m_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_10
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_10_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_10 xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_10
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_11 xstock_spot_ohlc_1m_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_11
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_11_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_11 xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_11
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2026_12 xstock_spot_ohlc_1m_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_12
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_12_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2026_12 xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2026_12
    ADD CONSTRAINT xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2027_01 xstock_spot_ohlc_1m_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_01
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_01_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2027_01 xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_01
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2027_02 xstock_spot_ohlc_1m_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_02
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_02_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2027_02 xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_02
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2027_03 xstock_spot_ohlc_1m_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_03
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_03_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2027_03 xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_03
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_1m_2027_04 xstock_spot_ohlc_1m_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_04
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_04_pkey PRIMARY KEY (interval_begin, symbol, id);


--
-- Name: xstock_spot_ohlc_1m_2027_04 xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_1m_2027_04
    ADD CONSTRAINT xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_key UNIQUE (symbol, interval_begin);


--
-- Name: xstock_spot_ohlc_60m_snapshot xstock_spot_ohlc_60m_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ohlc_60m_snapshot
    ADD CONSTRAINT xstock_spot_ohlc_60m_snapshot_pkey PRIMARY KEY (symbol, bucket_ts);


--
-- Name: xstock_spot_ticker_snap xstock_spot_ticker_snap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap
    ADD CONSTRAINT xstock_spot_ticker_snap_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_04 xstock_spot_ticker_snap_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_04
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_05 xstock_spot_ticker_snap_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_05
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_05_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_06 xstock_spot_ticker_snap_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_06
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_06_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_07 xstock_spot_ticker_snap_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_07
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_07_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_08 xstock_spot_ticker_snap_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_08
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_08_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_09 xstock_spot_ticker_snap_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_09
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_09_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_10 xstock_spot_ticker_snap_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_10
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_10_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_11 xstock_spot_ticker_snap_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_11
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_11_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2026_12 xstock_spot_ticker_snap_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2026_12
    ADD CONSTRAINT xstock_spot_ticker_snap_2026_12_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2027_01 xstock_spot_ticker_snap_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2027_01
    ADD CONSTRAINT xstock_spot_ticker_snap_2027_01_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2027_02 xstock_spot_ticker_snap_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2027_02
    ADD CONSTRAINT xstock_spot_ticker_snap_2027_02_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2027_03 xstock_spot_ticker_snap_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2027_03
    ADD CONSTRAINT xstock_spot_ticker_snap_2027_03_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_ticker_snap_2027_04 xstock_spot_ticker_snap_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_ticker_snap_2027_04
    ADD CONSTRAINT xstock_spot_ticker_snap_2027_04_pkey PRIMARY KEY (captured_at, symbol, id);


--
-- Name: xstock_spot_universe_overrides xstock_spot_universe_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_universe_overrides
    ADD CONSTRAINT xstock_spot_universe_overrides_pkey PRIMARY KEY (symbol);


--
-- Name: xstock_spot_universe xstock_spot_universe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xstock_spot_universe
    ADD CONSTRAINT xstock_spot_universe_pkey PRIMARY KEY (symbol);


--
-- Name: actuation_policies_user_variable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX actuation_policies_user_variable_idx ON public.actuation_policies USING btree (user_id, variable_name);


--
-- Name: adaptive_learning_regime_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adaptive_learning_regime_idx ON public.adaptive_learning USING btree (regime);


--
-- Name: adaptive_learning_strategy_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adaptive_learning_strategy_mode_idx ON public.adaptive_learning USING btree (strategy_id, mode);


--
-- Name: adaptive_learning_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adaptive_learning_updated_at_idx ON public.adaptive_learning USING btree (updated_at);


--
-- Name: agent_learning_delta_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_delta_created_at_idx ON public.agent_learning_delta USING btree (created_at);


--
-- Name: agent_learning_delta_delta_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_delta_delta_type_idx ON public.agent_learning_delta USING btree (delta_type);


--
-- Name: agent_learning_delta_is_accepted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_delta_is_accepted_idx ON public.agent_learning_delta USING btree (is_accepted);


--
-- Name: agent_learning_delta_origin_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_delta_origin_node_id_idx ON public.agent_learning_delta USING btree (origin_node_id);


--
-- Name: agent_learning_delta_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_delta_trace_id_idx ON public.agent_learning_delta USING btree (trace_id);


--
-- Name: agent_learning_feedback_agent_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_feedback_agent_name_idx ON public.agent_learning_feedback USING btree (agent_name);


--
-- Name: agent_learning_feedback_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_feedback_created_at_idx ON public.agent_learning_feedback USING btree (created_at);


--
-- Name: agent_learning_feedback_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_feedback_domain_idx ON public.agent_learning_feedback USING btree (domain);


--
-- Name: agent_learning_feedback_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_learning_feedback_session_id_idx ON public.agent_learning_feedback USING btree (session_id);


--
-- Name: agent_registry_agent_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_registry_agent_name_idx ON public.agent_registry USING btree (agent_name);


--
-- Name: agent_registry_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_registry_created_at_idx ON public.agent_registry USING btree (created_at);


--
-- Name: agent_registry_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_registry_domain_idx ON public.agent_registry USING btree (domain);


--
-- Name: agent_registry_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_registry_state_idx ON public.agent_registry USING btree (state);


--
-- Name: ai_lessons_user_mode_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_lessons_user_mode_timestamp_idx ON public.ai_lessons USING btree (user_id, mode, "timestamp");


--
-- Name: ai_market_analyses_date_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_market_analyses_date_mode_idx ON public.ai_market_analyses USING btree (date, mode);


--
-- Name: ai_transparency_log_task_executed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_transparency_log_task_executed_idx ON public.ai_transparency_log USING btree (task_name, executed_at);


--
-- Name: alignment_audit_log_audit_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_audit_log_audit_id_idx ON public.alignment_audit_log USING btree (audit_id);


--
-- Name: alignment_audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_audit_log_timestamp_idx ON public.alignment_audit_log USING btree ("timestamp");


--
-- Name: alignment_audit_log_verification_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_audit_log_verification_result_idx ON public.alignment_audit_log USING btree (verification_result);


--
-- Name: alignment_policies_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_policies_is_active_idx ON public.alignment_policies USING btree (is_active);


--
-- Name: alignment_policies_policy_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_policies_policy_id_idx ON public.alignment_policies USING btree (policy_id);


--
-- Name: alignment_policies_policy_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alignment_policies_policy_type_idx ON public.alignment_policies USING btree (policy_type);


--
-- Name: asset_capabilities_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX asset_capabilities_symbol_idx ON public.asset_capabilities USING btree (symbol);


--
-- Name: audit_log_changed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_changed_by_idx ON public.audit_log USING btree (changed_by);


--
-- Name: audit_log_entity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_type_idx ON public.audit_log USING btree (entity_type);


--
-- Name: audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_timestamp_idx ON public.audit_log USING btree ("timestamp");


--
-- Name: audit_log_trading_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_trading_mode_idx ON public.audit_log USING btree (trading_mode);


--
-- Name: autonomy_audit_log_action_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autonomy_audit_log_action_type_idx ON public.autonomy_audit_log USING btree (action_type);


--
-- Name: autonomy_audit_log_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autonomy_audit_log_run_id_idx ON public.autonomy_audit_log USING btree (run_id);


--
-- Name: autonomy_audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autonomy_audit_log_timestamp_idx ON public.autonomy_audit_log USING btree ("timestamp");


--
-- Name: autonomy_audit_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autonomy_audit_log_trace_id_idx ON public.autonomy_audit_log USING btree (trace_id);


--
-- Name: awareness_state_log_emotional_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX awareness_state_log_emotional_state_idx ON public.awareness_state_log USING btree (emotional_state);


--
-- Name: awareness_state_log_state_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX awareness_state_log_state_id_idx ON public.awareness_state_log USING btree (state_id);


--
-- Name: awareness_state_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX awareness_state_log_timestamp_idx ON public.awareness_state_log USING btree ("timestamp");


--
-- Name: awareness_state_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX awareness_state_log_user_id_idx ON public.awareness_state_log USING btree (user_id);


--
-- Name: b62_retroactive_labels_diff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX b62_retroactive_labels_diff ON public.b62_retroactive_labels USING btree (label_diff_flag, retroactive_label);


--
-- Name: b62_retroactive_labels_opened; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX b62_retroactive_labels_opened ON public.b62_retroactive_labels USING btree (trade_opened_at DESC);


--
-- Name: behavioral_log_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX behavioral_log_mode_idx ON public.behavioral_log USING btree (trading_mode);


--
-- Name: behavioral_log_parameter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX behavioral_log_parameter_idx ON public.behavioral_log USING btree (parameter);


--
-- Name: behavioral_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX behavioral_log_timestamp_idx ON public.behavioral_log USING btree ("timestamp");


--
-- Name: behavioral_log_trigger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX behavioral_log_trigger_idx ON public.behavioral_log USING btree (trigger_type);


--
-- Name: behavioral_state_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX behavioral_state_mode_idx ON public.behavioral_state USING btree (mode);


--
-- Name: bias_correction_log_bias_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_correction_log_bias_type_idx ON public.bias_correction_log USING btree (bias_type);


--
-- Name: bias_correction_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_correction_log_created_at_idx ON public.bias_correction_log USING btree (created_at);


--
-- Name: bias_correction_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_correction_log_user_id_idx ON public.bias_correction_log USING btree (user_id);


--
-- Name: bias_observation_log_bias_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_observation_log_bias_type_idx ON public.bias_observation_log USING btree (bias_type);


--
-- Name: bias_observation_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_observation_log_created_at_idx ON public.bias_observation_log USING btree (created_at);


--
-- Name: bias_observation_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bias_observation_log_user_id_idx ON public.bias_observation_log USING btree (user_id);


--
-- Name: bob_trace_log_bob_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bob_trace_log_bob_module_idx ON public.bob_trace_log USING btree (bob_module);


--
-- Name: bob_trace_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bob_trace_log_timestamp_idx ON public.bob_trace_log USING btree ("timestamp");


--
-- Name: bob_trace_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bob_trace_log_trace_id_idx ON public.bob_trace_log USING btree (trace_id);


--
-- Name: cluster_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_audit_log_created_at_idx ON public.cluster_audit_log USING btree (created_at);


--
-- Name: cluster_audit_log_gate_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_audit_log_gate_type_idx ON public.cluster_audit_log USING btree (gate_type);


--
-- Name: cluster_audit_log_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_audit_log_node_id_idx ON public.cluster_audit_log USING btree (node_id);


--
-- Name: cluster_audit_log_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_audit_log_task_id_idx ON public.cluster_audit_log USING btree (task_id);


--
-- Name: cluster_audit_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_audit_log_user_id_idx ON public.cluster_audit_log USING btree (user_id);


--
-- Name: cluster_bus_event_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_bus_event_created_at_idx ON public.cluster_bus_event USING btree (created_at);


--
-- Name: cluster_bus_event_source_node_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_bus_event_source_node_idx ON public.cluster_bus_event USING btree (source_node);


--
-- Name: cluster_bus_event_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_bus_event_topic_idx ON public.cluster_bus_event USING btree (topic);


--
-- Name: cluster_circuit_breaker_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_circuit_breaker_node_id_idx ON public.cluster_circuit_breaker USING btree (node_id);


--
-- Name: cluster_circuit_breaker_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_circuit_breaker_state_idx ON public.cluster_circuit_breaker USING btree (state);


--
-- Name: cluster_node_last_heartbeat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_node_last_heartbeat_idx ON public.cluster_node USING btree (last_heartbeat);


--
-- Name: cluster_node_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_node_role_idx ON public.cluster_node USING btree (role);


--
-- Name: cluster_node_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_node_status_idx ON public.cluster_node USING btree (status);


--
-- Name: cluster_result_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_result_log_created_at_idx ON public.cluster_result_log USING btree (created_at);


--
-- Name: cluster_result_log_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_result_log_node_id_idx ON public.cluster_result_log USING btree (node_id);


--
-- Name: cluster_result_log_outcome_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_result_log_outcome_status_idx ON public.cluster_result_log USING btree (outcome_status);


--
-- Name: cluster_result_log_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_result_log_task_id_idx ON public.cluster_result_log USING btree (task_id);


--
-- Name: cluster_result_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_result_log_user_id_idx ON public.cluster_result_log USING btree (user_id);


--
-- Name: cluster_task_queue_assigned_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_assigned_node_id_idx ON public.cluster_task_queue USING btree (assigned_node_id);


--
-- Name: cluster_task_queue_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_created_at_idx ON public.cluster_task_queue USING btree (created_at);


--
-- Name: cluster_task_queue_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_priority_idx ON public.cluster_task_queue USING btree (priority);


--
-- Name: cluster_task_queue_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_status_idx ON public.cluster_task_queue USING btree (status);


--
-- Name: cluster_task_queue_task_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_task_type_idx ON public.cluster_task_queue USING btree (task_type);


--
-- Name: cluster_task_queue_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cluster_task_queue_user_id_idx ON public.cluster_task_queue USING btree (user_id);


--
-- Name: cognitive_core_state_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_core_state_created_at_idx ON public.cognitive_core_state USING btree (created_at);


--
-- Name: cognitive_core_state_cycle_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_core_state_cycle_id_idx ON public.cognitive_core_state USING btree (cycle_id);


--
-- Name: cognitive_tuning_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_tuning_log_created_at_idx ON public.cognitive_tuning_log USING btree (created_at);


--
-- Name: cognitive_tuning_log_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_tuning_log_result_idx ON public.cognitive_tuning_log USING btree (result);


--
-- Name: cognitive_tuning_log_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_tuning_log_run_id_idx ON public.cognitive_tuning_log USING btree (run_id);


--
-- Name: cognitive_tuning_log_scenario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cognitive_tuning_log_scenario_idx ON public.cognitive_tuning_log USING btree (scenario);


--
-- Name: collaboration_messages_agent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_messages_agent_id_idx ON public.collaboration_messages USING btree (agent_id);


--
-- Name: collaboration_messages_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_messages_message_id_idx ON public.collaboration_messages USING btree (message_id);


--
-- Name: collaboration_messages_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_messages_session_id_idx ON public.collaboration_messages USING btree (session_id);


--
-- Name: collaboration_messages_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_messages_timestamp_idx ON public.collaboration_messages USING btree ("timestamp");


--
-- Name: collaboration_sessions_consensus_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_sessions_consensus_state_idx ON public.collaboration_sessions USING btree (consensus_state);


--
-- Name: collaboration_sessions_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_sessions_session_id_idx ON public.collaboration_sessions USING btree (session_id);


--
-- Name: collaboration_sessions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_sessions_started_at_idx ON public.collaboration_sessions USING btree (started_at);


--
-- Name: collaboration_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collaboration_sessions_user_id_idx ON public.collaboration_sessions USING btree (user_id);


--
-- Name: confidence_drift_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX confidence_drift_log_created_at_idx ON public.confidence_drift_log USING btree (created_at);


--
-- Name: confidence_drift_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX confidence_drift_log_user_id_idx ON public.confidence_drift_log USING btree (user_id);


--
-- Name: consensus_snapshots_evaluation_point_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consensus_snapshots_evaluation_point_idx ON public.consensus_snapshots USING btree (evaluation_point);


--
-- Name: consensus_snapshots_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consensus_snapshots_session_id_idx ON public.consensus_snapshots USING btree (session_id);


--
-- Name: consensus_snapshots_snapshot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consensus_snapshots_snapshot_id_idx ON public.consensus_snapshots USING btree (snapshot_id);


--
-- Name: context_bridge_log_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX context_bridge_log_event_type_idx ON public.context_bridge_log USING btree (event_type);


--
-- Name: context_bridge_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX context_bridge_log_timestamp_idx ON public.context_bridge_log USING btree ("timestamp");


--
-- Name: context_bridge_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX context_bridge_log_trace_id_idx ON public.context_bridge_log USING btree (trace_id);


--
-- Name: conversation_summaries_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversation_summaries_conversation_id_idx ON public.conversation_summaries USING btree (conversation_id, created_at);


--
-- Name: cross_agent_ethics_session_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_agent_ethics_session_created_at_idx ON public.cross_agent_ethics_session USING btree (created_at);


--
-- Name: cross_agent_ethics_session_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_agent_ethics_session_session_id_idx ON public.cross_agent_ethics_session USING btree (session_id);


--
-- Name: cross_agent_ethics_session_verdict_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_agent_ethics_session_verdict_idx ON public.cross_agent_ethics_session USING btree (verdict);


--
-- Name: cross_node_alignment_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_node_alignment_log_created_at_idx ON public.cross_node_alignment_log USING btree (created_at);


--
-- Name: cross_node_alignment_log_drift_detected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_node_alignment_log_drift_detected_idx ON public.cross_node_alignment_log USING btree (drift_detected);


--
-- Name: cross_node_alignment_log_source_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_node_alignment_log_source_node_id_idx ON public.cross_node_alignment_log USING btree (source_node_id);


--
-- Name: cross_node_alignment_log_target_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_node_alignment_log_target_node_id_idx ON public.cross_node_alignment_log USING btree (target_node_id);


--
-- Name: cross_node_alignment_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cross_node_alignment_log_trace_id_idx ON public.cross_node_alignment_log USING btree (trace_id);


--
-- Name: crypto_spot_ohlc_1m_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_sym_time ON ONLY public.crypto_spot_ohlc_1m USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_04 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_05 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_06 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_07 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_08 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_09 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_10 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_11 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2026_12 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2027_01 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2027_02 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2027_03 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_idx ON public.crypto_spot_ohlc_1m_2027_04 USING btree (symbol, interval_begin DESC);


--
-- Name: crypto_spot_ticker_snap_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_sym_time ON ONLY public.crypto_spot_ticker_snap USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_04_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_04 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_05_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_05 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_06_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_06 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_07_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_07 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_08_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_08 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_09_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_09 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_10_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_10 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_11_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_11 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2026_12_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2026_12 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2027_01_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2027_01 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2027_02_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2027_02 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2027_03_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2027_03 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crypto_spot_ticker_snap_2027_04_symbol_captured_at_idx ON public.crypto_spot_ticker_snap_2027_04 USING btree (symbol, captured_at DESC);


--
-- Name: daily_performance_summary_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_performance_summary_date_idx ON public.daily_performance_summary USING btree (date);


--
-- Name: daily_performance_summary_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_performance_summary_mode_idx ON public.daily_performance_summary USING btree (mode);


--
-- Name: data_archive_manifest_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_archive_manifest_pending ON public.data_archive_manifest USING btree (source_table, partition_label) WHERE (state = ANY (ARRAY['pending'::text, 'uploaded'::text, 'verified'::text]));


--
-- Name: data_archive_manifest_source_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_archive_manifest_source_range ON public.data_archive_manifest USING btree (source_table, min_ts, max_ts);


--
-- Name: data_archive_manifest_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_archive_manifest_state ON public.data_archive_manifest USING btree (state) WHERE (state <> 'active'::text);


--
-- Name: data_lineage_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_lineage_timestamp_idx ON public.data_lineage USING btree ("timestamp");


--
-- Name: data_lineage_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_lineage_trace_id_idx ON public.data_lineage USING btree (trace_id);


--
-- Name: decision_trace_log_decision_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decision_trace_log_decision_id_idx ON public.decision_trace_log USING btree (decision_id);


--
-- Name: decision_trace_log_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decision_trace_log_decision_type_idx ON public.decision_trace_log USING btree (decision_type);


--
-- Name: decision_trace_log_simulation_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decision_trace_log_simulation_ref_idx ON public.decision_trace_log USING btree (simulation_ref);


--
-- Name: decision_trace_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decision_trace_log_user_id_idx ON public.decision_trace_log USING btree (user_id);


--
-- Name: ethical_principle_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_principle_enabled_idx ON public.ethical_principle USING btree (enabled);


--
-- Name: ethical_principle_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_principle_name_idx ON public.ethical_principle USING btree (name);


--
-- Name: ethical_principle_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_principle_type_idx ON public.ethical_principle USING btree (type);


--
-- Name: ethical_violation_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_violation_log_actor_idx ON public.ethical_violation_log USING btree (actor);


--
-- Name: ethical_violation_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_violation_log_created_at_idx ON public.ethical_violation_log USING btree (created_at);


--
-- Name: ethical_violation_log_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_violation_log_severity_idx ON public.ethical_violation_log USING btree (severity);


--
-- Name: ethical_violation_log_verdict_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethical_violation_log_verdict_idx ON public.ethical_violation_log USING btree (verdict);


--
-- Name: ethics_conflict_register_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_conflict_register_created_at_idx ON public.ethics_conflict_register USING btree (created_at);


--
-- Name: ethics_conflict_register_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_conflict_register_session_id_idx ON public.ethics_conflict_register USING btree (session_id);


--
-- Name: ethics_conflict_register_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_conflict_register_status_idx ON public.ethics_conflict_register USING btree (resolution_status);


--
-- Name: ethics_propagation_journal_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_propagation_journal_created_at_idx ON public.ethics_propagation_journal USING btree (created_at);


--
-- Name: ethics_propagation_journal_propagation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_propagation_journal_propagation_id_idx ON public.ethics_propagation_journal USING btree (propagation_id);


--
-- Name: ethics_propagation_journal_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_propagation_journal_status_idx ON public.ethics_propagation_journal USING btree (status);


--
-- Name: ethics_propagation_journal_target_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ethics_propagation_journal_target_domain_idx ON public.ethics_propagation_journal USING btree (target_domain);


--
-- Name: execution_attempt_audit_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_attempt_audit_created_at_idx ON public.execution_attempt_audit USING btree (created_at);


--
-- Name: execution_attempt_audit_decision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_attempt_audit_decision_idx ON public.execution_attempt_audit USING btree (decision);


--
-- Name: execution_attempt_audit_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_attempt_audit_mode_idx ON public.execution_attempt_audit USING btree (mode);


--
-- Name: execution_attempt_audit_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_attempt_audit_strategy_idx ON public.execution_attempt_audit USING btree (strategy);


--
-- Name: execution_attempt_audit_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_attempt_audit_symbol_idx ON public.execution_attempt_audit USING btree (symbol);


--
-- Name: execution_config_action_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_config_action_type_idx ON public.execution_config USING btree (action_type);


--
-- Name: execution_config_user_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_config_user_mode_idx ON public.execution_config USING btree (user_id, mode);


--
-- Name: exit_decision_archive_reason_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_reason_time ON ONLY public.exit_decision_archive USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_05_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_05_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_05 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_mode_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_mode_time ON ONLY public.exit_decision_archive USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_05_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_05_mode_captured_at_idx ON public.exit_decision_archive_2026_05 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_sym_time ON ONLY public.exit_decision_archive USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_05_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_05_symbol_captured_at_idx ON public.exit_decision_archive_2026_05 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_trade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_trade ON ONLY public.exit_decision_archive USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_05_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_05_trade_id_idx ON public.exit_decision_archive_2026_05 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_06_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_06_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_06 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_06_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_06_mode_captured_at_idx ON public.exit_decision_archive_2026_06 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_06_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_06_symbol_captured_at_idx ON public.exit_decision_archive_2026_06 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_06_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_06_trade_id_idx ON public.exit_decision_archive_2026_06 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_07_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_07_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_07 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_07_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_07_mode_captured_at_idx ON public.exit_decision_archive_2026_07 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_07_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_07_symbol_captured_at_idx ON public.exit_decision_archive_2026_07 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_07_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_07_trade_id_idx ON public.exit_decision_archive_2026_07 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_08_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_08_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_08 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_08_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_08_mode_captured_at_idx ON public.exit_decision_archive_2026_08 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_08_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_08_symbol_captured_at_idx ON public.exit_decision_archive_2026_08 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_08_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_08_trade_id_idx ON public.exit_decision_archive_2026_08 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_09_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_09_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_09 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_09_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_09_mode_captured_at_idx ON public.exit_decision_archive_2026_09 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_09_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_09_symbol_captured_at_idx ON public.exit_decision_archive_2026_09 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_09_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_09_trade_id_idx ON public.exit_decision_archive_2026_09 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_10_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_10_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_10 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_10_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_10_mode_captured_at_idx ON public.exit_decision_archive_2026_10 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_10_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_10_symbol_captured_at_idx ON public.exit_decision_archive_2026_10 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_10_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_10_trade_id_idx ON public.exit_decision_archive_2026_10 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_11_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_11_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_11 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_11_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_11_mode_captured_at_idx ON public.exit_decision_archive_2026_11 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_11_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_11_symbol_captured_at_idx ON public.exit_decision_archive_2026_11 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_11_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_11_trade_id_idx ON public.exit_decision_archive_2026_11 USING btree (trade_id);


--
-- Name: exit_decision_archive_2026_12_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_12_exit_reason_captured_at_idx ON public.exit_decision_archive_2026_12 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2026_12_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_12_mode_captured_at_idx ON public.exit_decision_archive_2026_12 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2026_12_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_12_symbol_captured_at_idx ON public.exit_decision_archive_2026_12 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2026_12_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2026_12_trade_id_idx ON public.exit_decision_archive_2026_12 USING btree (trade_id);


--
-- Name: exit_decision_archive_2027_01_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_01_exit_reason_captured_at_idx ON public.exit_decision_archive_2027_01 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2027_01_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_01_mode_captured_at_idx ON public.exit_decision_archive_2027_01 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2027_01_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_01_symbol_captured_at_idx ON public.exit_decision_archive_2027_01 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2027_01_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_01_trade_id_idx ON public.exit_decision_archive_2027_01 USING btree (trade_id);


--
-- Name: exit_decision_archive_2027_02_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_02_exit_reason_captured_at_idx ON public.exit_decision_archive_2027_02 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2027_02_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_02_mode_captured_at_idx ON public.exit_decision_archive_2027_02 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2027_02_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_02_symbol_captured_at_idx ON public.exit_decision_archive_2027_02 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2027_02_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_02_trade_id_idx ON public.exit_decision_archive_2027_02 USING btree (trade_id);


--
-- Name: exit_decision_archive_2027_03_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_03_exit_reason_captured_at_idx ON public.exit_decision_archive_2027_03 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2027_03_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_03_mode_captured_at_idx ON public.exit_decision_archive_2027_03 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2027_03_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_03_symbol_captured_at_idx ON public.exit_decision_archive_2027_03 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2027_03_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_03_trade_id_idx ON public.exit_decision_archive_2027_03 USING btree (trade_id);


--
-- Name: exit_decision_archive_2027_04_exit_reason_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_04_exit_reason_captured_at_idx ON public.exit_decision_archive_2027_04 USING btree (exit_reason, captured_at DESC);


--
-- Name: exit_decision_archive_2027_04_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_04_mode_captured_at_idx ON public.exit_decision_archive_2027_04 USING btree (mode, captured_at DESC);


--
-- Name: exit_decision_archive_2027_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_04_symbol_captured_at_idx ON public.exit_decision_archive_2027_04 USING btree (symbol, captured_at DESC);


--
-- Name: exit_decision_archive_2027_04_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exit_decision_archive_2027_04_trade_id_idx ON public.exit_decision_archive_2027_04 USING btree (trade_id);


--
-- Name: experience_memory_log_context_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experience_memory_log_context_domain_idx ON public.experience_memory_log USING btree (context_domain);


--
-- Name: experience_memory_log_impact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experience_memory_log_impact_idx ON public.experience_memory_log USING btree (impact);


--
-- Name: experience_memory_log_memory_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experience_memory_log_memory_id_idx ON public.experience_memory_log USING btree (memory_id);


--
-- Name: experience_memory_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX experience_memory_log_timestamp_idx ON public.experience_memory_log USING btree ("timestamp");


--
-- Name: federated_ethics_state_domain_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federated_ethics_state_domain_mode_idx ON public.federated_ethics_state USING btree (domain, mode);


--
-- Name: federated_ethics_state_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federated_ethics_state_updated_at_idx ON public.federated_ethics_state USING btree (updated_at);


--
-- Name: goal_alignment_profile_current_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_alignment_profile_current_status_idx ON public.goal_alignment_profile USING btree (current_status);


--
-- Name: goal_alignment_profile_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_alignment_profile_profile_id_idx ON public.goal_alignment_profile USING btree (profile_id);


--
-- Name: goal_alignment_profile_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_alignment_profile_user_id_idx ON public.goal_alignment_profile USING btree (user_id);


--
-- Name: goal_audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_audit_log_action_idx ON public.goal_audit_log USING btree (action);


--
-- Name: goal_audit_log_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_audit_log_mode_idx ON public.goal_audit_log USING btree (mode);


--
-- Name: goal_audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_audit_log_timestamp_idx ON public.goal_audit_log USING btree ("timestamp");


--
-- Name: goals_learning_mode_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_learning_mode_date_idx ON public.goals_learning_metrics USING btree (mode, date);


--
-- Name: goals_presets_mode_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goals_presets_mode_name_idx ON public.goals_presets USING btree (mode, name);


--
-- Name: guardrails_v2_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guardrails_v2_mode_idx ON public.guardrails_v2 USING btree (mode);


--
-- Name: historic_signals_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historic_signals_strategy_idx ON public.historic_signals USING btree (strategy_id);


--
-- Name: historic_signals_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historic_signals_symbol_idx ON public.historic_signals USING btree (symbol);


--
-- Name: historic_signals_trigger_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historic_signals_trigger_time_idx ON public.historic_signals USING btree (trigger_time);


--
-- Name: idx_decision_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decision_audit_created_at ON public.decision_quality_audit USING btree (created_at);


--
-- Name: idx_decision_audit_decision_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decision_audit_decision_id ON public.decision_quality_audit USING btree (decision_id);


--
-- Name: idx_decision_audit_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decision_audit_quality ON public.decision_quality_audit USING btree (quality_rating);


--
-- Name: idx_decision_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decision_audit_user_id ON public.decision_quality_audit USING btree (user_id);


--
-- Name: idx_discovery_runs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discovery_runs_started_at ON public.discovery_runs USING btree (started_at);


--
-- Name: idx_ethical_audit_log_compliance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ethical_audit_log_compliance ON public.ethical_audit_log USING btree (compliance_status);


--
-- Name: idx_ethical_audit_log_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ethical_audit_log_user_created ON public.ethical_audit_log USING btree (user_id, created_at DESC);


--
-- Name: idx_ethical_rule_set_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ethical_rule_set_user_active ON public.ethical_rule_set USING btree (user_id, is_active);


--
-- Name: idx_exec_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exec_audit_created ON public.execution_attempt_audit USING btree (created_at DESC);


--
-- Name: idx_exec_audit_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exec_audit_decision ON public.execution_attempt_audit USING btree (decision);


--
-- Name: idx_exec_audit_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exec_audit_mode ON public.execution_attempt_audit USING btree (mode);


--
-- Name: idx_exec_audit_strategy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exec_audit_strategy ON public.execution_attempt_audit USING btree (strategy);


--
-- Name: idx_exec_audit_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exec_audit_symbol ON public.execution_attempt_audit USING btree (symbol);


--
-- Name: idx_exit_strategy_alternates_asset_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exit_strategy_alternates_asset_created ON public.exit_strategy_alternates USING btree (asset_class, created_at DESC);


--
-- Name: idx_exit_strategy_alternates_regime_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exit_strategy_alternates_regime_variant ON public.exit_strategy_alternates USING btree (regime, variant_id);


--
-- Name: idx_exit_strategy_alternates_variant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exit_strategy_alternates_variant_created ON public.exit_strategy_alternates USING btree (variant_id, created_at);


--
-- Name: idx_module_constants_exchange_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_module_constants_exchange_asset ON public.module_constants USING btree (exchange, asset_class);


--
-- Name: idx_paper_sim_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paper_sim_sessions_started_at ON public.paper_sim_sessions USING btree (started_at DESC);


--
-- Name: idx_parameter_baseline_user_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parameter_baseline_user_mode ON public.parameter_baseline USING btree (user_id, mode);


--
-- Name: idx_portfolio_state_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_state_mode ON public.portfolio_state USING btree (mode);


--
-- Name: idx_reflection_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflection_log_created_at ON public.reflection_log USING btree (created_at);


--
-- Name: idx_reflection_log_depth; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflection_log_depth ON public.reflection_log USING btree (reflection_depth);


--
-- Name: idx_reflection_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflection_log_user_id ON public.reflection_log USING btree (user_id);


--
-- Name: idx_regime_factor_alternates_asset_evaluated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regime_factor_alternates_asset_evaluated ON public.regime_factor_alternates USING btree (asset_class, evaluated_at DESC) WHERE (replay_completed_at IS NOT NULL);


--
-- Name: idx_scheduled_tasks_audit_name_status_fired; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_tasks_audit_name_status_fired ON public.scheduled_tasks_audit USING btree (task_name, status, fired_at DESC);


--
-- Name: idx_screener_filters_asset_class_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screener_filters_asset_class_mode ON public.screener_filters USING btree (asset_class, mode);


--
-- Name: idx_telemetry_history_regime_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_history_regime_pool ON public.telemetry_history USING btree (regime, pool);


--
-- Name: idx_trades_mode_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_mode_status ON public.trades USING btree (mode, status);


--
-- Name: idx_trades_mode_status_exit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_mode_status_exit_time ON public.trades USING btree (mode, status, exit_time);


--
-- Name: idx_trades_symbol_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_symbol_mode ON public.trades USING btree (symbol, mode);


--
-- Name: idx_tuning_event_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tuning_event_created_at ON public.tuning_event USING btree (created_at DESC);


--
-- Name: idx_tuning_event_user_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tuning_event_user_mode ON public.tuning_event USING btree (user_id, mode);


--
-- Name: idx_tuning_policy_user_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tuning_policy_user_mode ON public.tuning_policy USING btree (user_id, mode);


--
-- Name: idx_xstock_dbs_backfill_sector_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_dbs_backfill_sector_ts ON public.xstock_dbs_backfill USING btree (sector, ts);


--
-- Name: idx_xstock_dbs_backfill_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_dbs_backfill_ts ON public.xstock_dbs_backfill USING btree (ts);


--
-- Name: idx_xstock_spot_ohlc_60m_snapshot_symbol_ts_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_spot_ohlc_60m_snapshot_symbol_ts_desc ON public.xstock_spot_ohlc_60m_snapshot USING btree (symbol, bucket_ts DESC);


--
-- Name: idx_xstock_spot_universe_is_delisted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_spot_universe_is_delisted ON public.xstock_spot_universe USING btree (is_delisted);


--
-- Name: idx_xstock_spot_universe_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_spot_universe_last_seen ON public.xstock_spot_universe USING btree (last_seen_at);


--
-- Name: idx_xstock_spot_universe_sector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_xstock_spot_universe_sector ON public.xstock_spot_universe USING btree (sector);


--
-- Name: intent_audit_log_intent_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intent_audit_log_intent_action_idx ON public.intent_audit_log USING btree (intent_action);


--
-- Name: intent_audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intent_audit_log_timestamp_idx ON public.intent_audit_log USING btree ("timestamp");


--
-- Name: intent_audit_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intent_audit_log_trace_id_idx ON public.intent_audit_log USING btree (trace_id);


--
-- Name: intent_audit_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intent_audit_log_user_id_idx ON public.intent_audit_log USING btree (user_id);


--
-- Name: introspection_report_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX introspection_report_created_at_idx ON public.introspection_report USING btree (created_at);


--
-- Name: introspection_report_report_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX introspection_report_report_date_idx ON public.introspection_report USING btree (report_date);


--
-- Name: introspection_report_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX introspection_report_user_id_idx ON public.introspection_report USING btree (user_id);


--
-- Name: ix_trading_signals_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trading_signals_expires_at ON public.trading_signals USING btree (expires_at);


--
-- Name: ix_trading_signals_mode_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trading_signals_mode_status ON public.trading_signals USING btree (mode, status);


--
-- Name: knowledge_cache_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_cache_expires_at_idx ON public.knowledge_cache USING btree (expires_at);


--
-- Name: knowledge_cache_query_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_cache_query_hash_idx ON public.knowledge_cache USING btree (query_hash);


--
-- Name: knowledge_cache_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_cache_source_idx ON public.knowledge_cache USING btree (source);


--
-- Name: knowledge_retrieval_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_retrieval_log_created_at_idx ON public.knowledge_retrieval_log USING btree (created_at);


--
-- Name: knowledge_retrieval_log_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_retrieval_log_source_idx ON public.knowledge_retrieval_log USING btree (source);


--
-- Name: knowledge_retrieval_log_trust_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_retrieval_log_trust_level_idx ON public.knowledge_retrieval_log USING btree (trust_level);


--
-- Name: knowledge_retrieval_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_retrieval_log_user_id_idx ON public.knowledge_retrieval_log USING btree (user_id);


--
-- Name: knowledge_trust_record_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_trust_record_domain_idx ON public.knowledge_trust_record USING btree (domain);


--
-- Name: knowledge_trust_record_last_audit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_trust_record_last_audit_date_idx ON public.knowledge_trust_record USING btree (last_audit_date);


--
-- Name: knowledge_trust_record_trust_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_trust_record_trust_level_idx ON public.knowledge_trust_record USING btree (trust_level);


--
-- Name: latti_baseline_history_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX latti_baseline_history_timestamp_idx ON public.latti_baseline_history USING btree ("timestamp");


--
-- Name: latti_baseline_history_trading_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX latti_baseline_history_trading_mode_idx ON public.latti_baseline_history USING btree (trading_mode);


--
-- Name: learning_fragments_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_fragments_category_idx ON public.learning_fragments USING btree (event_category);


--
-- Name: learning_fragments_context_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_fragments_context_mode_idx ON public.learning_fragments USING btree (global_context_id, mode);


--
-- Name: learning_fragments_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_fragments_event_type_idx ON public.learning_fragments USING btree (event_type);


--
-- Name: learning_fragments_significance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_fragments_significance_idx ON public.learning_fragments USING btree (significance);


--
-- Name: learning_fragments_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_fragments_timestamp_idx ON public.learning_fragments USING btree ("timestamp");


--
-- Name: learning_history_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_history_created_at_idx ON public.learning_history USING btree (created_at);


--
-- Name: learning_history_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_history_mode_idx ON public.learning_history USING btree (trading_mode);


--
-- Name: learning_history_stable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_history_stable_idx ON public.learning_history USING btree (is_stable);


--
-- Name: learning_history_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_history_version_idx ON public.learning_history USING btree (snapshot_version);


--
-- Name: learning_sources_user_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX learning_sources_user_source_idx ON public.learning_sources USING btree (user_id, source_name);


--
-- Name: learning_weight_profile_current_phase_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_weight_profile_current_phase_idx ON public.learning_weight_profile USING btree (current_phase);


--
-- Name: learning_weight_profile_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_weight_profile_profile_id_idx ON public.learning_weight_profile USING btree (profile_id);


--
-- Name: learning_weight_profile_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_weight_profile_user_id_idx ON public.learning_weight_profile USING btree (user_id);


--
-- Name: lottie_oversight_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lottie_oversight_log_created_at_idx ON public.lottie_oversight_log USING btree (created_at);


--
-- Name: lottie_oversight_log_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lottie_oversight_log_event_idx ON public.lottie_oversight_log USING btree (event);


--
-- Name: lottie_oversight_log_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lottie_oversight_log_strategy_idx ON public.lottie_oversight_log USING btree (strategy);


--
-- Name: macro_feed_archive_source_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_source_time ON ONLY public.macro_feed_archive USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_05_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_05_source_captured_at_idx ON public.macro_feed_archive_2026_05 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_06_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_06_source_captured_at_idx ON public.macro_feed_archive_2026_06 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_07_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_07_source_captured_at_idx ON public.macro_feed_archive_2026_07 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_08_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_08_source_captured_at_idx ON public.macro_feed_archive_2026_08 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_09_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_09_source_captured_at_idx ON public.macro_feed_archive_2026_09 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_10_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_10_source_captured_at_idx ON public.macro_feed_archive_2026_10 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_11_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_11_source_captured_at_idx ON public.macro_feed_archive_2026_11 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2026_12_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2026_12_source_captured_at_idx ON public.macro_feed_archive_2026_12 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2027_01_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2027_01_source_captured_at_idx ON public.macro_feed_archive_2027_01 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2027_02_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2027_02_source_captured_at_idx ON public.macro_feed_archive_2027_02 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2027_03_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2027_03_source_captured_at_idx ON public.macro_feed_archive_2027_03 USING btree (source, captured_at DESC);


--
-- Name: macro_feed_archive_2027_04_source_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX macro_feed_archive_2027_04_source_captured_at_idx ON public.macro_feed_archive_2027_04 USING btree (source, captured_at DESC);


--
-- Name: memory_audit_log_checksum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_audit_log_checksum_idx ON public.memory_audit_log USING btree (checksum);


--
-- Name: memory_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_audit_log_created_at_idx ON public.memory_audit_log USING btree (created_at);


--
-- Name: memory_audit_log_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_audit_log_status_idx ON public.memory_audit_log USING btree (status);


--
-- Name: memory_audit_log_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_audit_log_trace_id_idx ON public.memory_audit_log USING btree (trace_id);


--
-- Name: memory_audit_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_audit_log_user_id_idx ON public.memory_audit_log USING btree (user_id);


--
-- Name: meta_cognition_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_cognition_log_created_at_idx ON public.meta_cognition_log USING btree (created_at);


--
-- Name: meta_cognition_log_flag_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_cognition_log_flag_type_idx ON public.meta_cognition_log USING btree (flag_type);


--
-- Name: meta_cognition_log_resolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_cognition_log_resolved_idx ON public.meta_cognition_log USING btree (resolved);


--
-- Name: meta_cognition_log_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_cognition_log_severity_idx ON public.meta_cognition_log USING btree (severity);


--
-- Name: meta_cognition_log_source_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_cognition_log_source_agent_idx ON public.meta_cognition_log USING btree (source_agent);


--
-- Name: meta_reasoning_log_analysis_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_reasoning_log_analysis_id_idx ON public.meta_reasoning_log USING btree (analysis_id);


--
-- Name: meta_reasoning_log_analysis_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_reasoning_log_analysis_result_idx ON public.meta_reasoning_log USING btree (analysis_result);


--
-- Name: meta_reasoning_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_reasoning_log_created_at_idx ON public.meta_reasoning_log USING btree (created_at);


--
-- Name: meta_reasoning_log_target_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_reasoning_log_target_trace_id_idx ON public.meta_reasoning_log USING btree (target_trace_id);


--
-- Name: model_calibration_log_agent_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_calibration_log_agent_name_idx ON public.model_calibration_log USING btree (agent_name);


--
-- Name: model_calibration_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_calibration_log_created_at_idx ON public.model_calibration_log USING btree (created_at);


--
-- Name: model_calibration_log_parameter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_calibration_log_parameter_idx ON public.model_calibration_log USING btree (parameter);


--
-- Name: model_consistency_snapshot_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_consistency_snapshot_created_at_idx ON public.model_consistency_snapshot USING btree (created_at);


--
-- Name: model_consistency_snapshot_domain_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_consistency_snapshot_domain_channel_idx ON public.model_consistency_snapshot USING btree (domain_channel);


--
-- Name: model_consistency_snapshot_model_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_consistency_snapshot_model_hash_idx ON public.model_consistency_snapshot USING btree (model_hash);


--
-- Name: model_consistency_snapshot_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX model_consistency_snapshot_node_id_idx ON public.model_consistency_snapshot USING btree (node_id);


--
-- Name: pair_scan_archive_asset_class_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_asset_class_time ON ONLY public.pair_scan_archive USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_05_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_05_asset_class_captured_at_idx ON public.pair_scan_archive_2026_05 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_scan_stage_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_scan_stage_gin ON ONLY public.pair_scan_archive USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_05_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_05_expr_idx ON public.pair_scan_archive_2026_05 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_mode_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_mode_time ON ONLY public.pair_scan_archive USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_05_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_05_mode_captured_at_idx ON public.pair_scan_archive_2026_05 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_sym_time ON ONLY public.pair_scan_archive USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_05_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_05_symbol_captured_at_idx ON public.pair_scan_archive_2026_05 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_06_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_06_asset_class_captured_at_idx ON public.pair_scan_archive_2026_06 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_06_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_06_expr_idx ON public.pair_scan_archive_2026_06 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_06_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_06_mode_captured_at_idx ON public.pair_scan_archive_2026_06 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_06_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_06_symbol_captured_at_idx ON public.pair_scan_archive_2026_06 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_07_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_07_asset_class_captured_at_idx ON public.pair_scan_archive_2026_07 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_07_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_07_expr_idx ON public.pair_scan_archive_2026_07 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_07_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_07_mode_captured_at_idx ON public.pair_scan_archive_2026_07 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_07_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_07_symbol_captured_at_idx ON public.pair_scan_archive_2026_07 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_08_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_08_asset_class_captured_at_idx ON public.pair_scan_archive_2026_08 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_08_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_08_expr_idx ON public.pair_scan_archive_2026_08 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_08_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_08_mode_captured_at_idx ON public.pair_scan_archive_2026_08 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_08_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_08_symbol_captured_at_idx ON public.pair_scan_archive_2026_08 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_09_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_09_asset_class_captured_at_idx ON public.pair_scan_archive_2026_09 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_09_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_09_expr_idx ON public.pair_scan_archive_2026_09 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_09_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_09_mode_captured_at_idx ON public.pair_scan_archive_2026_09 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_09_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_09_symbol_captured_at_idx ON public.pair_scan_archive_2026_09 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_10_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_10_asset_class_captured_at_idx ON public.pair_scan_archive_2026_10 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_10_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_10_expr_idx ON public.pair_scan_archive_2026_10 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_10_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_10_mode_captured_at_idx ON public.pair_scan_archive_2026_10 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_10_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_10_symbol_captured_at_idx ON public.pair_scan_archive_2026_10 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_11_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_11_asset_class_captured_at_idx ON public.pair_scan_archive_2026_11 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_11_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_11_expr_idx ON public.pair_scan_archive_2026_11 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_11_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_11_mode_captured_at_idx ON public.pair_scan_archive_2026_11 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_11_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_11_symbol_captured_at_idx ON public.pair_scan_archive_2026_11 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2026_12_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_12_asset_class_captured_at_idx ON public.pair_scan_archive_2026_12 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2026_12_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_12_expr_idx ON public.pair_scan_archive_2026_12 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2026_12_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_12_mode_captured_at_idx ON public.pair_scan_archive_2026_12 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2026_12_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2026_12_symbol_captured_at_idx ON public.pair_scan_archive_2026_12 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2027_01_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_01_asset_class_captured_at_idx ON public.pair_scan_archive_2027_01 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2027_01_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_01_expr_idx ON public.pair_scan_archive_2027_01 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2027_01_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_01_mode_captured_at_idx ON public.pair_scan_archive_2027_01 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2027_01_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_01_symbol_captured_at_idx ON public.pair_scan_archive_2027_01 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2027_02_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_02_asset_class_captured_at_idx ON public.pair_scan_archive_2027_02 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2027_02_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_02_expr_idx ON public.pair_scan_archive_2027_02 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2027_02_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_02_mode_captured_at_idx ON public.pair_scan_archive_2027_02 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2027_02_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_02_symbol_captured_at_idx ON public.pair_scan_archive_2027_02 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2027_03_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_03_asset_class_captured_at_idx ON public.pair_scan_archive_2027_03 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2027_03_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_03_expr_idx ON public.pair_scan_archive_2027_03 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2027_03_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_03_mode_captured_at_idx ON public.pair_scan_archive_2027_03 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2027_03_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_03_symbol_captured_at_idx ON public.pair_scan_archive_2027_03 USING btree (symbol, captured_at DESC);


--
-- Name: pair_scan_archive_2027_04_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_04_asset_class_captured_at_idx ON public.pair_scan_archive_2027_04 USING btree (asset_class, captured_at DESC);


--
-- Name: pair_scan_archive_2027_04_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_04_expr_idx ON public.pair_scan_archive_2027_04 USING gin (((scan_stage_decision -> 'stage'::text)));


--
-- Name: pair_scan_archive_2027_04_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_04_mode_captured_at_idx ON public.pair_scan_archive_2027_04 USING btree (mode, captured_at DESC);


--
-- Name: pair_scan_archive_2027_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pair_scan_archive_2027_04_symbol_captured_at_idx ON public.pair_scan_archive_2027_04 USING btree (symbol, captured_at DESC);


--
-- Name: paper_sim_open_positions_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_open_positions_strategy_idx ON public.paper_sim_open_positions USING btree (strategy_name);


--
-- Name: paper_sim_sessions_backup_20251023_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paper_sim_sessions_backup_20251023_session_id_idx ON public.paper_sim_sessions_backup_20251023 USING btree (session_id);


--
-- Name: paper_sim_sessions_backup_20251023_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_sessions_backup_20251023_started_at_idx ON public.paper_sim_sessions_backup_20251023 USING btree (started_at);


--
-- Name: paper_sim_sessions_backup_20251023_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_sessions_backup_20251023_status_idx ON public.paper_sim_sessions_backup_20251023 USING btree (status);


--
-- Name: paper_sim_sessions_backup_20251023_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_sessions_backup_20251023_user_id_idx ON public.paper_sim_sessions_backup_20251023 USING btree (user_id);


--
-- Name: paper_sim_sessions_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paper_sim_sessions_session_id_idx ON public.paper_sim_sessions USING btree (session_id);


--
-- Name: paper_sim_sessions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_sessions_started_at_idx ON public.paper_sim_sessions USING btree (started_at);


--
-- Name: paper_sim_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_sessions_status_idx ON public.paper_sim_sessions USING btree (status);


--
-- Name: paper_sim_trade_logs_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_trade_logs_event_type_idx ON public.paper_sim_trade_logs USING btree (event_type);


--
-- Name: paper_sim_trade_logs_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_trade_logs_trade_id_idx ON public.paper_sim_trade_logs USING btree (trade_id);


--
-- Name: paper_sim_trades_closed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_trades_closed_at_idx ON public.paper_sim_trades USING btree (closed_at);


--
-- Name: paper_sim_trades_opened_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_trades_opened_at_idx ON public.paper_sim_trades USING btree (opened_at);


--
-- Name: paper_sim_trades_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paper_sim_trades_strategy_idx ON public.paper_sim_trades USING btree (strategy_name);


--
-- Name: patch_proposals_proposal_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX patch_proposals_proposal_id_idx ON public.patch_proposals USING btree (proposal_id);


--
-- Name: patch_proposals_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patch_proposals_user_status_idx ON public.patch_proposals USING btree (user_id, status);


--
-- Name: portfolio_state_backup_20251023_global_context_id_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX portfolio_state_backup_20251023_global_context_id_mode_idx ON public.portfolio_state_backup_20251023 USING btree (global_context_id, mode);


--
-- Name: portfolio_state_global_context_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX portfolio_state_global_context_mode_idx ON public.portfolio_state USING btree (global_context_id, mode);


--
-- Name: proposed_adjustments_user_mode_proposed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposed_adjustments_user_mode_proposed_idx ON public.proposed_adjustments USING btree (user_id, mode, proposed_at);


--
-- Name: reasoning_queue_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_queue_created_at_idx ON public.reasoning_queue USING btree (created_at);


--
-- Name: reasoning_queue_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_queue_status_idx ON public.reasoning_queue USING btree (status);


--
-- Name: reasoning_queue_task_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_queue_task_type_idx ON public.reasoning_queue USING btree (task_type);


--
-- Name: reasoning_queue_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_queue_trace_id_idx ON public.reasoning_queue USING btree (trace_id);


--
-- Name: reasoning_trace_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_trace_created_at_idx ON public.reasoning_trace USING btree (created_at);


--
-- Name: reasoning_trace_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_trace_status_idx ON public.reasoning_trace USING btree (status);


--
-- Name: reasoning_trace_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_trace_trace_id_idx ON public.reasoning_trace USING btree (trace_id);


--
-- Name: reasoning_trace_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reasoning_trace_user_id_idx ON public.reasoning_trace USING btree (user_id);


--
-- Name: regime_factor_alternates_factor_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_factor_time_idx ON public.regime_factor_alternates USING btree (factor_name, evaluated_at DESC);


--
-- Name: regime_factor_alternates_natural_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_natural_key_idx ON public.regime_factor_alternates USING btree (pair_symbol, evaluated_at, strategy);


--
-- Name: regime_factor_alternates_pair_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_pair_time_idx ON public.regime_factor_alternates USING btree (pair_symbol, evaluated_at DESC);


--
-- Name: regime_factor_alternates_pending_replay_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_pending_replay_idx ON public.regime_factor_alternates USING btree (replay_completed_at) WHERE (replay_completed_at IS NULL);


--
-- Name: regime_factor_alternates_signal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_signal_idx ON public.regime_factor_alternates USING btree (signal_id) WHERE (signal_id IS NOT NULL);


--
-- Name: regime_factor_alternates_vts_trade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regime_factor_alternates_vts_trade_idx ON public.regime_factor_alternates USING btree (vts_trade_id) WHERE (vts_trade_id IS NOT NULL);


--
-- Name: response_cache_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX response_cache_expires_at_idx ON public.response_cache USING btree (expires_at);


--
-- Name: response_cache_user_cache_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX response_cache_user_cache_key_idx ON public.response_cache USING btree (user_id, cache_key);


--
-- Name: rtb_signals_cwqi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rtb_signals_cwqi_idx ON public.rtb_signals USING btree (cwqi);


--
-- Name: rtb_signals_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rtb_signals_expires_at_idx ON public.rtb_signals USING btree (expires_at);


--
-- Name: rtb_signals_final_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rtb_signals_final_score_idx ON public.rtb_signals USING btree (final_score);


--
-- Name: rtb_signals_mode_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rtb_signals_mode_status_idx ON public.rtb_signals USING btree (mode, status);


--
-- Name: rtb_signals_queued_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rtb_signals_queued_at_idx ON public.rtb_signals USING btree (queued_at);


--
-- Name: rtb_signals_symbol_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rtb_signals_symbol_strategy_idx ON public.rtb_signals USING btree (mode, symbol, strategy);


--
-- Name: safety_event_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_event_log_actor_idx ON public.safety_event_log USING btree (actor);


--
-- Name: safety_event_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_event_log_created_at_idx ON public.safety_event_log USING btree (created_at);


--
-- Name: safety_event_log_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_event_log_severity_idx ON public.safety_event_log USING btree (severity);


--
-- Name: safety_policy_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_policy_enabled_idx ON public.safety_policy USING btree (enabled);


--
-- Name: safety_policy_policy_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_policy_policy_name_idx ON public.safety_policy USING btree (policy_name);


--
-- Name: safety_policy_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_policy_scope_idx ON public.safety_policy USING btree (scope);


--
-- Name: safety_telemetry_user_mode_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX safety_telemetry_user_mode_timestamp_idx ON public.safety_telemetry USING btree (user_id, mode, "timestamp");


--
-- Name: screener_filters_mode_class_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX screener_filters_mode_class_path_idx ON public.screener_filters USING btree (mode, asset_class, filter_path);


--
-- Name: semantic_memory_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX semantic_memory_embedding_idx ON public.semantic_memory USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: semantic_memory_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX semantic_memory_source_idx ON public.semantic_memory USING btree (source_table, source_id);


--
-- Name: semantic_memory_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX semantic_memory_tags_idx ON public.semantic_memory USING btree (tags);


--
-- Name: signal_eval_archive_asset_class_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_asset_class_time ON ONLY public.signal_eval_archive USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_05_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_05_asset_class_captured_at_idx ON public.signal_eval_archive_2026_05 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_mode_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_mode_time ON ONLY public.signal_eval_archive USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_05_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_05_mode_captured_at_idx ON public.signal_eval_archive_2026_05 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_reject_stage_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_reject_stage_time ON ONLY public.signal_eval_archive USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_05_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_05_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_05 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_sym_strat_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_sym_strat_time ON ONLY public.signal_eval_archive USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_05_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_05_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_05 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_06_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_06_asset_class_captured_at_idx ON public.signal_eval_archive_2026_06 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_06_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_06_mode_captured_at_idx ON public.signal_eval_archive_2026_06 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_06_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_06_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_06 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_06_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_06_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_06 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_07_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_07_asset_class_captured_at_idx ON public.signal_eval_archive_2026_07 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_07_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_07_mode_captured_at_idx ON public.signal_eval_archive_2026_07 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_07_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_07_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_07 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_07_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_07_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_07 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_08_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_08_asset_class_captured_at_idx ON public.signal_eval_archive_2026_08 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_08_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_08_mode_captured_at_idx ON public.signal_eval_archive_2026_08 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_08_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_08_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_08 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_08_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_08_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_08 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_09_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_09_asset_class_captured_at_idx ON public.signal_eval_archive_2026_09 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_09_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_09_mode_captured_at_idx ON public.signal_eval_archive_2026_09 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_09_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_09_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_09 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_09_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_09_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_09 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_10_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_10_asset_class_captured_at_idx ON public.signal_eval_archive_2026_10 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_10_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_10_mode_captured_at_idx ON public.signal_eval_archive_2026_10 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_10_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_10_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_10 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_10_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_10_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_10 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_11_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_11_asset_class_captured_at_idx ON public.signal_eval_archive_2026_11 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_11_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_11_mode_captured_at_idx ON public.signal_eval_archive_2026_11 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_11_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_11_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_11 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_11_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_11_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_11 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2026_12_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_12_asset_class_captured_at_idx ON public.signal_eval_archive_2026_12 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2026_12_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_12_mode_captured_at_idx ON public.signal_eval_archive_2026_12 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2026_12_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_12_reject_stage_captured_at_idx ON public.signal_eval_archive_2026_12 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2026_12_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2026_12_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2026_12 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2027_01_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_01_asset_class_captured_at_idx ON public.signal_eval_archive_2027_01 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2027_01_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_01_mode_captured_at_idx ON public.signal_eval_archive_2027_01 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2027_01_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_01_reject_stage_captured_at_idx ON public.signal_eval_archive_2027_01 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2027_01_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_01_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2027_01 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2027_02_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_02_asset_class_captured_at_idx ON public.signal_eval_archive_2027_02 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2027_02_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_02_mode_captured_at_idx ON public.signal_eval_archive_2027_02 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2027_02_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_02_reject_stage_captured_at_idx ON public.signal_eval_archive_2027_02 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2027_02_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_02_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2027_02 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2027_03_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_03_asset_class_captured_at_idx ON public.signal_eval_archive_2027_03 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2027_03_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_03_mode_captured_at_idx ON public.signal_eval_archive_2027_03 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2027_03_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_03_reject_stage_captured_at_idx ON public.signal_eval_archive_2027_03 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2027_03_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_03_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2027_03 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_eval_archive_2027_04_asset_class_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_04_asset_class_captured_at_idx ON public.signal_eval_archive_2027_04 USING btree (asset_class, captured_at DESC);


--
-- Name: signal_eval_archive_2027_04_mode_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_04_mode_captured_at_idx ON public.signal_eval_archive_2027_04 USING btree (mode, captured_at DESC);


--
-- Name: signal_eval_archive_2027_04_reject_stage_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_04_reject_stage_captured_at_idx ON public.signal_eval_archive_2027_04 USING btree (reject_stage, captured_at DESC);


--
-- Name: signal_eval_archive_2027_04_symbol_strategy_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_eval_archive_2027_04_symbol_strategy_captured_at_idx ON public.signal_eval_archive_2027_04 USING btree (symbol, strategy, captured_at DESC);


--
-- Name: signal_trace_mode_evaluated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_trace_mode_evaluated_idx ON public.paper_signal_trace USING btree (mode, evaluated_at DESC);


--
-- Name: signal_trace_mode_pair_evaluated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_trace_mode_pair_evaluated_idx ON public.paper_signal_trace USING btree (mode, pair, evaluated_at DESC);


--
-- Name: signal_trace_mode_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_trace_mode_stage_idx ON public.paper_signal_trace USING btree (mode, trace_stage) WHERE (trace_stage = 'signal'::public.trace_stage);


--
-- Name: strategic_memory_archive_agent_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_archive_agent_name_idx ON public.strategic_memory_archive USING btree (agent_name);


--
-- Name: strategic_memory_archive_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_archive_created_at_idx ON public.strategic_memory_archive USING btree (created_at);


--
-- Name: strategic_memory_archive_memory_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_archive_memory_scope_idx ON public.strategic_memory_archive USING btree (memory_scope);


--
-- Name: strategic_memory_snapshot_confidence_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_snapshot_confidence_level_idx ON public.strategic_memory_snapshot USING btree (confidence_level);


--
-- Name: strategic_memory_snapshot_snapshot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_snapshot_snapshot_id_idx ON public.strategic_memory_snapshot USING btree (snapshot_id);


--
-- Name: strategic_memory_snapshot_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_memory_snapshot_user_id_idx ON public.strategic_memory_snapshot USING btree (user_id);


--
-- Name: strategic_plan_log_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_plan_log_plan_id_idx ON public.strategic_plan_log USING btree (plan_id);


--
-- Name: strategic_plan_log_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_plan_log_status_idx ON public.strategic_plan_log USING btree (status);


--
-- Name: strategic_plan_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_plan_log_user_id_idx ON public.strategic_plan_log USING btree (user_id);


--
-- Name: strategic_simulation_log_evaluation_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_simulation_log_evaluation_status_idx ON public.strategic_simulation_log USING btree (evaluation_status);


--
-- Name: strategic_simulation_log_scenario_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_simulation_log_scenario_type_idx ON public.strategic_simulation_log USING btree (scenario_type);


--
-- Name: strategic_simulation_log_simulation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_simulation_log_simulation_id_idx ON public.strategic_simulation_log USING btree (simulation_id);


--
-- Name: strategic_simulation_log_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategic_simulation_log_user_id_idx ON public.strategic_simulation_log USING btree (user_id);


--
-- Name: strategy_drive_metrics_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_drive_metrics_mode_idx ON public.strategy_drive_metrics USING btree (mode);


--
-- Name: strategy_drive_metrics_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_drive_metrics_strategy_idx ON public.strategy_drive_metrics USING btree (strategy);


--
-- Name: strategy_drive_metrics_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_drive_metrics_timestamp_idx ON public.strategy_drive_metrics USING btree ("timestamp");


--
-- Name: strategy_drive_summary_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_drive_summary_created_at_idx ON public.strategy_drive_summary USING btree (created_at);


--
-- Name: strategy_mix_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_mix_log_created_at_idx ON public.strategy_mix_log USING btree (created_at);


--
-- Name: strategy_mix_log_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX strategy_mix_log_strategy_idx ON public.strategy_mix_log USING btree (strategy);


--
-- Name: strategy_param_schema_strategy_mode_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX strategy_param_schema_strategy_mode_key_idx ON public.strategy_param_schema USING btree (strategy_type, trading_mode, key);


--
-- Name: strategy_settings_global_context_mode_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX strategy_settings_global_context_mode_strategy_idx ON public.strategy_settings USING btree (global_context_id, mode, strategy);


--
-- Name: system_alerts_user_mode_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_alerts_user_mode_timestamp_idx ON public.system_alerts USING btree (user_id, mode, "timestamp");


--
-- Name: system_context_backup_20251023_last_mode_change_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_context_backup_20251023_last_mode_change_idx ON public.system_context_backup_20251023 USING btree (last_mode_change);


--
-- Name: system_context_backup_20251023_trading_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_context_backup_20251023_trading_mode_idx ON public.system_context_backup_20251023 USING btree (trading_mode);


--
-- Name: system_context_backup_20251023_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_context_backup_20251023_user_id_idx ON public.system_context_backup_20251023 USING btree (user_id);


--
-- Name: system_context_last_mode_change_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_context_last_mode_change_idx ON public.system_context USING btree (last_mode_change);


--
-- Name: system_context_trading_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_context_trading_mode_idx ON public.system_context USING btree (trading_mode);


--
-- Name: telemetry_history_mode_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telemetry_history_mode_timestamp_idx ON public.telemetry_history USING btree (mode, "timestamp");


--
-- Name: telemetry_history_regime_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telemetry_history_regime_idx ON public.telemetry_history USING btree (regime);


--
-- Name: telemetry_history_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telemetry_history_symbol_idx ON public.telemetry_history USING btree (symbol);


--
-- Name: telemetry_lineage_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telemetry_lineage_timestamp_idx ON public.telemetry_lineage USING btree ("timestamp");


--
-- Name: telemetry_lineage_trace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telemetry_lineage_trace_id_idx ON public.telemetry_lineage USING btree (trace_id);


--
-- Name: trading_audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_audit_log_action_idx ON public.trading_audit_log USING btree (action);


--
-- Name: trading_audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_audit_log_created_at_idx ON public.trading_audit_log USING btree (created_at);


--
-- Name: trading_audit_log_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_audit_log_mode_idx ON public.trading_audit_log USING btree (mode);


--
-- Name: trading_audit_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_audit_log_user_idx ON public.trading_audit_log USING btree (user_id);


--
-- Name: trading_signals_detected_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_signals_detected_at_idx ON public.trading_signals USING btree (detected_at);


--
-- Name: trading_signals_symbol_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trading_signals_symbol_strategy_idx ON public.trading_signals USING btree (symbol, strategy);


--
-- Name: user_goals_audit_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_goals_audit_status_idx ON public.user_goals_audit USING btree (feasibility_status);


--
-- Name: user_goals_audit_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_goals_audit_timestamp_idx ON public.user_goals_audit USING btree ("timestamp");


--
-- Name: user_goals_audit_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_goals_audit_user_id_idx ON public.user_goals_audit USING btree (user_id);


--
-- Name: ux_trading_signals_mode_symbol_strategy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_trading_signals_mode_symbol_strategy ON public.trading_signals USING btree (mode, symbol, strategy, status) WHERE ((status)::text = 'active'::text);


--
-- Name: value_alignment_matrix_mode_objective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX value_alignment_matrix_mode_objective_idx ON public.value_alignment_matrix USING btree (mode, objective_name);


--
-- Name: vts_open_trades_asset_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vts_open_trades_asset_class_idx ON public.vts_open_trades USING btree (asset_class);


--
-- Name: vts_open_trades_open_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vts_open_trades_open_filter_idx ON public.vts_open_trades USING btree (id) WHERE (closed = false);


--
-- Name: vts_open_trades_opened_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vts_open_trades_opened_at_idx ON public.vts_open_trades USING btree (opened_at);


--
-- Name: vts_open_trades_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vts_open_trades_symbol_idx ON public.vts_open_trades USING btree (symbol);


--
-- Name: walter_actions_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_category_idx ON public.walter_actions USING btree (category);


--
-- Name: walter_actions_detected_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_detected_at_idx ON public.walter_actions USING btree (detected_at);


--
-- Name: walter_actions_escalated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_escalated_idx ON public.walter_actions USING btree (escalated);


--
-- Name: walter_actions_impact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_impact_idx ON public.walter_actions USING btree (impact_score);


--
-- Name: walter_actions_incident_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_incident_key_idx ON public.walter_actions USING btree (incident_key);


--
-- Name: walter_actions_parent_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_parent_action_idx ON public.walter_actions USING btree (parent_action_id);


--
-- Name: walter_actions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_status_idx ON public.walter_actions USING btree (status);


--
-- Name: walter_actions_user_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_actions_user_mode_idx ON public.walter_actions USING btree (user_id, mode);


--
-- Name: walter_approvals_audit_approval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_approvals_audit_approval_idx ON public.walter_approvals_audit USING btree (approval_id);


--
-- Name: walter_approvals_audit_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_approvals_audit_timestamp_idx ON public.walter_approvals_audit USING btree ("timestamp");


--
-- Name: walter_approvals_audit_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_approvals_audit_user_idx ON public.walter_approvals_audit USING btree (user_id);


--
-- Name: walter_chat_logs_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_chat_logs_session_idx ON public.walter_chat_logs USING btree (chat_session_id);


--
-- Name: walter_chat_logs_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_chat_logs_timestamp_idx ON public.walter_chat_logs USING btree ("timestamp");


--
-- Name: walter_execution_log_action_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_execution_log_action_type_idx ON public.walter_execution_log USING btree (action_type);


--
-- Name: walter_execution_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_execution_log_created_at_idx ON public.walter_execution_log USING btree (created_at);


--
-- Name: walter_execution_log_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_execution_log_mode_idx ON public.walter_execution_log USING btree (mode);


--
-- Name: walter_execution_log_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_execution_log_status_idx ON public.walter_execution_log USING btree (execution_status);


--
-- Name: walter_execution_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_execution_log_user_idx ON public.walter_execution_log USING btree (user_id);


--
-- Name: walter_memory_importance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_memory_importance_idx ON public.walter_memory USING btree (importance);


--
-- Name: walter_memory_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_memory_timestamp_idx ON public.walter_memory USING btree ("timestamp");


--
-- Name: walter_memory_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX walter_memory_user_type_idx ON public.walter_memory USING btree (user_id, type);


--
-- Name: walter_purpose_user_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX walter_purpose_user_mode_idx ON public.walter_purpose USING btree (user_id, mode);


--
-- Name: watchlist_pairs_backup_20251023_user_id_mode_symbol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX watchlist_pairs_backup_20251023_user_id_mode_symbol_idx ON public.watchlist_pairs_backup_20251023 USING btree (user_id, mode, symbol);


--
-- Name: xstock_perp_ohlc_1m_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_sym_time ON ONLY public.xstock_perp_ohlc_1m USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_04 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_05 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_06 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_07 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_08 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_09 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_10 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_11 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2026_12 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2027_01 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2027_02 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2027_03 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_idx ON public.xstock_perp_ohlc_1m_2027_04 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_perp_ticker_snap_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_sym_time ON ONLY public.xstock_perp_ticker_snap USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_04_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_04 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_05_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_05 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_06_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_06 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_07_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_07 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_08_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_08 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_09_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_09 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_10_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_10 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_11_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_11 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2026_12_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2026_12 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2027_01_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2027_01 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2027_02_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2027_02 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2027_03_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2027_03 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_perp_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_perp_ticker_snap_2027_04_symbol_captured_at_idx ON public.xstock_perp_ticker_snap_2027_04 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ohlc_1m_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_sym_time ON ONLY public.xstock_spot_ohlc_1m USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_04 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_05 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_06 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_07 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_08 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_09 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_10 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_11 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2026_12 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2027_01 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2027_02 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2027_03 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_idx ON public.xstock_spot_ohlc_1m_2027_04 USING btree (symbol, interval_begin DESC);


--
-- Name: xstock_spot_ticker_snap_sym_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_sym_time ON ONLY public.xstock_spot_ticker_snap USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_04_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_04 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_05_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_05 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_06_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_06 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_07_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_07 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_08_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_08 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_09_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_09 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_10_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_10 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_11_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_11 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2026_12_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2026_12 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2027_01_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2027_01 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2027_02_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2027_02 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2027_03_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2027_03 USING btree (symbol, captured_at DESC);


--
-- Name: xstock_spot_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xstock_spot_ticker_snap_2027_04_symbol_captured_at_idx ON public.xstock_spot_ticker_snap_2027_04 USING btree (symbol, captured_at DESC);


--
-- Name: crypto_spot_ohlc_1m_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_04_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_04_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_05_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_05_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_06_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_06_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_07_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_07_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_08_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_08_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_09_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_09_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_10_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_10_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_11_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_11_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_12_pkey;


--
-- Name: crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2026_12_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_01_pkey;


--
-- Name: crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_01_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_02_pkey;


--
-- Name: crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_02_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_03_pkey;


--
-- Name: crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_03_symbol_interval_begin_key;


--
-- Name: crypto_spot_ohlc_1m_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_pkey ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_04_pkey;


--
-- Name: crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_sym_time ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_idx;


--
-- Name: crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.crypto_spot_ohlc_1m_2027_04_symbol_interval_begin_key;


--
-- Name: crypto_spot_ticker_snap_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_04_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_04_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_05_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_05_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_06_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_06_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_07_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_07_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_08_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_08_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_09_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_09_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_10_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_10_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_11_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_11_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2026_12_pkey;


--
-- Name: crypto_spot_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2026_12_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2027_01_pkey;


--
-- Name: crypto_spot_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2027_01_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2027_02_pkey;


--
-- Name: crypto_spot_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2027_02_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2027_03_pkey;


--
-- Name: crypto_spot_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2027_03_symbol_captured_at_idx;


--
-- Name: crypto_spot_ticker_snap_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_pkey ATTACH PARTITION public.crypto_spot_ticker_snap_2027_04_pkey;


--
-- Name: crypto_spot_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.crypto_spot_ticker_snap_sym_time ATTACH PARTITION public.crypto_spot_ticker_snap_2027_04_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_05_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_05_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_05_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_05_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_05_pkey;


--
-- Name: exit_decision_archive_2026_05_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_05_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_05_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_05_trade_id_idx;


--
-- Name: exit_decision_archive_2026_06_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_06_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_06_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_06_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_06_pkey;


--
-- Name: exit_decision_archive_2026_06_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_06_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_06_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_06_trade_id_idx;


--
-- Name: exit_decision_archive_2026_07_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_07_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_07_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_07_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_07_pkey;


--
-- Name: exit_decision_archive_2026_07_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_07_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_07_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_07_trade_id_idx;


--
-- Name: exit_decision_archive_2026_08_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_08_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_08_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_08_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_08_pkey;


--
-- Name: exit_decision_archive_2026_08_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_08_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_08_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_08_trade_id_idx;


--
-- Name: exit_decision_archive_2026_09_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_09_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_09_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_09_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_09_pkey;


--
-- Name: exit_decision_archive_2026_09_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_09_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_09_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_09_trade_id_idx;


--
-- Name: exit_decision_archive_2026_10_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_10_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_10_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_10_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_10_pkey;


--
-- Name: exit_decision_archive_2026_10_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_10_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_10_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_10_trade_id_idx;


--
-- Name: exit_decision_archive_2026_11_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_11_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_11_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_11_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_11_pkey;


--
-- Name: exit_decision_archive_2026_11_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_11_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_11_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_11_trade_id_idx;


--
-- Name: exit_decision_archive_2026_12_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2026_12_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2026_12_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2026_12_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2026_12_pkey;


--
-- Name: exit_decision_archive_2026_12_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2026_12_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2026_12_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2026_12_trade_id_idx;


--
-- Name: exit_decision_archive_2027_01_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2027_01_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2027_01_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2027_01_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2027_01_pkey;


--
-- Name: exit_decision_archive_2027_01_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2027_01_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2027_01_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2027_01_trade_id_idx;


--
-- Name: exit_decision_archive_2027_02_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2027_02_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2027_02_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2027_02_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2027_02_pkey;


--
-- Name: exit_decision_archive_2027_02_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2027_02_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2027_02_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2027_02_trade_id_idx;


--
-- Name: exit_decision_archive_2027_03_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2027_03_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2027_03_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2027_03_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2027_03_pkey;


--
-- Name: exit_decision_archive_2027_03_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2027_03_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2027_03_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2027_03_trade_id_idx;


--
-- Name: exit_decision_archive_2027_04_exit_reason_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_reason_time ATTACH PARTITION public.exit_decision_archive_2027_04_exit_reason_captured_at_idx;


--
-- Name: exit_decision_archive_2027_04_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_mode_time ATTACH PARTITION public.exit_decision_archive_2027_04_mode_captured_at_idx;


--
-- Name: exit_decision_archive_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_pkey ATTACH PARTITION public.exit_decision_archive_2027_04_pkey;


--
-- Name: exit_decision_archive_2027_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_sym_time ATTACH PARTITION public.exit_decision_archive_2027_04_symbol_captured_at_idx;


--
-- Name: exit_decision_archive_2027_04_trade_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.exit_decision_archive_trade ATTACH PARTITION public.exit_decision_archive_2027_04_trade_id_idx;


--
-- Name: macro_feed_archive_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_05_pkey;


--
-- Name: macro_feed_archive_2026_05_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_05_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_06_pkey;


--
-- Name: macro_feed_archive_2026_06_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_06_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_07_pkey;


--
-- Name: macro_feed_archive_2026_07_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_07_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_08_pkey;


--
-- Name: macro_feed_archive_2026_08_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_08_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_09_pkey;


--
-- Name: macro_feed_archive_2026_09_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_09_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_10_pkey;


--
-- Name: macro_feed_archive_2026_10_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_10_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_11_pkey;


--
-- Name: macro_feed_archive_2026_11_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_11_source_captured_at_idx;


--
-- Name: macro_feed_archive_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2026_12_pkey;


--
-- Name: macro_feed_archive_2026_12_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2026_12_source_captured_at_idx;


--
-- Name: macro_feed_archive_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2027_01_pkey;


--
-- Name: macro_feed_archive_2027_01_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2027_01_source_captured_at_idx;


--
-- Name: macro_feed_archive_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2027_02_pkey;


--
-- Name: macro_feed_archive_2027_02_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2027_02_source_captured_at_idx;


--
-- Name: macro_feed_archive_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2027_03_pkey;


--
-- Name: macro_feed_archive_2027_03_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2027_03_source_captured_at_idx;


--
-- Name: macro_feed_archive_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_pkey ATTACH PARTITION public.macro_feed_archive_2027_04_pkey;


--
-- Name: macro_feed_archive_2027_04_source_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.macro_feed_archive_source_time ATTACH PARTITION public.macro_feed_archive_2027_04_source_captured_at_idx;


--
-- Name: pair_scan_archive_2026_05_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_05_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_05_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_05_expr_idx;


--
-- Name: pair_scan_archive_2026_05_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_05_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_05_pkey;


--
-- Name: pair_scan_archive_2026_05_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_05_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_06_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_06_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_06_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_06_expr_idx;


--
-- Name: pair_scan_archive_2026_06_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_06_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_06_pkey;


--
-- Name: pair_scan_archive_2026_06_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_06_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_07_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_07_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_07_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_07_expr_idx;


--
-- Name: pair_scan_archive_2026_07_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_07_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_07_pkey;


--
-- Name: pair_scan_archive_2026_07_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_07_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_08_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_08_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_08_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_08_expr_idx;


--
-- Name: pair_scan_archive_2026_08_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_08_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_08_pkey;


--
-- Name: pair_scan_archive_2026_08_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_08_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_09_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_09_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_09_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_09_expr_idx;


--
-- Name: pair_scan_archive_2026_09_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_09_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_09_pkey;


--
-- Name: pair_scan_archive_2026_09_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_09_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_10_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_10_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_10_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_10_expr_idx;


--
-- Name: pair_scan_archive_2026_10_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_10_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_10_pkey;


--
-- Name: pair_scan_archive_2026_10_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_10_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_11_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_11_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_11_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_11_expr_idx;


--
-- Name: pair_scan_archive_2026_11_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_11_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_11_pkey;


--
-- Name: pair_scan_archive_2026_11_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_11_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2026_12_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2026_12_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2026_12_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2026_12_expr_idx;


--
-- Name: pair_scan_archive_2026_12_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2026_12_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2026_12_pkey;


--
-- Name: pair_scan_archive_2026_12_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2026_12_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2027_01_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2027_01_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2027_01_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2027_01_expr_idx;


--
-- Name: pair_scan_archive_2027_01_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2027_01_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2027_01_pkey;


--
-- Name: pair_scan_archive_2027_01_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2027_01_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2027_02_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2027_02_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2027_02_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2027_02_expr_idx;


--
-- Name: pair_scan_archive_2027_02_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2027_02_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2027_02_pkey;


--
-- Name: pair_scan_archive_2027_02_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2027_02_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2027_03_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2027_03_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2027_03_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2027_03_expr_idx;


--
-- Name: pair_scan_archive_2027_03_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2027_03_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2027_03_pkey;


--
-- Name: pair_scan_archive_2027_03_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2027_03_symbol_captured_at_idx;


--
-- Name: pair_scan_archive_2027_04_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_asset_class_time ATTACH PARTITION public.pair_scan_archive_2027_04_asset_class_captured_at_idx;


--
-- Name: pair_scan_archive_2027_04_expr_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_scan_stage_gin ATTACH PARTITION public.pair_scan_archive_2027_04_expr_idx;


--
-- Name: pair_scan_archive_2027_04_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_mode_time ATTACH PARTITION public.pair_scan_archive_2027_04_mode_captured_at_idx;


--
-- Name: pair_scan_archive_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_pkey ATTACH PARTITION public.pair_scan_archive_2027_04_pkey;


--
-- Name: pair_scan_archive_2027_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.pair_scan_archive_sym_time ATTACH PARTITION public.pair_scan_archive_2027_04_symbol_captured_at_idx;


--
-- Name: signal_eval_archive_2026_05_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_05_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_05_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_05_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_05_pkey;


--
-- Name: signal_eval_archive_2026_05_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_05_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_05_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_05_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_06_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_06_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_06_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_06_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_06_pkey;


--
-- Name: signal_eval_archive_2026_06_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_06_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_06_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_06_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_07_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_07_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_07_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_07_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_07_pkey;


--
-- Name: signal_eval_archive_2026_07_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_07_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_07_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_07_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_08_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_08_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_08_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_08_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_08_pkey;


--
-- Name: signal_eval_archive_2026_08_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_08_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_08_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_08_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_09_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_09_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_09_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_09_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_09_pkey;


--
-- Name: signal_eval_archive_2026_09_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_09_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_09_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_09_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_10_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_10_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_10_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_10_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_10_pkey;


--
-- Name: signal_eval_archive_2026_10_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_10_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_10_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_10_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_11_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_11_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_11_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_11_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_11_pkey;


--
-- Name: signal_eval_archive_2026_11_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_11_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_11_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_11_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2026_12_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2026_12_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2026_12_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2026_12_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2026_12_pkey;


--
-- Name: signal_eval_archive_2026_12_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2026_12_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2026_12_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2026_12_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2027_01_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2027_01_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2027_01_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2027_01_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2027_01_pkey;


--
-- Name: signal_eval_archive_2027_01_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2027_01_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2027_01_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2027_01_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2027_02_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2027_02_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2027_02_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2027_02_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2027_02_pkey;


--
-- Name: signal_eval_archive_2027_02_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2027_02_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2027_02_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2027_02_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2027_03_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2027_03_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2027_03_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2027_03_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2027_03_pkey;


--
-- Name: signal_eval_archive_2027_03_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2027_03_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2027_03_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2027_03_symbol_strategy_captured_at_idx;


--
-- Name: signal_eval_archive_2027_04_asset_class_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_asset_class_time ATTACH PARTITION public.signal_eval_archive_2027_04_asset_class_captured_at_idx;


--
-- Name: signal_eval_archive_2027_04_mode_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_mode_time ATTACH PARTITION public.signal_eval_archive_2027_04_mode_captured_at_idx;


--
-- Name: signal_eval_archive_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_pkey ATTACH PARTITION public.signal_eval_archive_2027_04_pkey;


--
-- Name: signal_eval_archive_2027_04_reject_stage_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_reject_stage_time ATTACH PARTITION public.signal_eval_archive_2027_04_reject_stage_captured_at_idx;


--
-- Name: signal_eval_archive_2027_04_symbol_strategy_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.signal_eval_archive_sym_strat_time ATTACH PARTITION public.signal_eval_archive_2027_04_symbol_strategy_captured_at_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_04_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_04_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_05_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_05_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_06_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_06_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_07_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_07_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_08_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_08_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_09_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_09_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_10_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_10_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_11_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_11_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_12_pkey;


--
-- Name: xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2026_12_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_01_pkey;


--
-- Name: xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_01_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_02_pkey;


--
-- Name: xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_02_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_03_pkey;


--
-- Name: xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_03_symbol_interval_begin_key;


--
-- Name: xstock_perp_ohlc_1m_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_pkey ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_04_pkey;


--
-- Name: xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_sym_time ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_idx;


--
-- Name: xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_perp_ohlc_1m_2027_04_symbol_interval_begin_key;


--
-- Name: xstock_perp_ticker_snap_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_04_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_04_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_05_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_05_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_06_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_06_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_07_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_07_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_08_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_08_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_09_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_09_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_10_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_10_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_11_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_11_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2026_12_pkey;


--
-- Name: xstock_perp_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2026_12_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2027_01_pkey;


--
-- Name: xstock_perp_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2027_01_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2027_02_pkey;


--
-- Name: xstock_perp_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2027_02_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2027_03_pkey;


--
-- Name: xstock_perp_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2027_03_symbol_captured_at_idx;


--
-- Name: xstock_perp_ticker_snap_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_pkey ATTACH PARTITION public.xstock_perp_ticker_snap_2027_04_pkey;


--
-- Name: xstock_perp_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_perp_ticker_snap_sym_time ATTACH PARTITION public.xstock_perp_ticker_snap_2027_04_symbol_captured_at_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_04_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_04_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_05_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_05_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_06_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_06_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_07_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_07_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_08_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_08_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_09_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_09_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_10_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_10_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_11_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_11_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_12_pkey;


--
-- Name: xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2026_12_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_01_pkey;


--
-- Name: xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_01_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_02_pkey;


--
-- Name: xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_02_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_03_pkey;


--
-- Name: xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_03_symbol_interval_begin_key;


--
-- Name: xstock_spot_ohlc_1m_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_pkey ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_04_pkey;


--
-- Name: xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_sym_time ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_idx;


--
-- Name: xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_key; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ohlc_1m_symbol_interval_unique ATTACH PARTITION public.xstock_spot_ohlc_1m_2027_04_symbol_interval_begin_key;


--
-- Name: xstock_spot_ticker_snap_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_04_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_04_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_05_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_05_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_05_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_06_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_06_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_06_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_07_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_07_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_07_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_08_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_08_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_08_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_09_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_09_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_09_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_10_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_10_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_10_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_11_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_11_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_11_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2026_12_pkey;


--
-- Name: xstock_spot_ticker_snap_2026_12_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2026_12_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2027_01_pkey;


--
-- Name: xstock_spot_ticker_snap_2027_01_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2027_01_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2027_02_pkey;


--
-- Name: xstock_spot_ticker_snap_2027_02_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2027_02_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2027_03_pkey;


--
-- Name: xstock_spot_ticker_snap_2027_03_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2027_03_symbol_captured_at_idx;


--
-- Name: xstock_spot_ticker_snap_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_pkey ATTACH PARTITION public.xstock_spot_ticker_snap_2027_04_pkey;


--
-- Name: xstock_spot_ticker_snap_2027_04_symbol_captured_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.xstock_spot_ticker_snap_sym_time ATTACH PARTITION public.xstock_spot_ticker_snap_2027_04_symbol_captured_at_idx;


--
-- Name: ai_chat_logs ai_chat_logs_conversation_id_ai_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_logs
    ADD CONSTRAINT ai_chat_logs_conversation_id_ai_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_opportunities ai_opportunities_conversation_id_ai_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_opportunities
    ADD CONSTRAINT ai_opportunities_conversation_id_ai_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id);


--
-- Name: ai_opportunities ai_opportunities_executed_trade_id_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_opportunities
    ADD CONSTRAINT ai_opportunities_executed_trade_id_trades_id_fk FOREIGN KEY (executed_trade_id) REFERENCES public.trades(id);


--
-- Name: ai_opportunities ai_opportunities_run_id_ai_opportunity_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_opportunities
    ADD CONSTRAINT ai_opportunities_run_id_ai_opportunity_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.ai_opportunity_runs(id);


--
-- Name: autonomy_audit_log autonomy_audit_log_trace_id_reasoning_trace_trace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_audit_log
    ADD CONSTRAINT autonomy_audit_log_trace_id_reasoning_trace_trace_id_fk FOREIGN KEY (trace_id) REFERENCES public.reasoning_trace(trace_id);


--
-- Name: cluster_audit_log cluster_audit_log_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_audit_log
    ADD CONSTRAINT cluster_audit_log_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.cluster_node(id);


--
-- Name: cluster_audit_log cluster_audit_log_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_audit_log
    ADD CONSTRAINT cluster_audit_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.cluster_task_queue(id);


--
-- Name: cluster_circuit_breaker cluster_circuit_breaker_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_circuit_breaker
    ADD CONSTRAINT cluster_circuit_breaker_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.cluster_node(id);


--
-- Name: cluster_result_log cluster_result_log_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_result_log
    ADD CONSTRAINT cluster_result_log_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.cluster_node(id);


--
-- Name: cluster_result_log cluster_result_log_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_result_log
    ADD CONSTRAINT cluster_result_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.cluster_task_queue(id);


--
-- Name: cluster_task_queue cluster_task_queue_assigned_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cluster_task_queue
    ADD CONSTRAINT cluster_task_queue_assigned_node_id_fkey FOREIGN KEY (assigned_node_id) REFERENCES public.cluster_node(id);


--
-- Name: conversation_summaries conversation_summaries_conversation_id_ai_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_conversation_id_ai_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: cross_node_alignment_log cross_node_alignment_log_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_node_alignment_log
    ADD CONSTRAINT cross_node_alignment_log_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.cluster_node(id);


--
-- Name: cross_node_alignment_log cross_node_alignment_log_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_node_alignment_log
    ADD CONSTRAINT cross_node_alignment_log_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.cluster_node(id);


--
-- Name: expert_principles expert_principles_source_id_expert_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_principles
    ADD CONSTRAINT expert_principles_source_id_expert_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.expert_sources(id);


--
-- Name: expert_response_logs expert_response_logs_chat_id_walter_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_response_logs
    ADD CONSTRAINT expert_response_logs_chat_id_walter_chats_id_fk FOREIGN KEY (chat_id) REFERENCES public.walter_chats(id);


--
-- Name: expert_updates expert_updates_source_id_expert_sources_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expert_updates
    ADD CONSTRAINT expert_updates_source_id_expert_sources_id_fk FOREIGN KEY (source_id) REFERENCES public.expert_sources(id);


--
-- Name: memory_audit_log memory_audit_log_trace_id_reasoning_trace_trace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_audit_log
    ADD CONSTRAINT memory_audit_log_trace_id_reasoning_trace_trace_id_fk FOREIGN KEY (trace_id) REFERENCES public.reasoning_trace(trace_id);


--
-- Name: meta_reasoning_log meta_reasoning_log_target_trace_id_reasoning_trace_trace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_reasoning_log
    ADD CONSTRAINT meta_reasoning_log_target_trace_id_reasoning_trace_trace_id_fk FOREIGN KEY (target_trace_id) REFERENCES public.reasoning_trace(trace_id);


--
-- Name: model_consistency_snapshot model_consistency_snapshot_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_consistency_snapshot
    ADD CONSTRAINT model_consistency_snapshot_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.cluster_node(id);


--
-- Name: walter_approvals_audit walter_approvals_audit_approval_id_walter_pending_approvals_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_approvals_audit
    ADD CONSTRAINT walter_approvals_audit_approval_id_walter_pending_approvals_id_ FOREIGN KEY (approval_id) REFERENCES public.walter_pending_approvals(id);


--
-- Name: walter_chat_logs walter_chat_logs_chat_session_id_walter_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_chat_logs
    ADD CONSTRAINT walter_chat_logs_chat_session_id_walter_chats_id_fk FOREIGN KEY (chat_session_id) REFERENCES public.walter_chats(id) ON DELETE CASCADE;


--
-- Name: walter_execution_log walter_execution_log_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_execution_log
    ADD CONSTRAINT walter_execution_log_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.walter_pending_approvals(id) ON DELETE SET NULL;


--
-- Name: walter_execution_log walter_execution_log_chat_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_execution_log
    ADD CONSTRAINT walter_execution_log_chat_session_id_fkey FOREIGN KEY (chat_session_id) REFERENCES public.walter_chats(id) ON DELETE SET NULL;


--
-- Name: walter_memory walter_memory_chat_id_walter_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_memory
    ADD CONSTRAINT walter_memory_chat_id_walter_chats_id_fk FOREIGN KEY (chat_id) REFERENCES public.walter_chats(id) ON DELETE SET NULL;


--
-- Name: walter_pending_approvals walter_pending_approvals_chat_session_id_walter_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walter_pending_approvals
    ADD CONSTRAINT walter_pending_approvals_chat_session_id_walter_chats_id_fk FOREIGN KEY (chat_session_id) REFERENCES public.walter_chats(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


