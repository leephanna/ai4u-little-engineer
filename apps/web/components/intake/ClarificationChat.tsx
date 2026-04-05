"use client";

/**
 * ClarificationChat
 *
 * Renders the guided clarification conversation after the initial interpretation.
 * Shows the assistant's question and a simple text input for the user's reply.
 * Calls /api/intake/clarify and updates the parent state.
 *
 * Track 2 fix: ClarifyResponse interface now includes fallback_form and fit_envelope
 * so the parent (UniversalCreatorFlow) can correctly detect and render ClarifyFallbackForm.
 */

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

// Track 2 fix: added fallback_form and fit_envelope to match the route's response shape
export interface ClarifyResponse {
  session_id: string;
  next_question: string | null;
  ready_to_generate: boolean;
  assistant_message: string;
  updated_dimensions: Record<string, number>;
  updated_missing_information: string[];
  updated_confidence: number;
  updated_mode: string;
  fallback_form?: boolean;
  fit_envelope?: Record<string, number> | null;
}

interface Props {
  sessionId: string;
  initialQuestion: string;
  onReady: (updatedState: ClarifyResponse) => void;
  onUpdate?: (updatedState: ClarifyResponse) => void;
}

export default function ClarificationChat({
  sessionId,
  initialQuestion,
  onReady,
  onUpdate,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: initialQuestion },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userReply = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userReply }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/intake/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, user_reply: userReply }),
      });

      if (!res.ok) {
        // Surface the server error message if available
        let errMsg = "Sorry, I had a hiccup. Could you try again?";
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = `Error: ${errData.error}`;
        } catch { /* ignore */ }
        setMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
        return;
      }

      const data: ClarifyResponse = await res.json();

      // Always call onUpdate so the parent can handle fallback_form
      onUpdate?.(data);

      if (data.ready_to_generate) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.assistant_message },
        ]);
        setIsReady(true);
        onReady(data);
      } else if (data.fallback_form) {
        // Parent will render ClarifyFallbackForm — show a final message
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.assistant_message },
        ]);
        // onUpdate already fired above — parent will swap to the fallback form
      } else if (data.next_question) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.assistant_message },
          ...(data.next_question && data.next_question !== data.assistant_message
            ? [{ role: "assistant" as const, content: data.next_question }]
            : []),
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.assistant_message },
        ]);
      }
    } catch {
      // Only show hiccup for genuine network/parse errors — not server errors
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had a hiccup. Could you try again?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-steel-700 bg-steel-800/50 overflow-hidden">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-steel-700/50 flex items-center gap-2">
        <div className="w-2 h-2 bg-brand-400 rounded-full" />
        <span className="text-sm font-medium text-steel-200">AI4U Assistant</span>
        {isReady && (
          <span className="ml-auto text-xs text-green-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            Ready
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "assistant"
                  ? "bg-steel-700 text-steel-200"
                  : "bg-brand-700 text-white"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-steel-700 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-steel-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!isReady && (
        <form
          onSubmit={handleSend}
          className="px-4 py-3 border-t border-steel-700/50 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
            disabled={isLoading}
            className="flex-1 bg-steel-700 border border-steel-600 rounded-lg px-3 py-2 text-sm text-steel-100 placeholder-steel-500 outline-none focus:border-brand-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
