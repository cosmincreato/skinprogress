import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerWithEmail } from "../../services/authService";

export function EmailRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const isPasswordStrong = (): boolean =>
    password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address"); return; }
    if (!password) { setError("Password is required"); return; }
    if (!isPasswordStrong()) { setError("Password must be at least 8 characters with 1 uppercase letter and 1 number"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    try {
      setIsLoading(true);
      await registerWithEmail({ email: email.toLowerCase(), password, confirmPassword });
      setRegistered(true);
      setRegisteredEmail(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl text-primary tracking-wide">SkinProgress</h1>
          </div>
          <div className="bg-surface rounded-3xl border border-skin-border shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-secondary/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl text-on-surface mb-2">Check your email</h2>
            <p className="text-on-surface-variant text-sm mb-1">We sent a confirmation link to</p>
            <p className="text-on-surface font-medium text-sm mb-6">{registeredEmail}</p>
            <p className="text-xs text-on-surface-variant bg-surface-warm border border-skin-border rounded-xl px-4 py-3 mb-6">
              Click the link in your email to activate your account. It expires in 48 hours.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/confirm-email")}
                className="w-full bg-primary hover:bg-primary-hover text-on-primary py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md"
              >
                Have a code? Confirm here
              </button>
              <button
                onClick={() => navigate("/login")}
                className="w-full border-2 border-skin-border bg-surface-warm text-on-surface hover:bg-primary/8 hover:border-primary/40 hover:text-primary py-3 rounded-xl text-sm font-medium"
              >
                Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl text-primary tracking-wide">SkinProgress</h1>
          <p className="text-on-surface-variant text-sm mt-2">Your personal skin journal</p>
        </div>

        <div className="bg-surface rounded-3xl border border-skin-border shadow-sm p-8">
          <h2 className="font-display text-2xl text-on-surface mb-1">Create account</h2>
          <p className="text-on-surface-variant text-sm mb-7">Start tracking your skin's journey</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Email</label>
              <input
                id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Password</label>
              <input
                id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                disabled={isLoading}
              />
              {password && (
                <div className="mt-2.5 space-y-1.5">
                  {[
                    { ok: password.length >= 8, label: "At least 8 characters" },
                    { ok: /[A-Z]/.test(password), label: "One uppercase letter" },
                    { ok: /[0-9]/.test(password), label: "One number" },
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
                className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                disabled={isLoading}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1.5 text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={isLoading}
              className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-6">
            Already have an account?{" "}
            <button onClick={() => navigate("/login")} className="text-primary hover:text-primary-hover font-medium transition">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default EmailRegister;
