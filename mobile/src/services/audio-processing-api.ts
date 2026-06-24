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
  const filename = uri.split('/').pop() || `recording-${Date.now()}.m4a`;

  const form = new FormData();
  form.append('sourceLanguage', sourceLanguage);
  form.append('targetLanguage', targetLanguage);
  form.append(
    'audio',
    {
      uri,
      name: filename.endsWith('.m4a') ? filename : `${filename}.m4a`,
      type: 'audio/mp4'
    } as unknown as Blob
  );

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
      // Preserve the HTTP status message when the body is not JSON.
    }

    throw new Error(details);
  }

  return (await response.json()) as ProcessingResult;
}
