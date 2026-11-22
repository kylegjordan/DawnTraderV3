-- Rollback for 2026-11-22-b-alert-orphan-rows.sql (B-ALERT-ORPHAN-ROWS, Kyle KD-116).
-- Re-inserts the orphaned system_alerts rows exactly as read from staging on 2026-11-22:
-- all 11 columns, original ids. ON CONFLICT DO NOTHING: a row whose id, (mode, alert_type,
-- message) or (user_id, mode, timestamp) was re-used after the deploy is skipped; the live
-- row is the newer truth.
--
-- Pre-deploy exactness check (Langston Step-2 condition C-2): immediately before deploying
-- the forward migration, run the generator below on staging (`dt-sql --csv -f <file>`, first column of
-- each row) and compare its output line-for-line with the INSERT statements in this file. Any difference (for example the
-- episode-close sweep re-stamping metadata) means this file is regenerated from that output
-- and re-committed before the deploy. The generator:
--
--   select format('INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES (%L, %L, %L, %L, %L, %L, %L, %L::jsonb, %L::jsonb, %L, %L) ON CONFLICT DO NOTHING;',
--     a.id, a.user_id, a.mode, a.alert_type, a.severity, a.category, a.message, a.metadata::text, a.action_buttons::text, a.acknowledged, a.timestamp::text)
--   from system_alerts a where not exists (select 1 from users u where u.id = a.user_id) order by a.timestamp, a.id;
--
-- Rows: 12.

BEGIN;

INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('6b90247b-1fb3-42a8-ba56-a719e67d6fef', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'live', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Critical: Data age 20s (threshold: 10s)
Critical: Latency 20412ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 20412, "tickAgeSec": 20, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-24 20:05:13.036292+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('0ec2ec05-cb18-4738-af1d-f862426f3c56', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'paper', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Critical: Data age 20s (threshold: 10s)
Critical: Latency 20412ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 20412, "tickAgeSec": 20, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-24 20:05:13.104554+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('4a7216e7-5b12-402d-97a7-c7c0aefe10ae', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'live', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Data age 9s (threshold: 5s)
Critical: Latency 15373ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 15373, "tickAgeSec": 9, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-24 20:15:01.730739+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('54791ee0-fff6-4fed-830c-03321033a387', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'paper', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Data age 9s (threshold: 5s)
Critical: Latency 15373ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 15373, "tickAgeSec": 9, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-24 20:15:01.798191+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('39f43b6a-d5ad-4d32-98a9-4b5fad0fb089', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'live', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Latency 2351ms (threshold: 2000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 2351, "tickAgeSec": 2, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 13:50:10.125378+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('ae1272f5-d37a-4343-8713-5c1de308bf65', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'paper', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Latency 2351ms (threshold: 2000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 2351, "tickAgeSec": 2, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 13:50:10.193644+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('f4d90a92-cb5c-4b23-9373-a7ce456b1c8b', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'live', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Critical: Data age 14s (threshold: 10s)
Critical: Latency 14041ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 14041, "tickAgeSec": 14, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 15:45:03.494284+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('a7f3373c-bf6e-406a-8c98-0cb171266e3b', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'paper', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Critical: Data age 14s (threshold: 10s)
Critical: Latency 14041ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 14041, "tickAgeSec": 14, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 15:45:03.579922+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('feb40dee-085f-4b3e-857b-7da4e0129686', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'live', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Data age 5s (threshold: 5s)
Critical: Latency 9461ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 9461, "tickAgeSec": 5, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 15:50:24.167964+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('aedd351a-ec29-4fbe-b258-d669c0671ebf', 'ce50e56b-0208-4fca-9c14-2777db4104b7', 'paper', 'feed_health', 'critical', 'critical', 'Feed Health: CRITICAL (Grade F)
Warning: Data age 5s (threshold: 5s)
Critical: Latency 9461ms (threshold: 5000ms)
Critical: Uptime 0.0% (threshold: 80%)
REST fallback engaged (WebSocket unavailable)', '{"grade": "F", "dormant": false, "trigger": "auto", "feedType": "rest_fallback", "latencyMs": 9461, "tickAgeSec": 5, "uptimePercent": 0, "reconnectCount": 0, "episodeClosedAt": "2026-11-14T21:15:54.452931+00:00"}'::jsonb, NULL::jsonb, 't', '2025-10-25 15:50:24.23511+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('6cf2c906-4162-4c39-8e85-56e914bed424', '3ace5ebb-06f2-4116-8e60-f130425bab52', 'paper', 'walter_memory_limit', 'info', 'informational', 'Smart aging activated: 211 lower-priority memories pruned to maintain 1500 memory limit.', '{"limit": 1500, "deleted": 211, "retained": 1500}'::jsonb, NULL::jsonb, 't', '2025-10-25 18:48:06.087102+00') ON CONFLICT DO NOTHING;
INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES ('27e5becc-437a-4454-9ed7-2bc9959de872', '3ace5ebb-06f2-4116-8e60-f130425bab52', 'paper', 'walter_memory_limit', 'info', 'informational', 'Smart aging activated: 63 lower-priority memories pruned to maintain 1500 memory limit.', '{"limit": 1500, "deleted": 63, "retained": 1500}'::jsonb, NULL::jsonb, 't', '2025-10-25 19:00:03.748583+00') ON CONFLICT DO NOTHING;

COMMIT;
