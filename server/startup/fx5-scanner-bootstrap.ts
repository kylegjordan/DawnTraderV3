/**
 * R9.3.HF-5: Resilient FX5 Bootstrap
 * 
 * Ensures the FX5 Scanner initializes deterministically after restarts or reloads.
 * Replaces the stale singleton pattern that could block reinit.
 */

let bootstrapped = false;
let lastBootstrapAttempt = 0;

export async function bootstrapFX5Scanner(force = false): Promise<void> {
  const now = Date.now();

  // Prevent duplicate inits unless explicitly forced or last attempt > 60s ago
  if (!force && bootstrapped && now - lastBootstrapAttempt < 60000) {
    console.log('[FX5Bootstrap] Skipping reinit (already bootstrapped <60s ago)');
    return;
  }

  try {
    bootstrapped = true;
    lastBootstrapAttempt = now;
    console.log('[FX5Bootstrap] ⚙️ Initializing FX5 Scanner...');

    const { fx5Scanner } = await import('../services/fx5-scanner.js');
    await fx5Scanner.start();

    console.log('[FX5Bootstrap] ✅ FX5 Scanner started successfully');
  } catch (err) {
    bootstrapped = false;
    console.error('[FX5Bootstrap] ❌ Failed to start FX5 Scanner:', err);
  }
}
