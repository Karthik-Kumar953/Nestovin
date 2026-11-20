'use client';

import { useState } from 'react';
import { Link, useParams } from '../../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserDetail, DataScope } from '@nestovin/contracts';
import { MODULES } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from '../../components/ui';
import { PermissionGrid, ScopePicker, useActiveClusters, useCatalogue, useRoles, type GrantPair } from './shared';

export function AdminDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const admin = useQuery({ queryKey: ['admins', id], queryFn: () => api<AdminUserDetail>(`/v1/admin/admins/${id}`) });
  const clusters = useActiveClusters();
  const [editing, setEditing] = useState(false);
  const [statusChange, setStatusChange] = useState<'ACTIVE' | 'DISABLED' | null>(null);

  if (admin.isLoading) return <Spinner />;
  if (admin.error || !admin.data) return <ErrorBanner error={admin.error ?? new Error('Admin not found')} />;
  const a = admin.data;
  const isSelf = a.id === me.id;
  const clusterName = (cid: string) => clusters.data?.items.find((c) => c.id === cid)?.name ?? cid.slice(0, 8);

  return (
    <>
      <p className="breadcrumb">
        <Link to="/access/admins">Admin users</Link> / {a.fullName}
      </p>
      <PageHeader
        title={a.fullName}
        description={a.email}
        actions={
          <>
            {!isSelf && !a.isSuperAdmin ? <Button onClick={() => setEditing(true)}>Edit access</Button> : null}
            {!isSelf && a.status === 'ACTIVE' ? (
              <Button variant="danger" onClick={() => setStatusChange('DISABLED')}>
                Disable
              </Button>
            ) : null}
            {!isSelf && a.status === 'DISABLED' ? (
              <Button variant="secondary" onClick={() => setStatusChange('ACTIVE')}>
                Re-enable
              </Button>
            ) : null}
          </>
        }
      />
      {isSelf ? <InfoBanner>This is your own account. Nobody can change their own access or status.</InfoBanner> : null}

      <div className="card">
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={a.status} />
          </dd>
          <dt>Title</dt>
          <dd>{a.title ?? '—'}</dd>
          <dt>Roles</dt>
          <dd>{a.isSuperAdmin ? 'Super Admin (root: all modules)' : a.roles.map((r) => r.name).join(', ') || '—'}</dd>
          <dt>Data scope</dt>
          <dd>
            {a.isSuperAdmin || a.scope.type === 'GLOBAL'
              ? 'All clusters'
              : a.scope.clusterIds.map(clusterName).join(', ') || 'No clusters (sees no cluster data)'}
          </dd>
          <dt>Last sign-in</dt>
          <dd>{formatDateTime(a.lastSignInAt)}</dd>
          <dt>Invited</dt>
          <dd>{formatDateTime(a.createdAt)}</dd>
        </dl>
      </div>

      {!a.isSuperAdmin ? (
        <section className="section">
          <h2 className="section-title">Effective permissions</h2>
          <p className="field-hint" style={{ marginBottom: 8 }}>
            Union of all roles plus extra permissions. Source shows where each permission comes from.
          </p>
          <DataTable
            caption="Effective permissions"
            rows={a.effectiveGrants}
            rowKey={(g) => `${g.module}:${g.action}`}
            emptyTitle="No permissions"
            emptyBody="Assign a role or extra permissions to give this admin access."
            columns={[
              { header: 'Module', cell: (g) => MODULES[g.module as keyof typeof MODULES]?.label ?? g.module },
              { header: 'Action', cell: (g) => g.action.replace('_', ' ') },
              { header: 'Source', cell: (g) => g.sources.map((s) => (s === 'extra' ? 'Extra permission' : s)).join(', ') },
            ]}
          />
        </section>
      ) : null}

      {editing ? <EditAccess admin={a} onClose={() => setEditing(false)} /> : null}
      {statusChange ? <ChangeStatus admin={a} status={statusChange} onClose={() => setStatusChange(null)} /> : null}
    </>
  );
}

function EditAccess({ admin, onClose }: { admin: AdminUserDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const catalogue = useCatalogue();
  const clusters = useActiveClusters();
  const [fullName, setFullName] = useState(admin.fullName);
  const [title, setTitle] = useState(admin.title ?? '');
  const [roleIds, setRoleIds] = useState(admin.roles.map((r) => r.id));
  const [extraGrants, setExtraGrants] = useState<GrantPair[]>(admin.extraGrants);
  const [scope, setScope] = useState<DataScope>(admin.scope);

  const save = useMutation({
    mutationFn: () =>
      api<AdminUserDetail>(`/v1/admin/admins/${admin.id}`, {
        method: 'PATCH',
        body: { fullName, title: title || null, roleIds, extraGrants, scope, version: admin.version },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admins'] });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const scopeIncomplete = scope.type === 'CLUSTERS' && scope.clusterIds.length === 0;

  return (
    <Modal
      open
      wide
      title={`Edit access: ${admin.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={scopeIncomplete}>
            Save changes
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <InfoBanner>Changes take effect on this admin’s next action; they do not need to sign out.</InfoBanner>
      <div className="grid-2">
        <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} />
        <TextInput label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <fieldset>
        <legend>Roles</legend>
        <div className="row">
          {roles.data?.items.map((r) => (
            <label key={r.id} className="checkbox chip">
              <input
                type="checkbox"
                checked={roleIds.includes(r.id)}
                onChange={() => setRoleIds((ids) => (ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]))}
              />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <h3 className="field-label" style={{ marginBottom: 8 }}>
          Extra permissions for this admin only
        </h3>
        {catalogue.data ? (
          <PermissionGrid modules={catalogue.data.modules} value={extraGrants} onChange={setExtraGrants} caption="Extra permissions" />
        ) : null}
      </div>
      <ScopePicker
        value={scope}
        onChange={setScope}
        clusters={clusters.data?.items ?? []}
        error={err?.field('scope') ?? (scopeIncomplete ? 'Choose at least one cluster, or All clusters' : undefined)}
      />
    </Modal>
  );
}

function ChangeStatus({ admin, status, onClose }: { admin: AdminUserDetail; status: 'ACTIVE' | 'DISABLED'; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api<AdminUserDetail>(`/v1/admin/admins/${admin.id}/status`, {
        method: 'POST',
        body: { status, reason, version: admin.version },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admins'] });
      onClose();
    },
  });
  const disabling = status === 'DISABLED';
  return (
    <Modal
      open
      title={disabling ? `Disable ${admin.fullName}?` : `Re-enable ${admin.fullName}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={disabling ? 'danger' : 'primary'} onClick={() => change.mutate()} busy={change.isPending} disabled={reason.trim().length < 3}>
            {disabling ? 'Disable account' : 'Re-enable account'}
          </Button>
        </>
      }
    >
      <ErrorBanner error={change.error} />
      <p>
        {disabling
          ? 'They lose access immediately, including any open session. Their history and audit records are kept.'
          : 'They regain the access defined by their roles, extra permissions and scope.'}
      </p>
      <TextArea label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} />
    </Modal>
  );
}
