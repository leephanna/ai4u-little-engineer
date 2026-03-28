/**
 * useVoiceRecorder
 *
 * Handles microphone recording via expo-av.
 * Returns the recorded audio URI for transcription.
 *
 * Voice approach: expo-av records audio → sends to /api/mobile/interpret-voice
 * which uses the OpenAI Whisper-compatible transcription endpoint, then passes
 * the transcript to the LLM interpretation layer.
 *
 * Note: On Android, RECORD_AUDIO permission must be granted (declared in app.json).
 */
import { useState, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

export type RecordingState = "idle" | "recording" | "processing";

interface UseVoiceRecorderResult {
  recordingState: RecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>; // returns audio URI or null
  cancelRecording: () => Promise<void>;
  error: string | null;
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        setError("Microphone permission is required for voice input.");
        return;
      }

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecordingState("recording");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: unknown) {
      setError((e as Error).message);
      setRecordingState("idle");
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;

    try {
      setRecordingState("processing");
      await recording.stopAndUnloadAsync();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const uri = recording.getURI();
      recordingRef.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      setRecordingState("idle");
      return uri ?? null;
    } catch (e: unknown) {
      setError((e as Error).message);
      setRecordingState("idle");
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
    } catch {}
    recordingRef.current = null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setRecordingState("idle");
  }, []);

  return { recordingState, startRecording, stopRecording, cancelRecording, error };
}
