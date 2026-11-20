import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay adapter (ADR-006). Razorpay processes and reports; Nestovin decides
 * business state only after its own server-side verification. Keys live only
 * in the API environment. Uses the REST API directly (no SDK).
 */
export interface ProviderPayment {
  id: string;
  orderId: string | null;
  amountPaise: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
}

export interface PaymentProvider {
  readonly keyId: string;
  createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  /** Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Webhook signature: HMAC-SHA256(raw body, webhook secret). False when no webhook secret is set. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function toProviderPayment(e: Record<string, unknown>): ProviderPayment {
  return {
    id: String(e.id),
    orderId: e.order_id ? String(e.order_id) : null,
    amountPaise: Number(e.amount),
    currency: String(e.currency),
    status: String(e.status),
    method: e.method ? String(e.method) : null,
  };
}

export function createRazorpay(opts: { keyId: string; keySecret: string; webhookSecret?: string | undefined }): PaymentProvider {
  const auth = 'Basic ' + Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString('base64');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error ?? {}) as { description?: string };
      throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${err.description ?? 'unknown error'}`);
    }
    return json;
  };

  return {
    keyId: opts.keyId,
    async createOrder({ amountPaise, currency, receipt, notes }) {
      const o = await call('POST', '/orders', { amount: amountPaise, currency, receipt: receipt.slice(0, 40), notes });
      return { id: String(o.id) };
    },
    async fetchPayment(paymentId) {
      return toProviderPayment(await call('GET', `/payments/${encodeURIComponent(paymentId)}`));
    },
    async fetchOrderPayments(orderId) {
      const r = await call('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
      return ((r.items as Record<string, unknown>[] | undefined) ?? []).map(toProviderPayment);
    },
    verifyCheckoutSignature(orderId, paymentId, signature) {
      return safeEqualHex(hmacHex(opts.keySecret, `${orderId}|${paymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      if (!opts.webhookSecret) return false;
      return safeEqualHex(hmacHex(opts.webhookSecret, rawBody), signature);
    },
  };
}
