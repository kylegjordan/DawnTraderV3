/**
 * Phase 33.C: Base API fetcher with timeout and authentication
 * 
 * This function provides:
 * - Automatic JWT token inclusion from localStorage
 * - Automatic credential inclusion (cookies/session)
 * - 30-second timeout protection
 * - Proper error handling with HTTP status codes
 * - x-app-mode header for backend trading mode tracking
 * - Works as default fetcher for React Query
 * - One-time retry on 401 errors with fresh token (prevents race condition failures)
 */

import { getGlobalTradingMode } from './tradingMode';
import { ensureValidToken, refreshAccessToken } from './auth';

export async function apiFetch(input: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    // Get JWT token from localStorage
    const token = await ensureValidToken();
    
    const headers = {
      'x-app-mode': getGlobalTradingMode(),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    };
    
    const res = await fetch(input, {
      credentials: 'include',
      signal: controller.signal,
      ...init,
      headers,
    });
    
    // Handle 401 with one-time retry after token refresh
    if (res.status === 401) {
      // Force a fresh token refresh
      const freshToken = await refreshAccessToken();
      
      if (freshToken) {
        // Retry the request with the new token
        const retryHeaders = {
          'x-app-mode': getGlobalTradingMode(),
          'Authorization': `Bearer ${freshToken}`,
          ...(init?.headers || {}),
        };
        
        const retryRes = await fetch(input, {
          credentials: 'include',
          signal: controller.signal,
          ...init,
          headers: retryHeaders,
        });
        
        if (!retryRes.ok) {
          const text = await retryRes.text().catch(() => '');
          throw new Error(`HTTP ${retryRes.status}: ${text}`);
        }
        
        return retryRes.json();
      }
      
      // No fresh token available - throw the original 401 error
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP 401: ${text}`);
    }
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
