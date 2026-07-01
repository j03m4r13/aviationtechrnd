import { fetch } from 'expo/fetch';

import { supabase } from '../auth/supabase';
import type { ProcessingResult } from '../types/audio';
import type { CloudRecordingSession } from '../types/session';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000';

export type UsageSummary = {
  month: string;
  processedSeconds: number;
  completedJobs: number;
};

type ErrorResponse = {
  error?: string;
  message?: string;
};

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Your sign-in session is missing. Please sign in again.');
  }

  return token;
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });
}

async function throwApiError(response: Response): Promise<never> {
  let details = `Request failed with HTTP ${response.status}`;
  try {
    const body = (await response.json()) as ErrorResponse;
    details = body.message || body.error || details;
  } catch {
    // Keep the HTTP status when the response is not JSON.
  }
  throw new Error(details);
}

export async function listCloudSessions(): Promise<CloudRecordingSession[]> {
  const response = await authorizedFetch('/v1/sessions');
  if (!response.ok) {
    return throwApiError(response);
  }

  const body = (await response.json()) as { sessions: CloudRecordingSession[] };
  return body.sessions;
}

export async function getMonthlyUsage(): Promise<UsageSummary> {
  const response = await authorizedFetch('/v1/usage/current-month');
  if (!response.ok) {
    return throwApiError(response);
  }

  return (await response.json()) as UsageSummary;
}

export async function deleteCloudSession(cloudSessionId: string): Promise<void> {
  const response = await authorizedFetch(`/v1/sessions/${cloudSessionId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    await throwApiError(response);
  }
}

export type ProcessedCloudResult = ProcessingResult & {
  cloudSessionId: string;
  idempotentReplay: boolean;
  usage: UsageSummary;
};
