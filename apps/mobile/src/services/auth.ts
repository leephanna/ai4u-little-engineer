import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import "react-native-url-polyfill/auto";
import type { AuthUser } from "../types";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Secure storage adapter for Supabase session persistence
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function signIn(
  email: string,
  password: string
): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("No session returned");
  return {
    id: data.user.id,
    email: data.user.email!,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

export async function signUp(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  // If email confirmation is required, session will be null
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return {
    id: data.session.user.id,
    email: data.session.user.email!,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

export async function refreshSession(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  return {
    id: data.session.user.id,
    email: data.session.user.email!,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}
