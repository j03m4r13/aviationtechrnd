import 'dotenv/config';

import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';

import { transcribeAndTranslate } from './openai-service.js';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'application/octet-stream'
]);

const app = Fastify({
  logger: true,
  bodyLimit: MAX_AUDIO_BYTES + 1024 * 1024
});

await app.register(cors, {
  origin: true
});

await app.register(multipart, {
  limits: {
    files: 1,
    fields: 10,
    fileSize: MAX_AUDIO_BYTES
  }
});

app.get('/health', async () => ({ ok: true }));

app.post('/v1/audio/process', async (request, reply) => {
  let audio: Buffer | null = null;
  let filename = 'recording.m4a';
  let mimeType = 'audio/mp4';
  let sourceLanguage = 'auto';
  let targetLanguage = 'en';

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'audio') {
        part.file.resume();
        continue;
      }

      filename = part.filename || filename;
      mimeType = part.mimetype || mimeType;

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

    if (part.fieldname === 'sourceLanguage') {
      sourceLanguage = String(part.value || 'auto').trim().toLowerCase();
    }

    if (part.fieldname === 'targetLanguage') {
      targetLanguage = String(part.value || 'en').trim().toLowerCase();
    }
  }

  if (!audio || audio.length === 0) {
    return reply.code(400).send({
      error: 'missing_audio',
      message: 'A non-empty multipart field named "audio" is required.'
    });
  }

  if (!targetLanguage) {
    return reply.code(400).send({
      error: 'missing_target_language',
      message: 'targetLanguage is required.'
    });
  }

  try {
    const result = await transcribeAndTranslate({
      audio,
      filename,
      mimeType,
      sourceLanguage,
      targetLanguage
    });

    return reply.send(result);
  } catch (error) {
    request.log.error({ err: error }, 'Audio processing failed');

    return reply.code(502).send({
      error: 'audio_processing_failed',
      message:
        error instanceof Error
          ? error.message
          : 'The transcription or translation request failed.'
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
