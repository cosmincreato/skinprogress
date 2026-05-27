import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Forgot Password Component
 * Allows users to request a password reset link via email
 */
export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");

    // Validation
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/email/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.message || "Failed to request password reset");
        return;
      }

      setMessage(data?.message || "Password reset email sent successfully");
      setEmailSent(true);
      setEmail("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
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
            <h1 className="text-3xl font-bold text-on-surface mb-2">Check Your Email</h1>
            <p className="text-on-surface-variant">
              We've sent password reset instructions to your email address
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-300">
              If you don't see the email within a few minutes, check your spam folder.
            </p>
          </div>

          <button
            onClick={() => navigate("/reset-password")}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all duration-300"
          >
            Enter Reset Code
          </button>

          <button
            onClick={() => navigate("/login")}
            className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white py-3 px-4 rounded-lg font-semibold transition-all duration-300"
          >
            Back to Login
          </button>

          <button
            onClick={() => {
              setEmailSent(false);
              setEmail("");
              setMessage("");
            }}
            className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white py-3 px-4 rounded-lg font-semibold transition-all duration-300"
          >
            Try Another Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Forgot Password</h1>
        <p className="text-on-surface-variant mb-6">
          Enter your email address and we'll send you a link to reset your password
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

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-sm text-green-300">{message}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {/* Login Link */}
        <p className="text-center text-sm text-on-surface-variant mt-6">
          Remember your password?{" "}
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

export default ForgotPassword;
