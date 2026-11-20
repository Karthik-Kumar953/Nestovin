'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTicket, TicketCategory, TicketStatus } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link } from '../../lib/router';
import { Button, DataTable, ErrorBanner, FilterSelect, formatDateTime, Modal, PageHeader, SelectInput, StatusBadge, TextInput, Toolbar } from '../../components/ui';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting on resident',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const tone = status === 'OPEN' ? 'warning' : status === 'RESOLVED' || status === 'CLOSED' ? 'neutral' : 'info';
  return <span className={`badge badge-${tone}`}>{TICKET_STATUS_LABEL[status]}</span>;
}

export function EscalationBadge({ level }: { level: 'NONE' | 'CLUSTER_ADMIN' | 'SUPER_ADMIN' }) {
  if (level === 'NONE') return null;
  return <span className="badge badge-warning">{level === 'CLUSTER_ADMIN' ? 'With Cluster Admin' : 'With Super Admin'}</span>;
}

export function useTicketCategories() {
  return useQuery({ queryKey: ['ticket-categories'], queryFn: () => api<{ items: TicketCategory[] }>('/v1/admin/ticket-categories') });
}

/** ADM-13 support queue. Escalation and working-day deadlines arrive in Phase 7. */
export function TicketsPage() {
  const me = useMe();
  const [view, setView] = useState('open');
  const [categoryId, setCategoryId] = useState('');
  const categories = useTicketCategories();
  const filters =
    view === 'open' ? { open: 'true' } : view === 'mine' ? { mine: 'true', open: 'true' } : view === 'escalated' ? { escalated: 'true' } : view === 'all' ? {} : { status: view };
  const list = usePagedList<AdminTicket>(['tickets'], `/v1/admin/tickets${qs({ ...filters, categoryId, limit: 50 })}`);
  const [managing, setManaging] = useState(false);

  return (
    <>
      <PageHeader
        title="Support tickets"
        description="Issues raised by residents in your clusters. Urgent tickets are listed first."
        actions={
          can(me, 'support', 'edit') ? (
            <Button variant="secondary" onClick={() => setManaging(true)}>
              Categories
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <select className="input input-compact" aria-label="View" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="open">Open tickets</option>
          <option value="mine">Assigned to me</option>
          <option value="escalated">Escalated</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
          <option value="all">All tickets</option>
        </select>
        <FilterSelect
          value={categoryId}
          onChange={setCategoryId}
          label="Category"
          options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
      </Toolbar>
      <DataTable
        caption="Support tickets"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(t) => t.id}
        emptyTitle="No tickets"
        emptyBody={view === 'open' ? 'There are no open tickets right now.' : undefined}
        columns={[
          {
            header: 'Ticket',
            cell: (t) => (
              <>
                <Link to={`/support/tickets/${t.id}`}>
                  <strong>{t.subject}</strong>
                </Link>
                <div className="muted">
                  {t.reference} · {t.categoryName}
                  {t.urgent ? (
                    <>
                      {' '}
                      · <span className="badge badge-error">Urgent</span>
                    </>
                  ) : null}
                </div>
              </>
            ),
          },
          {
            header: 'Resident',
            cell: (t) => (
              <>
                <div>{t.resident.fullName ?? t.resident.phone}</div>
                <div className="muted">{t.flat ? `${t.flat.communityName} · ${t.flat.towerName} · ${t.flat.flatNumber}` : 'No residence'}</div>
              </>
            ),
          },
          {
            header: 'Status',
            cell: (t) => (
              <>
                <TicketStatusBadge status={t.status} />
                {t.escalationLevel !== 'NONE' ? <div><EscalationBadge level={t.escalationLevel} /></div> : null}
                {t.overdue ? <div><span className="badge badge-error">Overdue</span></div> : t.dueAt && !['RESOLVED', 'CLOSED'].includes(t.status) ? <div className="muted">Due {formatDateTime(t.dueAt)}</div> : null}
              </>
            ),
          },
          { header: 'Owner', cell: (t) => t.ownerName ?? <span className="muted">Unassigned</span> },
          { header: 'Raised', cell: (t) => formatDateTime(t.createdAt) },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      {managing ? <CategoriesDialog onClose={() => setManaging(false)} /> : null}
    </>
  );
}

function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const categories = useTicketCategories();
  const [name, setName] = useState('');
  const save = useMutation({
    mutationFn: (v: { id?: string; name: string; status?: 'ACTIVE' | 'INACTIVE' }) =>
      v.id
        ? api(`/v1/admin/ticket-categories/${v.id}`, { method: 'PATCH', body: { name: v.name, status: v.status } })
        : api('/v1/admin/ticket-categories', { method: 'POST', body: { name: v.name } }),
    onSuccess: async () => {
      setName('');
      await qc.invalidateQueries({ queryKey: ['ticket-categories'] });
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal open title="Ticket categories" onClose={onClose}>
      <p className="muted">Residents pick one of the active categories when they raise a ticket.</p>
      <DataTable
        caption="Ticket categories"
        loading={categories.isLoading}
        error={categories.error}
        rows={categories.data?.items}
        rowKey={(c) => c.id}
        columns={[
          { header: 'Category', cell: (c) => c.name },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (c) => (
              <Button variant="ghost" onClick={() => save.mutate({ id: c.id, name: c.name, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
            ),
          },
        ]}
      />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name });
        }}
      >
        <TextInput label="New category" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} />
        <Button type="submit" busy={save.isPending} disabled={name.trim().length < 2}>
          Add
        </Button>
      </form>
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}

export function PrioritySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <SelectInput
      label="Priority"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: 'LOW', label: 'Low' },
        { value: 'NORMAL', label: 'Normal' },
        { value: 'HIGH', label: 'High' },
      ]}
    />
  );
}
