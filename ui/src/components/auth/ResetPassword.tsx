import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
    </div>
    <div className="relative w-full max-w-md">
      <div className="text-center mb-10">
        <h1 className="font-display text-4xl text-primary tracking-wide">SkinProgress</h1>
      </div>
      <div className="bg-surface rounded-3xl border border-skin-border shadow-sm p-8">
        {children}
      </div>
    </div>
  </div>
);

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
    if (!token.trim()) { setError("Reset code is required"); return; }
    if (token.trim().length !== 6) { setError("Reset code must be 6 characters"); return; }
    if (!newPassword) { setError("New password is required"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters long"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (!/^(?=.*[A-Z])(?=.*\d)/.test(newPassword)) { setError("Password must contain at least one uppercase letter and one number"); return; }
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/email/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data?.message || "Failed to reset password"); return; }
      setResetSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (resetSuccess) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-14 h-14 bg-secondary/15 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-on-surface mb-2">Password updated</h2>
          <p className="text-on-surface-variant text-sm mb-6">You can now sign in with your new password.</p>
          <button onClick={() => navigate("/login")} className="w-full bg-primary hover:bg-primary-hover text-on-primary py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md">
            Go to login
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="font-display text-2xl text-on-surface mb-1">Reset password</h2>
      <p className="text-on-surface-variant text-sm mb-7">Enter your reset code and choose a new password</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="token" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Reset code</label>
          <input
            id="token" type="text" value={token}
            onChange={e => setToken(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            maxLength={6} disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">New password</label>
          <input
            id="newPassword" type="password" value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            disabled={isLoading}
          />
          {newPassword && (
            <div className="mt-2.5 space-y-1.5">
              {[
                { ok: newPassword.length >= 8, label: "At least 8 characters" },
                { ok: /[A-Z]/.test(newPassword), label: "One uppercase letter" },
                { ok: /[0-9]/.test(newPassword), label: "One number" },
              ].map(({ ok, label }) => (
                <div key={label} className={`flex items-center gap-2 text-xs ${ok ? "text-green-600" : "text-on-surface-variant/60"}`}>
                  {ok ? (
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-on-surface-variant/30" />
                  )}
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Confirm password</label>
          <input
            id="confirmPassword" type="password" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            disabled={isLoading}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1.5 text-xs text-red-500">Passwords do not match</p>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3"><p className="text-sm text-red-700">{error}</p></div>}

        <button type="submit" disabled={isLoading}
          className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
          {isLoading ? "Resetting…" : "Reset password"}
        </button>
      </form>

      <p className="text-center text-sm text-on-surface-variant mt-6">
        Remember your password?{" "}
        <button onClick={() => navigate("/login")} className="text-primary hover:text-primary-hover font-medium transition">Back to login</button>
      </p>
    </Shell>
  );
}

export default ResetPassword;
