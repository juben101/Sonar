import { useState, useRef, useEffect } from "react";
import { chatApi } from "../services/api";
import useAuthStore from "../stores/useAuthStore";
import "./ChatWidget.css";

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Hey there 👋 I'm your Sonar companion. I can see your emotional journey and I'm here to chat, reflect, or just listen. How are you feeling right now?",
};

export default function ChatWidget() {
  const { token } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

    try {
      const history = messages
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await chatApi.sendMessage(text, history);
      const assistantMsg = { role: "assistant", content: res.response };
      setMessages((prev) => [...prev, assistantMsg]);

      if (!isOpen) setHasUnread(true);
    } catch {
      const errMsg = {
        role: "assistant",
        content:
          "I'm having trouble connecting right now. If you're in a crisis, please call 988 or text HOME to 741741. 💙",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([INITIAL_MESSAGE]);
  };

  // Don't render if not authenticated (after all hooks)
  if (!token) return null;

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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
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
                <span>🧠</span>
                <span className="chat-header-status" />
              </div>
              <div className="chat-header-info">
                <span className="chat-header-name">Sonar Companion</span>
                <span className="chat-header-subtitle">AI Wellness Assistant</span>
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
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-msg ${msg.role === "user" ? "chat-msg--user" : "chat-msg--bot"}`}
              >
                {msg.role === "assistant" && (
                  <div className="chat-msg-avatar">🧠</div>
                )}
                <div className="chat-msg-bubble">
                  <p className="chat-msg-text">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg chat-msg--bot">
                <div className="chat-msg-avatar">🧠</div>
                <div className="chat-msg-bubble chat-msg-bubble--typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-wrap">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Share how you're feeling..."
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
            Not a substitute for professional mental health care.
          </div>
        </div>
      )}
    </>
  );
}
