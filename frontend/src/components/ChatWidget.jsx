import { useState, useRef, useEffect } from "react";
import useAuthStore from "../stores/useAuthStore";
import "./ChatWidget.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "hey 👋 i'm your sonar companion — i can see your emotional journey here and i'm around whenever you wanna chat, vent, or just think out loud. how are you doing?",
};

function BotGlyph({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="8" width="15" height="10" rx="4" />
      <path d="M12 4.5v2.2" />
      <circle cx="9" cy="12.8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12.8" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9.5 15.3h5" />
      <path d="M7.2 18v1.2" />
      <path d="M16.8 18v1.2" />
    </svg>
  );
}

export default function ChatWidget() {
  const { accessToken } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setHasUnread(false);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Build history (skip initial greeting)
    const history = messages
      .slice(1)
      .map((m) => ({ role: m.role, content: m.content }));

    // Add a placeholder bot message that we'll stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      // Try SSE streaming first
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch(`${API_URL}/v1/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data.trim() === "[DONE]") continue;

          accumulated += data;
          // Update the last bot message with streamed content
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated,
            };
            return updated;
          });
        }
      }

      if (!isOpen) setHasUnread(true);
    } catch {
      // Fallback: try non-streaming endpoint
      try {
        const fallbackRes = await fetch(`${API_URL}/v1/chat/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ message: text, history }),
        });

        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: data.response,
            };
            return updated;
          });
        } else {
          throw new Error("fallback failed");
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content:
              "hmm i'm having trouble connecting right now — try again in a sec? and if you're going through something really tough, please reach out to 988 or text HOME to 741741 💙",
          };
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([INITIAL_MESSAGE]);
    setLoading(false);
  };

  // Don't render if not authenticated (after all hooks)
  if (!accessToken) return null;

  return (
    <>
      {/* ── Floating Button ── */}
      <button
        className={`chat-fab ${isOpen ? "chat-fab--open" : ""} ${hasUnread ? "chat-fab--unread" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <BotGlyph size={30} />
        )}
        {hasUnread && <span className="chat-fab-badge" />}
      </button>

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div className="chat-panel" role="dialog" aria-label="Chat with Sonar Companion">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <div className="chat-header-avatar">
                <BotGlyph size={18} />
                <span className="chat-header-status" />
              </div>
              <div className="chat-header-info">
                <span className="chat-header-name">Sonar Companion</span>
                <span className="chat-header-subtitle">always here for you</span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button className="chat-header-btn" onClick={clearChat} title="Clear chat" aria-label="Clear chat history">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                </svg>
              </button>
              <button className="chat-header-btn" onClick={() => setIsOpen(false)} title="Close" aria-label="Minimize chat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages" role="log" aria-label="Chat messages" aria-live="polite">
            {messages.map((msg, i) => {
              const isEmptyStreaming = loading && msg.role === "assistant" && msg.content === "" && i === messages.length - 1;
              return (
                <div
                  key={i}
                  className={`chat-msg ${msg.role === "user" ? "chat-msg--user" : "chat-msg--bot"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="chat-msg-avatar"><BotGlyph size={14} /></div>
                  )}
                  <div className={`chat-msg-bubble ${isEmptyStreaming ? "chat-msg-bubble--typing" : ""}`}>
                    {isEmptyStreaming ? (
                      <>
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                      </>
                    ) : (
                      <p className="chat-msg-text">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-wrap">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="what's on your mind?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={2000}
            />
            <button
              className={`chat-send-btn ${input.trim() ? "chat-send-btn--active" : ""}`}
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          {/* Disclaimer */}
          <div className="chat-disclaimer">
            not a substitute for professional mental health care
          </div>
        </div>
      )}
    </>
  );
}
