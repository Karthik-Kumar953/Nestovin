'use client';

import { useQuery } from '@tanstack/react-query';
import type { TicketCategory, TicketStatus } from '@nestovin/contracts';
import { api } from '../../lib/api';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting on resident',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABEL: Record<'LOW' | 'NORMAL' | 'HIGH', string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High' };
export const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const tone = status === 'OPEN' ? 'warning' : status === 'RESOLVED' || status === 'CLOSED' ? 'neutral' : status === 'WAITING' ? 'info' : 'teal';
  return <span className={`badge badge-${tone}`}>{TICKET_STATUS_LABEL[status]}</span>;
}

export function EscalationBadge({ level }: { level: 'NONE' | 'CLUSTER_ADMIN' | 'SUPER_ADMIN' | string }) {
  if (level === 'NONE') return null;
  return <span className="badge badge-error">{level === 'CLUSTER_ADMIN' ? 'With Cluster Admin' : 'With Super Admin'}</span>;
}

export function PriorityText({ priority }: { priority: 'LOW' | 'NORMAL' | 'HIGH' }) {
  return priority === 'HIGH' ? <span className="badge badge-warning">High</span> : <span className={priority === 'LOW' ? 'muted' : undefined}>{PRIORITY_LABEL[priority]}</span>;
}

export function useTicketCategories() {
  return useQuery({ queryKey: ['ticket-categories'], queryFn: () => api<{ items: TicketCategory[] }>('/v1/admin/ticket-categories') });
}

export const isFinished = (s: TicketStatus) => s === 'RESOLVED' || s === 'CLOSED';
