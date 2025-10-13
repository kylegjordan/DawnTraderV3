/**
 * Biometric authentication hook for mobile PWA
 * Supports Face ID and fingerprint authentication using WebAuthn API
 */

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Check if biometric authentication is available on this device
 */
export function isBiometricAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if Web Authentication API is available
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.get
  );
}

/**
 * Attempt to authenticate using biometrics (Face ID / fingerprint)
 * This is a placeholder implementation that checks for WebAuthn support
 */
export async function attemptBiometricLogin(): Promise<BiometricAuthResult> {
  if (!isBiometricAvailable()) {
    return {
      success: false,
      error: 'Biometric authentication is not available on this device'
    };
  }

  try {
    // Note: Full WebAuthn implementation would require:
    // 1. Server-side credential registration during user setup
    // 2. Server-side challenge generation for authentication
    // 3. Credential verification on the server
    
    // For now, check if biometrics are supported
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    
    if (!available) {
      return {
        success: false,
        error: 'Biometric authenticator not available'
      };
    }

    // In a full implementation, this would:
    // 1. Request challenge from server
    // 2. Get credentials using navigator.credentials.get()
    // 3. Send credential response to server for verification
    // 4. Return JWT token on success
    
    return {
      success: false,
      error: 'Biometric authentication setup required. Please login with password first.'
    };
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Biometric authentication failed'
    };
  }
}

/**
 * Hook to use biometric authentication in components
 */
export function useBiometricAuth() {
  const isAvailable = isBiometricAvailable();

  return {
    isAvailable,
    attemptLogin: attemptBiometricLogin
  };
}
