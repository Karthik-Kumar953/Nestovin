import { SignJWT, importPKCS8 } from 'jose';

/**
 * Outbound messaging adapters. Each is null when its keys are not configured;
 * the notification worker then keeps the in-app inbox entry and skips the
 * external channel. Keys live only in the API environment.
 */

export interface PushSender {
  /** Returns tokens that are no longer valid (to delete). */
  send(tokens: string[], message: { title: string; body: string; data: Record<string, string> }): Promise<{ invalidTokens: string[] }>;
}

export interface EmailSender {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Firebase Cloud Messaging HTTP v1 with a service-account JWT (no SDK). */
export function createFcm(opts: { projectId: string; clientEmail: string; privateKey: string }): PushSender {
  let cached: { token: string; expires: number } | null = null;
  const accessToken = async () => {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const key = await importPKCS8(opts.privateKey.replace(/\\n/g, '\n'), 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(opts.clientEmail)
      .setSubject(opts.clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !json.access_token) throw new Error(`FCM auth failed (${res.status})`);
    cached = { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return cached.token;
  };

  return {
    async send(tokens, message) {
      const bearer = await accessToken();
      const invalidTokens: string[] = [];
      let lastError: string | null = null;
      for (const token of tokens) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token, notification: { title: message.title, body: message.body }, data: message.data } }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) continue;
        const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
        if (res.status === 404 || err.error?.status === 'NOT_FOUND' || err.error?.status === 'UNREGISTERED' || res.status === 400) invalidTokens.push(token);
        else lastError = `FCM ${res.status}: ${err.error?.message ?? 'error'}`;
      }
      if (lastError && invalidTokens.length < tokens.length) throw new Error(lastError);
      return { invalidTokens };
    },
  };
}

/** Resend transactional email (plain text). */
export function createResend(opts: { apiKey: string; from: string }): EmailSender {
  return {
    async send(to, subject, text) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: opts.from, to: [to], subject, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
