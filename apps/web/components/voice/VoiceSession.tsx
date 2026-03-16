"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceTurn } from "@/lib/types";

type SessionState =
  | "bootstrapping"
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

interface VoiceSessionProps {
  jobId?: string;
  onTranscript?: (text: string, speaker: "user" | "assistant") => void;
  onJobCreated?: (jobId: string) => void;
  onSpecReady?: (spec: Record<string, unknown>) => void;
}

export function VoiceSession({
  jobId,
  onTranscript,
  onJobCreated,
  onSpecReady,
}: VoiceSessionProps) {
  const [state, setState] = useState<SessionState>("bootstrapping");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // sessionId is now a real UUID from the server (public.sessions row)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Bootstrap: create a real sessions row on mount ──────────
  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      try {
        const res = await fetch("/api/sessions", { method: "POST" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setSessionId(data.session_id);
          setState("idle");
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to start session";
          setError(msg);
          setState("error");
        }
      }
    }

    bootstrapSession();
    return () => { cancelled = true; };
  }, []);

  // ── Close session on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (sessionId) {
        // Fire-and-forget: mark session as ended
        fetch("/api/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        }).catch(() => {/* ignore cleanup errors */});
      }
    };
  }, [sessionId]);

  // ── Auto-scroll transcript ───────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const startRecording = useCallback(async () => {
    if (!sessionId) {
      setError("Session not ready. Please wait a moment.");
      return;
    }
    try {
      setState("connecting");
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(250);
      setState("listening");
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setState("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentJobId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setState("processing");
    }
  }, [isRecording]);

  const processAudio = async (audioBlob: Blob) => {
    if (!sessionId) return;

    try {
      setState("processing");

      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await fetch("/api/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,   // Real UUID from public.sessions
          job_id: currentJobId ?? null,
          audio_base64: base64,
          mime_type: audioBlob.type,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.user_transcript) {
        const userTurn: VoiceTurn = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          job_id: currentJobId ?? null,
          speaker: "user",
          transcript_text: data.user_transcript,
          audio_url: null,
          created_at: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, userTurn]);
        onTranscript?.(data.user_transcript, "user");
      }

      if (data.assistant_response) {
        const assistantTurn: VoiceTurn = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          job_id: currentJobId ?? null,
          speaker: "assistant",
          transcript_text: data.assistant_response,
          audio_url: null,
          created_at: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, assistantTurn]);
        onTranscript?.(data.assistant_response, "assistant");
        setState("speaking");

        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(data.assistant_response);
          utterance.rate = 1.1;
          utterance.onend = () => setState("idle");
          window.speechSynthesis.speak(utterance);
        } else {
          setState("idle");
        }
      } else {
        setState("idle");
      }

      if (data.job_id && !currentJobId) {
        setCurrentJobId(data.job_id);
        onJobCreated?.(data.job_id);
      }

      if (data.part_spec) {
        onSpecReady?.(data.part_spec);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Processing failed";
      setError(msg);
      setState("error");
    }
  };

  const stateConfig: Record<
    SessionState,
    { label: string; color: string; pulse: boolean; disabled: boolean }
  > = {
    bootstrapping: { label: "Starting session...", color: "bg-steel-600", pulse: true, disabled: true },
    idle:          { label: "Tap to speak",        color: "bg-steel-600", pulse: false, disabled: false },
    connecting:    { label: "Connecting...",        color: "bg-yellow-600", pulse: true, disabled: true },
    listening:     { label: "Listening...",         color: "bg-red-600",   pulse: true, disabled: false },
    processing:    { label: "Processing...",        color: "bg-brand-600", pulse: true, disabled: true },
    speaking:      { label: "Speaking...",          color: "bg-green-600", pulse: false, disabled: true },
    error:         { label: "Error — tap to retry", color: "bg-red-700",  pulse: false, disabled: false },
  };

  const config = stateConfig[state];

  return (
    <div className="flex flex-col h-full">
      {/* Transcript timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {state === "bootstrapping" && (
          <div className="text-center text-steel-500 text-sm py-8">
            <div className="flex justify-center gap-1 mb-3">
              <span className="w-2 h-2 bg-steel-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-steel-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-steel-500 rounded-full animate-bounce" />
            </div>
            <p>Starting session…</p>
          </div>
        )}

        {state !== "bootstrapping" && turns.length === 0 && (
          <div className="text-center text-steel-500 text-sm py-8">
            <p className="text-2xl mb-2">🎙️</p>
            <p>Tap the mic button and describe the part you need.</p>
            <p className="mt-1 text-xs">
              Example: &quot;I need a U-bracket for a 2-inch pipe with two quarter-inch mounting holes&quot;
            </p>
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`flex ${turn.speaker === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs sm:max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                turn.speaker === "user"
                  ? "bg-brand-700 text-white rounded-br-sm"
                  : "bg-steel-700 text-steel-100 rounded-bl-sm"
              }`}
            >
              {turn.transcript_text}
            </div>
          </div>
        ))}

        {state === "processing" && (
          <div className="flex justify-start">
            <div className="bg-steel-700 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-steel-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-steel-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-steel-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mb-2 bg-red-900/50 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Mic button */}
      <div className="p-6 flex flex-col items-center gap-3 border-t border-steel-800">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={config.disabled}
          className={`
            relative w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-150 touch-target
            ${config.color}
            ${config.pulse ? "shadow-lg shadow-current/30" : ""}
            disabled:opacity-50 disabled:cursor-not-allowed
            active:scale-95
          `}
          aria-label={config.label}
        >
          {config.pulse && (
            <span className={`absolute inset-0 rounded-full ${config.color} opacity-50 animate-ping`} />
          )}
          <svg className="w-8 h-8 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
          </svg>
        </button>
        <p className="text-steel-400 text-xs">{config.label}</p>
        {state === "listening" && (
          <p className="text-red-400 text-xs animate-pulse">
            Hold to record · Release to send
          </p>
        )}
      </div>
    </div>
  );
}
