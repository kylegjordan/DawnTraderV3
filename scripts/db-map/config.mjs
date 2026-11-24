export const CONFIG = Object.freeze({
  schemaVersion: 1,
  scannerVersion: 3,
  catalogVersion: 1,
  runtime: Object.freeze({
    nodeVersion: 'v20.20.0',
    nodeSha256: 'd01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e',
    typescriptVersion: '5.6.3',
    typescriptSha256: 'f316520790d4db220a10d890c5f85310e26a1bd3c104b8d3b5eb62ba0491651b',
  }),
  suffixes: Object.freeze([
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts',
    '.py', '.pyw', '.sh', '.sql', '.yml', '.yaml',
  ]),
  excludedPrefixes: Object.freeze([
    'Claude Comms and Packages/',
    'docs/',
    'diagnostic-reports/',
    'attached_assets/',
    'logs/',
    'backups and data dumps/',
    '1-system-manual/',
  ]),
  testMarkers: Object.freeze(['/test/', '/tests/', '.test.', '_test.', '/fixtures/']),
  migrationPrefixes: Object.freeze(['drizzle/', 'migrations/']),
  operatorPrefixes: Object.freeze(['scripts/', 'comms-infra/', '.github/']),
  tbls: Object.freeze({
    version: '1.97.0',
    archive: 'tbls_v1.97.0_linux_amd64.tar.gz',
    archiveBytes: 31694635,
    archiveSha256: '43c81f408495d9b626d0265a6ebb57c6d1c4a5e072d3eecc3e88825cc6c64e9a',
    binarySha256: '44bf748bf0b8f4ed66c21173d19792714a61953b5dff21da8805cb7caa1f6258',
    schemaSha256: '23661bddf4ec0ab475a5953c4f71201a849c7e3ee2510bbed150b8ee2e1eb049',
    license: 'MIT',
  }),
  requiredCatalogSections: Object.freeze([
    'meta', 'schemas', 'relations', 'columns', 'constraints',
    'indexes', 'partition_edges', 'policies', 'enums',
  ]),
  rlsWarning: 'dt_reader does not bypass row-level security; reader-visible emptiness is not proof that a relation is empty.',
});

export function classifyPath(path) {
  const slash = `/${path}`;
  if (CONFIG.testMarkers.some((marker) => slash.includes(marker))) return 'test_only';
  if (CONFIG.migrationPrefixes.some((prefix) => path.startsWith(prefix))) return 'migration_ddl';
  if (CONFIG.operatorPrefixes.some((prefix) => path.startsWith(prefix))) return 'operator';
  if (path.startsWith('bridge/canonical/')) return 'legacy';
  return 'runtime';
}
