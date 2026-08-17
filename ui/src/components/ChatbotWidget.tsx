import React, { useState, useRef, useEffect } from "react";
import { isAuthenticated, getUserId } from "../services/authService";

interface Message {
  id: string;
  type: "user" | "bot";
  text: string;
  timestamp: Date;
}

/**
 * Chatbot Widget Component
 * Floating chat widget in the bottom right corner
 * Connects to n8n webhook for AI chat
 */
export function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(`session-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const n8nWebhookUrl =
    import.meta.env.VITE_N8N_WEBHOOK_URL ||
    "http://localhost:5678/webhook/23a6bc03-c48c-4ac5-a90a-f779b2793037/chat";

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      text: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatInput: inputValue, sessionId: sessionId.current, userId: getUserId() }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      console.log("[Chatbot] n8n raw response:", responseText.slice(0, 1000));

      let botText = "";

      // n8n streams newline-delimited JSON: {"type":"item","content":"token",...}
      for (const line of responseText.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "item" && parsed.content) {
            botText += parsed.content;
          }
        } catch {}
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: "bot",
          text: botText || "I couldn't generate a response.",
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error("[Chatbot] error:", error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "bot",
        text: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return !isAuthenticated() ? null : (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Window */}
      {isOpen && (
        <div className="rounded-2xl shadow-2xl w-96 h-96 flex flex-col mb-4 border border-skin-border overflow-hidden" style={{ backgroundColor: "rgb(var(--color-surface))" }}>
          {/* Header */}
          <div className="bg-bloom px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              Bloom
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 p-1 rounded transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <p className="text-on-surface-variant mb-2">
                    Hi, I'm Bloom. How can I help your skin glow today?
                  </p>
                  <p className="text-xs text-on-surface-variant/70">
                    Your friendly skincare guide
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    message.type === "user"
                      ? "bg-bloom text-white rounded-br-none"
                      : "bg-surface-warm text-on-surface rounded-bl-none border border-skin-border"
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-surface-warm text-on-surface px-4 py-2 rounded-lg rounded-bl-none border border-skin-border">
                  <div className="flex space-x-2">
                    <div
                      className="w-2 h-2 bg-bloom rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-bloom rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-bloom rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <div className="border-t border-skin-border p-4 rounded-b-2xl bg-surface">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 bg-surface-warm border border-skin-border rounded-lg text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-bloom disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="bg-bloom hover:bg-bloom-hover text-white px-4 py-2 rounded-lg font-medium transition shadow-sm hover:shadow-md disabled:opacity-50"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-bloom hover:bg-bloom-hover text-white p-4 rounded-full shadow-lg hover:shadow-xl transition transform hover:scale-110 w-16 h-16 flex items-center justify-center ml-80"
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default ChatbotWidget;
