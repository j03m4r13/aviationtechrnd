import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { supabase } from '../auth/supabase';
import type { ProcessedCloudResult } from './cloud-api';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000';

type ProcessAudioArguments = {
  uri: string;
  localSessionId: string;
  createdAt: string;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  inputName: string | null;
  inputType: string | null;
  idempotencyKey: string;
};

type ErrorResponse = {
  error?: string;
  message?: string;
};

export async function processAudio({
  uri,
  localSessionId,
  createdAt,
  durationMs,
  sourceLanguage,
  targetLanguage,
  inputName,
  inputType,
  idempotencyKey
}: ProcessAudioArguments): Promise<ProcessedCloudResult> {
  const {
    data: refreshedSession,
    error: refreshError
  } = await supabase.auth.refreshSession();

  if (refreshError) {
    throw new Error(
      `Unable to refresh your sign-in session: ${refreshError.message}`
    );
  }


  const token = refreshedSession.session?.access_token;
  if (!token) {
    throw new Error('Your sign-in session is missing. Please sign in again.');
  }

  const audioFile = new File(uri);
  if (!audioFile.exists || audioFile.size === 0) {
    throw new Error('The recorded audio file is missing or empty.');
  }

  const form = new FormData();
  form.append('sourceLanguage', sourceLanguage);
  form.append('targetLanguage', targetLanguage);
  form.append('localSessionId', localSessionId);
  form.append('createdAt', createdAt);
  form.append('durationMs', String(durationMs));
  form.append('inputName', inputName ?? '');
  form.append('inputType', inputType ?? '');
  form.append('audio', audioFile);

  const response = await fetch(`${API_BASE_URL}/v1/audio/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey
    },
    body: form
  });

  if (!response.ok) {
    let details = `Request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as ErrorResponse;
      details = body.message || body.error || details;
    } catch {
      // Preserve the HTTP status message when the body is not JSON.
    }
    throw new Error(details);
  }

  return (await response.json()) as ProcessedCloudResult;
}
