-- B73 rollback — drop exit_strategy_alternates table + module_constants
BEGIN;
DROP TABLE IF EXISTS exit_strategy_alternates;
DELETE FROM module_constants WHERE module_name = 'exit_strategy_replay';
COMMIT;
