import { useState } from "react";
import { useNavigate } from "react-router-dom";

const RegisterPage = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toFriendlyRegisterError = (message: string) => {
    const cleaned = message.replace(/\s+/g, " ").trim();
    const lower = cleaned.toLowerCase();

    if (!cleaned) return "Registration failed. Please try again.";
    if (lower.includes("validation") || lower.includes("one or more")) {
      return "Please check your details and try again.";
    }
    if (lower.includes("email") && lower.includes("username")) {
      return "Email or username is already in use.";
    }

    if (cleaned.length > 120) {
      return `${cleaned.slice(0, 117)}...`;
    }

    return cleaned;
  };

  const getErrorMessage = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();

      if (typeof data?.message === "string") {
        return toFriendlyRegisterError(data.message);
      }
      if (typeof data?.title === "string") {
        return toFriendlyRegisterError(data.title);
      }

      if (data?.errors && typeof data.errors === "object") {
        const firstFieldErrors = Object.values(data.errors)[0];
        if (Array.isArray(firstFieldErrors) && firstFieldErrors.length > 0) {
          return toFriendlyRegisterError(String(firstFieldErrors[0]));
        }
      }

      return "Please check your details and try again.";
    }

    try {
      const text = await response.text();
      if (text) return toFriendlyRegisterError(text);
    } catch {}

    return "Registration failed. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        const message = await getErrorMessage(response);
        setError(message);
        setLoading(false);
        return;
      }

      const data = await response.json();
      localStorage.setItem("jwt", data.token);

      try {
        const payload = JSON.parse(atob(data.token.split(".")[1]));
        const userId =
          payload[
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
          ];
        if (userId) {
          navigate(`/users/${userId}`);
        } else {
          navigate("/");
        }
      } catch {
        navigate("/");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 sm:p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="username"
          className="block text-sm font-semibold mb-2 text-on-surface"
        >
          Username
        </label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full px-4 py-3 bg-slate-600 border border-slate-400 rounded-xl text-on-surface placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
          placeholder="Choose a username"
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-semibold mb-2 text-on-surface"
        >
          Email
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 bg-slate-600 border border-slate-400 rounded-xl text-on-surface placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-semibold mb-2 text-on-surface"
        >
          Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 bg-slate-600 border border-slate-400 rounded-xl text-on-surface placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 rounded-xl font-semibold transition-all duration-300 text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
      >
        {loading ? "Creating account..." : "Sign Up"}
      </button>
    </form>
  );
};

export default RegisterPage;
