import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from './auth.js';
import { supabaseAdmin } from './supabase.js';

export type CloudSessionRow = {
  id: string;
  user_id: string;
  device_session_id: string;
  created_at: string;
  updated_at: string;
  duration_ms: number;
  source_language: string;
  target_language: string;
  status: 'recorded' | 'processing' | 'completed' | 'failed';
  original_transcript: string | null;
  translated_transcript: string | null;
  error_message: string | null;
  input_name: string | null;
  input_type: string | null;
  transcription_model: string | null;
  translation_model: string | null;
  deleted_at: string | null;
};

type ProcessingJobRow = {
  id: string;
  user_id: string;
  recording_session_id: string;
  idempotency_key: string;
  status: 'processing' | 'completed' | 'failed';
  retry_count: number;
};

export type UsageSummary = {
  month: string;
  processedSeconds: number;
  completedJobs: number;
};

export type ProcessingMetrics = {
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error || data === null) {
    throw new Error(error?.message ?? 'Supabase returned no data.');
  }
  return data;
}

export async function ensureProfile(user: AuthenticatedUser): Promise<void> {
  const { error } = await supabaseAdmin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertCloudSession(input: {
  user: AuthenticatedUser;
  localSessionId: string;
  createdAt: string;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  inputName: string | null;
  inputType: string | null;
}): Promise<CloudSessionRow> {
  await ensureProfile(input.user);

  const { data, error } = await supabaseAdmin
    .from('recording_sessions')
    .upsert(
      {
        user_id: input.user.id,
        device_session_id: input.localSessionId,
        created_at: input.createdAt,
        updated_at: new Date().toISOString(),
        duration_ms: input.durationMs,
        source_language: input.sourceLanguage,
        target_language: input.targetLanguage,
        status: 'processing',
        error_message: null,
        input_name: input.inputName,
        input_type: input.inputType,
        deleted_at: null
      },
      { onConflict: 'user_id,device_session_id' }
    )
    .select('*')
    .single();

  return requireData(data as CloudSessionRow | null, error);
}

export async function getJobByIdempotency(
  userId: string,
  idempotencyKey: string
): Promise<ProcessingJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from('processing_jobs')
    .select('id,user_id,recording_session_id,idempotency_key,status,retry_count')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as ProcessingJobRow | null;
}

export async function startProcessingJob(input: {
  userId: string;
  cloudSessionId: string;
  idempotencyKey: string;
}): Promise<ProcessingJobRow> {
  const existing = await getJobByIdempotency(input.userId, input.idempotencyKey);
  const now = new Date().toISOString();

  if (existing) {
    if (existing.status === 'processing') {
      throw Object.assign(new Error('This recording is already being processed.'), {
        statusCode: 409,
        code: 'processing_in_progress'
      });
    }

    if (existing.status === 'completed') {
      return existing;
    }

    const { data, error } = await supabaseAdmin
      .from('processing_jobs')
      .update({
        status: 'processing',
        started_at: now,
        completed_at: null,
        retry_count: existing.retry_count + 1,
        error_code: null,
        error_message: null
      })
      .eq('id', existing.id)
      .select('id,user_id,recording_session_id,idempotency_key,status,retry_count')
      .single();

    return requireData(data as ProcessingJobRow | null, error);
  }

  const { data, error } = await supabaseAdmin
    .from('processing_jobs')
    .insert({
      id: randomUUID(),
      user_id: input.userId,
      recording_session_id: input.cloudSessionId,
      idempotency_key: input.idempotencyKey,
      status: 'processing',
      started_at: now,
      retry_count: 0
    })
    .select('id,user_id,recording_session_id,idempotency_key,status,retry_count')
    .single();

  return requireData(data as ProcessingJobRow | null, error);
}

export async function getCompletedIdempotentResult(
  userId: string,
  idempotencyKey: string
): Promise<CloudSessionRow | null> {
  const job = await getJobByIdempotency(userId, idempotencyKey);
  if (!job || job.status !== 'completed') {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('recording_sessions')
    .select('*')
    .eq('id', job.recording_session_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as CloudSessionRow | null;
}

export async function completeCloudProcessing(input: {
  userId: string;
  cloudSessionId: string;
  jobId: string;
  durationMs: number;
  transcript: string;
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  transcriptionModel: string;
  translationModel: string;
  metrics: ProcessingMetrics;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error: sessionError } = await supabaseAdmin
    .from('recording_sessions')
    .update({
      updated_at: now,
      status: 'completed',
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      original_transcript: input.transcript,
      translated_transcript: input.translation,
      error_message: null,
      transcription_model: input.transcriptionModel,
      translation_model: input.translationModel
    })
    .eq('id', input.cloudSessionId)
    .eq('user_id', input.userId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const { error: jobError } = await supabaseAdmin
    .from('processing_jobs')
    .update({ status: 'completed', completed_at: now, error_code: null, error_message: null })
    .eq('id', input.jobId)
    .eq('user_id', input.userId);

  if (jobError) {
    throw new Error(jobError.message);
  }

  const billableSeconds = Math.max(1, Math.ceil(input.durationMs / 1000));
  const { error: usageError } = await supabaseAdmin.from('usage_events').upsert(
    {
      id: input.jobId,
      user_id: input.userId,
      recording_session_id: input.cloudSessionId,
      processing_job_id: input.jobId,
      audio_duration_ms: input.durationMs,
      billable_audio_seconds: billableSeconds,
      transcription_model: input.transcriptionModel,
      translation_model: input.translationModel,
      input_tokens: input.metrics.inputTokens,
      output_tokens: input.metrics.outputTokens,
      estimated_cost_usd: input.metrics.estimatedCostUsd
    },
    { onConflict: 'processing_job_id' }
  );

  if (usageError) {
    throw new Error(usageError.message);
  }
}

export async function failCloudProcessing(input: {
  userId: string;
  cloudSessionId: string;
  jobId: string;
  code: string;
  message: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin
      .from('recording_sessions')
      .update({ status: 'failed', error_message: input.message, updated_at: now })
      .eq('id', input.cloudSessionId)
      .eq('user_id', input.userId),
    supabaseAdmin
      .from('processing_jobs')
      .update({
        status: 'failed',
        completed_at: now,
        error_code: input.code,
        error_message: input.message
      })
      .eq('id', input.jobId)
      .eq('user_id', input.userId)
  ]);
}

export async function listCloudSessions(userId: string): Promise<CloudSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('recording_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as CloudSessionRow[];
}

export async function softDeleteCloudSession(
  userId: string,
  cloudSessionId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('recording_sessions')
    .update({
      deleted_at: new Date().toISOString(),
      original_transcript: null,
      translated_transcript: null,
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', cloudSessionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  return (data?.length ?? 0) > 0;
}

export async function getCurrentMonthUsage(userId: string): Promise<UsageSummary> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data, error } = await supabaseAdmin
    .from('usage_events')
    .select('billable_audio_seconds')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', nextMonth.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  return {
    month: monthStart.toISOString().slice(0, 7),
    processedSeconds: (data ?? []).reduce(
      (sum, row) => sum + Number(row.billable_audio_seconds ?? 0),
      0
    ),
    completedJobs: data?.length ?? 0
  };
}
