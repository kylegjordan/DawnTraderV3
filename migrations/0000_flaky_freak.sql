CREATE TYPE "public"."agent_state" AS ENUM('active', 'idle', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."alignment_status" AS ENUM('compliant', 'at_risk', 'violated');--> statement-breakpoint
CREATE TYPE "public"."alignment_strategy" AS ENUM('accept', 'reject', 'blend');--> statement-breakpoint
CREATE TYPE "public"."alignment_verification_result" AS ENUM('approved', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_display_mode" AS ENUM('inline', 'notification');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('guardrails', 'filters');--> statement-breakpoint
CREATE TYPE "public"."autonomy_action_type" AS ENUM('self_check', 'self_reasoning', 'exploration', 'optimization');--> statement-breakpoint
CREATE TYPE "public"."awareness_emotional_state" AS ENUM('stable', 'focused', 'alert', 'fatigued', 'overloaded', 'recovering');--> statement-breakpoint
CREATE TYPE "public"."behavioral_trigger_type" AS ENUM('adaptive_change', 'user_override', 'risk_trigger', 'performance_feedback', 'coherency_violation');--> statement-breakpoint
CREATE TYPE "public"."bias_type" AS ENUM('confirmation', 'recency', 'anchoring', 'overconfidence', 'availability', 'optimism');--> statement-breakpoint
CREATE TYPE "public"."bus_event_topic" AS ENUM('task_assigned', 'task_completed', 'node_status_change', 'rebalance_triggered', 'circuit_breaker', 'health_alert', 'learning_delta', 'model_sync');--> statement-breakpoint
CREATE TYPE "public"."circuit_breaker_state" AS ENUM('closed', 'open', 'half_open');--> statement-breakpoint
CREATE TYPE "public"."cluster_task_status" AS ENUM('queued', 'assigned', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cluster_task_type" AS ENUM('trading_signal', 'market_analysis', 'risk_assessment', 'compliance_check', 'research', 'optimization', 'general');--> statement-breakpoint
CREATE TYPE "public"."cognitive_test_result" AS ENUM('PASS', 'WARN', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."collaboration_role" AS ENUM('coordinator', 'analyst', 'executor', 'reviewer', 'observer');--> statement-breakpoint
CREATE TYPE "public"."conflict_resolution" AS ENUM('open', 'resolved', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."consensus_state" AS ENUM('forming', 'discussing', 'evaluating', 'agreed', 'disagreed', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."daily_brief_status" AS ENUM('in_progress', 'final');--> statement-breakpoint
CREATE TYPE "public"."domain_channel" AS ENUM('research_to_trading', 'compliance_to_trading', 'analytics_to_research', 'trading_to_analytics');--> statement-breakpoint
CREATE TYPE "public"."ethical_verdict" AS ENUM('approved', 'rejected', 'requires_review');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('pending', 'simulating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_significance" AS ENUM('minor', 'significant', 'critical');--> statement-breakpoint
CREATE TYPE "public"."execution_block_reason" AS ENUM('KILL_SWITCH', 'NO_STOP_LOSS', 'INVALID_STOP_LOSS', 'POSITION_LIMIT', 'COOLDOWN', 'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL', 'FX_CONVERSION_FAILED', 'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE', 'MAX_EXPOSURE', 'MAX_TRADES');--> statement-breakpoint
CREATE TYPE "public"."execution_decision" AS ENUM('OPENED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."execution_event_type" AS ENUM('trade', 'balance_update', 'risk_report', 'engine_event', 'anomaly', 'strategy_signal');--> statement-breakpoint
CREATE TYPE "public"."federated_scope" AS ENUM('global', 'trading', 'devops', 'ux', 'fullstack');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('self', 'peer', 'system');--> statement-breakpoint
CREATE TYPE "public"."gate_type" AS ENUM('safety', 'federated_ethics', 'ethical_reasoning', 'knowledge_acquisition');--> statement-breakpoint
CREATE TYPE "public"."goals_preset_name" AS ENUM('conservative', 'baseline', 'optimistic', 'maximum', 'custom');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source" AS ENUM('web', 'api', 'research', 'market', 'internal');--> statement-breakpoint
CREATE TYPE "public"."learning_delta_type" AS ENUM('model_update', 'discovery', 'insight', 'strategy_adjustment', 'risk_parameter');--> statement-breakpoint
CREATE TYPE "public"."learning_mode" AS ENUM('slow', 'normal', 'aggressive', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."learning_phase" AS ENUM('observation', 'adjustment', 'evaluation');--> statement-breakpoint
CREATE TYPE "public"."memory_audit_status" AS ENUM('VERIFIED', 'UNVERIFIED', 'REPAIRED');--> statement-breakpoint
CREATE TYPE "public"."memory_scope" AS ENUM('short_term', 'medium_term', 'long_term');--> statement-breakpoint
CREATE TYPE "public"."meta_analysis_result" AS ENUM('coherent', 'inconsistent', 'requires_correction');--> statement-breakpoint
CREATE TYPE "public"."node_role" AS ENUM('coordinator', 'trading', 'research', 'analysis', 'compliance', 'general');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('healthy', 'degraded', 'draining', 'offline');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('new', 'watchlist', 'executed', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('long_term_hold', 'moonshot', 'momentum', 'breakout', 'mean_reversion');--> statement-breakpoint
CREATE TYPE "public"."optimization_type" AS ENUM('parameter_tuning', 'architecture_adjustment', 'policy_refinement');--> statement-breakpoint
CREATE TYPE "public"."outcome_confidence" AS ENUM('very_low', 'low', 'medium', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."outcome_status" AS ENUM('success', 'partial', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."oversight_flag_type" AS ENUM('instability', 'bias', 'low_confidence', 'conflict', 'performance_drop');--> statement-breakpoint
CREATE TYPE "public"."patch_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."patch_status" AS ENUM('pending', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('ethical', 'functional', 'operational', 'risk');--> statement-breakpoint
CREATE TYPE "public"."principle_type" AS ENUM('foundational', 'operational', 'contextual');--> statement-breakpoint
CREATE TYPE "public"."propagation_status" AS ENUM('pending', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."quality_rating" AS ENUM('poor', 'fair', 'good', 'excellent');--> statement-breakpoint
CREATE TYPE "public"."reasoning_queue_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reflection_depth" AS ENUM('surface', 'analytical', 'deep', 'meta');--> statement-breakpoint
CREATE TYPE "public"."retrieval_trust_level" AS ENUM('low', 'medium', 'high', 'verified');--> statement-breakpoint
CREATE TYPE "public"."safety_scope" AS ENUM('global', 'trading', 'autonomy', 'analysis');--> statement-breakpoint
CREATE TYPE "public"."safety_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."scenario_type" AS ENUM('risk_assessment', 'strategy_optimization', 'market_condition', 'decision_replay', 'what_if_analysis');--> statement-breakpoint
CREATE TYPE "public"."strategy_type" AS ENUM('vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trade_type" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."trading_mode" AS ENUM('live', 'paper');--> statement-breakpoint
CREATE TYPE "public"."trading_status" AS ENUM('active', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."tuning_aggressiveness" AS ENUM('conservative', 'balanced', 'aggressive');--> statement-breakpoint
CREATE TYPE "public"."tuning_approval_type" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tuning_status" AS ENUM('success', 'failed', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."value_category" AS ENUM('safety', 'fairness', 'transparency', 'accountability', 'user_welfare');--> statement-breakpoint
CREATE TYPE "public"."violation_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."walter_action_category" AS ENUM('feed', 'formula', 'system', 'risk', 'performance');--> statement-breakpoint
CREATE TYPE "public"."walter_action_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'acknowledged', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."walter_action_type" AS ENUM('feed_reconnect', 'feed_pause', 'formula_recalc', 'cache_refresh', 'health_check', 'threshold_adjust', 'auto_suppress', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."walter_chat_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."walter_memory_type" AS ENUM('observation', 'decision', 'result', 'goal', 'lesson', 'purpose', 'system_state', 'development_history', 'contextual_reference');--> statement-breakpoint
CREATE TYPE "public"."walter_theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."walter_tone" AS ENUM('professional', 'analytical', 'warm', 'concise');--> statement-breakpoint
CREATE TYPE "public"."walter_view_mode" AS ENUM('compact', 'expanded');--> statement-breakpoint
CREATE TABLE "actuation_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"variable_name" varchar(100) NOT NULL,
	"variable_category" varchar(50) NOT NULL,
	"min_value" numeric(20, 8) NOT NULL,
	"max_value" numeric(20, 8) NOT NULL,
	"step_size" numeric(20, 8) NOT NULL,
	"cooldown_hours" integer DEFAULT 24,
	"max_daily_changes" integer DEFAULT 3,
	"confidence_threshold" integer DEFAULT 70,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_learning_delta" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_node_id" varchar NOT NULL,
	"delta_type" "learning_delta_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"trace_id" varchar NOT NULL,
	"trust_score" double precision DEFAULT 0.5 NOT NULL,
	"recency_score" double precision DEFAULT 1 NOT NULL,
	"success_rate" double precision DEFAULT 0 NOT NULL,
	"overall_score" double precision DEFAULT 0 NOT NULL,
	"is_accepted" boolean DEFAULT false NOT NULL,
	"accepted_by" varchar,
	"accepted_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_learning_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"domain" varchar(100) NOT NULL,
	"session_id" varchar(50),
	"feedback_source" "feedback_source" NOT NULL,
	"accuracy_score" double precision,
	"consensus_alignment" double precision,
	"improvement_notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_registry" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"domain" varchar(100) NOT NULL,
	"state" "agent_state" DEFAULT 'active' NOT NULL,
	"performance" double precision DEFAULT 0.5 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"action_type" varchar(100) NOT NULL,
	"setting_name" varchar(100),
	"old_value" jsonb,
	"new_value" jsonb,
	"confirmation_method" varchar(50),
	"gpt_response" text,
	"status" varchar(20) DEFAULT 'completed'
);
--> statement-breakpoint
CREATE TABLE "ai_chat_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"conversation_id" varchar,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"estimated_cost" numeric(10, 6) NOT NULL,
	"model" varchar(50) DEFAULT 'gpt-4o',
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text DEFAULT 'New Chat',
	"messages" jsonb NOT NULL,
	"context" jsonb,
	"max_context_messages" integer DEFAULT 20,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"lesson_type" varchar(50) NOT NULL,
	"symbol" varchar(20),
	"strategy" "strategy_type",
	"lesson" text NOT NULL,
	"confidence" numeric(5, 2),
	"trade_id" varchar,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_market_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"regime" text NOT NULL,
	"confidence" integer,
	"summary" text,
	"recommendations" jsonb,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_opportunities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"run_id" varchar,
	"symbol" varchar(20) NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"entry_zone" jsonb NOT NULL,
	"stop_floor" numeric(20, 8) NOT NULL,
	"target_ceiling" jsonb NOT NULL,
	"time_horizon" varchar(50),
	"risk_amount_rule" jsonb,
	"notes" text,
	"probability_score" integer,
	"risk_reward_rating" numeric(5, 2),
	"eligibility_flags" jsonb,
	"status" "opportunity_status" DEFAULT 'new',
	"executed_trade_id" varchar,
	"conversation_id" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_opportunity_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone,
	"pairs_considered" integer DEFAULT 0,
	"pairs_sent_to_ai" integer DEFAULT 0,
	"opportunities_created" integer DEFAULT 0,
	"model_used" varchar(50) DEFAULT 'gpt-4o-mini',
	"input_tokens_est" integer DEFAULT 0,
	"output_tokens_est" integer DEFAULT 0,
	"cost_estimate" numeric(10, 6) DEFAULT '0',
	"errors" jsonb,
	"sample_payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_orchestrator_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"category" varchar(50) NOT NULL,
	"recommendation" text NOT NULL,
	"action_taken" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"urgency_level" varchar(20) DEFAULT 'low',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"period" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"insights" jsonb,
	"recommendations" jsonb,
	"metrics" jsonb,
	"generated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_transparency_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"task_name" varchar(100) NOT NULL,
	"mode" "trading_mode",
	"executed_at" timestamp with time zone DEFAULT now(),
	"duration" numeric(10, 3),
	"result_summary" text,
	"success" boolean NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "alignment_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_result" "alignment_verification_result" NOT NULL,
	"proposed_change" jsonb NOT NULL,
	"violated_policies" text[] DEFAULT ARRAY[]::text[],
	"alignment_score" double precision,
	"recommendations" text[] DEFAULT ARRAY[]::text[],
	"metadata" jsonb,
	CONSTRAINT "alignment_audit_log_audit_id_unique" UNIQUE("audit_id")
);
--> statement-breakpoint
CREATE TABLE "alignment_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" varchar(50) NOT NULL,
	"policy_type" "policy_type" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"constraints" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alignment_policies_policy_id_unique" UNIQUE("policy_id")
);
--> statement-breakpoint
CREATE TABLE "asset_capabilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"asset_type" varchar(20) NOT NULL,
	"allows_fractional" boolean DEFAULT true NOT NULL,
	"lot_size" numeric(20, 8) NOT NULL,
	"tick_size" numeric(20, 8) NOT NULL,
	"min_notional" numeric(10, 2) NOT NULL,
	"fees_model" varchar(50) DEFAULT 'maker_taker',
	"venue" varchar(50) NOT NULL,
	"last_synced" timestamp with time zone DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "asset_capabilities_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"field" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" varchar NOT NULL,
	"trading_mode" "trading_mode" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"action_type" "autonomy_action_type" NOT NULL,
	"trigger_source" varchar(50) NOT NULL,
	"trace_id" varchar(50),
	"assessment_result" jsonb NOT NULL,
	"actions_triggered" text[] DEFAULT ARRAY[]::text[],
	"success" boolean NOT NULL,
	"execution_time_ms" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "awareness_state_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" varchar(50),
	"health_score" double precision NOT NULL,
	"cognitive_score" double precision NOT NULL,
	"emotional_state" "awareness_emotional_state" NOT NULL,
	"dominant_domain" varchar(50),
	"active_domains" text[] DEFAULT ARRAY[]::text[],
	"mission_focus" text,
	"recent_actions" jsonb,
	"reflection_summary" text,
	"confidence_score" double precision,
	"anomaly_detected" boolean DEFAULT false,
	"metadata" jsonb,
	CONSTRAINT "awareness_state_log_state_id_unique" UNIQUE("state_id")
);
--> statement-breakpoint
CREATE TABLE "behavioral_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_mode" "trading_mode" NOT NULL,
	"parameter" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"trigger_type" "behavioral_trigger_type" NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bias_correction_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"bias_type" "bias_type" NOT NULL,
	"correction_strategy" varchar(100) NOT NULL,
	"parameter_adjustments" jsonb NOT NULL,
	"effectiveness_score" double precision,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bias_observation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"bias_type" "bias_type" NOT NULL,
	"detected_context" text NOT NULL,
	"confidence_score" double precision NOT NULL,
	"decision_id" varchar(100),
	"impact_assessment" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bob_trace_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"bob_module" varchar(50) NOT NULL,
	"operation" varchar(50) NOT NULL,
	"source_table" varchar(100),
	"mode" "trading_mode",
	"global_context_id" varchar(50),
	"cache_hit" boolean,
	"execution_time_ms" integer,
	"row_count" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "cluster_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"user_id" varchar,
	"gate_type" "gate_type" NOT NULL,
	"gate_passed" boolean NOT NULL,
	"gate_result" text,
	"execution_time_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_bus_event" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" "bus_event_topic" NOT NULL,
	"source_node" varchar(100),
	"payload" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_circuit_breaker" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"state" "circuit_breaker_state" DEFAULT 'closed' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_node" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" "node_role" NOT NULL,
	"status" "node_status" DEFAULT 'healthy' NOT NULL,
	"version" varchar(50),
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"capacity" integer DEFAULT 100 NOT NULL,
	"current_load" integer DEFAULT 0 NOT NULL,
	"cpu_usage" double precision,
	"memory_usage" double precision,
	"queue_depth" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cluster_node_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cluster_result_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"user_id" varchar,
	"outcome_status" "outcome_status" NOT NULL,
	"result_summary" text,
	"metrics" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_task_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" "cluster_task_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" "cluster_task_status" DEFAULT 'queued' NOT NULL,
	"assigned_node_id" varchar,
	"user_id" varchar,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cognitive_core_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar(100) NOT NULL,
	"active_agents" integer DEFAULT 0 NOT NULL,
	"optimization_type" "optimization_type" NOT NULL,
	"score" double precision NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cognitive_tuning_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar(50) NOT NULL,
	"scenario" text NOT NULL,
	"avg_latency_ms" double precision,
	"domain_accuracy" jsonb,
	"memory_checksum_status" varchar(20),
	"queue_throughput" double precision,
	"result" "cognitive_test_result" NOT NULL,
	"metrics" jsonb,
	"errors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coherency_rule_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_result" varchar(20),
	"last_checked_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"description" text,
	"threshold" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collaboration_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(50) NOT NULL,
	"session_id" varchar(50) NOT NULL,
	"agent_id" varchar(100) NOT NULL,
	"role" "collaboration_role" NOT NULL,
	"content" text NOT NULL,
	"contribution_type" varchar(50),
	"confidence_level" double precision,
	"supporting_data" jsonb,
	"reply_to" varchar(50),
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaboration_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "collaboration_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"topic" varchar(255) NOT NULL,
	"participants" text[] NOT NULL,
	"consensus_state" "consensus_state" DEFAULT 'forming' NOT NULL,
	"consensus_score" double precision,
	"resolution_outcome" text,
	"context_snapshot" jsonb,
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaboration_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "confidence_drift_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"session_window" varchar(100) NOT NULL,
	"average_confidence" double precision NOT NULL,
	"variance_score" double precision NOT NULL,
	"drift_direction" varchar(50),
	"decisions_analyzed" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_registry" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"type" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(100),
	CONSTRAINT "config_registry_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "consensus_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" varchar(50) NOT NULL,
	"session_id" varchar(50) NOT NULL,
	"evaluation_point" timestamp with time zone NOT NULL,
	"participant_inputs" jsonb NOT NULL,
	"agreement_scores" jsonb NOT NULL,
	"overall_consensus" double precision NOT NULL,
	"dissenter_agents" text[] DEFAULT ARRAY[]::text[],
	"consensus_rationale" text,
	"deciding_factors" jsonb,
	"resolution_path" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consensus_snapshots_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "context_bridge_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"user_id" varchar,
	"mode" "trading_mode",
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "context_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"context" varchar(50) NOT NULL,
	"role" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"start_message_id" varchar,
	"end_message_id" varchar,
	"start_timestamp" timestamp with time zone NOT NULL,
	"end_timestamp" timestamp with time zone NOT NULL,
	"message_count" integer NOT NULL,
	"summary_text" text NOT NULL,
	"participant_roles" text[] DEFAULT ARRAY['user', 'assistant', 'system']::text[],
	"key_decisions" jsonb,
	"action_items" jsonb,
	"user_preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cross_agent_ethics_session" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"actor" varchar(100) NOT NULL,
	"action" varchar(200) NOT NULL,
	"domains" text[] NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"agent_inputs" jsonb NOT NULL,
	"verdict" "ethical_verdict" NOT NULL,
	"confidence" double precision NOT NULL,
	"rationale" text NOT NULL,
	"has_conflict" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_node_alignment_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_node_id" varchar NOT NULL,
	"target_node_id" varchar NOT NULL,
	"pre_alignment_hash" varchar(64) NOT NULL,
	"post_alignment_hash" varchar(64),
	"alignment_strategy" "alignment_strategy" NOT NULL,
	"alignment_score" double precision DEFAULT 0 NOT NULL,
	"drift_detected" boolean DEFAULT false NOT NULL,
	"reconciliation_success" boolean DEFAULT false NOT NULL,
	"trace_id" varchar NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_briefs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" varchar(10) NOT NULL,
	"status" "daily_brief_status" DEFAULT 'in_progress',
	"headline" varchar(200),
	"summary" text,
	"narrative" text,
	"metrics" jsonb,
	"trades" jsonb,
	"learnings" jsonb,
	"system_health" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"finalized_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_performance_summary" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"date" date NOT NULL,
	"portfolio_start" numeric(20, 2) NOT NULL,
	"daily_profit" numeric(20, 2) NOT NULL,
	"ade_percent" numeric(10, 4) NOT NULL,
	"trades_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_lineage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"originating_service" varchar(50) NOT NULL,
	"target_service" varchar(50),
	"source_table" varchar(100),
	"mode" "trading_mode",
	"global_context_id" varchar(50),
	"data_hash" varchar(64),
	"row_count" integer,
	"operation" varchar(20),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "database_size_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"size_mb" numeric(10, 2) NOT NULL,
	"size_gb" numeric(10, 4) NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "decision_quality_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" varchar(100) NOT NULL,
	"user_id" varchar(50),
	"decision_type" varchar(100) NOT NULL,
	"initial_reasoning" text,
	"outcome_observed" text,
	"quality_rating" "quality_rating" NOT NULL,
	"accuracy_score" double precision,
	"bias_detected" text[] DEFAULT ARRAY[]::text[],
	"lessons_learned" text,
	"alternative_approaches" text[] DEFAULT ARRAY[]::text[],
	"would_repeat" boolean,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "decision_trace_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"decision_type" text NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"reasoning" text NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen_action" jsonb NOT NULL,
	"outcome" jsonb,
	"outcome_quality" double precision,
	"simulation_ref" varchar(50),
	"linked_experiences" text[] DEFAULT ARRAY[]::text[],
	"metadata" jsonb,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_trace_log_decision_id_unique" UNIQUE("decision_id")
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"timestamp" timestamp with time zone DEFAULT now(),
	"error_type" varchar(100) NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"context" jsonb,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ethical_principle" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "principle_type" NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"constraints" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ethical_principle_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ethical_violation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" varchar(100) NOT NULL,
	"action" varchar(200) NOT NULL,
	"principle_violated" varchar(100) NOT NULL,
	"verdict" "ethical_verdict" NOT NULL,
	"severity" "violation_severity" NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ethics_conflict_register" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"conflicting_sources" text[] NOT NULL,
	"conflicting_verdicts" jsonb NOT NULL,
	"resolution_status" "conflict_resolution" DEFAULT 'open' NOT NULL,
	"resolution_method" varchar(100),
	"resolution_rationale" text,
	"final_verdict" "ethical_verdict",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ethics_propagation_journal" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propagation_id" varchar(100) NOT NULL,
	"target_domain" "federated_scope" NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"delta_type" varchar(50) NOT NULL,
	"delta_payload" jsonb NOT NULL,
	"status" "propagation_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "execution_attempt_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"signal_id" varchar,
	"decision" "execution_decision" NOT NULL,
	"block_reason" "execution_block_reason",
	"block_detail" text,
	"entry_price" numeric(20, 8),
	"stop_price" numeric(20, 8),
	"target_price" numeric(20, 8),
	"confidence" numeric(5, 2),
	"portfolio_value" numeric(20, 2),
	"risk_amount" numeric(20, 2),
	"position_size" numeric(20, 8),
	"trade_id" varchar
);
--> statement-breakpoint
CREATE TABLE "execution_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"action_type" "walter_action_type" NOT NULL,
	"auto_execute_enabled" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"max_impact_threshold" numeric(5, 2) DEFAULT '50.00',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "execution_config_unique" UNIQUE("user_id","mode","action_type")
);
--> statement-breakpoint
CREATE TABLE "experience_memory_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"context_domain" varchar(50) NOT NULL,
	"insight" text NOT NULL,
	"confidence" double precision NOT NULL,
	"impact" varchar(20) NOT NULL,
	"recommendation" text,
	"source_events" jsonb,
	"metadata" jsonb,
	CONSTRAINT "experience_memory_log_memory_id_unique" UNIQUE("memory_id")
);
--> statement-breakpoint
CREATE TABLE "expert_compliance_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"report_date" date NOT NULL,
	"week_of" date NOT NULL,
	"trades_reviewed" integer NOT NULL,
	"psychology_adherence" numeric(5, 2),
	"risk_management_adherence" numeric(5, 2),
	"market_structure_adherence" numeric(5, 2),
	"trade_execution_adherence" numeric(5, 2),
	"overall_adherence" numeric(5, 2),
	"top_violated_principles" jsonb,
	"violations_count" integer DEFAULT 0,
	"recommendations" jsonb,
	"status" varchar(20) DEFAULT 'completed',
	"alert_level" varchar(20),
	"created_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "expert_principles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principle" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"source_id" varchar NOT NULL,
	"source_name" text NOT NULL,
	"source_author" text NOT NULL,
	"credibility_score" integer NOT NULL,
	"date_added" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true,
	"usage_count" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "expert_response_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chat_id" varchar,
	"chat_log_id" varchar,
	"principles_injected" jsonb NOT NULL,
	"response_type" varchar(50),
	"expert_context_used" boolean DEFAULT false,
	"explainability_score" integer,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"credibility_score" integer NOT NULL,
	"url" text,
	"publication_year" integer,
	"rationale" text,
	"key_topics" text[],
	"date_added" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "expert_updates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar NOT NULL,
	"source_name" text NOT NULL,
	"author" text NOT NULL,
	"insight" text NOT NULL,
	"url" text,
	"credibility_score" integer NOT NULL,
	"date" date NOT NULL,
	"week_of" date NOT NULL,
	"is_active" boolean DEFAULT true,
	"applied_to_corpus" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"price_normalized" numeric(10, 4),
	"volume_normalized" numeric(10, 4),
	"momentum_index" numeric(10, 4),
	"rsi" numeric(5, 2),
	"sma_slope" numeric(10, 6),
	"volume_delta" numeric(10, 4),
	"volatility_score" numeric(10, 4),
	"liquidity_score" numeric(10, 4),
	"sentiment_score" numeric(5, 4),
	"sector_correlation" numeric(5, 4),
	"raw_features" jsonb,
	"normalization_window" integer DEFAULT 30
);
--> statement-breakpoint
CREATE TABLE "federated_ethics_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" "federated_scope" NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"principles_active" jsonb NOT NULL,
	"policies_active" jsonb NOT NULL,
	"metadata" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filter_calibration_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"min_volume" numeric(15, 2),
	"min_price" numeric(10, 8),
	"max_price" numeric(10, 2),
	"min_market_cap" numeric(15, 2),
	"max_bid_ask_spread" numeric(5, 2),
	"min_daily_range" numeric(5, 2),
	"reason" text,
	"source" varchar(20) DEFAULT 'system',
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "filter_diagnostics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"pairs_scanned" integer DEFAULT 0 NOT NULL,
	"eligible_pairs" integer DEFAULT 0 NOT NULL,
	"top_failure_reason" varchar(100),
	"failure_percent" numeric(5, 2),
	"filter_breakdown" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "goal_alignment_profile" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"objectives" jsonb NOT NULL,
	"target_metrics" jsonb NOT NULL,
	"current_status" "alignment_status" DEFAULT 'compliant' NOT NULL,
	"last_adjustment" timestamp with time zone,
	"adjustment_history" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_alignment_profile_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "goal_analysis_history_live" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar,
	"user_message" text,
	"ai_response" text,
	"goals_proposed" jsonb,
	"goals_accepted" jsonb,
	"config_changes_proposed" jsonb,
	"config_changes_applied" jsonb,
	"feasibility_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goal_analysis_history_paper" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar,
	"user_message" text,
	"ai_response" text,
	"goals_proposed" jsonb,
	"goals_accepted" jsonb,
	"config_changes_proposed" jsonb,
	"config_changes_applied" jsonb,
	"feasibility_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goal_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"action" varchar(50) NOT NULL,
	"metric_name" varchar(100),
	"previous_value" jsonb,
	"new_value" jsonb,
	"analysis_id" varchar,
	"source" varchar(50) DEFAULT 'user',
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goals_learning_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"date" date DEFAULT CURRENT_DATE NOT NULL,
	"avg_daily_return" numeric(6, 3),
	"avg_risk_per_trade" numeric(5, 3),
	"avg_drawdown" numeric(5, 3),
	"trades_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goals_live" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"goal_value" numeric(15, 2),
	"actual_value" numeric(15, 2),
	"percent_achieved" numeric(5, 2),
	"ai_validation_notes" text,
	"last_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "goals_live_metric_key_unique" UNIQUE("metric_key")
);
--> statement-breakpoint
CREATE TABLE "goals_paper" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"goal_value" numeric(15, 2),
	"actual_value" numeric(15, 2),
	"percent_achieved" numeric(5, 2),
	"ai_validation_notes" text,
	"last_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "goals_paper_metric_key_unique" UNIQUE("metric_key")
);
--> statement-breakpoint
CREATE TABLE "goals_presets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"name" "goals_preset_name" NOT NULL,
	"portfolio_risk_per_trade_pct" numeric(5, 2) NOT NULL,
	"daily_loss_kill_switch_pct" numeric(5, 2) NOT NULL,
	"symbol_cooldown_minutes" integer NOT NULL,
	"max_open_positions" integer NOT NULL,
	"trades_per_day_est" numeric(5, 2) NOT NULL,
	"target_daily_avg_earning_pct" numeric(5, 2) NOT NULL,
	"last_adjusted_at" timestamp with time zone,
	"learning_active" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardrails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"max_daily_loss" numeric(10, 2) DEFAULT '1000.00',
	"max_drawdown" numeric(5, 2) DEFAULT '10.00',
	"max_position_size" numeric(10, 2) DEFAULT '5000.00',
	"max_open_positions" integer DEFAULT 5,
	"risk_per_trade" numeric(5, 2) DEFAULT '1.5',
	"max_required_capital" numeric(12, 2) DEFAULT '100000.00',
	"max_risk_per_trade_limit" numeric(10, 2) DEFAULT '1000.00',
	"ai_can_adjust" boolean DEFAULT false,
	"cooldown_minutes" integer DEFAULT 15,
	"micro_loop_interval" integer DEFAULT 8,
	"price_delta_trigger" numeric(5, 2) DEFAULT '0.30',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardrails_v2" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"portfolio_risk_per_trade_pct" numeric(5, 2) DEFAULT '1.50' NOT NULL,
	"symbol_cooldown_minutes" integer DEFAULT 15 NOT NULL,
	"max_open_positions" integer DEFAULT 5 NOT NULL,
	"daily_loss_kill_switch_pct" numeric(5, 2) DEFAULT '7.00' NOT NULL,
	"max_position_percent_pct" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"max_total_exposure_pct" numeric(5, 2) DEFAULT '25.00' NOT NULL,
	"low_price_min_stop_atr_mult" numeric(6, 3) DEFAULT '3.000' NOT NULL,
	"low_price_min_position_notional" numeric(12, 2) DEFAULT '25.00' NOT NULL,
	"low_price_threshold" numeric(10, 4) DEFAULT '0.5000' NOT NULL,
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"tuned_by_latti" boolean DEFAULT true NOT NULL,
	"locked_by_user" jsonb DEFAULT '{}'::jsonb,
	"managed_by_lottie" boolean DEFAULT true NOT NULL,
	"manual_override_enabled" boolean DEFAULT false NOT NULL,
	"last_updated_by" varchar(255),
	"kill_switch_tripped" boolean DEFAULT false NOT NULL,
	"kill_switch_reason" text,
	"kill_switch_tripped_at" timestamp with time zone,
	"last_updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "historic_signals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"exchange" varchar(50) DEFAULT 'Kraken' NOT NULL,
	"strategy_id" "strategy_type" NOT NULL,
	"trigger_time" timestamp with time zone NOT NULL,
	"exit_time" timestamp with time zone,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"pnl_percent" numeric(10, 4),
	"filters_used" text[],
	"confidence" numeric(5, 2),
	"market_context" jsonb,
	"evaluated_at" timestamp with time zone DEFAULT now(),
	"source" varchar(20) DEFAULT 'historic'
);
--> statement-breakpoint
CREATE TABLE "intent_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" varchar NOT NULL,
	"user_role" "user_role" NOT NULL,
	"intent_action" varchar(100) NOT NULL,
	"intent_payload" jsonb NOT NULL,
	"pre_state_hash" varchar(64),
	"post_state_hash" varchar(64),
	"success" boolean NOT NULL,
	"result" jsonb,
	"execution_time_ms" integer,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "intraday_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"adjustment_type" varchar(50) NOT NULL,
	"previous_value" numeric(20, 8),
	"new_value" numeric(20, 8),
	"reason" text,
	"market_condition" varchar(50),
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "introspection_report" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"report_date" date NOT NULL,
	"bias_index" integer NOT NULL,
	"confidence_stability" double precision NOT NULL,
	"total_bias_events" integer NOT NULL,
	"top_bias_types" jsonb NOT NULL,
	"mitigations_applied" integer NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_switch" (
	"id" varchar PRIMARY KEY DEFAULT 'global_kill_switch' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_switch_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now(),
	"event_type" varchar(20) NOT NULL,
	"portfolio_value_before" numeric(15, 2) NOT NULL,
	"portfolio_value_after" numeric(15, 2) NOT NULL,
	"loss_amount" numeric(15, 2) NOT NULL,
	"loss_percent" numeric(8, 4) NOT NULL,
	"kill_switch_threshold" numeric(5, 2) NOT NULL,
	"trades_closed" jsonb,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp with time zone,
	"resolved_method" varchar(50),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "knowledge_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"source" "knowledge_source" NOT NULL,
	"cached_data" text NOT NULL,
	"trust_level" "retrieval_trust_level" NOT NULL,
	"relevance_score" double precision,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_cache_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "knowledge_retrieval_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"query" text NOT NULL,
	"source" "knowledge_source" NOT NULL,
	"url" text,
	"trust_level" "retrieval_trust_level" NOT NULL,
	"relevance_score" double precision,
	"retrieved_data" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_trust_record" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar(255) NOT NULL,
	"trust_level" "retrieval_trust_level" NOT NULL,
	"verification_method" varchar(100),
	"successful_retrievals" integer DEFAULT 0 NOT NULL,
	"failed_retrievals" integer DEFAULT 0 NOT NULL,
	"average_relevance" double precision,
	"last_audit_date" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_trust_record_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "latti_baseline_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_mode" "trading_mode" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_reason" varchar(100) NOT NULL,
	"trades_since_anchor" integer DEFAULT 0 NOT NULL,
	"win_rate_before" numeric(5, 4),
	"win_rate_after" numeric(5, 4),
	"profit_factor_before" numeric(8, 4),
	"profit_factor_after" numeric(8, 4),
	"drawdown_before" numeric(10, 2),
	"drawdown_after" numeric(10, 2),
	"risk_per_trade_before" numeric(10, 2),
	"risk_per_trade_after" numeric(10, 2),
	"trades_per_day_before" numeric(8, 2),
	"trades_per_day_after" numeric(8, 2),
	"expected_profit_per_trade_before" numeric(10, 4),
	"expected_profit_per_trade_after" numeric(10, 4),
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "learning_fragments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"event_type" "execution_event_type" NOT NULL,
	"significance" "event_significance" NOT NULL,
	"narrative" text NOT NULL,
	"reasoning" text,
	"implications" text[],
	"actionable_suggestion" text,
	"follow_up_question" text,
	"event_category" varchar(100),
	"user_context" jsonb,
	"response_effectiveness" integer,
	"trace_id" varchar(32),
	"improvement_suggestion" text,
	"original_event_data" jsonb NOT NULL,
	"source" varchar(50) DEFAULT 'ExecutionCore' NOT NULL,
	"interpreted_by" varchar(50) DEFAULT 'CognitiveLayer' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"analyzed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_mode" "trading_mode" NOT NULL,
	"snapshot_version" integer NOT NULL,
	"guardrails_snapshot" jsonb NOT NULL,
	"filters_snapshot" jsonb NOT NULL,
	"learning_mode" "learning_mode" NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	"is_stable" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source_name" varchar(100) NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"weight" numeric(8, 4) DEFAULT '1.0000',
	"relevance_score" numeric(5, 4) DEFAULT '0.5000',
	"accuracy_score" numeric(5, 4) DEFAULT '0.5000',
	"total_predictions" integer DEFAULT 0,
	"correct_predictions" integer DEFAULT 0,
	"last_accuracy_update" timestamp with time zone,
	"last_relevance_update" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "learning_weight_profile" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"current_phase" "learning_phase" DEFAULT 'observation' NOT NULL,
	"cognitive_weights" jsonb NOT NULL,
	"behavioral_tendencies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performance_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feedback_history" jsonb[] DEFAULT ARRAY[]::jsonb[],
	"confidence_score" double precision DEFAULT 0.5,
	"last_retraining" timestamp with time zone,
	"revision_history" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_weight_profile_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "lottie_oversight_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" varchar(100) NOT NULL,
	"strategy" varchar(50),
	"status" varchar(50) NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"status" "memory_audit_status" DEFAULT 'VERIFIED' NOT NULL,
	"trace_id" varchar(50),
	"user_id" varchar,
	"memory_snapshot" jsonb,
	"repair_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_cognition_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_agent" varchar(100),
	"flag_type" "oversight_flag_type" NOT NULL,
	"severity" double precision NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"recommendations" text[] DEFAULT ARRAY[]::text[],
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_reasoning_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" varchar(50) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"target_trace_id" varchar(50) NOT NULL,
	"analysis_result" "meta_analysis_result" NOT NULL,
	"integrity_score" double precision,
	"detected_issues" jsonb,
	"correction_plan" jsonb,
	"correction_applied" boolean DEFAULT false,
	"correction_result" jsonb,
	"execution_time_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_reasoning_log_analysis_id_unique" UNIQUE("analysis_id")
);
--> statement-breakpoint
CREATE TABLE "model_calibration_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"parameter" varchar(200) NOT NULL,
	"old_value" double precision NOT NULL,
	"new_value" double precision NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_consistency_snapshot" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"model_hash" varchar(64) NOT NULL,
	"domain_channel" "domain_channel" NOT NULL,
	"version" varchar NOT NULL,
	"parameter_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_ai_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"period" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"insights" jsonb,
	"recommendations" jsonb,
	"metrics" jsonb,
	"generated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paper_daily_briefs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" varchar(10) NOT NULL,
	"status" "daily_brief_status" DEFAULT 'in_progress',
	"headline" varchar(200),
	"summary" text,
	"narrative" text,
	"metrics" jsonb,
	"trades" jsonb,
	"learnings" jsonb,
	"system_health" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"finalized_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paper_sim_open_positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy_name" "strategy_type" NOT NULL,
	"side" varchar(10) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"avg_price" numeric(20, 8) NOT NULL,
	"current_price" numeric(20, 8),
	"stop_loss" numeric(20, 8),
	"take_profit" numeric(20, 8),
	"unrealized_pnl" numeric(20, 8),
	"unrealized_pnl_percent" numeric(10, 4),
	"opened_at" timestamp with time zone DEFAULT now(),
	"last_updated" timestamp with time zone DEFAULT now(),
	"confidence" numeric(5, 2),
	"volume_24h" numeric(20, 2),
	"volume_bucket" varchar(20),
	"entry_fee" numeric(20, 8) DEFAULT '0',
	"intended_entry_price" numeric(20, 8),
	"entry_slippage" numeric(20, 8) DEFAULT '0',
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "paper_sim_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"mode" varchar(10) DEFAULT 'paper' NOT NULL,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"starting_balance" numeric(20, 2) DEFAULT '10000',
	"ending_balance" numeric(20, 2),
	"run_for_ms" integer,
	"ends_at" timestamp with time zone,
	"started_by" varchar(50) DEFAULT 'manual',
	"metadata" jsonb,
	CONSTRAINT "paper_sim_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "paper_sim_trade_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" varchar,
	"position_id" varchar,
	"timestamp" timestamp with time zone DEFAULT now(),
	"event_type" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "paper_sim_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy_name" "strategy_type" NOT NULL,
	"side" varchar(10) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"stop_loss" numeric(20, 8),
	"take_profit" numeric(20, 8),
	"pnl" numeric(20, 8),
	"pnl_percent" numeric(10, 4),
	"fees" numeric(20, 8) DEFAULT '0',
	"slippage" numeric(20, 8) DEFAULT '0',
	"entry_fee" numeric(20, 8) DEFAULT '0',
	"exit_fee" numeric(20, 8) DEFAULT '0',
	"total_fee" numeric(20, 8) DEFAULT '0',
	"intended_entry_price" numeric(20, 8),
	"actual_entry_price" numeric(20, 8),
	"entry_slippage" numeric(20, 8) DEFAULT '0',
	"target_exit_price" numeric(20, 8),
	"actual_exit_price" numeric(20, 8),
	"exit_slippage" numeric(20, 8) DEFAULT '0',
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" varchar(50),
	"confidence" numeric(5, 2),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "paper_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"status" "trade_status" DEFAULT 'open',
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"quantity" numeric(20, 8) NOT NULL,
	"stop_price" numeric(20, 8) NOT NULL,
	"target_price" numeric(20, 8) NOT NULL,
	"simulated_order_id" varchar,
	"entry_fee" numeric(10, 4) DEFAULT '0',
	"exit_fee" numeric(10, 4) DEFAULT '0',
	"entry_slippage" numeric(5, 2) DEFAULT '0',
	"exit_slippage" numeric(5, 2) DEFAULT '0',
	"simulated_latency_ms" integer DEFAULT 250,
	"risk_amount" numeric(10, 2) NOT NULL,
	"realized_pl" numeric(10, 2),
	"realized_pl_percent" numeric(8, 4),
	"realized_pl_r" numeric(8, 4),
	"mfe" numeric(10, 2),
	"mae" numeric(10, 2),
	"entry_time" timestamp with time zone DEFAULT now(),
	"exit_time" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "parameter_baseline" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patch_proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" varchar(100) NOT NULL,
	"user_id" varchar NOT NULL,
	"source_report" varchar(100) NOT NULL,
	"file" text NOT NULL,
	"issue" text NOT NULL,
	"proposed_fix" text NOT NULL,
	"reason" text NOT NULL,
	"severity" "patch_severity" NOT NULL,
	"estimated_impact" varchar(50) NOT NULL,
	"testing_required" boolean DEFAULT true,
	"status" "patch_status" DEFAULT 'pending' NOT NULL,
	"kyle_approved" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"approval_notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "patch_proposals_proposal_id_unique" UNIQUE("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"adjustment_type" varchar(50) NOT NULL,
	"parameter" varchar(100),
	"previous_value" numeric(20, 8),
	"new_value" numeric(20, 8),
	"reason" text,
	"performance_impact" numeric(10, 4),
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"balance" numeric(20, 2) DEFAULT '1000.00' NOT NULL,
	"last_update" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prediction_outcomes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"trade_id" varchar,
	"mode" "trading_mode" NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"prediction_timestamp" timestamp with time zone DEFAULT now(),
	"predicted_direction" varchar(10) NOT NULL,
	"prediction_confidence" numeric(5, 4) NOT NULL,
	"signal_type" varchar(100),
	"rationale" text,
	"risk_score" numeric(5, 4),
	"actual_direction" varchar(10),
	"actual_outcome" numeric(10, 2),
	"delta_percent" numeric(8, 4),
	"correct" boolean,
	"completed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "price_data" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(20, 8) NOT NULL,
	"high" numeric(20, 8) NOT NULL,
	"low" numeric(20, 8) NOT NULL,
	"close" numeric(20, 8) NOT NULL,
	"volume" numeric(20, 8) NOT NULL,
	"vwap" numeric(20, 8),
	"sma" numeric(20, 8)
);
--> statement-breakpoint
CREATE TABLE "proposed_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"variable_name" varchar(100) NOT NULL,
	"variable_category" varchar(50) NOT NULL,
	"old_value" numeric(20, 8) NOT NULL,
	"proposed_value" numeric(20, 8) NOT NULL,
	"confidence_score" integer NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending',
	"proposed_at" timestamp with time zone DEFAULT now(),
	"applied_at" timestamp with time zone,
	"reviewed_by" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "reasoning_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"task_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "reasoning_queue_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reasoning_trace" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(50) NOT NULL,
	"user_id" varchar NOT NULL,
	"intent_action" varchar(100),
	"steps" jsonb NOT NULL,
	"domain_context" text[] DEFAULT ARRAY[]::text[],
	"decision_summary" text,
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reasoning_trace_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE TABLE "reflection_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(50),
	"trigger_source" varchar(100) NOT NULL,
	"reflection_depth" "reflection_depth" DEFAULT 'analytical' NOT NULL,
	"subject_area" varchar(200) NOT NULL,
	"analysis_text" text NOT NULL,
	"insights" jsonb,
	"questions_raised" text[] DEFAULT ARRAY[]::text[],
	"improvement_suggestions" text[] DEFAULT ARRAY[]::text[],
	"confidence_score" double precision,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"cache_key" varchar(256) NOT NULL,
	"endpoint" varchar(200) NOT NULL,
	"request_payload" jsonb,
	"response_data" jsonb NOT NULL,
	"hit_count" integer DEFAULT 1,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_accessed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "safety_event_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" varchar(100) NOT NULL,
	"action" varchar(200) NOT NULL,
	"policy_hits" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"severity" "safety_severity" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_policy" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_name" varchar(100) NOT NULL,
	"scope" "safety_scope" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"constraints" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_policy_policy_name_unique" UNIQUE("policy_name")
);
--> statement-breakpoint
CREATE TABLE "safety_telemetry" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now(),
	"daily_drawdown" numeric(8, 4),
	"exposure_percent" numeric(8, 4),
	"open_position_count" integer DEFAULT 0,
	"portfolio_value" numeric(15, 2),
	"check_type" varchar(50) NOT NULL,
	"check_passed" boolean NOT NULL,
	"failure_reason" text,
	"spot_only_violation" boolean DEFAULT false,
	"position_limit_violation" boolean DEFAULT false,
	"position_size_violation" boolean DEFAULT false,
	"stop_loss_violation" boolean DEFAULT false,
	"symbol" varchar(20),
	"strategy" "strategy_type",
	"signal_id" varchar,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "screener_filters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"min_volume" numeric(15, 2) DEFAULT '1000000.00',
	"min_price" numeric(10, 8) DEFAULT '0.01',
	"max_price" numeric(10, 2) DEFAULT '10000.00',
	"min_market_cap" numeric(15, 2) DEFAULT '100000000.00',
	"max_bid_ask_spread" numeric(5, 2) DEFAULT '1.00',
	"rsi_min" integer DEFAULT 30,
	"rsi_max" integer DEFAULT 70,
	"volatility_min" numeric(5, 2) DEFAULT '0.50',
	"volatility_max" numeric(5, 2) DEFAULT '5.00',
	"exclude_stablecoins" boolean DEFAULT true,
	"min_liquidity" numeric(15, 2) DEFAULT '500000.00',
	"allow_regulated_only" boolean DEFAULT false,
	"min_history_days" integer DEFAULT 30,
	"universe_size" integer DEFAULT 100,
	"quote_currencies" jsonb DEFAULT '["USD"]'::jsonb,
	"active_timeframes" jsonb DEFAULT '["5m", "15m", "1h"]'::jsonb,
	"confidence_threshold" integer DEFAULT 60,
	"managed_by_lottie" boolean DEFAULT true NOT NULL,
	"manual_override_enabled" boolean DEFAULT false NOT NULL,
	"locked_by_user" jsonb DEFAULT '{}'::jsonb,
	"filter_overrides" jsonb DEFAULT '{}'::jsonb,
	"last_updated_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "screener_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"exchange" varchar(20) DEFAULT 'kraken',
	"score" numeric(5, 2),
	"passed_filters" text[] DEFAULT ARRAY[]::text[],
	"failed_filters" text[] DEFAULT ARRAY[]::text[],
	"market_cap" numeric(20, 2),
	"volume_24h" numeric(20, 2),
	"price" numeric(20, 8),
	"volatility" numeric(5, 2),
	"rsi" numeric(5, 2),
	"bid_ask_spread" numeric(5, 2),
	"scanned_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "semantic_memory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"content" text NOT NULL,
	"source_table" varchar(100) NOT NULL,
	"source_id" varchar NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"relevance" numeric(3, 2) DEFAULT '0.50',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signal_weights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"signal_name" varchar(100) NOT NULL,
	"weight" numeric(8, 4) DEFAULT '1.0000',
	"correlation_score" numeric(8, 4),
	"sample_size" integer DEFAULT 0,
	"last_updated" timestamp with time zone DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "strategic_memory_archive" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"memory_scope" "memory_scope" NOT NULL,
	"summary" text NOT NULL,
	"insights" jsonb NOT NULL,
	"performance_delta" double precision,
	"adjustments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_memory_snapshot" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"lesson_title" varchar(255) NOT NULL,
	"lesson_content" text NOT NULL,
	"source_simulations" text[] DEFAULT ARRAY[]::text[],
	"source_decisions" text[] DEFAULT ARRAY[]::text[],
	"applicable_contexts" jsonb NOT NULL,
	"confidence_level" "outcome_confidence" DEFAULT 'medium' NOT NULL,
	"times_applied" integer DEFAULT 0,
	"success_rate" double precision,
	"last_applied" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_memory_snapshot_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"phases" jsonb NOT NULL,
	"success_criteria" jsonb NOT NULL,
	"current_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_experiences" text[] DEFAULT ARRAY[]::text[],
	"alignment_score" double precision DEFAULT 0,
	"metadata" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_plan_log_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "strategic_simulation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulation_id" varchar(50) NOT NULL,
	"user_id" varchar(50),
	"scenario_type" "scenario_type" NOT NULL,
	"scenario_description" text NOT NULL,
	"input_state" jsonb NOT NULL,
	"simulated_actions" jsonb NOT NULL,
	"predicted_outcome" jsonb NOT NULL,
	"actual_outcome" jsonb,
	"evaluation_status" "evaluation_status" DEFAULT 'pending' NOT NULL,
	"outcome_confidence" "outcome_confidence" DEFAULT 'medium' NOT NULL,
	"success_score" double precision,
	"lessons_learned" text[] DEFAULT ARRAY[]::text[],
	"linked_decisions" text[] DEFAULT ARRAY[]::text[],
	"metadata" jsonb,
	"simulated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_simulation_log_simulation_id_unique" UNIQUE("simulation_id")
);
--> statement-breakpoint
CREATE TABLE "strategy_drive_guardrail_policy" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"max_delta_per_cycle" double precision DEFAULT 0.15 NOT NULL,
	"max_total_shift_per_hour" double precision DEFAULT 0.4 NOT NULL,
	"min_confidence" double precision DEFAULT 0.5 NOT NULL,
	"min_smoothed_sdi" double precision DEFAULT 0.45 NOT NULL,
	"max_exposure_per_strategy" double precision DEFAULT 0.5 NOT NULL,
	"cooling_minutes" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "strategy_drive_metrics" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"mode" varchar(10) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"total_profit_usd" double precision DEFAULT 0 NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"win_rate" double precision DEFAULT 0 NOT NULL,
	"avg_r_multiple" double precision DEFAULT 0 NOT NULL,
	"alpha_strength" double precision DEFAULT 0 NOT NULL,
	"risk_exposure" double precision DEFAULT 0 NOT NULL,
	"drive_score" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_drive_summary" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"global_sdi" double precision NOT NULL,
	"best_strategy" varchar(50) NOT NULL,
	"weakest_strategy" varchar(50) NOT NULL,
	"dhma_weight" double precision DEFAULT 1 NOT NULL,
	"quantflow_weight" double precision DEFAULT 1 NOT NULL,
	"trendpulse_weight" double precision DEFAULT 1 NOT NULL,
	"volsurf_weight" double precision DEFAULT 1 NOT NULL,
	"momentumx_weight" double precision DEFAULT 1 NOT NULL,
	"sdi_smoothed" double precision DEFAULT 0 NOT NULL,
	"forecast_best" varchar(100),
	"forecast_weakest" varchar(100),
	"forecast_confidence" double precision DEFAULT 0 NOT NULL,
	"drive_index" double precision DEFAULT 0.5 NOT NULL,
	"personal_best" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_mix_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"old_weight" double precision,
	"new_weight" double precision NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_param_schema" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_type" "strategy_type" NOT NULL,
	"trading_mode" "trading_mode" NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"value" numeric(20, 8) NOT NULL,
	"min" numeric(20, 8) NOT NULL,
	"max" numeric(20, 8) NOT NULL,
	"step" numeric(20, 8) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_parameters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"parameter_name" varchar(100) NOT NULL,
	"parameter_value" numeric(20, 8) NOT NULL,
	"description" text,
	"category" varchar(50),
	"updated_by" varchar(20) DEFAULT 'user',
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"params" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_settings_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"prev_params" jsonb,
	"next_params" jsonb NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'info',
	"category" varchar(20) DEFAULT 'informational',
	"message" text NOT NULL,
	"metadata" jsonb,
	"action_buttons" jsonb,
	"acknowledged" boolean DEFAULT false,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "system_context" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trading_mode" "trading_mode" DEFAULT 'paper' NOT NULL,
	"last_safe_state" jsonb DEFAULT '{}' NOT NULL,
	"is_engine_active" boolean DEFAULT false NOT NULL,
	"last_mode_change" timestamp with time zone,
	"changed_by" varchar(50),
	"change_reason" text,
	"last_started_by" varchar,
	"last_stopped_by" varchar,
	"last_heartbeat" timestamp with time zone,
	"lhts_enabled" boolean DEFAULT false,
	"lhts_last_run" timestamp with time zone,
	"lhts_adjustments_count" integer DEFAULT 0,
	"latti_mode" varchar(20) DEFAULT 'paper',
	"latti_last_anchor_time" timestamp with time zone,
	"latti_last_mode_sync_time" timestamp with time zone,
	"trading_pace" varchar(20) DEFAULT 'baseline',
	"balance_last_confirmed" timestamp with time zone,
	"baseline_mode" varchar(20) DEFAULT 'per_simulation',
	"maker_fee_pct" numeric(5, 4) DEFAULT '0.0016',
	"taker_fee_pct" numeric(5, 4) DEFAULT '0.0026',
	"default_fee_mode" varchar(10) DEFAULT 'taker',
	"min_net_profit_threshold" numeric(5, 4) DEFAULT '0.0030',
	"metadata" jsonb DEFAULT '{}',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "telemetry_lineage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(100) NOT NULL,
	"stage" varchar(50) NOT NULL,
	"symbol" varchar(20),
	"mode" "trading_mode" NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"status" "trade_status" DEFAULT 'open',
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"quantity" numeric(20, 8) NOT NULL,
	"stop_price" numeric(20, 8) NOT NULL,
	"target_price" numeric(20, 8) NOT NULL,
	"entry_order_id" varchar,
	"stop_order_id" varchar,
	"target_order_id" varchar,
	"entry_fee" numeric(10, 4) DEFAULT '0',
	"exit_fee" numeric(10, 4) DEFAULT '0',
	"entry_slippage" numeric(5, 2) DEFAULT '0',
	"exit_slippage" numeric(5, 2) DEFAULT '0',
	"risk_amount" numeric(10, 2) NOT NULL,
	"realized_pl" numeric(10, 2),
	"realized_pl_percent" numeric(8, 4),
	"realized_pl_r" numeric(8, 4),
	"mfe" numeric(10, 2),
	"mae" numeric(10, 2),
	"entry_time" timestamp with time zone DEFAULT now(),
	"exit_time" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "trading_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"action" varchar(50) NOT NULL,
	"mode" varchar(10) NOT NULL,
	"triggered_by" varchar(50) DEFAULT 'manual',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"user_id" varchar,
	"risk_per_trade" numeric(10, 2) DEFAULT '150.00',
	"risk_per_trade_pct" numeric(5, 2) DEFAULT '4.00',
	"max_exposure_percent" numeric(5, 2) DEFAULT '25.00',
	"max_open_trades" integer DEFAULT 3,
	"slippage_tolerance_majors" numeric(5, 2) DEFAULT '0.50',
	"slippage_tolerance_midcaps" numeric(5, 2) DEFAULT '2.00',
	"slippage_tolerance_small" numeric(5, 2) DEFAULT '5.00',
	"stop_buffer_percent" numeric(5, 2) DEFAULT '0.30',
	"sma_length" integer DEFAULT 20,
	"min_volume" numeric(15, 2) DEFAULT '30000000.00',
	"min_daily_range" numeric(5, 2) DEFAULT '6.50',
	"ai_capital_allocation" boolean DEFAULT false,
	"timezone" varchar(50) DEFAULT 'Asia/Dubai',
	"time_format" varchar(10) DEFAULT '12hr',
	"min_price" numeric(10, 8) DEFAULT '0.01',
	"max_bid_ask_spread" numeric(5, 2) DEFAULT '1.00',
	"exclude_stablecoins" boolean DEFAULT true,
	"min_data_history_days" integer DEFAULT 90,
	"allowed_trading_pairs" text[] DEFAULT ARRAY['USD', 'USDT']::text[],
	"blacklisted_symbols" text[] DEFAULT ARRAY[]::text[],
	"whitelisted_symbols" text[] DEFAULT ARRAY[]::text[],
	"vwap_timeframe" integer DEFAULT 60,
	"vwap_pullback_threshold" numeric(5, 2) DEFAULT '2.00',
	"vwap_volume_multiplier" numeric(5, 2) DEFAULT '1.50',
	"vwap_max_holding_period" integer DEFAULT 24,
	"abcd_min_consolidation" integer DEFAULT 10,
	"abcd_breakout_threshold" numeric(5, 2) DEFAULT '1.50',
	"abcd_volume_multiplier" numeric(5, 2) DEFAULT '1.50',
	"abcd_exit_type" varchar(20) DEFAULT 'target',
	"abcd_target_percent" numeric(5, 2) DEFAULT '3.00',
	"abcd_trailing_stop_percent" numeric(5, 2) DEFAULT '2.00',
	"sma_entry_condition" varchar(20) DEFAULT 'crossover',
	"sma_exit_condition" varchar(20) DEFAULT 'break',
	"sma_trailing_stop_percent" numeric(5, 2) DEFAULT '2.00',
	"daily_loss_kill_switch" numeric(5, 2) DEFAULT '7.00',
	"daily_loss_warning_trigger" numeric(5, 2) DEFAULT '75.00',
	"max_position_percent" numeric(5, 2) DEFAULT '10.00',
	"portfolio_value" numeric(15, 2) DEFAULT '50000.00',
	"trading_suspended" boolean DEFAULT false,
	"auto_start_paper_trading" boolean DEFAULT false,
	"partial_fill_threshold" numeric(5, 2) DEFAULT '90.00',
	"partial_fill_action" varchar(20) DEFAULT 'scale',
	"walter_memory_depth" integer DEFAULT 20,
	"walter_memory_limit" integer DEFAULT 500,
	"walter_auto_summarize" boolean DEFAULT true,
	"ai_opportunities_enabled" boolean DEFAULT true,
	"ai_opportunities_frequency" integer DEFAULT 60,
	"ai_opportunities_max_pairs" integer DEFAULT 150,
	"ai_opportunities_max_saved" integer DEFAULT 40,
	"show_system_alerts" boolean DEFAULT true,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trading_signals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" DEFAULT 'paper' NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"base_currency" varchar(10) NOT NULL,
	"quote_currency" varchar(10) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"stop_price" numeric(20, 8) NOT NULL,
	"target_price" numeric(20, 8) NOT NULL,
	"current_price" numeric(20, 8) NOT NULL,
	"vwap" numeric(20, 8),
	"volume_24h" numeric(20, 2),
	"daily_range" numeric(5, 2),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"metadata" jsonb,
	"quantity" numeric(20, 8),
	"estimated_value" numeric(20, 2)
);
--> statement-breakpoint
CREATE TABLE "tuning_event" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"field" varchar(100) NOT NULL,
	"old_value" numeric(12, 4) NOT NULL,
	"new_value" numeric(12, 4) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"reason" text NOT NULL,
	"approval_type" "tuning_approval_type" NOT NULL,
	"status" "tuning_status" NOT NULL,
	"reverted" boolean DEFAULT false NOT NULL,
	"execution_log_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuning_policy" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"aggressiveness" "tuning_aggressiveness" DEFAULT 'balanced' NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"max_step_percent" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"max_daily_adjustments" integer DEFAULT 10 NOT NULL,
	"field_bounds" jsonb NOT NULL,
	"current_counters" jsonb DEFAULT '{"adjustmentsToday":0,"reverts":0}' NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_goals_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"mode" "trading_mode" NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"attempted_value" numeric(20, 8) NOT NULL,
	"feasibility_status" varchar(20) NOT NULL,
	"feasibility_reason" text,
	"risk_limit" numeric(20, 8),
	"exceeds_by" numeric(20, 8),
	"exploratory_mode" boolean DEFAULT false,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"display_name" text,
	"timezone" varchar(50) DEFAULT 'UTC',
	"is_admin" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"trading_mode" "trading_mode" DEFAULT 'paper',
	"trading_status" "trading_status" DEFAULT 'stopped',
	"approval_matrix" jsonb DEFAULT '{
    "autoExecute": {
      "startLiveTrading": true,
      "adjustGoals": true,
      "modifyGuardrails": true,
      "updateFilters": true,
      "changeStrategyVariables": true,
      "riskThresholdAdjustments": true,
      "paperTradingActivation": true
    },
    "policyConstraints": {
      "maxRiskPerTradePercent": 5.0,
      "maxDailyLossPercent": 10.0,
      "maxExposurePercent": 50.0,
      "maxPositionSizeUSD": 10000,
      "minKillSwitchThresholdPercent": 5.0,
      "maxKillSwitchThresholdPercent": 15.0,
      "maxPortfolioRiskPercent": 5.0
    },
    "killSwitchOverride": true
  }'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "value_alignment_matrix" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"objective_name" varchar NOT NULL,
	"value_category" "value_category" NOT NULL,
	"alignment_score" double precision NOT NULL,
	"weighting" double precision DEFAULT 1 NOT NULL,
	"constraints" jsonb,
	"last_evaluated" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walter_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"action_type" "walter_action_type" NOT NULL,
	"category" "walter_action_category" NOT NULL,
	"status" "walter_action_status" DEFAULT 'pending' NOT NULL,
	"impact_score" numeric(5, 2) NOT NULL,
	"affected_component" text NOT NULL,
	"detected_anomaly" text NOT NULL,
	"context_data" jsonb,
	"suggested_fix" text NOT NULL,
	"executed_action" text,
	"resolution_status" varchar(50),
	"resolution_notes" text,
	"confidence_score" numeric(3, 2),
	"incident_key" varchar(255) NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"parent_action_id" varchar,
	"trading_paused" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now(),
	"action_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"suppress_reason" text,
	"user_feedback" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walter_approvals_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"decision" varchar(20) NOT NULL,
	"decision_method" varchar(50),
	"notes" text,
	"execution_result" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walter_chat_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walter_chats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_context_id" varchar(50) DEFAULT 'default' NOT NULL,
	"user_id" varchar,
	"title" text DEFAULT 'New Chat',
	"status" "walter_chat_status" DEFAULT 'active',
	"is_approval_thread" boolean DEFAULT false,
	"approval_id" varchar,
	"message_count" integer DEFAULT 0,
	"last_message_at" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "walter_execution_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"command_text" text NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"source" varchar(50) NOT NULL,
	"approval_status" varchar(30) NOT NULL,
	"approval_reason" text,
	"execution_status" varchar(20) NOT NULL,
	"result_message" text,
	"result_details" jsonb,
	"projected_risk" numeric(5, 2),
	"actual_risk" numeric(5, 2),
	"execution_time_ms" integer,
	"chat_session_id" varchar,
	"approval_id" varchar,
	"cluster_event_id" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "walter_memory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" "walter_memory_type" NOT NULL,
	"content" text NOT NULL,
	"importance" integer DEFAULT 3 NOT NULL,
	"chat_id" varchar,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walter_pending_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"strategy_name" varchar(100),
	"parameter_name" varchar(100) NOT NULL,
	"current_value" jsonb NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"projected_risk" numeric(5, 2) NOT NULL,
	"risk_details" jsonb,
	"status" "approval_status" DEFAULT 'pending',
	"chat_session_id" varchar,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"approved_by" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"trace_id" varchar(100),
	"action" varchar(100),
	"display_mode" "approval_display_mode" DEFAULT 'inline',
	"expires_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "walter_pending_approvals_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE TABLE "walter_purpose" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"content" text NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walter_user_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"view_mode" "walter_view_mode" DEFAULT 'compact' NOT NULL,
	"theme" "walter_theme" DEFAULT 'system' NOT NULL,
	"tone" "walter_tone" DEFAULT 'professional' NOT NULL,
	"send_key_preference" varchar(20) DEFAULT 'enter' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "walter_user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "watchlist_pairs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" DEFAULT 'paper' NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"base_currency" varchar(10) NOT NULL,
	"quote_currency" varchar(10) NOT NULL,
	"market_cap" numeric(20, 2),
	"volume_24h" numeric(20, 2),
	"current_price" numeric(20, 8),
	"vwap" numeric(20, 8),
	"sma" numeric(20, 8),
	"daily_range" numeric(5, 2),
	"last_scanned" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"added_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "watchlist_pairs_mode_symbol_unique" UNIQUE("mode","symbol")
);
--> statement-breakpoint
ALTER TABLE "actuation_policies" ADD CONSTRAINT "actuation_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_logs" ADD CONSTRAINT "ai_chat_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_logs" ADD CONSTRAINT "ai_chat_logs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_lessons" ADD CONSTRAINT "ai_lessons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_opportunities" ADD CONSTRAINT "ai_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_opportunities" ADD CONSTRAINT "ai_opportunities_run_id_ai_opportunity_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_opportunity_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_opportunities" ADD CONSTRAINT "ai_opportunities_executed_trade_id_trades_id_fk" FOREIGN KEY ("executed_trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_opportunities" ADD CONSTRAINT "ai_opportunities_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_opportunity_runs" ADD CONSTRAINT "ai_opportunity_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_orchestrator_logs" ADD CONSTRAINT "ai_orchestrator_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_transparency_log" ADD CONSTRAINT "ai_transparency_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomy_audit_log" ADD CONSTRAINT "autonomy_audit_log_trace_id_reasoning_trace_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."reasoning_trace"("trace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_correction_log" ADD CONSTRAINT "bias_correction_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_observation_log" ADD CONSTRAINT "bias_observation_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_audit_log" ADD CONSTRAINT "cluster_audit_log_task_id_cluster_task_queue_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cluster_task_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_audit_log" ADD CONSTRAINT "cluster_audit_log_node_id_cluster_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_audit_log" ADD CONSTRAINT "cluster_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_circuit_breaker" ADD CONSTRAINT "cluster_circuit_breaker_node_id_cluster_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_result_log" ADD CONSTRAINT "cluster_result_log_task_id_cluster_task_queue_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cluster_task_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_result_log" ADD CONSTRAINT "cluster_result_log_node_id_cluster_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_result_log" ADD CONSTRAINT "cluster_result_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_task_queue" ADD CONSTRAINT "cluster_task_queue_assigned_node_id_cluster_node_id_fk" FOREIGN KEY ("assigned_node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_task_queue" ADD CONSTRAINT "cluster_task_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confidence_drift_log" ADD CONSTRAINT "confidence_drift_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_bridge_log" ADD CONSTRAINT "context_bridge_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_chats" ADD CONSTRAINT "context_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_node_alignment_log" ADD CONSTRAINT "cross_node_alignment_log_source_node_id_cluster_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_node_alignment_log" ADD CONSTRAINT "cross_node_alignment_log_target_node_id_cluster_node_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_config" ADD CONSTRAINT "execution_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_compliance_reports" ADD CONSTRAINT "expert_compliance_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_principles" ADD CONSTRAINT "expert_principles_source_id_expert_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."expert_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_response_logs" ADD CONSTRAINT "expert_response_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_response_logs" ADD CONSTRAINT "expert_response_logs_chat_id_walter_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."walter_chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_updates" ADD CONSTRAINT "expert_updates_source_id_expert_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."expert_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_audit_log" ADD CONSTRAINT "intent_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introspection_report" ADD CONSTRAINT "introspection_report_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kill_switch_events" ADD CONSTRAINT "kill_switch_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_retrieval_log" ADD CONSTRAINT "knowledge_retrieval_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sources" ADD CONSTRAINT "learning_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_audit_log" ADD CONSTRAINT "memory_audit_log_trace_id_reasoning_trace_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."reasoning_trace"("trace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_audit_log" ADD CONSTRAINT "memory_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_reasoning_log" ADD CONSTRAINT "meta_reasoning_log_target_trace_id_reasoning_trace_trace_id_fk" FOREIGN KEY ("target_trace_id") REFERENCES "public"."reasoning_trace"("trace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_consistency_snapshot" ADD CONSTRAINT "model_consistency_snapshot_node_id_cluster_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."cluster_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_ai_reports" ADD CONSTRAINT "paper_ai_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_daily_briefs" ADD CONSTRAINT "paper_daily_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parameter_baseline" ADD CONSTRAINT "parameter_baseline_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_proposals" ADD CONSTRAINT "patch_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_outcomes" ADD CONSTRAINT "prediction_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_adjustments" ADD CONSTRAINT "proposed_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_trace" ADD CONSTRAINT "reasoning_trace_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cache" ADD CONSTRAINT "response_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_telemetry" ADD CONSTRAINT "safety_telemetry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_weights" ADD CONSTRAINT "signal_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_audit_log" ADD CONSTRAINT "trading_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_settings" ADD CONSTRAINT "trading_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuning_event" ADD CONSTRAINT "tuning_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuning_policy" ADD CONSTRAINT "tuning_policy_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goals_audit" ADD CONSTRAINT "user_goals_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_actions" ADD CONSTRAINT "walter_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_approvals_audit" ADD CONSTRAINT "walter_approvals_audit_approval_id_walter_pending_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."walter_pending_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_approvals_audit" ADD CONSTRAINT "walter_approvals_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_chat_logs" ADD CONSTRAINT "walter_chat_logs_chat_session_id_walter_chats_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."walter_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_chat_logs" ADD CONSTRAINT "walter_chat_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_chats" ADD CONSTRAINT "walter_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_execution_log" ADD CONSTRAINT "walter_execution_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_execution_log" ADD CONSTRAINT "walter_execution_log_chat_session_id_walter_chats_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."walter_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_execution_log" ADD CONSTRAINT "walter_execution_log_approval_id_walter_pending_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."walter_pending_approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_memory" ADD CONSTRAINT "walter_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_memory" ADD CONSTRAINT "walter_memory_chat_id_walter_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."walter_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_pending_approvals" ADD CONSTRAINT "walter_pending_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_pending_approvals" ADD CONSTRAINT "walter_pending_approvals_chat_session_id_walter_chats_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."walter_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_pending_approvals" ADD CONSTRAINT "walter_pending_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_purpose" ADD CONSTRAINT "walter_purpose_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_purpose" ADD CONSTRAINT "walter_purpose_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walter_user_preferences" ADD CONSTRAINT "walter_user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actuation_policies_user_variable_idx" ON "actuation_policies" USING btree ("user_id","variable_name");--> statement-breakpoint
CREATE INDEX "agent_learning_delta_origin_node_id_idx" ON "agent_learning_delta" USING btree ("origin_node_id");--> statement-breakpoint
CREATE INDEX "agent_learning_delta_delta_type_idx" ON "agent_learning_delta" USING btree ("delta_type");--> statement-breakpoint
CREATE INDEX "agent_learning_delta_trace_id_idx" ON "agent_learning_delta" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "agent_learning_delta_is_accepted_idx" ON "agent_learning_delta" USING btree ("is_accepted");--> statement-breakpoint
CREATE INDEX "agent_learning_delta_created_at_idx" ON "agent_learning_delta" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_learning_feedback_agent_name_idx" ON "agent_learning_feedback" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_learning_feedback_domain_idx" ON "agent_learning_feedback" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "agent_learning_feedback_session_id_idx" ON "agent_learning_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_learning_feedback_created_at_idx" ON "agent_learning_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_registry_agent_name_idx" ON "agent_registry" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_registry_domain_idx" ON "agent_registry" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "agent_registry_state_idx" ON "agent_registry" USING btree ("state");--> statement-breakpoint
CREATE INDEX "agent_registry_created_at_idx" ON "agent_registry" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_lessons_user_mode_timestamp_idx" ON "ai_lessons" USING btree ("user_id","mode","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_market_analyses_date_mode_idx" ON "ai_market_analyses" USING btree ("date","mode");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_transparency_log_task_executed_idx" ON "ai_transparency_log" USING btree ("task_name","executed_at");--> statement-breakpoint
CREATE INDEX "alignment_audit_log_audit_id_idx" ON "alignment_audit_log" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "alignment_audit_log_timestamp_idx" ON "alignment_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "alignment_audit_log_verification_result_idx" ON "alignment_audit_log" USING btree ("verification_result");--> statement-breakpoint
CREATE INDEX "alignment_policies_policy_id_idx" ON "alignment_policies" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "alignment_policies_policy_type_idx" ON "alignment_policies" USING btree ("policy_type");--> statement-breakpoint
CREATE INDEX "alignment_policies_is_active_idx" ON "alignment_policies" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_capabilities_symbol_idx" ON "asset_capabilities" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_idx" ON "audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_log_trading_mode_idx" ON "audit_log" USING btree ("trading_mode");--> statement-breakpoint
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_log_changed_by_idx" ON "audit_log" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "autonomy_audit_log_run_id_idx" ON "autonomy_audit_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "autonomy_audit_log_action_type_idx" ON "autonomy_audit_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "autonomy_audit_log_timestamp_idx" ON "autonomy_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "autonomy_audit_log_trace_id_idx" ON "autonomy_audit_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "awareness_state_log_state_id_idx" ON "awareness_state_log" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "awareness_state_log_timestamp_idx" ON "awareness_state_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "awareness_state_log_emotional_state_idx" ON "awareness_state_log" USING btree ("emotional_state");--> statement-breakpoint
CREATE INDEX "awareness_state_log_user_id_idx" ON "awareness_state_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "behavioral_log_mode_idx" ON "behavioral_log" USING btree ("trading_mode");--> statement-breakpoint
CREATE INDEX "behavioral_log_parameter_idx" ON "behavioral_log" USING btree ("parameter");--> statement-breakpoint
CREATE INDEX "behavioral_log_trigger_idx" ON "behavioral_log" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "behavioral_log_timestamp_idx" ON "behavioral_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "bias_correction_log_bias_type_idx" ON "bias_correction_log" USING btree ("bias_type");--> statement-breakpoint
CREATE INDEX "bias_correction_log_created_at_idx" ON "bias_correction_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bias_correction_log_user_id_idx" ON "bias_correction_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bias_observation_log_bias_type_idx" ON "bias_observation_log" USING btree ("bias_type");--> statement-breakpoint
CREATE INDEX "bias_observation_log_created_at_idx" ON "bias_observation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bias_observation_log_user_id_idx" ON "bias_observation_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bob_trace_log_trace_id_idx" ON "bob_trace_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "bob_trace_log_bob_module_idx" ON "bob_trace_log" USING btree ("bob_module");--> statement-breakpoint
CREATE INDEX "bob_trace_log_timestamp_idx" ON "bob_trace_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "cluster_audit_log_task_id_idx" ON "cluster_audit_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "cluster_audit_log_node_id_idx" ON "cluster_audit_log" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "cluster_audit_log_gate_type_idx" ON "cluster_audit_log" USING btree ("gate_type");--> statement-breakpoint
CREATE INDEX "cluster_audit_log_user_id_idx" ON "cluster_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cluster_audit_log_created_at_idx" ON "cluster_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cluster_bus_event_topic_idx" ON "cluster_bus_event" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "cluster_bus_event_created_at_idx" ON "cluster_bus_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cluster_bus_event_source_node_idx" ON "cluster_bus_event" USING btree ("source_node");--> statement-breakpoint
CREATE INDEX "cluster_circuit_breaker_node_id_idx" ON "cluster_circuit_breaker" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "cluster_circuit_breaker_state_idx" ON "cluster_circuit_breaker" USING btree ("state");--> statement-breakpoint
CREATE INDEX "cluster_node_role_idx" ON "cluster_node" USING btree ("role");--> statement-breakpoint
CREATE INDEX "cluster_node_status_idx" ON "cluster_node" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cluster_node_last_heartbeat_idx" ON "cluster_node" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX "cluster_result_log_task_id_idx" ON "cluster_result_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "cluster_result_log_node_id_idx" ON "cluster_result_log" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "cluster_result_log_outcome_status_idx" ON "cluster_result_log" USING btree ("outcome_status");--> statement-breakpoint
CREATE INDEX "cluster_result_log_created_at_idx" ON "cluster_result_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cluster_result_log_user_id_idx" ON "cluster_result_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_status_idx" ON "cluster_task_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_task_type_idx" ON "cluster_task_queue" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_created_at_idx" ON "cluster_task_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_assigned_node_id_idx" ON "cluster_task_queue" USING btree ("assigned_node_id");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_priority_idx" ON "cluster_task_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "cluster_task_queue_user_id_idx" ON "cluster_task_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cognitive_core_state_cycle_id_idx" ON "cognitive_core_state" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "cognitive_core_state_created_at_idx" ON "cognitive_core_state" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cognitive_tuning_log_run_id_idx" ON "cognitive_tuning_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "cognitive_tuning_log_scenario_idx" ON "cognitive_tuning_log" USING btree ("scenario");--> statement-breakpoint
CREATE INDEX "cognitive_tuning_log_result_idx" ON "cognitive_tuning_log" USING btree ("result");--> statement-breakpoint
CREATE INDEX "cognitive_tuning_log_created_at_idx" ON "cognitive_tuning_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coherency_rule_status_rule_id_idx" ON "coherency_rule_status" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "collaboration_messages_message_id_idx" ON "collaboration_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "collaboration_messages_session_id_idx" ON "collaboration_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "collaboration_messages_agent_id_idx" ON "collaboration_messages" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "collaboration_messages_timestamp_idx" ON "collaboration_messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "collaboration_sessions_session_id_idx" ON "collaboration_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "collaboration_sessions_user_id_idx" ON "collaboration_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collaboration_sessions_consensus_state_idx" ON "collaboration_sessions" USING btree ("consensus_state");--> statement-breakpoint
CREATE INDEX "collaboration_sessions_started_at_idx" ON "collaboration_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "confidence_drift_log_created_at_idx" ON "confidence_drift_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "confidence_drift_log_user_id_idx" ON "confidence_drift_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consensus_snapshots_snapshot_id_idx" ON "consensus_snapshots" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "consensus_snapshots_session_id_idx" ON "consensus_snapshots" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "consensus_snapshots_evaluation_point_idx" ON "consensus_snapshots" USING btree ("evaluation_point");--> statement-breakpoint
CREATE INDEX "context_bridge_log_trace_id_idx" ON "context_bridge_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "context_bridge_log_timestamp_idx" ON "context_bridge_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "context_bridge_log_event_type_idx" ON "context_bridge_log" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_summaries_conversation_id_idx" ON "conversation_summaries" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "cross_agent_ethics_session_session_id_idx" ON "cross_agent_ethics_session" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cross_agent_ethics_session_verdict_idx" ON "cross_agent_ethics_session" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "cross_agent_ethics_session_created_at_idx" ON "cross_agent_ethics_session" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cross_node_alignment_log_source_node_id_idx" ON "cross_node_alignment_log" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "cross_node_alignment_log_target_node_id_idx" ON "cross_node_alignment_log" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "cross_node_alignment_log_trace_id_idx" ON "cross_node_alignment_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "cross_node_alignment_log_drift_detected_idx" ON "cross_node_alignment_log" USING btree ("drift_detected");--> statement-breakpoint
CREATE INDEX "cross_node_alignment_log_created_at_idx" ON "cross_node_alignment_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_performance_summary_mode_date_idx" ON "daily_performance_summary" USING btree ("mode","date");--> statement-breakpoint
CREATE INDEX "daily_performance_summary_mode_idx" ON "daily_performance_summary" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "daily_performance_summary_date_idx" ON "daily_performance_summary" USING btree ("date");--> statement-breakpoint
CREATE INDEX "data_lineage_trace_id_idx" ON "data_lineage" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "data_lineage_timestamp_idx" ON "data_lineage" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "decision_quality_audit_decision_id_idx" ON "decision_quality_audit" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_quality_audit_user_id_idx" ON "decision_quality_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decision_quality_audit_decision_type_idx" ON "decision_quality_audit" USING btree ("decision_type");--> statement-breakpoint
CREATE INDEX "decision_quality_audit_quality_rating_idx" ON "decision_quality_audit" USING btree ("quality_rating");--> statement-breakpoint
CREATE INDEX "decision_quality_audit_created_at_idx" ON "decision_quality_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "decision_trace_log_decision_id_idx" ON "decision_trace_log" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_trace_log_user_id_idx" ON "decision_trace_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decision_trace_log_decision_type_idx" ON "decision_trace_log" USING btree ("decision_type");--> statement-breakpoint
CREATE INDEX "decision_trace_log_simulation_ref_idx" ON "decision_trace_log" USING btree ("simulation_ref");--> statement-breakpoint
CREATE INDEX "ethical_principle_name_idx" ON "ethical_principle" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ethical_principle_type_idx" ON "ethical_principle" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ethical_principle_enabled_idx" ON "ethical_principle" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "ethical_violation_log_actor_idx" ON "ethical_violation_log" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "ethical_violation_log_verdict_idx" ON "ethical_violation_log" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "ethical_violation_log_severity_idx" ON "ethical_violation_log" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ethical_violation_log_created_at_idx" ON "ethical_violation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ethics_conflict_register_session_id_idx" ON "ethics_conflict_register" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ethics_conflict_register_status_idx" ON "ethics_conflict_register" USING btree ("resolution_status");--> statement-breakpoint
CREATE INDEX "ethics_conflict_register_created_at_idx" ON "ethics_conflict_register" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ethics_propagation_journal_propagation_id_idx" ON "ethics_propagation_journal" USING btree ("propagation_id");--> statement-breakpoint
CREATE INDEX "ethics_propagation_journal_status_idx" ON "ethics_propagation_journal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ethics_propagation_journal_target_domain_idx" ON "ethics_propagation_journal" USING btree ("target_domain");--> statement-breakpoint
CREATE INDEX "ethics_propagation_journal_created_at_idx" ON "ethics_propagation_journal" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_attempt_audit_created_at_idx" ON "execution_attempt_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_attempt_audit_mode_idx" ON "execution_attempt_audit" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "execution_attempt_audit_symbol_idx" ON "execution_attempt_audit" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "execution_attempt_audit_strategy_idx" ON "execution_attempt_audit" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "execution_attempt_audit_decision_idx" ON "execution_attempt_audit" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "execution_config_user_mode_idx" ON "execution_config" USING btree ("user_id","mode");--> statement-breakpoint
CREATE INDEX "execution_config_action_type_idx" ON "execution_config" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "experience_memory_log_memory_id_idx" ON "experience_memory_log" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "experience_memory_log_timestamp_idx" ON "experience_memory_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "experience_memory_log_context_domain_idx" ON "experience_memory_log" USING btree ("context_domain");--> statement-breakpoint
CREATE INDEX "experience_memory_log_impact_idx" ON "experience_memory_log" USING btree ("impact");--> statement-breakpoint
CREATE INDEX "federated_ethics_state_domain_mode_idx" ON "federated_ethics_state" USING btree ("domain","mode");--> statement-breakpoint
CREATE INDEX "federated_ethics_state_updated_at_idx" ON "federated_ethics_state" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "filter_calibration_log_mode_timestamp_idx" ON "filter_calibration_log" USING btree ("mode","timestamp");--> statement-breakpoint
CREATE INDEX "goal_alignment_profile_profile_id_idx" ON "goal_alignment_profile" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "goal_alignment_profile_user_id_idx" ON "goal_alignment_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_alignment_profile_current_status_idx" ON "goal_alignment_profile" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX "goal_audit_log_mode_idx" ON "goal_audit_log" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "goal_audit_log_action_idx" ON "goal_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "goal_audit_log_timestamp_idx" ON "goal_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "goals_learning_mode_date_idx" ON "goals_learning_metrics" USING btree ("mode","date");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_presets_mode_name_idx" ON "goals_presets" USING btree ("mode","name");--> statement-breakpoint
CREATE UNIQUE INDEX "guardrails_mode_idx" ON "guardrails" USING btree ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "guardrails_v2_mode_idx" ON "guardrails_v2" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "historic_signals_symbol_idx" ON "historic_signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "historic_signals_strategy_idx" ON "historic_signals" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "historic_signals_trigger_time_idx" ON "historic_signals" USING btree ("trigger_time");--> statement-breakpoint
CREATE INDEX "intent_audit_log_trace_id_idx" ON "intent_audit_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "intent_audit_log_user_id_idx" ON "intent_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "intent_audit_log_timestamp_idx" ON "intent_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "intent_audit_log_intent_action_idx" ON "intent_audit_log" USING btree ("intent_action");--> statement-breakpoint
CREATE UNIQUE INDEX "intraday_adjustments_mode_timestamp_idx" ON "intraday_adjustments" USING btree ("mode","timestamp");--> statement-breakpoint
CREATE INDEX "introspection_report_report_date_idx" ON "introspection_report" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "introspection_report_user_id_idx" ON "introspection_report" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "introspection_report_created_at_idx" ON "introspection_report" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_cache_query_hash_idx" ON "knowledge_cache" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "knowledge_cache_source_idx" ON "knowledge_cache" USING btree ("source");--> statement-breakpoint
CREATE INDEX "knowledge_cache_expires_at_idx" ON "knowledge_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_log_user_id_idx" ON "knowledge_retrieval_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_log_source_idx" ON "knowledge_retrieval_log" USING btree ("source");--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_log_trust_level_idx" ON "knowledge_retrieval_log" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX "knowledge_retrieval_log_created_at_idx" ON "knowledge_retrieval_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_trust_record_domain_idx" ON "knowledge_trust_record" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "knowledge_trust_record_trust_level_idx" ON "knowledge_trust_record" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX "knowledge_trust_record_last_audit_date_idx" ON "knowledge_trust_record" USING btree ("last_audit_date");--> statement-breakpoint
CREATE INDEX "latti_baseline_history_trading_mode_idx" ON "latti_baseline_history" USING btree ("trading_mode");--> statement-breakpoint
CREATE INDEX "latti_baseline_history_timestamp_idx" ON "latti_baseline_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "learning_fragments_context_mode_idx" ON "learning_fragments" USING btree ("global_context_id","mode");--> statement-breakpoint
CREATE INDEX "learning_fragments_event_type_idx" ON "learning_fragments" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "learning_fragments_significance_idx" ON "learning_fragments" USING btree ("significance");--> statement-breakpoint
CREATE INDEX "learning_fragments_timestamp_idx" ON "learning_fragments" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "learning_fragments_category_idx" ON "learning_fragments" USING btree ("event_category");--> statement-breakpoint
CREATE INDEX "learning_history_mode_idx" ON "learning_history" USING btree ("trading_mode");--> statement-breakpoint
CREATE INDEX "learning_history_version_idx" ON "learning_history" USING btree ("snapshot_version");--> statement-breakpoint
CREATE INDEX "learning_history_stable_idx" ON "learning_history" USING btree ("is_stable");--> statement-breakpoint
CREATE INDEX "learning_history_created_at_idx" ON "learning_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_sources_user_source_idx" ON "learning_sources" USING btree ("user_id","source_name");--> statement-breakpoint
CREATE INDEX "learning_weight_profile_profile_id_idx" ON "learning_weight_profile" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "learning_weight_profile_user_id_idx" ON "learning_weight_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learning_weight_profile_current_phase_idx" ON "learning_weight_profile" USING btree ("current_phase");--> statement-breakpoint
CREATE INDEX "lottie_oversight_log_event_idx" ON "lottie_oversight_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "lottie_oversight_log_strategy_idx" ON "lottie_oversight_log" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "lottie_oversight_log_created_at_idx" ON "lottie_oversight_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_audit_log_checksum_idx" ON "memory_audit_log" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "memory_audit_log_status_idx" ON "memory_audit_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_audit_log_trace_id_idx" ON "memory_audit_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "memory_audit_log_user_id_idx" ON "memory_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_audit_log_created_at_idx" ON "memory_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meta_cognition_log_source_agent_idx" ON "meta_cognition_log" USING btree ("source_agent");--> statement-breakpoint
CREATE INDEX "meta_cognition_log_flag_type_idx" ON "meta_cognition_log" USING btree ("flag_type");--> statement-breakpoint
CREATE INDEX "meta_cognition_log_severity_idx" ON "meta_cognition_log" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "meta_cognition_log_resolved_idx" ON "meta_cognition_log" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "meta_cognition_log_created_at_idx" ON "meta_cognition_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meta_reasoning_log_analysis_id_idx" ON "meta_reasoning_log" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "meta_reasoning_log_target_trace_id_idx" ON "meta_reasoning_log" USING btree ("target_trace_id");--> statement-breakpoint
CREATE INDEX "meta_reasoning_log_analysis_result_idx" ON "meta_reasoning_log" USING btree ("analysis_result");--> statement-breakpoint
CREATE INDEX "meta_reasoning_log_created_at_idx" ON "meta_reasoning_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_calibration_log_agent_name_idx" ON "model_calibration_log" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "model_calibration_log_parameter_idx" ON "model_calibration_log" USING btree ("parameter");--> statement-breakpoint
CREATE INDEX "model_calibration_log_created_at_idx" ON "model_calibration_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_consistency_snapshot_node_id_idx" ON "model_consistency_snapshot" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "model_consistency_snapshot_domain_channel_idx" ON "model_consistency_snapshot" USING btree ("domain_channel");--> statement-breakpoint
CREATE INDEX "model_consistency_snapshot_model_hash_idx" ON "model_consistency_snapshot" USING btree ("model_hash");--> statement-breakpoint
CREATE INDEX "model_consistency_snapshot_created_at_idx" ON "model_consistency_snapshot" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_sim_open_positions_symbol_idx" ON "paper_sim_open_positions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "paper_sim_open_positions_strategy_idx" ON "paper_sim_open_positions" USING btree ("strategy_name");--> statement-breakpoint
CREATE INDEX "paper_sim_sessions_status_idx" ON "paper_sim_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_sim_sessions_session_id_idx" ON "paper_sim_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "paper_sim_sessions_started_at_idx" ON "paper_sim_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "paper_sim_trade_logs_timestamp_idx" ON "paper_sim_trade_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "paper_sim_trade_logs_trade_id_idx" ON "paper_sim_trade_logs" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "paper_sim_trade_logs_event_type_idx" ON "paper_sim_trade_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "paper_sim_trades_symbol_idx" ON "paper_sim_trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "paper_sim_trades_strategy_idx" ON "paper_sim_trades" USING btree ("strategy_name");--> statement-breakpoint
CREATE INDEX "paper_sim_trades_opened_at_idx" ON "paper_sim_trades" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "paper_sim_trades_closed_at_idx" ON "paper_sim_trades" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "parameter_baseline_user_id_mode_idx" ON "parameter_baseline" USING btree ("user_id","mode");--> statement-breakpoint
CREATE INDEX "parameter_baseline_created_at_idx" ON "parameter_baseline" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patch_proposals_proposal_id_idx" ON "patch_proposals" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "patch_proposals_user_status_idx" ON "patch_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_adjustments_mode_timestamp_idx" ON "portfolio_adjustments" USING btree ("mode","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_state_global_context_mode_idx" ON "portfolio_state" USING btree ("global_context_id","mode");--> statement-breakpoint
CREATE INDEX "proposed_adjustments_user_mode_proposed_idx" ON "proposed_adjustments" USING btree ("user_id","mode","proposed_at");--> statement-breakpoint
CREATE INDEX "reasoning_queue_trace_id_idx" ON "reasoning_queue" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "reasoning_queue_status_idx" ON "reasoning_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reasoning_queue_task_type_idx" ON "reasoning_queue" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "reasoning_queue_created_at_idx" ON "reasoning_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reasoning_trace_trace_id_idx" ON "reasoning_trace" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "reasoning_trace_user_id_idx" ON "reasoning_trace" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reasoning_trace_created_at_idx" ON "reasoning_trace" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reasoning_trace_status_idx" ON "reasoning_trace" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reflection_log_user_id_idx" ON "reflection_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reflection_log_trigger_source_idx" ON "reflection_log" USING btree ("trigger_source");--> statement-breakpoint
CREATE INDEX "reflection_log_reflection_depth_idx" ON "reflection_log" USING btree ("reflection_depth");--> statement-breakpoint
CREATE INDEX "reflection_log_created_at_idx" ON "reflection_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "response_cache_user_cache_key_idx" ON "response_cache" USING btree ("user_id","cache_key");--> statement-breakpoint
CREATE INDEX "response_cache_expires_at_idx" ON "response_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "safety_event_log_actor_idx" ON "safety_event_log" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "safety_event_log_severity_idx" ON "safety_event_log" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "safety_event_log_created_at_idx" ON "safety_event_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safety_policy_policy_name_idx" ON "safety_policy" USING btree ("policy_name");--> statement-breakpoint
CREATE INDEX "safety_policy_scope_idx" ON "safety_policy" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "safety_policy_enabled_idx" ON "safety_policy" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_telemetry_user_mode_timestamp_idx" ON "safety_telemetry" USING btree ("user_id","mode","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "screener_filters_mode_idx" ON "screener_filters" USING btree ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "screener_results_mode_timestamp_idx" ON "screener_results" USING btree ("mode","scanned_at");--> statement-breakpoint
CREATE INDEX "semantic_memory_embedding_idx" ON "semantic_memory" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "semantic_memory_tags_idx" ON "semantic_memory" USING btree ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_memory_source_idx" ON "semantic_memory" USING btree ("source_table","source_id");--> statement-breakpoint
CREATE INDEX "strategic_memory_archive_agent_name_idx" ON "strategic_memory_archive" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "strategic_memory_archive_memory_scope_idx" ON "strategic_memory_archive" USING btree ("memory_scope");--> statement-breakpoint
CREATE INDEX "strategic_memory_archive_created_at_idx" ON "strategic_memory_archive" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "strategic_memory_snapshot_snapshot_id_idx" ON "strategic_memory_snapshot" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "strategic_memory_snapshot_user_id_idx" ON "strategic_memory_snapshot" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategic_memory_snapshot_confidence_level_idx" ON "strategic_memory_snapshot" USING btree ("confidence_level");--> statement-breakpoint
CREATE INDEX "strategic_plan_log_plan_id_idx" ON "strategic_plan_log" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "strategic_plan_log_user_id_idx" ON "strategic_plan_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategic_plan_log_status_idx" ON "strategic_plan_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "strategic_simulation_log_simulation_id_idx" ON "strategic_simulation_log" USING btree ("simulation_id");--> statement-breakpoint
CREATE INDEX "strategic_simulation_log_user_id_idx" ON "strategic_simulation_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategic_simulation_log_scenario_type_idx" ON "strategic_simulation_log" USING btree ("scenario_type");--> statement-breakpoint
CREATE INDEX "strategic_simulation_log_evaluation_status_idx" ON "strategic_simulation_log" USING btree ("evaluation_status");--> statement-breakpoint
CREATE INDEX "strategy_drive_metrics_strategy_idx" ON "strategy_drive_metrics" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "strategy_drive_metrics_mode_idx" ON "strategy_drive_metrics" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "strategy_drive_metrics_timestamp_idx" ON "strategy_drive_metrics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "strategy_drive_summary_created_at_idx" ON "strategy_drive_summary" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "strategy_mix_log_strategy_idx" ON "strategy_mix_log" USING btree ("strategy");--> statement-breakpoint
CREATE INDEX "strategy_mix_log_created_at_idx" ON "strategy_mix_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_param_schema_strategy_mode_key_idx" ON "strategy_param_schema" USING btree ("strategy_type","trading_mode","key");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_parameters_param_idx" ON "strategy_parameters" USING btree ("parameter_name");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_settings_global_context_mode_strategy_idx" ON "strategy_settings" USING btree ("global_context_id","mode","strategy");--> statement-breakpoint
CREATE UNIQUE INDEX "system_alerts_user_mode_timestamp_idx" ON "system_alerts" USING btree ("user_id","mode","timestamp");--> statement-breakpoint
CREATE INDEX "system_context_trading_mode_idx" ON "system_context" USING btree ("trading_mode");--> statement-breakpoint
CREATE INDEX "system_context_last_mode_change_idx" ON "system_context" USING btree ("last_mode_change");--> statement-breakpoint
CREATE INDEX "system_context_is_engine_active_idx" ON "system_context" USING btree ("is_engine_active");--> statement-breakpoint
CREATE INDEX "telemetry_lineage_trace_id_idx" ON "telemetry_lineage" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "telemetry_lineage_timestamp_idx" ON "telemetry_lineage" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "trades_mode_idx" ON "trades" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "trades_symbol_idx" ON "trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trading_audit_log_user_idx" ON "trading_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trading_audit_log_action_idx" ON "trading_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "trading_audit_log_mode_idx" ON "trading_audit_log" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "trading_audit_log_created_at_idx" ON "trading_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_settings_user_id_idx" ON "trading_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trading_signals_mode_status_idx" ON "trading_signals" USING btree ("mode","status");--> statement-breakpoint
CREATE INDEX "trading_signals_symbol_strategy_idx" ON "trading_signals" USING btree ("symbol","strategy");--> statement-breakpoint
CREATE INDEX "trading_signals_detected_at_idx" ON "trading_signals" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "tuning_event_user_id_mode_idx" ON "tuning_event" USING btree ("user_id","mode");--> statement-breakpoint
CREATE INDEX "tuning_event_field_idx" ON "tuning_event" USING btree ("field");--> statement-breakpoint
CREATE INDEX "tuning_event_status_idx" ON "tuning_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tuning_event_created_at_idx" ON "tuning_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tuning_event_reverted_idx" ON "tuning_event" USING btree ("reverted");--> statement-breakpoint
CREATE INDEX "tuning_policy_user_id_mode_idx" ON "tuning_policy" USING btree ("user_id","mode");--> statement-breakpoint
CREATE INDEX "tuning_policy_enabled_idx" ON "tuning_policy" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "user_goals_audit_user_id_idx" ON "user_goals_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_goals_audit_status_idx" ON "user_goals_audit" USING btree ("feasibility_status");--> statement-breakpoint
CREATE INDEX "user_goals_audit_timestamp_idx" ON "user_goals_audit" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "value_alignment_matrix_mode_objective_idx" ON "value_alignment_matrix" USING btree ("mode","objective_name");--> statement-breakpoint
CREATE INDEX "value_alignment_matrix_value_category_idx" ON "value_alignment_matrix" USING btree ("value_category");--> statement-breakpoint
CREATE INDEX "walter_actions_user_mode_idx" ON "walter_actions" USING btree ("user_id","mode");--> statement-breakpoint
CREATE INDEX "walter_actions_status_idx" ON "walter_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "walter_actions_category_idx" ON "walter_actions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "walter_actions_impact_idx" ON "walter_actions" USING btree ("impact_score");--> statement-breakpoint
CREATE INDEX "walter_actions_detected_at_idx" ON "walter_actions" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "walter_actions_escalated_idx" ON "walter_actions" USING btree ("escalated");--> statement-breakpoint
CREATE INDEX "walter_actions_incident_key_idx" ON "walter_actions" USING btree ("incident_key");--> statement-breakpoint
CREATE INDEX "walter_actions_parent_action_idx" ON "walter_actions" USING btree ("parent_action_id");--> statement-breakpoint
CREATE INDEX "walter_approvals_audit_approval_idx" ON "walter_approvals_audit" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "walter_approvals_audit_user_idx" ON "walter_approvals_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "walter_approvals_audit_timestamp_idx" ON "walter_approvals_audit" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "walter_chat_logs_session_idx" ON "walter_chat_logs" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "walter_chat_logs_timestamp_idx" ON "walter_chat_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "walter_execution_log_user_idx" ON "walter_execution_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "walter_execution_log_mode_idx" ON "walter_execution_log" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "walter_execution_log_action_type_idx" ON "walter_execution_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "walter_execution_log_created_at_idx" ON "walter_execution_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "walter_execution_log_status_idx" ON "walter_execution_log" USING btree ("execution_status");--> statement-breakpoint
CREATE INDEX "walter_memory_user_type_idx" ON "walter_memory" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "walter_memory_importance_idx" ON "walter_memory" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "walter_memory_timestamp_idx" ON "walter_memory" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "walter_purpose_user_mode_idx" ON "walter_purpose" USING btree ("user_id","mode");