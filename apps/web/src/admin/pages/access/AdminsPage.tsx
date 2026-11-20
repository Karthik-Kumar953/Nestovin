'use client';

import { useState } from 'react';
import { Link } from '../../lib/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUser, AdminUserDetail, DataScope } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterSelect,
  formatDateTime,
  Modal,
  PageHeader,
  SearchBox,
  StatusBadge,
  TextInput,
  Toolbar,
} from '../../components/ui';
import { PermissionGrid, ScopePicker, useActiveClusters, useCatalogue, useRoles, type GrantPair } from './shared';

export function AdminsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<AdminUser>(['admins'], `/v1/admin/admins${qs({ q, status, limit: 25 })}`);
  const [inviting, setInviting] = useState(false);

  return (
    <>
      <PageHeader
        title="Admin users"
        description="Everyone uses the same portal; each admin sees only the modules their roles and extra permissions allow, within their data scope."
        actions={<Button onClick={() => setInviting(true)}>Invite admin</Button>}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or email" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          label="Status"
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INVITED', label: 'Invited' },
            { value: 'DISABLED', label: 'Disabled' },
          ]}
        />
      </Toolbar>
      <DataTable
        caption="Admin users"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(a) => a.id}
        emptyTitle="No admins match"
        columns={[
          {
            header: 'Name',
            cell: (a) => (
              <>
                <Link to={`/access/admins/${a.id}`}>
                  <strong>{a.fullName}</strong>
                </Link>
                <div className="muted">{a.email}</div>
              </>
            ),
          },
          {
            header: 'Access',
            cell: (a) =>
              a.isSuperAdmin ? (
                <span className="badge badge-warning">Super Admin</span>
              ) : (
                <>
                  {a.roles.map((r) => (
                    <span key={r.id} className="chip">
                      {r.name}
                    </span>
                  ))}
                  {a.extraGrants.length ? <span className="chip">+{a.extraGrants.length} extra</span> : null}
                  {!a.roles.length && !a.extraGrants.length ? <span className="muted">No access yet</span> : null}
                </>
              ),
          },
          {
            header: 'Scope',
            cell: (a) => (a.isSuperAdmin || a.scope.type === 'GLOBAL' ? 'All clusters' : `${a.scope.clusterIds.length} cluster(s)`),
          },
          { header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
          { header: 'Last sign-in', cell: (a) => formatDateTime(a.lastSignInAt) },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      {inviting ? <InviteAdmin onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function InviteAdmin({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const catalogue = useCatalogue();
  const clusters = useActiveClusters();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [extraGrants, setExtraGrants] = useState<GrantPair[]>([]);
  const [showExtra, setShowExtra] = useState(false);
  const [scope, setScope] = useState<DataScope>({ type: 'CLUSTERS', clusterIds: [] });

  const invite = useMutation({
    mutationFn: () =>
      api<AdminUserDetail>('/v1/admin/admins', {
        method: 'POST',
        body: { email, fullName, title: title || undefined, roleIds, extraGrants, scope },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admins'] });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
  });
  const err = invite.error instanceof ApiError ? invite.error : null;
  const scopeIncomplete = scope.type === 'CLUSTERS' && scope.clusterIds.length === 0;

  return (
    <Modal
      open
      wide
      title="Invite admin"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => invite.mutate()} busy={invite.isPending} disabled={!email || fullName.trim().length < 2 || scopeIncomplete}>
            Send invitation
          </Button>
        </>
      }
    >
      <ErrorBanner error={invite.error} />
      <div className="grid-2">
        <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} required />
        <TextInput
          label="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={err?.field('email')}
          hint="They receive an invitation to set a password and enrol two-factor verification."
          required
        />
        <TextInput
          label="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          hint="Shown for reference only; it grants no access."
        />
      </div>

      <fieldset>
        <legend>Roles</legend>
        {roles.data?.items.length ? (
          <div className="row">
            {roles.data.items.map((r) => (
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
        ) : (
          <p className="muted">No roles yet. You can invite now and add roles later, or create roles first.</p>
        )}
      </fieldset>

      <div>
        <Button variant="ghost" onClick={() => setShowExtra((v) => !v)} aria-expanded={showExtra}>
          {showExtra ? 'Hide' : 'Add'} extra permissions for this admin only
        </Button>
        {showExtra && catalogue.data ? (
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
