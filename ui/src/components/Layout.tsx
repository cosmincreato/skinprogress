import React from "react";
import ChatbotWidget from "./ChatbotWidget";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <>
      {children}
      <ChatbotWidget />
    </>
  );
}

export default Layout;
