import bcrypt from "bcryptjs";

/**
 * Validates password strength according to security requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 * - At least 1 special character
 */
export function validatePasswordStrength(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+=\-{};:'",.<>?]/.test(password);
  
  return minLength && hasUppercase && hasNumber && hasSpecialChar;
}

/**
 * Hashes a password using bcrypt with salt rounds of 10
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verifies a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Gets a detailed password strength message for user feedback
 */
export function getPasswordStrengthMessage(password: string): string {
  const issues: string[] = [];
  
  if (password.length < 8) issues.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) issues.push("one uppercase letter");
  if (!/\d/.test(password)) issues.push("one number");
  if (!/[!@#$%^&*()_+=\-{};:'",.<>?]/.test(password)) issues.push("one special character");
  
  if (issues.length === 0) return "Password is strong";
  return `Password must contain ${issues.join(", ")}`;
}
