import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  type RecordingOptions
} from 'expo-audio';

/**
 * M4A/AAC is compact, broadly supported on Android/iOS, and accepted by
 * the OpenAI transcription endpoint.
 *
 * The Android source is tuned for voice communication because the MVP is
 * specifically testing an external headset microphone. Android and the
 * headset may still negotiate a lower Bluetooth microphone sample rate.
 */
export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 44_100,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
  directory: 'document',
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'voice_communication'
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64_000
  }
};
