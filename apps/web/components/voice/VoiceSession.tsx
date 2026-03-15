"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceTurn } from "@/lib/types";

type SessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

interface VoiceSessionProps {
  jobId?: string;
  sessionId: string;
  onTranscript?: (text: string, speaker: "user" | "assistant") => void;
  onJobCreated?: (jobId: string) => void;
  onSpecReady?: (spec: Record<string, unknown>) => void;
}

export function VoiceSession({
  jobId,
  sessionId,
  onTranscript,
  onJobCreated,
  onSpecReady,
}: VoiceSessionProps) {
  const [state, setState] = useState<SessionState>("idle");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new turns arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const startRecording = useCallback(async () => {
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
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(250); // Collect in 250ms chunks
      setState("listening");
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setState("error");
    }
  }, [sessionId, jobId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setState("processing");
    }
  }, [isRecording]);

  const processAudio = async (audioBlob: Blob) => {
    try {
      setState("processing");

      // Convert to base64 for API
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const response = await fetch("/api/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          job_id: jobId,
          audio_base64: base64,
          mime_type: audioBlob.type,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Add user transcript turn
      if (data.user_transcript) {
        const userTurn: VoiceTurn = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          job_id: jobId ?? null,
          speaker: "user",
          transcript_text: data.user_transcript,
          audio_url: null,
          created_at: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, userTurn]);
        onTranscript?.(data.user_transcript, "user");
      }

      // Add assistant response turn
      if (data.assistant_response) {
        const assistantTurn: VoiceTurn = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          job_id: jobId ?? null,
          speaker: "assistant",
          transcript_text: data.assistant_response,
          audio_url: null,
          created_at: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, assistantTurn]);
        onTranscript?.(data.assistant_response, "assistant");
        setState("speaking");

        // Speak the response (TTS)
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

      // Handle job creation
      if (data.job_id && !jobId) {
        onJobCreated?.(data.job_id);
      }

      // Handle spec ready
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
    { label: string; color: string; pulse: boolean }
  > = {
    idle: { label: "Tap to speak", color: "bg-steel-600", pulse: false },
    connecting: { label: "Connecting...", color: "bg-yellow-600", pulse: true },
    listening: { label: "Listening...", color: "bg-red-600", pulse: true },
    processing: { label: "Processing...", color: "bg-brand-600", pulse: true },
    speaking: { label: "Speaking...", color: "bg-green-600", pulse: false },
    error: { label: "Error — tap to retry", color: "bg-red-700", pulse: false },
  };

  const config = stateConfig[state];

  return (
    <div className="flex flex-col h-full">
      {/* Transcript timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {turns.length === 0 && (
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
          disabled={state === "processing" || state === "connecting" || state === "speaking"}
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
          <svg
            className="w-8 h-8 text-white relative z-10"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
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
