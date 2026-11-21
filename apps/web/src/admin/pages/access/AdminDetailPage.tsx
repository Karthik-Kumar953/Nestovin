'use client';

import { useMemo, useState } from 'react';
import { useParams } from '../../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserDetail, DataScope } from '@nestovin/contracts';
import { MODULES } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  Drawer,
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  PageHeader,
  Panel,
  Spinner,
  StatusBadge,
  TextInput,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Ban, Globe, Network, Pencil, Power } from '../../components/icons';
import { RecordHistory } from '../../components/RecordHistory';
import { actionText, PermissionGrid, RolePicker, ScopePicker, useCatalogue, useClusterNames, useRoles, type GrantPair } from './shared';

const sourceText = (s: string) => (s === 'extra' ? 'Extra permission' : s);

export function AdminDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const admin = useQuery({ queryKey: ['admins', id], queryFn: () => api<AdminUserDetail>(`/v1/admin/admins/${id}`) });
  const names = useClusterNames();
  const [editing, setEditing] = useState(false);
  const change = useMutation({
    mutationFn: (v: { status: 'ACTIVE' | 'DISABLED'; reason: string; a: AdminUserDetail }) =>
      api<AdminUserDetail>(`/v1/admin/admins/${v.a.id}/status`, { method: 'POST', body: { status: v.status, reason: v.reason, version: v.a.version } }),
    onSuccess: async (_r, v) => {
      toast(v.status === 'DISABLED' ? `${v.a.fullName} disabled` : `${v.a.fullName} re-enabled`);
      await qc.invalidateQueries({ queryKey: ['admins'] });
    },
  });

  const grouped = useMemo(() => {
    const by = new Map<string, { module: string; actions: { action: string; sources: string[] }[] }>();
    for (const g of admin.data?.effectiveGrants ?? []) {
      const row = by.get(g.module) ?? { module: g.module, actions: [] };
      row.actions.push({ action: g.action, sources: g.sources });
      by.set(g.module, row);
    }
    const order = Object.keys(MODULES);
    return [...by.values()].sort((a, b) => order.indexOf(a.module) - order.indexOf(b.module));
  }, [admin.data]);

  if (admin.isLoading) return <Spinner />;
  if (admin.error || !admin.data) return <ErrorBanner error={admin.error ?? new Error('Admin not found')} />;
  const a = admin.data;
  const isSelf = a.id === me.id;
  const clusterName = (cid: string) => names.map.get(cid)?.name ?? 'Unknown cluster';

  async function setStatus(status: 'ACTIVE' | 'DISABLED') {
    const disabling = status === 'DISABLED';
    const r = await confirm({
      title: disabling ? `Disable ${a.fullName}?` : `Re-enable ${a.fullName}?`,
      body: disabling
        ? 'They lose access immediately, including any open session. Their history and audit records are kept, and you can re-enable them later.'
        : 'They regain the access defined by their roles, extra permissions and data scope.',
      confirmLabel: disabling ? 'Disable account' : 'Re-enable account',
      tone: disabling ? 'danger' : 'default',
      reason: { label: 'Reason (recorded in the audit log)', required: true, minLength: 3 },
    });
    if (r.ok) change.mutate({ status, reason: r.reason, a });
  }

  return (
    <>
      <PageHeader
        crumb={{ to: '/access/admins', label: 'Admin users' }}
        title={a.fullName}
        description={
          <>
            {a.email}
            {a.title ? ` · ${a.title}` : ''} <StatusBadge status={a.status} />
          </>
        }
        actions={
          <>
            {!isSelf && a.status === 'ACTIVE' ? (
              <Button variant="danger" icon={Ban} busy={change.isPending} onClick={() => void setStatus('DISABLED')}>
                Disable
              </Button>
            ) : null}
            {!isSelf && a.status === 'DISABLED' ? (
              <Button variant="secondary" icon={Power} busy={change.isPending} onClick={() => void setStatus('ACTIVE')}>
                Re-enable
              </Button>
            ) : null}
            {!isSelf && !a.isSuperAdmin ? (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit access
              </Button>
            ) : null}
          </>
        }
      />
      <div className="stack">
        {isSelf ? <InfoBanner>This is your own account. Nobody can change their own access or status.</InfoBanner> : null}
        <ErrorBanner error={change.error} />
        <div className="split">
          <div className="stack" style={{ minWidth: 0 }}>
            {a.isSuperAdmin ? (
              <Panel title="Effective permissions">
                <p style={{ margin: 0 }}>Super Admin is the root account: every module and action, in every cluster.</p>
              </Panel>
            ) : (
              <Panel title="Effective permissions" subtitle="Everything from all roles plus extra permissions, with where each one comes from." flush>
                <DataTable
                  flush
                  caption="Effective permissions by module"
                  rows={grouped}
                  rowKey={(g) => g.module}
                  emptyTitle="No permissions"
                  emptyBody="Assign a role or extra permissions to give this admin access."
                  columns={[
                    {
                      header: 'Module',
                      cell: (g) => {
                        const m = MODULES[g.module as keyof typeof MODULES];
                        return (
                          <span className="primary-cell">
                            {m?.label ?? g.module}
                            {m ? <span className="sub">{m.ref}</span> : null}
                          </span>
                        );
                      },
                    },
                    {
                      header: 'Allowed actions and source',
                      cell: (g) => (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {g.actions.map((x) => (
                            <li key={x.action}>
                              <span className="chip">{actionText(x.action)}</span>
                              <span className="muted" style={{ fontSize: 12.5 }}>
                                from {x.sources.map(sourceText).join(', ')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ),
                    },
                  ]}
                />
              </Panel>
            )}
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            <Panel title="Account">
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={a.status} />
                </dd>
                <dt>Title</dt>
                <dd>{a.title ?? '—'}</dd>
                <dt>Last sign-in</dt>
                <dd>{a.lastSignInAt ? formatDateTime(a.lastSignInAt) : 'Never'}</dd>
                <dt>Invited</dt>
                <dd>{formatDateTime(a.createdAt)}</dd>
              </dl>
            </Panel>
            <Panel title="Roles">
              {a.isSuperAdmin ? (
                <span className="badge badge-warning">Super Admin</span>
              ) : (
                <div>
                  {a.roles.length ? (
                    a.roles.map((r) => (
                      <span key={r.id} className="chip">
                        {r.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted">No roles</span>
                  )}
                  {a.extraGrants.length ? <span className="chip">+{a.extraGrants.length} extra</span> : null}
                </div>
              )}
            </Panel>
            <Panel title="Data scope">
              {a.isSuperAdmin || a.scope.type === 'GLOBAL' ? (
                <p className="row" style={{ margin: 0, gap: 6 }}>
                  <Globe size={14} aria-hidden /> All clusters, including communities not yet in a cluster
                </p>
              ) : a.scope.clusterIds.length ? (
                <ul className="checklist">
                  {a.scope.clusterIds.map((cid) => (
                    <li key={cid}>
                      <span aria-hidden>
                        <Network size={14} />
                      </span>
                      <span>{clusterName(cid)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">No clusters (sees no cluster data)</span>
              )}
            </Panel>
            <RecordHistory targetType="admin" targetId={a.id} />
          </div>
        </div>
      </div>
      {editing ? <EditAccess admin={a} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function EditAccess({ admin, onClose }: { admin: AdminUserDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const roles = useRoles();
  const catalogue = useCatalogue();
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
      toast('Access updated');
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const scopeIncomplete = scope.type === 'CLUSTERS' && scope.clusterIds.length === 0;

  return (
    <Drawer
      open
      title={`Edit access: ${admin.fullName}`}
      subtitle="Changes take effect on this admin’s next action; they do not need to sign out."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={scopeIncomplete || fullName.trim().length < 2}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={err?.fields.length ? null : save.error} />
        <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} />
        <TextInput label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} hint="Shown for reference only; it grants no access." />
        <RolePicker roles={roles.data?.items} loading={roles.isLoading} value={roleIds} onChange={setRoleIds} />
        <section className="stack-sm">
          <h3 className="field-label" style={{ margin: 0 }}>
            Extra permissions for this admin only
          </h3>
          {catalogue.data ? (
            <PermissionGrid modules={catalogue.data.modules} value={extraGrants} onChange={setExtraGrants} caption="Extra permissions" />
          ) : (
            <ErrorBanner error={catalogue.error} />
          )}
          {err?.field('extraGrants') ? <p className="field-error">{err.field('extraGrants')}</p> : null}
        </section>
        <ScopePicker
          value={scope}
          onChange={setScope}
          error={err?.field('scope') ?? (scopeIncomplete ? 'Choose at least one cluster, or All clusters' : undefined)}
        />
      </div>
    </Drawer>
  );
}
