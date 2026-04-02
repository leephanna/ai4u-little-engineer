"use client";

/**
 * UniversalInputComposer
 *
 * A reusable multi-modal input component that accepts:
 *   - typed text
 *   - uploaded files (PNG, JPG, JPEG, WEBP, PDF, DOCX, TXT, SVG)
 *   - drag-and-drop files
 *   - voice (via browser MediaRecorder → /api/mobile/interpret-voice)
 *
 * Props:
 *   onSubmit(payload) — called when user clicks "Create" with the assembled payload
 *   placeholder       — hint text for the textarea
 *   examplePrompts    — array of example strings to show below the input
 *   isLoading         — shows spinner and disables input while parent is processing
 */

import { useState, useRef, useCallback, useEffect } from "react";

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // base64 data URL for images; text content for docs
  preview?: string; // thumbnail for images
}

export interface ComposerPayload {
  text: string;
  files: UploadedFile[];
  voiceTranscript?: string;
}

interface Props {
  onSubmit: (payload: ComposerPayload) => void;
  placeholder?: string;
  examplePrompts?: string[];
  isLoading?: boolean;
  submitLabel?: string;
}

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const ACCEPTED_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.docx,.txt";
const MAX_FILE_SIZE_MB = 10;

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼";
  if (type === "application/pdf") return "📄";
  if (type.includes("word")) return "📝";
  if (type === "text/plain") return "📃";
  if (type === "image/svg+xml") return "🔷";
  return "📎";
}

export default function UniversalInputComposer({
  onSubmit,
  placeholder = "Describe what you want to create, or upload a photo, sketch, or document…",
  examplePrompts = [],
  isLoading = false,
  submitLabel = "Create →",
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string | undefined>();
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [text]);

  const readFile = useCallback((file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        reject(new Error(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
          preview: file.type.startsWith("image/") ? dataUrl : undefined,
        });
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      if (file.type.startsWith("image/") || file.type === "image/svg+xml") {
        reader.readAsDataURL(file);
      } else {
        reader.readAsDataURL(file); // send as base64 for all types
      }
    });
  }, []);

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      setFileError(null);
      const arr = Array.from(incoming);
      const valid = arr.filter((f) => ACCEPTED_TYPES.includes(f.type));
      if (valid.length < arr.length) {
        setFileError("Some files were skipped — unsupported format.");
      }
      try {
        const loaded = await Promise.all(valid.map(readFile));
        setFiles((prev) => [...prev, ...loaded].slice(0, 5)); // max 5 files
      } catch (err: unknown) {
        setFileError(err instanceof Error ? err.message : "File read error");
      }
    },
    [readFile]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Drag-and-drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  // Voice recording
  const startRecording = useCallback(async () => {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        // Convert to base64 and send to interpret-voice
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(",")[1];
            const res = await fetch("/api/mobile/interpret-voice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio_base64: base64, format: "webm" }),
            });
            if (res.ok) {
              const data = await res.json();
              const transcript: string = data.transcript ?? "";
              setVoiceTranscript(transcript);
              if (transcript) {
                setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
              }
            } else {
              setRecordingError("Voice transcription failed. Please type your request.");
            }
          } catch {
            setRecordingError("Voice transcription failed. Please type your request.");
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone access denied. Please type your request.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleExampleClick = useCallback((example: string) => {
    setText(example);
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim() && files.length === 0) return;
      onSubmit({ text: text.trim(), files, voiceTranscript });
    },
    [text, files, voiceTranscript, onSubmit]
  );

  const canSubmit = (text.trim().length > 0 || files.length > 0) && !isLoading;

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        {/* Main input area with drag-and-drop */}
        <div
          className={`relative rounded-2xl border-2 transition-all duration-200 ${
            isDragging
              ? "border-brand-400 bg-brand-950/40 shadow-lg shadow-brand-900/30"
              : "border-steel-700 bg-steel-800/60 hover:border-steel-600"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center z-10 pointer-events-none">
              <div className="text-brand-300 font-semibold text-lg">Drop files here</div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={isLoading}
            rows={3}
            className="w-full bg-transparent text-steel-100 placeholder-steel-500 text-base leading-relaxed px-5 pt-4 pb-2 resize-none outline-none rounded-t-2xl min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e as unknown as React.FormEvent);
            }}
          />

          {/* File chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 bg-steel-700 border border-steel-600 rounded-lg px-3 py-1.5 text-sm text-steel-200"
                >
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt={f.name} className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <span className="text-base">{fileIcon(f.type)}</span>
                  )}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="text-steel-400 hover:text-red-400 transition-colors ml-1"
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Voice transcript chip */}
          {voiceTranscript && (
            <div className="mx-5 mb-3 flex items-center gap-2 bg-purple-900/40 border border-purple-700 rounded-lg px-3 py-1.5 text-xs text-purple-300">
              <span>🎤</span>
              <span className="truncate">Voice: {voiceTranscript.slice(0, 80)}{voiceTranscript.length > 80 ? "…" : ""}</span>
              <button
                type="button"
                onClick={() => setVoiceTranscript(undefined)}
                className="ml-auto text-purple-400 hover:text-red-400 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-steel-700/50">
            <div className="flex items-center gap-2">
              {/* Upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="flex items-center gap-1.5 text-steel-400 hover:text-brand-300 transition-colors text-sm px-2 py-1.5 rounded-lg hover:bg-steel-700/50"
                title="Upload image, PDF, or document"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="hidden sm:inline">Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />

              {/* Microphone button */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`flex items-center gap-1.5 transition-colors text-sm px-2 py-1.5 rounded-lg ${
                  isRecording
                    ? "text-red-400 bg-red-900/30 hover:bg-red-900/50 animate-pulse"
                    : "text-steel-400 hover:text-brand-300 hover:bg-steel-700/50"
                }`}
                title={isRecording ? "Stop recording" : "Record voice input"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className="hidden sm:inline">{isRecording ? "Stop" : "Voice"}</span>
              </button>

              <span className="text-steel-600 text-xs hidden sm:inline">
                PNG · JPG · PDF · SVG · DOCX · TXT
              </span>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-150 shadow-md shadow-brand-900/30"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <span>{submitLabel}</span>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error messages */}
      {(fileError || recordingError) && (
        <div className="mt-2 text-xs text-red-400 px-1">
          {fileError ?? recordingError}
        </div>
      )}

      {/* Example prompts */}
      {examplePrompts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-steel-500 mb-2 px-1">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => handleExampleClick(ex)}
                className="text-xs text-steel-400 bg-steel-800 border border-steel-700 hover:border-brand-600 hover:text-brand-300 rounded-full px-3 py-1.5 transition-colors text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
