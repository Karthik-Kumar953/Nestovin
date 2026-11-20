'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { Button, DataTable, ErrorBanner, InfoBanner, Modal, PageHeader, TextArea, TextInput } from '../../components/ui';
import { PermissionGrid, useCatalogue, useRoles, type GrantPair } from './shared';

/**
 * Roles = reusable bundles of module/action permissions (ADR-008). Changing a
 * role's permissions changes access for every admin holding it, on their next request.
 */
export function RolesPage() {
  const roles = useRoles();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  return (
    <>
      <PageHeader
        title="Roles"
        description="Reusable sets of module permissions, such as HR, Operations or Payroll. Assign roles to admins; give a single admin extra permissions on their profile."
        actions={<Button onClick={() => setEditing('new')}>New role</Button>}
      />
      <DataTable
        caption="Roles"
        loading={roles.isLoading}
        error={roles.error}
        rows={roles.data?.items}
        rowKey={(r) => r.id}
        emptyTitle="No roles yet"
        emptyBody="Create roles such as HR, Operations, Payroll or Cluster Admin, then assign them to admins."
        columns={[
          {
            header: 'Role',
            cell: (r) => (
              <>
                <strong>{r.name}</strong>
                {r.description ? <div className="muted">{r.description}</div> : null}
              </>
            ),
          },
          { header: 'Permissions', cell: (r) => <span>{r.grants.length}</span>, className: 'num' },
          { header: 'Admins', cell: (r) => <span>{r.memberCount}</span>, className: 'num' },
          {
            header: 'Actions',
            className: 'actions',
            cell: (r) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setEditing(r)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]}
      />
      {editing ? <RoleEditor role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? <DeleteRole role={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

function RoleEditor({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

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
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={name.trim().length < 2}>
            {role ? 'Save changes' : 'Create role'}
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      {role && role.memberCount > 0 ? (
        <InfoBanner tone="warning">
          {role.memberCount} admin(s) hold this role. Permission changes apply to all of them immediately.
        </InfoBanner>
      ) : null}
      <div className="grid-2">
        <TextInput label="Role name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={err?.field('description')}
          rows={2}
        />
      </div>
      <p className="field-hint">
        Tick the actions this role allows. Admin users &amp; roles management is reserved for the Super Admin and cannot be granted.
      </p>
      {err?.field('grants') ? <p className="field-error">{err.field('grants')}</p> : null}
      {catalogue.data ? (
        <PermissionGrid modules={catalogue.data.modules} value={grants} onChange={setGrants} caption="Role permissions" />
      ) : (
        <ErrorBanner error={catalogue.error} />
      )}
    </Modal>
  );
}

function DeleteRole({ role, onClose }: { role: Role; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api<void>(`/v1/admin/roles/${role.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Delete role"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => del.mutate()} busy={del.isPending}>
            Delete role
          </Button>
        </>
      }
    >
      <ErrorBanner error={del.error} />
      <p>
        Delete <strong>{role.name}</strong>? Roles that are still assigned to admins cannot be deleted. Remove the role from
        those admins first.
      </p>
    </Modal>
  );
}
