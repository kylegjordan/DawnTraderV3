-- ROLLBACK for 2026-10-07-b-venue-quiet-alerting.sql (B-VENUE-QUIET-ALERTING, #526/#994/#638).
-- Revert the code (the `venue_quiet` entry in b72-warmup.ts PREFETCH_MODULES) FIRST or together: with the module still
-- prefetched and these rows gone, the warm-up finds zero rows and boot hard-fails by design.

BEGIN;
SET LOCAL lock_timeout = '5s';

DELETE FROM module_constants WHERE module_name = 'venue_quiet' AND updated_by = 'b-venue-quiet-alerting';
DELETE FROM _migrations WHERE name = '2026-10-07-b-venue-quiet-alerting.sql';

COMMIT;
