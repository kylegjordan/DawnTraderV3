-- B79.0g-tx rollback: remove the data_lifecycle seed row.

BEGIN;

DELETE FROM module_constants
 WHERE module_name='data_lifecycle'
   AND constant_name='vts_open_trades.closed_gc_retention_days';

COMMIT;
