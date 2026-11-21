'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignClusterCommunitiesResult, Cluster, ClusterCommunityMember, Community } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can, isGlobalScope } from '../../lib/permissions';
import { Link } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  ErrorBanner,
  FilterSelect,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SearchBox,
  Segmented,
  SelectInput,
  StatusBadge,
  TextArea,
  TextInput,
  Toolbar,
  formatDate,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Network, Pencil, Plus } from '../../components/icons';
import { STATUS_OPTIONS, Unassigned, plural } from './shared';

/**
 * ADM-03 clusters: a cluster groups one or more gated communities; a community
 * is in exactly one cluster at a time and every move keeps its history.
 */
export function ClustersPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<Cluster>(['clusters'], `/v1/admin/clusters${qs({ q, status, limit: 50 })}`);
  const [editing, setEditing] = useState<Cluster | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const manage = isGlobalScope(me);
  const filtered = Boolean(q || status);
  const opened = list.rows?.find((c) => c.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Clusters"
        description="Operating groups of one or more gated communities, used for workforce and admin responsibility. A community is in one cluster at a time."
        actions={
          manage && can(me, 'locations', 'create') ? (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add cluster
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name or code" />
        <FilterSelect value={status} onChange={setStatus} label="Status" options={STATUS_OPTIONS} />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Clusters"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => setOpenId(c.id)}
          emptyTitle={filtered ? 'No clusters match these filters' : 'No clusters yet'}
          emptyBody={
            filtered
              ? 'Clear the search or status filter.'
              : manage
                ? 'Create a cluster, then add communities to it.'
                : 'You have not been given any cluster yet. Ask your Super Admin.'
          }
          columns={[
            {
              header: 'Cluster',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">
                    {c.code}
                    {c.description ? ` · ${c.description}` : ''}
                  </span>
                </span>
              ),
            },
            {
              header: 'Communities',
              className: 'num',
              cell: (c) => (c.communityCount ? c.communityCount : <span className="faint">None</span>),
            },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (c) => (
                <div className="row">
                  <Button variant="secondary" size="sm" onClick={() => setOpenId(c.id)}>
                    View communities
                  </Button>
                </div>
              ),
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
      <ClusterDrawer
        cluster={opened}
        onClose={() => setOpenId(null)}
        onEdit={manage && can(me, 'locations', 'edit') && opened ? () => setEditing(opened) : undefined}
      />
      {editing ? <ClusterEditor cluster={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/* ---------- Cluster detail (member communities) ---------- */

function ClusterDrawer({ cluster, onClose, onEdit }: { cluster: Cluster | null; onClose: () => void; onEdit: (() => void) | undefined }) {
  const me = useMe();
  const [adding, setAdding] = useState(false);
  const members = useQuery({
    queryKey: ['clusters', cluster?.id, 'communities'],
    queryFn: () => api<{ items: ClusterCommunityMember[] }>(`/v1/admin/clusters/${cluster!.id}/communities`),
    enabled: Boolean(cluster),
    select: (d) => d.items,
  });
  const canAssign = can(me, 'locations', 'edit') && cluster?.status === 'ACTIVE';
  const flats = (members.data ?? []).reduce((n, m) => n + m.flatCount, 0);
  const towers = (members.data ?? []).reduce((n, m) => n + m.towerCount, 0);

  return (
    <>
      <Drawer
        open={Boolean(cluster)}
        onClose={onClose}
        title={cluster?.name ?? ''}
        subtitle={cluster ? `${cluster.code}${cluster.status === 'INACTIVE' ? ' · Inactive' : ''}` : undefined}
        footer={
          cluster ? (
            <>
              {onEdit ? (
                <Button variant="secondary" icon={Pencil} onClick={onEdit}>
                  Edit cluster
                </Button>
              ) : null}
              {canAssign ? (
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  Add communities
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {cluster ? (
          <div className="stack">
            {cluster.description ? <p className="muted" style={{ margin: 0 }}>{cluster.description}</p> : null}
            {members.data ? (
              <dl className="details" style={{ margin: 0 }}>
                <div>
                  <dt>Communities</dt>
                  <dd>{members.data.length}</dd>
                </div>
                <div>
                  <dt>Towers</dt>
                  <dd>{towers.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Flats</dt>
                  <dd>{flats.toLocaleString('en-IN')}</dd>
                </div>
              </dl>
            ) : null}
            {cluster.status === 'INACTIVE' ? (
              <InfoBanner tone="warning">This cluster is inactive. Re-activate it before adding communities.</InfoBanner>
            ) : null}
            <Panel title="Member communities" flush>
              <DataTable
                flush
                caption={`Communities in ${cluster.name}`}
                loading={members.isLoading}
                error={members.error}
                rows={members.data}
                rowKey={(m) => m.communityId}
                emptyTitle="No communities in this cluster yet"
                emptyBody={canAssign ? 'Use “Add communities” to bring communities into this cluster.' : undefined}
                columns={[
                  {
                    header: 'Community',
                    cell: (m) => (
                      <span className="primary-cell">
                        <Link to={`/locations/communities/${m.communityId}`}>{m.name}</Link>
                        <span className="sub">
                          {m.cityName} · <StatusLabel status={m.status} />
                        </span>
                      </span>
                    ),
                  },
                  { header: 'Towers', className: 'num', cell: (m) => m.towerCount },
                  { header: 'Flats', className: 'num', cell: (m) => m.flatCount.toLocaleString('en-IN') },
                  { header: 'Since', cell: (m) => <span title={m.reason}>{formatDate(m.since)}</span> },
                ]}
              />
            </Panel>
            <div>
              <ButtonLink to={`/locations/communities?clusterId=${cluster.id}`} variant="ghost" size="sm" icon={Network}>
                Open in communities list
              </ButtonLink>
            </div>
          </div>
        ) : null}
      </Drawer>
      {adding && cluster ? (
        <AddCommunities cluster={cluster} memberIds={(members.data ?? []).map((m) => m.communityId)} onClose={() => setAdding(false)} />
      ) : null}
    </>
  );
}

function StatusLabel({ status }: { status: string }) {
  return <>{status.charAt(0) + status.slice(1).toLowerCase()}</>;
}

/* ---------- Add communities (assign / move, with reason and confirm) ---------- */

function AddCommunities({ cluster, memberIds, onClose }: { cluster: Cluster; memberIds: string[]; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const global = isGlobalScope(me);
  const [scope, setScope] = useState<'unassigned' | 'all'>(global ? 'unassigned' : 'all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [selected, setSelected] = useState<Map<string, Community>>(new Map());
  const [reason, setReason] = useState('');
  const list = usePagedList<Community>(
    ['communities', 'cluster-picker'],
    `/v1/admin/communities${qs({ q, unassigned: scope === 'unassigned' ? 'true' : undefined, limit: 25 })}`,
  );

  const assign = useMutation({
    mutationFn: () =>
      api<AssignClusterCommunitiesResult>(`/v1/admin/clusters/${cluster.id}/communities`, {
        method: 'POST',
        body: { communityIds: [...selected.keys()], reason: reason.trim() },
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      await qc.invalidateQueries({ queryKey: ['communities'] });
      const parts = [r.assigned ? `${r.assigned} assigned` : '', r.moved ? `${r.moved} moved` : '', r.skipped ? `${r.skipped} already here` : ''].filter(Boolean);
      toast(`${cluster.name}: ${parts.join(', ') || 'no changes'}`);
      onClose();
    },
  });

  const toggle = (c: Community) =>
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });

  const picked = [...selected.values()];
  const moving = picked.filter((c) => c.clusterId && c.clusterId !== cluster.id);
  const reasonOk = reason.trim().length >= 3;

  const submit = async () => {
    const n = picked.length;
    const r = await confirm({
      title: `Move ${plural(n, 'community', 'communities')} into ${cluster.name}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            Move {plural(n, 'community', 'communities')} into {cluster.name}? Their history is kept.
          </p>
          {moving.length ? (
            <p className="muted" style={{ margin: 0 }}>
              {moving.length === 1 ? `${moving[0]!.name} leaves ${moving[0]!.clusterName}.` : `${moving.length} of them leave their current cluster.`} Admins scoped
              only to the old cluster will stop seeing {moving.length === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
        </div>
      ),
      confirmLabel: `Move ${plural(n, 'community', 'communities')}`,
      tone: moving.length ? 'warning' : 'default',
    });
    if (r.ok) assign.mutate();
  };

  const err = assign.error instanceof ApiError ? assign.error : null;

  return (
    <Modal
      open
      wide
      title={`Add communities to ${cluster.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto' }}>
            {picked.length ? `${plural(picked.length, 'community', 'communities')} selected` : 'Nothing selected'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={assign.isPending} disabled={picked.length === 0 || !reasonOk}>
            Move into cluster
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={assign.error} />
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} label="Search name or code" />
          {global ? (
            <Segmented
              label="Which communities"
              value={scope}
              onChange={setScope}
              items={[
                { value: 'unassigned', label: 'Unassigned' },
                { value: 'all', label: 'All communities' },
              ]}
            />
          ) : null}
        </Toolbar>
        {list.error ? <ErrorBanner error={list.error} /> : null}
        {list.isLoading ? (
          <p className="muted">Loading communities…</p>
        ) : list.rows && list.rows.length ? (
          <ul className="loc-picklist" aria-label="Communities">
            {list.rows.map((c) => {
              const here = c.clusterId === cluster.id || memberIds.includes(c.id);
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label className="loc-pick" data-checked={checked} data-disabled={here}>
                    <input type="checkbox" checked={checked} disabled={here} onChange={() => toggle(c)} />
                    <span className="loc-pick-main">
                      <strong>{c.name}</strong>
                      <span className="sub">
                        {c.code} · {c.cityName}
                      </span>
                    </span>
                    {here ? (
                      <span className="badge badge-teal">Already here</span>
                    ) : c.clusterName ? (
                      <span className="badge badge-warning">Moves from {c.clusterName}</span>
                    ) : (
                      <Unassigned />
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">
            {q ? `No communities match “${q}”.` : scope === 'unassigned' ? 'Every community is already in a cluster.' : 'No communities found.'}
          </p>
        )}
        {list.hasMore ? (
          <div>
            <Button variant="ghost" size="sm" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          </div>
        ) : null}
        <TextArea
          label="Reason (recorded in each community’s history and the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          required
          error={err?.field('reason')}
          hint="At least 3 characters, e.g. “Rebalancing the Whitefield supervisors”."
        />
      </div>
    </Modal>
  );
}

/* ---------- Create / edit ---------- */

function ClusterEditor({ cluster, onClose }: { cluster: Cluster | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
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
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['clusters'] });
      toast(cluster ? `${c.name} saved` : `${c.name} created`);
      onClose();
    },
  });
  const submit = async () => {
    if (cluster && cluster.status === 'ACTIVE' && status === 'INACTIVE') {
      const r = await confirm({
        title: `Deactivate ${cluster.name}?`,
        body: 'Communities can no longer be added to this cluster. Move its communities to another cluster first. You can re-activate it later.',
        confirmLabel: 'Deactivate cluster',
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
      title={cluster ? `Edit ${cluster.name}` : 'Add cluster'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={save.isPending} disabled={!name.trim() || !code.trim()}>
            {cluster ? 'Save changes' : 'Create cluster'}
          </Button>
        </>
      }
    >
      <div className="stack">
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
      </div>
    </Modal>
  );
}
