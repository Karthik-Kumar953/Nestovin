'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTicketDetail, PatchTicketInput } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useParams } from '../../lib/router';
import { Button, ErrorBanner, formatDateTime, InfoBanner, PageHeader, SelectInput, Spinner, TextArea } from '../../components/ui';
import { EscalationBadge, PrioritySelect, TICKET_STATUS_LABEL, TicketStatusBadge, useTicketCategories } from './TicketsPage';

export function TicketDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const key = ['ticket', id];
  const ticket = useQuery({ queryKey: key, queryFn: () => api<AdminTicketDetail>(`/v1/admin/tickets/${id}`), enabled: Boolean(id) });
  const categories = useTicketCategories();
  const edit = can(me, 'support', 'edit');

  const onSaved = async (t: AdminTicketDetail) => {
    qc.setQueryData(key, t);
    await qc.invalidateQueries({ queryKey: ['tickets'] });
  };
  const patch = useMutation({
    mutationFn: (body: Omit<PatchTicketInput, 'version'>) =>
      api<AdminTicketDetail>(`/v1/admin/tickets/${id}`, { method: 'PATCH', body: { ...body, version: ticket.data!.version } }),
    onSuccess: onSaved,
  });

  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'RESIDENT' | 'INTERNAL'>('RESIDENT');
  const post = useMutation({
    mutationFn: () => api<AdminTicketDetail>(`/v1/admin/tickets/${id}/updates`, { method: 'POST', body: { body, visibility } }),
    onSuccess: async (t) => {
      setBody('');
      await onSaved(t);
    },
  });
  const postErr = post.error instanceof ApiError ? post.error : null;
  const [escalating, setEscalating] = useState(false);
  const [escReason, setEscReason] = useState('');
  const escalate = useMutation({
    mutationFn: () => api<AdminTicketDetail>(`/v1/admin/tickets/${id}/escalate`, { method: 'POST', body: { reason: escReason } }),
    onSuccess: async (t) => {
      setEscalating(false);
      setEscReason('');
      await onSaved(t);
    },
  });

  if (ticket.isLoading) return <Spinner />;
  if (ticket.error || !ticket.data) return <ErrorBanner error={ticket.error ?? new Error('Ticket not found')} />;
  const t = ticket.data;
  const closed = t.status === 'CLOSED';

  return (
    <>
      <p>
        <Link to="/support/tickets">← Support tickets</Link>
      </p>
      <PageHeader title={t.subject} description={`${t.reference} · raised ${formatDateTime(t.createdAt)}`} />
      <div className="split">
        <section className="stack">
          <div className="card">
            <h2 className="section-title">Description</h2>
            <p className="prewrap">{t.description}</p>
          </div>
          <div className="card">
            <h2 className="section-title">Conversation</h2>
            {t.updates.length === 0 ? <p className="muted">No updates yet.</p> : null}
            <ol className="timeline">
              {t.updates.map((u) => (
                <li key={u.id} className={`timeline-item ${u.visibility === 'INTERNAL' ? 'timeline-internal' : ''}`}>
                  <div className="muted">
                    {u.authorKind === 'system' ? 'System' : (u.authorName ?? (u.authorKind === 'resident' ? 'Resident' : 'Admin'))}
                    {u.visibility === 'INTERNAL' ? ' · internal note' : ''} · {formatDateTime(u.createdAt)}
                  </div>
                  <p className="prewrap">{u.body}</p>
                </li>
              ))}
            </ol>
            {edit && !closed ? (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  post.mutate();
                }}
              >
                <SelectInput
                  label="Type"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'RESIDENT' | 'INTERNAL')}
                  options={[
                    { value: 'RESIDENT', label: 'Reply to resident (shown as Nestovin Support)' },
                    { value: 'INTERNAL', label: 'Internal note (admins only)' },
                  ]}
                />
                <TextArea label={visibility === 'RESIDENT' ? 'Reply' : 'Note'} value={body} onChange={(e) => setBody(e.target.value)} error={postErr?.field('body')} />
                <ErrorBanner error={postErr?.fields.length ? null : post.error} />
                <div className="row">
                  <Button type="submit" busy={post.isPending} disabled={!body.trim()}>
                    {visibility === 'RESIDENT' ? 'Send reply' : 'Add note'}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </section>

        <aside className="stack">
          <div className="card stack">
            <h2 className="section-title">Ticket</h2>
            <div>
              <TicketStatusBadge status={t.status} /> {t.urgent ? <span className="badge badge-error">Urgent</span> : null} <EscalationBadge level={t.escalationLevel} />
            </div>
            {t.dueAt && !closed && t.status !== 'RESOLVED' ? (
              <p className={t.overdue ? 'badge badge-error' : 'muted'}>{t.overdue ? 'Overdue since ' : 'Escalates if unresolved by '}{formatDateTime(t.dueAt)}</p>
            ) : null}
            {edit && !closed && t.status !== 'RESOLVED' && t.escalationLevel !== 'SUPER_ADMIN' ? (
              escalating ? (
                <div className="stack">
                  <TextArea label="Escalation reason" required value={escReason} onChange={(e) => setEscReason(e.target.value)} hint="Support keeps tracking the ticket after escalation." />
                  <ErrorBanner error={escalate.error} />
                  <div className="row">
                    <Button variant="danger" disabled={escReason.trim().length < 3} busy={escalate.isPending} onClick={() => escalate.mutate()}>
                      Escalate to {t.escalationLevel === 'NONE' ? 'Cluster Admin' : 'Super Admin'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEscalating(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setEscalating(true)}>Escalate</Button>
              )
            ) : null}
            <ErrorBanner error={patch.error} />
            {edit && !closed ? (
              <>
                <SelectInput
                  label="Status"
                  value={t.status}
                  onChange={(e) => patch.mutate({ status: e.target.value as AdminTicketDetail['status'] })}
                  options={[t.status, ...t.allowedStatuses].map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))}
                />
                <SelectInput
                  label="Category"
                  value={t.categoryId}
                  onChange={(e) => patch.mutate({ categoryId: e.target.value })}
                  options={(categories.data?.items ?? [{ id: t.categoryId, name: t.categoryName, status: 'ACTIVE' as const, sort: 0 }]).map((c) => ({ value: c.id, label: c.name }))}
                />
                <PrioritySelect value={t.priority} onChange={(v) => patch.mutate({ priority: v as AdminTicketDetail['priority'] })} />
                <label className="checkbox">
                  <input type="checkbox" checked={t.urgent} onChange={(e) => patch.mutate({ urgent: e.target.checked })} />
                  <span>Urgent</span>
                </label>
                <div>
                  <p className="field-label">Owner</p>
                  <p>{t.ownerName ?? <span className="muted">Unassigned</span>}</p>
                  <div className="row">
                    {t.ownerAdminId !== me.id ? (
                      <Button variant="secondary" busy={patch.isPending} onClick={() => patch.mutate({ ownerAdminId: me.id })}>
                        Assign to me
                      </Button>
                    ) : null}
                    {t.ownerAdminId ? (
                      <Button variant="ghost" busy={patch.isPending} onClick={() => patch.mutate({ ownerAdminId: null })}>
                        Unassign
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <dl className="details">
                <div>
                  <dt>Category</dt>
                  <dd>{t.categoryName}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{t.ownerName ?? 'Unassigned'}</dd>
                </div>
              </dl>
            )}
            {closed ? <InfoBanner>This ticket is closed. The resident can raise a new ticket if needed.</InfoBanner> : null}
          </div>
          {t.escalations.length ? (
            <div className="card">
              <h2 className="section-title">Escalation history</h2>
              <ol className="timeline">
                {t.escalations.map((e) => (
                  <li key={e.at} className="timeline-item">
                    <div className="muted">{formatDateTime(e.at)} · {e.trigger.toLowerCase()} · {e.notified} notified</div>
                    <p>To {e.level === 'CLUSTER_ADMIN' ? 'Cluster Admin' : 'Super Admin'}{e.reason ? `: ${e.reason}` : ''}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="card">
            <h2 className="section-title">Resident</h2>
            <p>
              <strong>{t.resident.fullName ?? 'Name not added'}</strong>
            </p>
            <p className="muted">{t.resident.phone}</p>
            <p className="muted">{t.flat ? `${t.flat.communityName} · ${t.flat.towerName} · ${t.flat.flatNumber}` : 'No residence registered'}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
