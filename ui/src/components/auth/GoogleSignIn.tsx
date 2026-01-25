import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';

const GoogleSignIn = () => {
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

    const handleSuccess = async (credential: string) => {
        setError(null);
        try {
            const response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: credential }),
            });

            if (!response.ok) {
                try {
                    const data = await response.json();
                    setError(data?.message || 'Google sign-in failed.');
                } catch {
                    setError('Google sign-in failed.');
                }
                return;
            }

            const data = await response.json();
            localStorage.setItem('jwt', data.token);
            navigate('/');
        } catch {
            setError('An error occurred. Please try again.');
        }
    };

    if (!clientId) {
        return null;
    }

    return (
        <div className="flex flex-col items-center gap-3">
            {error && <p className="text-red-500 text-center text-sm w-full">{error}</p>}
            <GoogleLogin
                onSuccess={(res) => {
                    if (res.credential) handleSuccess(res.credential);
                    else setError('No credential received.');
                }}
                onError={() => setError('Google sign-in was cancelled or failed.')}
                useOneTap={false}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="rectangular"
            />
        </div>
    );
};

export default GoogleSignIn;
