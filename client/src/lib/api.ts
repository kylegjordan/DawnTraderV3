/**
 * Phase 33.C: Base API fetcher with timeout and authentication
 * 
 * This function provides:
 * - Automatic credential inclusion (cookies/session)
 * - 10-second timeout protection
 * - Proper error handling with HTTP status codes
 * - Works as default fetcher for React Query
 */

export async function apiFetch(input: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const res = await fetch(input, {
      credentials: 'include',
      signal: controller.signal,
      ...init,
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
