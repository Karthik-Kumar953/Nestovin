'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminResident, AdminResidentDetail, Membership } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterSelect,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  SearchBox,
  Spinner,
  StatusBadge,
  TextArea,
  Toolbar,
} from '../../components/ui';
import { RecordHistory } from '../../components/RecordHistory';

export function flatLabel(m: Pick<Membership, 'flatNumber' | 'towerName' | 'communityName'>): string {
  return `${m.communityName} · ${m.towerName} · ${m.flatNumber}`;
}

export function MembershipCell({ m }: { m: Membership | null }) {
  if (!m) return <span className="muted">No residence</span>;
  return (
    <>
      <div>{flatLabel(m)}</div>
      <div className="muted">
        {m.kind === 'PRIMARY' ? 'Primary Resident' : 'Family member'} · {m.occupancy === 'OWNER' ? 'Owner' : m.occupancy === 'TENANT' ? 'Tenant' : '—'} ·{' '}
        <StatusBadge status={m.status} />
      </div>
    </>
  );
}

/** ADM-05: residents in the admin's clusters (plus residents with no residence yet, for global admins). */
export function ResidentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<AdminResident>(['residents'], `/v1/admin/residents${qs({ q, status, limit: 50 })}`);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Residents"
        description="People who signed in to the Resident app, with their registered flat and verification status."
      />
      <Toolbar>
        <ExportButton path="/v1/admin/exports/residents" module="residents" fileName="residents.csv" />
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
      <DataTable
        caption="Residents"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(r) => r.id}
        emptyTitle="No residents found"
        emptyBody="Residents appear here after they sign in to the Resident app."
        columns={[
          {
            header: 'Resident',
            cell: (r) => (
              <>
                <strong>{r.fullName ?? 'Name not added'}</strong>
                <div className="muted">{r.phone}</div>
              </>
            ),
          },
          { header: 'Residence', cell: (r) => <MembershipCell m={r.membership} /> },
          { header: 'Account', cell: (r) => <StatusBadge status={r.status} /> },
          { header: 'Joined', cell: (r) => formatDateTime(r.createdAt) },
          {
            header: 'Actions',
            className: 'actions',
            cell: (r) => (
              <Button variant="secondary" onClick={() => setOpenId(r.id)}>
                View
              </Button>
            ),
          },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      {openId ? <ResidentDetail id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function ResidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['resident', id], queryFn: () => api<AdminResidentDetail>(`/v1/admin/residents/${id}`) });
  const [reason, setReason] = useState('');
  const [changing, setChanging] = useState(false);
  const r = detail.data;
  const next = r?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/residents/${id}/status`, { method: 'PATCH', body: { status: next, reason, version: r!.version } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['residents'] });
      await qc.invalidateQueries({ queryKey: ['resident', id] });
      setChanging(false);
      setReason('');
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <Modal open wide title={r ? (r.fullName ?? r.phone) : 'Resident'} onClose={onClose}>
      {detail.isLoading ? <Spinner /> : null}
      <ErrorBanner error={detail.error} />
      {r ? (
        <>
          <dl className="details">
            <div>
              <dt>Phone</dt>
              <dd>{r.phone}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{r.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>
                <StatusBadge status={r.status} />
              </dd>
            </div>
            <div>
              <dt>Open tickets</dt>
              <dd>{r.openTickets}</dd>
            </div>
          </dl>
          <h3 className="section-title">Residence history</h3>
          <DataTable
            caption="Residence history"
            rows={r.memberships}
            rowKey={(m) => m.id}
            emptyTitle="No residence registered"
            columns={[
              { header: 'Flat', cell: (m) => flatLabel(m) },
              { header: 'Role', cell: (m) => (m.kind === 'PRIMARY' ? 'Primary Resident' : 'Family member') },
              { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
              { header: 'Registered', cell: (m) => formatDateTime(m.createdAt) },
              { header: 'Verified', cell: (m) => formatDateTime(m.verifiedAt) },
            ]}
          />
          <RecordHistory targetType="resident" targetId={r.id} />
          {can(me, 'residents', 'edit') ? (
            changing ? (
              <div className="stack">
                <InfoBanner tone="warning">
                  {next === 'SUSPENDED'
                    ? 'A suspended resident cannot use the Resident app until the account is reactivated.'
                    : 'The resident will be able to use the Resident app again.'}
                </InfoBanner>
                <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
                <ErrorBanner error={save.error} />
                <div className="row">
                  <Button variant={next === 'SUSPENDED' ? 'danger' : 'primary'} busy={save.isPending} onClick={() => save.mutate()} disabled={reason.trim().length < 3}>
                    {next === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'}
                  </Button>
                  <Button variant="ghost" onClick={() => setChanging(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="row">
                <Button variant={next === 'SUSPENDED' ? 'secondary' : 'primary'} onClick={() => setChanging(true)}>
                  {next === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'}
                </Button>
              </div>
            )
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
