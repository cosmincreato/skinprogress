import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithEmail, storeOAuthToken, getUserId } from "../../services/authService";

export function EmailLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState<number | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!isLockedOut || lockoutTimeRemaining === null) return;
    if (lockoutTimeRemaining <= 0) {
      setIsLockedOut(false);
      setLockoutTimeRemaining(null);
      setError("");
      return;
    }
    const timer = setTimeout(() => setLockoutTimeRemaining(prev => prev === null ? null : prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [isLockedOut, lockoutTimeRemaining]);

  const handleGoogleSuccess = async (credential: string) => {
    setError("");
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credential }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message || "Google sign-in failed.");
        return;
      }
      const data = await response.json();
      const stored = storeOAuthToken(data.token, data.username, data.email);
      if (!stored) { setError("Failed to process authentication token."); return; }
      const userId = getUserId();
      navigate(userId ? `/users/${userId}` : "/dashboard");
    } catch {
      setError("An error occurred. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address"); return; }
    if (!password) { setError("Password is required"); return; }
    try {
      setIsLoading(true);
      await loginWithEmail({ email: email.toLowerCase(), password });
      const userId = getUserId();
      navigate(userId ? `/users/${userId}` : "/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      if (msg.includes("temporarily locked")) {
        setIsLockedOut(true);
        setLockoutTimeRemaining(15 * 60);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-blush/6 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand mark */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl text-primary tracking-wide">SkinProgress</h1>
          <p className="text-on-surface-variant text-sm mt-2">Your personal skin journal</p>
        </div>

        <div className="bg-surface rounded-3xl border border-skin-border shadow-sm shadow-primary/5 p-8">
          <h2 className="font-display text-2xl text-on-surface mb-1">Welcome back</h2>
          <p className="text-on-surface-variant text-sm mb-7">Sign in to continue your journey</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                disabled={isLoading || isLockedOut}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-xs text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                disabled={isLoading || isLockedOut}
              />
            </div>

            {error && (
              <div className={`rounded-xl px-4 py-3 text-sm ${isLockedOut ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {error}
                {isLockedOut && lockoutTimeRemaining !== null && (
                  <p className="text-xs mt-1 opacity-70">
                    Try again in {Math.floor(lockoutTimeRemaining / 60)}:{String(lockoutTimeRemaining % 60).padStart(2, "0")}
                  </p>
                )}
                {error.includes("not confirmed") && (
                  <button
                    type="button"
                    onClick={() => navigate(`/confirm-email?email=${encodeURIComponent(email)}`)}
                    className="block text-xs font-medium text-primary mt-2"
                  >
                    Confirm email →
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLockedOut}
              className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in…" : isLockedOut ? "Account locked" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-6">
            No account?{" "}
            <button onClick={() => navigate("/register")} className="text-primary hover:text-primary-hover font-medium transition">
              Create one
            </button>
          </p>

          {clientId && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-skin-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 py-1.5 text-xs text-on-surface-variant" style={{ backgroundColor: "rgb(var(--color-background))" }}>or continue with</span>
                </div>
              </div>
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={res => { if (res.credential) handleGoogleSuccess(res.credential); else setError("No credential received from Google."); }}
                  onError={() => setError("Google sign-in was cancelled or failed.")}
                  useOneTap={false}
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailLogin;
