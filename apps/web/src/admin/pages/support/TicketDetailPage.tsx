'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTicketDetail, PatchTicketInput, TicketAssignee, TicketContext, TicketVisit } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { Link, useParams } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import { RecordHistory } from '../../components/RecordHistory';
import {
  Button,
  ErrorBanner,
  formatDate,
  formatDateTime,
  formatPaise,
  InfoBanner,
  PageHeader,
  Panel,
  Segmented,
  SelectInput,
  Skeleton,
  StatusBadge,
  TextArea,
  useConfirm,
  useToast,
} from '../../components/ui';
import { ChevronRight, ClockAlert, Lock, Send, TriangleAlert, UserCheck, UserMinus } from '../../components/icons';
import { EscalationBadge, isFinished, PRIORITY_LABEL, PRIORITY_OPTIONS, TICKET_STATUS_LABEL, TicketStatusBadge, useTicketCategories } from './shared';

type Ticket = AdminTicketDetail;
const TRIGGER_LABEL: Record<string, string> = { OVERDUE: 'Deadline passed', URGENT: 'Marked urgent', MANUAL: 'Escalated by an admin' };

export function TicketDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const key = ['ticket', id];
  const ticket = useQuery({ queryKey: key, queryFn: () => api<Ticket>(`/v1/admin/tickets/${id}`), enabled: Boolean(id) });
  const categories = useTicketCategories();
  const edit = can(me, 'support', 'edit');

  // Write calls return the ticket without its linked context: keep the context we already have.
  const onSaved = async (t: Ticket) => {
    qc.setQueryData<Ticket>(key, (old) => ({ ...t, context: t.context ?? old?.context }));
    await qc.invalidateQueries({ queryKey: ['tickets'] });
    await qc.invalidateQueries({ queryKey: ['ticket-assignees', id] });
  };
  const patch = useMutation({
    mutationFn: (body: Omit<PatchTicketInput, 'version'>) => api<Ticket>(`/v1/admin/tickets/${id}`, { method: 'PATCH', body: { ...body, version: ticket.data!.version } }),
    onSuccess: async (t) => {
      await onSaved(t);
      toast('Ticket updated');
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') await qc.invalidateQueries({ queryKey: key });
    },
  });
  const escalate = useMutation({
    mutationFn: (reason: string) => api<Ticket>(`/v1/admin/tickets/${id}/escalate`, { method: 'POST', body: { reason } }),
    onSuccess: async (t) => {
      await onSaved(t);
      toast('Ticket escalated');
    },
  });

  if (ticket.isLoading)
    return (
      <div className="stack">
        <Skeleton height={28} width="40%" />
        <Skeleton height={240} />
      </div>
    );
  if (ticket.error || !ticket.data)
    return (
      <>
        <PageHeader title="Ticket" crumb={{ to: '/support/tickets', label: 'Support tickets' }} />
        <ErrorBanner error={ticket.error ?? new Error('Ticket not found')} />
      </>
    );
  const t = ticket.data;
  const closed = t.status === 'CLOSED';
  const finished = isFinished(t.status);
  const canEscalate = edit && !finished && t.escalationLevel !== 'SUPER_ADMIN';

  const changeStatus = async (status: Ticket['status']) => {
    if (status === 'CLOSED') {
      const r = await confirm({
        title: 'Close this ticket?',
        body: 'A closed ticket cannot be reopened. The resident can raise a new ticket if they need more help.',
        confirmLabel: 'Close ticket',
        tone: 'danger',
      });
      if (!r.ok) return;
    }
    patch.mutate({ status });
  };
  const changeUrgent = async (urgent: boolean) => {
    if (urgent && t.escalationLevel === 'NONE') {
      const r = await confirm({
        title: 'Mark this ticket urgent?',
        body: 'Urgent tickets go straight to the Cluster Admin: the ticket is escalated and they are notified.',
        confirmLabel: 'Mark urgent',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    patch.mutate({ urgent });
  };
  const onEscalate = async () => {
    const to = t.escalationLevel === 'NONE' ? 'Cluster Admin' : 'Super Admin';
    const r = await confirm({
      title: `Escalate to the ${to}?`,
      body: `The ${to} is notified and the escalation is recorded on the ticket. Support keeps tracking the ticket after escalation.`,
      confirmLabel: `Escalate to ${to}`,
      tone: 'warning',
      reason: { label: 'Escalation reason', required: true, minLength: 3 },
    });
    if (r.ok) escalate.mutate(r.reason);
  };

  return (
    <>
      <PageHeader
        crumb={{ to: '/support/tickets', label: 'Support tickets' }}
        title={t.subject}
        description={`${t.reference} · ${t.categoryName} · raised ${formatDateTime(t.createdAt)}`}
        actions={
          canEscalate ? (
            <Button variant="secondary" icon={TriangleAlert} busy={escalate.isPending} onClick={onEscalate}>
              Escalate
            </Button>
          ) : null
        }
      />
      <div className="split">
        <div className="stack">
          <ErrorBanner error={escalate.error} />
          <Conversation ticket={t} canPost={edit && !closed} onSaved={onSaved} />
          <RecordHistory targetType="support_ticket" targetId={t.id} />
        </div>

        <aside className="stack">
          <Panel
            title="Ticket"
            actions={
              <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                <TicketStatusBadge status={t.status} />
                {t.urgent ? <span className="badge badge-error">Urgent</span> : null}
                <EscalationBadge level={t.escalationLevel} />
              </span>
            }
          >
            <div className="stack">
              {t.dueAt && !finished ? (
                t.overdue ? (
                  <div className="banner banner-error">
                    <ClockAlert size={16} />
                    <div>Overdue since {formatDateTime(t.dueAt)}</div>
                  </div>
                ) : (
                  <p className="muted">Escalates if unresolved by {formatDateTime(t.dueAt)}</p>
                )
              ) : null}
              <ErrorBanner error={patch.error} />
              {edit && !closed ? (
                <>
                  <SelectInput
                    label="Status"
                    value={t.status}
                    disabled={patch.isPending}
                    onChange={(e) => void changeStatus(e.target.value as Ticket['status'])}
                    options={[t.status, ...t.allowedStatuses].map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))}
                  />
                  <SelectInput
                    label="Priority"
                    value={t.priority}
                    disabled={patch.isPending}
                    onChange={(e) => patch.mutate({ priority: e.target.value as Ticket['priority'] })}
                    options={PRIORITY_OPTIONS}
                  />
                  <SelectInput
                    label="Category"
                    value={t.categoryId}
                    disabled={patch.isPending}
                    onChange={(e) => patch.mutate({ categoryId: e.target.value })}
                    options={(categories.data?.items ?? [{ id: t.categoryId, name: t.categoryName, status: 'ACTIVE' as const, sort: 0 }]).map((c) => ({
                      value: c.id,
                      label: c.status === 'INACTIVE' ? `${c.name} (inactive)` : c.name,
                    }))}
                  />
                  <label className="checkbox">
                    <input type="checkbox" checked={t.urgent} disabled={patch.isPending} onChange={(e) => void changeUrgent(e.target.checked)} />
                    <span>Urgent</span>
                  </label>
                </>
              ) : (
                <dl className="kv">
                  <dt>Category</dt>
                  <dd>{t.categoryName}</dd>
                  <dt>Priority</dt>
                  <dd>{PRIORITY_LABEL[t.priority]}</dd>
                </dl>
              )}
              {closed ? <InfoBanner>This ticket is closed. The resident can raise a new ticket if needed.</InfoBanner> : null}
            </div>
          </Panel>

          <OwnerPanel ticket={t} edit={edit} patch={patch} onSaved={onSaved} />

          {t.escalations.length ? (
            <Panel title="Escalation history">
              <ol className="timeline">
                {t.escalations.map((e) => (
                  <li key={e.at} className="timeline-item">
                    <div className="row-between">
                      <strong>To {e.level === 'CLUSTER_ADMIN' ? 'Cluster Admin' : 'Super Admin'}</strong>
                      <span className="faint">{formatDateTime(e.at)}</span>
                    </div>
                    <div className="muted">
                      {TRIGGER_LABEL[e.trigger] ?? e.trigger.toLowerCase()} · {e.notified} notified
                    </div>
                    {e.reason ? <p>{e.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}

          <LinkedContext ticket={t} />
        </aside>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- conversation */

function Conversation({ ticket: t, canPost, onSaved }: { ticket: Ticket; canPost: boolean; onSaved: (t: Ticket) => Promise<void> }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'RESIDENT' | 'INTERNAL'>('RESIDENT');
  const post = useMutation({
    mutationFn: () => api<Ticket>(`/v1/admin/tickets/${t.id}/updates`, { method: 'POST', body: { body, visibility } }),
    onSuccess: async (next) => {
      setBody('');
      await onSaved(next);
      toast(visibility === 'RESIDENT' ? 'Reply sent' : 'Note added');
    },
  });
  const err = post.error instanceof ApiError ? post.error : null;
  const author = (u: Ticket['updates'][number]) =>
    u.authorKind === 'system' ? 'System' : (u.authorName ?? (u.authorKind === 'resident' ? (t.resident.fullName ?? 'Resident') : 'Admin'));

  return (
    <Panel title="Conversation" subtitle="Internal notes are only visible to admins.">
      <ol className="timeline">
        <li className="timeline-item">
          <div className="row-between">
            <strong>{t.resident.fullName ?? 'Resident'}</strong>
            <span className="faint">{formatDateTime(t.createdAt)}</span>
          </div>
          <div className="muted">Raised the ticket</div>
          <p className="prewrap">{t.description}</p>
        </li>
        {t.updates.map((u) => {
          const internal = u.visibility === 'INTERNAL';
          return (
            <li key={u.id} className={`timeline-item ${internal ? 'timeline-internal' : ''}`}>
              <div className="row-between">
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <strong>{author(u)}</strong>
                  {internal ? (
                    <span className="badge badge-warning">
                      <Lock size={11} aria-hidden /> Internal note
                    </span>
                  ) : u.authorKind === 'admin' ? (
                    <span className="faint">Reply to resident</span>
                  ) : null}
                </span>
                <span className="faint">{formatDateTime(u.createdAt)}</span>
              </div>
              <p className="prewrap">{u.body}</p>
            </li>
          );
        })}
      </ol>
      {t.updates.length === 0 ? <p className="muted">No replies yet.</p> : null}
      {canPost ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
        >
          <Segmented
            label="Message type"
            value={visibility}
            onChange={setVisibility}
            items={[
              { value: 'RESIDENT', label: 'Reply to resident' },
              { value: 'INTERNAL', label: 'Internal note' },
            ]}
          />
          <TextArea
            label={visibility === 'RESIDENT' ? 'Reply' : 'Note'}
            hint={visibility === 'RESIDENT' ? 'The resident sees this in the app, signed as Nestovin Support.' : 'Only admins see internal notes.'}
            value={body}
            rows={4}
            onChange={(e) => setBody(e.target.value)}
            error={err?.field('body')}
          />
          <ErrorBanner error={err?.fields.length ? null : post.error} />
          <div className="row">
            <Button type="submit" icon={visibility === 'RESIDENT' ? Send : Lock} busy={post.isPending} disabled={!body.trim()}>
              {visibility === 'RESIDENT' ? 'Send reply' : 'Add note'}
            </Button>
          </div>
        </form>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------- owner */

function OwnerPanel({
  ticket: t,
  edit,
  patch,
  onSaved,
}: {
  ticket: Ticket;
  edit: boolean;
  patch: { mutate: (b: Omit<PatchTicketInput, 'version'>) => void; isPending: boolean };
  onSaved: (t: Ticket) => Promise<void>;
}) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const finished = isFinished(t.status);
  const assignable = edit && !finished;
  const assignees = useQuery({
    queryKey: ['ticket-assignees', t.id],
    queryFn: () => api<{ items: TicketAssignee[] }>(`/v1/admin/tickets/${t.id}/assignees`),
    enabled: assignable,
  });
  const [target, setTarget] = useState('');
  const chosen = assignees.data?.items.find((a) => a.id === target);
  const assign = useMutation({
    mutationFn: (adminId: string) => api<Ticket>(`/v1/admin/tickets/${t.id}/assign`, { method: 'POST', body: { adminId } }),
    onSuccess: async (next) => {
      await onSaved(next);
      setTarget('');
      toast(`Assigned to ${next.ownerName ?? 'the selected admin'}`);
      await qc.invalidateQueries({ queryKey: ['ticket', t.id] });
    },
  });

  const onAssign = async () => {
    if (!chosen) return;
    if (t.ownerAdminId) {
      const r = await confirm({
        title: 'Reassign this ticket?',
        body: `It moves from ${t.ownerName ?? 'the current owner'} to ${chosen.fullName}. ${chosen.fullName} is emailed and the change is noted on the ticket for admins.`,
        confirmLabel: `Reassign to ${chosen.fullName}`,
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    assign.mutate(chosen.id);
  };
  const onAssignMe = async () => {
    if (t.ownerAdminId) {
      const r = await confirm({
        title: 'Take over this ticket?',
        body: `It moves from ${t.ownerName ?? 'the current owner'} to you.`,
        confirmLabel: 'Assign to me',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    patch.mutate({ ownerAdminId: me.id });
  };
  const onUnassign = async () => {
    const r = await confirm({
      title: 'Unassign this ticket?',
      body: `${t.ownerName ?? 'The current owner'} stops owning it and it goes back to the unassigned queue.`,
      confirmLabel: 'Unassign',
      tone: 'warning',
    });
    if (r.ok) patch.mutate({ ownerAdminId: null });
  };

  return (
    <Panel title="Owner">
      <div className="stack">
        <div className="row-between">
          {t.ownerName ? (
            <strong>{t.ownerName}</strong>
          ) : (
            <span className="chip" style={{ borderStyle: 'dashed' }}>
              Unassigned
            </span>
          )}
          {assignable ? (
            <span className="row" style={{ gap: 4 }}>
              {t.ownerAdminId !== me.id ? (
                <Button variant="ghost" size="sm" icon={UserCheck} busy={patch.isPending} onClick={onAssignMe}>
                  Assign to me
                </Button>
              ) : null}
              {t.ownerAdminId ? (
                <Button variant="ghost" size="sm" icon={UserMinus} busy={patch.isPending} onClick={onUnassign} aria-label="Unassign">
                  Unassign
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
        {assignable ? (
          <>
            <ErrorBanner error={assignees.error ?? assign.error} />
            <SelectInput
              label="Assign to"
              value={target}
              disabled={assignees.isLoading}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={assignees.isLoading ? 'Loading admins…' : assignees.data?.items.length ? 'Choose an admin' : 'No eligible admins'}
              options={(assignees.data?.items ?? []).map((a) => ({
                value: a.id,
                label: `${a.fullName}${a.title ? ` · ${a.title}` : ''} · ${a.openTickets} open${a.isCurrentOwner ? ' · current owner' : ''}`,
              }))}
              hint="Admins with support access to this ticket's cluster. Open counts help balance work."
            />
            {chosen ? (
              <dl className="kv">
                <dt>Email</dt>
                <dd>{chosen.email}</dd>
                <dt>Scope</dt>
                <dd>{chosen.isSuperAdmin ? 'Super Admin' : chosen.scopeType === 'GLOBAL' ? 'All clusters' : 'Assigned clusters'}</dd>
                <dt>Open tickets</dt>
                <dd>{chosen.openTickets}</dd>
              </dl>
            ) : null}
            <div className="row">
              <Button variant="secondary" busy={assign.isPending} disabled={!chosen || chosen.isCurrentOwner} onClick={onAssign}>
                {t.ownerAdminId ? 'Reassign' : 'Assign'}
              </Button>
              {chosen?.isCurrentOwner ? <span className="faint">Already the owner</span> : null}
            </div>
          </>
        ) : finished && edit ? (
          <p className="faint">Reopen the ticket to change its owner.</p>
        ) : null}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- linked context */

const PAYMENT_TONE: Record<string, string> = { PAID: 'success', FAILED: 'error', EXPIRED: 'neutral', CREATED: 'neutral', REVIEW_REQUIRED: 'warning' };
const PAYMENT_PURPOSE: Record<string, string> = { INITIAL: 'Initial payment', BALANCE: 'Balance payment', FULL: 'Full payment' };
const BOOKING_TONE: Record<string, string> = { PENDING_PAYMENT: 'warning', CONFIRMED: 'success', REVIEW_REQUIRED: 'warning' };

function ContextRow({ to, primary, secondary, right }: { to?: string | undefined; primary: ReactNode; secondary?: ReactNode; right?: ReactNode }) {
  const inner = (
    <>
      <span className="q-label">
        <span style={{ display: 'block' }}>{primary}</span>
        {secondary ? (
          <span className="muted" style={{ display: 'block' }}>
            {secondary}
          </span>
        ) : null}
      </span>
      {right}
      {to ? <ChevronRight size={14} aria-hidden /> : null}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="queue-row">
          {inner}
        </Link>
      ) : (
        <div className="queue-row">{inner}</div>
      )}
    </li>
  );
}

function ContextPanel({ title, empty, children, footer }: { title: string; empty: string | null; children: ReactNode; footer?: ReactNode }) {
  return (
    <Panel title={title} flush>
      {empty ? (
        <p className="muted panel-body">{empty}</p>
      ) : (
        <ul className="queue-list" style={{ paddingBottom: 4 }}>
          {children}
        </ul>
      )}
      {footer ? <div className="panel-body" style={{ paddingTop: 0 }}>{footer}</div> : null}
    </Panel>
  );
}

function visitLine(v: TicketVisit) {
  const time = v.startsAt ? new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(v.startsAt)) : null;
  return `${formatDate(v.scheduledDate)}${time ? `, ${time}` : ''} · ${v.workerName ?? 'No worker assigned'}`;
}

function LinkedContext({ ticket: t }: { ticket: Ticket }) {
  const me = useMe();
  const ctx: TicketContext | undefined = t.context;
  const canLocations = can(me, 'locations');
  const canDemand = can(me, 'demand_payments');
  const canVisits = can(me, 'allocation');
  const canResidents = can(me, 'residents');
  const community = ctx?.flat?.communityId;
  const bookingsTo = canDemand && community ? `/demand/bookings?communityId=${community}` : undefined;
  const paymentsTo = canDemand && community ? `/demand/payments?communityId=${community}` : undefined;
  const visitsTo = canVisits ? '/allocation/visits' : undefined;

  return (
    <>
      <Panel title="Resident">
        <dl className="kv">
          <dt>Name</dt>
          <dd>{canResidents ? <Link to={`/residents?open=${t.resident.id}`}>{t.resident.fullName ?? 'Name not added'}</Link> : (t.resident.fullName ?? 'Name not added')}</dd>
          <dt>Phone</dt>
          <dd>{t.resident.phone}</dd>
          <dt>Flat</dt>
          <dd>
            {ctx?.flat ? (
              <>
                {ctx.flat.towerName} · {ctx.flat.flatNumber}
                <div className="muted">{canLocations ? <Link to={`/locations/communities/${ctx.flat.communityId}`}>{ctx.flat.communityName}</Link> : ctx.flat.communityName}</div>
              </>
            ) : t.flat ? (
              `${t.flat.communityName} · ${t.flat.towerName} · ${t.flat.flatNumber}`
            ) : (
              <span className="muted">No residence registered</span>
            )}
          </dd>
        </dl>
      </Panel>

      {!ctx ? (
        <p className="faint">Bookings, payments and visits could not be loaded with this ticket.</p>
      ) : (
        <>
          <ContextPanel title="Live bookings" empty={ctx.bookings.length ? null : 'No live bookings in your clusters.'}>
            {ctx.bookings.map((b) => (
              <ContextRow
                key={b.bookingId}
                to={bookingsTo}
                primary={b.planName}
                secondary={
                  <>
                    {b.reference} · {b.selectionLabel}
                    <br />
                    {b.subscription
                      ? `Subscription ${b.subscription.status.replace(/_/g, ' ').toLowerCase()}, ${formatDate(b.subscription.periodStart)} to ${formatDate(b.subscription.periodEnd)}`
                      : `Starts ${formatDate(b.startDate)}`}
                    {b.outstandingPaise > 0 ? ` · ${formatPaise(b.outstandingPaise)} due` : ''}
                  </>
                }
                right={<StatusBadge status={b.status} tone={BOOKING_TONE[b.status]} />}
              />
            ))}
          </ContextPanel>

          <ContextPanel title="Last payments" empty={ctx.payments.length ? null : 'No payments yet.'}>
            {ctx.payments.map((p) => (
              <ContextRow
                key={p.id}
                to={paymentsTo}
                primary={
                  <>
                    <span className="num">{formatPaise(p.amountPaise)}</span> · {PAYMENT_PURPOSE[p.purpose]}
                  </>
                }
                secondary={p.paidAt ? `Paid ${formatDateTime(p.paidAt)}` : `Created ${formatDateTime(p.createdAt)}`}
                right={<StatusBadge status={p.status} tone={PAYMENT_TONE[p.status]} />}
              />
            ))}
          </ContextPanel>

          <ContextPanel
            title="Visits"
            empty={ctx.upcomingVisits.length || ctx.recentVisits.length ? null : 'No recent or upcoming visits.'}
            footer={visitsTo ? <Link to={visitsTo}>Open visits</Link> : undefined}
          >
            {ctx.upcomingVisits.length ? (
              <li className="panel-sub" style={{ padding: '8px 18px 0' }}>
                Upcoming
              </li>
            ) : null}
            {ctx.upcomingVisits.map((v) => (
              <ContextRow key={v.occurrenceId} primary={v.serviceName} secondary={visitLine(v)} right={<StatusBadge status={v.status} />} />
            ))}
            {ctx.recentVisits.length ? (
              <li className="panel-sub" style={{ padding: '8px 18px 0' }}>
                Recent
              </li>
            ) : null}
            {ctx.recentVisits.map((v) => (
              <ContextRow key={v.occurrenceId} primary={v.serviceName} secondary={visitLine(v)} right={<StatusBadge status={v.status} />} />
            ))}
          </ContextPanel>
          <p className="faint">Limited to your clusters, so lists can be shorter than the resident’s full history.</p>
        </>
      )}
    </>
  );
}

