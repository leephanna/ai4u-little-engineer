import { create } from "zustand";
import type {
  ConversationState,
  ConversationMessage,
  PartSpecDraft,
  InterpretVoiceResponse,
} from "../types";
import { REQUIRED_DIMENSIONS } from "../constants";

interface ConversationStore {
  // State machine
  state: ConversationState;
  setState: (s: ConversationState) => void;

  // Messages
  messages: ConversationMessage[];
  addMessage: (msg: Omit<ConversationMessage, "id" | "timestamp">) => void;
  clearMessages: () => void;

  // Part spec draft
  spec: PartSpecDraft;
  updateSpec: (patch: Partial<PartSpecDraft>) => void;
  applyInterpretation: (result: InterpretVoiceResponse) => void;
  resetSpec: () => void;

  // Current question being asked
  pendingQuestion: string | null;
  setPendingQuestion: (q: string | null) => void;

  // Job tracking
  currentJobId: string | null;
  currentPartSpecId: string | null;
  setCurrentJob: (jobId: string, partSpecId: string) => void;
  clearCurrentJob: () => void;

  // Error
  errorMessage: string | null;
  setError: (msg: string | null) => void;

  // Computed helpers
  getMissingFields: () => string[];
  isSpecComplete: () => boolean;

  // Reset entire conversation
  resetConversation: () => void;
}

const DEFAULT_SPEC: PartSpecDraft = {
  family: null,
  dimensions: {},
  units: "mm",
};

export const useConversationStore = create<ConversationStore>((set, get) => ({
  state: "IDLE",
  setState: (s) => set({ state: s }),

  messages: [],
  addMessage: (msg) =>
    set((prev) => ({
      messages: [
        ...prev.messages,
        {
          ...msg,
          id: Math.random().toString(36).slice(2),
          timestamp: Date.now(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),

  spec: { ...DEFAULT_SPEC },
  updateSpec: (patch) =>
    set((prev) => ({
      spec: {
        ...prev.spec,
        ...patch,
        dimensions: patch.dimensions
          ? { ...prev.spec.dimensions, ...patch.dimensions }
          : prev.spec.dimensions,
      },
    })),
  applyInterpretation: (result) => {
    const prev = get().spec;
    const mergedDimensions = { ...prev.dimensions, ...result.dimensions };
    set({
      spec: {
        family: result.family ?? prev.family,
        dimensions: mergedDimensions,
        units: result.units ?? prev.units,
        material: prev.material,
      },
    });
  },
  resetSpec: () => set({ spec: { ...DEFAULT_SPEC } }),

  pendingQuestion: null,
  setPendingQuestion: (q) => set({ pendingQuestion: q }),

  currentJobId: null,
  currentPartSpecId: null,
  setCurrentJob: (jobId, partSpecId) =>
    set({ currentJobId: jobId, currentPartSpecId: partSpecId }),
  clearCurrentJob: () =>
    set({ currentJobId: null, currentPartSpecId: null }),

  errorMessage: null,
  setError: (msg) => set({ errorMessage: msg }),

  getMissingFields: () => {
    const { spec } = get();
    if (!spec.family) return ["family"];
    const required = REQUIRED_DIMENSIONS[spec.family] ?? [];
    return required.filter(
      (field) =>
        spec.dimensions[field] === undefined ||
        spec.dimensions[field] === null ||
        isNaN(spec.dimensions[field])
    );
  },

  isSpecComplete: () => {
    const { getMissingFields } = get();
    return getMissingFields().length === 0;
  },

  resetConversation: () =>
    set({
      state: "IDLE",
      messages: [],
      spec: { ...DEFAULT_SPEC },
      pendingQuestion: null,
      currentJobId: null,
      currentPartSpecId: null,
      errorMessage: null,
    }),
}));
