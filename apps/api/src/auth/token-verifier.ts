import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedToken {
  userId: string;
  email: string | undefined;
  /** Authenticator assurance level: 'aal2' after a successful TOTP MFA challenge. */
  aal: 'aal1' | 'aal2' | string | undefined;
  /** Supabase session id, used for audit correlation. */
  sessionId: string | undefined;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/**
 * Verifies Supabase-issued access tokens.
 * - Asymmetric keys (ES256/RS256) via the project's JWKS endpoint (hosted projects).
 * - HS256 with the legacy JWT secret (local Supabase CLI), only if configured.
 * Issuer and audience are always checked.
 */
export function createSupabaseTokenVerifier(opts: { supabaseUrl: string; jwtSecret?: string }): TokenVerifier {
  const issuer = `${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const hsKey = opts.jwtSecret ? new TextEncoder().encode(opts.jwtSecret) : undefined;

  return {
    async verify(token) {
      const { alg } = decodeProtectedHeader(token);
      let payload: JWTPayload;
      if (alg === 'HS256') {
        if (!hsKey) throw new Error('HS256 tokens are not accepted in this environment');
        ({ payload } = await jwtVerify(token, hsKey, { issuer, audience: 'authenticated', algorithms: ['HS256'] }));
      } else {
        ({ payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'] }));
      }
      if (!payload.sub) throw new Error('Token has no subject');
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        aal: typeof payload.aal === 'string' ? payload.aal : undefined,
        sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
      };
    },
  };
}
