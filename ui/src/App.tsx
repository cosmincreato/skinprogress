import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';

const isAuthenticated = () => {
    return localStorage.getItem('jwt') !== null;
};

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
    if (!isAuthenticated()) {
        return <Navigate to="/auth" />;
    }
    return children;
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <HomePage />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </Router>
    );
}

export default App;
