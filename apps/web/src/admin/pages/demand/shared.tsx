'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSearchParams } from '../../lib/router';

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
