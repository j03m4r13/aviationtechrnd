# Aviation Voice MVP v0.3 — SaaS Foundation

This milestone adds the first multi-user SaaS boundary.

## Implemented

- Supabase email/password sign-up and sign-in
- Secure persisted mobile sessions using Expo SecureStore
- Fastify bearer-token verification through Supabase Auth
- Server-owned user identity for every processing request
- Cloud recording-session metadata and transcripts
- Idempotent processing jobs
- Server-derived audio duration using the uploaded audio file
- Per-user monthly processed-seconds usage ledger
- Local SQLite ownership and cloud synchronization fields
- Cross-device transcript metadata synchronization
- Soft deletion of cloud transcripts while retaining usage records
- Account screen with current-month usage and manual cloud sync

## Deliberately deferred

- Original-audio cloud backup
- Password-reset deep link
- Google and Apple sign-in
- Background sync queue
- Subscription billing and quotas
- Organization/fleet accounts
- Realtime transcription

## Security boundaries

- The mobile app receives only a Supabase publishable key.
- The Fastify server receives the Supabase secret key.
- The OpenAI key remains server-only.
- The server derives `user_id` from a verified bearer token.
- Billable duration is parsed from the uploaded audio, not trusted from the phone.
- Idempotency keys prevent repeated processing from producing duplicate usage events.
