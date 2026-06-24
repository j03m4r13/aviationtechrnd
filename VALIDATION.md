# Validation status

Validated on 2026-06-24 with Node.js 20+ tooling.

## Backend

- `npm install`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- npm audit: no reported vulnerabilities

## Mobile

- `npm install`: passed
- `npm run typecheck`: passed
- `npx expo install --check`: dependencies up to date using Expo's local SDK map
- `npx expo prebuild --platform android --no-install`: passed

The mobile dependency tree currently reports moderate npm audit findings under Expo's build-tooling chain through `xcode` and an older transitive `uuid`. There are no high or critical findings. Do not run `npm audit fix --force`; npm's proposed resolution downgrades Expo to SDK 46 and would break this project.

A physical Android build and microphone route test still require an Android SDK, connected phone, and the actual ROG headset.
