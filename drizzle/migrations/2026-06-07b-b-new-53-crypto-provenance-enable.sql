-- B-NEW-53 (crypto enable) — turn ON decision-provenance capture for crypto_spot.
-- Kyle directive 2026-06-07: capture crypto decision data now too (we want it for
-- the Phase-25 calibration; storage is ~1 GB/month more, ~7.5 GB combined at 90d —
-- Langston's own "trivial"). The crypto capture hooks in vts-runner.ts ship in the
-- same change; this flag flips on after the code deploys. Additive, telemetry-only,
-- active trading OFF.
UPDATE module_constants
   SET value = 'true'::jsonb, updated_by = 'b-new-53-crypto-enable'
 WHERE module_name = 'data_archive'
   AND exchange = '*'
   AND asset_class = 'crypto_spot'
   AND strategy = '*'
   AND regime = '*'
   AND constant_name = 'b_new_53_provenance_capture_enabled';
