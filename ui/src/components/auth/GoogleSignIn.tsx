import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";

const GoogleSignIn = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const handleSuccess = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credential }),
      });

      if (!response.ok) {
        try {
          const data = await response.json();
          setError(data?.message || "Google sign-in failed.");
        } catch {
          setError("Google sign-in failed.");
        }
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
      } catch (e) {
        navigate("/");
      }
    } catch {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  if (!clientId) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {error && (
        <div className="w-full p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
          {error}
        </div>
      )}
      <div className="w-full">
        <GoogleLogin
          onSuccess={(res) => {
            if (res.credential) handleSuccess(res.credential);
            else setError("No credential received.");
          }}
          onError={() => setError("Google sign-in was cancelled or failed.")}
          useOneTap={false}
          size="large"
          text="signin_with"
          shape="rectangular"
        />
      </div>
    </div>
  );
};

export default GoogleSignIn;
