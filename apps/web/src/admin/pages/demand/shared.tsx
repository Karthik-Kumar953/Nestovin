'use client';

import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSearchParams } from '../../lib/router';
import { useToast } from '../../components/ui';
import { Check, Copy } from '../../components/icons';

export interface CommunityOption {
  id: string;
  name: string;
  status: string;
}

export function useCommunityOptions() {
  return useQuery({
    queryKey: ['community-options'],
    queryFn: () => api<{ items: CommunityOption[] }>('/v1/admin/community-options'),
  });
}

/** Selected community kept in the URL (?communityId=) so pages are linkable. */
export function useSelectedCommunity(): [string, (id: string) => void, CommunityOption[] | undefined, boolean] {
  const [params, setParams] = useSearchParams();
  const options = useCommunityOptions();
  const items = options.data?.items;
  const selected = params.get('communityId') ?? items?.find((c) => c.status === 'ACTIVE')?.id ?? items?.[0]?.id ?? '';
  const set = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('communityId', id);
    setParams(next, { replace: true });
  };
  return [selected, set, items, options.isLoading];
}

export function CommunityPicker({ value, onChange, options }: { value: string; onChange: (id: string) => void; options: CommunityOption[] | undefined }) {
  return (
    <select className="input input-compact" aria-label="Community" value={value} onChange={(e) => onChange(e.target.value)}>
      {(options ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.status !== 'ACTIVE' ? ` (${c.status.toLowerCase()})` : ''}
        </option>
      ))}
    </select>
  );
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function daysLabel(mask: number): string {
  if (mask === 127) return 'Every day';
  if (mask === 63) return 'Mon–Sat';
  if (mask === 31) return 'Mon–Fri';
  return DAYS.filter((_, i) => mask & (1 << i)).join(', ');
}

export function DaysInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="field">
      <legend className="field-label">Days</legend>
      <div className="row">
        {DAYS.map((d, i) => (
          <label key={d} className="checkbox">
            <input type="checkbox" checked={Boolean(value & (1 << i))} onChange={(e) => onChange(e.target.checked ? value | (1 << i) : value & ~(1 << i))} />
            <span>{d}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** datetime-local value (local time) <-> ISO string with offset. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  COMMITTED: 'Paid commitment',
  BALANCE_DUE: 'Balance due',
  CONVERTED: 'Booked',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  REVIEW_REQUIRED: 'Needs review',
};

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REVIEW_REQUIRED: 'Needs review',
};

export function toneOf(status: string): string {
  if (['CONFIRMED', 'CONVERTED', 'PAID', 'PUBLISHED', 'ACTIVE', 'COMMITTED', 'SLOTS_PUBLISHED'].includes(status)) return 'success';
  if (['REVIEW_REQUIRED', 'FAILED'].includes(status)) return 'error';
  if (['AWAITING_PAYMENT', 'PENDING_PAYMENT', 'BALANCE_DUE', 'CREATED', 'OPEN'].includes(status)) return 'warning';
  return 'neutral';
}

export function Pill({ status, label }: { status: string; label?: string | undefined }) {
  const text = label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={`badge badge-${toneOf(status)}`}>{text}</span>;
}

/* ---------- Local primitives for the demand and finance screens ---------- */

export interface Stage {
  key: string;
  label: string;
  note?: string | undefined;
}

/**
 * Horizontal stage indicator (Draft → Published → …). Done stages are teal with a tick,
 * the current stage has a teal ring, later stages are hairline. `halted` greys every stage
 * (e.g. a cancelled cycle) and the caller explains why next to it.
 */
export function StageIndicator({ stages, current, halted, label }: { stages: Stage[]; current: string; halted?: boolean; label: string }) {
  const at = stages.findIndex((s) => s.key === current);
  return (
    <ol aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 0' }}>
      {stages.map((s, i) => {
        const done = !halted && i < at;
        const now = !halted && i === at;
        return (
          <Fragment key={s.key}>
            {i > 0 ? (
              <li aria-hidden style={{ flex: '1 1 16px', minWidth: 16, maxWidth: 72, height: 2, margin: '0 8px', background: done || now ? 'var(--teal)' : 'var(--rule)' }} />
            ) : null}
            <li aria-current={now ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  flex: 'none',
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--r-full)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: done ? 'var(--teal)' : now ? 'var(--teal-tint)' : 'var(--surface)',
                  color: done ? 'var(--surface)' : now ? 'var(--teal-ink)' : 'var(--muted)',
                  border: `2px solid ${done || now ? 'var(--teal)' : 'var(--rule-strong)'}`,
                }}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontWeight: now ? 600 : 500, color: now ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--muted)', fontSize: 13.5 }}>
                  {s.label}
                  <span className="sr-only">{done ? ' (done)' : now ? ' (current stage)' : ' (not reached)'}</span>
                </span>
                {s.note ? <span className="faint" style={{ fontSize: 12 }}>{s.note}</span> : null}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Shortened provider id (e.g. pay_…9xQz) that copies the full value on click. */
export function CopyId({ value, label = 'payment id' }: { value: string; label?: string }) {
  const toast = useToast();
  const short = value.length > 14 ? `${value.slice(0, value.indexOf('_') > 0 && value.indexOf('_') < 6 ? value.indexOf('_') + 1 : 4)}…${value.slice(-6)}` : value;
  return (
    <button
      type="button"
      className="chip"
      title={`${value} (click to copy)`}
      aria-label={`Copy ${label} ${value}`}
      style={{ cursor: 'pointer', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(
          () => toast(`Copied ${label}`),
          () => toast(`Could not copy the ${label}`, 'error'),
        );
      }}
    >
      {short}
      <Copy size={12} aria-hidden />
    </button>
  );
}

/** Inline horizontal bars (uses the shared .bar-list styles). */
export function BarRows({ rows, label }: { rows: { key: string; name: string; sub?: string | undefined; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bar-list" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(60px, 1fr) 44px' }}>
          <span style={{ minWidth: 0 }}>
            {r.name}
            {r.sub ? <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.sub}</span> : null}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ display: 'block', width: `${(r.value / max) * 100}%` }} />
          </span>
          <strong className="num" style={{ textAlign: 'right' }}>
            {r.value}
          </strong>
        </li>
      ))}
    </ul>
  );
}

/** "2026-11" -> "Nov 2026" (falls back to the raw value). */
export function monthLabel(m: string, style: 'short' | 'long' = 'short'): string {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return new Intl.DateTimeFormat('en-IN', { month: style, year: 'numeric' }).format(new Date(`${m}-01T00:00:00`));
}
