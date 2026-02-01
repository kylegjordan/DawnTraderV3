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
  console.log('[11.7E][apiFetch] ENTRY - url:', input, 'method:', init?.method || 'GET');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    // Get JWT token from localStorage
    console.log('[11.7E][apiFetch] About to call ensureValidToken...');
    const token = await ensureValidToken();
    console.log('[11.7E][apiFetch] ensureValidToken returned:', token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
    
    // Determine if this is a mutating request (POST, PUT, PATCH, DELETE)
    const method = (init?.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    // Build headers object
    const headers: Record<string, string> = {
      'x-app-mode': getGlobalTradingMode(),
    };
    
    // For mutations, add Cache-Control headers to bypass all caching layers
    // This ensures POST requests always reach the server (fixes regime-archive trigger issue)
    if (isMutation) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }
    
    // Add auth token if present
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Merge with any custom headers from init
    if (init?.headers) {
      Object.assign(headers, init.headers);
    }
    
    console.log('[11.7E][apiFetch] About to call fetch() - url:', input);
    const res = await fetch(input, {
      credentials: 'include',
      signal: controller.signal,
      ...init,
      headers,
    });
    console.log('[11.7E][apiFetch] fetch() resolved - status:', res.status, 'ok:', res.ok);
    
    // Handle 401 with one-time retry after token refresh
    if (res.status === 401) {
      console.log('[11.7E][apiFetch] Got 401, attempting token refresh...');
      // Force a fresh token refresh
      const freshToken = await refreshAccessToken();
      console.log('[11.7E][apiFetch] refreshAccessToken returned:', freshToken ? 'TOKEN_PRESENT' : 'NO_TOKEN');
      
      if (freshToken) {
        // Retry the request with the new token
        const retryHeaders = {
          'x-app-mode': getGlobalTradingMode(),
          'Authorization': `Bearer ${freshToken}`,
          ...(init?.headers || {}),
        };
        
        console.log('[11.7E][apiFetch] Retrying fetch with fresh token...');
        const retryRes = await fetch(input, {
          credentials: 'include',
          signal: controller.signal,
          ...init,
          headers: retryHeaders,
        });
        console.log('[11.7E][apiFetch] Retry fetch resolved - status:', retryRes.status);
        
        if (!retryRes.ok) {
          const text = await retryRes.text().catch(() => '');
          console.log('[11.7E][apiFetch] Retry failed, throwing error');
          throw new Error(`HTTP ${retryRes.status}: ${text}`);
        }
        
        console.log('[11.7E][apiFetch] Retry succeeded, returning JSON');
        return retryRes.json();
      }
      
      // No fresh token available - throw the original 401 error
      const text = await res.text().catch(() => '');
      console.log('[11.7E][apiFetch] No fresh token, throwing 401 error');
      throw new Error(`HTTP 401: ${text}`);
    }
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log('[11.7E][apiFetch] Response not ok, throwing error - status:', res.status);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    console.log('[11.7E][apiFetch] SUCCESS - returning JSON for:', input);
    return res.json();
  } catch (error) {
    console.log('[11.7E][apiFetch] CATCH block - error:', error);
    throw error;
  } finally {
    console.log('[11.7E][apiFetch] FINALLY block - clearing timeout');
    clearTimeout(timeout);
  }
}
