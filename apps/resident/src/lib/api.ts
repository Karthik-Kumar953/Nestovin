import type { ErrorEnvelope, FieldError } from '@nestovin/contracts';
import { demoMode, env } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
  field(path: string) {
    return this.fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message;
  }
}

/** Calls the Nestovin API with the resident's session. All errors become ApiError. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  if (demoMode) return (await import('./demo')).demoApi<T>(path, init);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No internet connection. Check your network and try again.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const e = json as ErrorEnvelope | undefined;
    throw new ApiError(res.status, e?.error?.code ?? 'INTERNAL', e?.error?.message ?? 'Something went wrong. Please try again.', e?.error?.fields ?? []);
  }
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/** A fresh key per payment attempt so a retried tap never creates a second order. */
export const idempotencyKey = () => `rn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
