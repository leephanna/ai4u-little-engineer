# AI4U Little Engineer — Mobile App

Voice-first conversational CAD design assistant for Android (and iOS).

## Overview

Speak naturally to design mechanical parts. The app uses:
- **expo-av** for microphone recording
- **OpenAI Whisper** (via backend) for transcription
- **GPT-4.1-mini** (via backend) for intent extraction and dimension parsing
- **expo-speech** for text-to-speech assistant responses
- **Supabase** for authentication and session persistence
- **Zustand** for conversation state management

## Screens

| Screen | Description |
|--------|-------------|
| Sign In / Sign Up | Supabase auth with secure token storage |
| Home (Speak) | Voice conversation hub — hold mic to speak |
| Progress | Live polling of CAD generation job status |
| Results | Download STL and STEP artifacts |
| Settings | Account management and navigation |
| Billing | Plan management and Stripe checkout |

## Quick Start

```bash
cd apps/mobile

# Install dependencies
pnpm install

# Copy env vars
cp .env.example .env.local
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# Start development server
npx expo start

# Run on Android emulator
npx expo run:android

# Run on iOS simulator
npx expo run:ios
```

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build Android APK (internal testing)
eas build --platform android --profile preview

# Build Android App Bundle (Play Store)
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL (Vercel) |

## Architecture

```
App.tsx                    # Root navigation controller
src/
  constants/               # Colors, spacing, part families
  types/                   # TypeScript interfaces
  store/
    authStore.ts           # Auth state (Zustand)
    conversationStore.ts   # Conversation state machine (Zustand)
  services/
    auth.ts                # Supabase auth service
    api.ts                 # Backend API calls
  hooks/
    useVoiceRecorder.ts    # expo-av recording hook
    useConversationEngine.ts # Voice → interpret → state transitions
  screens/
    auth/
      SignInScreen.tsx
      SignUpScreen.tsx
    main/
      HomeScreen.tsx       # Primary voice conversation interface
      ProgressScreen.tsx   # Job polling with animated progress
      ResultsScreen.tsx    # Artifact download screen
      SettingsScreen.tsx
      BillingScreen.tsx
  components/
    conversation/
      MicButton.tsx        # Animated hold-to-speak button
      ConversationBubble.tsx
    shared/
      PartSpecCard.tsx     # Live spec display card
```

## Backend Routes Added

| Route | Method | Description |
|-------|--------|-------------|
| `/api/mobile/interpret-voice` | POST | Transcribe + interpret voice/text input |
| `/api/mobile/confirm-spec` | POST | Create job + part_spec from confirmed spec |
| `/api/mobile/job-status` | GET | Poll job status + get signed artifact URLs |

## Android Play Store Readiness

- Package: `com.ai4u.littleengineer`
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)
- Permissions: `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`
- Build type: AAB (App Bundle) for Play Store
- EAS Build configured for internal → preview → production tracks
