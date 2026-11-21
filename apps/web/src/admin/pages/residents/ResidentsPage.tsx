'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminResident, AdminResidentDetail, Membership, ResidentBookingAdmin } from '@nestovin/contracts';
import { ExportButton } from '../../components/ExportButton';
import { RecordHistory } from '../../components/RecordHistory';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { Link, useSearchParams } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  Drawer,
  ErrorBanner,
  FilterSelect,
  formatDate,
  formatPaise,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SearchBox,
  Skeleton,
  StatusBadge,
  TextInput,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Ban, Lock, Pencil, RotateCcw } from '../../components/icons';
import { flatLabel, occupancyLabel, roleLabel } from './shared';

export { flatLabel } from './shared';

export function MembershipCell({ m }: { m: Membership | null }) {
  if (!m) return <span className="muted">No residence yet</span>;
  return (
    <span className="primary-cell">
      {flatLabel(m)}
      <span className="sub">
        {roleLabel(m.kind)} · {occupancyLabel(m.occupancy)}
      </span>
    </span>
  );
}

const BOOKING_TONE: Record<string, string> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'success',
  REVIEW_REQUIRED: 'warning',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

/** ADM-05: residents in the admin's clusters (plus residents with no residence yet, for global admins). */
export function ResidentsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search.trim());
  const list = usePagedList<AdminResident>(['residents'], `/v1/admin/residents${qs({ q, status, limit: 50 })}`);
  const openId = params.get('open');
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title="Residents"
        description="People who signed in to the Resident app, with their registered flat and verification status."
        actions={<ExportButton path="/v1/admin/exports/residents" module="residents" fileName="residents.csv" />}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or phone" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          label="Account"
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Residents"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r.id)}
          emptyTitle={q || status ? 'No residents match these filters' : 'No residents yet'}
          emptyBody={q || status ? 'Try a different name, phone number or account filter.' : 'Residents appear here after they sign in to the Resident app.'}
          columns={[
            {
              header: 'Resident',
              cell: (r) => (
                <span className="primary-cell">
                  {r.fullName ?? <span className="muted">Name not added</span>}
                  <span className="sub">{r.phone}</span>
                </span>
              ),
            },
            { header: 'Residence', cell: (r) => <MembershipCell m={r.membership} /> },
            { header: 'Verification', cell: (r) => (r.membership ? <StatusBadge status={r.membership.status} /> : <span className="faint">—</span>) },
            { header: 'Account', cell: (r) => <StatusBadge status={r.status} /> },
            { header: 'Joined', cell: (r) => formatDate(r.createdAt) },
          ]}
          footer={
            list.hasMore ? (
              <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                Load more
              </Button>
            ) : null
          }
        />
      </Panel>
      <ResidentDrawer id={openId} onClose={() => setOpen(null)} />
    </>
  );
}

function ResidentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['resident', id],
    queryFn: () => api<AdminResidentDetail>(`/v1/admin/residents/${id}`),
    enabled: Boolean(id),
  });
  const [editing, setEditing] = useState(false);
  const r = detail.data;
  const canEdit = can(me, 'residents', 'edit');

  const setStatus = useMutation({
    mutationFn: (v: { status: 'ACTIVE' | 'SUSPENDED'; reason: string }) =>
      api<AdminResidentDetail>(`/v1/admin/residents/${id}/status`, { method: 'PATCH', body: { ...v, version: r!.version } }),
    onSuccess: async (_d, v) => {
      toast(v.status === 'SUSPENDED' ? 'Account suspended' : 'Account reactivated');
      await qc.invalidateQueries({ queryKey: ['residents'] });
      await qc.invalidateQueries({ queryKey: ['resident', id] });
    },
  });

  const changeStatus = async () => {
    if (!r) return;
    const suspending = r.status === 'ACTIVE';
    const name = r.fullName ?? r.phone;
    const res = await confirm({
      title: suspending ? `Suspend ${name}?` : `Reactivate ${name}?`,
      body: suspending
        ? 'They will be signed out of the Resident app and cannot use it until the account is reactivated. Bookings and records are kept.'
        : 'They will be able to sign in to the Resident app again.',
      confirmLabel: suspending ? 'Suspend account' : 'Reactivate account',
      tone: suspending ? 'danger' : 'warning',
      reason: { label: 'Reason (kept in the record history)', required: true, minLength: 3 },
    });
    if (!res.ok) return;
    setStatus.mutate({ status: suspending ? 'SUSPENDED' : 'ACTIVE', reason: res.reason });
  };

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={r ? (r.fullName ?? 'Name not added') : 'Resident'}
      subtitle={r ? r.phone : undefined}
      footer={
        r && canEdit ? (
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <Button
              variant={r.status === 'ACTIVE' ? 'danger' : 'primary'}
              icon={r.status === 'ACTIVE' ? Ban : RotateCcw}
              busy={setStatus.isPending}
              onClick={changeStatus}
            >
              {r.status === 'ACTIVE' ? 'Suspend account' : 'Reactivate account'}
            </Button>
          </>
        ) : undefined
      }
    >
      {detail.isLoading ? (
        <div className="stack-sm">
          <Skeleton height={18} />
          <Skeleton height={18} width="70%" />
          <Skeleton height={120} />
        </div>
      ) : null}
      <ErrorBanner error={detail.error} />
      {r ? (
        <div className="stack">
          <ErrorBanner error={setStatus.error} />
          {r.status === 'SUSPENDED' ? <InfoBanner tone="warning">This account is suspended. The resident cannot use the Resident app.</InfoBanner> : null}
          <dl className="details">
            <div>
              <dt>Phone</dt>
              <dd>
                {r.phone}
                <div className="faint">
                  <Lock size={12} /> Sign-in identity
                </div>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{r.email ?? <span className="muted">Not added</span>}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>
                <StatusBadge status={r.status} />
              </dd>
            </div>
            <div>
              <dt>Open tickets</dt>
              <dd>{r.openTickets > 0 && can(me, 'support') ? <Link to="/support/tickets">{r.openTickets}</Link> : r.openTickets}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(r.createdAt)}</dd>
            </div>
          </dl>

          <section>
            <h3 className="section-title">Residences</h3>
            <DataTable
              caption="Residences"
              rows={r.memberships}
              rowKey={(m) => m.id}
              emptyTitle="No residence registered"
              emptyBody="The resident has not registered a flat in the app yet."
              columns={[
                {
                  header: 'Flat',
                  cell: (m) => (
                    <span className="primary-cell">
                      {flatLabel(m)}
                      <span className="sub">
                        {roleLabel(m.kind)} · {occupancyLabel(m.occupancy)}
                      </span>
                    </span>
                  ),
                },
                { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
                {
                  header: 'Registered',
                  cell: (m) => (
                    <span className="primary-cell">
                      {formatDate(m.createdAt)}
                      <span className="sub">{m.verifiedAt ? `Verified ${formatDate(m.verifiedAt)}` : 'Not verified'}</span>
                    </span>
                  ),
                },
              ]}
            />
          </section>

          <ResidentBookings residentId={r.id} />
          <RecordHistory targetType="resident" targetId={r.id} />
        </div>
      ) : null}
      {editing && r ? <EditResident resident={r} onClose={() => setEditing(false)} /> : null}
    </Drawer>
  );
}

function ResidentBookings({ residentId }: { residentId: string }) {
  const me = useMe();
  const list = usePagedList<ResidentBookingAdmin>(['resident-bookings', residentId], `/v1/admin/residents/${residentId}/bookings${qs({ limit: 10 })}`);
  const linkBookings = can(me, 'demand_payments');
  return (
    <section>
      <h3 className="section-title">Bookings</h3>
      <DataTable
        caption="Bookings"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(b) => b.id}
        emptyTitle="No bookings"
        emptyBody="Bookings in your clusters appear here once the resident books a plan."
        columns={[
          {
            header: 'Plan',
            cell: (b) => (
              <span className="primary-cell">
                {b.planName}
                <span className="sub">
                  {b.reference} · {b.selectionLabel}
                </span>
                {b.serviceNames.length ? (
                  <span style={{ display: 'block', marginTop: 4 }}>
                    {b.serviceNames.map((s) => (
                      <span key={s} className="chip">
                        {s}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            header: 'Flat',
            cell: (b) => (
              <span className="primary-cell">
                {b.flat.towerName} · {b.flat.flatNumber}
                <span className="sub">{b.flat.communityName}</span>
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (b) => (
              <span className="stack-sm">
                <StatusBadge status={b.status} tone={BOOKING_TONE[b.status]} />
                {b.subscription ? (
                  <span className="sub muted">
                    Subscription {b.subscription.status.replace(/_/g, ' ').toLowerCase()} · {formatDate(b.subscription.periodStart)} to {formatDate(b.subscription.periodEnd)}
                  </span>
                ) : (
                  <span className="sub muted">Starts {formatDate(b.startDate)}</span>
                )}
              </span>
            ),
          },
          {
            header: 'Amount',
            className: 'num',
            cell: (b) => (
              <span className="primary-cell">
                {formatPaise(b.totalPaise)}
                <span className="sub">{b.outstandingPaise > 0 ? `${formatPaise(b.outstandingPaise)} due` : 'Paid in full'}</span>
              </span>
            ),
          },
        ]}
        footer={
          list.hasMore || linkBookings ? (
            <div className="row-between">
              {linkBookings ? <Link to="/demand/bookings">Open bookings</Link> : <span />}
              {list.hasMore ? (
                <Button variant="ghost" size="sm" onClick={list.loadMore} busy={list.loadingMore}>
                  Load more
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
    </section>
  );
}

function EditResident({ resident, onClose }: { resident: AdminResidentDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [base, setBase] = useState(resident);
  const [fullName, setFullName] = useState(resident.fullName ?? '');
  const [email, setEmail] = useState(resident.email ?? '');
  const [conflict, setConflict] = useState(false);

  const nameChanged = fullName.trim() !== (base.fullName ?? '');
  const emailChanged = email.trim().toLowerCase() !== (base.email ?? '');
  const save = useMutation({
    mutationFn: () =>
      api<AdminResidentDetail>(`/v1/admin/residents/${base.id}`, {
        method: 'PATCH',
        body: {
          ...(nameChanged ? { fullName: fullName.trim() } : {}),
          ...(emailChanged ? { email: email.trim() ? email.trim() : null } : {}),
          version: base.version,
        },
      }),
    onMutate: () => setConflict(false),
    onSuccess: async (d) => {
      qc.setQueryData(['resident', base.id], d);
      await qc.invalidateQueries({ queryKey: ['residents'] });
      toast('Resident details saved');
      onClose();
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setConflict(true);
        const latest = await qc.fetchQuery({ queryKey: ['resident', base.id], queryFn: () => api<AdminResidentDetail>(`/v1/admin/residents/${base.id}`) });
        setBase(latest);
        setFullName(latest.fullName ?? '');
        setEmail(latest.email ?? '');
      }
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const nameInvalid = nameChanged && fullName.trim().length < 2;

  return (
    <Modal
      open
      title="Edit resident details"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-resident" busy={save.isPending} disabled={(!nameChanged && !emailChanged) || nameInvalid}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-resident"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {conflict ? (
          <InfoBanner tone="warning">
            Someone else changed this resident while you were editing. The latest details are now shown: check them and save again.
          </InfoBanner>
        ) : null}
        <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName') ?? (nameInvalid ? 'Enter at least 2 characters' : undefined)} autoComplete="off" />
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={err?.field('email')}
          hint="Leave empty to remove the email."
          autoComplete="off"
        />
        <TextInput label="Phone" value={base.phone} disabled hint="The phone number is the resident's sign-in identity and cannot be changed here." />
        {err && err.code !== 'VERSION_CONFLICT' && !err.fields.length ? <ErrorBanner error={err} /> : null}
        {save.error && !(save.error instanceof ApiError) ? <ErrorBanner error={save.error} /> : null}
      </form>
    </Modal>
  );
}

