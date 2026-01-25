import { useState } from 'react';
import LoginPage from '../components/auth/LoginPage';
import RegisterPage from '../components/auth/RegisterPage';
import GoogleSignIn from '../components/auth/GoogleSignIn';

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col justify-center items-center">
            <div className="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-3xl font-bold mb-6 text-center">Authentication</h1>

                <div className="mb-6">
                    <p className="text-gray-400 text-sm text-center mb-3">Login with Google</p>
                    <GoogleSignIn />
                </div>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-gray-800 text-gray-400">Or continue with email</span>
                    </div>
                </div>

                {isLogin ? <LoginPage /> : <RegisterPage />}
                <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="w-full mt-4 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-md text-white font-semibold transition-colors duration-300"
                >
                    {isLogin ? 'Need to register?' : 'Already have an account?'}
                </button>
            </div>
        </div>
    );
};

export default AuthPage;
