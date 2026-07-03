import {
  RecordingPresets,
  type RecordingOptions
} from 'expo-audio';

export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'mic',
    sampleRate: 16000
  }
};