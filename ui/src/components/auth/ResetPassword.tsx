import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Reset Password Component
 * Allows users to reset their password using a token sent to their email
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!token.trim()) {
      setError("Reset code is required");
      return;
    }

    if (token.trim().length !== 6) {
      setError("Reset code must be 6 characters");
      return;
    }

    if (!newPassword) {
      setError("New password is required");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!/^(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter and one number");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/email/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.message || "Failed to reset password");
        return;
      }

      setResetSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full mb-4">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-on-surface mb-2">Password Reset</h1>
            <p className="text-on-surface-variant">
              Your password has been successfully reset
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-300">
              You can now login with your new password.
            </p>
          </div>

          <button
            onClick={() => navigate("/login")}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all duration-300"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Reset Password</h1>
        <p className="text-on-surface-variant mb-6">
          Enter your new password below
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Token Field */}
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-on-surface mb-1"
            >
              Reset Code
            </label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="E.g. ABC123"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50 font-mono text-lg tracking-widest uppercase"
              maxLength={6}
              disabled={isLoading}
            />
          </div>

          {/* New Password Field */}
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-on-surface mb-1"
            >
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
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
              placeholder="Re-enter your password"
              className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50"
              disabled={isLoading}
            />
          </div>

          {/* Password Requirements */}
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-3">
            <p className="text-xs font-semibold text-on-surface-variant mb-2">
              Password must contain:
            </p>
            <ul className="text-xs text-on-surface-variant space-y-1">
              <li className={newPassword.length >= 8 ? "text-green-400" : ""}>
                ✓ At least 8 characters
              </li>
              <li
                className={/[A-Z]/.test(newPassword) ? "text-green-400" : ""}
              >
                ✓ At least one uppercase letter
              </li>
              <li className={/\d/.test(newPassword) ? "text-green-400" : ""}>
                ✓ At least one number
              </li>
            </ul>
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
            {isLoading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        {/* Login Link */}
        <p className="text-center text-sm text-on-surface-variant mt-6">
          <button
            onClick={() => navigate("/login")}
            className="text-purple-300 hover:text-purple-200 font-medium"
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
