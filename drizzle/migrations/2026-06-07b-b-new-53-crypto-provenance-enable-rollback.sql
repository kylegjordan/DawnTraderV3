-- ROLLBACK for 2026-06-07b-b-new-53-crypto-provenance-enable.sql
-- Turn crypto_spot decision-provenance capture back OFF (fail-closed default).
UPDATE module_constants
   SET value = 'false'::jsonb, updated_by = 'b-new-53-crypto-disable'
 WHERE module_name = 'data_archive'
   AND exchange = '*'
   AND asset_class = 'crypto_spot'
   AND strategy = '*'
   AND regime = '*'
   AND constant_name = 'b_new_53_provenance_capture_enabled';
