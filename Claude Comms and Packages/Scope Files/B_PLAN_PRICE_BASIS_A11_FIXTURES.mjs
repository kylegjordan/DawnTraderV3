import assert from 'node:assert/strict';

// Step 2 synthetic evidence only. No input adapters, credentials or serving access.
const arms = ['comparator', 'candidate'];
const receiptKinds = [
  'bars', 'orbClock', 'planAsk', 'dedupe', 'booking', 'registration', 'freshness', 'handoff', 'entryGate', 'fill',
];
const proved = outcome => ({ grade: 'proved', outcome });
const unassessable = reason => ({ grade: 'unassessable', reason });
const unreached = reason => ({ grade: 'unreached', reason });
const armKey = ({ opportunity, arm }) => JSON.stringify([opportunity, arm]);
const receiptKey = row => JSON.stringify([armKey(row), row.kind]);
const cycleKey = row => JSON.stringify([row.session, row.boot, row.cycle]);
const scopeOf = row => [row.session, row.boot, row.cycle, row.symbol, row.assetClass, row.strategy, row.settings, row.lane];

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function sameList(left, right) {
  return Array.isArray(left) && left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function visibleAt(receipt, read) {
  return receipt.clock === read.clock && receipt.reader === read.reader &&
    receipt.readAt === read.at &&
    [receipt.observedAt, receipt.availableAt, receipt.readAt].every(Number.isSafeInteger) &&
    receipt.observedAt <= receipt.availableAt && receipt.availableAt <= receipt.readAt;
}

function gradeQuoteAge(receipt, read) {
  if (receipt.ageBasis !== read.ageBasis || typeof read.ageBasis !== 'string' ||
      !Number.isSafeInteger(read.maxAgeMs) || read.maxAgeMs < 0 || receipt.maxAgeMs !== read.maxAgeMs) {
    return unassessable('quote age basis or bound');
  }
  return proved(read.at - receipt.observedAt <= read.maxAgeMs ? 'within age bound' : 'too old');
}

function gradeBars(row, read) {
  return sameList(row.scannerRevisions, read.scannerRevisions) &&
    sameList(row.mceRevisions, read.mceRevisions) &&
    row.formingRevision === read.formingRevision &&
    row.readSequence === read.readSequence &&
    Array.isArray(row.commits) &&
    sameList(row.commits.map(commit => commit.revision), [
      ...read.scannerRevisions, ...read.mceRevisions, read.formingRevision,
    ]) &&
    row.commits.every(commit => Number.isSafeInteger(commit.availableAt) &&
      Number.isSafeInteger(commit.sequence) &&
      commit.availableAt <= read.at && commit.sequence <= read.readSequence);
}

function gradeFreshness(row, read) {
  const { frame, genuine } = row;
  if (!frame || frame.id !== read.frame || frame.socket !== read.socket || frame.boot !== read.boot ||
      frame.clock !== read.clock ||
      !['update', 'replay'].includes(frame.type) ||
      !Number.isSafeInteger(frame.availableAt) || frame.availableAt > read.at ||
      frame.availableAt !== row.availableAt) {
    return unassessable('raw frame identity or availability');
  }
  if (genuine === null && frame.type === 'replay' && read.genuine === null) {
    return row.outcome === 'cold' ? proved('cold') : unassessable('reported freshness outcome');
  }
  if (!genuine || genuine.id !== read.genuine || genuine.type !== 'update' ||
      genuine.socket !== read.socket || genuine.boot !== read.boot ||
      genuine.clock !== read.clock || !Number.isSafeInteger(genuine.observedAt) ||
      !Number.isSafeInteger(genuine.availableAt) || genuine.observedAt > genuine.availableAt ||
      genuine.availableAt > frame.availableAt || (frame.type === 'update' && frame.id !== genuine.id) ||
      row.observedAt !== genuine.observedAt ||
      !Number.isSafeInteger(row.ceiling) || row.ceiling < 0 || row.ceiling !== read.ceiling) {
    return unassessable('genuine update or age ceiling');
  }
  const outcome = read.at - genuine.observedAt <= row.ceiling ? 'pass' : 'stale';
  return row.outcome === outcome ? proved(outcome) : unassessable('reported freshness outcome');
}

function gradeOrbClock(row, read) {
  if (!Number.isSafeInteger(row.detectorAt) || row.detectorAt !== read.detectorAt ||
      row.detectorAt !== read.at || row.clock !== 'fixture-epoch-ms' ||
      !sameList(row.rangeBars, read.rangeBars) || !row.rangeBars.every(Number.isSafeInteger) ||
      ![read.formationMinutes, read.activeHours].every(value => Number.isFinite(value) && value > 0)) {
    return unassessable('ORB clock or opening-range identity');
  }
  const now = new Date(row.detectorAt);
  const open = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 30);
  const formationEnd = open + read.formationMinutes * 60_000;
  const breakoutEnd = formationEnd + read.activeHours * 3_600_000;
  let outcome = 'range present';
  if (row.detectorAt < formationEnd || row.detectorAt >= breakoutEnd) {
    outcome = 'outside breakout window';
  } else if (!row.rangeBars.some(at => at >= open && at < formationEnd)) {
    outcome = 'no opening range for detector date';
  }
  return row.outcome === outcome ? proved(outcome) : unassessable('reported ORB clock outcome');
}

// The current source compares only entry and stop, rounded with the configured tolerance.
function setupHash(entry, stop, tolerance) {
  const round = price => Math.round(price / (price * tolerance)) * (price * tolerance);
  return `${round(entry).toFixed(4)}|${round(stop).toFixed(4)}`;
}

function gradeDedupe(row, read) {
  if (row.setupKey !== read.setupKey || row.state !== read.state ||
      typeof row.state !== 'string' || row.state.length === 0 ||
      row.lastPersistedTrade !== read.lastPersistedTrade ||
      row.priorHash !== read.priorHash || row.tolerance !== read.tolerance ||
      (row.priorHash !== null && (!row.priorHash || !row.lastPersistedTrade)) ||
      ![row.tolerance, row.plannedEntry, row.plannedStop].every(value => Number.isFinite(value) && value > 0)) {
    return unassessable('setup state or operands');
  }
  const currentHash = setupHash(row.plannedEntry, row.plannedStop, row.tolerance);
  const outcome = row.priorHash === currentHash ? 'same setup' : 'different or no prior setup';
  return row.outcome === outcome ? proved(outcome) : unassessable('reported setup comparison');
}

function gradeReceipt(kind, row, read) {
  if (row.id !== read.id || row.source !== read.source || !visibleAt(row, read)) {
    return unassessable('receipt identity, reader or clock');
  }
  switch (kind) {
    case 'bars':
      return gradeBars(row, read) ? proved('exact revisions') : unassessable('bar revision or sequence');
    case 'orbClock':
      return gradeOrbClock(row, read);
    case 'planAsk': {
      if (row.side !== 'ask' || !Number.isFinite(row.price) || row.price <= 0) return unassessable('plan ask');
      const age = gradeQuoteAge(row, read);
      if (age.grade !== 'proved') return age;
      return age.outcome === 'too old' ? unassessable('plan ask too old') : proved('usable ask');
    }
    case 'dedupe':
      return gradeDedupe(row, read);
    case 'booking':
      if (row.side !== 'ask' || row.mode !== read.mode || row.chosenMode !== read.chosenMode) {
        return unassessable('booking side or mode');
      }
      if (row.mode === 'taker' && row.price === null && row.outcome === 'no-ask') {
        return proved('no-ask');
      }
      if (row.mode === 'maker' && row.chosenMode === 'maker' && row.price === null && row.outcome === 'rested') {
        return proved('rested');
      }
      if (Number.isFinite(row.price) && row.price > 0 && row.outcome === 'passed') {
        const age = gradeQuoteAge(row, read);
        if (age.grade !== 'proved') return age;
        return age.outcome === 'too old' ? unassessable('positive booking contradicts quote age') : proved('passed');
      }
      return unassessable('booking outcome');
    case 'registration':
      if (row.trade === null) return proved('explicit null');
      return typeof row.trade === 'string' && row.trade.length > 0
        ? proved('registered') : unassessable('registration outcome');
    case 'freshness':
      return gradeFreshness(row, read);
    case 'handoff':
      return row.outcome === 'forwarded' ? proved('forwarded') : unassessable('handoff outcome');
    case 'entryGate':
      return ['pending', 'accepted', 'refused'].includes(row.outcome)
        ? proved(row.outcome) : unassessable('Entry Gate outcome');
    case 'fill':
      return row.outcome === 'filled' && Number.isFinite(row.price) && row.price > 0
        ? proved('filled') : unassessable('fill outcome');
  }
}

function reconcile({ roster, registrations, reads, receipts }) {
  const rosterById = groupBy(roster, row => row.opportunity);
  const rosterByCycle = groupBy(roster, cycleKey);
  const registered = groupBy(registrations, cycleKey);
  const readsByArm = groupBy(reads, armKey);
  const receiptsByKind = groupBy(receipts, receiptKey);
  const issues = [];
  for (const cycle of new Set([...registered.keys(), ...rosterByCycle.keys()])) {
    const registration = registered.get(cycle) ?? [];
    const offered = rosterByCycle.get(cycle)?.length ?? 0;
    if (registration.length !== 1 || registration[0].offered !== offered) {
      issues.push({ reason: 'cycle denominator', cycle, offered });
    }
  }
  for (const row of [...reads, ...receipts]) {
    if (!rosterById.has(row.opportunity) || !arms.includes(row.arm) ||
        (Object.hasOwn(row, 'kind') && !receiptKinds.includes(row.kind))) {
      issues.push({ reason: 'unattached evidence', row });
    }
  }
  const rows = roster.map(offered => {
    const sharedReads = { bars: offered.barsRead, orbClock: offered.orbRead, dedupe: offered.dedupeRead };
    const byArm = Object.fromEntries(arms.map(arm => {
      const identity = { opportunity: offered.opportunity, arm };
      const scope = scopeOf(offered);
      const armReads = readsByArm.get(armKey(identity)) ?? [];
      const unique = rosterById.get(offered.opportunity).length === 1 && armReads.length === 1 &&
        sameList(armReads[0].scope, scope);
      const stages = {};
      const orderedReads = new Map();
      let precedingRead;
      for (const kind of receiptKinds) {
        if (kind === 'planAsk' && arm === 'comparator') continue;
        if (kind === 'orbClock' && offered.strategy !== 'orb') continue;
        const matches = receiptsByKind.get(receiptKey({ ...identity, kind })) ?? [];
        const read = unique ? (Object.hasOwn(sharedReads, kind) ? sharedReads[kind] : armReads[0][kind]) : undefined;
        if (read && precedingRead && (precedingRead.clock !== read.clock || precedingRead.at > read.at)) {
          stages[kind] = unassessable('stage decision order or clock domain');
          continue;
        }
        if (read) {
          orderedReads.set(kind, read);
          precedingRead = read;
        }
        if (!read || matches.length !== 1) {
          stages[kind] = unassessable(!unique || matches.length > 1 ? 'ambiguous evidence' : 'missing evidence');
          continue;
        }
        stages[kind] = sameList(matches[0].scope, scope)
          ? gradeReceipt(kind, matches[0], read)
          : unassessable('receipt belongs to another scope');
      }
      const stoppedAtDedupe = stages.dedupe.outcome === 'same setup';
      const stoppedAtBooking = stages.booking.outcome === 'no-ask';
      const stoppedAtDispatch = ['stale', 'cold'].includes(stages.freshness.outcome);
      if (stoppedAtDedupe || stoppedAtBooking || stoppedAtDispatch) {
        // A later observation can be independent of a call blocked at booking.
        const reason = stoppedAtDedupe ? 'proved setup suppression' :
          stoppedAtBooking ? 'proved early booking refusal' : 'proved dispatch freshness refusal';
        const downstream = ['handoff', 'entryGate', 'fill'];
        if (stoppedAtDedupe || stoppedAtBooking) downstream.unshift('registration');
        if (stoppedAtDedupe) downstream.unshift('booking');
        for (const kind of downstream) {
          const matches = receiptsByKind.get(receiptKey({ ...identity, kind })) ?? [];
          const read = orderedReads.get(kind);
          const conflicts = matches.filter(row => read && sameList(row.scope, scope) &&
            gradeReceipt(kind, row, read).grade === 'proved');
          if (conflicts.length > 0) {
            stages[kind] = unassessable(`receipt contradicts ${reason}`);
            issues.push({ ...identity, kind, reason: `receipt contradicts ${reason}`, count: conflicts.length });
          } else {
            stages[kind] = unreached(reason);
          }
          if (matches.length > conflicts.length) {
            issues.push({ ...identity, kind, reason: 'unlinked or invalid receipt after proved refusal',
              count: matches.length - conflicts.length });
          }
        }
      }
      return [arm, stages];
    }));
    const pairedInputs = byArm.comparator.bars.grade === 'proved' &&
      byArm.candidate.bars.grade === 'proved' && byArm.candidate.planAsk.grade === 'proved';
    return { ...offered, byArm, pairedInputs };
  });
  const strata = groupBy(rows, row => JSON.stringify([row.session, row.strategy, row.lane]));
  const counts = [...strata].map(([stratum, members]) => ({
    stratum: JSON.parse(stratum),
    offered: members.length,
    arms: Object.fromEntries(arms.map(arm => [arm, Object.fromEntries(
      Object.keys(members[0].byArm[arm]).map(stage => {
        const grades = members.map(row => row.byArm[arm][stage].grade);
        return [stage, Object.fromEntries(
          ['proved', 'unassessable', 'unreached'].map(grade => [grade, grades.filter(value => value === grade).length]),
        )];
      }),
    )])),
  }));
  return { rows, counts, issues };
}

const time = 10_000;
const barRead = {
  id: 'bars-1',
  source: 'fixture-bar-store',
  reader: 'scanner',
  clock: 'fixture-epoch-ms',
  at: time,
  scannerRevisions: ['scanner-settled-1', 'scanner-settled-2'],
  mceRevisions: ['mce-settled-1'],
  formingRevision: 'forming-1',
  readSequence: 12,
};
const opportunity = {
  opportunity: 'opportunity-1',
  session: 'fixture-session',
  boot: 'boot-1',
  cycle: 'cycle-1',
  symbol: 'FIXTURE/USD',
  assetClass: 'xstock_spot',
  strategy: 'morning_star',
  settings: 'settings-1',
  lane: 'taker',
  barsRead: barRead,
  dedupeRead: {
    id: 'dedupe-1',
    source: 'fixture-vts-state',
    reader: 'vts-setup-hash',
    clock: barRead.clock,
    at: time + 12,
    setupKey: 'xstock_spot:FIXTURE/USD:morning_star',
    state: 'state-snapshot-1',
    lastPersistedTrade: 'book-previous',
    priorHash: '99.0000|97.0000',
    tolerance: 0.001,
  },
};
const checkpoints = {
  planAsk: {
    reader: 'plan-geometry', at: time + 10, source: 'fixture-plan-quotes',
    ageBasis: 'fixture-observed-ask', maxAgeMs: 10,
  },
  booking: {
    reader: 'vts-booking', at: time + 20, source: 'fixture-vts-quotes', mode: 'taker', chosenMode: 'taker',
    ageBasis: 'selected-row-captured-at', maxAgeMs: 15,
  },
  registration: { reader: 'vts-registration', at: time + 30, source: 'fixture-vts-register' },
  freshness: {
    reader: 'active-dispatch',
    at: time + 40,
    source: 'fixture-active-cache',
    frame: 'update-1',
    genuine: 'update-1',
    boot: 'boot-1',
    socket: 'socket-1',
    ceiling: 100,
  },
  handoff: { reader: 'signal-orchestrator', at: time + 50, source: 'fixture-handoff' },
  entryGate: { reader: 'entry-gate', at: time + 60, source: 'fixture-entry-gate' },
  fill: { reader: 'paper-engine', at: time + 70, source: 'fixture-persistence' },
};

function makeFixture() {
  const receipts = [];
  const reads = arms.map(arm => {
    const identity = { opportunity: opportunity.opportunity, arm, scope: scopeOf(opportunity) };
    const read = { ...identity };
    const observation = {
      id: 'update-1',
      type: 'update',
      boot: 'boot-1',
      socket: 'socket-1',
      clock: barRead.clock,
      observedAt: time + 35,
      availableAt: time + 36,
    };
    const facts = {
      bars: {
        scannerRevisions: barRead.scannerRevisions,
        mceRevisions: barRead.mceRevisions,
        formingRevision: barRead.formingRevision,
        readSequence: barRead.readSequence,
        commits: [...barRead.scannerRevisions, ...barRead.mceRevisions, barRead.formingRevision]
          .map((revision, index) => ({ revision, availableAt: time - 4 + index, sequence: 9 + index })),
        close: 100,
      },
      planAsk: {
        side: 'ask', price: 100.1,
        ageBasis: checkpoints.planAsk.ageBasis, maxAgeMs: checkpoints.planAsk.maxAgeMs,
      },
      dedupe: {
        setupKey: opportunity.dedupeRead.setupKey,
        state: opportunity.dedupeRead.state,
        lastPersistedTrade: opportunity.dedupeRead.lastPersistedTrade,
        priorHash: opportunity.dedupeRead.priorHash,
        tolerance: opportunity.dedupeRead.tolerance,
        plannedEntry: 100,
        plannedStop: 98,
        plannedTarget: 104,
        outcome: 'different or no prior setup',
      },
      booking: {
        side: 'ask', mode: 'taker', chosenMode: 'taker', price: 100.2, outcome: 'passed',
        ageBasis: checkpoints.booking.ageBasis, maxAgeMs: checkpoints.booking.maxAgeMs,
      },
      registration: { trade: `book-${arm}` },
      freshness: { frame: observation, genuine: observation, ceiling: 100, outcome: 'pass' },
      handoff: { outcome: 'forwarded' },
      entryGate: { outcome: 'accepted' },
      fill: { outcome: 'filled', price: 100.3 },
    };
    for (const kind of receiptKinds) {
      if (kind === 'planAsk' && arm === 'comparator') continue;
      if (kind === 'orbClock') continue;
      const sharedCheckpoints = { bars: barRead, dedupe: opportunity.dedupeRead };
      const checkpoint = sharedCheckpoints[kind] ??
        { ...checkpoints[kind], id: `${arm}-${kind}`, clock: barRead.clock };
      if (!Object.hasOwn(sharedCheckpoints, kind)) read[kind] = checkpoint;
      receipts.push({
        ...identity,
        scope: [...identity.scope],
        kind,
        id: checkpoint.id,
        source: checkpoint.source,
        reader: checkpoint.reader,
        clock: checkpoint.clock,
        readAt: checkpoint.at,
        observedAt: kind === 'freshness' ? observation.observedAt : checkpoint.at - 2,
        availableAt: kind === 'freshness' ? observation.availableAt : checkpoint.at - 1,
        ...facts[kind],
      });
    }
    return read;
  });
  return structuredClone({
    roster: [opportunity],
    registrations: [{ session: opportunity.session, boot: opportunity.boot, cycle: opportunity.cycle, offered: 1 }],
    reads,
    receipts,
  });
}

const candidateReceipt = (fixture, kind) => fixture.receipts.find(row => row.arm === 'candidate' && row.kind === kind);
const candidateRead = (fixture, kind) => fixture.reads.find(row => row.arm === 'candidate')[kind];
function removeCandidate(fixture, ...kinds) {
  fixture.receipts = fixture.receipts.filter(row => row.arm !== 'candidate' || !kinds.includes(row.kind));
}

let passed = 0;
function check(name, mutate, verify) {
  const fixture = makeFixture();
  mutate(fixture);
  const result = reconcile(fixture);
  assert.equal(result.rows.length, fixture.roster.length, name);
  assert.equal(result.counts.reduce((sum, count) => sum + count.offered, 0), fixture.roster.length, name);
  for (const { offered, arms: stageTotals } of result.counts) {
    for (const stages of Object.values(stageTotals)) {
      for (const grades of Object.values(stages)) {
        assert.equal(Object.values(grades).reduce((sum, count) => sum + count, 0), offered, name);
      }
    }
  }
  verify(result, result.rows[0].byArm.candidate, result.rows[0].byArm.comparator);
  passed += 1;
  console.log(`PASS ${name}`);
}

check('complete pair, independent readers and stage clocks', () => {}, (result, candidate, comparator) => {
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows[0].pairedInputs, true);
  for (const stages of [candidate, comparator]) {
    for (const stage of Object.values(stages)) assert.equal(stage.grade, 'proved');
  }
});

check('equal close, different bar revision', fixture => {
  const row = candidateReceipt(fixture, 'bars');
  row.scannerRevisions = ['other-revision-at-100', row.scannerRevisions[1]];
  row.commits[0].revision = row.scannerRevisions[0];
}, (result, candidate, comparator) => {
  assert.equal(result.rows[0].pairedInputs, false);
  assert.equal(candidate.bars.grade, 'unassessable');
  assert.equal(comparator.bars.grade, 'proved');
});

check('same bar identity committed after read sequence', fixture => {
  candidateReceipt(fixture, 'bars').commits[0].sequence = 13;
}, (_result, candidate) => assert.equal(candidate.bars.grade, 'unassessable'));

check('settled bar order mismatch', fixture => {
  const row = candidateReceipt(fixture, 'bars');
  row.scannerRevisions = [...row.scannerRevisions].reverse();
}, (_result, candidate) => assert.equal(candidate.bars.grade, 'unassessable'));

check('same quote available after its read', fixture => {
  const row = candidateReceipt(fixture, 'planAsk');
  row.availableAt = row.readAt + 1;
}, (result, candidate) => {
  assert.equal(result.rows[0].pairedInputs, false);
  assert.equal(candidate.planAsk.grade, 'unassessable');
  assert.equal(candidate.booking.grade, 'proved');
});

check('candidate ask observation exactly at its fixture age bound', fixture => {
  const row = candidateReceipt(fixture, 'planAsk');
  row.observedAt = row.readAt - row.maxAgeMs;
}, (result, candidate) => {
  assert.equal(result.rows[0].pairedInputs, true);
  assert.equal(candidate.planAsk.outcome, 'usable ask');
});

check('candidate ask available on time but too old by one millisecond', fixture => {
  const row = candidateReceipt(fixture, 'planAsk');
  row.observedAt = row.readAt - row.maxAgeMs - 1;
}, (result, candidate) => {
  assert.equal(result.rows[0].pairedInputs, false);
  assert.equal(candidate.planAsk.reason, 'plan ask too old');
  assert.equal(candidate.booking.outcome, 'passed');
});

check('recorded candidate ask without its reviewed bound fixture', fixture => {
  delete candidateRead(fixture, 'planAsk').maxAgeMs;
}, (_result, candidate) => assert.equal(candidate.planAsk.reason, 'quote age basis or bound'));

check('on-time VTS booking receipt conflicts with consumed quote age', fixture => {
  const row = candidateReceipt(fixture, 'booking');
  row.observedAt = row.readAt - row.maxAgeMs - 1;
}, (_result, candidate) => {
  assert.equal(candidate.booking.reason, 'positive booking contradicts quote age');
  assert.equal(candidate.freshness.outcome, 'pass');
  assert.equal(candidate.handoff.outcome, 'forwarded');
});

check('candidate clock cannot stand in for the selected booking row clock', fixture => {
  candidateReceipt(fixture, 'booking').ageBasis = 'fixture-observed-ask';
}, (_result, candidate) => assert.equal(candidate.booking.reason, 'quote age basis or bound'));

check('quote from another opportunity', fixture => {
  candidateReceipt(fixture, 'planAsk').opportunity = 'unoffered';
}, (result, candidate) => {
  assert.equal(candidate.planAsk.grade, 'unassessable');
  assert.equal(result.issues[0].reason, 'unattached evidence');
});

check('right quote ID under another settings version', fixture => {
  candidateReceipt(fixture, 'planAsk').scope[6] = 'settings-2';
}, (_result, candidate) => assert.equal(candidate.planAsk.reason, 'receipt belongs to another scope'));

check('same ask with VTS booking source and receipt', fixture => {
  const booking = candidateReceipt(fixture, 'booking');
  const ask = candidateReceipt(fixture, 'planAsk');
  Object.assign(ask, { id: booking.id, source: booking.source });
}, (_result, candidate) => assert.equal(candidate.planAsk.grade, 'unassessable'));

check('handoff read moved before active dispatch even with matching receipt', fixture => {
  const read = candidateRead(fixture, 'handoff');
  read.at = time + 39;
  const row = candidateReceipt(fixture, 'handoff');
  Object.assign(row, { readAt: read.at, observedAt: read.at - 2, availableAt: read.at - 1 });
}, (_result, candidate) => {
  assert.equal(candidate.freshness.outcome, 'pass');
  assert.equal(candidate.handoff.reason, 'stage decision order or clock domain');
});

check('same trade stages with duplicate bar evidence', fixture => {
  fixture.receipts.push(structuredClone(candidateReceipt(fixture, 'bars')));
}, (result, candidate) => {
  assert.equal(result.rows[0].pairedInputs, false);
  assert.equal(candidate.bars.reason, 'ambiguous evidence');
});

check('duplicate roster identity remains in denominator', fixture => {
  fixture.roster.push(structuredClone(fixture.roster[0]));
  fixture.registrations[0].offered = 2;
}, result => {
  assert.equal(result.counts[0].offered, 2);
  assert.ok(result.rows.every(row => !row.pairedInputs));
});

check('registered cycle without offered rows', fixture => {
  fixture.registrations.push({ ...fixture.registrations[0], cycle: 'cycle-2' });
}, result => assert.equal(result.issues[0].reason, 'cycle denominator'));

check('two sessions and distinct strategy-lane strata', fixture => {
  const other = {
    ...fixture.roster[0],
    opportunity: 'opportunity-2',
    session: 'second-fixture-session',
    lane: 'maker',
    strategy: 'inside_bar_reversal',
  };
  fixture.roster.push(other);
  fixture.registrations.push({ ...fixture.registrations[0], session: other.session });
  fixture.reads.push(...fixture.reads.map(read => ({
    ...structuredClone(read),
    opportunity: other.opportunity,
    scope: scopeOf(other),
  })));
  fixture.receipts.push(...fixture.receipts.filter(row => row.arm === 'comparator' && row.kind === 'bars').map(row => ({
    ...structuredClone(row),
    opportunity: other.opportunity,
    scope: scopeOf(other),
  })));
}, result => {
  assert.equal(result.issues.length, 0);
  assert.equal(result.counts.length, 2);
  assert.equal(result.counts[1].arms.comparator.bars.proved, 1);
  assert.equal(result.counts[1].arms.candidate.bars.unassessable, 1);
});

check('early taker refusal and same later eligible tick', fixture => {
  Object.assign(candidateReceipt(fixture, 'booking'), { price: null, outcome: 'no-ask' });
  removeCandidate(fixture, 'registration', 'handoff', 'entryGate', 'fill');
}, (_result, candidate) => {
  assert.equal(candidate.booking.outcome, 'no-ask');
  assert.equal(candidate.freshness.outcome, 'pass');
  for (const stage of ['registration', 'handoff', 'entryGate', 'fill']) {
    assert.equal(candidate[stage].grade, 'unreached');
  }
});

check('omitted booking with same eligible tick and linked handoff', fixture => {
  removeCandidate(fixture, 'booking');
}, (_result, candidate) => {
  assert.equal(candidate.booking.grade, 'unassessable');
  assert.equal(candidate.freshness.outcome, 'pass');
  assert.equal(candidate.handoff.outcome, 'forwarded');
});

check('maker can rest without a usable ask', fixture => {
  Object.assign(candidateRead(fixture, 'booking'), { mode: 'maker', chosenMode: 'maker' });
  Object.assign(candidateReceipt(fixture, 'booking'), {
    mode: 'maker', chosenMode: 'maker', price: null, outcome: 'rested',
  });
}, (_result, candidate) => {
  assert.equal(candidate.booking.outcome, 'rested');
  assert.equal(candidate.freshness.outcome, 'pass');
});

check('right effective mode, wrong chosen mode', fixture => {
  candidateReceipt(fixture, 'booking').chosenMode = 'maker';
}, (_result, candidate) => assert.equal(candidate.booking.grade, 'unassessable'));

check('explicit null booking registration and linked handoff', fixture => {
  candidateReceipt(fixture, 'registration').trade = null;
}, (_result, candidate) => {
  assert.equal(candidate.registration.outcome, 'explicit null');
  assert.equal(candidate.handoff.outcome, 'forwarded');
});

check('contradictory downstream receipts after proved early refusal', fixture => {
  Object.assign(candidateReceipt(fixture, 'booking'), { price: null, outcome: 'no-ask' });
}, (result, candidate) => {
  assert.equal(candidate.handoff.grade, 'unassessable');
  assert.ok(result.issues.some(row => row.kind === 'handoff'));
});

check('wrong handoff receipt after the same proved early refusal', fixture => {
  Object.assign(candidateReceipt(fixture, 'booking'), { price: null, outcome: 'no-ask' });
  removeCandidate(fixture, 'registration', 'entryGate', 'fill');
  candidateReceipt(fixture, 'handoff').id = 'unrelated-receipt-id';
}, (result, candidate) => {
  assert.equal(candidate.freshness.outcome, 'pass');
  assert.equal(candidate.handoff.grade, 'unreached');
  assert.equal(result.issues[0].reason, 'unlinked or invalid receipt after proved refusal');
  assert.equal(result.issues[0].kind, 'handoff');
});

check('absent Entry Gate and fill receipts', fixture => {
  removeCandidate(fixture, 'entryGate', 'fill');
}, (_result, candidate) => {
  assert.equal(candidate.entryGate.grade, 'unassessable');
  assert.equal(candidate.fill.grade, 'unassessable');
  assert.equal(candidate.handoff.outcome, 'forwarded');
});

check('explicit pending Entry Gate, absent fill', fixture => {
  candidateReceipt(fixture, 'entryGate').outcome = 'pending';
  removeCandidate(fixture, 'fill');
}, (_result, candidate) => assert.equal(candidate.entryGate.outcome, 'pending'));

check('replay with earlier genuine update on same socket', fixture => {
  const row = candidateReceipt(fixture, 'freshness');
  row.frame = { ...row.frame, id: 'replay-1', type: 'replay', availableAt: time + 38 };
  row.availableAt = row.frame.availableAt;
  candidateRead(fixture, 'freshness').frame = 'replay-1';
}, (_result, candidate) => assert.equal(candidate.freshness.outcome, 'pass'));

check('replay without a genuine update remains cold', fixture => {
  const row = candidateReceipt(fixture, 'freshness');
  row.frame = { ...row.frame, id: 'replay-1', type: 'replay', availableAt: time + 38 };
  row.availableAt = row.frame.availableAt;
  row.genuine = null;
  row.outcome = 'cold';
  Object.assign(candidateRead(fixture, 'freshness'), { frame: 'replay-1', genuine: null });
  removeCandidate(fixture, 'handoff', 'entryGate', 'fill');
}, (_result, candidate) => assert.equal(candidate.freshness.outcome, 'cold'));

check('cold replay with contradictory handoff receipt', fixture => {
  const row = candidateReceipt(fixture, 'freshness');
  row.frame = { ...row.frame, id: 'replay-1', type: 'replay', availableAt: time + 38 };
  row.availableAt = row.frame.availableAt;
  row.genuine = null;
  row.outcome = 'cold';
  Object.assign(candidateRead(fixture, 'freshness'), { frame: 'replay-1', genuine: null });
}, (result, candidate) => {
  assert.equal(candidate.freshness.outcome, 'cold');
  assert.equal(candidate.handoff.grade, 'unassessable');
  assert.ok(result.issues.some(row => row.kind === 'handoff'));
});

check('fresh replay receipt with stale original update', fixture => {
  const row = candidateReceipt(fixture, 'freshness');
  row.frame = { ...row.frame, id: 'replay-1', type: 'replay', availableAt: time + 38 };
  row.availableAt = row.frame.availableAt;
  row.genuine = { ...row.genuine, observedAt: time - 80, availableAt: time - 79 };
  row.observedAt = row.genuine.observedAt;
  row.outcome = 'stale';
  candidateRead(fixture, 'freshness').frame = 'replay-1';
  removeCandidate(fixture, 'handoff', 'entryGate', 'fill');
}, (_result, candidate) => {
  assert.equal(candidate.freshness.outcome, 'stale');
  assert.equal(candidate.handoff.grade, 'unreached');
});

check('equally timed update from another socket', fixture => {
  const row = candidateReceipt(fixture, 'freshness');
  row.genuine = { ...row.genuine, socket: 'different-socket' };
}, (_result, candidate) => assert.equal(candidate.freshness.grade, 'unassessable'));

check('target-only change retains setup suppression', fixture => {
  const prior = '100.0000|98.0000';
  fixture.roster[0].dedupeRead.priorHash = prior;
  for (const row of fixture.receipts.filter(row => row.kind === 'dedupe')) {
    row.priorHash = prior;
    row.outcome = 'same setup';
  }
  candidateReceipt(fixture, 'dedupe').plannedTarget = 125;
  removeCandidate(fixture, 'booking', 'registration', 'handoff', 'entryGate', 'fill');
}, (_result, candidate, comparator) => {
  assert.equal(candidate.dedupe.outcome, 'same setup');
  assert.equal(comparator.dedupe.outcome, 'same setup');
  assert.equal(candidate.booking.grade, 'unreached');
  assert.equal(comparator.booking.grade, 'unassessable');
});

check('changed planned stop compared with the same previous booking', fixture => {
  const prior = '100.0000|98.0000';
  fixture.roster[0].dedupeRead.priorHash = prior;
  const candidate = candidateReceipt(fixture, 'dedupe');
  candidate.priorHash = prior;
  candidate.plannedStop = 97;
  const comparator = fixture.receipts.find(row => row.arm === 'comparator' && row.kind === 'dedupe');
  comparator.priorHash = prior;
  comparator.outcome = 'same setup';
}, (_result, candidate, comparator) => {
  assert.equal(comparator.dedupe.outcome, 'same setup');
  assert.equal(candidate.dedupe.outcome, 'different or no prior setup');
});

check('missing setup state and attempted booking are insufficient', fixture => {
  const row = candidateReceipt(fixture, 'dedupe');
  row.state = 'attempted-unpersisted-book';
}, (_result, candidate) => assert.equal(candidate.dedupe.grade, 'unassessable'));

check('shared prior state absent after pruning', fixture => {
  fixture.roster[0].dedupeRead.priorHash = null;
  for (const row of fixture.receipts.filter(row => row.kind === 'dedupe')) row.priorHash = null;
}, (_result, candidate, comparator) => {
  assert.equal(candidate.dedupe.outcome, 'different or no prior setup');
  assert.equal(comparator.dedupe.outcome, 'different or no prior setup');
});

function withOrbClock(fixture, decision, outcome) {
  const at = Date.parse(decision);
  const offered = fixture.roster[0];
  const shift = at - time - 5;
  offered.barsRead.at += shift;
  offered.dedupeRead.at += shift;
  for (const arm of fixture.reads) {
    for (const kind of receiptKinds) {
      if (arm[kind]) arm[kind].at += shift;
    }
  }
  // Booking and all downstream receipts stay on the detector's synthetic decision clock.
  for (const row of fixture.receipts) {
    row.readAt += shift;
    row.observedAt += shift;
    row.availableAt += shift;
    if (row.kind === 'bars') {
      for (const commit of row.commits) commit.availableAt += shift;
    }
    if (row.kind === 'freshness') {
      row.frame.observedAt += shift;
      row.frame.availableAt += shift;
    }
  }
  offered.strategy = 'orb';
  const read = {
    id: 'detector-clock',
    source: 'fixture-orb-detector',
    reader: 'orb',
    clock: barRead.clock,
    at,
    detectorAt: at,
    formationMinutes: 30,
    activeHours: 2,
    rangeBars: ['2026-05-11T14:30Z', '2026-05-11T14:45Z'].map(value => Date.parse(value)),
  };
  offered.orbRead = read;
  offered.dedupeRead.setupKey = 'xstock_spot:FIXTURE/USD:orb';
  for (const row of fixture.receipts.filter(row => row.kind === 'dedupe')) row.setupKey = offered.dedupeRead.setupKey;
  for (const row of [...fixture.reads, ...fixture.receipts]) row.scope = scopeOf(offered);
  for (const arm of arms) {
    fixture.receipts.push({
      arm, opportunity: offered.opportunity, scope: scopeOf(offered), kind: 'orbClock',
      id: read.id, source: read.source, reader: read.reader, clock: read.clock,
      readAt: at, observedAt: at, availableAt: at, detectorAt: at, rangeBars: [...read.rangeBars], outcome,
    });
  }
}

check('both ORB arms use the same detector clock and same-day range', fixture => {
  withOrbClock(fixture, '2026-05-11T15:30Z', 'range present');
}, (result, candidate, comparator) => {
  assert.equal(candidate.orbClock.outcome, 'range present');
  assert.equal(comparator.orbClock.outcome, 'range present');
  assert.equal(candidate.freshness.outcome, 'pass');
  assert.equal(result.rows[0].pairedInputs, true);
});

check('ORB clock on the following day with previous-day bars', fixture => {
  withOrbClock(fixture, '2026-05-12T15:30Z', 'no opening range for detector date');
}, (_result, candidate) => assert.equal(candidate.orbClock.outcome, 'no opening range for detector date'));

check('ORB clock on the exclusive breakout boundary', fixture => {
  withOrbClock(fixture, '2026-05-11T17:00Z', 'outside breakout window');
}, (_result, candidate) => assert.equal(candidate.orbClock.outcome, 'outside breakout window'));

check('one ORB arm changes the pinned detector clock', fixture => {
  withOrbClock(fixture, '2026-05-11T15:30Z', 'range present');
  candidateReceipt(fixture, 'orbClock').detectorAt += 1;
}, (_result, candidate, comparator) => {
  assert.equal(candidate.orbClock.grade, 'unassessable');
  assert.equal(comparator.orbClock.outcome, 'range present');
});

console.log(`${passed} integrated fixture cases passed`);
