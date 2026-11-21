'use client';

import { useState } from 'react';
import { useParams } from '../../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClusterMembership, Community, Flat, ResidenceCategory, Tower } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Facts,
  formatDate,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Skeleton,
  StatusBadge,
  TextArea,
  TextInput,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Building2, ExternalLink, History, MapPin, Network, Pencil, Plus, Settings, Upload } from '../../components/icons';
import { CLUSTER_SOURCE, STATUS_OPTIONS, SearchPicker, Unassigned, plural } from './shared';
import { RecordHistory } from '../../components/RecordHistory';
import { BookingModePanel } from './BookingModes';

export function CommunityDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const community = useQuery({ queryKey: ['communities', id], queryFn: () => api<Community>(`/v1/admin/communities/${id}`) });
  const history = useQuery({
    queryKey: ['communities', id, 'history'],
    queryFn: () => api<{ items: ClusterMembership[] }>(`/v1/admin/communities/${id}/cluster-history`),
  });
  const towers = usePagedList<Tower>(['towers', id], `/v1/admin/communities/${id}/towers${qs({ limit: 100 })}`);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);

  if (community.isLoading)
    return (
      <div className="stack" aria-busy>
        <Skeleton height={28} width="40%" />
        <Skeleton height={64} />
        <Skeleton height={240} />
      </div>
    );
  if (community.error || !community.data) return <ErrorBanner error={community.error ?? new Error('Community not found')} />;
  const c = community.data;
  const canEdit = can(me, 'locations', 'edit');
  const canSetup = can(me, 'catalogue_pricing') || can(me, 'community_migration');
  const towerRows = towers.rows ?? [];
  const selectedTower = towerRows.find((t) => t.id === selectedTowerId) ?? null;
  const activeFlats = towerRows.reduce((n, t) => n + t.flatCount, 0);

  return (
    <>
      <PageHeader
        crumb={{ to: '/locations/communities', label: 'Communities' }}
        title={c.name}
        description={`${c.code} · ${c.cityName}`}
        actions={
          <>
            {canEdit ? (
              <>
                <Button variant="secondary" icon={Network} onClick={() => setMoving(true)}>
                  {c.clusterId ? 'Move to cluster' : 'Assign to cluster'}
                </Button>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                  Edit details
                </Button>
              </>
            ) : null}
            {canSetup ? (
              <ButtonLink to={`/locations/communities/${c.id}/setup`} variant="primary" icon={Settings}>
                Community setup
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <Facts
          items={[
            { label: 'Status', value: <StatusBadge status={c.status} /> },
            { label: 'Cluster', value: c.clusterName ?? <Unassigned />, tone: c.clusterName ? undefined : 'amber' },
            { label: 'Towers', value: towers.isLoading ? '…' : towerRows.filter((t) => t.status === 'ACTIVE').length, note: towers.hasMore ? 'First 100 shown' : undefined },
            { label: 'Active flats', value: towers.isLoading ? '…' : activeFlats.toLocaleString('en-IN') },
          ]}
        />
      </div>

      {can(me, 'catalogue_pricing') ? (
        <div style={{ marginBottom: 20 }}>
          <BookingModePanel communityId={c.id} />
        </div>
      ) : null}

      <div className="split">
        <div className="stack" style={{ minWidth: 0 }}>
          <TowersPanel
            community={c}
            towers={towers}
            selectedId={selectedTowerId}
            onSelect={(t) => setSelectedTowerId((cur) => (cur === t.id ? null : t.id))}
          />
          {selectedTower ? <FlatsPanel key={selectedTower.id} tower={selectedTower} onClose={() => setSelectedTowerId(null)} /> : null}
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <Panel title="Details">
            <dl className="kv">
              <dt>City</dt>
              <dd>{c.cityName}</dd>
              <dt>Address</dt>
              <dd>{[c.addressLine, c.postalCode].filter(Boolean).join(', ') || <span className="faint">Not set</span>}</dd>
              <dt>Reference point</dt>
              <dd>
                {c.location ? (
                  <span className="stack-sm" style={{ gap: 2 }}>
                    <span className="num">
                      {c.location.lat.toFixed(6)}, {c.location.lng.toFixed(6)}
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.location.lat},${c.location.lng}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="row"
                      style={{ gap: 4 }}
                    >
                      View on map <ExternalLink size={13} />
                    </a>
                  </span>
                ) : (
                  <span className="muted">Not set. Needed for the attendance location check.</span>
                )}
              </dd>
              <dt>Created</dt>
              <dd>{formatDate(c.createdAt)}</dd>
            </dl>
          </Panel>

          <Panel title="Cluster history" subtitle="A community is in one cluster at a time. Every move is kept.">
            {history.isLoading ? (
              <div className="stack-sm">
                <Skeleton height={16} />
                <Skeleton height={16} width="70%" />
              </div>
            ) : history.error ? (
              <ErrorBanner error={history.error} />
            ) : history.data?.items.length ? (
              <ol className="loc-timeline">
                {history.data.items.map((m) => (
                  <li key={m.id} data-current={!m.effectiveTo}>
                    <div className="row-between" style={{ gap: 8 }}>
                      <span className="loc-timeline-title">{m.clusterName}</span>
                      {!m.effectiveTo ? <span className="badge badge-teal">Current</span> : null}
                    </div>
                    <div className="loc-timeline-meta">
                      {formatDateTime(m.effectiveFrom)} – {m.effectiveTo ? formatDateTime(m.effectiveTo) : 'now'}
                    </div>
                    <p className="loc-timeline-reason">{m.reason}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Never assigned to a cluster" icon={History}>
                {canEdit ? 'Assign it so cluster admins and workers can serve it.' : undefined}
              </EmptyState>
            )}
          </Panel>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <RecordHistory targetType="community" targetId={c.id} />
      </div>

      {editing ? <EditCommunity community={c} onClose={() => setEditing(false)} /> : null}
      {moving ? <MoveCluster community={c} onClose={() => setMoving(false)} /> : null}
    </>
  );
}

/* ---------- Edit community (deactivation confirms) ---------- */

function EditCommunity({ community, onClose }: { community: Community; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
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
  const deactivating = form.status === 'INACTIVE' && community.status !== 'INACTIVE';

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
          ...(deactivating ? { status: 'INACTIVE' } : {}),
          version: community.version,
        },
      }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      toast(deactivating ? `${c.name} deactivated` : `${c.name} saved`);
      onClose();
    },
  });
  const submit = async () => {
    if (deactivating) {
      const r = await confirm({
        title: `Deactivate ${community.name}?`,
        body: 'The community will be marked inactive and closed to residents. Its towers, flats and history are kept. To re-activate it later, use Community setup → Activate, which checks the setup again.',
        confirmLabel: 'Deactivate community',
        tone: 'danger',
      });
      if (!r.ok) return;
    }
    save.mutate();
  };
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <Modal
      open
      title={`Edit ${community.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={deactivating ? 'danger-solid' : 'primary'} onClick={() => void submit()} busy={save.isPending} disabled={locationPartial}>
            {deactivating ? 'Save and deactivate' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={save.error} />
        <div className="grid-2">
          <TextInput label="Name" value={form.name} onChange={set('name')} error={err?.field('name')} required />
          <TextInput label="Code" value={form.code} onChange={set('code')} error={err?.field('code')} required />
        </div>
        <TextInput label="Address" value={form.addressLine} onChange={set('addressLine')} />
        <TextInput label="PIN code" value={form.postalCode} onChange={set('postalCode')} maxLength={6} error={err?.field('postalCode')} />
        <fieldset>
          <legend>Reference point</legend>
          <div className="stack-sm">
            <p className="field-hint">The reference point for the attendance location check. Find the address on the map or enter coordinates.</p>
            <GeocodeButton
              address={[form.addressLine, form.postalCode].filter(Boolean).join(', ')}
              onPick={(lat, lng) => setForm((f) => ({ ...f, lat: String(lat), lng: String(lng) }))}
            />
            <div className="grid-2">
              <TextInput label="Latitude" inputMode="decimal" value={form.lat} onChange={set('lat')} error={err?.field('location.lat')} />
              <TextInput label="Longitude" inputMode="decimal" value={form.lng} onChange={set('lng')} error={err?.field('location.lng')} />
            </div>
            {locationPartial ? <p className="field-error">Enter both latitude and longitude</p> : null}
          </div>
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
      </div>
    </Modal>
  );
}

/* ---------- Assign / move to cluster (with confirm) ---------- */

function MoveCluster({ community, onClose }: { community: Community; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [clusterId, setClusterId] = useState('');
  const [clusterName, setClusterName] = useState('');
  const [reason, setReason] = useState('');
  const move = useMutation({
    mutationFn: () => api<Community>(`/v1/admin/communities/${community.id}/cluster`, { method: 'POST', body: { clusterId, reason } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      toast(`${community.name} is now in ${clusterName}`);
      onClose();
    },
  });
  const submit = async () => {
    const r = await confirm({
      title: community.clusterId ? `Move ${community.name}?` : `Assign ${community.name}?`,
      body: community.clusterId
        ? `Move ${community.name} from ${community.clusterName} into ${clusterName}? Admins scoped only to ${community.clusterName} will stop seeing it. Its history is kept.`
        : `Assign ${community.name} to ${clusterName}? Admins of that cluster will start seeing it.`,
      confirmLabel: community.clusterId ? 'Move community' : 'Assign community',
      tone: community.clusterId ? 'warning' : 'default',
    });
    if (r.ok) move.mutate();
  };
  const err = move.error instanceof ApiError ? move.error : null;
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
          <Button onClick={() => void submit()} busy={move.isPending} disabled={!clusterId || reason.trim().length < 3}>
            {community.clusterId ? 'Move' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={move.error} />
        {community.clusterId ? (
          <InfoBanner tone="warning">
            Currently in <strong>{community.clusterName}</strong>. The previous membership is kept in the history.
          </InfoBanner>
        ) : null}
        <SearchPicker
          source={CLUSTER_SOURCE}
          label="Cluster"
          required
          emptyLabel="Select a cluster"
          value={clusterId}
          exclude={community.clusterId ? [community.clusterId] : undefined}
          onChange={(v, o) => {
            setClusterId(v);
            setClusterName(o?.label ?? '');
          }}
          error={err?.field('clusterId')}
        />
        <TextArea
          label="Reason (recorded in history and audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          required
          error={err?.field('reason')}
        />
      </div>
    </Modal>
  );
}

/* ---------- Towers ---------- */

function TowersPanel({
  community,
  towers,
  selectedId,
  onSelect,
}: {
  community: Community;
  towers: ReturnType<typeof usePagedList<Tower>>;
  selectedId: string | null;
  onSelect: (t: Tower) => void;
}) {
  const me = useMe();
  const [editing, setEditing] = useState<Tower | 'new' | null>(null);
  const canCreate = can(me, 'locations', 'create') && community.status !== 'INACTIVE';
  const canImport = can(me, 'community_migration', 'view');
  return (
    <Panel
      flush
      title="Towers and buildings"
      subtitle="Choose a tower to see its flats."
      actions={
        canCreate ? (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
            Add tower
          </Button>
        ) : null
      }
    >
      <DataTable
        flush
        caption="Towers"
        loading={towers.isLoading}
        error={towers.error}
        rows={towers.rows}
        rowKey={(t) => t.id}
        onRowClick={onSelect}
        emptyTitle="No towers yet"
        emptyBody={
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <span>Add towers one by one, or import the whole structure from Excel.</span>
            {canImport ? (
              <ButtonLink to={`/locations/communities/${community.id}/setup?step=import`} size="sm" icon={Upload}>
                Import structure
              </ButtonLink>
            ) : null}
          </div>
        }
        columns={[
          {
            header: 'Tower',
            cell: (t) => (
              <span className="primary-cell" aria-current={t.id === selectedId ? 'true' : undefined}>
                <span className="row" style={{ gap: 6 }}>
                  <Building2 size={14} style={{ color: t.id === selectedId ? 'var(--teal)' : 'var(--faint)' }} />
                  {t.name}
                </span>
                <span className="sub">{t.floorCount != null ? plural(t.floorCount, 'floor') : 'Floors not set'}</span>
              </span>
            ),
          },
          { header: 'Active flats', className: 'num', cell: (t) => t.flatCount.toLocaleString('en-IN') },
          { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (t) => (
              <div className="row">
                <Button variant={selectedId === t.id ? 'primary' : 'secondary'} size="sm" onClick={() => onSelect(t)} aria-pressed={selectedId === t.id}>
                  Flats
                </Button>
                {can(me, 'locations', 'edit') ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                    Edit
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
        footer={
          towers.hasMore ? (
            <Button variant="ghost" size="sm" onClick={towers.loadMore} busy={towers.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      {editing ? <TowerEditor communityId={community.id} tower={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Panel>
  );
}

function TowerEditor({ communityId, tower, onClose }: { communityId: string; tower: Tower | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
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
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['towers', communityId] });
      toast(tower ? `${t.name} saved` : `${t.name} added`);
      onClose();
    },
  });
  const submit = async () => {
    if (tower && tower.status === 'ACTIVE' && status === 'INACTIVE') {
      const r = await confirm({
        title: `Deactivate ${tower.name}?`,
        body: 'The tower will be marked inactive. Deactivate the flats in it first. You can re-activate the tower later.',
        confirmLabel: 'Deactivate tower',
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
      title={tower ? `Edit ${tower.name}` : 'Add tower'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={save.isPending} disabled={!name.trim()}>
            {tower ? 'Save changes' : 'Add tower'}
          </Button>
        </>
      }
    >
      <div className="stack">
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
      </div>
    </Modal>
  );
}

/* ---------- Flats (compact table + drawer for edits) ---------- */

const OCCUPANCY_LABEL: Record<NonNullable<Flat['occupancy']>, string> = { OWNER: 'Owner', TENANT: 'Tenant', VACANT: 'Vacant' };

function FlatsPanel({ tower, onClose }: { tower: Tower; onClose: () => void }) {
  const me = useMe();
  const list = usePagedList<Flat>(['flats', tower.id], `/v1/admin/towers/${tower.id}/flats${qs({ limit: 100 })}`);
  const [editing, setEditing] = useState<Flat | 'new' | null>(null);
  const canEdit = can(me, 'locations', 'edit');
  return (
    <Panel
      flush
      title={`Flats in ${tower.name}`}
      subtitle={plural(tower.flatCount, 'active flat')}
      actions={
        <>
          {can(me, 'locations', 'create') && tower.status === 'ACTIVE' ? (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
              Add flat
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <DataTable
        flush
        caption={`Flats in ${tower.name}`}
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(f) => f.id}
        onRowClick={canEdit ? (f) => setEditing(f) : undefined}
        emptyTitle="No flats in this tower yet"
        emptyBody="Add flats here or import them with the community structure."
        columns={[
          {
            header: 'Flat',
            cell: (f) => (
              <span className="primary-cell">
                {f.flatNumber}
                <span className="sub">
                  {[
                    f.floor != null ? `Floor ${f.floor}` : null,
                    f.bhkType,
                    f.areaSqft != null ? `${f.areaSqft.toLocaleString('en-IN')} sq ft` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No details yet'}
                </span>
              </span>
            ),
          },
          {
            header: 'Pricing category',
            cell: (f) => f.residenceCategoryLabel ?? <span className="badge badge-warning">Not set</span>,
          },
          { header: 'Occupancy', cell: (f) => (f.occupancy ? OCCUPANCY_LABEL[f.occupancy] : <span className="faint">—</span>) },
          { header: 'Status', cell: (f) => <StatusBadge status={f.status} /> },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" size="sm" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
      <FlatDrawer tower={tower} flat={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

function FlatDrawer({ tower, flat, onClose }: { tower: Tower; flat: Flat | 'new' | null; onClose: () => void }) {
  return (
    <Drawer
      open={flat !== null}
      onClose={onClose}
      title={flat === 'new' ? `Add flat to ${tower.name}` : flat ? `Flat ${flat.flatNumber}` : ''}
      subtitle={flat && flat !== 'new' ? `${tower.name} · updated ${formatDate(flat.updatedAt)}` : undefined}
    >
      {flat ? <FlatForm key={flat === 'new' ? 'new' : flat.id} tower={tower} flat={flat === 'new' ? null : flat} onDone={onClose} /> : null}
    </Drawer>
  );
}

function FlatForm({ tower, flat, onDone }: { tower: Tower; flat: Flat | null; onDone: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const canSeeCategories = can(me, 'catalogue_pricing', 'view');
  const canEdit = flat ? can(me, 'locations', 'edit') : can(me, 'locations', 'create');
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
    onSuccess: async (f) => {
      await qc.invalidateQueries({ queryKey: ['flats', tower.id] });
      await qc.invalidateQueries({ queryKey: ['towers', tower.communityId] });
      toast(flat ? `Flat ${f.flatNumber} saved` : `Flat ${f.flatNumber} added`);
      onDone();
    },
  });
  const submit = async () => {
    if (flat && flat.status === 'ACTIVE' && form.status === 'INACTIVE') {
      const r = await confirm({
        title: `Deactivate flat ${flat.flatNumber}?`,
        body: 'The flat will be marked inactive. Its records are kept and you can re-activate it later.',
        confirmLabel: 'Deactivate flat',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    save.mutate();
  };
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <div className="stack">
      <ErrorBanner error={save.error} />
      <div className="grid-2">
        <TextInput label="Flat number" value={form.flatNumber} onChange={set('flatNumber')} error={err?.field('flatNumber')} required disabled={!canEdit} />
        <TextInput label="Floor" type="number" value={form.floor} onChange={set('floor')} error={err?.field('floor')} disabled={!canEdit} />
        <TextInput label="Type (e.g. 2 BHK)" value={form.bhkType} onChange={set('bhkType')} error={err?.field('bhkType')} disabled={!canEdit} />
        <TextInput
          label="Area (sq ft)"
          type="number"
          min={1}
          value={form.areaSqft}
          onChange={set('areaSqft')}
          error={err?.field('areaSqft')}
          disabled={!canEdit}
        />
      </div>
      {canSeeCategories ? (
        <SelectInput
          label="Pricing category"
          value={form.residenceCategoryId}
          onChange={set('residenceCategoryId')}
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
          placeholder="Not set"
          hint="Decides which plans and prices this flat sees."
          disabled={!canEdit}
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
        disabled={!canEdit}
      />
      {flat ? <SelectInput label="Status" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} disabled={!canEdit} /> : null}
      {canEdit ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => void submit()} busy={save.isPending} disabled={!form.flatNumber.trim()}>
            {flat ? 'Save flat' : 'Add flat'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GeocodeButton({ address, onPick }: { address: string; onPick: (lat: number, lng: number) => void }) {
  const search = useMutation({
    mutationFn: () => api<{ items: { lat: number; lng: number; formattedAddress: string }[] }>(`/v1/admin/geocode${qs({ address })}`),
  });
  return (
    <div className="stack-sm">
      <div className="row">
        <Button variant="secondary" size="sm" icon={MapPin} disabled={address.trim().length < 3} busy={search.isPending} onClick={() => search.mutate()}>
          Find address on map
        </Button>
      </div>
      <ErrorBanner error={search.error} />
      {search.data?.items.length === 0 ? <p className="muted">No match. Try a fuller address.</p> : null}
      {(search.data?.items ?? []).map((m) => (
        <Button key={`${m.lat},${m.lng}`} variant="ghost" size="sm" onClick={() => onPick(m.lat, m.lng)}>
          Use {m.formattedAddress} ({m.lat.toFixed(5)}, {m.lng.toFixed(5)})
        </Button>
      ))}
    </div>
  );
}
