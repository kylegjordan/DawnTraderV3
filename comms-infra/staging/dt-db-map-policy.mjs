export const DAY_MS = 86_400_000;

export function weeklyAlertActions({ success, structuralMatch }) {
  if (!success) return [{ command: 'add', key: 'db-map:failure' }];
  return [
    { command: 'resolve-key', key: 'db-map:failure' },
    { command: 'resolve-key', key: 'db-map:run-stale' },
    { command: structuralMatch ? 'resolve-key' : 'add', key: 'db-map:drift' },
  ];
}

export function freshnessAlertActions({ runAgeMs, baselineAgeMs }) {
  return [
    { command: runAgeMs > 8 * DAY_MS ? 'add' : 'resolve-key', key: 'db-map:run-stale' },
    { command: !Number.isFinite(baselineAgeMs) || baselineAgeMs > 35 * DAY_MS ? 'add' : 'resolve-key', key: 'db-map:baseline-stale' },
  ];
}
