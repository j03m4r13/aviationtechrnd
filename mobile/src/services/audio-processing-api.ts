import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import type { ProcessingResult } from '../types/audio';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000';

type ProcessAudioArguments = {
  uri: string;
  sourceLanguage: string;
  targetLanguage: string;
};

type ErrorResponse = {
  error?: string;
  message?: string;
};

export async function processAudio({
  uri,
  sourceLanguage,
  targetLanguage
}: ProcessAudioArguments): Promise<ProcessingResult> {
  const audioFile = new File(uri);

  if (!audioFile.exists || audioFile.size === 0) {
    throw new Error('The recorded audio file is missing or empty.');
  }

  const form = new FormData();

  form.append('sourceLanguage', sourceLanguage);
  form.append('targetLanguage', targetLanguage);
  form.append('audio', audioFile);

  const response = await fetch(`${API_BASE_URL}/v1/audio/process`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    let details = `Request failed with HTTP ${response.status}`;

    try {
      const body = (await response.json()) as ErrorResponse;
      details = body.message || body.error || details;
    } catch {
      // Keep the HTTP status if the response is not JSON.
    }

    throw new Error(details);
  }

  return (await response.json()) as ProcessingResult;
}