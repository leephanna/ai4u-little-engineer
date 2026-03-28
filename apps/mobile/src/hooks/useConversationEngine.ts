/**
 * useConversationEngine
 *
 * Orchestrates the full voice → transcribe → interpret → state machine flow.
 * Integrates with the conversationStore and calls the backend API.
 */
import { useCallback } from "react";
import * as Speech from "expo-speech";
import { useConversationStore } from "../store/conversationStore";
import { useAuthStore } from "../store/authStore";
import { interpretVoice, createJob, triggerGeneration } from "../services/api";
import { API_BASE_URL } from "../constants";
import type { PartSpecDraft } from "../types";

export function useConversationEngine() {
  const store = useConversationStore();
  const { user } = useAuthStore();

  const speak = useCallback((text: string) => {
    Speech.speak(text, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.95,
    });
  }, []);

  const addAssistantMessage = useCallback(
    (text: string, shouldSpeak = true) => {
      store.addMessage({ role: "assistant", text });
      if (shouldSpeak) speak(text);
    },
    [store, speak]
  );

  /**
   * Process a voice recording URI: transcribe then interpret.
   * The transcription is done server-side via /api/mobile/interpret-voice
   * which accepts either a transcript string or a base64 audio blob.
   */
  const processVoiceInput = useCallback(
    async (audioUri: string) => {
      if (!user) return;
      store.setState("TRANSCRIBING");

      try {
        // Read audio file and send as base64 for server-side Whisper transcription
        const response = await fetch(audioUri);
        const blob = await response.blob();
        const reader = new FileReader();

        const base64Audio = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        store.setState("INTERPRETING");

        const result = await interpretVoice(
          {
            transcript: "", // empty — server will transcribe from audio
            current_spec: store.spec,
            conversation_history: store.messages.slice(-6).map((m) => ({
              role: m.role,
              text: m.text,
            })),
            // @ts-ignore — extended field for audio
            audio_base64: base64Audio,
          },
          user.accessToken
        );

        await handleInterpretationResult(result);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        store.setError(msg);
        store.setState("ERROR_RECOVERY");
        addAssistantMessage(
          "I had trouble understanding that. Could you try again or type your request?"
        );
      }
    },
    [user, store, addAssistantMessage]
  );

  /**
   * Process a typed text input directly.
   */
  const processTextInput = useCallback(
    async (text: string) => {
      if (!user) return;
      store.addMessage({ role: "user", text, isVoice: false });
      store.setState("INTERPRETING");

      try {
        const result = await interpretVoice(
          {
            transcript: text,
            current_spec: store.spec,
            conversation_history: store.messages.slice(-6).map((m) => ({
              role: m.role,
              text: m.text,
            })),
          },
          user.accessToken
        );

        await handleInterpretationResult(result);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        store.setError(msg);
        store.setState("ERROR_RECOVERY");
        addAssistantMessage(
          "I had trouble processing that. Please try again."
        );
      }
    },
    [user, store, addAssistantMessage]
  );

  const handleInterpretationResult = useCallback(
    async (result: Awaited<ReturnType<typeof interpretVoice>>) => {
      // Handle special intents
      if (result.intent === "cancel") {
        store.resetConversation();
        addAssistantMessage(
          "No problem. Starting over. What part do you need?"
        );
        return;
      }

      if (result.intent === "repeat") {
        const lastAssistant = [...store.messages]
          .reverse()
          .find((m) => m.role === "assistant");
        if (lastAssistant) speak(lastAssistant.text);
        store.setState("ASKING_FOR_MISSING_FIELDS");
        return;
      }

      // Apply extracted dimensions to spec
      store.applyInterpretation(result);

      const missing = store.getMissingFields();

      if (missing.length > 0) {
        store.setState("ASKING_FOR_MISSING_FIELDS");
        const question =
          result.next_question ||
          `What is the ${missing[0].replace(/_/g, " ")}?`;
        store.setPendingQuestion(question);
        addAssistantMessage(question);
      } else {
        // Spec is complete — move to review
        store.setState("REVIEWING_SPEC");
        const summary = result.summary_text || buildSummary(store.spec);
        store.setPendingQuestion(null);
        addAssistantMessage(
          `${summary} Does that look right? Say "confirm" to generate, or tell me what to change.`
        );
      }
    },
    [store, addAssistantMessage, speak]
  );

  /**
   * Confirm and dispatch the generation job.
   */
  const confirmAndGenerate = useCallback(async () => {
    if (!user) return;
    store.setState("CONFIRMING_GENERATION");
    addAssistantMessage("Got it! Starting your CAD generation now...");

    try {
      // 1. Create job + part spec via /api/mobile/confirm-spec
      const job = await createJob(store.spec, user.accessToken);

      // 2. Trigger generation via existing /api/jobs/[id]/generate
      await triggerGeneration(
        job.id,
        (job as unknown as { part_spec_id: string }).part_spec_id,
        user.accessToken
      );

      store.setCurrentJob(
        job.id,
        (job as unknown as { part_spec_id: string }).part_spec_id
      );
      store.setState("GENERATING");
      addAssistantMessage(
        "Your part is being generated. I'll let you know when it's ready.",
        false // don't speak — progress screen will handle it
      );
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      if (err.status === 402) {
        store.setState("ERROR_RECOVERY");
        addAssistantMessage(
          "You've reached your generation limit for this month. Please upgrade your plan to continue."
        );
      } else {
        store.setState("ERROR_RECOVERY");
        addAssistantMessage(
          `Generation failed: ${err.message}. Please try again.`
        );
      }
    }
  }, [user, store, addAssistantMessage]);

  return {
    processVoiceInput,
    processTextInput,
    confirmAndGenerate,
    speak,
    addAssistantMessage,
  };
}

function buildSummary(spec: PartSpecDraft): string {
  if (!spec.family) return "Part spec is incomplete.";
  const dimStr = Object.entries(spec.dimensions)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}${spec.units}`)
    .join(", ");
  return `${spec.family.replace(/_/g, " ")}: ${dimStr}.`;
}
