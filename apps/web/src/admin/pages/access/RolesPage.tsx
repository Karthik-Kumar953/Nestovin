'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { Button, DataTable, ErrorBanner, InfoBanner, Modal, PageHeader, Panel, Skeleton, TextArea, TextInput, useConfirm, useToast } from '../../components/ui';
import { Pencil, Plus, Trash2 } from '../../components/icons';
import { PermissionGrid, useCatalogue, useRoles, type GrantPair } from './shared';

/**
 * Roles = reusable bundles of module/action permissions (ADR-008). Changing a
 * role's permissions changes access for every admin holding it, on their next request.
 */
export function RolesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const roles = useRoles();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const del = useMutation({
    mutationFn: (r: Role) => api<void>(`/v1/admin/roles/${r.id}`, { method: 'DELETE' }),
    onSuccess: async (_x, r) => {
      toast(`Role “${r.name}” deleted`);
      await qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });
  async function remove(r: Role) {
    const res = await confirm({
      title: `Delete the role “${r.name}”?`,
      body:
        r.memberCount > 0
          ? `${r.memberCount} ${r.memberCount === 1 ? 'admin holds' : 'admins hold'} this role. Roles still assigned to admins can’t be deleted; remove it from them first.`
          : 'Nobody holds this role. Deleting it can’t be undone.',
      confirmLabel: 'Delete role',
      tone: 'danger',
    });
    if (res.ok) del.mutate(r);
  }

  return (
    <>
      <PageHeader
        title="Roles"
        description="Reusable sets of module permissions, such as HR, Operations or Payroll. Assign roles to admins; give a single admin extra permissions on their profile."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            New role
          </Button>
        }
      />
      <div className="stack">
        <ErrorBanner error={del.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Roles"
            loading={roles.isLoading}
            error={roles.error}
            rows={roles.data?.items}
            rowKey={(r) => r.id}
            onRowClick={setEditing}
            emptyTitle="No roles yet"
            emptyBody="Create roles such as HR, Operations, Payroll or Cluster Admin, then assign them to admins."
            columns={[
              {
                header: 'Role',
                cell: (r) => (
                  <span className="primary-cell">
                    {r.name}
                    {r.description ? <span className="sub">{r.description}</span> : null}
                  </span>
                ),
              },
              { header: 'Permissions', cell: (r) => r.grants.length, className: 'num' },
              { header: 'Admins', cell: (r) => r.memberCount, className: 'num' },
              {
                header: 'Actions',
                className: 'actions',
                cell: (r) => (
                  <div className="row">
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${r.name}`} busy={del.isPending && del.variables?.id === r.id} onClick={() => void remove(r)}>
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      </div>
      {editing ? <RoleEditor role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function RoleEditor({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const catalogue = useCatalogue();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [grants, setGrants] = useState<GrantPair[]>(role?.grants ?? []);

  const save = useMutation({
    mutationFn: () =>
      role
        ? api<Role>(`/v1/admin/roles/${role.id}`, {
            method: 'PATCH',
            body: { name, description: description || undefined, grants, version: role.version },
          })
        : api<Role>('/v1/admin/roles', { method: 'POST', body: { name, description: description || undefined, grants } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast(role ? `Role “${r.name}” saved` : `Role “${r.name}” created`);
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

  async function submit() {
    if (role && role.memberCount > 0) {
      const r = await confirm({
        title: `Save changes to “${role.name}”?`,
        body: `${role.memberCount} ${role.memberCount === 1 ? 'admin holds' : 'admins hold'} this role. Their access changes on their next action.`,
        confirmLabel: 'Save changes',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    save.mutate();
  }

  return (
    <Modal
      open
      wide
      title={role ? `Edit role: ${role.name}` : 'New role'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={save.isPending} disabled={name.trim().length < 2}>
            {role ? 'Save changes' : 'Create role'}
          </Button>
        </>
      }
    >
      <ErrorBanner error={err?.fields.length ? null : save.error} />
      {role && role.memberCount > 0 ? (
        <InfoBanner tone="warning">
          {role.memberCount} {role.memberCount === 1 ? 'admin holds' : 'admins hold'} this role. Permission changes apply to all of them.
        </InfoBanner>
      ) : null}
      <div className="grid-2">
        <TextInput label="Role name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={err?.field('description')} rows={2} />
      </div>
      <p className="field-hint" style={{ margin: 0 }}>
        Tick the actions this role allows ({grants.length} ticked). Click a module name to tick or clear its whole row. Admin users &amp; roles management is
        reserved for the Super Admin and cannot be granted.
      </p>
      {err?.field('grants') ? <p className="field-error">{err.field('grants')}</p> : null}
      {catalogue.data ? (
        <PermissionGrid modules={catalogue.data.modules} value={grants} onChange={setGrants} caption="Role permissions" />
      ) : catalogue.error ? (
        <ErrorBanner error={catalogue.error} />
      ) : (
        <Skeleton height={200} />
      )}
    </Modal>
  );
}
