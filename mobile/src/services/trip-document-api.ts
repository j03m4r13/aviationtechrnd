import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { supabase } from '../auth/supabase';
import type { TripDocumentExtractionResponse } from '../types/trip-document';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000';

type ErrorResponse = {
  error?: string;
  message?: string;
};

export async function extractTripDocument(
  uri: string
): Promise<TripDocumentExtractionResponse> {
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

  const imageFile = new File(uri);
  if (!imageFile.exists || imageFile.size === 0) {
    throw new Error('The selected trip-document image is missing or empty.');
  }

  const form = new FormData();
  form.append('image', imageFile);

  const response = await fetch(`${API_BASE_URL}/v1/trip-documents/extract`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    let details = `Request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as ErrorResponse;
      details = body.message || body.error || details;
    } catch {
      // Preserve the HTTP status when the response is not JSON.
    }
    throw new Error(details);
  }

  return (await response.json()) as TripDocumentExtractionResponse;
}
