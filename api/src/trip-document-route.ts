import type { FastifyPluginAsync } from 'fastify';

import { authenticateRequest } from './auth.js';
import { extractTripDocument } from './trip-document-service.js';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/octet-stream'
]);

function detectImageMimeType(image: Buffer, reportedType: string): string | null {
  if (reportedType === 'image/jpeg' || reportedType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (reportedType === 'image/png' || reportedType === 'image/webp') {
    return reportedType;
  }

  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    image.length >= 8 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    image.length >= 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export const tripDocumentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/trip-documents/extract', async (request, reply) => {
    try {
      await authenticateRequest(request);

      let image: Buffer | null = null;
      let reportedMimeType = 'application/octet-stream';
      let filename = 'trip-document.jpg';

      for await (const part of request.parts()) {
        if (part.type !== 'file') {
          continue;
        }

        if (part.fieldname !== 'image') {
          part.file.resume();
          continue;
        }

        reportedMimeType = part.mimetype || reportedMimeType;
        filename = part.filename || filename;

        if (!ACCEPTED_UPLOAD_TYPES.has(reportedMimeType)) {
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

      const mimeType = detectImageMimeType(image, reportedMimeType);
      if (!mimeType) {
        return reply.code(415).send({
          error: 'unsupported_image_type',
          message:
            'The uploaded file is not a supported JPEG, PNG, or WebP image. Retake or crop the photo and try again.'
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
