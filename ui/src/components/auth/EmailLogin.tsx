import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import {
  loginWithEmail,
  storeOAuthToken,
  getUserId,
} from "../../services/authService";

/**
 * Email Login Component
 * Allows users to login with their email and password
 * Can only login after email has been confirmed
 * Displays rate limiting warnings and lockout messages
 */
export function EmailLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const handleGoogleSuccess = async (credential: string) => {
    setError("");
    try {
      console.log("🔵 Google sign-in initiated");
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credential }),
      });

      console.log("🔵 Backend response status:", response.status);

      if (!response.ok) {
        try {
          const data = await response.json();
          console.error("🔴 Auth error:", data.message);
          setError(data?.message || "Google sign-in failed.");
        } catch {
          setError("Google sign-in failed.");
        }
        return;
      }

      const data = await response.json();
      console.log("🔵 Auth response data:", data);

      // Store the OAuth token using the auth service
      const stored = storeOAuthToken(data.token, data.username, data.email);
      console.log("🔵 Token stored:", stored);

      if (!stored) {
        setError("Failed to process authentication token.");
        return;
      }

      // Navigate to user dashboard
      const userId = getUserId();
      console.log("🔵 UserId from storage:", userId);

      if (userId) {
        console.log("🔵 Navigating to /users/" + userId);
        navigate(`/users/${userId}`);
      } else {
        console.log("🔵 Navigating to /dashboard");
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("🔴 Google sign-in error:", error);
      setError("An error occurred. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    try {
      setIsLoading(true);
      await loginWithEmail({
        email: email.toLowerCase(),
        password,
      });

      // Redirect to dashboard on successful login
      navigate("/dashboard");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);

      // Check if error is about rate limiting
      if (errorMessage.includes("temporarily locked")) {
        // Show lockout warning
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Login</h1>
        <p className="text-on-surface-variant mb-6">
          Welcome back to SkinProgress
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-on-surface mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-on-surface"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setError(
                    "Password reset is not yet available. Please contact support.",
                  );
                }}
                className="text-sm text-purple-300 hover:text-purple-200"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">{error}</p>
              {error.includes("not confirmed") && (
                <button
                  type="button"
                  onClick={() => navigate("/confirm-email")}
                  className="text-sm text-purple-300 hover:text-purple-200 mt-2 font-medium"
                >
                  Confirm email
                </button>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Registration Link */}
        <p className="text-center text-sm text-on-surface-variant mt-6">
          Don't have an account?{" "}
          <button
            onClick={() => navigate("/register")}
            className="text-purple-300 hover:text-purple-200 font-medium"
          >
            Create one here
          </button>
        </p>

        {/* Additional Auth Options */}
        <div className="mt-8 border-t border-slate-700 pt-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface/50 text-on-surface-variant">
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Sign-In */}
          {clientId && (
            <GoogleLogin
              onSuccess={(res) => {
                if (res.credential) handleGoogleSuccess(res.credential);
                else setError("No credential received from Google.");
              }}
              onError={() =>
                setError("Google sign-in was cancelled or failed.")
              }
              useOneTap={false}
              size="large"
              text="signin_with"
              shape="rectangular"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailLogin;
