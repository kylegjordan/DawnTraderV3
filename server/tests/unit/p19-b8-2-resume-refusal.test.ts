// P19-B8.2 (OBJ-2) — the resume-hardening refusal seam + the AC1 CI leg.
//
// The APPLICATION LAYER owns the fail-loud (Langston Step-1 CHANGES-NEEDED
// resolution): resumeActiveEngines refuses — zero engine writes — when the
// session row's balance or the persisted portfolio balance is absent, NULL,
// or unparseable. The schema NOT NULL constraint is only the backstop.
//
// Test shapes (scope OBJ-2, all three of the invariant's promises):
//   (a) MISSING-ROW  — a running session exists but portfolio_state has no row.
//   (b) NULL-IN-COLUMN — session.startingBalance is NULL (legacy/corrupt read).
//   (c) UNPARSEABLE  — session.startingBalance is a non-numeric string.
// Plus the AC1 CI leg (#404 dormant-path): with a VALID session + balance, the
// resume WIRING constructs the manager and calls start('internal'). HONEST
// SCOPE NOTE: this proves the session→manager→start wiring on a fresh process
// (the CI-constructible contract); the full byte-identical-state restart proof
// with real open positions is AC1 leg-2, the B8.4 switch-on gate on staging.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetSystemContext,
  mockGetRunningEngineSession,
  mockUpdateSystemContext,
  mockGetAnchorState,
  mockAddAlert,
  mockManagerStart,
  mockManagerCtor,
} = vi.hoisted(() => ({
  mockGetSystemContext: vi.fn(),
  mockGetRunningEngineSession: vi.fn(),
  mockUpdateSystemContext: vi.fn(),
  mockGetAnchorState: vi.fn(),
  mockAddAlert: vi.fn(),
  mockManagerStart: vi.fn(),
  mockManagerCtor: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: {
    getSystemContext: (...a: any[]) => mockGetSystemContext(...a),
    getRunningEngineSession: (...a: any[]) => mockGetRunningEngineSession(...a),
    updateSystemContext: (...a: any[]) => mockUpdateSystemContext(...a),
  },
}));

vi.mock('../../services/portfolio-anchor-service.js', () => ({
  getAnchorState: (...a: any[]) => mockGetAnchorState(...a),
}));

vi.mock('../../services/system-alerts.js', () => ({
  addAlert: (...a: any[]) => mockAddAlert(...a),
}));

vi.mock('../../services/active-portfolio-manager.js', () => ({
  ActivePortfolioManager: class {
    constructor(...a: any[]) { mockManagerCtor(...a); }
    start = mockManagerStart;
  },
}));

// The service pulls several siblings at module load — stub the heavy ones.
// (trading-state-sync constructs at module load and subscribes to cluster-bus;
// both must be stubbed COMPLETELY or collection throws — hence on+emit.)
vi.mock('../../services/live-pricing-adapter', () => ({
  livePricingAdapter: { setTradingMode: vi.fn() },
}));
vi.mock('../../services/cluster-bus.js', () => ({
  clusterBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../services/cluster-bus', () => ({
  clusterBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../services/trading-state-sync', () => ({
  tradingStateSync: { broadcastUserUpdate: vi.fn().mockResolvedValue(undefined) },
}));

import { resumeActiveEngines } from '../../services/active-engine-service';

const VALID_SESSION = {
  sessionId: 'sess-1',
  startedBy: 'manual',
  startingBalance: '878.00',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSystemContext.mockImplementation(async (mode: string) =>
    mode === 'paper' ? { isEngineActive: true } : { isEngineActive: false }
  );
  mockUpdateSystemContext.mockResolvedValue(undefined);
  mockAddAlert.mockResolvedValue(undefined);
  mockManagerStart.mockResolvedValue(undefined);
});

describe('resumeActiveEngines — refusal shapes (a)(b)(c)', () => {
  it('(a) MISSING-ROW: refuses when portfolio_state has no row; engine never constructed', async () => {
    mockGetRunningEngineSession.mockResolvedValue({ ...VALID_SESSION });
    mockGetAnchorState.mockResolvedValue(null); // no portfolio_state row
    await resumeActiveEngines();
    expect(mockManagerCtor).not.toHaveBeenCalled();
    expect(mockManagerStart).not.toHaveBeenCalled();
    expect(mockUpdateSystemContext).toHaveBeenCalledWith('paper', { isEngineActive: false });
    expect(mockAddAlert).toHaveBeenCalled();
  });

  it('(b) NULL-IN-COLUMN: refuses on a NULL session balance (legacy/corrupt row)', async () => {
    mockGetRunningEngineSession.mockResolvedValue({ ...VALID_SESSION, startingBalance: null });
    mockGetAnchorState.mockResolvedValue({ balance: 878, anchorVersion: 1 });
    await resumeActiveEngines();
    expect(mockManagerCtor).not.toHaveBeenCalled();
    expect(mockUpdateSystemContext).toHaveBeenCalledWith('paper', { isEngineActive: false });
  });

  it('(c) UNPARSEABLE: refuses on a non-numeric session balance (NaN vector)', async () => {
    mockGetRunningEngineSession.mockResolvedValue({ ...VALID_SESSION, startingBalance: 'corrupted' });
    mockGetAnchorState.mockResolvedValue({ balance: 878, anchorVersion: 1 });
    await resumeActiveEngines();
    expect(mockManagerCtor).not.toHaveBeenCalled();
    expect(mockUpdateSystemContext).toHaveBeenCalledWith('paper', { isEngineActive: false });
  });

  it('refuses on a zero/negative persisted balance (an invented number is never trusted)', async () => {
    mockGetRunningEngineSession.mockResolvedValue({ ...VALID_SESSION });
    mockGetAnchorState.mockResolvedValue({ balance: 0, anchorVersion: 1 });
    await resumeActiveEngines();
    expect(mockManagerCtor).not.toHaveBeenCalled();
  });
});

describe('resumeActiveEngines — AC1 CI leg (the resume wiring, #404 dormant-path)', () => {
  it('with a VALID session + trustworthy balance, constructs the manager and starts it', async () => {
    mockGetRunningEngineSession.mockResolvedValue({ ...VALID_SESSION });
    mockGetAnchorState.mockResolvedValue({ balance: 878, anchorVersion: 1 });
    await resumeActiveEngines();
    expect(mockManagerCtor).toHaveBeenCalledWith('paper', 'manual');
    expect(mockManagerStart).toHaveBeenCalledWith('internal');
    // and it did NOT flip the engine off
    expect(mockUpdateSystemContext).not.toHaveBeenCalledWith('paper', { isEngineActive: false });
  });

  it('no running session at all → resets isEngineActive false (pre-existing behavior intact)', async () => {
    mockGetRunningEngineSession.mockResolvedValue(undefined);
    await resumeActiveEngines();
    expect(mockManagerCtor).not.toHaveBeenCalled();
    expect(mockUpdateSystemContext).toHaveBeenCalledWith('paper', { isEngineActive: false });
  });
});
