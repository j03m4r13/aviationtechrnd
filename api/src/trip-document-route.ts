import type { FastifyPluginAsync } from 'fastify';

import { authenticateRequest } from './auth.js';
import { extractTripDocument } from './trip-document-service.js';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

export const tripDocumentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/trip-documents/extract', async (request, reply) => {
    try {
      await authenticateRequest(request);

      let image: Buffer | null = null;
      let mimeType = 'image/jpeg';
      let filename = 'trip-document.jpg';

      for await (const part of request.parts()) {
        if (part.type !== 'file') {
          continue;
        }

        if (part.fieldname !== 'image') {
          part.file.resume();
          continue;
        }

        mimeType = part.mimetype || mimeType;
        filename = part.filename || filename;

        if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
          part.file.resume();
          return reply.code(415).send({
            error: 'unsupported_image_type',
            message:
              'Use a JPEG, PNG, or WebP image. Retake or crop HEIC/AVIF photos before uploading.'
          });
        }

        image = await part.toBuffer();
      }

      if (!image || image.length === 0) {
        return reply.code(400).send({
          error: 'missing_image',
          message: 'A non-empty multipart field named "image" is required.'
        });
      }

      if (image.length > MAX_IMAGE_BYTES) {
        return reply.code(413).send({
          error: 'image_too_large',
          message: 'The trip-document image exceeds the 12 MB limit.'
        });
      }

      const result = await extractTripDocument({ image, mimeType });

      request.log.info(
        {
          filename,
          mimeType,
          imageBytes: image.length,
          model: result.model,
          confidence: result.extraction.confidence
        },
        'Trip document extracted'
      );

      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Trip document extraction failed');
      const typed = error as {
        statusCode?: number;
        code?: string;
        message?: string;
      };

      return reply.code(typed.statusCode ?? 502).send({
        error: typed.code ?? 'trip_document_extraction_failed',
        message: typed.message ?? 'Unable to read the trip document.'
      });
    }
  });
};
