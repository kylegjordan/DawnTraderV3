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
 */

import { getGlobalTradingMode } from './tradingMode';
import { ensureValidToken } from './auth';

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
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
