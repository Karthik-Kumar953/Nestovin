'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminTicket, TicketStatus } from '@nestovin/contracts';
import { ExportButton } from '../../components/ExportButton';
import { useQueueCounts } from '../../components/Layout';
import { api, ApiError, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useNavigate } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  Facts,
  FilterSelect,
  formatDate,
  formatDateTime,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
  Toolbar,
  useToast,
} from '../../components/ui';
import { ClockAlert, Inbox, OctagonAlert, Plus, Tag, TriangleAlert } from '../../components/icons';
import { EscalationBadge, isFinished, PRIORITY_OPTIONS, PriorityText, TICKET_STATUS_LABEL, TicketStatusBadge, useTicketCategories } from './shared';

export { EscalationBadge, TICKET_STATUS_LABEL, TicketStatusBadge, useTicketCategories } from './shared';

type View = 'open' | 'mine' | 'escalated' | 'all';
const STATUS_OPTIONS = (Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }));

/** ADM-13 support queue: urgent tickets first; deadlines count working days (ADR-014). */
export function TicketsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('open');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categories = useTicketCategories();
  const { dashboard } = useQueueCounts();

  // A chosen status replaces the "open only" flag so e.g. Resolved can be picked from any view.
  const flags = view === 'open' ? { open: status ? undefined : 'true' } : view === 'mine' ? { mine: 'true', open: status ? undefined : 'true' } : view === 'escalated' ? { escalated: 'true' } : {};
  const list = usePagedList<AdminTicket>(['tickets'], `/v1/admin/tickets${qs({ ...flags, status, categoryId, priority, limit: 50 })}`);
  const rows = list.rows;
  const [managing, setManaging] = useState(false);

  const queues = dashboard.data?.sections.queues?.data?.items;
  const qn = (k: string) => queues?.find((q) => q.key === k)?.count ?? null;
  const overdue = qn('tickets_overdue');
  const escalated = qn('tickets_escalated');
  const filtered = Boolean(status || priority || categoryId);

  return (
    <>
      <PageHeader
        title="Support tickets"
        description="Issues raised by residents in your clusters. Urgent tickets are listed first; deadlines skip Sundays and holidays."
        actions={
          <>
            <ExportButton path="/v1/admin/exports/tickets" module="support" fileName="tickets.csv" />
            {can(me, 'support', 'edit') ? (
              <Button variant="secondary" icon={Tag} onClick={() => setManaging(true)}>
                Categories
              </Button>
            ) : null}
          </>
        }
      />
      {queues ? (
        <Facts
          items={[
            { label: 'Open', value: qn('tickets_open') ?? '—', icon: Inbox },
            { label: 'Overdue', value: overdue ?? '—', tone: overdue ? 'red' : undefined, icon: ClockAlert, note: overdue ? 'Past their working-day deadline' : undefined },
            { label: 'Escalated', value: escalated ?? '—', tone: escalated ? 'amber' : undefined, icon: TriangleAlert },
          ]}
        />
      ) : null}
      <Tabs
        label="View"
        value={view}
        onChange={setView}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'mine', label: 'Assigned to me' },
          { value: 'escalated', label: 'Escalated' },
          { value: 'all', label: 'All tickets' },
        ]}
      />
      <Toolbar>
        <FilterSelect value={status} onChange={setStatus} label="Status" options={STATUS_OPTIONS} />
        <FilterSelect value={priority} onChange={setPriority} label="Priority" options={PRIORITY_OPTIONS} />
        <FilterSelect value={categoryId} onChange={setCategoryId} label="Category" options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatus('');
              setPriority('');
              setCategoryId('');
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Support tickets"
          loading={list.isLoading}
          error={list.error}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={(t) => navigate(`/support/tickets/${t.id}`)}
          emptyTitle={filtered ? 'No tickets match these filters' : view === 'mine' ? 'Nothing assigned to you' : 'No tickets'}
          emptyBody={
            filtered ? (
              'Try clearing a filter.'
            ) : view === 'open' ? (
              'There are no open tickets right now.'
            ) : undefined
          }
          columns={[
            {
              header: 'Ticket',
              cell: (t) => (
                <span className="primary-cell">
                  {t.urgent ? (
                    <>
                      <span className="badge badge-error">
                        <OctagonAlert size={12} aria-hidden /> Urgent
                      </span>{' '}
                    </>
                  ) : null}
                  {t.subject}
                  <span className="sub">
                    {t.reference} · {t.categoryName} · {formatDate(t.createdAt)}
                  </span>
                </span>
              ),
            },
            {
              header: 'Resident',
              cell: (t) => (
                <span className="primary-cell">
                  {t.resident.fullName ?? t.resident.phone}
                  <span className="sub">{t.flat ? `${t.flat.towerName} · ${t.flat.flatNumber}, ${t.flat.communityName}` : 'No residence'}</span>
                </span>
              ),
            },
            {
              header: 'Status',
              cell: (t) => (
                <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  <TicketStatusBadge status={t.status} />
                  <EscalationBadge level={t.escalationLevel} />
                </span>
              ),
            },
            { header: 'Priority', cell: (t) => <PriorityText priority={t.priority} /> },
            {
              header: 'Due',
              cell: (t) =>
                isFinished(t.status) || !t.dueAt ? (
                  <span className="faint">—</span>
                ) : t.overdue ? (
                  <span className="badge badge-error" title={`Was due ${formatDateTime(t.dueAt)}`}>
                    <ClockAlert size={12} aria-hidden /> Overdue
                  </span>
                ) : (
                  formatDateTime(t.dueAt)
                ),
            },
            {
              header: 'Owner',
              cell: (t) =>
                t.ownerName ?? (
                  <span className="chip" style={{ borderStyle: 'dashed' }}>
                    Unassigned
                  </span>
                ),
            },
          ]}
          footer={
            list.hasMore ? (
              <div className="row-between">
                <span />
                {list.hasMore ? (
                  <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                    Load more
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        />
      </Panel>
      {managing ? <CategoriesDialog onClose={() => setManaging(false)} /> : null}
    </>
  );
}

function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useTicketCategories();
  const [name, setName] = useState('');
  const save = useMutation({
    mutationFn: (v: { id?: string; name: string; status?: 'ACTIVE' | 'INACTIVE' }) =>
      v.id
        ? api(`/v1/admin/ticket-categories/${v.id}`, { method: 'PATCH', body: { name: v.name, status: v.status } })
        : api('/v1/admin/ticket-categories', { method: 'POST', body: { name: v.name } }),
    onSuccess: async (_d, v) => {
      setName('');
      toast(v.id ? (v.status === 'ACTIVE' ? 'Category activated' : 'Category deactivated') : 'Category added');
      await qc.invalidateQueries({ queryKey: ['ticket-categories'] });
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal open title="Ticket categories" onClose={onClose}>
      <div className="stack">
        <p className="muted">Residents pick one of the active categories when they raise a ticket. Inactive categories stay on existing tickets.</p>
        <DataTable
          caption="Ticket categories"
          loading={categories.isLoading}
          error={categories.error}
          rows={categories.data?.items}
          rowKey={(c) => c.id}
          emptyTitle="No categories yet"
          emptyBody="Add the first category below."
          columns={[
            { header: 'Category', cell: (c) => c.name },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (c) => (
                <Button
                  variant="ghost"
                  size="sm"
                  busy={save.isPending && save.variables?.id === c.id}
                  onClick={() => save.mutate({ id: c.id, name: c.name, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                >
                  {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              ),
            },
          ]}
        />
        <form
          className="row"
          style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ name });
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <TextInput label="New category" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} />
          </div>
          <Button type="submit" icon={Plus} busy={save.isPending && !save.variables?.id} disabled={name.trim().length < 2}>
            Add
          </Button>
        </form>
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

export function PrioritySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <SelectInput label="Priority" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} options={PRIORITY_OPTIONS} />;
}
