# Manual Auth Configuration Steps

The code for Google OAuth is now fully correct and deployed, but it will fail at runtime with an "Unsupported provider" error until you configure the provider in the Supabase dashboard and Google Cloud Console.

Because the sandbox cannot access your Google Cloud account or click through the Supabase dashboard, you must perform these exact steps manually.

## 1. Supabase Dashboard

1. Go to your Supabase project: **`lphtdosxneplxgkygjom`**
2. Navigate to **Authentication** > **Providers**
3. Click on **Google** and toggle **Enable Google** to ON.
4. You will need to enter the **Client ID** and **Client Secret** from Google Cloud (see step 2).
5. Copy the **Callback URL (for OAuth)** provided by Supabase. It will be exactly:
   `https://lphtdosxneplxgkygjom.supabase.co/auth/v1/callback`

## 2. Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project (or create a new one).
3. Navigate to **APIs & Services** > **Credentials**.
4. Click **Create Credentials** > **OAuth client ID**.
5. Select **Web application** as the Application type.
6. Under **Authorized JavaScript origins**, add your exact production URL:
   `https://ai4u-little-engineer-web.vercel.app`
   *(Also add `http://localhost:3000` if you test locally).*
7. Under **Authorized redirect URIs**, paste the exact Supabase callback URL from step 1:
   `https://lphtdosxneplxgkygjom.supabase.co/auth/v1/callback`
8. Click **Create**.
9. Copy the generated **Client ID** and **Client Secret** and paste them back into the Supabase dashboard (from step 1).
10. Click **Save** in Supabase.

## 3. Verification

Once saved, go to `https://ai4u-little-engineer-web.vercel.app/login` and click "Continue with Google".
It will now successfully redirect to Google, authenticate, and return you to the canonical creation path (`/invent`).
