import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SelfieCamera from '../components/SelfieCamera';

interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    profilePictureUrl: string;
}

const HomePage = () => {
    const [user, setUser] = useState<User | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem('jwt');
            if (token) {
                try {
                    const response = await fetch('/api/auth/me', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (response.ok) {
                        const userData = await response.json();
                        setUser(userData);
                    } else {
                        // Handle error, e.g., token expired
                        localStorage.removeItem('jwt');
                        navigate('/auth');
                    }
                } catch (error) {
                    console.error('Failed to fetch user', error);
                }
            }
        };

        fetchUser();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('jwt');
        navigate('/auth');
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex justify-center items-center">
                <div className="text-xl">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <h1 className="text-3xl font-bold">Welcome, {user.username}!</h1>
                    <button
                        onClick={handleLogout}
                        className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-md text-white font-semibold transition-colors duration-300"
                    >
                        Logout
                    </button>
                </header>
                
                <main>
                    <div className="bg-gray-800 p-8 rounded-lg shadow-md mb-8">
                        <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
                        <p className="text-gray-300 mb-6">
                            This is your personalized dashboard. Take a selfie to track your skin progress.
                        </p>
                        <div className="max-w-md">
                            <h3 className="text-lg font-semibold mb-3">Selfie</h3>
                            <SelfieCamera />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default HomePage;
