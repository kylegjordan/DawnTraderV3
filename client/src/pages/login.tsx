import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, LogIn, AlertCircle, Fingerprint } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { saveTokens } from "@/lib/auth";
import { tryBiometricLogin, isBiometricAvailable } from "@/hooks/useBiometricAuth";

export default function LoginPage() {
  const [_, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [tryingBiometric, setTryingBiometric] = useState(false);

  useEffect(() => {
    // Check if biometric is available
    isBiometricAvailable().then(setBiometricAvailable);

    // Check if biometric auto-login should be attempted
    // Note: WebAuthn biometric is enrolled but still requires password for actual login
    // This is a placeholder for future full WebAuthn implementation
    const checkBiometric = async () => {
      const storedUsername = await tryBiometricLogin();
      if (storedUsername) {
        setUsername(storedUsername); // Pre-fill username for convenience
      }
    };

    checkBiometric();
  }, [setLocation]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      
      if (res?.accessToken) {
        saveTokens(res.accessToken, res.refreshToken);
        localStorage.setItem("user", JSON.stringify(res.user));
        setLocation("/");
      }
    } catch (err: any) {
      setError(err?.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError("");
    setTryingBiometric(true);

    try {
      const storedUsername = await tryBiometricLogin();
      if (storedUsername) {
        setUsername(storedUsername);
        setError("Please enter your password to continue.");
      } else {
        setError("Biometric authentication failed. Please use password login.");
      }
    } catch (err: any) {
      setError("Biometric login failed. Please use password login.");
    } finally {
      setTryingBiometric(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your trading account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                data-testid="input-password"
              />
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
              disabled={isLoading || tryingBiometric}
              data-testid="button-login"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>

            {biometricAvailable && localStorage.getItem("biometricEnabled") === "true" && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBiometricLogin}
                  disabled={isLoading || tryingBiometric}
                  data-testid="button-biometric-login"
                >
                  {tryingBiometric ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="mr-2 h-4 w-4" />
                      Use Biometric Quick Access
                    </>
                  )}
                </Button>
              </>
            )}

            <div className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/register")}
                className="text-primary hover:underline font-medium"
                data-testid="link-register"
              >
                Create one
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
