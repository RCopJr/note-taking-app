import { createServerSupabaseClient, type ServerSupabaseConfig } from './supabase.ts';
import { createMiddleware } from 'hono/factory';
import { ApiError } from './http.ts';


export type AssuranceLevel = 'aal1' | 'aal2';

export interface AuthIdentity {
  userId: string;
  email?: string;
  assuranceLevel: AssuranceLevel;
}

export type VerifyAccessToken = (accessToken: string) => Promise<AuthIdentity | null>;

export interface AuthVariables {
  userId: string;
  authIdentity: AuthIdentity;
  accessToken: string;
}

export function createVerifyAccessToken(config: ServerSupabaseConfig): VerifyAccessToken {
  const supabase = createServerSupabaseClient(config);
  return async (accessToken) => {
    const { data, error } = await supabase.auth.getClaims(accessToken);
    if (error || !data || typeof data.claims.sub !== 'string') return null;

    return {
      userId: data.claims.sub,
      ...(typeof data.claims.email === 'string' ? { email: data.claims.email } : {}),
      assuranceLevel: data.claims.aal === 'aal2' ? 'aal2' : 'aal1',
    };
  };
}

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export function requireAuthentication(
  minimumAssuranceLevel: AssuranceLevel,
  verifyAccessToken: VerifyAccessToken,
) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const accessToken = readBearerToken(c.req.header('Authorization'));
    if (!accessToken) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
    }

    const identity = await verifyAccessToken(accessToken);
    if (!identity) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'The session is invalid or expired.');
    }
    if (minimumAssuranceLevel === 'aal2' && identity.assuranceLevel !== 'aal2') {
      throw new ApiError(403, 'FORBIDDEN', 'Multi-factor authentication is required.');
    }

    c.set('userId', identity.userId);
    c.set('accessToken', accessToken);
    c.set('authIdentity', identity);
    await next();
  });
}
