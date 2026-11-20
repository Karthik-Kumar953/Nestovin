import type { ErrorCode, ErrorEnvelope, FieldError } from '@nestovin/contracts';
import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly fields: FieldError[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }

  /** Field error message for a form field path, if any. */
  field(path: string): string | undefined {
    return this.fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message;
  }
}

/**
 * Calls the Nestovin API with the current access token. Errors are always
 * converted into ApiError using the standard envelope.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const env = json as ErrorEnvelope | undefined;
    throw new ApiError(
      res.status,
      env?.error?.code ?? 'INTERNAL',
      env?.error?.message ?? 'Something went wrong. Please try again.',
      env?.error?.fields ?? [],
      env?.error?.requestId,
    );
  }
  return json as T;
}

/** Build a query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function toApiError(res: Response): Promise<ApiError> {
  const env = (await res.json().catch(() => undefined)) as ErrorEnvelope | undefined;
  return new ApiError(
    res.status,
    env?.error?.code ?? 'INTERNAL',
    env?.error?.message ?? 'Something went wrong. Please try again.',
    env?.error?.fields ?? [],
    env?.error?.requestId,
  );
}

/** Uploads a file as the raw request body (used for Excel imports). */
export async function apiUpload<T>(path: string, file: File, contentType: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': contentType, 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Upload failed. Check your connection and try again.');
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** Downloads an authenticated file (e.g. the Excel template) and saves it. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) throw await toApiError(res);
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** ₹ formatting for integer paise. */
export function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}

/** Parses a rupee amount typed by an admin ("4,500" or "4500.50") into paise; null if empty/invalid. */
export function rupeesToPaise(input: string): number | null {
  const clean = input.replace(/[₹,\s]/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}
