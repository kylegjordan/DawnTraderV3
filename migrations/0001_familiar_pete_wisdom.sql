CREATE TYPE "public"."pattern_type" AS ENUM('PINBAR', 'ENGULFING', 'INSIDE_BAR', 'MORNING_STAR', 'THREE_SOLDIERS');--> statement-breakpoint
CREATE TYPE "public"."rtb_signal_status" AS ENUM('queued', 'promoted', 'expired', 'rejected', 'reconfirmed', 'active');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('QUANT', 'PATTERN', 'HYBRID');--> statement-breakpoint
CREATE TABLE "rtb_signals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trading_mode" NOT NULL,
	"signal_id" varchar(100) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" "strategy_type" NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"stop_price" numeric(20, 8) NOT NULL,
	"target_price" numeric(20, 8),
	"quantity" numeric(20, 8),
	"notional" numeric(20, 2),
	"confidence" numeric(5, 4) NOT NULL,
	"risk_score" numeric(5, 4) NOT NULL,
	"expected_return" numeric(5, 4) NOT NULL,
	"cwqi" numeric(5, 4) NOT NULL,
	"ngc" numeric(5, 4),
	"current_price" numeric(20, 8),
	"volume_24h" numeric(20, 2),
	"status" "rtb_signal_status" DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"missed_refreshes" integer DEFAULT 0,
	"block_reason" varchar(50),
	"promoted_trade_id" varchar,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "paper_sim_open_positions" ADD COLUMN "trade_mode" varchar(20) DEFAULT 'TARGET';--> statement-breakpoint
ALTER TABLE "paper_sim_open_positions" ADD COLUMN "signal_type" "signal_type" DEFAULT 'QUANT' NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_sim_open_positions" ADD COLUMN "pattern_type" "pattern_type";--> statement-breakpoint
ALTER TABLE "paper_sim_open_positions" ADD COLUMN "pattern_strength" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "total_cost" numeric(20, 8) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "gross_pnl" numeric(20, 8) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "net_pnl" numeric(20, 8) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "net_pnl_percent" numeric(10, 4) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "signal_type" "signal_type" DEFAULT 'QUANT' NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "pattern_type" "pattern_type";--> statement-breakpoint
ALTER TABLE "paper_sim_trades" ADD COLUMN "pattern_strength" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "paper_trades" ADD COLUMN "ngc" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "paper_trades" ADD COLUMN "cwqi" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "paper_trades" ADD COLUMN "confidence" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "paper_trades" ADD COLUMN "profit_rate" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "trade_mode" varchar(20) DEFAULT 'TARGET';--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "signal_type" "signal_type" DEFAULT 'QUANT' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "pattern_type" "pattern_type";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "pattern_strength" numeric(4, 3);--> statement-breakpoint
CREATE INDEX "rtb_signals_mode_status_idx" ON "rtb_signals" USING btree ("mode","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rtb_signals_symbol_strategy_idx" ON "rtb_signals" USING btree ("mode","symbol","strategy","status");--> statement-breakpoint
CREATE INDEX "rtb_signals_cwqi_idx" ON "rtb_signals" USING btree ("cwqi");--> statement-breakpoint
CREATE INDEX "rtb_signals_queued_at_idx" ON "rtb_signals" USING btree ("queued_at");--> statement-breakpoint
CREATE INDEX "rtb_signals_expires_at_idx" ON "rtb_signals" USING btree ("expires_at");