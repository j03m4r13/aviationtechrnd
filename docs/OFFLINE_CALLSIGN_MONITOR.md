# Offline Callsign Monitor

The mobile app now contains an Android-only callsign alert tool designed first for high-performance phones such as the ASUS ROG Phone 7.

## Runtime design

- Vosk continuously produces low-latency partial and final recognition.
- whisper.cpp `small.en-q5_1` processes each completed speech transmission.
- A deterministic matcher normalizes ICAO phonetics and aviation number pronunciations.
- Callsign alerts use vibration and a high-visibility visual card.
- Audio remains in memory and is not uploaded or saved by the monitor.
- The first release operates only while the app is in the foreground.

The Recorder and Callsign Monitor are separate top-level tools. Only one is mounted at a time so they do not compete for the Android microphone.

## One-time development setup

From `mobile/`:

```bash
npm run callsign:setup
npx expo prebuild --clean
npx expo run:android
```

The setup command downloads pinned whisper.cpp source, the Vosk model, and the quantized Whisper model. Internet is needed for this development/build setup only. Recognition in the installed app is offline.

## Default models

- Vosk: `vosk-model-small-en-us-0.15`
- Whisper: `small.en-q5_1`
- ABI: `arm64-v8a`
- Audio: 16 kHz mono PCM

## Input routing

The callsign screen can request the existing Bluetooth communication route before opening Android `AudioRecord`. Leave the Bluetooth switch disabled for the phone microphone or a USB input that Android already exposes as its active recording device.

## Test sequence

1. Run the setup and native rebuild commands.
2. Open **Callsign Monitor** after login.
3. Enter the aircraft callsign and abbreviated spoken aliases.
4. Enable Bluetooth routing only when using a compatible Bluetooth headset microphone.
5. Start monitoring and speak recorded ATC samples near the selected input.
6. Confirm Vosk partial results arrive quickly and Whisper results follow after each transmission.
7. Measure missed calls and false alerts using cockpit-noise recordings before any operational trial.

## Safety

This feature is an experimental attention aid and is not certified avionics. It must not replace monitoring ATC, proper radio procedures, or pilot situational awareness.
