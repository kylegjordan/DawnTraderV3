/**
 * Session Management Utilities
 * Handles persistent JWT sessions with refresh token rotation
 * 
 * Token Refresh Lock Pattern:
 * - Prevents race conditions when multiple parallel requests need token refresh
 * - All concurrent requests wait for a single refresh operation to complete
 */

// Singleton lock for token refresh to prevent race conditions
let refreshPromise: Promise<string | null> | null = null;

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  // Keep backward compatibility with old token storage
  localStorage.setItem("token", accessToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken") || localStorage.getItem("token");
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

/**
 * Internal refresh function - performs the actual token refresh
 * This should only be called via refreshAccessTokenWithLock()
 */
async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    if (data.accessToken && data.refreshToken) {
      saveTokens(data.accessToken, data.refreshToken);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
      return data.accessToken;
    }
  } catch (error) {
    console.error("Token refresh failed:", error);
    clearTokens();
  }

  return null;
}

/**
 * Token refresh with singleton lock pattern
 * Ensures only one refresh operation happens at a time
 * All concurrent callers receive the same result
 */
export async function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  // Start a new refresh and store the promise
  refreshPromise = performTokenRefresh().finally(() => {
    // Clear the lock after refresh completes (success or failure)
    refreshPromise = null;
  });

  return refreshPromise;
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    
    // Check if token expires in less than 5 minutes
    const expiryTime = payload.exp * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return expiryTime - now < fiveMinutes;
  } catch {
    return true;
  }
}

export async function ensureValidToken(): Promise<string | null> {
  const token = getAccessToken();
  
  if (!token || isTokenExpired(token)) {
    return await refreshAccessToken();
  }
  
  return token;
}
