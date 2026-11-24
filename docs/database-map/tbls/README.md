# postgres

## Description

DawnTrader catalog extracted 2026-11-24T06:14:31.310381Z.

## Viewpoints

| Name | Description |
| ---- | ----------- |
| [auth schema](viewpoint-schema-auth.md) | All mapped relations in auth. |
| [dawntrader_v2 schema](viewpoint-schema-dawntrader_v2.md) | All mapped relations in dawntrader_v2. |
| [extensions schema](viewpoint-schema-extensions.md) | All mapped relations in extensions. |
| [public schema](viewpoint-schema-public.md) | All mapped relations in public. |
| [realtime schema](viewpoint-schema-realtime.md) | All mapped relations in realtime. |
| [storage schema](viewpoint-schema-storage.md) | All mapped relations in storage. |
| [vault schema](viewpoint-schema-vault.md) | All mapped relations in vault. |
| [Cross-schema relations](viewpoint-cross-schema-relations.md) | Relations participating in a foreign key across schema boundaries. |

## Tables

| Name | Columns | Comment | Type |
| ---- | ------- | ------- | ---- |
| [auth.audit_log_entries](auth.audit_log_entries.md) | 5 | Auth: Audit trail for user actions. | TABLE |
| [auth.custom_oauth_providers](auth.custom_oauth_providers.md) | 25 |  | TABLE |
| [auth.flow_state](auth.flow_state.md) | 17 | Stores metadata for all OAuth/SSO login flows | TABLE |
| [auth.identities](auth.identities.md) | 9 | Auth: Stores identities associated to a user. | TABLE |
| [auth.instances](auth.instances.md) | 5 | Auth: Manages users across multiple sites. | TABLE |
| [auth.mfa_amr_claims](auth.mfa_amr_claims.md) | 5 | auth: stores authenticator method reference claims for multi factor authentication | TABLE |
| [auth.mfa_challenges](auth.mfa_challenges.md) | 7 | auth: stores metadata about challenge requests made | TABLE |
| [auth.mfa_factors](auth.mfa_factors.md) | 13 | auth: stores metadata about factors | TABLE |
| [auth.mfa_recovery_code_sets](auth.mfa_recovery_code_sets.md) | 7 |  | TABLE |
| [auth.mfa_recovery_codes](auth.mfa_recovery_codes.md) | 5 |  | TABLE |
| [auth.oauth_authorizations](auth.oauth_authorizations.md) | 17 |  | TABLE |
| [auth.oauth_client_states](auth.oauth_client_states.md) | 4 | Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client. | TABLE |
| [auth.oauth_clients](auth.oauth_clients.md) | 13 |  | TABLE |
| [auth.oauth_consents](auth.oauth_consents.md) | 6 |  | TABLE |
| [auth.one_time_tokens](auth.one_time_tokens.md) | 9 |  | TABLE |
| [auth.refresh_tokens](auth.refresh_tokens.md) | 9 | Auth: Store of tokens used to refresh JWT tokens once they expire. | TABLE |
| [auth.saml_providers](auth.saml_providers.md) | 10 | Auth: Manages SAML Identity Provider connections. | TABLE |
| [auth.saml_relay_states](auth.saml_relay_states.md) | 8 | Auth: Contains SAML Relay State information for each Service Provider initiated login. | TABLE |
| [auth.schema_migrations](auth.schema_migrations.md) | 1 | Auth: Manages updates to the auth system. | TABLE |
| [auth.scim_tokens](auth.scim_tokens.md) | 8 |  | TABLE |
| [auth.scim_users](auth.scim_users.md) | 10 |  | TABLE |
| [auth.sessions](auth.sessions.md) | 15 | Auth: Stores session data associated to a user. | TABLE |
| [auth.sso_domains](auth.sso_domains.md) | 5 | Auth: Manages SSO email address domain mapping to an SSO Identity Provider. | TABLE |
| [auth.sso_providers](auth.sso_providers.md) | 5 | Auth: Manages SSO identity provider information; see saml_providers for SAML. | TABLE |
| [auth.users](auth.users.md) | 35 | Auth: Stores user login data within a secure schema. | TABLE |
| [auth.webauthn_challenges](auth.webauthn_challenges.md) | 6 |  | TABLE |
| [auth.webauthn_credentials](auth.webauthn_credentials.md) | 14 |  | TABLE |
| [dawntrader_v2.audit_logs](dawntrader_v2.audit_logs.md) | 5 |  | TABLE |
| [dawntrader_v2.guardrails_v2](dawntrader_v2.guardrails_v2.md) | 8 |  | TABLE |
| [dawntrader_v2.latti_motivation_state](dawntrader_v2.latti_motivation_state.md) | 9 |  | TABLE |
| [dawntrader_v2.strategies](dawntrader_v2.strategies.md) | 7 |  | TABLE |
| [dawntrader_v2.telemetry_state](dawntrader_v2.telemetry_state.md) | 8 |  | TABLE |
| [dawntrader_v2.trade_logs](dawntrader_v2.trade_logs.md) | 10 |  | TABLE |
| [dawntrader_v2.user_sessions](dawntrader_v2.user_sessions.md) | 5 |  | TABLE |
| [dawntrader_v2.users](dawntrader_v2.users.md) | 9 |  | TABLE |
| [extensions.pg_stat_statements](extensions.pg_stat_statements.md) | 49 |  | VIEW |
| [extensions.pg_stat_statements_info](extensions.pg_stat_statements_info.md) | 2 |  | VIEW |
| [public._migrations](public._migrations.md) | 3 |  | TABLE |
| [public.active_engine_sessions](public.active_engine_sessions.md) | 11 |  | TABLE |
| [public.active_open_positions](public.active_open_positions.md) | 44 |  | TABLE |
| [public.active_trade_logs](public.active_trade_logs.md) | 7 |  | TABLE |
| [public.actuation_policies](public.actuation_policies.md) | 13 |  | TABLE |
| [public.adaptive_learning](public.adaptive_learning.md) | 8 | Directive 11.1B: Adaptive learning weight persistence with timestamp propagation | TABLE |
| [public.agent_learning_delta](public.agent_learning_delta.md) | 15 |  | TABLE |
| [public.agent_learning_feedback](public.agent_learning_feedback.md) | 10 |  | TABLE |
| [public.agent_registry](public.agent_registry.md) | 7 |  | TABLE |
| [public.ai_audit_log](public.ai_audit_log.md) | 10 |  | TABLE |
| [public.ai_chat_logs](public.ai_chat_logs.md) | 9 |  | TABLE |
| [public.ai_conversations](public.ai_conversations.md) | 8 |  | TABLE |
| [public.ai_lessons](public.ai_lessons.md) | 10 |  | TABLE |
| [public.ai_market_analyses](public.ai_market_analyses.md) | 10 |  | TABLE |
| [public.ai_opportunities](public.ai_opportunities.md) | 19 |  | TABLE |
| [public.ai_opportunity_runs](public.ai_opportunity_runs.md) | 13 |  | TABLE |
| [public.ai_orchestrator_logs](public.ai_orchestrator_logs.md) | 9 |  | TABLE |
| [public.ai_reports](public.ai_reports.md) | 9 |  | TABLE |
| [public.ai_transparency_log](public.ai_transparency_log.md) | 9 |  | TABLE |
| [public.alignment_audit_log](public.alignment_audit_log.md) | 9 |  | TABLE |
| [public.alignment_policies](public.alignment_policies.md) | 10 |  | TABLE |
| [public.amr_decision_ledger](public.amr_decision_ledger.md) | 11 |  | TABLE |
| [public.asset_capabilities](public.asset_capabilities.md) | 11 |  | TABLE |
| [public.asset_names](public.asset_names.md) | 8 |  | TABLE |
| [public.audit_log](public.audit_log.md) | 8 |  | TABLE |
| [public.autonomy_audit_log](public.autonomy_audit_log.md) | 11 |  | TABLE |
| [public.awareness_state_log](public.awareness_state_log.md) | 15 |  | TABLE |
| [public.b62_retroactive_labels](public.b62_retroactive_labels.md) | 12 |  | TABLE |
| [public.behavioral_log](public.behavioral_log.md) | 9 |  | TABLE |
| [public.behavioral_state](public.behavioral_state.md) | 5 |  | TABLE |
| [public.bias_correction_log](public.bias_correction_log.md) | 8 |  | TABLE |
| [public.bias_observation_log](public.bias_observation_log.md) | 9 |  | TABLE |
| [public.bob_trace_log](public.bob_trace_log.md) | 12 |  | TABLE |
| [public.calibration_ledger](public.calibration_ledger.md) | 20 |  | TABLE |
| [public.closed_trades](public.closed_trades.md) | 95 |  | TABLE |
| [public.cluster_audit_log](public.cluster_audit_log.md) | 10 |  | TABLE |
| [public.cluster_circuit_breaker](public.cluster_circuit_breaker.md) | 12 |  | TABLE |
| [public.cluster_node](public.cluster_node.md) | 14 |  | TABLE |
| [public.cluster_result_log](public.cluster_result_log.md) | 9 |  | TABLE |
| [public.cluster_task_queue](public.cluster_task_queue.md) | 14 |  | TABLE |
| [public.cognitive_core_state](public.cognitive_core_state.md) | 7 |  | TABLE |
| [public.cognitive_tuning_log](public.cognitive_tuning_log.md) | 11 |  | TABLE |
| [public.collaboration_messages](public.collaboration_messages.md) | 13 |  | TABLE |
| [public.collaboration_sessions](public.collaboration_sessions.md) | 13 |  | TABLE |
| [public.confidence_drift_log](public.confidence_drift_log.md) | 9 |  | TABLE |
| [public.config_registry](public.config_registry.md) | 6 |  | TABLE |
| [public.consensus_snapshots](public.consensus_snapshots.md) | 13 |  | TABLE |
| [public.context_bridge_log](public.context_bridge_log.md) | 9 |  | TABLE |
| [public.context_chats](public.context_chats.md) | 6 |  | TABLE |
| [public.conversation_summaries](public.conversation_summaries.md) | 14 |  | TABLE |
| [public.crew_coordination](public.crew_coordination.md) | 8 | B-CREW-COORD #554: cross-session claim/push board. Visibility + serialization, NOT atomicity (Langston 2026-07-22). No trading-path code may read this table. | TABLE |
| [public.cross_agent_ethics_session](public.cross_agent_ethics_session.md) | 13 |  | TABLE |
| [public.cross_node_alignment_log](public.cross_node_alignment_log.md) | 12 |  | TABLE |
| [public.crypto_perp_ohlc_1m](public.crypto_perp_ohlc_1m.md) | 15 |  | PARTITIONED TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_25](public.crypto_perp_ohlc_1m_2026_10_25.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_26](public.crypto_perp_ohlc_1m_2026_10_26.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_27](public.crypto_perp_ohlc_1m_2026_10_27.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_28](public.crypto_perp_ohlc_1m_2026_10_28.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_29](public.crypto_perp_ohlc_1m_2026_10_29.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_30](public.crypto_perp_ohlc_1m_2026_10_30.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_10_31](public.crypto_perp_ohlc_1m_2026_10_31.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_01](public.crypto_perp_ohlc_1m_2026_11_01.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_02](public.crypto_perp_ohlc_1m_2026_11_02.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_03](public.crypto_perp_ohlc_1m_2026_11_03.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_04](public.crypto_perp_ohlc_1m_2026_11_04.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_05](public.crypto_perp_ohlc_1m_2026_11_05.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_06](public.crypto_perp_ohlc_1m_2026_11_06.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_07](public.crypto_perp_ohlc_1m_2026_11_07.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_08](public.crypto_perp_ohlc_1m_2026_11_08.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_09](public.crypto_perp_ohlc_1m_2026_11_09.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_10](public.crypto_perp_ohlc_1m_2026_11_10.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_11](public.crypto_perp_ohlc_1m_2026_11_11.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_12](public.crypto_perp_ohlc_1m_2026_11_12.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_13](public.crypto_perp_ohlc_1m_2026_11_13.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_14](public.crypto_perp_ohlc_1m_2026_11_14.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_15](public.crypto_perp_ohlc_1m_2026_11_15.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_16](public.crypto_perp_ohlc_1m_2026_11_16.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_17](public.crypto_perp_ohlc_1m_2026_11_17.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_18](public.crypto_perp_ohlc_1m_2026_11_18.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_19](public.crypto_perp_ohlc_1m_2026_11_19.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_20](public.crypto_perp_ohlc_1m_2026_11_20.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_21](public.crypto_perp_ohlc_1m_2026_11_21.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_22](public.crypto_perp_ohlc_1m_2026_11_22.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_23](public.crypto_perp_ohlc_1m_2026_11_23.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_24](public.crypto_perp_ohlc_1m_2026_11_24.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_25](public.crypto_perp_ohlc_1m_2026_11_25.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_26](public.crypto_perp_ohlc_1m_2026_11_26.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_27](public.crypto_perp_ohlc_1m_2026_11_27.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_28](public.crypto_perp_ohlc_1m_2026_11_28.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_29](public.crypto_perp_ohlc_1m_2026_11_29.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_11_30](public.crypto_perp_ohlc_1m_2026_11_30.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_01](public.crypto_perp_ohlc_1m_2026_12_01.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_02](public.crypto_perp_ohlc_1m_2026_12_02.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_03](public.crypto_perp_ohlc_1m_2026_12_03.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_04](public.crypto_perp_ohlc_1m_2026_12_04.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_05](public.crypto_perp_ohlc_1m_2026_12_05.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_06](public.crypto_perp_ohlc_1m_2026_12_06.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_07](public.crypto_perp_ohlc_1m_2026_12_07.md) | 15 |  | TABLE |
| [public.crypto_perp_ohlc_1m_2026_12_08](public.crypto_perp_ohlc_1m_2026_12_08.md) | 15 |  | TABLE |
| [public.crypto_perp_ticker_snap](public.crypto_perp_ticker_snap.md) | 21 |  | PARTITIONED TABLE |
| [public.crypto_perp_ticker_snap_2026_10_25](public.crypto_perp_ticker_snap_2026_10_25.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_26](public.crypto_perp_ticker_snap_2026_10_26.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_27](public.crypto_perp_ticker_snap_2026_10_27.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_28](public.crypto_perp_ticker_snap_2026_10_28.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_29](public.crypto_perp_ticker_snap_2026_10_29.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_30](public.crypto_perp_ticker_snap_2026_10_30.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_10_31](public.crypto_perp_ticker_snap_2026_10_31.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_01](public.crypto_perp_ticker_snap_2026_11_01.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_02](public.crypto_perp_ticker_snap_2026_11_02.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_03](public.crypto_perp_ticker_snap_2026_11_03.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_04](public.crypto_perp_ticker_snap_2026_11_04.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_05](public.crypto_perp_ticker_snap_2026_11_05.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_06](public.crypto_perp_ticker_snap_2026_11_06.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_07](public.crypto_perp_ticker_snap_2026_11_07.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_08](public.crypto_perp_ticker_snap_2026_11_08.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_09](public.crypto_perp_ticker_snap_2026_11_09.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_10](public.crypto_perp_ticker_snap_2026_11_10.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_11](public.crypto_perp_ticker_snap_2026_11_11.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_12](public.crypto_perp_ticker_snap_2026_11_12.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_13](public.crypto_perp_ticker_snap_2026_11_13.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_14](public.crypto_perp_ticker_snap_2026_11_14.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_15](public.crypto_perp_ticker_snap_2026_11_15.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_16](public.crypto_perp_ticker_snap_2026_11_16.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_17](public.crypto_perp_ticker_snap_2026_11_17.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_18](public.crypto_perp_ticker_snap_2026_11_18.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_19](public.crypto_perp_ticker_snap_2026_11_19.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_20](public.crypto_perp_ticker_snap_2026_11_20.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_21](public.crypto_perp_ticker_snap_2026_11_21.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_22](public.crypto_perp_ticker_snap_2026_11_22.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_23](public.crypto_perp_ticker_snap_2026_11_23.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_24](public.crypto_perp_ticker_snap_2026_11_24.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_25](public.crypto_perp_ticker_snap_2026_11_25.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_26](public.crypto_perp_ticker_snap_2026_11_26.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_27](public.crypto_perp_ticker_snap_2026_11_27.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_28](public.crypto_perp_ticker_snap_2026_11_28.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_29](public.crypto_perp_ticker_snap_2026_11_29.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_11_30](public.crypto_perp_ticker_snap_2026_11_30.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_01](public.crypto_perp_ticker_snap_2026_12_01.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_02](public.crypto_perp_ticker_snap_2026_12_02.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_03](public.crypto_perp_ticker_snap_2026_12_03.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_04](public.crypto_perp_ticker_snap_2026_12_04.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_05](public.crypto_perp_ticker_snap_2026_12_05.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_06](public.crypto_perp_ticker_snap_2026_12_06.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_07](public.crypto_perp_ticker_snap_2026_12_07.md) | 21 |  | TABLE |
| [public.crypto_perp_ticker_snap_2026_12_08](public.crypto_perp_ticker_snap_2026_12_08.md) | 21 |  | TABLE |
| [public.crypto_spot_ohlc_1m](public.crypto_spot_ohlc_1m.md) | 15 |  | PARTITIONED TABLE |
| [public.crypto_spot_ohlc_1m_2026_10](public.crypto_spot_ohlc_1m_2026_10.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2026_11](public.crypto_spot_ohlc_1m_2026_11.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2026_12](public.crypto_spot_ohlc_1m_2026_12.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_01](public.crypto_spot_ohlc_1m_2027_01.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_02](public.crypto_spot_ohlc_1m_2027_02.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_03](public.crypto_spot_ohlc_1m_2027_03.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_04](public.crypto_spot_ohlc_1m_2027_04.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_05](public.crypto_spot_ohlc_1m_2027_05.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_06](public.crypto_spot_ohlc_1m_2027_06.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_07](public.crypto_spot_ohlc_1m_2027_07.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_08](public.crypto_spot_ohlc_1m_2027_08.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_09](public.crypto_spot_ohlc_1m_2027_09.md) | 15 |  | TABLE |
| [public.crypto_spot_ohlc_1m_2027_10](public.crypto_spot_ohlc_1m_2027_10.md) | 15 |  | TABLE |
| [public.crypto_spot_ticker_snap](public.crypto_spot_ticker_snap.md) | 21 |  | PARTITIONED TABLE |
| [public.crypto_spot_ticker_snap_2026_10](public.crypto_spot_ticker_snap_2026_10.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_11](public.crypto_spot_ticker_snap_2026_11.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_01](public.crypto_spot_ticker_snap_2026_12_01.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_02](public.crypto_spot_ticker_snap_2026_12_02.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_03](public.crypto_spot_ticker_snap_2026_12_03.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_04](public.crypto_spot_ticker_snap_2026_12_04.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_05](public.crypto_spot_ticker_snap_2026_12_05.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_06](public.crypto_spot_ticker_snap_2026_12_06.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_07](public.crypto_spot_ticker_snap_2026_12_07.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_08](public.crypto_spot_ticker_snap_2026_12_08.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_09](public.crypto_spot_ticker_snap_2026_12_09.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_10](public.crypto_spot_ticker_snap_2026_12_10.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_11](public.crypto_spot_ticker_snap_2026_12_11.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_12](public.crypto_spot_ticker_snap_2026_12_12.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_13](public.crypto_spot_ticker_snap_2026_12_13.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_14](public.crypto_spot_ticker_snap_2026_12_14.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_15](public.crypto_spot_ticker_snap_2026_12_15.md) | 21 |  | TABLE |
| [public.crypto_spot_ticker_snap_2026_12_16](public.crypto_spot_ticker_snap_2026_12_16.md) | 21 |  | TABLE |
| [public.daily_briefs](public.daily_briefs.md) | 15 |  | TABLE |
| [public.daily_performance_summary](public.daily_performance_summary.md) | 8 |  | TABLE |
| [public.data_archive_cold_meter](public.data_archive_cold_meter.md) | 23 |  | TABLE |
| [public.data_archive_cold_readback](public.data_archive_cold_readback.md) | 11 |  | TABLE |
| [public.data_archive_cold_upload_failure](public.data_archive_cold_upload_failure.md) | 12 |  | TABLE |
| [public.data_archive_exact_evidence](public.data_archive_exact_evidence.md) | 20 | Append-only exact source/export/download equality evidence for EVERY archive lane (B-B75-EXPORT-COMPLETENESS #1195; created as xstock_bar_archive_exact_evidence by B-XSTOCK-BAR-AVAILABILITY). One row per exported object, keyed by manifest_id; it is never updated or deleted (guard triggers), and producing_build_sha is first-write-wins. | TABLE |
| [public.data_archive_manifest](public.data_archive_manifest.md) | 27 | B75: single source of truth for archived partitions across warm + cold tiers. Future analytics rehydration schedulers query this table to locate data without knowing storage layout. | TABLE |
| [public.data_lineage](public.data_lineage.md) | 12 |  | TABLE |
| [public.database_size_logs](public.database_size_logs.md) | 4 |  | TABLE |
| [public.decision_quality_audit](public.decision_quality_audit.md) | 15 |  | TABLE |
| [public.decision_trace_log](public.decision_trace_log.md) | 16 |  | TABLE |
| [public.discovery_runs](public.discovery_runs.md) | 10 |  | TABLE |
| [public.error_logs](public.error_logs.md) | 10 |  | TABLE |
| [public.ethical_audit_log](public.ethical_audit_log.md) | 11 |  | TABLE |
| [public.ethical_principle](public.ethical_principle.md) | 9 |  | TABLE |
| [public.ethical_rule_set](public.ethical_rule_set.md) | 12 |  | TABLE |
| [public.ethical_violation_log](public.ethical_violation_log.md) | 9 |  | TABLE |
| [public.ethics_conflict_register](public.ethics_conflict_register.md) | 10 |  | TABLE |
| [public.ethics_propagation_journal](public.ethics_propagation_journal.md) | 11 |  | TABLE |
| [public.execution_attempt_audit](public.execution_attempt_audit.md) | 17 |  | TABLE |
| [public.execution_config](public.execution_config.md) | 10 |  | TABLE |
| [public.exit_decision_archive](public.exit_decision_archive.md) | 21 |  | PARTITIONED TABLE |
| [public.exit_decision_archive_2026_10](public.exit_decision_archive_2026_10.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_11](public.exit_decision_archive_2026_11.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_01](public.exit_decision_archive_2026_12_01.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_02](public.exit_decision_archive_2026_12_02.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_03](public.exit_decision_archive_2026_12_03.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_04](public.exit_decision_archive_2026_12_04.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_05](public.exit_decision_archive_2026_12_05.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_06](public.exit_decision_archive_2026_12_06.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_07](public.exit_decision_archive_2026_12_07.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_08](public.exit_decision_archive_2026_12_08.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_09](public.exit_decision_archive_2026_12_09.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_10](public.exit_decision_archive_2026_12_10.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_11](public.exit_decision_archive_2026_12_11.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_12](public.exit_decision_archive_2026_12_12.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_13](public.exit_decision_archive_2026_12_13.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_14](public.exit_decision_archive_2026_12_14.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_15](public.exit_decision_archive_2026_12_15.md) | 21 |  | TABLE |
| [public.exit_decision_archive_2026_12_16](public.exit_decision_archive_2026_12_16.md) | 21 |  | TABLE |
| [public.exit_strategy_alternates](public.exit_strategy_alternates.md) | 18 |  | TABLE |
| [public.experience_memory_log](public.experience_memory_log.md) | 10 |  | TABLE |
| [public.expert_compliance_reports](public.expert_compliance_reports.md) | 18 |  | TABLE |
| [public.expert_principles](public.expert_principles.md) | 11 |  | TABLE |
| [public.expert_response_logs](public.expert_response_logs.md) | 9 |  | TABLE |
| [public.expert_sources](public.expert_sources.md) | 12 |  | TABLE |
| [public.expert_updates](public.expert_updates.md) | 12 |  | TABLE |
| [public.federated_ethics_state](public.federated_ethics_state.md) | 8 |  | TABLE |
| [public.filter_calibration_log](public.filter_calibration_log.md) | 11 |  | TABLE |
| [public.filter_diagnostics](public.filter_diagnostics.md) | 9 |  | TABLE |
| [public.goal_alignment_profile](public.goal_alignment_profile.md) | 11 |  | TABLE |
| [public.goal_analysis_history_live](public.goal_analysis_history_live.md) | 10 |  | TABLE |
| [public.goal_analysis_history_paper](public.goal_analysis_history_paper.md) | 10 |  | TABLE |
| [public.goal_audit_log](public.goal_audit_log.md) | 10 |  | TABLE |
| [public.goals_learning_metrics](public.goals_learning_metrics.md) | 8 |  | TABLE |
| [public.goals_live](public.goals_live.md) | 8 |  | TABLE |
| [public.goals_paper](public.goals_paper.md) | 8 |  | TABLE |
| [public.goals_presets](public.goals_presets.md) | 12 |  | TABLE |
| [public.guardrails](public.guardrails.md) | 16 |  | TABLE |
| [public.guardrails_v2](public.guardrails_v2.md) | 22 |  | TABLE |
| [public.historic_signals](public.historic_signals.md) | 15 |  | TABLE |
| [public.intent_audit_log](public.intent_audit_log.md) | 14 |  | TABLE |
| [public.intraday_adjustments](public.intraday_adjustments.md) | 8 |  | TABLE |
| [public.introspection_report](public.introspection_report.md) | 11 |  | TABLE |
| [public.kill_switch](public.kill_switch.md) | 4 |  | TABLE |
| [public.kill_switch_events](public.kill_switch_events.md) | 14 |  | TABLE |
| [public.knowledge_cache](public.knowledge_cache.md) | 12 |  | TABLE |
| [public.knowledge_retrieval_log](public.knowledge_retrieval_log.md) | 10 |  | TABLE |
| [public.knowledge_trust_record](public.knowledge_trust_record.md) | 12 |  | TABLE |
| [public.latti_baseline_history](public.latti_baseline_history.md) | 19 |  | TABLE |
| [public.latti_motivation_state](public.latti_motivation_state.md) | 9 |  | TABLE |
| [public.learning_fragments](public.learning_fragments.md) | 20 |  | TABLE |
| [public.learning_history](public.learning_history.md) | 10 |  | TABLE |
| [public.learning_sources](public.learning_sources.md) | 14 |  | TABLE |
| [public.learning_weight_profile](public.learning_weight_profile.md) | 14 |  | TABLE |
| [public.lottie_oversight_log](public.lottie_oversight_log.md) | 7 |  | TABLE |
| [public.macro_feed_archive](public.macro_feed_archive.md) | 9 |  | PARTITIONED TABLE |
| [public.macro_feed_archive_2026_10](public.macro_feed_archive_2026_10.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_11](public.macro_feed_archive_2026_11.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_01](public.macro_feed_archive_2026_12_01.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_02](public.macro_feed_archive_2026_12_02.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_03](public.macro_feed_archive_2026_12_03.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_04](public.macro_feed_archive_2026_12_04.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_05](public.macro_feed_archive_2026_12_05.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_06](public.macro_feed_archive_2026_12_06.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_07](public.macro_feed_archive_2026_12_07.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_08](public.macro_feed_archive_2026_12_08.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_09](public.macro_feed_archive_2026_12_09.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_10](public.macro_feed_archive_2026_12_10.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_11](public.macro_feed_archive_2026_12_11.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_12](public.macro_feed_archive_2026_12_12.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_13](public.macro_feed_archive_2026_12_13.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_14](public.macro_feed_archive_2026_12_14.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_15](public.macro_feed_archive_2026_12_15.md) | 9 |  | TABLE |
| [public.macro_feed_archive_2026_12_16](public.macro_feed_archive_2026_12_16.md) | 9 |  | TABLE |
| [public.memory_audit_log](public.memory_audit_log.md) | 8 |  | TABLE |
| [public.meta_cognition_log](public.meta_cognition_log.md) | 9 |  | TABLE |
| [public.meta_reasoning_log](public.meta_reasoning_log.md) | 13 |  | TABLE |
| [public.model_calibration_log](public.model_calibration_log.md) | 7 |  | TABLE |
| [public.model_consistency_snapshot](public.model_consistency_snapshot.md) | 9 |  | TABLE |
| [public.module_constants](public.module_constants.md) | 9 | Module-level constants registry. Live as of B75: data_archive (B70 archive sweep retention), data_lifecycle (B75 tiered storage retention + bucket config), database_monitor (B75 alarm thresholds against Supabase Pro plan cap). NOTE: data_archive.b70_postgres_retention_days is to-be-deprecated by B75.x in favor of per-table data_lifecycle.<table>.hot_retention_days. | TABLE |
| [public.module_constants_version](public.module_constants_version.md) | 6 |  | TABLE |
| [public.pair_scan_archive](public.pair_scan_archive.md) | 16 |  | PARTITIONED TABLE |
| [public.pair_scan_archive_2026_10](public.pair_scan_archive_2026_10.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_11](public.pair_scan_archive_2026_11.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_01](public.pair_scan_archive_2026_12_01.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_02](public.pair_scan_archive_2026_12_02.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_03](public.pair_scan_archive_2026_12_03.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_04](public.pair_scan_archive_2026_12_04.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_05](public.pair_scan_archive_2026_12_05.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_06](public.pair_scan_archive_2026_12_06.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_07](public.pair_scan_archive_2026_12_07.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_08](public.pair_scan_archive_2026_12_08.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_09](public.pair_scan_archive_2026_12_09.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_10](public.pair_scan_archive_2026_12_10.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_11](public.pair_scan_archive_2026_12_11.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_12](public.pair_scan_archive_2026_12_12.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_13](public.pair_scan_archive_2026_12_13.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_14](public.pair_scan_archive_2026_12_14.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_15](public.pair_scan_archive_2026_12_15.md) | 16 |  | TABLE |
| [public.pair_scan_archive_2026_12_16](public.pair_scan_archive_2026_12_16.md) | 16 |  | TABLE |
| [public.paper_signal_trace](public.paper_signal_trace.md) | 12 |  | TABLE |
| [public.paper_sim_ghost_trades](public.paper_sim_ghost_trades.md) | 20 |  | TABLE |
| [public.paper_sim_open_positions_user_archive](public.paper_sim_open_positions_user_archive.md) | 16 |  | TABLE |
| [public.paper_sim_sessions_backup_20251023](public.paper_sim_sessions_backup_20251023.md) | 13 |  | TABLE |
| [public.paper_sim_sessions_user_archive](public.paper_sim_sessions_user_archive.md) | 13 |  | TABLE |
| [public.paper_sim_trades_user_archive](public.paper_sim_trades_user_archive.md) | 19 |  | TABLE |
| [public.paper_trades](public.paper_trades.md) | 30 |  | TABLE |
| [public.parameter_baseline](public.parameter_baseline.md) | 5 |  | TABLE |
| [public.patch_proposals](public.patch_proposals.md) | 17 |  | TABLE |
| [public.portfolio_adjustments](public.portfolio_adjustments.md) | 9 |  | TABLE |
| [public.portfolio_anchor_events](public.portfolio_anchor_events.md) | 10 |  | TABLE |
| [public.portfolio_state](public.portfolio_state.md) | 7 |  | TABLE |
| [public.portfolio_state_backup_20251023](public.portfolio_state_backup_20251023.md) | 7 |  | TABLE |
| [public.prediction_outcomes](public.prediction_outcomes.md) | 18 |  | TABLE |
| [public.price_data](public.price_data.md) | 10 |  | TABLE |
| [public.proposed_adjustments](public.proposed_adjustments.md) | 13 |  | TABLE |
| [public.reasoning_queue](public.reasoning_queue.md) | 13 |  | TABLE |
| [public.reasoning_trace](public.reasoning_trace.md) | 11 |  | TABLE |
| [public.reflection_log](public.reflection_log.md) | 12 |  | TABLE |
| [public.regime_factor_alternates](public.regime_factor_alternates.md) | 15 |  | TABLE |
| [public.response_cache](public.response_cache.md) | 10 |  | TABLE |
| [public.rtb_shadow_pairings](public.rtb_shadow_pairings.md) | 39 |  | TABLE |
| [public.rtb_shadow_pool_members](public.rtb_shadow_pool_members.md) | 25 |  | TABLE |
| [public.rtb_signals](public.rtb_signals.md) | 35 |  | TABLE |
| [public.safety_event_log](public.safety_event_log.md) | 7 |  | TABLE |
| [public.safety_policy](public.safety_policy.md) | 6 |  | TABLE |
| [public.safety_telemetry](public.safety_telemetry.md) | 19 |  | TABLE |
| [public.scheduled_job_occurrences](public.scheduled_job_occurrences.md) | 15 | B-CRON-MISSED-CATCHUP: durable admission and decision ledger; scheduled_tasks_audit remains terminal fire evidence. | TABLE |
| [public.scheduled_tasks_audit](public.scheduled_tasks_audit.md) | 8 | B-NEW-36 (2026-05-20): forensic record of scheduled-task fires from the off-hours session-lifecycle controller. task_name values: weekend_shutdown | weekend_restart | boot_state_reconciliation. status values: pending | success | error. | TABLE |
| [public.screener_filters](public.screener_filters.md) | 41 |  | TABLE |
| [public.screener_results](public.screener_results.md) | 14 |  | TABLE |
| [public.semantic_memory](public.semantic_memory.md) | 8 |  | TABLE |
| [public.signal_eval_archive](public.signal_eval_archive.md) | 15 |  | PARTITIONED TABLE |
| [public.signal_eval_archive_2026_11_09](public.signal_eval_archive_2026_11_09.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_10](public.signal_eval_archive_2026_11_10.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_11](public.signal_eval_archive_2026_11_11.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_12](public.signal_eval_archive_2026_11_12.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_13](public.signal_eval_archive_2026_11_13.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_14](public.signal_eval_archive_2026_11_14.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_15](public.signal_eval_archive_2026_11_15.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_16](public.signal_eval_archive_2026_11_16.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_17](public.signal_eval_archive_2026_11_17.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_18](public.signal_eval_archive_2026_11_18.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_19](public.signal_eval_archive_2026_11_19.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_20](public.signal_eval_archive_2026_11_20.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_21](public.signal_eval_archive_2026_11_21.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_22](public.signal_eval_archive_2026_11_22.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_23](public.signal_eval_archive_2026_11_23.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_24](public.signal_eval_archive_2026_11_24.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_25](public.signal_eval_archive_2026_11_25.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_26](public.signal_eval_archive_2026_11_26.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_27](public.signal_eval_archive_2026_11_27.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_28](public.signal_eval_archive_2026_11_28.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_29](public.signal_eval_archive_2026_11_29.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_11_30](public.signal_eval_archive_2026_11_30.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_01](public.signal_eval_archive_2026_12_01.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_02](public.signal_eval_archive_2026_12_02.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_03](public.signal_eval_archive_2026_12_03.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_04](public.signal_eval_archive_2026_12_04.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_05](public.signal_eval_archive_2026_12_05.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_06](public.signal_eval_archive_2026_12_06.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_07](public.signal_eval_archive_2026_12_07.md) | 15 |  | TABLE |
| [public.signal_eval_archive_2026_12_08](public.signal_eval_archive_2026_12_08.md) | 15 |  | TABLE |
| [public.signal_eval_provenance](public.signal_eval_provenance.md) | 24 |  | PARTITIONED TABLE |
| [public.signal_eval_provenance_2026_10](public.signal_eval_provenance_2026_10.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_11](public.signal_eval_provenance_2026_11.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_01](public.signal_eval_provenance_2026_12_01.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_02](public.signal_eval_provenance_2026_12_02.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_03](public.signal_eval_provenance_2026_12_03.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_04](public.signal_eval_provenance_2026_12_04.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_05](public.signal_eval_provenance_2026_12_05.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_06](public.signal_eval_provenance_2026_12_06.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_07](public.signal_eval_provenance_2026_12_07.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_08](public.signal_eval_provenance_2026_12_08.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_09](public.signal_eval_provenance_2026_12_09.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_10](public.signal_eval_provenance_2026_12_10.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_11](public.signal_eval_provenance_2026_12_11.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_12](public.signal_eval_provenance_2026_12_12.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_13](public.signal_eval_provenance_2026_12_13.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_14](public.signal_eval_provenance_2026_12_14.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_15](public.signal_eval_provenance_2026_12_15.md) | 24 |  | TABLE |
| [public.signal_eval_provenance_2026_12_16](public.signal_eval_provenance_2026_12_16.md) | 24 |  | TABLE |
| [public.signal_weights](public.signal_weights.md) | 10 |  | TABLE |
| [public.strategic_memory_archive](public.strategic_memory_archive.md) | 8 |  | TABLE |
| [public.strategic_memory_snapshot](public.strategic_memory_snapshot.md) | 15 |  | TABLE |
| [public.strategic_plan_log](public.strategic_plan_log.md) | 16 |  | TABLE |
| [public.strategic_simulation_log](public.strategic_simulation_log.md) | 17 |  | TABLE |
| [public.strategies](public.strategies.md) | 7 |  | TABLE |
| [public.strategy_drive_guardrail_policy](public.strategy_drive_guardrail_policy.md) | 9 |  | TABLE |
| [public.strategy_drive_metrics](public.strategy_drive_metrics.md) | 11 |  | TABLE |
| [public.strategy_drive_summary](public.strategy_drive_summary.md) | 16 |  | TABLE |
| [public.strategy_mix_log](public.strategy_mix_log.md) | 7 |  | TABLE |
| [public.strategy_param_schema](public.strategy_param_schema.md) | 12 |  | TABLE |
| [public.strategy_parameters](public.strategy_parameters.md) | 7 |  | TABLE |
| [public.strategy_settings](public.strategy_settings.md) | 11 |  | TABLE |
| [public.strategy_settings_audit](public.strategy_settings_audit.md) | 11 |  | TABLE |
| [public.switch_on_shadow_evidence](public.switch_on_shadow_evidence.md) | 22 |  | PARTITIONED TABLE |
| [public.switch_on_shadow_evidence_2026_08](public.switch_on_shadow_evidence_2026_08.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2026_09](public.switch_on_shadow_evidence_2026_09.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2026_10](public.switch_on_shadow_evidence_2026_10.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2026_11](public.switch_on_shadow_evidence_2026_11.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2026_12](public.switch_on_shadow_evidence_2026_12.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_01](public.switch_on_shadow_evidence_2027_01.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_02](public.switch_on_shadow_evidence_2027_02.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_03](public.switch_on_shadow_evidence_2027_03.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_04](public.switch_on_shadow_evidence_2027_04.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_05](public.switch_on_shadow_evidence_2027_05.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_06](public.switch_on_shadow_evidence_2027_06.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_07](public.switch_on_shadow_evidence_2027_07.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_08](public.switch_on_shadow_evidence_2027_08.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_09](public.switch_on_shadow_evidence_2027_09.md) | 22 |  | TABLE |
| [public.switch_on_shadow_evidence_2027_10](public.switch_on_shadow_evidence_2027_10.md) | 22 |  | TABLE |
| [public.system_alerts](public.system_alerts.md) | 11 |  | TABLE |
| [public.system_config](public.system_config.md) | 4 |  | TABLE |
| [public.system_context](public.system_context.md) | 27 |  | TABLE |
| [public.system_context_backup_20251023](public.system_context_backup_20251023.md) | 11 |  | TABLE |
| [public.system_settings](public.system_settings.md) | 4 |  | TABLE |
| [public.telemetry_history](public.telemetry_history.md) | 25 | Directive 11.1A: SQL-backed telemetry persistence with market regime tagging | TABLE |
| [public.telemetry_lineage](public.telemetry_lineage.md) | 7 |  | TABLE |
| [public.telemetry_state](public.telemetry_state.md) | 8 |  | TABLE |
| [public.trade_logs](public.trade_logs.md) | 10 |  | TABLE |
| [public.trades](public.trades.md) | 35 |  | TABLE |
| [public.trading_audit_log](public.trading_audit_log.md) | 7 |  | TABLE |
| [public.trading_settings_legacy](public.trading_settings_legacy.md) | 53 |  | TABLE |
| [public.trading_signals](public.trading_signals.md) | 24 |  | TABLE |
| [public.tuning_event](public.tuning_event.md) | 12 |  | TABLE |
| [public.tuning_policy](public.tuning_policy.md) | 13 |  | TABLE |
| [public.user_goals_audit](public.user_goals_audit.md) | 11 |  | TABLE |
| [public.users](public.users.md) | 14 |  | TABLE |
| [public.v_filters_active](public.v_filters_active.md) | 20 |  | VIEW |
| [public.v_goals_learning_summary](public.v_goals_learning_summary.md) | 5 |  | VIEW |
| [public.value_alignment_matrix](public.value_alignment_matrix.md) | 11 |  | TABLE |
| [public.vts_open_trades](public.vts_open_trades.md) | 27 | B79.0g — durable open VTS trade rows; written at trade-open, deleted at trade-close inside the same transaction that inserts the closed-trade row into paper_sim_trades. Rehydrated into the in-memory openVirtualTrades Map at server boot. | TABLE |
| [public.walter_actions](public.walter_actions.md) | 31 |  | TABLE |
| [public.walter_approvals_audit](public.walter_approvals_audit.md) | 8 |  | TABLE |
| [public.walter_chat_logs](public.walter_chat_logs.md) | 7 |  | TABLE |
| [public.walter_chats](public.walter_chats.md) | 13 |  | TABLE |
| [public.walter_execution_log](public.walter_execution_log.md) | 19 |  | TABLE |
| [public.walter_memory](public.walter_memory.md) | 8 |  | TABLE |
| [public.walter_pending_approvals](public.walter_pending_approvals.md) | 21 |  | TABLE |
| [public.walter_purpose](public.walter_purpose.md) | 7 |  | TABLE |
| [public.walter_user_preferences](public.walter_user_preferences.md) | 9 |  | TABLE |
| [public.watchlist_pairs](public.watchlist_pairs.md) | 16 |  | TABLE |
| [public.watchlist_pairs_backup_20251023](public.watchlist_pairs_backup_20251023.md) | 15 |  | TABLE |
| [public.watchlist_pairs_user_archive](public.watchlist_pairs_user_archive.md) | 15 |  | TABLE |
| [public.xstock_bar_aggregate_revision](public.xstock_bar_aggregate_revision.md) | 19 | B-XSTOCK-BAR-AVAILABILITY v1: immutable 15m/60m value plus exact ordered certified source-revision set. | PARTITIONED TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_01](public.xstock_bar_aggregate_revision_2026_10_01.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_02](public.xstock_bar_aggregate_revision_2026_10_02.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_03](public.xstock_bar_aggregate_revision_2026_10_03.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_04](public.xstock_bar_aggregate_revision_2026_10_04.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_05](public.xstock_bar_aggregate_revision_2026_10_05.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_06](public.xstock_bar_aggregate_revision_2026_10_06.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_07](public.xstock_bar_aggregate_revision_2026_10_07.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_08](public.xstock_bar_aggregate_revision_2026_10_08.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_09](public.xstock_bar_aggregate_revision_2026_10_09.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_10](public.xstock_bar_aggregate_revision_2026_10_10.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_11](public.xstock_bar_aggregate_revision_2026_10_11.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_12](public.xstock_bar_aggregate_revision_2026_10_12.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_13](public.xstock_bar_aggregate_revision_2026_10_13.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_14](public.xstock_bar_aggregate_revision_2026_10_14.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_15](public.xstock_bar_aggregate_revision_2026_10_15.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_16](public.xstock_bar_aggregate_revision_2026_10_16.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_17](public.xstock_bar_aggregate_revision_2026_10_17.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_18](public.xstock_bar_aggregate_revision_2026_10_18.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_19](public.xstock_bar_aggregate_revision_2026_10_19.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_20](public.xstock_bar_aggregate_revision_2026_10_20.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_21](public.xstock_bar_aggregate_revision_2026_10_21.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_22](public.xstock_bar_aggregate_revision_2026_10_22.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_23](public.xstock_bar_aggregate_revision_2026_10_23.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_24](public.xstock_bar_aggregate_revision_2026_10_24.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_25](public.xstock_bar_aggregate_revision_2026_10_25.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_26](public.xstock_bar_aggregate_revision_2026_10_26.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_27](public.xstock_bar_aggregate_revision_2026_10_27.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_28](public.xstock_bar_aggregate_revision_2026_10_28.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_29](public.xstock_bar_aggregate_revision_2026_10_29.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_30](public.xstock_bar_aggregate_revision_2026_10_30.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_10_31](public.xstock_bar_aggregate_revision_2026_10_31.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_01](public.xstock_bar_aggregate_revision_2026_11_01.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_02](public.xstock_bar_aggregate_revision_2026_11_02.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_03](public.xstock_bar_aggregate_revision_2026_11_03.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_04](public.xstock_bar_aggregate_revision_2026_11_04.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_05](public.xstock_bar_aggregate_revision_2026_11_05.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_06](public.xstock_bar_aggregate_revision_2026_11_06.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_07](public.xstock_bar_aggregate_revision_2026_11_07.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_08](public.xstock_bar_aggregate_revision_2026_11_08.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_09](public.xstock_bar_aggregate_revision_2026_11_09.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_10](public.xstock_bar_aggregate_revision_2026_11_10.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_11](public.xstock_bar_aggregate_revision_2026_11_11.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_12](public.xstock_bar_aggregate_revision_2026_11_12.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_13](public.xstock_bar_aggregate_revision_2026_11_13.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_14](public.xstock_bar_aggregate_revision_2026_11_14.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_15](public.xstock_bar_aggregate_revision_2026_11_15.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_16](public.xstock_bar_aggregate_revision_2026_11_16.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_17](public.xstock_bar_aggregate_revision_2026_11_17.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_18](public.xstock_bar_aggregate_revision_2026_11_18.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_19](public.xstock_bar_aggregate_revision_2026_11_19.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_20](public.xstock_bar_aggregate_revision_2026_11_20.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_21](public.xstock_bar_aggregate_revision_2026_11_21.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_22](public.xstock_bar_aggregate_revision_2026_11_22.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_23](public.xstock_bar_aggregate_revision_2026_11_23.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_24](public.xstock_bar_aggregate_revision_2026_11_24.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_25](public.xstock_bar_aggregate_revision_2026_11_25.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_26](public.xstock_bar_aggregate_revision_2026_11_26.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_27](public.xstock_bar_aggregate_revision_2026_11_27.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_28](public.xstock_bar_aggregate_revision_2026_11_28.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_29](public.xstock_bar_aggregate_revision_2026_11_29.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_11_30](public.xstock_bar_aggregate_revision_2026_11_30.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_01](public.xstock_bar_aggregate_revision_2026_12_01.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_02](public.xstock_bar_aggregate_revision_2026_12_02.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_03](public.xstock_bar_aggregate_revision_2026_12_03.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_04](public.xstock_bar_aggregate_revision_2026_12_04.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_05](public.xstock_bar_aggregate_revision_2026_12_05.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_06](public.xstock_bar_aggregate_revision_2026_12_06.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_07](public.xstock_bar_aggregate_revision_2026_12_07.md) | 19 |  | TABLE |
| [public.xstock_bar_aggregate_revision_2026_12_08](public.xstock_bar_aggregate_revision_2026_12_08.md) | 19 |  | TABLE |
| [public.xstock_bar_clock_guard](public.xstock_bar_clock_guard.md) | 6 |  | TABLE |
| [public.xstock_bar_projection_flush_admission](public.xstock_bar_projection_flush_admission.md) | 9 | Append-only xStock logical flush population admitted before projection. | TABLE |
| [public.xstock_bar_projection_flush_completion](public.xstock_bar_projection_flush_completion.md) | 13 | Append-only xStock projection completion committed atomically with immutable revision events. | TABLE |
| [public.xstock_bar_revision_event](public.xstock_bar_revision_event.md) | 28 | B-XSTOCK-BAR-AVAILABILITY v1: append-only post-buffer projection attempts. interval_begin remains the Kraken label; visibility is a later primary observation. | PARTITIONED TABLE |
| [public.xstock_bar_revision_event_2026_11_16](public.xstock_bar_revision_event_2026_11_16.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_17](public.xstock_bar_revision_event_2026_11_17.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_18](public.xstock_bar_revision_event_2026_11_18.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_19](public.xstock_bar_revision_event_2026_11_19.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_20](public.xstock_bar_revision_event_2026_11_20.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_21](public.xstock_bar_revision_event_2026_11_21.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_22](public.xstock_bar_revision_event_2026_11_22.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_23](public.xstock_bar_revision_event_2026_11_23.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_24](public.xstock_bar_revision_event_2026_11_24.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_25](public.xstock_bar_revision_event_2026_11_25.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_26](public.xstock_bar_revision_event_2026_11_26.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_27](public.xstock_bar_revision_event_2026_11_27.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_28](public.xstock_bar_revision_event_2026_11_28.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_29](public.xstock_bar_revision_event_2026_11_29.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_11_30](public.xstock_bar_revision_event_2026_11_30.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_01](public.xstock_bar_revision_event_2026_12_01.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_02](public.xstock_bar_revision_event_2026_12_02.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_03](public.xstock_bar_revision_event_2026_12_03.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_04](public.xstock_bar_revision_event_2026_12_04.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_05](public.xstock_bar_revision_event_2026_12_05.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_06](public.xstock_bar_revision_event_2026_12_06.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_07](public.xstock_bar_revision_event_2026_12_07.md) | 28 |  | TABLE |
| [public.xstock_bar_revision_event_2026_12_08](public.xstock_bar_revision_event_2026_12_08.md) | 28 |  | TABLE |
| [public.xstock_bar_window_manifest](public.xstock_bar_window_manifest.md) | 14 | B-XSTOCK-BAR-AVAILABILITY v1: content-addressed ordered aggregate window, shared by decision provenance instead of repeating revision arrays. | TABLE |
| [public.xstock_bar_writer_boot_start](public.xstock_bar_writer_boot_start.md) | 5 | Append-only xStock writer boot chain used to prove deploy-safe observation continuity. | TABLE |
| [public.xstock_bar_writer_handoff](public.xstock_bar_writer_handoff.md) | 12 | Append-only clean-drain proof for one xStock writer boot before a deploy or restart. | TABLE |
| [public.xstock_book_state_rings](public.xstock_book_state_rings.md) | 6 | 3n.q8 B-BOOK-STATE-RESTART-DURABLE (#1066): the xStock book-state guard's retained spread rings (SIM S25b), one row per symbol, so a restart does not make every first seed unjudged. Written and read only by book-state-ring-store.ts. | TABLE |
| [public.xstock_dbs_backfill](public.xstock_dbs_backfill.md) | 12 |  | TABLE |
| [public.xstock_dbs_backfill_60m_archive](public.xstock_dbs_backfill_60m_archive.md) | 12 |  | TABLE |
| [public.xstock_perp_ohlc_1m](public.xstock_perp_ohlc_1m.md) | 15 |  | PARTITIONED TABLE |
| [public.xstock_perp_ohlc_1m_2026_10](public.xstock_perp_ohlc_1m_2026_10.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2026_11](public.xstock_perp_ohlc_1m_2026_11.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2026_12](public.xstock_perp_ohlc_1m_2026_12.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_01](public.xstock_perp_ohlc_1m_2027_01.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_02](public.xstock_perp_ohlc_1m_2027_02.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_03](public.xstock_perp_ohlc_1m_2027_03.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_04](public.xstock_perp_ohlc_1m_2027_04.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_05](public.xstock_perp_ohlc_1m_2027_05.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_06](public.xstock_perp_ohlc_1m_2027_06.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_07](public.xstock_perp_ohlc_1m_2027_07.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_08](public.xstock_perp_ohlc_1m_2027_08.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_09](public.xstock_perp_ohlc_1m_2027_09.md) | 15 |  | TABLE |
| [public.xstock_perp_ohlc_1m_2027_10](public.xstock_perp_ohlc_1m_2027_10.md) | 15 |  | TABLE |
| [public.xstock_perp_ticker_snap](public.xstock_perp_ticker_snap.md) | 21 |  | PARTITIONED TABLE |
| [public.xstock_perp_ticker_snap_2026_10](public.xstock_perp_ticker_snap_2026_10.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_11](public.xstock_perp_ticker_snap_2026_11.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_01](public.xstock_perp_ticker_snap_2026_12_01.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_02](public.xstock_perp_ticker_snap_2026_12_02.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_03](public.xstock_perp_ticker_snap_2026_12_03.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_04](public.xstock_perp_ticker_snap_2026_12_04.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_05](public.xstock_perp_ticker_snap_2026_12_05.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_06](public.xstock_perp_ticker_snap_2026_12_06.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_07](public.xstock_perp_ticker_snap_2026_12_07.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_08](public.xstock_perp_ticker_snap_2026_12_08.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_09](public.xstock_perp_ticker_snap_2026_12_09.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_10](public.xstock_perp_ticker_snap_2026_12_10.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_11](public.xstock_perp_ticker_snap_2026_12_11.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_12](public.xstock_perp_ticker_snap_2026_12_12.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_13](public.xstock_perp_ticker_snap_2026_12_13.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_14](public.xstock_perp_ticker_snap_2026_12_14.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_15](public.xstock_perp_ticker_snap_2026_12_15.md) | 21 |  | TABLE |
| [public.xstock_perp_ticker_snap_2026_12_16](public.xstock_perp_ticker_snap_2026_12_16.md) | 21 |  | TABLE |
| [public.xstock_qd_probe_history](public.xstock_qd_probe_history.md) | 19 |  | TABLE |
| [public.xstock_spot_ohlc_15m_snapshot](public.xstock_spot_ohlc_15m_snapshot.md) | 19 | B.4 foundation (2026-06-03): pre-aggregated 15-min OHLC buckets per xStock symbol. Parallel to xstock_spot_ohlc_60m_snapshot; populated by the prewarm script + cache write-back-on-miss on the 15-min cold-read path. Cap sized to DBS-192 + margin (~224 buckets/symbol). xStock-scoped; crypto unaffected. | TABLE |
| [public.xstock_spot_ohlc_1m](public.xstock_spot_ohlc_1m.md) | 18 |  | PARTITIONED TABLE |
| [public.xstock_spot_ohlc_1m_2026_10](public.xstock_spot_ohlc_1m_2026_10.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2026_11](public.xstock_spot_ohlc_1m_2026_11.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2026_12](public.xstock_spot_ohlc_1m_2026_12.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_01](public.xstock_spot_ohlc_1m_2027_01.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_02](public.xstock_spot_ohlc_1m_2027_02.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_03](public.xstock_spot_ohlc_1m_2027_03.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_04](public.xstock_spot_ohlc_1m_2027_04.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_05](public.xstock_spot_ohlc_1m_2027_05.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_06](public.xstock_spot_ohlc_1m_2027_06.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_07](public.xstock_spot_ohlc_1m_2027_07.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_08](public.xstock_spot_ohlc_1m_2027_08.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_09](public.xstock_spot_ohlc_1m_2027_09.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_1m_2027_10](public.xstock_spot_ohlc_1m_2027_10.md) | 18 |  | TABLE |
| [public.xstock_spot_ohlc_60m_snapshot](public.xstock_spot_ohlc_60m_snapshot.md) | 19 | B-NEW-34b (2026-05-18): Pre-aggregated 60-min OHLC buckets per xStock symbol. Cache reads on cold-start to satisfy min_ohlc_history_bars floor without live DISTINCT ON aggregation over xstock_spot_ohlc_1m duplicate rows. Refreshed by one-off pre-warm script + cache write-back-on-miss + (future B-NEW-36) weekly Fri-night/Sun-night session-lifecycle pre-warm. | TABLE |
| [public.xstock_spot_ticker_snap](public.xstock_spot_ticker_snap.md) | 21 |  | PARTITIONED TABLE |
| [public.xstock_spot_ticker_snap_2026_10_25](public.xstock_spot_ticker_snap_2026_10_25.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_26](public.xstock_spot_ticker_snap_2026_10_26.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_27](public.xstock_spot_ticker_snap_2026_10_27.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_28](public.xstock_spot_ticker_snap_2026_10_28.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_29](public.xstock_spot_ticker_snap_2026_10_29.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_30](public.xstock_spot_ticker_snap_2026_10_30.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_10_31](public.xstock_spot_ticker_snap_2026_10_31.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_01](public.xstock_spot_ticker_snap_2026_11_01.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_02](public.xstock_spot_ticker_snap_2026_11_02.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_03](public.xstock_spot_ticker_snap_2026_11_03.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_04](public.xstock_spot_ticker_snap_2026_11_04.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_05](public.xstock_spot_ticker_snap_2026_11_05.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_06](public.xstock_spot_ticker_snap_2026_11_06.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_07](public.xstock_spot_ticker_snap_2026_11_07.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_08](public.xstock_spot_ticker_snap_2026_11_08.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_09](public.xstock_spot_ticker_snap_2026_11_09.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_10](public.xstock_spot_ticker_snap_2026_11_10.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_11](public.xstock_spot_ticker_snap_2026_11_11.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_12](public.xstock_spot_ticker_snap_2026_11_12.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_13](public.xstock_spot_ticker_snap_2026_11_13.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_14](public.xstock_spot_ticker_snap_2026_11_14.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_15](public.xstock_spot_ticker_snap_2026_11_15.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_16](public.xstock_spot_ticker_snap_2026_11_16.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_17](public.xstock_spot_ticker_snap_2026_11_17.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_18](public.xstock_spot_ticker_snap_2026_11_18.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_19](public.xstock_spot_ticker_snap_2026_11_19.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_20](public.xstock_spot_ticker_snap_2026_11_20.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_21](public.xstock_spot_ticker_snap_2026_11_21.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_22](public.xstock_spot_ticker_snap_2026_11_22.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_23](public.xstock_spot_ticker_snap_2026_11_23.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_24](public.xstock_spot_ticker_snap_2026_11_24.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_25](public.xstock_spot_ticker_snap_2026_11_25.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_26](public.xstock_spot_ticker_snap_2026_11_26.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_27](public.xstock_spot_ticker_snap_2026_11_27.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_28](public.xstock_spot_ticker_snap_2026_11_28.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_29](public.xstock_spot_ticker_snap_2026_11_29.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_11_30](public.xstock_spot_ticker_snap_2026_11_30.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_01](public.xstock_spot_ticker_snap_2026_12_01.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_02](public.xstock_spot_ticker_snap_2026_12_02.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_03](public.xstock_spot_ticker_snap_2026_12_03.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_04](public.xstock_spot_ticker_snap_2026_12_04.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_05](public.xstock_spot_ticker_snap_2026_12_05.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_06](public.xstock_spot_ticker_snap_2026_12_06.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_07](public.xstock_spot_ticker_snap_2026_12_07.md) | 21 |  | TABLE |
| [public.xstock_spot_ticker_snap_2026_12_08](public.xstock_spot_ticker_snap_2026_12_08.md) | 21 |  | TABLE |
| [public.xstock_spot_universe](public.xstock_spot_universe.md) | 10 |  | TABLE |
| [public.xstock_spot_universe_overrides](public.xstock_spot_universe_overrides.md) | 8 |  | TABLE |
| [realtime.messages](realtime.messages.md) | 11 |  | PARTITIONED TABLE |
| [realtime.schema_migrations](realtime.schema_migrations.md) | 2 |  | TABLE |
| [realtime.subscription](realtime.subscription.md) | 9 |  | TABLE |
| [storage.bucket_lifecycle_states](storage.bucket_lifecycle_states.md) | 13 |  | TABLE |
| [storage.buckets](storage.buckets.md) | 14 |  | TABLE |
| [storage.buckets_analytics](storage.buckets_analytics.md) | 7 |  | TABLE |
| [storage.buckets_vectors](storage.buckets_vectors.md) | 4 |  | TABLE |
| [storage.lifecycle_abandoned_artifacts](storage.lifecycle_abandoned_artifacts.md) | 5 |  | TABLE |
| [storage.migrations](storage.migrations.md) | 4 |  | TABLE |
| [storage.objects](storage.objects.md) | 15 |  | TABLE |
| [storage.s3_multipart_uploads](storage.s3_multipart_uploads.md) | 10 |  | TABLE |
| [storage.s3_multipart_uploads_parts](storage.s3_multipart_uploads_parts.md) | 10 |  | TABLE |
| [storage.vector_indexes](storage.vector_indexes.md) | 9 |  | TABLE |
| [vault.decrypted_secrets](vault.decrypted_secrets.md) | 9 |  | VIEW |
| [vault.secrets](vault.secrets.md) | 8 | Table with encrypted `secret` column for storing sensitive information on disk. | TABLE |

## Enums

| Name | Values |
| ---- | ------- |
| auth.aal_level | aal1, aal2, aal3 |
| auth.code_challenge_method | s256, plain |
| auth.factor_status | unverified, verified |
| auth.factor_type | totp, webauthn, phone, recovery_code |
| auth.oauth_authorization_status | pending, approved, denied, expired |
| auth.oauth_client_type | public, confidential |
| auth.oauth_registration_type | dynamic, manual |
| auth.oauth_response_type | code |
| auth.one_time_token_type | confirmation_token, reauthentication_token, recovery_token, email_change_token_new, email_change_token_current, phone_change_token |
| public.agent_state | active, idle, suspended, terminated |
| public.alignment_status | compliant, at_risk, violated |
| public.alignment_strategy | accept, reject, blend |
| public.alignment_verification_result | approved, flagged, rejected |
| public.approval_display_mode | inline, notification |
| public.approval_status | pending, approved, rejected, cancelled, dismissed |
| public.audit_entity_type | guardrails, filters |
| public.autonomy_action_type | self_check, self_reasoning, exploration, optimization |
| public.awareness_emotional_state | stable, focused, alert, fatigued, overloaded, recovering |
| public.behavioral_trigger_type | adaptive_change, user_override, risk_trigger, performance_feedback, coherency_violation |
| public.bias_type | confirmation, recency, anchoring, overconfidence, availability, optimism |
| public.circuit_breaker_state | closed, open, half_open |
| public.cluster_task_status | queued, assigned, running, completed, failed, cancelled |
| public.cluster_task_type | trading_signal, market_analysis, risk_assessment, compliance_check, research, optimization, general |
| public.cognitive_test_result | PASS, WARN, FAIL |
| public.collaboration_role | coordinator, analyst, executor, reviewer, observer |
| public.compliance_status | compliant, warning, violation, override |
| public.conflict_resolution | open, resolved, escalated |
| public.consensus_state | forming, discussing, evaluating, agreed, disagreed, overridden |
| public.daily_brief_status | in_progress, final |
| public.domain_channel | research_to_trading, compliance_to_trading, analytics_to_research, trading_to_analytics |
| public.ethical_priority | critical, high, medium, low |
| public.ethical_verdict | approved, rejected, requires_review |
| public.evaluation_status | pending, simulating, completed, failed |
| public.event_significance | minor, significant, critical |
| public.execution_block_reason | KILL_SWITCH, NO_STOP_LOSS, INVALID_STOP_LOSS, POSITION_LIMIT, COOLDOWN, MAX_POSITION, LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, FX_CONVERSION_FAILED, PORTFOLIO_RISK, INSUFFICIENT_BALANCE, MAX_EXPOSURE, MAX_TRADES, MAX_TOTAL_EXPOSURE, ENGINE_STOPPING, CORRELATION_EXPOSURE, GUARDRAIL_READ_FAIL, MONEY_HELD_UNAVAILABLE |
| public.execution_decision | OPENED, BLOCKED |
| public.execution_event_type | trade, balance_update, risk_report, engine_event, anomaly, strategy_signal |
| public.federated_scope | global, trading, devops, ux, fullstack |
| public.feedback_source | self, peer, system |
| public.gate_type | safety, federated_ethics, ethical_reasoning, knowledge_acquisition |
| public.goals_preset_name | conservative, baseline, optimistic, maximum, custom |
| public.knowledge_source | web, api, research, market, internal |
| public.learning_delta_type | model_update, discovery, insight, strategy_adjustment, risk_parameter |
| public.learning_mode | slow, normal, aggressive, disabled |
| public.learning_phase | observation, adjustment, evaluation |
| public.market_regime | EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION |
| public.memory_audit_status | VERIFIED, UNVERIFIED, REPAIRED |
| public.memory_scope | short_term, medium_term, long_term |
| public.meta_analysis_result | coherent, inconsistent, requires_correction |
| public.node_role | coordinator, trading, research, analysis, compliance, general |
| public.node_status | healthy, degraded, draining, offline |
| public.opportunity_status | new, watchlist, executed, dismissed, expired |
| public.opportunity_type | long_term_hold, moonshot, momentum, breakout, mean_reversion |
| public.optimization_type | parameter_tuning, architecture_adjustment, policy_refinement |
| public.outcome_confidence | very_low, low, medium, high, very_high |
| public.outcome_status | success, partial, failed, timeout |
| public.oversight_flag_type | instability, bias, low_confidence, conflict, performance_drop |
| public.patch_severity | critical, high, medium, low, info |
| public.patch_status | pending, approved, rejected, applied |
| public.pattern_type | PINBAR, ENGULFING, INSIDE_BAR, MORNING_STAR, THREE_SOLDIERS, ABCD |
| public.plan_status | draft, active, paused, completed |
| public.policy_type | ethical, functional, operational, risk |
| public.principle_type | foundational, operational, contextual |
| public.propagation_status | pending, success, failed, retrying |
| public.quality_rating | poor, fair, good, excellent |
| public.reasoning_queue_status | pending, in_progress, completed, failed |
| public.reflection_depth | surface, analytical, deep, meta |
| public.retrieval_trust_level | low, medium, high, verified |
| public.rtb_signal_status | queued, promoted, expired, rejected, reconfirmed, active |
| public.safety_scope | global, trading, autonomy, analysis |
| public.safety_severity | low, medium, high, critical |
| public.scenario_type | risk_assessment, strategy_optimization, market_condition, decision_replay, what_if_analysis |
| public.signal_type | QUANT, PATTERN, HYBRID |
| public.strategy_type | vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma, range_trade, momentum_breakout, volatility_squeeze, trend_following, range_bound, breakout_pullback, divergence, accumulation_distribution, order_flow, morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge, strong_bull_trend, orb |
| public.trace_stage | filter, strategy, signal |
| public.trade_status | open, closed, cancelled |
| public.trade_type | buy, sell |
| public.trading_mode | live, paper, passive, learning |
| public.trading_status | active, stopped |
| public.tuning_aggressiveness | conservative, balanced, aggressive |
| public.tuning_approval_type | auto, manual |
| public.tuning_status | pending, success, failed |
| public.user_role | owner, editor, viewer |
| public.value_category | safety, fairness, transparency, accountability, user_welfare |
| public.violation_severity | low, medium, high, critical |
| public.walter_action_category | feed, formula, system, risk, performance |
| public.walter_action_status | pending, in_progress, completed, failed, acknowledged, approved, rejected |
| public.walter_action_type | feed_reconnect, feed_pause, formula_recalc, cache_refresh, health_check, threshold_adjust, auto_suppress, escalate |
| public.walter_chat_status | active, archived |
| public.walter_memory_type | observation, decision, result, goal, lesson, purpose, system_state, development_history, contextual_reference |
| public.walter_theme | light, dark, system |
| public.walter_tone | professional, analytical, warm, concise |
| public.walter_view_mode | compact, expanded |
| realtime.action | INSERT, UPDATE, DELETE, TRUNCATE, ERROR |
| realtime.equality_op | eq, neq, lt, lte, gt, gte, in, like, ilike, is, match, imatch, isdistinct |
| storage.buckettype | STANDARD, ANALYTICS, VECTOR |

## Relations

![er](schema.svg)

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
