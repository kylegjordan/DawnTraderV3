/**
 * Session Management Utilities
 * Handles persistent JWT sessions with refresh token rotation
 */

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

export async function refreshAccessToken(): Promise<string | null> {
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
