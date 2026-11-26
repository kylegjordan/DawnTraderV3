// Leave time for the existing stop work within the client's 30-second request budget.
export const PAPER_ENTRY_DRAIN_BUDGET_MS = 5_000;
export const PAPER_ENTRY_DRAIN_REASON = 'Paper entry writes are still settling. Retry after they finish.';

export class PaperEntryDrainIncomplete extends Error {
  constructor() {
    super(PAPER_ENTRY_DRAIN_REASON);
  }
}

/** The paper trade and its linked position can be written by separate awaits. */
export class PaperEntryPublication {
  private activeRun: symbol | undefined;
  private readonly writers = new Set<Promise<void>>();

  startRun(): symbol {
    if (this.activeRun || this.hasPendingWriters()) {
      throw new Error('The previous paper run has not stopped and settled its entry writes.');
    }
    this.activeRun = Symbol('paper entry run');
    return this.activeRun;
  }

  closeRun(run: symbol | undefined): void {
    if (run === this.activeRun) this.activeRun = undefined;
  }

  private admits(run: symbol | undefined): boolean {
    return run !== undefined && run === this.activeRun;
  }

  beginWrite(run: symbol | undefined): (() => void) | undefined {
    if (!this.admits(run)) return undefined;
    let settle!: () => void;
    const completion = new Promise<void>((resolve) => { settle = resolve; });
    this.writers.add(completion);
    return () => {
      this.writers.delete(completion);
      settle();
    };
  }

  private hasPendingWriters(): boolean {
    return this.writers.size > 0;
  }

  isQuiescent(): boolean {
    return !this.activeRun && !this.hasPendingWriters();
  }

  hasDrainingWriters(): boolean {
    return !this.activeRun && this.hasPendingWriters();
  }

  async drain(timeBudgetMs: number): Promise<boolean> {
    if (this.activeRun) return false;
    if (!this.hasPendingWriters()) return true;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.all(this.writers).then(() => true),
        new Promise<false>((resolve) => { timeout = setTimeout(resolve, timeBudgetMs, false); }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// This outlives any portfolio manager or execution-engine instance.
export const paperEntryPublication = new PaperEntryPublication();
