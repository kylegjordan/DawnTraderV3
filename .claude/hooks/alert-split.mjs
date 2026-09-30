// B-TOKEN-BURN-CUT amendment 1, OBJ-6 (Kyle 2026-09-30; Langston approved with C3, C4, C5, C7) — PURE.
// Decides which due alerts a session is SHOWN by `inject-due-alerts.mjs`. Not a hook itself: imported by it.
//
// WHY: the per-turn check injected EVERY due alert into EVERY session with "Surface each", so all four sessions
// discussed the same list every turn (Kyle: "each session should not be talking about what the other sessions
// are doing"). Ownership is not in the alert record; it is Langston's `[[ALERT id=… owner=…]]` routing, which
// each session's wake filter records into ~/.claude/cc-wake-state/<ALIAS>.alert-owners.json.
//
// THE RULE, per due alert:
//   routed to this session                      → YOURS, in full
//   no owner recorded (not yet routed)          → in full, in EVERY session, for as long as it is unrouted (C3, C4:
//                                                 never an anonymous count, and not "shown once")
//   routed elsewhere and CRITICAL               → one line with its owner, in every session (C5)
//   routed to another session or to Kyle        → counted only (C7: owner=Kyle resolves to no alias, so those are
//                                                 counted in all four; Langston's own triage carries them)
// FAIL-OPEN: no alias (an unmapped clone) or no readable owner record → `narrowed: false`, and the caller shows the
// full list exactly as before. A missing file must never read as "no alerts".

export const CLONE_TO_ALIAS = {
  'DawnTraderV3-old': 'CC-A',
  'DawnTraderV3-new': 'CC-B',
  'DawnTraderV3-analyst': 'CC-C',
  'DawnTraderV3-infra': 'CC-INFRA',
};

// Round 3 BLOCKER-3 (Langston): an owner that CHANGED within this window is not trusted — the alert reads as unrouted
// (shown to every session, the true statement) and is listed as churning so Langston can settle it.
export const CHURN_HOURS = 24;

// alerts: [{ id, sev, title }] · owners: { <uuid>: { owner, changed_at?, flips? } } or null · alias · nowMs
export function splitAlerts(alerts, owners, alias, nowMs = Date.now()) {
  if (!alias || !owners || typeof owners !== 'object') {
    return { narrowed: false, why: alias ? 'owner record not seeded yet' : 'no alias for this clone', mine: [], unrouted: [], critical: [], others: 0 };
  }
  // (b) (Langston, Step 4): a record that never finished a whole-inbox seed would call every alert "not yet routed" —
  // a false statement indistinguishable from the true one. Only a seeded record narrows.
  if (!owners._meta || !owners._meta.seeded_at) {
    return { narrowed: false, why: 'owner record present but not seeded', mine: [], unrouted: [], critical: [], others: 0 };
  }
  const mine = [], unrouted = [], critical = [], churning = [];
  let others = 0;
  for (const a of alerts) {
    const rec = owners[a.id];
    const changedMs = rec && rec.changed_at ? Date.parse(rec.changed_at) : NaN;
    const churned = Number.isFinite(changedMs) && nowMs - changedMs < CHURN_HOURS * 3600000;
    if (churned) churning.push({ ...a, owner: rec.owner, flips: rec.flips || 0 });
    const owner = rec && !churned ? rec.owner : null;
    if (owner === alias) mine.push(a);
    else if (!owner) unrouted.push(a);
    else if (String(a.sev).toLowerCase() === 'critical') critical.push({ ...a, owner });
    else others += 1;
  }
  return { narrowed: true, mine, unrouted, critical, others, churning };
}

// Round 3 BLOCKER-2 (Langston): ONE cap, taken in PRIORITY order — critical, then unrouted, then yours — so a runaway
// of one's own alerts can never push a critical or an unrouted one out of view; the cut is named per group.
export function capBuckets(s, max) {
  let budget = max;
  const take = (list) => { const k = list.slice(0, Math.max(0, budget)); budget -= k.length; return k; };
  const critical = take(s.critical), unrouted = take(s.unrouted), mine = take(s.mine);
  const cut = { critical: s.critical.length - critical.length, unrouted: s.unrouted.length - unrouted.length, mine: s.mine.length - mine.length };
  return { critical, unrouted, mine, cut, cutTotal: cut.critical + cut.unrouted + cut.mine };
}
