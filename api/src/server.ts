import 'dotenv/config';

import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyReply } from 'fastify';

import { prepareAudioChunks } from './audio-chunks.js';
import { determineAudioDurationMs } from './audio-duration.js';
import { authenticateRequest } from './auth.js';
import {
  completeCloudProcessing,
  failCloudProcessing,
  getCompletedIdempotentResult,
  getCurrentMonthUsage,
  listCloudSessions,
  softDeleteCloudSession,
  startProcessingJob,
  upsertCloudSession
} from './cloud-repository.js';
import { transcribeAndTranslate, transcribeChunksAndTranslate } from './openai-service.js';

const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES ?? 64 * 1024 * 1024);
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/webm',
  'application/octet-stream'
]);

const app = Fastify({
  logger: true,
  bodyLimit: MAX_AUDIO_BYTES + 1024 * 1024
});

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: {
    files: 1,
    fields: 12,
    fileSize: MAX_AUDIO_BYTES
  }
});

app.get('/health', async () => ({ ok: true }));

app.get('/v1/sessions', async (request, reply) => {
  try {
    const user = await authenticateRequest(request);
    const rows = await listCloudSessions(user.id);
    return reply.send({
      sessions: rows.map((row) => ({
        id: row.id,
        localSessionId: row.device_session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        durationMs: row.duration_ms,
        sourceLanguage: row.source_language,
        targetLanguage: row.target_language,
        status: row.status,
        originalTranscript: row.original_transcript,
        translatedTranscript: row.translated_transcript,
        errorMessage: row.error_message,
        inputName: row.input_name,
        inputType: row.input_type,
        transcriptionModel: row.transcription_model,
        translationModel: row.translation_model
      }))
    });
  } catch (error) {
    return sendKnownError(reply, error);
  }
});

app.get('/v1/usage/current-month', async (request, reply) => {
  try {
    const user = await authenticateRequest(request);
    return reply.send(await getCurrentMonthUsage(user.id));
  } catch (error) {
    return sendKnownError(reply, error);
  }
});

app.delete('/v1/sessions/:sessionId', async (request, reply) => {
  try {
    const user = await authenticateRequest(request);
    const { sessionId } = request.params as { sessionId: string };
    const deleted = await softDeleteCloudSession(user.id, sessionId);
    if (!deleted) {
      return reply.code(404).send({
        error: 'session_not_found',
        message: 'The cloud session was not found.'
      });
    }
    return reply.code(204).send();
  } catch (error) {
    return sendKnownError(reply, error);
  }
});

app.post('/v1/audio/process', async (request, reply) => {
  let cloudSessionId: string | null = null;
  let jobId: string | null = null;
  let userId: string | null = null;

  try {
    const user = await authenticateRequest(request);
    userId = user.id;

    const idempotencyHeader = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idempotencyHeader)
      ? idempotencyHeader[0]
      : idempotencyHeader;

    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
      return reply.code(400).send({
        error: 'invalid_idempotency_key',
        message: 'A stable Idempotency-Key header is required.'
      });
    }

    let audio: Buffer | null = null;
    let filename = 'recording.m4a';
    let mimeType = 'audio/mp4';
    let sourceLanguage = 'auto';
    let targetLanguage = 'en';
    let localSessionId = '';
    let createdAt = new Date().toISOString();
    let durationMs = 0;
    let inputName: string | null = null;
    let inputType: string | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'audio') {
          part.file.resume();
          continue;
        }

        filename = part.filename || filename;
        mimeType = normalizeAudioMimeType(part.mimetype || mimeType);
        if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
          part.file.resume();
          return reply.code(415).send({
            error: 'unsupported_audio_type',
            message: `Unsupported audio MIME type: ${mimeType}`
          });
        }
        audio = await part.toBuffer();
        continue;
      }

      const value = String(part.value ?? '').trim();
      switch (part.fieldname) {
        case 'sourceLanguage':
          sourceLanguage = value.toLowerCase() || 'auto';
          break;
        case 'targetLanguage':
          targetLanguage = value.toLowerCase() || 'en';
          break;
        case 'localSessionId':
          localSessionId = value;
          break;
        case 'createdAt':
          createdAt = value || createdAt;
          break;
        case 'durationMs':
          durationMs = Number(value);
          break;
        case 'inputName':
          inputName = value || null;
          break;
        case 'inputType':
          inputType = value || null;
          break;
      }
    }

    if (!audio || audio.length === 0) {
      return reply.code(400).send({
        error: 'missing_audio',
        message: 'A non-empty multipart field named "audio" is required.'
      });
    }
    if (!localSessionId || localSessionId.length > 200) {
      return reply.code(400).send({
        error: 'invalid_local_session_id',
        message: 'localSessionId is required.'
      });
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
      return reply.code(400).send({
        error: 'invalid_duration',
        message: 'durationMs is outside the supported range.'
      });
    }

    const durationResult = await determineAudioDurationMs({
      audio,
      filename,
      mimeType,
      clientDurationMs: durationMs,
      maxDurationMs: MAX_DURATION_MS
    });
    const authoritativeDurationMs = durationResult.durationMs;

    if (durationResult.source !== 'music-metadata') {
      request.log.warn(
        {
          durationSource: durationResult.source,
          authoritativeDurationMs,
          clientDurationMs: durationMs,
          filename,
          mimeType,
          audioBytes: audio.length,
          diagnostics: durationResult.diagnostics
        },
        'Used fallback audio-duration detection'
      );
    }
    if (authoritativeDurationMs > MAX_DURATION_MS) {
      return reply.code(413).send({
        error: 'audio_too_long',
        message: 'The recording exceeds the maximum supported duration.'
      });
    }

    const cached = await getCompletedIdempotentResult(user.id, idempotencyKey);
    if (cached) {
      return reply.send({
        transcript: cached.original_transcript ?? '',
        translation: cached.translated_transcript ?? '',
        sourceLanguage: cached.source_language,
        targetLanguage: cached.target_language,
        models: {
          transcription: cached.transcription_model ?? 'unknown',
          translation: cached.translation_model ?? 'unknown'
        },
        cloudSessionId: cached.id,
        idempotentReplay: true,
        usage: await getCurrentMonthUsage(user.id)
      });
    }

    const cloudSession = await upsertCloudSession({
      user,
      localSessionId,
      createdAt,
      durationMs: authoritativeDurationMs,
      sourceLanguage,
      targetLanguage,
      inputName,
      inputType
    });
    cloudSessionId = cloudSession.id;

    const job = await startProcessingJob({
      userId: user.id,
      cloudSessionId: cloudSession.id,
      idempotencyKey
    });
    jobId = job.id;

    if (job.status === 'completed') {
      const replay = await getCompletedIdempotentResult(user.id, idempotencyKey);
      if (replay) {
        return reply.send({
          transcript: replay.original_transcript ?? '',
          translation: replay.translated_transcript ?? '',
          sourceLanguage: replay.source_language,
          targetLanguage: replay.target_language,
          models: {
            transcription: replay.transcription_model ?? 'unknown',
            translation: replay.translation_model ?? 'unknown'
          },
          cloudSessionId: replay.id,
          idempotentReplay: true,
          usage: await getCurrentMonthUsage(user.id)
        });
      }
    }

    const chunks = await prepareAudioChunks({
      audio,
      filename,
      mimeType,
      durationMs: authoritativeDurationMs
    });

    if (chunks.length === 0) {
      throw new Error('Audio chunk preparation returned no chunks.');
    }

    if (chunks.length > 1) {
      request.log.info(
        {
          chunkCount: chunks.length,
          authoritativeDurationMs,
          filename,
          mimeType,
          audioBytes: audio.length
        },
        'Processing long recording as transcription chunks'
      );
    }

    const firstChunk = chunks[0];
    const result = chunks.length === 1
      ? await transcribeAndTranslate({
          audio: firstChunk.audio,
          filename: firstChunk.filename,
          mimeType: firstChunk.mimeType,
          durationMs: authoritativeDurationMs,
          sourceLanguage,
          targetLanguage
        })
      : await transcribeChunksAndTranslate({
          chunks,
          durationMs: authoritativeDurationMs,
          sourceLanguage,
          targetLanguage
        });

    await completeCloudProcessing({
      userId: user.id,
      cloudSessionId: cloudSession.id,
      jobId: job.id,
      durationMs: authoritativeDurationMs,
      transcript: result.transcript,
      translation: result.translation,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      transcriptionModel: result.models.transcription,
      translationModel: result.models.translation,
      metrics: result.usage
    });

    return reply.send({
      transcript: result.transcript,
      translation: result.translation,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      models: result.models,
      cloudSessionId: cloudSession.id,
      idempotentReplay: false,
      usage: await getCurrentMonthUsage(user.id),
      processing: {
        chunkCount: result.usage.chunkCount ?? chunks.length
      }
    });
  } catch (error) {
    request.log.error({ err: error }, 'Audio processing failed');

    if (userId && cloudSessionId && jobId) {
      const details = error instanceof Error ? error.message : 'Processing failed.';
      await failCloudProcessing({
        userId,
        cloudSessionId,
        jobId,
        code: 'audio_processing_failed',
        message: details
      }).catch((storageError) => {
        request.log.error({ err: storageError }, 'Failed to persist processing error');
      });
    }

    return sendKnownError(reply, error, 502, 'audio_processing_failed');
  }
});

function normalizeAudioMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (
    normalized === 'audio/x-wav' ||
    normalized === 'audio/wave' ||
    normalized === 'audio/vnd.wave'
  ) {
    return 'audio/wav';
  }
  if (normalized === 'audio/m4a' || normalized === 'audio/x-m4a') {
    return 'audio/mp4';
  }
  return normalized;
}

function sendKnownError(
  reply: FastifyReply,
  error: unknown,
  fallbackStatus = 500,
  fallbackCode = 'internal_error'
) {
  const typed = error as { statusCode?: number; code?: string; message?: string };
  return reply.code(typed.statusCode ?? fallbackStatus).send({
    error: typed.code ?? fallbackCode,
    message: typed.message ?? 'The request failed.'
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
