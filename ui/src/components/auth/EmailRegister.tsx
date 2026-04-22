import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerWithEmail } from "../../services/authService";

/**
 * Email Registration Component
 * Allows new users to register with email and password
 * Displays validation feedback and sends confirmation email
 */
export function EmailRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  // Validate password strength
  const isPasswordStrong = (): boolean => {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
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

    if (!isPasswordStrong()) {
      setError(
        "Password must be at least 8 characters with 1 uppercase letter and 1 number",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      await registerWithEmail({
        email: email.toLowerCase(),
        password,
        confirmPassword,
      });

      setRegistered(true);
      setRegisteredEmail(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Success state - show confirmation email sent message
  if (registered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-emerald-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-2">
              Check Your Email
            </h2>
            <p className="text-on-surface-variant">
              We sent a confirmation link to <strong>{registeredEmail}</strong>
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-200">
              Click the confirmation link in the email to activate your account.
              The link expires in 48 hours.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate("/confirm-email")}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all duration-300"
            >
              Have a Code? Confirm Here
            </button>
            <button
              onClick={() => navigate("/login")}
              className="w-full border border-slate-700 text-on-surface-variant py-3 px-4 rounded-lg font-semibold hover:bg-slate-800/50 transition-all duration-300"
            >
              Back to Login
            </button>
          </div>

          <p className="text-center text-sm text-on-surface-variant mt-6">
            Didn't receive the email?{" "}
            <button className="text-purple-300 hover:text-purple-200 font-medium">
              Request a new link
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-on-surface mb-2">
          Create Account
        </h1>
        <p className="text-on-surface-variant mb-6">
          Join SkinProgress to track your skin evolution
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
            <label
              htmlFor="password"
              className="block text-sm font-medium text-on-surface mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
            {password && (
              <div className="mt-2 text-sm space-y-1">
                <div
                  className={`flex items-center gap-2 ${
                    password.length >= 8 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {password.length >= 8 ? "✓" : "○"} At least 8 characters
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    /[A-Z]/.test(password) ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {/[A-Z]/.test(password) ? "✓" : "○"} One uppercase letter
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    /[0-9]/.test(password) ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {/[0-9]/.test(password) ? "✓" : "○"} One number
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-on-surface mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1 text-sm text-red-300">
                Passwords do not match
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        {/* Login Link */}
        <p className="text-center text-sm text-on-surface-variant mt-6">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-purple-300 hover:text-purple-200 font-medium"
          >
            Login here
          </button>
        </p>
      </div>
    </div>
  );
}

export default EmailRegister;
