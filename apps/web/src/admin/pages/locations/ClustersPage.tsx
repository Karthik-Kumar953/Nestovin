'use client';

import { useState } from 'react';
import { Link } from '../../lib/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Cluster } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can, isGlobalScope } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterSelect,
  Modal,
  PageHeader,
  SearchBox,
  SelectInput,
  StatusBadge,
  TextArea,
  TextInput,
  Toolbar,
} from '../../components/ui';
import { STATUS_OPTIONS } from './CitiesPage';

export function ClustersPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<Cluster>(['clusters'], `/v1/admin/clusters${qs({ q, status, limit: 50 })}`);
  const [editing, setEditing] = useState<Cluster | 'new' | null>(null);
  const manage = isGlobalScope(me);

  return (
    <>
      <PageHeader
        title="Clusters"
        description="Operational groupings of one or more communities, used for workforce and admin responsibility. A community belongs to one cluster at a time."
        actions={manage && can(me, 'locations', 'create') ? <Button onClick={() => setEditing('new')}>Add cluster</Button> : null}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or code" />
        <FilterSelect value={status} onChange={setStatus} label="Status" options={STATUS_OPTIONS} />
      </Toolbar>
      <DataTable
        caption="Clusters"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(c) => c.id}
        emptyTitle="No clusters yet"
        emptyBody={manage ? 'Create a cluster, then assign communities to it.' : 'You have not been assigned to any cluster.'}
        columns={[
          {
            header: 'Cluster',
            cell: (c) => (
              <>
                <strong>{c.name}</strong> <span className="muted">({c.code})</span>
                {c.description ? <div className="muted">{c.description}</div> : null}
              </>
            ),
          },
          {
            header: 'Communities',
            className: 'num',
            cell: (c) => <Link to={`/locations/communities?clusterId=${c.id}`}>{c.communityCount}</Link>,
          },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (c) =>
              manage && can(me, 'locations', 'edit') ? (
                <Button variant="secondary" onClick={() => setEditing(c)}>
                  Edit
                </Button>
              ) : null,
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
      {editing ? <ClusterEditor cluster={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function ClusterEditor({ cluster, onClose }: { cluster: Cluster | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(cluster?.name ?? '');
  const [code, setCode] = useState(cluster?.code ?? '');
  const [description, setDescription] = useState(cluster?.description ?? '');
  const [status, setStatus] = useState(cluster?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () =>
      cluster
        ? api<Cluster>(`/v1/admin/clusters/${cluster.id}`, {
            method: 'PATCH',
            body: { name, code, description: description || undefined, status, version: cluster.version },
          })
        : api<Cluster>('/v1/admin/clusters', { method: 'POST', body: { name, code, description: description || undefined } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={cluster ? 'Edit cluster' : 'Add cluster'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim() || !code.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
      <TextInput
        label="Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={err?.field('code')}
        hint="A short unique code, e.g. HYD-WEST-1"
        required
      />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      {cluster ? (
        <SelectInput
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Cluster['status'])}
          options={STATUS_OPTIONS}
          hint="Move this cluster’s communities elsewhere before deactivating it."
        />
      ) : null}
    </Modal>
  );
}
