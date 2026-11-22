'use client';

import { BuildingComplex, Check, Clock3, HandHeart, House, Loader2, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { enquiryTypes, site, type EnquiryType } from './content';
import { buttonClass } from './ui';

const typeIcon: Record<EnquiryType, LucideIcon> = { resident: House, community: BuildingComplex, careers: HandHeart, other: MessageCircle };

type Field = 'name' | 'phone' | 'email' | 'city' | 'community' | 'message' | 'consent';
type Errors = Partial<Record<Field, string>>;
const fieldOrder: Field[] = ['name', 'phone', 'email', 'city', 'community', 'message', 'consent'];
/**
 * Launch build: enquiries go straight to the owner's inbox through Web3Forms
 * (NEXT_PUBLIC_WEB3FORMS_KEY, a public access key by design). A custom JSON endpoint
 * (NEXT_PUBLIC_ENQUIRY_ENDPOINT) also works; once the Nestovin API is live this becomes
 * `${API}/v1/public/enquiries`. Neither set = the page says enquiries open soon.
 */
const web3formsKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? '';
const endpoint = web3formsKey ? 'https://api.web3forms.com/submit' : (process.env.NEXT_PUBLIC_ENQUIRY_ENDPOINT ?? '');

const labels: Record<Field, string> = {
  name: 'Your name',
  phone: 'Mobile number',
  email: 'Email',
  city: 'City',
  community: 'Community',
  message: 'How can we help?',
  consent: 'Consent',
};

/** Accepts "+91 98765 43210", "098765 43210", "98765-43210" and returns the 10 digits. */
export function normalisePhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

function validate(v: Record<string, string>, consent: boolean, type: EnquiryType): Errors {
  const e: Errors = {};
  if (v.name!.trim().length < 2) e.name = 'Enter your name';
  if (!/^[6-9][0-9]{9}$/.test(normalisePhone(v.phone!))) e.phone = 'Enter a 10-digit mobile number that starts with 6, 7, 8 or 9';
  if (v.email!.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email!.trim())) e.email = 'Enter a valid email address, or leave it empty';
  // Job seekers only need a name and number; HR calls them for the rest.
  if (type !== 'careers' && v.message!.trim().length < 5) e.message = 'Tell us a little more, at least a few words';
  if (!consent) e.consent = 'Please agree so we can contact you about this enquiry';
  return e;
}

export function EnquiryForm() {
  const [type, setType] = useState<EnquiryType>('resident');
  const [values, setValues] = useState({ name: '', phone: '', email: '', city: '', community: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t && enquiryTypes.some((x) => x.value === t)) setType(t as EnquiryType);
  }, []);

  useEffect(() => {
    if (reference !== null) doneRef.current?.focus();
  }, [reference]);

  const update = (k: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k as Field]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const blurCheck = (k: Field) => () => {
    const found = validate(values, true, type)[k];
    if (found && (values as Record<string, string>)[k]) setErrors((er) => ({ ...er, [k]: found }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    const found = validate(values, consent, type);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSending(true);
    const label = enquiryTypes.find((x) => x.value === type)!.label;
    const body = {
      name: values.name.trim(),
      phone: normalisePhone(values.phone),
      ...(values.email.trim() && { email: values.email.trim() }),
      ...(values.city.trim() && { city: values.city.trim() }),
      ...(values.community.trim() && { community: values.community.trim() }),
      message: `[${label}] ${values.message.trim() || 'Please call me back.'}`,
      consent: true,
      website: values.website,
    };
    // Honeypot filled: a bot. Look successful, send nothing.
    if (values.website) {
      setSending(false);
      setReference('');
      return;
    }
    const payload = web3formsKey
      ? {
          access_key: web3formsKey,
          subject: `Nestovin enquiry: ${label}`,
          from_name: 'Nestovin website',
          'Enquiry type': label,
          name: body.name,
          'Mobile number': body.phone,
          ...(body.email && { email: body.email }),
          ...(body.city && { City: body.city }),
          ...(body.community && { [type === 'careers' ? 'Area' : 'Community']: body.community }),
          message: values.message.trim() || 'Please call me back.',
          'Consent to contact': 'Yes',
        }
      : { ...body, type, submittedAt: new Date().toISOString() };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const ok = res.ok ? ((await res.clone().json().catch(() => ({}))) as { success?: boolean }).success !== false : false;
      if (ok) {
        const data = (await res.json().catch(() => ({}))) as { reference?: string };
        setReference(data.reference ?? '');
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: { fields?: { path: string; message: string }[]; details?: { path: string; message: string }[] } } | null;
      if (res.status === 429) {
        setFormError('Too many enquiries from this connection. Please wait a while and try again.');
      } else if ((data?.error?.fields ?? data?.error?.details)?.length) {
        const fe: Errors = {};
        for (const d of (data!.error!.fields ?? data!.error!.details)!) if (fieldOrder.includes(d.path as Field)) fe[d.path as Field] = d.message;
        setErrors(fe);
        setFormError('Please check the fields marked below.');
      } else {
        setFormError('We could not send your enquiry just now. Please try again in a minute.');
      }
    } catch {
      setFormError('We could not reach Nestovin. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (reference !== null) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="rounded-xl border border-line bg-surface p-8 outline-none md:p-10">
        <span className="grid size-14 place-items-center rounded-full bg-success-bg text-success">
          <Check size={28} strokeWidth={2.4} aria-hidden />
        </span>
        <h2 className="mt-6 text-[28px] leading-9 font-semibold">Thank you, we have your enquiry</h2>
        <p className="mt-3 text-[17px] leading-7 text-ink-2">
          Someone from Nestovin will call you on the number you gave us.
          {reference && (
            <>
              {' '}Your reference is <strong className="text-charcoal tabular-nums">{reference}</strong>. Keep it handy if you write to us.
            </>
          )}
        </p>
        <p className="mt-3 text-[15px] leading-6 text-ink-2">This is an enquiry, not a booking. Plans and bookings happen in the Nestovin app once your community is live.</p>
        <Link href="/" className={`${buttonClass('secondary')} mt-8`}>
          Back to the home page
        </Link>
      </div>
    );
  }

  if (!endpoint) return <NotOpenYet />;

  const errorList = fieldOrder.filter((f) => errors[f]);

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-xl border border-line bg-surface p-6 md:p-10" aria-busy={sending}>
      {errorList.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-8 rounded-md bg-error-bg p-4 text-[15px] text-error outline-none">
          <p className="font-semibold">Please fix {errorList.length === 1 ? 'this' : 'these'} to send your enquiry:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorList.map((f) => (
              <li key={f}>
                <a href={`#f-${f}`} className="underline">
                  {labels[f]}: {errors[f]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend className="font-display text-[17px] font-semibold text-charcoal">What is this about?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {enquiryTypes.map((t) => {
            const Icon = typeIcon[t.value];
            const on = type === t.value;
            return (
              <label
                key={t.value}
                className={`relative flex min-h-[68px] cursor-pointer items-center gap-3.5 rounded-lg border-2 px-4 py-3 text-[15px] transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-deep ${
                  on ? 'border-teal bg-canvas font-semibold text-charcoal' : 'border-line text-ink-2 hover:border-muted'
                }`}
              >
                <input type="radio" name="type" value={t.value} checked={on} onChange={() => setType(t.value)} className="sr-only" />
                <span className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? 'bg-teal text-white' : 'bg-subtle text-teal'}`}>
                  <Icon size={19} aria-hidden />
                </span>
                <span className="flex-1">{t.label}</span>
                <span className={`grid size-5 place-items-center rounded-full border-2 transition-colors ${on ? 'border-teal bg-teal text-white' : 'border-line'}`} aria-hidden>
                  {on && <Check size={12} strokeWidth={3.2} />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <FieldBox id="name" label={labels.name} error={errors.name} required>
          <input id="f-name" autoComplete="name" value={values.name} onChange={update('name')} onBlur={blurCheck('name')} {...aria('name', errors, false)} className={inputCls(errors.name)} />
        </FieldBox>
        <FieldBox id="phone" label={labels.phone} hint="Your 10-digit mobile. We will call you on this number." error={errors.phone} required>
          <input id="f-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} value={values.phone} onChange={update('phone')} onBlur={blurCheck('phone')} {...aria('phone', errors, true)} className={inputCls(errors.phone)} />
        </FieldBox>
        <FieldBox id="email" label={labels.email} hint="Optional" error={errors.email}>
          <input id="f-email" type="email" autoComplete="email" value={values.email} onChange={update('email')} onBlur={blurCheck('email')} {...aria('email', errors, true)} className={inputCls(errors.email)} />
        </FieldBox>
        <FieldBox id="city" label={labels.city} hint="Optional" error={errors.city}>
          <input id="f-city" autoComplete="address-level2" value={values.city} onChange={update('city')} {...aria('city', errors, true)} className={inputCls(errors.city)} />
        </FieldBox>
        <div className="sm:col-span-2">
          <FieldBox id="community" label={type === 'careers' ? 'Area where you live' : 'Community or society name'} hint="Optional" error={errors.community}>
            <input id="f-community" value={values.community} onChange={update('community')} {...aria('community', errors, true)} className={inputCls(errors.community)} />
          </FieldBox>
        </div>
        <div className="sm:col-span-2">
          <FieldBox
            id="message"
            label={type === 'careers' ? 'Anything you want us to know' : labels.message}
            hint={
              type === 'careers'
                ? 'Optional. Which work you want to do and any experience. Our HR team will ask the rest on the call.'
                : type === 'community'
                  ? 'Your role in the community and roughly how many flats it has.'
                  : 'For example: a cook for two meals a day, or help for a parent in the evenings.'
            }
            error={errors.message}
            required={type !== 'careers'}
          >
            <textarea id="f-message" rows={5} maxLength={1900} value={values.message} onChange={update('message')} onBlur={blurCheck('message')} {...aria('message', errors, true)} className={`${inputCls(errors.message)} min-h-[140px] py-3`} />
          </FieldBox>
        </div>
      </div>

      {/* Honeypot: hidden from people and assistive tech */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor="f-website">Website</label>
        <input id="f-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={update('website')} />
      </div>

      <div className="mt-6">
        <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-6 text-ink-2">
          <input
            id="f-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (errors.consent) setErrors((er) => ({ ...er, consent: undefined }));
            }}
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? 'e-consent' : undefined}
            className="mt-1 size-[18px] shrink-0 accent-[var(--nv-teal-action)]"
          />
          <span>
            Nestovin may contact me by phone, SMS or email about this enquiry. Read the{' '}
            <Link href="/privacy" className="font-medium text-teal underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {errors.consent && (
          <p id="e-consent" className="mt-2 pl-[30px] text-[14px] text-error">
            {errors.consent}
          </p>
        )}
      </div>

      {formError && (
        <p className="mt-6 rounded-md bg-error-bg px-4 py-3 text-[15px] text-error" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" disabled={sending} className={`${buttonClass('primary')} mt-8 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto`}>
        {sending ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden /> Sending
          </>
        ) : type === 'careers' ? (
          'Send your details'
        ) : (
          'Send an enquiry'
        )}
      </button>
    </form>
  );
}

/** Shown in place of the form until the owner sets NEXT_PUBLIC_ENQUIRY_ENDPOINT, before anyone types. */
function NotOpenYet() {
  const { phone, whatsapp, hours } = site.contact;
  return (
    <div className="rounded-xl border border-line bg-surface p-8 md:p-10" role="status">
      <span className="grid size-14 place-items-center rounded-full bg-canvas text-teal">
        <Clock3 size={26} aria-hidden />
      </span>
      <h2 className="mt-6 text-[26px] leading-9 font-semibold md:text-[30px]">Online enquiries open in the next few days</h2>
      <p className="mt-3 max-w-[520px] text-[17px] leading-7 text-ink-2">
        We are getting the team ready to read and answer every enquiry personally.
        {phone || whatsapp ? ' Until then, you can reach us directly.' : ' Please check back soon.'}
      </p>
      {(phone || whatsapp) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, '')}`} className={buttonClass('primary')}>
              <Phone size={18} aria-hidden /> Call {phone}
            </a>
          )}
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp}`} className={buttonClass('secondary')} rel="noopener noreferrer" target="_blank">
              <MessageCircle size={18} aria-hidden /> WhatsApp us
            </a>
          )}
        </div>
      )}
      <p className="mt-6 text-[15px] text-ink-2">Our hours: {hours}.</p>
    </div>
  );
}

function inputCls(error?: string) {
  return `block min-h-[52px] w-full rounded-sm border bg-surface px-4 text-[16px] text-ink transition-[border-color,box-shadow] duration-150 outline-none focus:border-teal focus:ring-3 focus:ring-brand/20 ${
    error ? 'border-error' : 'border-line hover:border-muted'
  }`;
}

function aria(k: Field, errors: Errors, hasHint: boolean) {
  const ids = [errors[k] ? `e-${k}` : '', hasHint && !errors[k] ? `h-${k}` : ''].filter(Boolean).join(' ');
  return { 'aria-invalid': !!errors[k], 'aria-describedby': ids || undefined };
}

function FieldBox({ id, label, hint, error, required, children }: { id: Field; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={`f-${id}`} className="block text-[14px] font-medium text-charcoal">
        {label}
        {required && <span className="text-error"> *</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`e-${id}`} className="mt-1.5 text-[14px] text-error">{error}</p>
      ) : (
        hint && <p id={`h-${id}`} className="mt-1.5 text-[14px] text-ink-2">{hint}</p>
      )}
    </div>
  );
}
