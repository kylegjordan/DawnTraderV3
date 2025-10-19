import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, UserPlus, AlertCircle, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { saveTokens } from "@/lib/auth";

export default function RegisterPage() {
  const [_, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Password strength indicators
  const hasLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+=\-{};:'",.<>?]/.test(password);
  const isPasswordValid = hasLength && hasUppercase && hasNumber && hasSpecialChar;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isPasswordValid) {
      setError("Password does not meet strength requirements");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("POST", "/api/auth/register", { username, password });
      
      // Auto-login after successful registration
      const loginRes = await apiRequest("POST", "/api/auth/login", { username, password });
      
      if (loginRes?.accessToken) {
        saveTokens(loginRes.accessToken, loginRes.refreshToken);
        
        // Phase 27.3: Save user with role and permissions
        const userData = {
          ...loginRes.user,
          permissions: loginRes.permissions || []
        };
        localStorage.setItem("user", JSON.stringify(userData));
        
        setLocation("/");
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
          <CardDescription className="text-center">
            Sign up to start trading
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
                data-testid="input-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                data-testid="input-password"
              />
              
              {/* Password strength indicators */}
              {password && (
                <div className="space-y-1 text-sm mt-2">
                  <div className={`flex items-center gap-2 ${hasLength ? 'text-success' : 'text-muted-foreground'}`}>
                    {hasLength ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border" />}
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasUppercase ? 'text-success' : 'text-muted-foreground'}`}>
                    {hasUppercase ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border" />}
                    <span>One uppercase letter</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasNumber ? 'text-success' : 'text-muted-foreground'}`}>
                    {hasNumber ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border" />}
                    <span>One number</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasSpecialChar ? 'text-success' : 'text-muted-foreground'}`}>
                    {hasSpecialChar ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border" />}
                    <span>One special character</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                data-testid="input-confirm-password"
              />
              {confirmPassword && (
                <div className={`text-sm ${passwordsMatch ? 'text-success' : 'text-destructive'}`}>
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription data-testid="text-error-message">{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !isPasswordValid || !passwordsMatch}
              data-testid="button-register"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-primary hover:underline font-medium"
                data-testid="link-login"
              >
                Sign in
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
