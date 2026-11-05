/**
 * B-STATUS-BOARD (#1227) — read the status board file the governance checker writes, for GET /api/status-board.
 *
 * The checker runs on this box every 30 minutes and writes the board with an atomic rename
 * (scripts/governance-checker/status-board.mjs). This reader never builds or guesses a board: it serves the
 * file as written, adds the page build's own commit, and says plainly when the file is missing or unreadable.
 * Two ages reach the page separately (Langston, pre-audit N2): the data's `generated_at` and ref, from the
 * checker, and this build's commit — the checker redeploys itself within ~30 minutes of a merge, the page
 * only with an app deploy, so either can lag the other.
 */
import { readFile } from 'fs/promises';

export const STATUS_BOARD_FILE = process.env.GOV_BOARD_FILE || '/var/lib/governance-checker/status-board.json';
export const STATUS_BOARD_STALE_MS = 60 * 60 * 1000;
// The board file's version this reader understands (BOARD_SCHEMA in scripts/governance-checker/status-board.mjs).
// Anything else is refused with a reason, so a writer change cannot reach the page unread (Langston gate C (b)).
export const STATUS_BOARD_SCHEMA = 1;

export interface StatusBoardResponse {
  status: number;
  body: Record<string, unknown>;
}

async function pageBuild(): Promise<string | null> {
  try { return (await readFile('dist/BUILD_SHA', 'utf8')).trim() || null; } catch { return null; }
}

export async function readStatusBoard(path: string = STATUS_BOARD_FILE, nowMs: number = Date.now()): Promise<StatusBoardResponse> {
  const build = await pageBuild();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e: any) {
    return { status: 503, body: { ok: false, reason: e?.code === 'ENOENT' ? 'the governance checker has not written the board yet' : `the board file could not be read (${e?.code ?? 'error'})`, pageBuild: build } };
  }
  let board: any;
  try { board = JSON.parse(raw); } catch {
    return { status: 503, body: { ok: false, reason: 'the board file is not valid JSON', pageBuild: build } };
  }
  const generated = Date.parse(String(board?.generated_at ?? ''));
  if (!Number.isFinite(generated)) {
    return { status: 503, body: { ok: false, reason: 'the board file carries no generated_at', pageBuild: build } };
  }
  if (board?.schema !== STATUS_BOARD_SCHEMA) {
    return { status: 503, body: { ok: false, reason: `the board file is version ${board?.schema ?? 'unknown'}; this page reads version ${STATUS_BOARD_SCHEMA}`, pageBuild: build } };
  }
  const ageMs = Math.max(0, nowMs - generated);
  // `ok` and the computed fields come AFTER the spread, so nothing in the file can override them (Langston gate C (a)).
  return { status: 200, body: { ...board, ok: true, ageMs, stale: ageMs > STATUS_BOARD_STALE_MS, pageBuild: build } };
}
