import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Use implicit flow so Supabase does NOT append ?flowName=GeneralOAuthFlow
      // to the OAuth callback URL. That extra parameter causes Google's
      // redirect_uri_mismatch (Error 400) when PKCE is active.
      auth: { flowType: "implicit" },
    }
  );
}
