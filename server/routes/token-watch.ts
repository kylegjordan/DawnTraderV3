/**
 * B-TOKEN-WATCH — the tracking page's ONLY data source.
 *
 * ⛔ THIS IS THE WHOLE SERVER-SIDE FOOTPRINT OF THE STUDY, and it is
 *    deliberately this small. The observation study is a separate service,
 *    running as a separate unprivileged user, with its own store that this
 *    process CANNOT read. It publishes one derived summary file; this route
 *    hands that file to the page. Nothing here reaches the census, the raw
 *    provenance stores, or the study's secret — verified on staging by
 *    attempting each read as this app's own user.
 *
 * ★ WHY A ROUTE RATHER THAN A STATIC FILE. nginx could serve the summary
 *   directly with zero application code, but that endpoint would be
 *   UNAUTHENTICATED — a new public data surface, however innocuous the
 *   payload. Going through the app keeps the page behind the same login as
 *   everything else, and costs one small file.
 *
 * ⛔ AN ABSENT FILE MUST NEVER READ AS ZERO. If the study is not running, or
 *    the publishing job has not run yet, this returns `available: false` with
 *    a reason — never an empty summary. A page showing "0 launches" because a
 *    file was missing is indistinguishable from a page showing "0 launches"
 *    because nothing launched, and the second is a finding while the first is
 *    a bug. That distinction is the entire reason the page exists: Kyle's
 *    point was that a collector with no visible surface is unfalsifiable.
 */

import { Router } from 'express';
import { promises as fs } from 'fs';

export const tokenWatchRouter = Router();

// The study publishes here. Its store is 0751 (traverse, not list) and this
// one directory is 0755, so this process can read exactly this file.
const SUMMARY_PATH = process.env.TOKEN_WATCH_SUMMARY
  ?? '/var/lib/token-watch/public/summary.json';

// The publishing job runs hourly. Past roughly two hours the figures are stale
// enough that the page should say so rather than present them as current.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

tokenWatchRouter.get('/summary', async (_req, res) => {
  let raw: string;
  try {
    raw = await fs.readFile(SUMMARY_PATH, 'utf-8');
  } catch (err: any) {
    // ⛔ DISTINGUISH THE REASONS. "Not published yet" and "we cannot read it"
    //    are different problems with different fixes, and collapsing them into
    //    one message sends whoever reads this page looking in the wrong place.
    const reason =
      err?.code === 'ENOENT'
        ? 'The study has not published a summary yet. It is written by the hourly job.'
        : err?.code === 'EACCES'
        ? 'The summary exists but this service cannot read it — a permissions problem, not an empty study.'
        : `Could not read the summary: ${err?.code ?? err?.message ?? 'unknown error'}`;
    return res.status(503).json({ available: false, reason });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(503).json({
      available: false,
      reason: 'The published summary is not valid JSON — it may have been read mid-write.',
    });
  }

  const generatedAt = payload?.generated_at ? Date.parse(payload.generated_at) : NaN;
  const ageMs = Number.isFinite(generatedAt) ? Date.now() - generatedAt : null;

  res.json({
    available: true,
    // ★ STALENESS IS REPORTED, NOT HIDDEN. A page that silently shows
    //   yesterday's numbers as today's is worse than one that shows nothing.
    stale: ageMs !== null && ageMs > STALE_AFTER_MS,
    ageSeconds: ageMs !== null ? Math.round(ageMs / 1000) : null,
    summary: payload,
  });
});
