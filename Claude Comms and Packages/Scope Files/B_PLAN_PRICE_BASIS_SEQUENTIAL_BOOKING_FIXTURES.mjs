import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import ts from 'typescript';

// Offline only. Replay the pinned VTS operations without loading the server or its persistence module.
const sourceRef = 'f223d722f4da9f1396df229e41bce5d79f76598c';
const sourcePath = 'server/services/vts-runner.ts';
const runner = execFileSync('git', ['show', `${sourceRef}:${sourcePath}`], { encoding: 'utf8' });
const source = ts.createSourceFile(sourcePath, runner, ts.ScriptTarget.ES2020, true);
const names = [
  'openVirtualTrades', 'recentCloses', 'lastSetupHash',
  'getReentryCooldownMs', 'getSetupHashTolerance', 'getSetupHashExpiryMs',
  'computeSetupHash', 'pruneReentryMaps', 'registerOpenVtsTrade', 'finishVtsClose',
  'getVtsRecentCloseAt', 'isIdenticalXstockSetupSuppressed', 'checkPreOpenGates',
];
const declarations = new Map();
for (const statement of source.statements) {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    declarations.set(statement.name.text, statement.getText(source));
  }
  if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    const [declaration] = statement.declarationList.declarations;
    if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, statement.getText(source));
  }
}
const pinnedOperations = names.map(name => {
  assert.ok(declarations.has(name), `missing replay declaration ${name}`);
  return declarations.get(name);
});
const { outputText, diagnostics } = ts.transpileModule([
  ...pinnedOperations,
  'exports.offline = { openVirtualTrades, finishVtsClose, pruneReentryMaps };',
].join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal(diagnostics.length, 0);
const replay = new Script(outputText, { filename: `fixture:${sourcePath}@${sourceRef}` });

const instrument = { assetClass: 'xstock_spot', symbol: 'FIXTURE/USD', strategy: 'morning_star' };
const address = [instrument.assetClass, instrument.symbol, instrument.strategy];
const setupKey = address.join(':');
const seed = { entryPrice: 100, stopLoss: 98, takeProfit: 105 };
const marketMark = 100.5;

function makeArm({ cooldown = 300, expiry = 1_000, savedRows = [] } = {}) {
  let now = 1_000;
  let rejectNextInsert = false;
  let closeWriteLag = 0;
  let observeCloseWrite;
  const persisted = new Map(savedRows);
  const constants = new Map([
    ['reentry_cooldown_ms', cooldown], ['setup_hash_expiry_ms', expiry], ['setup_hash_tolerance', 0.001],
  ]);
  const exports = {};
  replay.runInNewContext({
    exports,
    Date: { now: () => now },
    console: { log() {}, warn() {}, error() {} },
    _VTS_GK: {},
    _amrWeatherMod: undefined,
    _vtsVenuePauseNow: () => null,
    _vtsVenuePauseCount: () => assert.fail('unexpected venue pause'),
    getCachedNumberRequired(module, name) {
      assert.equal(module, 'vts_runner');
      assert.ok(constants.has(name), `unexpected fixture constant ${name}`);
      return constants.get(name);
    },
    getVtsMaxConcurrentPerCombo: () => 1,
    getMaxOpenTrades: () => 10,
    asValidAssetClass(stamp) {
      assert.equal(stamp, instrument.assetClass);
      return stamp;
    },
    clearVtsTrailingState: async () => {},
    require(path) {
      assert.equal(path, './vts-trade-persistence.js');
      return {
        async insertOpenTrade(trade) {
          if (rejectNextInsert) {
            rejectNextInsert = false;
            throw new Error('fixture persistence refusal');
          }
          if (persisted.has(trade.id)) return; // The pinned insert guards on id and returns void.
          persisted.set(trade.id, { closed: false, entryPrice: trade.entryPrice, stopLoss: trade.stopLoss });
        },
        async markOpenTradeClosed(id) {
          const row = persisted.get(id);
          assert.ok(row && !row.closed);
          observeCloseWrite?.();
          row.closed = true;
          now += closeWriteLag;
        },
      };
    },
  });
  const { openVirtualTrades, finishVtsClose, pruneReentryMaps } = exports.offline;
  return {
    at(time) {
      assert.ok(time >= now, 'fixture clock moved backward');
      now = time;
    },
    book(id, levels, { refuse = false } = {}) {
      rejectNextInsert = refuse;
      return exports.registerOpenVtsTrade({ id, ...instrument, ...levels, pairFriction: 0 });
    },
    async close(id, { writeLag = 0, observe } = {}) {
      const trade = openVirtualTrades.get(id);
      assert.ok(trade);
      closeWriteLag = writeLag;
      observeCloseWrite = observe;
      await finishVtsClose(id, trade);
    },
    prune: pruneReentryMaps,
    persisted: id => persisted.get(id),
    closeAt: () => exports.getVtsRecentCloseAt(setupKey),
    suppresses: ({ entryPrice, stopLoss, takeProfit }) =>
      exports.isIdenticalXstockSetupSuppressed(...address, entryPrice, stopLoss, takeProfit),
    gate: ({ stopLoss, takeProfit }) => {
      const result = exports.checkPreOpenGates(...address, marketMark, stopLoss, takeProfit, 0);
      return result.allowed ? 'allowed' : result.reason;
    },
  };
}

async function bookAndCloseSeed(arm) {
  assert.equal(await arm.book('common-seed', seed), 'common-seed');
  arm.at(1_100);
  await arm.close('common-seed');
  assert.equal(arm.closeAt(), 1_100);
  assert.equal(arm.suppresses(seed), true);
}

let passed = 0;
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

await check('same seed, separate successful booking and persistence refusal', async () => {
  const comparator = makeArm();
  const candidate = makeArm();
  await bookAndCloseSeed(comparator);
  await bookAndCloseSeed(candidate);
  const planned = { entryPrice: 100.8, stopLoss: 98.5, takeProfit: 106 };
  const booked = { ...planned, entryPrice: 101.2, stopLoss: 98.7 };
  for (const arm of [comparator, candidate]) {
    arm.at(1_400);
    arm.prune();
    assert.equal(arm.gate(planned), 'allowed');
    assert.equal(arm.suppresses(planned), false);
  }
  assert.equal(await comparator.book('second', booked), 'second');
  assert.deepEqual(comparator.persisted('second'), { closed: false, entryPrice: 101.2, stopLoss: 98.7 });
  assert.equal(await candidate.book('second', booked, { refuse: true }), null);
  assert.equal(candidate.persisted('second'), undefined);

  const changedTarget = { ...booked, takeProfit: 110 };
  assert.equal(comparator.suppresses(changedTarget), true);
  assert.equal(comparator.suppresses(planned), false);
  assert.equal(comparator.suppresses({ ...booked, stopLoss: planned.stopLoss }), false);
  assert.equal(candidate.suppresses(changedTarget), false);
  assert.equal(candidate.suppresses(seed), true);
  assert.equal(comparator.gate(planned), 'duplicate_position');
  assert.equal(candidate.gate(planned), 'allowed');

  comparator.at(1_500);
  candidate.at(1_500);
  await comparator.close('second');
  comparator.prune();
  candidate.prune();
  assert.equal(comparator.closeAt(), 1_500);
  assert.equal(candidate.closeAt(), undefined);
  assert.equal(comparator.suppresses(changedTarget), true);
  assert.equal(candidate.suppresses(seed), false);
});

await check('cooldown opens at equality but prune loses the hash only afterward', async () => {
  const arm = makeArm();
  await bookAndCloseSeed(arm);
  const changed = { ...seed, stopLoss: 97 };
  arm.at(1_399);
  arm.prune();
  assert.equal(arm.gate(changed), 'reentry_cooldown');
  assert.equal(arm.suppresses(seed), true);
  arm.at(1_400);
  arm.prune();
  assert.equal(arm.gate(changed), 'allowed');
  assert.equal(arm.closeAt(), 1_100);
  assert.equal(arm.suppresses(seed), true);
  arm.at(1_401);
  assert.equal(arm.gate(changed), 'allowed');
  assert.equal(arm.suppresses(seed), true);
  arm.prune();
  assert.equal(arm.closeAt(), undefined);
  assert.equal(arm.suppresses(seed), false);
});

await check('a shorter hash expiry can leave the close cooldown active', async () => {
  const arm = makeArm({ cooldown: 1_000, expiry: 300 });
  await bookAndCloseSeed(arm);
  arm.at(1_400);
  arm.prune();
  assert.equal(arm.suppresses(seed), true);
  arm.at(1_401);
  arm.prune();
  assert.equal(arm.suppresses(seed), false);
  assert.equal(arm.closeAt(), 1_100);
  assert.equal(arm.gate(seed), 'reentry_cooldown');
});

await check('prune can remove a booked hash before any close while the open guard still works', async () => {
  const arm = makeArm();
  assert.equal(await arm.book('open', seed), 'open');
  assert.equal(arm.suppresses(seed), true);
  assert.equal(arm.closeAt(), undefined);
  arm.at(1_001);
  arm.prune();
  assert.equal(arm.suppresses(seed), false);
  assert.equal(arm.gate(seed), 'duplicate_position');
  assert.equal(arm.persisted('open').closed, false);
});

await check('pruning before exit resolution and closing first leave different evidence', async () => {
  const sourceOrder = makeArm();
  const reversedOrder = makeArm();
  for (const arm of [sourceOrder, reversedOrder]) {
    assert.equal(await arm.book('opening', seed), 'opening');
    assert.equal(arm.suppresses(seed), true);
    arm.at(1_100);
  }
  sourceOrder.prune();
  await sourceOrder.close('opening');
  await reversedOrder.close('opening');
  reversedOrder.prune();
  assert.equal(sourceOrder.closeAt(), reversedOrder.closeAt());
  assert.equal(sourceOrder.suppresses(seed), false);
  assert.equal(reversedOrder.suppresses(seed), true);
  assert.equal(sourceOrder.gate(seed), 'reentry_cooldown');
  assert.equal(reversedOrder.gate(seed), 'reentry_cooldown');
});

await check('close cooldown uses the completion clock after the awaited storage operation', async () => {
  const arm = makeArm();
  assert.equal(await arm.book('delayed-close', seed), 'delayed-close');
  arm.at(1_100);
  arm.prune();
  assert.equal(arm.gate(seed), 'duplicate_position');
  let duringWrite;
  await arm.close('delayed-close', {
    writeLag: 40,
    observe() {
      duringWrite = { closeAt: arm.closeAt(), gate: arm.gate(seed), suppressed: arm.suppresses(seed) };
    },
  });
  assert.deepEqual(duringWrite, { closeAt: undefined, gate: 'allowed', suppressed: false });
  assert.equal(arm.gate(seed), 'reentry_cooldown');
  assert.equal(arm.persisted('delayed-close').closed, true);
  assert.equal(arm.closeAt(), 1_140);
  arm.at(1_439);
  assert.equal(arm.gate(seed), 'reentry_cooldown');
  arm.at(1_440);
  assert.equal(arm.gate(seed), 'allowed');
});

await check('accepted registration and a newly inserted storage row are distinct observations', async () => {
  const oldRow = { closed: true, entryPrice: 95, stopLoss: 93 };
  const arm = makeArm({ savedRows: [['existing-id', oldRow]] });
  assert.equal(arm.suppresses(seed), false);
  assert.equal(await arm.book('existing-id', seed), 'existing-id');
  assert.deepEqual(arm.persisted('existing-id'), oldRow);
  assert.equal(arm.suppresses(seed), true);
  assert.equal(arm.gate(seed), 'duplicate_position');
});

console.log(`${passed} sequential booking-history fixture cases passed`);
