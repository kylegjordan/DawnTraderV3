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
    // r2 nit (Langston, fix-follows-pointer): an OWN-property read here too. These ids come from staging's alert file, not
    // from a uuid-validated writer; the old prototype read was benign (an undefined owner reads as unrouted, i.e. shown),
    // but the two sites now read the same way.
    const rec = Object.prototype.hasOwnProperty.call(owners, a.id) ? owners[a.id] : undefined;
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

// B-WAKE-OWNER-LOSS-VISIBLE (#1142): which routings THIS session's wake filter failed to save are still lost.
// `lines` are the RAW text lines of the tail of <ALIAS>.alert-owners.lost.jsonl (the filter's `_record_loss` appends one
// per failed save); `dropFirst` is true when the tail was read from an offset, so its first line may be cut.
// TWO CLOCKS, and each rule names the one it reads (Langston C1/C9):
//   EXPIRY reads `at` — the WALL-CLOCK time the loss was written. A line 24 h old or more is dropped.
//   CLEARING reads `ts` — the MESSAGE time — on both sides: a lost id is cleared when the owner record holds an entry
//     for it whose message ts is the same instant or later (`>=`: a replay of the lost message IS the repair), or whose
//     owner equals the lost owner (C11: the routing already stands). Compared as PARSED epoch ms, never as strings —
//     `at` is `…Z` to the second, a message ts is `+00:00` with microseconds. An absent or unparseable ts on EITHER side
//     never clears; only expiry ends it.
// C8: two unleased arms can append at once, so a torn line can sit ANYWHERE in the tail — skipped and COUNTED.
export const LOST_HOURS = 24;
export function lostRoutings(lines, owners, nowMs = Date.now(), dropFirst = false) {
  const tsMs = (v) => { const n = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; };
  const latest = new Map();          // id -> { id, owner, ts } — the most recent loss per id wins
  const rejects = [];
  let prose = 0, unparseable = 0;
  (lines || []).forEach((raw, i) => {
    if (i === 0 && dropFirst) return;                       // a cut first line, from reading at an offset — expected
    const text = String(raw).trim();
    if (!text) return;
    let rec;
    try { rec = JSON.parse(text); } catch { unparseable += 1; return; }
    const atMs = rec && tsMs(rec.at);
    if (atMs === null || !rec || typeof rec !== 'object') { unparseable += 1; return; }
    if (nowMs - atMs >= LOST_HOURS * 3600000) return;       // EXPIRY: wall clock
    for (const x of Array.isArray(rec.ids) ? rec.ids : []) {
      if (x && typeof x.id === 'string') latest.set(x.id, { id: x.id, owner: x.owner, ts: rec.ts });
    }
    for (const r of Array.isArray(rec.rejects) ? rec.rejects : []) rejects.push(String(r));
    prose += Number(rec.prose) || 0;
  });
  const lost = [];
  for (const x of latest.values()) {
    // Langston Step-4 C-1: an OWN-property read, never prototype indexing — `owners["__proto__"]` would match an
    // owner-less line as `undefined === undefined` and clear it silently. (The LOSS FILE's ids are uuid-validated by the
    // filter that writes them, so this is a fence, not a live path; `splitAlerts` above reads staging ids the same way.)
    const cur = owners && typeof owners === 'object' && Object.prototype.hasOwnProperty.call(owners, x.id) ? owners[x.id] : null;
    if (cur && cur.owner === x.owner) continue;                                   // C11: the routing stands
    const curMs = cur ? tsMs(cur.ts) : null, lostMs = tsMs(x.ts);
    if (curMs !== null && lostMs !== null && curMs >= lostMs) continue;           // CLEARING: message clock
    lost.push(x);
  }
  return { lost, rejects, prose, unparseable };
}

// The one line the hook shows for a lost routing — pure, so the wording and both of its cases are tested. `lost` is
// lostRoutings' result or null; `lostWhy` names a failed read of the record. Returns '' when there is nothing to say.
// "Narrowing is off" and "these routings were destroyed" are different facts with different actions (Langston B1):
// this line is only ever the second, and it is shown whether or not the session's list is narrowed.
export function lostReport(lost, lostWhy) {
  if (lost && (lost.lost.length || lost.rejects.length || lost.prose || lost.unparseable)) {
    const ids = lost.lost.map((x) => `${String(x.id).slice(0, 8)} → ${x.owner}`).join(', ');
    const extra = [lost.rejects.length ? `${lost.rejects.length} rejected marker(s) (latest: ${lost.rejects[lost.rejects.length - 1]})` : '',
      lost.prose ? `${lost.prose} prose-skip count(s)` : '', lost.unparseable ? `${lost.unparseable} unreadable line(s) skipped` : '']
      .filter(Boolean).join('; ');
    // r2 nit (Langston): lead with the non-zero fact — "failed to save 0 alert routing(s)" read as a bug.
    if (lost.lost.length) {
      return `⚠ this session's wake filter failed to save ${lost.lost.length} alert routing(s) in the last ${LOST_HOURS} h`
        + ` — they read as unrouted here until re-stated: ${ids}` + (extra ? ` (also lost: ${extra})` : '')
        + ' — tell Langston, leading with his name, to re-state those markers.';
    }
    return `⚠ this session's wake filter failed to save its alert-owner record in the last ${LOST_HOURS} h — no routing`
      + ` was lost, but these were: ${extra} — tell Langston, leading with his name.`;
  }
  return lostWhy ? `⚠ ${lostWhy} — this session cannot tell whether any alert routing was lost.` : '';
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
