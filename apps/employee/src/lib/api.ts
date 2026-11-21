import type { ErrorEnvelope, FieldError } from '@nestovin/contracts';
import { env } from './env';
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
  get isNetwork() {
    return this.code === 'NETWORK';
  }
}

type Init = { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean };

/**
 * Calls the Nestovin API with the worker's session. All errors become ApiError.
 * NETWORK means the request never reached the server, so a retry is safe.
 */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let token: string | undefined;
  if (init.auth !== false) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }
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
    throw new ApiError(0, 'NETWORK', 'No internet connection. Check your signal and try again.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const e = json as ErrorEnvelope | undefined;
    throw new ApiError(res.status, e?.error?.code ?? 'INTERNAL', e?.error?.message ?? 'Something went wrong. Please try again.', e?.error?.fields ?? []);
  }
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.isNetwork;
