// Batch 31: Global null reason tracker for strategy detect functions
// SERIALIZATION ASSUMPTION: This global tracker is safe ONLY because the VTS evaluation
// pipeline is strictly serial (for-of loops with awaited generatePhase10Signal calls).
// If strategy evaluation ever becomes concurrent (Promise.all, worker threads, etc.),
// this MUST be replaced with evaluation-local state to prevent cross-talk.
// Safe in single-threaded Node.js — reset before each detect call, read after null return
let _currentNullReason: string = 'unknown';

export function setNullReason(reason: string): void {
  _currentNullReason = reason;
}

export function getNullReason(): string {
  return _currentNullReason;
}

export function resetNullReason(): void {
  _currentNullReason = 'unknown';
}
