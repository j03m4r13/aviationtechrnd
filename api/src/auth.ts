import type { FastifyRequest } from 'fastify';

import { supabaseAdmin } from './supabase.js';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function authenticateRequest(
  request: FastifyRequest
): Promise<AuthenticatedUser> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw Object.assign(new Error('A bearer access token is required.'), {
      statusCode: 401,
      code: 'missing_access_token'
    });
  }

  const token = authorization.slice('Bearer '.length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    request.log.warn(
      {
        supabaseErrorName: error?.name,
        supabaseErrorMessage: error?.message,
        supabaseErrorStatus: error?.status
      },
      'Supabase token validation failed'
    );

    const message =
      process.env.NODE_ENV === 'production'
        ? 'The access token is invalid or expired.'
        : `Supabase rejected the access token: ${
            error?.message ?? 'No authenticated user was returned.'
          }`;

    throw Object.assign(new Error(message), {
      statusCode: 401,
      code: 'invalid_access_token'
    });
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null
  };
}
