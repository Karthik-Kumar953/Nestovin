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
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SearchBox,
  SelectInput,
  StatusBadge,
  TextInput,
  Toolbar,
  formatDate,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Plus } from '../../components/icons';
import { STATUS_OPTIONS } from './shared';

export { STATUS_OPTIONS };

export function CitiesPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<City>(['cities'], `/v1/admin/cities${qs({ q, status, limit: 50 })}`);
  const [editing, setEditing] = useState<City | 'new' | null>(null);
  // Cities are managed by admins with access to all clusters (the API enforces this too).
  const manage = isGlobalScope(me);
  const canEdit = manage && can(me, 'locations', 'edit');
  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader
        title="Cities"
        description="Where Nestovin operates. Every community belongs to one city."
        actions={
          manage && can(me, 'locations', 'create') ? (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add city
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search cities or states" />
        <FilterSelect value={status} onChange={setStatus} label="Status" options={STATUS_OPTIONS} />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Cities"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(c) => c.id}
          onRowClick={canEdit ? (c) => setEditing(c) : undefined}
          emptyTitle={filtered ? 'No cities match these filters' : 'No cities yet'}
          emptyBody={
            filtered
              ? 'Clear the search or status filter to see every city.'
              : manage
                ? 'Add the first city, then create communities in it.'
                : 'Cities are added by admins with access to all clusters.'
          }
          columns={[
            {
              header: 'City',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">{c.state}</span>
                </span>
              ),
            },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            { header: 'Updated', cell: (c) => <span className="muted">{formatDate(c.updatedAt)}</span> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (c) =>
                canEdit ? (
                  <div className="row">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                  </div>
                ) : null,
            },
          ]}
          footer={
            list.hasMore ? (
              <Button variant="ghost" size="sm" onClick={list.loadMore} busy={list.loadingMore}>
                Load more
              </Button>
            ) : null
          }
        />
      </Panel>
      {editing ? <CityEditor city={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CityEditor({ city, onClose }: { city: City | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState(city?.name ?? '');
  const [state, setState] = useState(city?.state ?? '');
  const [status, setStatus] = useState(city?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () =>
      city
        ? api<City>(`/v1/admin/cities/${city.id}`, { method: 'PATCH', body: { name, state, status, version: city.version } })
        : api<City>('/v1/admin/cities', { method: 'POST', body: { name, state } }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['cities'] });
      toast(city ? `${c.name} saved` : `${c.name} added`);
      onClose();
    },
  });
  const submit = async () => {
    if (city && city.status === 'ACTIVE' && status === 'INACTIVE') {
      const r = await confirm({
        title: `Deactivate ${city.name}?`,
        body: 'New communities can no longer be created in this city. A city with active communities cannot be deactivated. You can re-activate it later.',
        confirmLabel: 'Deactivate city',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    save.mutate();
  };
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={city ? `Edit ${city.name}` : 'Add city'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={save.isPending} disabled={!name.trim() || !state.trim()}>
            {city ? 'Save changes' : 'Add city'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={save.error} />
        {!city ? <InfoBanner>Communities are created inside a city, so add the city first.</InfoBanner> : null}
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
      </div>
    </Modal>
  );
}
