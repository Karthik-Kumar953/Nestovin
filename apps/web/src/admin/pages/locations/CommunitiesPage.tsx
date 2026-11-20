'use client';

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../../lib/router';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { City, Cluster, Community } from '@nestovin/contracts';
import { api, ApiError, qs, type Page } from '../../lib/api';
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

export const COMMUNITY_STATUS_OPTIONS = ['DRAFT', 'IMPORTED', 'CONFIGURED', 'ACTIVE', 'INACTIVE'].map((s) => ({
  value: s,
  label: s.charAt(0) + s.slice(1).toLowerCase(),
}));

export function useCityOptions() {
  return useQuery({
    queryKey: ['cities', 'options'],
    queryFn: () => api<Page<City>>('/v1/admin/cities?status=ACTIVE&limit=100'),
    select: (p) => p.items.map((c) => ({ value: c.id, label: `${c.name}, ${c.state}` })),
  });
}

export function useClusterOptions() {
  return useQuery({
    queryKey: ['clusters', 'options'],
    queryFn: () => api<Page<Cluster>>('/v1/admin/clusters?status=ACTIVE&limit=100'),
    select: (p) => p.items.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
  });
}

export function CommunitiesPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const cityId = params.get('cityId') ?? '';
  const clusterId = params.get('clusterId') ?? '';
  const status = params.get('status') ?? '';
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const cities = useCityOptions();
  const clusters = useClusterOptions();
  const list = usePagedList<Community>(
    ['communities'],
    `/v1/admin/communities${qs({ q, cityId, clusterId, status, limit: 25 })}`,
  );
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Communities"
        description="Gated residential communities, with their towers and flats. You see only communities in your clusters."
        actions={can(me, 'locations', 'create') ? <Button onClick={() => setCreating(true)}>Add community</Button> : null}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or code" />
        <FilterSelect value={cityId} onChange={(v) => setFilter('cityId', v)} label="City" options={cities.data ?? []} />
        <FilterSelect value={clusterId} onChange={(v) => setFilter('clusterId', v)} label="Cluster" options={clusters.data ?? []} />
        <FilterSelect value={status} onChange={(v) => setFilter('status', v)} label="Status" options={COMMUNITY_STATUS_OPTIONS} />
      </Toolbar>
      <DataTable
        caption="Communities"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(c) => c.id}
        emptyTitle="No communities found"
        columns={[
          {
            header: 'Community',
            cell: (c) => (
              <>
                <Link to={`/locations/communities/${c.id}`}>
                  <strong>{c.name}</strong>
                </Link>{' '}
                <span className="muted">({c.code})</span>
              </>
            ),
          },
          { header: 'City', cell: (c) => c.cityName },
          { header: 'Cluster', cell: (c) => c.clusterName ?? <span className="badge badge-warning">Unassigned</span> },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      {creating ? <CreateCommunity onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateCommunity({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const cities = useCityOptions();
  const clusters = useClusterOptions();
  const global = isGlobalScope(me);
  const [form, setForm] = useState({ cityId: '', name: '', code: '', addressLine: '', postalCode: '', clusterId: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () =>
      api<Community>('/v1/admin/communities', {
        method: 'POST',
        body: {
          cityId: form.cityId,
          name: form.name,
          code: form.code,
          addressLine: form.addressLine || undefined,
          postalCode: form.postalCode || undefined,
          clusterId: form.clusterId || undefined,
        },
      }),
    onSuccess: (c) => navigate(`/locations/communities/${c.id}`),
  });
  const err = create.error instanceof ApiError ? create.error : null;
  const valid = form.cityId && form.name.trim() && form.code.trim() && (global || form.clusterId);

  return (
    <Modal
      open
      title="Add community"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} busy={create.isPending} disabled={!valid}>
            Create community
          </Button>
        </>
      }
    >
      <ErrorBanner error={create.error} />
      <SelectInput
        label="City"
        value={form.cityId}
        onChange={set('cityId')}
        options={cities.data ?? []}
        placeholder="Select a city"
        error={err?.field('cityId')}
        required
      />
      <TextInput label="Community name" value={form.name} onChange={set('name')} error={err?.field('name')} required />
      <TextInput
        label="Code"
        value={form.code}
        onChange={set('code')}
        error={err?.field('code')}
        hint="Short unique code, e.g. PRESTIGE-LAKESIDE"
        required
      />
      <TextInput label="Address" value={form.addressLine} onChange={set('addressLine')} error={err?.field('addressLine')} />
      <TextInput
        label="PIN code"
        inputMode="numeric"
        maxLength={6}
        value={form.postalCode}
        onChange={set('postalCode')}
        error={err?.field('postalCode')}
      />
      <SelectInput
        label="Cluster"
        value={form.clusterId}
        onChange={set('clusterId')}
        options={clusters.data ?? []}
        placeholder={global ? 'Leave unassigned for now' : 'Select one of your clusters'}
        hint={
          global
            ? 'Unassigned communities are visible only to admins with access to all clusters.'
            : 'The community must belong to one of your clusters.'
        }
        error={err?.field('clusterId')}
        required={!global}
      />
    </Modal>
  );
}
