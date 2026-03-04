import { useState } from "react";
import LoginPage from "../components/auth/LoginPage";
import RegisterPage from "../components/auth/RegisterPage";
import GoogleSignIn from "../components/auth/GoogleSignIn";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-on-surface flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10 pb-2">
          <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-blue-300 mb-4 leading-relaxed">
            SkinProgress
          </h1>
          <p className="text-on-surface-variant text-sm sm:text-base">
            Track your skin transformation journey
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-slate-700 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Content */}
          <div className="p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-on-surface text-center mb-6">
              {isLogin ? "Welcome Back" : "Get Started"}
            </h2>

            {/* Google Sign In */}
            <div className="mb-6 sm:mb-8">
              <GoogleSignIn />
            </div>

            {/* Divider */}
            <div className="my-10 sm:my-12">
              <div className="w-full border-t border-slate-600 mb-3" />
              <div className="flex justify-center">
                <span className="text-on-surface-variant text-xs sm:text-sm font-medium">
                  Or use email
                </span>
              </div>
            </div>

            {/* Form */}
            {isLogin ? <LoginPage /> : <RegisterPage />}

            {/* Toggle */}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="w-full mt-6 py-3 px-4 bg-slate-600 hover:bg-slate-500 border border-slate-400 rounded-xl text-on-surface font-semibold transition-all duration-300 text-sm sm:text-base"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
