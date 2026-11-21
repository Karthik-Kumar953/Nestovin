'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { DocumentUrl, Membership } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui';

/** Shared bits for the resident queues (ADM-05, ADM-06, RES-14). */

export function flatLabel(m: Pick<Membership, 'flatNumber' | 'towerName' | 'communityName'>): string {
  return `${m.communityName} · ${m.towerName} · ${m.flatNumber}`;
}

export function roleLabel(kind: 'PRIMARY' | 'FAMILY'): string {
  return kind === 'PRIMARY' ? 'Primary Resident' : 'Family member';
}

export function occupancyLabel(o: string | null | undefined): string {
  return o === 'OWNER' ? 'Owner' : o === 'TENANT' ? 'Tenant' : o === 'FAMILY' ? 'Family' : '—';
}

export const QUEUE_LIMIT = 100;

/** Count of a queue's pending items (the list endpoints cap at 100, so "100+" when full). */
export function usePendingQueue<T extends { createdAt: string }>(key: string, path: string) {
  const q = useQuery({ queryKey: [key, 'PENDING', 'facts'], queryFn: () => api<{ items: T[] }>(path), staleTime: 30_000 });
  const items = q.data?.items;
  const count = items ? (items.length >= QUEUE_LIMIT ? `${QUEUE_LIMIT}+` : String(items.length)) : '—';
  const oldest = items?.length ? items.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt : null;
  return { items, count, n: items?.length ?? 0, oldest, isLoading: q.isLoading };
}

/** Days since an ISO timestamp, as plain English. */
export function waitingFor(iso: string | null): string {
  if (!iso) return 'Nothing waiting';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}

/** Opens a residence document through a short-lived signed URL. */
export function useOpenDocument() {
  const toast = useToast();
  return useMutation({
    mutationFn: (documentId: string) => api<DocumentUrl>(`/v1/admin/documents/${documentId}/url`, { method: 'POST' }),
    onSuccess: (d) => window.open(d.url, '_blank', 'noopener,noreferrer'),
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not open the document', 'error'),
  });
}
