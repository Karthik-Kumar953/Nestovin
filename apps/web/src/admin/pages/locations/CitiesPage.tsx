'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { City } from '@nestovin/contracts';
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
  TextInput,
  Toolbar,
} from '../../components/ui';

export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export function CitiesPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<City>(['cities'], `/v1/admin/cities${qs({ q, status, limit: 50 })}`);
  const [editing, setEditing] = useState<City | 'new' | null>(null);
  // Cities are managed by admins with access to all clusters (the API enforces this too).
  const manage = isGlobalScope(me);

  return (
    <>
      <PageHeader
        title="Cities"
        description="Geographic locations where Nestovin operates. Each community belongs to one city."
        actions={manage && can(me, 'locations', 'create') ? <Button onClick={() => setEditing('new')}>Add city</Button> : null}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search cities" />
        <FilterSelect value={status} onChange={setStatus} label="Status" options={STATUS_OPTIONS} />
      </Toolbar>
      <DataTable
        caption="Cities"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(c) => c.id}
        emptyTitle="No cities yet"
        columns={[
          { header: 'City', cell: (c) => <strong>{c.name}</strong> },
          { header: 'State', cell: (c) => c.state },
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
      {editing ? <CityEditor city={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CityEditor({ city, onClose }: { city: City | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(city?.name ?? '');
  const [state, setState] = useState(city?.state ?? '');
  const [status, setStatus] = useState(city?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () =>
      city
        ? api<City>(`/v1/admin/cities/${city.id}`, { method: 'PATCH', body: { name, state, status, version: city.version } })
        : api<City>('/v1/admin/cities', { method: 'POST', body: { name, state } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cities'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={city ? 'Edit city' : 'Add city'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim() || !state.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="City" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
      <TextInput label="State" value={state} onChange={(e) => setState(e.target.value)} error={err?.field('state')} required />
      {city ? (
        <SelectInput
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as City['status'])}
          options={STATUS_OPTIONS}
          hint="A city with active communities cannot be deactivated."
        />
      ) : null}
    </Modal>
  );
}
