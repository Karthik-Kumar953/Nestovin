'use client';

import { ArrowRight, CheckCircle2, Loader2, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

/**
 * "Request Nestovin To Your Community": the website side of demand collection. The request
 * goes to the Nestovin API (POST /v1/public/community-requests), is counted with the app's community
 * votes, and appears for the Super Admin on the Expansion votes page.
 * The API address comes from NEXT_PUBLIC_API_URL; without it the form says requests open soon.
 */
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

const SERVICES = [
  { value: 'MAID', label: 'Maid' },
  { value: 'COOK', label: 'Cook' },
  { value: 'CARETAKER', label: 'Caretaker' },
] as const;

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; reference: string } | { kind: 'error'; message: string };
type Errors = Partial<Record<'name' | 'phone' | 'city' | 'community' | 'services' | 'consent', string>>;

export function CommunityRequestButton({ className = '' }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => dialog.current?.showModal();
  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`group inline-flex min-h-12 items-center gap-3 rounded-full bg-white py-1.5 pr-5 pl-1.5 text-left font-display text-[15px] font-semibold text-teal-deep shadow-[0_12px_30px_-14px_rgb(0_40_35/0.6)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-[0_16px_36px_-14px_rgb(0_40_35/0.7)] active:scale-[0.98] ${className}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-deep text-white">
          <MapPin size={18} aria-hidden />
        </span>
        Request Nestovin To Your Community
        <ArrowRight size={18} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
      <RequestDialog ref={dialog} />
    </>
  );
}

function RequestDialog({ ref }: { ref: React.RefObject<HTMLDialogElement | null> }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errors, setErrors] = useState<Errors>({});
  const [services, setServices] = useState<string[]>([]);
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);

  // Clicking the dimmed backdrop closes it, like the Esc key.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener('click', onClick);
    return () => d.removeEventListener('click', onClick);
  }, [ref]);

  const close = () => ref.current?.close();

  const toggle = (v: string) => setServices((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get('name') ?? '').trim(),
      phone: String(f.get('phone') ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
      city: String(f.get('city') ?? '').trim(),
      community: String(f.get('community') ?? '').trim(),
      services,
      note: String(f.get('note') ?? '').trim() || undefined,
      consent: f.get('consent') === 'on',
      website: String(f.get('website') ?? ''),
    };
    const next: Errors = {};
    if (body.name.length < 2) next.name = 'Enter your name';
    if (!/^[6-9]\d{9}$/.test(body.phone)) next.phone = 'Enter a 10-digit mobile number';
    if (!body.city) next.city = 'Enter your city';
    if (!body.community) next.community = 'Enter your community name';
    if (services.length === 0) next.services = 'Choose at least one service';
    if (!body.consent) next.consent = 'Please agree so we can contact you';
    setErrors(next);
    if (Object.keys(next).length) {
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(`${apiUrl}/v1/public/community-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, consent: true }),
      });
      if (res.status === 429) throw new Error('Too many requests from this network. Please try again in a while.');
      if (!res.ok) throw new Error('We could not send your request. Please check the details and try again.');
      const data = (await res.json()) as { reference?: string };
      setStatus({ kind: 'done', reference: data.reference ?? '' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error && err.message.length < 120 ? err.message : 'Something went wrong. Please try again.' });
    }
  }

  const field = 'mt-1.5 block min-h-12 w-full rounded-lg border bg-surface px-3.5 text-[16px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/20';
  const err = (k: keyof Errors) => (errors[k] ? 'border-error' : 'border-line');

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (status.kind === 'done') {
          setStatus({ kind: 'idle' });
          setServices([]);
        }
      }}
      className="request-dialog m-0 mt-auto w-full max-w-none rounded-t-[24px] bg-surface p-0 text-ink backdrop:bg-charcoal/55 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-[520px] sm:rounded-[24px]"
    >
      <div className="max-h-[88svh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-surface px-6 pt-6 pb-3">
          <div>
            <h2 id={titleId} className="text-[24px] leading-8 font-bold tracking-[-0.01em]">
              Request Nestovin To Your Community
            </h2>
            <p className="mt-1 text-[15px] leading-6 text-ink-2">We start where residents ask for us. Every request from your community counts.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-subtle">
            <X size={20} aria-hidden />
          </button>
        </div>

        {status.kind === 'done' ? (
          <div className="px-6 pt-4 pb-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-green-action" aria-hidden />
            <p className="mt-4 font-display text-[20px] font-semibold text-charcoal">Your request is in</p>
            <p className="mt-2 text-[15px] leading-6 text-ink-2">
              Thank you. We count every request from your community and will contact you when there is news.
            </p>
            {status.reference && <p className="mt-4 text-[14px] text-ink-2">Reference: <span className="font-semibold text-charcoal tabular-nums">{status.reference}</span></p>}
            <button type="button" onClick={close} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-teal px-6 font-display text-[15px] font-semibold text-white hover:bg-teal-deep">
              Done
            </button>
          </div>
        ) : !apiUrl ? (
          <div className="px-6 pt-2 pb-8">
            <p className="rounded-lg bg-canvas p-4 text-[15px] leading-6 text-ink-2">
              Online requests open in the next few days. Until then, send us an enquiry with your community name.
            </p>
            <Link href="/contact?type=community" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-teal px-6 font-display text-[15px] font-semibold text-white hover:bg-teal-deep">
              Send an enquiry
            </Link>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4 px-6 pt-2 pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[14px] font-medium text-charcoal">
                Your name
                <input ref={firstField} name="name" autoComplete="name" className={`${field} ${err('name')}`} aria-invalid={!!errors.name} />
                {errors.name && <span className="mt-1 block text-[13px] text-error">{errors.name}</span>}
              </label>
              <label className="block text-[14px] font-medium text-charcoal">
                Mobile number
                <input name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10 digits" className={`${field} ${err('phone')}`} aria-invalid={!!errors.phone} />
                {errors.phone && <span className="mt-1 block text-[13px] text-error">{errors.phone}</span>}
              </label>
              <label className="block text-[14px] font-medium text-charcoal">
                City
                <input name="city" autoComplete="address-level2" className={`${field} ${err('city')}`} aria-invalid={!!errors.city} />
                {errors.city && <span className="mt-1 block text-[13px] text-error">{errors.city}</span>}
              </label>
              <label className="block text-[14px] font-medium text-charcoal">
                Community name
                <input name="community" placeholder="Your gated community" className={`${field} ${err('community')}`} aria-invalid={!!errors.community} />
                {errors.community && <span className="mt-1 block text-[13px] text-error">{errors.community}</span>}
              </label>
            </div>

            <fieldset>
              <legend className="text-[14px] font-medium text-charcoal">What would you like?</legend>
              <div className="mt-2 flex flex-wrap gap-2" aria-invalid={!!errors.services}>
                {SERVICES.map((s) => {
                  const on = services.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s.value)}
                      className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition-colors ${on ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-charcoal hover:border-teal'}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {errors.services && <span className="mt-1 block text-[13px] text-error">{errors.services}</span>}
            </fieldset>

            <label className="block text-[14px] font-medium text-charcoal">
              Anything else? <span className="font-normal text-ink-2">(optional)</span>
              <textarea name="note" rows={2} maxLength={500} className={`${field} min-h-20 resize-y py-3 ${'border-line'}`} />
            </label>

            {/* Honeypot: hidden from people, filled by bots. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

            <label className="flex items-start gap-3 text-[14px] leading-6 text-ink-2">
              <input name="consent" type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--nv-teal-action)]" aria-invalid={!!errors.consent} />
              <span>
                I agree that Nestovin may contact me about this request, as described in the{' '}
                <Link href="/privacy" className="font-medium text-teal underline underline-offset-2">
                  privacy notice
                </Link>
                .
                {errors.consent && <span className="mt-1 block text-[13px] text-error">{errors.consent}</span>}
              </span>
            </label>

            {status.kind === 'error' && (
              <p role="alert" className="rounded-lg bg-error-bg p-3 text-[14px] text-error">
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === 'sending'}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-teal px-6 font-display text-[15px] font-semibold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
            >
              {status.kind === 'sending' ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden /> Sending
                </>
              ) : (
                'Send request'
              )}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
