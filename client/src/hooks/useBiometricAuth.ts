/**
 * Biometric Authentication Hook using WebAuthn API
 * Supports Face ID, Touch ID, and other biometric authentication methods
 */

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }
  
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function enableBiometricLogin(username: string): Promise<boolean> {
  if (!("credentials" in navigator)) {
    console.warn("WebAuthn not supported");
    return false;
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: { name: "Crypto Trading App" },
      user: {
        id: new TextEncoder().encode(username),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      timeout: 60000,
    };

    const credential = await navigator.credentials.create({ publicKey });
    
    if (credential) {
      localStorage.setItem("biometricUser", username);
      localStorage.setItem("biometricEnabled", "true");
      return true;
    }
  } catch (error) {
    console.error("Biometric enrollment failed:", error);
  }

  return false;
}

export async function tryBiometricLogin(): Promise<string | null> {
  const username = localStorage.getItem("biometricUser");
  const enabled = localStorage.getItem("biometricEnabled");
  
  if (!username || enabled !== "true") {
    return null;
  }

  if (!("credentials" in navigator)) {
    return null;
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: "required",
    };

    const credential = await navigator.credentials.get({ publicKey });
    
    if (credential) {
      return username;
    }
  } catch (error) {
    console.error("Biometric login failed:", error);
  }

  return null;
}

export function disableBiometricLogin(): void {
  const username = localStorage.getItem("biometricUser");
  
  // Clear biometric settings
  localStorage.removeItem("biometricUser");
  localStorage.removeItem("biometricEnabled");
  
  // SECURITY: Clear any legacy password storage (from older vulnerable implementation)
  if (username) {
    localStorage.removeItem(`biometric_${username}_password`);
  }
}
