import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// B-WORKFLOW-IMPROVE OBJ-10 (Q9): runs only the enum-parity check, in its own ci.yml step with
// continue-on-error, outside the required result. The main include never matches *.parity.ts.
// Spread, not mergeConfig: mergeConfig concatenates arrays, which would add the whole main include.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['server/tests/enum-parity/enum-parity.parity.ts'] },
});
