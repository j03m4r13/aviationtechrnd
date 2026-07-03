Model binaries are intentionally not committed.

Run from the mobile project root:

```bash
npm run callsign:setup
```

Expected generated assets:

- `vosk-model-small-en-us-0.15/`
- `ggml-small.en-q5_1.bin`

These assets are packaged into the Android development/release build so runtime recognition remains offline.
