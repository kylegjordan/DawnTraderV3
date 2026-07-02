-- P19-B-RENAME Wave-2: rename the module_constants MODULE KEYS for the active-path
-- config namespaces (code reads renamed in the same commit — lockstep):
--   paper_execution -> active_execution
--   paper_sizing    -> active_sizing
-- These are CONFIG lookup keys (read fresh per resolve), not historical data rows —
-- distinct from the KEEP-AS-DATA 'paper_sim' learning discriminator (Langston ruling),
-- which this migration deliberately does NOT touch.

UPDATE module_constants SET module_name = 'active_execution' WHERE module_name = 'paper_execution';
UPDATE module_constants SET module_name = 'active_sizing'    WHERE module_name = 'paper_sizing';
