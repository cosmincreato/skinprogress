import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ChatbotWidget from "./ChatbotWidget";

interface LayoutProps {
  children: React.ReactNode;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const GalleryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

const EvolutionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────

export function Layout({ children }: LayoutProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { userId } = useParams<{ userId: string }>();

  const username  = localStorage.getItem("username") || localStorage.getItem("userEmail")?.split("@")[0] || "You";
  const userEmail = localStorage.getItem("userEmail") || "";
  const initial   = username[0]?.toUpperCase() ?? "U";

  // ── Theme ──
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const toggleTheme = () => {
    const html = document.documentElement;
    html.classList.add("theme-transitioning");
    setTimeout(() => html.classList.remove("theme-transitioning"), 200);
    setIsDark(prev => !prev);
  };

  // ── Auth ──
  const handleLogout = () => {
    ["jwt", "accessToken", "refreshToken", "userId", "userEmail", "username"].forEach(k =>
      localStorage.removeItem(k)
    );
    navigate("/login");
  };

  const navItems = [
    { label: "Today",     icon: <HomeIcon />,      path: `/users/${userId}` },
    { label: "Gallery",   icon: <GalleryIcon />,   path: `/users/${userId}/gallery` },
    { label: "Evolution", icon: <EvolutionIcon />, path: `/users/${userId}/evolution` },
  ];

  const isActive = (path: string) => location.pathname === path;

  const navBtnClass = (path: string) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${
      isActive(path)
        ? "bg-primary/10 text-primary font-semibold"
        : "font-medium text-on-surface-variant hover:bg-primary/8 hover:text-primary"
    }`;

  const utilBtnClass =
    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-primary/8 hover:text-primary";

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Desktop sidebar ────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-30 bg-surface border-r border-skin-border">

        {/* Logo */}
        <div className="px-6 py-7 border-b border-skin-border">
          <h1 className="font-display text-[1.65rem] leading-none text-primary tracking-wide">
            SkinProgress
          </h1>
          <p className="text-xs text-on-surface-variant mt-1.5 tracking-wide">Your skin journal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5">
          {navItems.map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} className={navBtnClass(item.path)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* User + actions */}
        <div className="px-4 py-5 border-t border-skin-border space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{username}</p>
              <p className="text-xs text-on-surface-variant truncate">{userEmail}</p>
            </div>
          </div>

          <button onClick={toggleTheme} className={utilBtnClass}>
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? "Light mode" : "Dark mode"}
          </button>

          <button onClick={handleLogout} className={utilBtnClass}>
            <LogoutIcon />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 lg:ml-64 min-h-screen pb-20 lg:pb-0">
        {children}
        <ChatbotWidget />
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-skin-border">
        <div className="flex">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 ${
                isActive(item.path) ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-on-surface-variant"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            <span className="text-[10px] font-medium">{isDark ? "Light" : "Dark"}</span>
          </button>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-on-surface-variant"
          >
            <LogoutIcon />
            <span className="text-[10px] font-medium">Sign out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default Layout;
