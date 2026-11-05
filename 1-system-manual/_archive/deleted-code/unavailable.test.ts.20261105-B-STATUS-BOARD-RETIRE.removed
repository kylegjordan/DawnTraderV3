/**
 * B-STATUS-BOARD (#1227), Langston Step-4 gate C blocker: a 503's reason must reach the page. The page's query catches
 * apiFetch's `HTTP 503: <body>` error and hands it here.
 */
import { describe, it, expect } from 'vitest';
import { unavailableFromError } from './unavailable';

const err503 = (body: unknown) => new Error(`HTTP 503: ${JSON.stringify(body)}`);

describe('B-STATUS-BOARD: a 503 reason reaches the page', () => {
  it('the board\'s own 503 body comes back as its reason and page build', () => {
    expect(unavailableFromError(err503({ ok: false, reason: 'the governance checker has not written the board yet', pageBuild: 'abc' })))
      .toEqual({ ok: false, reason: 'the governance checker has not written the board yet', pageBuild: 'abc' });
  });
  it('each reader reason survives (not written, not JSON, no generated_at, a version it does not read)', () => {
    for (const reason of ['the governance checker has not written the board yet', 'the board file is not valid JSON',
      'the board file carries no generated_at', 'the board file is version 2; this page reads version 1']) {
      expect(unavailableFromError(err503({ ok: false, reason, pageBuild: null }))?.reason).toBe(reason);
    }
  });
  it('anything else stays an error: another status, a body that is not the board\'s, a non-JSON body', () => {
    expect(unavailableFromError(new Error(`HTTP 500: ${JSON.stringify({ ok: false, reason: 'x' })}`))).toBeNull();
    expect(unavailableFromError(err503({ error: 'Service Unavailable' }))).toBeNull();
    expect(unavailableFromError(new Error('HTTP 503: <html>bad gateway</html>'))).toBeNull();
    expect(unavailableFromError(new Error('network down'))).toBeNull();
  });
});
