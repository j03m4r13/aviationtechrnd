# Upgrade v0.2 to v0.3

## 1. Checkpoint the current code

```bash
cd /home/joe/aviationtech/aviationtechrnd
git add .
git commit -m "Checkpoint local session history MVP"
```

## 2. Create a Supabase project

Create a project in Supabase and open **SQL Editor**. Run:

```text
supabase/migrations/20260629_aviation_voice_saas.sql
```

In **Authentication → Providers → Email**, keep Email enabled. During development you may either keep email confirmation enabled or temporarily disable confirmation.

Get these values from the project Connect/API Keys area:

- Project URL
- Publishable key (`sb_publishable_...`)
- Secret key (`sb_secret_...`)

Never put the secret key in the mobile project.

## 3. Backend environment

Update `api/.env`:

```env
OPENAI_API_KEY=...
PORT=3000
HOST=0.0.0.0
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_TRANSLATION_MODEL=gpt-5.4-mini

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

TRANSCRIPTION_COST_PER_MINUTE_USD=0.003
TRANSLATION_INPUT_COST_PER_MILLION_USD=0.75
TRANSLATION_OUTPUT_COST_PER_MILLION_USD=4.50
```

Install and validate:

```bash
cd api
npm ci --no-audit --no-fund
npm run typecheck
npm run dev
```

## 4. Mobile environment

Update `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Install and validate:

```bash
cd mobile
npm ci --no-audit --no-fund
npm run typecheck
```

This milestone adds native Expo SecureStore and Crypto packages, so rebuild Android once:

```bash
npx expo prebuild --clean --platform android
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
npx expo run:android --device
```

## 5. Acceptance test

1. Create a pilot account.
2. Confirm the email if confirmation is enabled.
3. Sign in.
4. Record, transcribe, and translate a clip.
5. Open Account and verify processed minutes are non-zero.
6. Open History and confirm the session says `SYNCED`.
7. Sign out and sign back in; local history should remain.
8. On another development device signed into the same account, press **Sync cloud history** and confirm the transcript appears as `Cloud only`.
9. Submit the same request again with the same idempotency key during API testing; usage must not duplicate.
10. Sign in as another user and verify the first user’s sessions are absent.
