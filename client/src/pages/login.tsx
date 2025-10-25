import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, LogIn, AlertCircle, Eye, EyeOff, Fingerprint } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { saveTokens } from "@/lib/auth";
import { isBiometricAvailable, tryBiometricLogin, enableBiometricLogin } from "@/hooks/useBiometricAuth";

export default function LoginPage() {
  const [_, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [offerBiometricSetup, setOfferBiometricSetup] = useState(false);

  useEffect(() => {
    // Check if this is a mobile device
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    };
    
    const mobile = checkMobile();
    setIsMobileDevice(mobile);
    
    // Only check biometric availability on mobile devices
    if (mobile) {
      isBiometricAvailable().then(setBiometricAvailable);
    }
  }, []);

  async function handleBiometricLogin() {
    setError("");
    setIsLoading(true);

    try {
      const biometricUsername = await tryBiometricLogin();
      
      if (!biometricUsername) {
        setError("Biometric authentication failed or not enabled");
        setIsLoading(false);
        return;
      }

      // Auto-login with stored biometric credentials
      setUsername(biometricUsername);
      // We need the password for actual login, so prompt user
      setError("Please enter your password to complete login");
      setIsLoading(false);
    } catch (err: any) {
      setError(err?.message || "Biometric authentication failed");
      setIsLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      
      if (res?.accessToken) {
        saveTokens(res.accessToken, res.refreshToken);
        
        // Phase 27.3: Save user with role and permissions
        const userData = {
          ...res.user,
          permissions: res.permissions || []
        };
        localStorage.setItem("user", JSON.stringify(userData));
        
        console.log('[Login] User authenticated:', {
          username: userData.username,
          role: userData.role,
          permissionCount: userData.permissions.length
        });
        
        // Only offer biometric setup on mobile devices if:
        // 1. This is a mobile device
        // 2. Biometric is available
        // 3. Not already enabled
        // 4. User hasn't declined before
        const hasDeclinedBiometric = localStorage.getItem("biometricDeclined") === "true";
        if (isMobileDevice && biometricAvailable && !localStorage.getItem("biometricEnabled") && !hasDeclinedBiometric) {
          setOfferBiometricSetup(true);
        } else {
          setLocation("/");
        }
      }
    } catch (err: any) {
      setError(err?.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricSetup() {
    try {
      const success = await enableBiometricLogin(username);
      if (success) {
        // Successfully enabled - clear any declined flag
        localStorage.removeItem("biometricDeclined");
        setLocation("/");
      } else {
        setOfferBiometricSetup(false);
        setLocation("/");
      }
    } catch {
      setOfferBiometricSetup(false);
      setLocation("/");
    }
  }
  
  function handleSkipBiometric() {
    // Remember that user declined biometric setup
    localStorage.setItem("biometricDeclined", "true");
    setOfferBiometricSetup(false);
    setLocation("/");
  }

  if (offerBiometricSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Enable Biometric Login?</CardTitle>
            <CardDescription className="text-center">
              Use fingerprint or face recognition for faster login
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleBiometricSetup} className="w-full" data-testid="button-enable-biometric">
              <Fingerprint className="mr-2 h-4 w-4" />
              Enable Biometric Login
            </Button>
            <Button onClick={handleSkipBiometric} variant="outline" className="w-full" data-testid="button-skip-biometric">
              Skip for now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
          {biometricAvailable && localStorage.getItem("biometricEnabled") && (
            <div className="mb-4">
              <Button
                onClick={handleBiometricLogin}
                variant="outline"
                className="w-full mb-4"
                disabled={isLoading}
                data-testid="button-biometric-login"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Sign in with Biometrics
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
            </div>
          )}
          
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  data-testid="input-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-password"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
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
              disabled={isLoading}
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

            <div className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  alert("Password reset is currently not available. Please contact your system administrator for assistance.");
                }}
                className="text-primary hover:underline font-medium"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>

            {/* Public registration disabled - Admin-only user management */}
            {/* 
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
            */}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
