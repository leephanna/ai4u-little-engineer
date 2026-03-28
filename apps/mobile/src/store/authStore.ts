import { create } from "zustand";
import type { AuthUser } from "../types";
import { getSession, signIn, signOut, signUp } from "../services/auth";

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true });
      const user = await getSession();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const user = await signIn(email, password);
      set({ user, loading: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await signUp(email, password);
      set({ loading: false });
      return result;
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await signOut();
    } catch {}
    set({ user: null, loading: false });
  },

  clearError: () => set({ error: null }),
}));
