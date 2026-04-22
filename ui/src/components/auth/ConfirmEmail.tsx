import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { confirmEmail } from "../../services/authService";

/**
 * Email Confirmation Component
 * Confirms user email using token from confirmation email link
 * Can be accessed via:
 * 1. Link in confirmation email: /confirm-email?token=xxx
 * 2. Manual entry form: /confirm-email (paste token)
 */
export function ConfirmEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [isLoading, setIsLoading] = useState(!!searchParams.get("token"));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Auto-confirm if token in URL
    if (searchParams.get("token")) {
      handleConfirm(searchParams.get("token")!);
    }
  }, [searchParams]);

  const handleConfirm = async (confirmToken: string) => {
    if (!confirmToken.trim()) {
      setError("Confirmation token is required");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      await confirmEmail({ token: confirmToken });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleConfirm(token);
  };

  // Success state
  if (success) {
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
              Email Confirmed!
            </h2>
            <p className="text-on-surface-variant">
              Your email has been successfully verified
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-200">
              You can now log in to your SkinProgress account and start tracking
              your skin progress.
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

  // Confirmation form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-surface/50 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-on-surface mb-2">
          Confirm Email
        </h1>
        <p className="text-on-surface-variant mb-6">
          {searchParams.get("token")
            ? "Confirming your email address..."
            : "Enter the confirmation code from your email"}
        </p>

        {isLoading && !error && (
          <div className="flex items-center justify-center space-x-2 mb-6">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
              style={{ animationDelay: "100ms" }}
            ></div>
            <div
              className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
              style={{ animationDelay: "200ms" }}
            ></div>
          </div>
        )}

        {!searchParams.get("token") && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Token Input */}
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-on-surface mb-1"
              >
                Confirmation Code
              </label>
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your confirmation code here"
                className="w-full px-4 py-2 bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono text-sm"
                disabled={isLoading}
              />
              <p className="text-xs text-on-surface-variant mt-1">
                You can find this code in your confirmation email
              </p>
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
              disabled={isLoading || !token.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
            >
              {isLoading ? "Confirming..." : "Confirm Email"}
            </button>
          </form>
        )}

        {/* Error for auto-confirmation */}
        {searchParams.get("token") && error && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-300 mb-4">{error}</p>
              <p className="text-xs text-on-surface-variant mb-4">
                Try entering the code manually:
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your confirmation code here"
                  className="w-full px-3 py-2 bg-slate-800/50 text-on-surface placeholder-on-surface-variant/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono text-sm"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 transition-all duration-300"
                >
                  Confirm Email
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Help Links */}
        <div className="border-t border-slate-700 mt-6 pt-6">
          <p className="text-sm text-on-surface-variant">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-purple-300 hover:text-purple-200 font-medium"
            >
              Login here
            </button>
          </p>
          <p className="text-sm text-on-surface-variant mt-3">
            Didn't receive the email?{" "}
            <button className="text-purple-300 hover:text-purple-200 font-medium">
              Request a new code
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConfirmEmail;
