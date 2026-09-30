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

// alerts: [{ id, sev, title }] · owners: { <uuid>: { owner } } or null · alias: 'CC-A' | … | null
export function splitAlerts(alerts, owners, alias) {
  if (!alias || !owners || typeof owners !== 'object') {
    return { narrowed: false, mine: [], unrouted: [], critical: [], others: 0 };
  }
  const mine = [], unrouted = [], critical = [];
  let others = 0;
  for (const a of alerts) {
    const owner = owners[a.id] && owners[a.id].owner;
    if (owner === alias) mine.push(a);
    else if (!owner) unrouted.push(a);
    else if (String(a.sev).toLowerCase() === 'critical') critical.push({ ...a, owner });
    else others += 1;
  }
  return { narrowed: true, mine, unrouted, critical, others };
}
