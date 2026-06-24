# Aviation Voice MVP

Android-first React Native/Expo MVP for:

1. Selecting an available microphone input, including a Bluetooth or USB wireless headset.
2. Recording a local `.m4a` speech clip.
3. Playing the clip back to verify the actual microphone source.
4. Uploading the recording to a private backend.
5. Transcribing the original speech with OpenAI.
6. Translating the transcript into a selected language.

This project deliberately starts with **record-then-upload**. Realtime audio is a later milestone after microphone routing and transcription quality are proven.

## Repository layout

```text
aviation-voice-mvp/
├── mobile/     React Native + Expo application
└── api/        Fastify + OpenAI backend
```

## Prerequisites

- Node.js 20 or newer
- npm
- Android SDK and `adb`
- A physical Android phone
- Your ROG headset paired through Bluetooth or connected through its USB-C receiver
- An OpenAI API key

## 1. Start the backend

```bash
cd api
cp .env.example .env
# Put your OpenAI API key in .env
npm install
npm run dev
```

Verify:

```bash
curl http://127.0.0.1:3000/health
```

Expected:

```json
{"ok":true}
```

## 2. Make the backend reachable from the Android phone

For a USB-connected Android phone:

```bash
adb devices
adb reverse tcp:3000 tcp:3000
```

The mobile app can then use:

```text
http://127.0.0.1:3000
```

This is the default development API URL in the starter.

For Wi-Fi development instead, set the computer's LAN address in `mobile/.env`, for example:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

The included development build permits cleartext HTTP for local testing. Production must use HTTPS and should disable cleartext traffic.

## 3. Start the mobile application

```bash
cd mobile
cp .env.example .env
npm install
npx expo prebuild --clean
npx expo run:android
```

After the first native build, normal JavaScript changes can be run with:

```bash
npx expo start --dev-client
```

## 4. Test the ROG microphone before testing AI

1. Pair or connect the headset in Android settings.
2. Confirm Android enables both media and call/input audio, when those options exist.
3. Launch the app and grant microphone permission.
4. Tap **Refresh inputs**.
5. Select the input whose name resembles the ROG headset, USB device, Bluetooth headset, or external microphone.
6. Make a ten-second recording.
7. During recording, lightly tap or rub the ROG boom microphone while keeping the phone several feet away.
8. Play the recording.
9. Confirm the tapping and nearby speech are significantly louder than sounds near the phone.

Do not proceed to transcription until this test proves the intended input is actually being recorded.

## Important ROG headset caveat

Some ROG wireless headsets use a proprietary 2.4 GHz USB receiver rather than Bluetooth. That is acceptable for the MVP if Android recognizes the receiver as a USB audio input. Other models expose playback but not microphone input on a particular Android device.

If the ROG microphone does not appear in **Available recording inputs**, the problem is below the OpenAI layer. Check:

- The headset connection mode
- USB-C OTG support
- Android audio input support for the receiver
- Whether the headset is in Bluetooth call/headset mode rather than playback-only mode
- Another Android recording application
- A different Android phone

## Current scope

Implemented:

- Microphone permission
- Android recording-input enumeration
- Explicit input selection
- Current-input display
- M4A/AAC mono recording
- Recording level meter
- Playback
- Source and target language selection
- Backend upload
- OpenAI transcription
- Text translation
- Error handling and status display

Deferred:

- Authentication
- SQLite recording history
- Cloud object storage
- Background recording
- Realtime transcription
- Realtime spoken translation
- Custom hardware integration
- Offline synchronization
- Production telemetry
- Firmware update support

## Why the OpenAI key is only in the backend

Never put a normal OpenAI API key in a React Native bundle. Mobile binaries can be inspected and secrets can be extracted. The app uploads audio to your backend; only the backend calls OpenAI.

## API endpoint

```http
POST /v1/audio/process
Content-Type: multipart/form-data
```

Fields:

- `audio`: M4A audio file
- `sourceLanguage`: `auto`, `en`, `tl`, `es`, `ja`, etc.
- `targetLanguage`: target language code

Example response:

```json
{
  "transcript": "Request taxi clearance.",
  "translation": "Humihiling ng pahintulot na mag-taxi.",
  "sourceLanguage": "auto",
  "targetLanguage": "tl",
  "models": {
    "transcription": "gpt-4o-mini-transcribe",
    "translation": "gpt-5.4-mini"
  }
}
```

## Production direction

Keep these boundaries as the app grows:

- `expo-audio` is the current recording adapter.
- `src/services/audio-processing-api.ts` is the cloud boundary.
- UI components do not call OpenAI directly.
- OpenAI model names are backend configuration, not mobile constants.
- A future native audio engine can replace the recorder without replacing the whole UI.
