import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { confirmEmail, resendConfirmationEmail } from "../../services/authService";

export function ConfirmEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [isLoading, setIsLoading] = useState(!!searchParams.get("token"));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [resendEmail, setResendEmail] = useState(searchParams.get("email") || "");
  const [resendStatus, setResendStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  useEffect(() => {
    if (searchParams.get("token")) handleConfirm(searchParams.get("token")!);
  }, [searchParams]);

  const handleConfirm = async (confirmToken: string) => {
    if (!confirmToken.trim()) { setError("Confirmation token is required"); return; }
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); handleConfirm(token); };

  const handleResend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendStatus("loading");
    setResendError("");
    try {
      await resendConfirmationEmail(resendEmail.trim());
      setResendStatus("sent");
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Failed to resend");
      setResendStatus("error");
    }
  };

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

  if (success) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-14 h-14 bg-secondary/15 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-secondary" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-on-surface mb-2">Email confirmed</h2>
          <p className="text-on-surface-variant text-sm mb-6">Your account is ready. You can now sign in.</p>
          <button onClick={() => navigate("/login")} className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md">
            Go to login
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="font-display text-2xl text-on-surface mb-1">Confirm email</h2>
      <p className="text-on-surface-variant text-sm mb-7">
        {searchParams.get("token") ? "Confirming your email address…" : "Enter the confirmation code from your email"}
      </p>

      {isLoading && !error && (
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {[0, 100, 200].map(delay => (
            <div key={delay} className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      )}

      {!searchParams.get("token") && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-2">Confirmation code</label>
            <input
              id="token" type="text" value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste your confirmation code"
              className="w-full px-4 py-3 bg-surface-warm border border-skin-border rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              disabled={isLoading}
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3"><p className="text-sm text-red-700">{error}</p></div>}
          <button type="submit" disabled={isLoading || !token.trim()} className="w-full bg-bloom hover:bg-bloom-hover text-white py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? "Confirming…" : "Confirm email"}
          </button>
        </form>
      )}

      {searchParams.get("token") && error && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700 mb-3">{error}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text" value={token} onChange={e => setToken(e.target.value)}
                placeholder="Paste your confirmation code"
                className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
              <button type="submit" disabled={isLoading} className="w-full bg-bloom hover:bg-bloom-hover text-white py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                Confirm email
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="border-t border-skin-border mt-6 pt-6 space-y-4">
        <p className="text-sm text-on-surface-variant">
          Already confirmed?{" "}
          <button onClick={() => navigate("/login")} className="text-primary hover:text-primary-hover font-medium transition">Login here</button>
        </p>
        <div>
          <p className="text-sm text-on-surface-variant mb-2">Didn't receive the email?</p>
          {resendStatus === "sent" ? (
            <p className="text-sm text-secondary">New code sent — check your inbox.</p>
          ) : (
            <form onSubmit={handleResend} className="flex gap-2">
              <input
                type="email" value={resendEmail} onChange={e => setResendEmail(e.target.value)}
                placeholder="your@email.com" required
                className="flex-1 px-3 py-2 bg-surface-warm border border-skin-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
              <button type="submit" disabled={resendStatus === "loading" || !resendEmail.trim()}
                className="px-3 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary text-sm font-medium rounded-lg transition whitespace-nowrap">
                {resendStatus === "loading" ? "Sending…" : "Resend"}
              </button>
            </form>
          )}
          {resendStatus === "error" && <p className="text-xs text-red-500 mt-1">{resendError}</p>}
        </div>
      </div>
    </Shell>
  );
}

export default ConfirmEmail;
