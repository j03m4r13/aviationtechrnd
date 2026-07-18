Model binaries are intentionally not committed.

Run from the mobile project root:

```bash
npm run callsign:setup
```

Expected generated assets:

- `vosk-model-small-en-us-0.15/`
- `ggml-base.en-q5_1.bin`

The quantized base.en model is the Android validation profile. It is used to confirm that native whisper.cpp inference completes reliably before testing a larger model for additional accuracy.

These assets are packaged into the Android development/release build so runtime recognition remains offline.
