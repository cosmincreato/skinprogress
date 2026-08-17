import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
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
    if (!email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address"); return; }
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/email/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data?.message || "Failed to request password reset"); return; }
      setMessage(data?.message || "Password reset email sent successfully");
      setEmailSent(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-on-surface mb-2">Check your email</h2>
          <p className="text-on-surface-variant text-sm mb-6">We've sent password reset instructions to your inbox</p>
          <p className="text-xs text-on-surface-variant bg-surface-warm border border-skin-border rounded-xl px-4 py-3 mb-6">
            If you don't see it within a few minutes, check your spam folder.
          </p>
          <div className="space-y-3">
            <button onClick={() => navigate("/reset-password")} className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md">
              Enter reset code
            </button>
            <button onClick={() => navigate("/login")} className="w-full border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary py-3 rounded-xl text-sm font-medium">
              Back to login
            </button>
            <button onClick={() => { setEmailSent(false); setEmail(""); setMessage(""); }}
              className="w-full border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary py-3 rounded-xl text-sm font-medium">
              Try another email
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="font-display text-2xl text-on-surface mb-1">Reset password</h2>
      <p className="text-on-surface-variant text-sm mb-7">Enter your email and we'll send you a reset link</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Email</label>
          <input
            id="email" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            disabled={isLoading}
          />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3"><p className="text-sm text-red-700">{error}</p></div>}
        {message && <div className="bg-sage/10 border border-sage/30 rounded-xl px-4 py-3"><p className="text-sm text-secondary">{message}</p></div>}

        <button type="submit" disabled={isLoading}
          className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
          {isLoading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-on-surface-variant mt-6">
        Remember your password?{" "}
        <button onClick={() => navigate("/login")} className="text-primary hover:text-primary-hover font-medium transition">Back to login</button>
      </p>
    </Shell>
  );
}

export default ForgotPassword;
