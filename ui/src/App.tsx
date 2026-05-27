import React from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import ProfilePage from "./pages/ProfilePage.tsx";
import GalleryPage from "./pages/GalleryPage.tsx";
import EvolutionPage from "./pages/EvolutionPage.tsx";
import EmailRegister from "./components/auth/EmailRegister.tsx";
import EmailLogin from "./components/auth/EmailLogin.tsx";
import ConfirmEmail from "./components/auth/ConfirmEmail.tsx";
import ForgotPassword from "./components/auth/ForgotPassword.tsx";
import ResetPassword from "./components/auth/ResetPassword.tsx";
import Layout from "./components/Layout.tsx";
import { isAuthenticated, getUserId } from "./services/authService.ts";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  const userId = getUserId();

  return (
    <Router>
      <Routes>
        {/* Auth Routes */}
        <Route path="/register" element={<EmailRegister />} />
        <Route path="/login" element={<EmailLogin />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Routes */}
        <Route
          path="/users/:userId"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:userId/gallery"
          element={
            <ProtectedRoute>
              <Layout>
                <GalleryPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:userId/evolution"
          element={
            <ProtectedRoute>
              <Layout>
                <EvolutionPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Dashboard alias for profile */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              {userId ? (
                <Navigate to={`/users/${userId}`} />
              ) : (
                <Navigate to="/login" />
              )}
            </ProtectedRoute>
          }
        />

        {/* Root path */}
        <Route
          path="/"
          element={
            isAuthenticated() ? (
              userId ? (
                <Navigate to={`/users/${userId}`} />
              ) : (
                <Navigate to="/login" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
