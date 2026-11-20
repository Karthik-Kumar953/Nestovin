'use client';

import { useState } from 'react';
import { Link, useParams } from '../../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClusterMembership, Community, Flat, ResidenceCategory, Tower } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  SelectInput,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from '../../components/ui';
import { STATUS_OPTIONS } from './CitiesPage';
import { useClusterOptions } from './CommunitiesPage';
import { RecordHistory } from '../../components/RecordHistory';

export function CommunityDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const community = useQuery({ queryKey: ['communities', id], queryFn: () => api<Community>(`/v1/admin/communities/${id}`) });
  const history = useQuery({
    queryKey: ['communities', id, 'history'],
    queryFn: () => api<{ items: ClusterMembership[] }>(`/v1/admin/communities/${id}/cluster-history`),
  });
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);

  if (community.isLoading) return <Spinner />;
  if (community.error || !community.data) return <ErrorBanner error={community.error ?? new Error('Community not found')} />;
  const c = community.data;
  const canEdit = can(me, 'locations', 'edit');

  return (
    <>
      <p className="breadcrumb">
        <Link to="/locations/communities">Communities</Link> / {c.name}
      </p>
      <PageHeader
        title={c.name}
        description={`${c.code} · ${c.cityName}`}
        actions={
          <>
            {can(me, 'catalogue_pricing') || can(me, 'community_migration') ? (
              <Link to={`/locations/communities/${c.id}/setup`} className="btn btn-primary">
                Community setup
              </Link>
            ) : null}
            {canEdit ? (
              <>
                <Button variant="secondary" onClick={() => setMoving(true)}>
                  {c.clusterId ? 'Move to another cluster' : 'Assign to cluster'}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit details
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="card">
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={c.status} />
          </dd>
          <dt>Cluster</dt>
          <dd>{c.clusterName ?? <span className="badge badge-warning">Unassigned</span>}</dd>
          <dt>Address</dt>
          <dd>{[c.addressLine, c.postalCode].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Reference location</dt>
          <dd>
            {c.location ? (
              <>
                {c.location.lat.toFixed(6)}, {c.location.lng.toFixed(6)}{' '}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${c.location.lat},${c.location.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View on map
                </a>
              </>
            ) : (
              <span className="muted">Not set. Needed later for the attendance location check.</span>
            )}
          </dd>
        </dl>
      </div>

      <section className="section">
        <h2 className="section-title">Towers / buildings</h2>
        <TowersTable community={c} onSelect={setSelectedTower} selected={selectedTower} />
      </section>

      {selectedTower ? (
        <section className="section">
          <h2 className="section-title">Flats in {selectedTower.name}</h2>
          <FlatsTable tower={selectedTower} />
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">Cluster history</h2>
        <DataTable
          caption="Cluster membership history"
          loading={history.isLoading}
          error={history.error}
          rows={history.data?.items}
          rowKey={(m) => m.id}
          emptyTitle="Never assigned to a cluster"
          columns={[
            { header: 'Cluster', cell: (m) => m.clusterName },
            { header: 'From', cell: (m) => formatDateTime(m.effectiveFrom) },
            { header: 'To', cell: (m) => (m.effectiveTo ? formatDateTime(m.effectiveTo) : <span className="badge badge-success">Current</span>) },
            { header: 'Reason', cell: (m) => m.reason },
          ]}
        />
      </section>

      <RecordHistory targetType="community" targetId={c.id} />

      {editing ? <EditCommunity community={c} onClose={() => setEditing(false)} /> : null}
      {moving ? <MoveCluster community={c} onClose={() => setMoving(false)} /> : null}
    </>
  );
}

function EditCommunity({ community, onClose }: { community: Community; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: community.name,
    code: community.code,
    addressLine: community.addressLine ?? '',
    postalCode: community.postalCode ?? '',
    lat: community.location ? String(community.location.lat) : '',
    lng: community.location ? String(community.location.lng) : '',
    status: community.status,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const locationGiven = form.lat !== '' && form.lng !== '';
  const locationPartial = (form.lat !== '') !== (form.lng !== '');

  const save = useMutation({
    mutationFn: () =>
      api<Community>(`/v1/admin/communities/${community.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          code: form.code,
          addressLine: form.addressLine || undefined,
          postalCode: form.postalCode || undefined,
          ...(locationGiven ? { location: { lat: Number(form.lat), lng: Number(form.lng) } } : {}),
          ...(form.status === 'INACTIVE' && community.status !== 'INACTIVE' ? { status: 'INACTIVE' } : {}),
          version: community.version,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <Modal
      open
      title="Edit community"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={locationPartial}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="Name" value={form.name} onChange={set('name')} error={err?.field('name')} required />
      <TextInput label="Code" value={form.code} onChange={set('code')} error={err?.field('code')} required />
      <TextInput label="Address" value={form.addressLine} onChange={set('addressLine')} />
      <TextInput label="PIN code" value={form.postalCode} onChange={set('postalCode')} maxLength={6} error={err?.field('postalCode')} />
      <fieldset>
        <legend>Reference location</legend>
        <p className="field-hint">
          Used as the reference point for the attendance location check. A Google Maps picker will replace these fields once the
          Maps key is configured.
        </p>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <TextInput label="Latitude" inputMode="decimal" value={form.lat} onChange={set('lat')} error={err?.field('location.lat')} />
          <TextInput label="Longitude" inputMode="decimal" value={form.lng} onChange={set('lng')} error={err?.field('location.lng')} />
        </div>
        {locationPartial ? <p className="field-error">Enter both latitude and longitude</p> : null}
      </fieldset>
      {community.status === 'INACTIVE' ? (
        <InfoBanner>This community is inactive. Re-activate it from Community setup → Activate.</InfoBanner>
      ) : (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.status === 'INACTIVE'}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? 'INACTIVE' : community.status }))}
          />
          Deactivate this community (activation is done in Community setup)
        </label>
      )}
    </Modal>
  );
}

function MoveCluster({ community, onClose }: { community: Community; onClose: () => void }) {
  const qc = useQueryClient();
  const clusters = useClusterOptions();
  const [clusterId, setClusterId] = useState('');
  const [reason, setReason] = useState('');
  const move = useMutation({
    mutationFn: () =>
      api<Community>(`/v1/admin/communities/${community.id}/cluster`, { method: 'POST', body: { clusterId, reason } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      onClose();
    },
  });
  const options = (clusters.data ?? []).filter((o) => o.value !== community.clusterId);
  return (
    <Modal
      open
      title={community.clusterId ? 'Move to another cluster' : 'Assign to cluster'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => move.mutate()} busy={move.isPending} disabled={!clusterId || reason.trim().length < 3}>
            Confirm
          </Button>
        </>
      }
    >
      <ErrorBanner error={move.error} />
      {community.clusterId ? (
        <InfoBanner tone="warning">
          Currently in <strong>{community.clusterName}</strong>. Admins scoped only to that cluster will no longer see this community.
          The previous membership is kept in the history.
        </InfoBanner>
      ) : null}
      <SelectInput label="Cluster" value={clusterId} onChange={(e) => setClusterId(e.target.value)} options={options} placeholder="Select cluster" required />
      <TextArea label="Reason (recorded in history and audit log)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
    </Modal>
  );
}

function TowersTable({ community, onSelect, selected }: { community: Community; onSelect: (t: Tower) => void; selected: Tower | null }) {
  const me = useMe();
  const list = usePagedList<Tower>(['towers', community.id], `/v1/admin/communities/${community.id}/towers${qs({ limit: 100 })}`);
  const [editing, setEditing] = useState<Tower | 'new' | null>(null);
  return (
    <>
      {can(me, 'locations', 'create') && community.status !== 'INACTIVE' ? (
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Add tower
          </Button>
        </div>
      ) : null}
      <DataTable
        caption="Towers"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(t) => t.id}
        emptyTitle="No towers yet"
        emptyBody="Add towers here, or import the full structure later through Community Migration (Excel)."
        columns={[
          { header: 'Tower', cell: (t) => <strong>{t.name}</strong> },
          { header: 'Floors', className: 'num', cell: (t) => t.floorCount ?? '—' },
          { header: 'Active flats', className: 'num', cell: (t) => t.flatCount },
          { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (t) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button variant={selected?.id === t.id ? 'primary' : 'secondary'} onClick={() => onSelect(t)}>
                  Flats
                </Button>
                {can(me, 'locations', 'edit') ? (
                  <Button variant="ghost" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                ) : null}
              </div>
            ),
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
      {editing ? <TowerEditor communityId={community.id} tower={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function TowerEditor({ communityId, tower, onClose }: { communityId: string; tower: Tower | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(tower?.name ?? '');
  const [floorCount, setFloorCount] = useState(tower?.floorCount != null ? String(tower.floorCount) : '');
  const [status, setStatus] = useState(tower?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () => {
      const floors = floorCount === '' ? undefined : Number(floorCount);
      return tower
        ? api<Tower>(`/v1/admin/towers/${tower.id}`, { method: 'PATCH', body: { name, floorCount: floors, status, version: tower.version } })
        : api<Tower>('/v1/admin/towers', { method: 'POST', body: { communityId, name, floorCount: floors } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['towers', communityId] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={tower ? 'Edit tower' : 'Add tower'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="Tower / building name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
      <TextInput
        label="Number of floors"
        type="number"
        min={0}
        max={200}
        value={floorCount}
        onChange={(e) => setFloorCount(e.target.value)}
        error={err?.field('floorCount')}
      />
      {tower ? (
        <SelectInput
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Tower['status'])}
          options={STATUS_OPTIONS}
          hint="Deactivate the flats in a tower before deactivating the tower."
        />
      ) : null}
    </Modal>
  );
}

function FlatsTable({ tower }: { tower: Tower }) {
  const me = useMe();
  const list = usePagedList<Flat>(['flats', tower.id], `/v1/admin/towers/${tower.id}/flats${qs({ limit: 100 })}`);
  const [editing, setEditing] = useState<Flat | 'new' | null>(null);
  return (
    <>
      {can(me, 'locations', 'create') && tower.status === 'ACTIVE' ? (
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Add flat
          </Button>
        </div>
      ) : null}
      <DataTable
        caption={`Flats in ${tower.name}`}
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(f) => f.id}
        emptyTitle="No flats yet"
        columns={[
          { header: 'Flat', cell: (f) => <strong>{f.flatNumber}</strong> },
          { header: 'Floor', className: 'num', cell: (f) => f.floor ?? '—' },
          { header: 'Type', cell: (f) => f.bhkType ?? '—' },
          { header: 'Area (sq ft)', className: 'num', cell: (f) => (f.areaSqft != null ? f.areaSqft.toLocaleString('en-IN') : '—') },
          {
            header: 'Pricing category',
            cell: (f) => f.residenceCategoryLabel ?? <span className="badge badge-warning">Not set</span>,
          },
          { header: 'Occupancy', cell: (f) => (f.occupancy ? f.occupancy.charAt(0) + f.occupancy.slice(1).toLowerCase() : '—') },
          { header: 'Status', cell: (f) => <StatusBadge status={f.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (f) =>
              can(me, 'locations', 'edit') ? (
                <Button variant="ghost" onClick={() => setEditing(f)}>
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
      {editing ? <FlatEditor tower={tower} flat={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function FlatEditor({ tower, flat, onClose }: { tower: Tower; flat: Flat | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const canSeeCategories = can(me, 'catalogue_pricing', 'view');
  const categories = useQuery({
    queryKey: ['setup', tower.communityId, 'categories'],
    queryFn: () => api<{ items: ResidenceCategory[] }>(`/v1/admin/communities/${tower.communityId}/residence-categories`),
    select: (d) => d.items.filter((c) => c.status === 'ACTIVE' || c.id === flat?.residenceCategoryId),
    enabled: canSeeCategories,
  });
  const [form, setForm] = useState({
    flatNumber: flat?.flatNumber ?? '',
    floor: flat?.floor != null ? String(flat.floor) : '',
    bhkType: flat?.bhkType ?? '',
    areaSqft: flat?.areaSqft != null ? String(flat.areaSqft) : '',
    residenceCategoryId: flat?.residenceCategoryId ?? '',
    occupancy: flat?.occupancy ?? '',
    status: flat?.status ?? 'ACTIVE',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        flatNumber: form.flatNumber,
        floor: form.floor === '' ? undefined : Number(form.floor),
        bhkType: form.bhkType || undefined,
        areaSqft: form.areaSqft === '' ? undefined : Number(form.areaSqft),
        ...(canSeeCategories ? { residenceCategoryId: form.residenceCategoryId || null } : {}),
        occupancy: form.occupancy || null,
      };
      return flat
        ? api<Flat>(`/v1/admin/flats/${flat.id}`, { method: 'PATCH', body: { ...body, status: form.status, version: flat.version } })
        : api<Flat>('/v1/admin/flats', { method: 'POST', body: { towerId: tower.id, ...body } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['flats', tower.id] });
      await qc.invalidateQueries({ queryKey: ['towers', tower.communityId] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={flat ? `Edit flat ${flat.flatNumber}` : `Add flat to ${tower.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!form.flatNumber.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <div className="grid-2">
        <TextInput label="Flat number" value={form.flatNumber} onChange={set('flatNumber')} error={err?.field('flatNumber')} required />
        <TextInput label="Floor" type="number" value={form.floor} onChange={set('floor')} error={err?.field('floor')} />
        <TextInput label="Type (e.g. 2 BHK)" value={form.bhkType} onChange={set('bhkType')} error={err?.field('bhkType')} />
        <TextInput label="Area (sq ft)" type="number" min={1} value={form.areaSqft} onChange={set('areaSqft')} error={err?.field('areaSqft')} />
        {canSeeCategories ? (
          <SelectInput
            label="Pricing category"
            value={form.residenceCategoryId}
            onChange={set('residenceCategoryId')}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
            placeholder="Not set"
            hint="Decides which plans and prices this flat sees."
          />
        ) : null}
        <SelectInput
          label="Occupancy"
          value={form.occupancy}
          onChange={set('occupancy')}
          options={[
            { value: 'OWNER', label: 'Owner' },
            { value: 'TENANT', label: 'Tenant' },
            { value: 'VACANT', label: 'Vacant' },
          ]}
          placeholder="Not set"
        />
      </div>
      {flat ? <SelectInput label="Status" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} /> : null}
    </Modal>
  );
}
