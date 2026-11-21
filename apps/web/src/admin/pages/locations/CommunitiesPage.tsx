'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useNavigate, useSearchParams } from '../../lib/router';
import { useMutation } from '@tanstack/react-query';
import type { Community } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can, isGlobalScope } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  ErrorBanner,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  SearchBox,
  StatusBadge,
  TextInput,
  Toolbar,
  useToast,
} from '../../components/ui';
import { Plus, Settings } from '../../components/icons';
import { BookingModeChips } from './BookingModes';
import { CITY_SOURCE, CLUSTER_SOURCE, COMMUNITY_STATUS_OPTIONS, SearchPicker, Unassigned } from './shared';

export { COMMUNITY_STATUS_OPTIONS };

export function CommunitiesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const cityId = params.get('cityId') ?? '';
  const clusterId = params.get('clusterId') ?? '';
  const status = params.get('status') ?? '';
  const unassigned = params.get('unassigned') === 'true';
  const global = isGlobalScope(me);
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'unassigned' && v) next.delete('clusterId');
    if (k === 'clusterId' && v) next.delete('unassigned');
    setParams(next, { replace: true });
  };
  const list = usePagedList<Community>(
    ['communities'],
    `/v1/admin/communities${qs({ q, cityId, clusterId, status, unassigned: unassigned ? 'true' : undefined, limit: 25 })}`,
  );
  const [creating, setCreating] = useState(false);
  const canSetup = can(me, 'catalogue_pricing') || can(me, 'community_migration');
  const filtered = Boolean(q || cityId || clusterId || status || unassigned);
  const first = list.rows?.[0];

  return (
    <>
      <PageHeader
        title="Communities"
        description="Gated communities with their towers and flats. You see the communities in your clusters."
        actions={
          <>
            <ExportButton path="/v1/admin/exports/communities" module="locations" fileName="communities.csv" />
            {can(me, 'locations', 'create') ? (
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Add community
              </Button>
            ) : null}
          </>
        }
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or code" />
        <SearchPicker
          compact
          source={CITY_SOURCE}
          label="City"
          emptyLabel="City: all"
          value={cityId}
          selectedLabel={cityId && first?.cityId === cityId ? first.cityName : undefined}
          onChange={(v) => setFilter('cityId', v)}
        />
        <SearchPicker
          compact
          source={CLUSTER_SOURCE}
          label="Cluster"
          emptyLabel="Cluster: all"
          value={clusterId}
          selectedLabel={clusterId && first?.clusterId === clusterId ? first.clusterName : undefined}
          onChange={(v) => setFilter('clusterId', v)}
        />
        <FilterSelect value={status} onChange={(v) => setFilter('status', v)} label="Status" options={COMMUNITY_STATUS_OPTIONS} />
        {global ? (
          <label className="checkbox">
            <input type="checkbox" checked={unassigned} onChange={(e) => setFilter('unassigned', e.target.checked ? 'true' : '')} />
            Unassigned only
          </label>
        ) : null}
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Communities"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/locations/communities/${c.id}`)}
          emptyTitle={filtered ? 'No communities match these filters' : 'No communities yet'}
          emptyBody={
            filtered
              ? 'Clear a filter or search for another name.'
              : can(me, 'locations', 'create')
                ? 'Add a community, then set up its towers, flats and catalogue.'
                : 'Communities appear here once they are added to your clusters.'
          }
          columns={[
            {
              header: 'Community',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">{c.code}</span>
                </span>
              ),
            },
            { header: 'City', cell: (c) => c.cityName },
            { header: 'Cluster', cell: (c) => c.clusterName ?? <Unassigned /> },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            { header: 'Booking mode', cell: (c) => <BookingModeChips modes={c.bookingModes} /> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (c) =>
                canSetup ? (
                  <div className="row">
                    <ButtonLink to={`/locations/communities/${c.id}/setup`} variant="ghost" size="sm" icon={Settings}>
                      Setup
                    </ButtonLink>
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
      {creating ? <CreateCommunity onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateCommunity({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
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
    onSuccess: (c) => {
      toast(`${c.name} created`);
      navigate(`/locations/communities/${c.id}`);
    },
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
      <div className="stack">
        <ErrorBanner error={create.error} />
        <SearchPicker
          source={CITY_SOURCE}
          label="City"
          required
          emptyLabel="Select a city"
          value={form.cityId}
          onChange={(v) => setForm((f) => ({ ...f, cityId: v }))}
          error={err?.field('cityId')}
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
        <SearchPicker
          source={CLUSTER_SOURCE}
          label="Cluster"
          required={!global}
          emptyLabel={global ? 'Leave unassigned for now' : 'Select one of your clusters'}
          value={form.clusterId}
          onChange={(v) => setForm((f) => ({ ...f, clusterId: v }))}
          hint={
            global
              ? 'Unassigned communities are visible only to admins with access to all clusters.'
              : 'The community must belong to one of your clusters.'
          }
          error={err?.field('clusterId')}
        />
      </div>
    </Modal>
  );
}
