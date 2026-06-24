# ROG headset test protocol

Run this before judging transcription quality.

## Test A — input enumeration

Record the following for each input shown by the app:

```text
Input name:
Input type:
Selected successfully:
Current input after selection:
```

Expected: selecting an item changes the app's **CURRENT INPUT** display.

## Test B — acoustic source proof

Place the phone two to three meters away.

While recording:

1. Speak normally into the ROG boom microphone.
2. Tap the ROG boom microphone three times.
3. Tap near the phone microphone three times.
4. Speak at the phone from close range.
5. Stop and replay.

The intended headset route should make steps 1–2 prominent. If steps 3–4 dominate, Android probably recorded the phone microphone.

## Test C — Bluetooth/USB disconnect

1. Start recording.
2. Disconnect or power off the headset.
3. Observe whether recording stops, switches input, or fails.
4. Save the behavior as a product requirement.

The current MVP does not silently continue after route loss. Production code should treat route loss as an explicit event.

## Test D — first transcription fixture

Speak:

> November One Two Three Alpha Bravo, request taxi runway two seven, QNH one zero one three.

Check these exact entities:

- N123AB / November One Two Three Alpha Bravo
- runway 27
- QNH 1013

Keep this clip as the first regression-test fixture.
