'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Cluster, DataScope, Role } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { Button, SearchBox, Skeleton } from '../../components/ui';
import { Globe, Network, X } from '../../components/icons';

export interface CatalogueModule {
  key: string;
  ref: string;
  label: string;
  actions: string[];
  grantable: boolean;
}

export type GrantPair = { module: string; action: string };

export const grantKey = (g: GrantPair) => `${g.module}:${g.action}`;

export const actionText = (a: string) => {
  const s = a.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function useCatalogue() {
  return useQuery({
    queryKey: ['permission-catalogue'],
    queryFn: () => api<{ modules: CatalogueModule[] }>('/v1/admin/permission-catalogue'),
    staleTime: Infinity,
  });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<{ items: Role[] }>('/v1/admin/roles') });
}

/** Every cluster's name by id (unpaged option list), for showing a scope by name. */
export function useClusterNames() {
  const q = useQuery({
    queryKey: ['cluster-options'],
    queryFn: () => api<{ items: { id: string; name: string; code: string }[] }>('/v1/admin/cluster-options'),
  });
  const map = useMemo(() => new Map((q.data?.items ?? []).map((c) => [c.id, c])), [q.data]);
  return { ...q, map };
}

/** Module × action checkbox grid. Only grantable modules and their supported actions are shown. Scrolls sideways on phones. */
export function PermissionGrid({
  modules,
  value,
  onChange,
  disabled,
  caption,
}: {
  modules: CatalogueModule[];
  value: GrantPair[];
  onChange: (next: GrantPair[]) => void;
  disabled?: boolean;
  caption: string;
}) {
  const allActions = [...new Set(modules.flatMap((m) => m.actions))];
  const selected = new Set(value.map(grantKey));
  const grantable = modules.filter((m) => m.grantable);

  const emit = (next: Set<string>) =>
    onChange(
      [...next].map((x) => {
        const [m, a] = x.split(':') as [string, string];
        return { module: m, action: a };
      }),
    );

  function toggle(module: string, action: string) {
    const k = `${module}:${action}`;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    emit(next);
  }

  function toggleRow(m: CatalogueModule) {
    const all = m.actions.every((a) => selected.has(`${m.key}:${a}`));
    const next = new Set(selected);
    for (const a of m.actions) {
      if (all) next.delete(`${m.key}:${a}`);
      else next.add(`${m.key}:${a}`);
    }
    emit(next);
  }

  return (
    <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: 'none' }}>
      <table className="table perm-grid" style={{ minWidth: 260 + allActions.length * 84 }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" style={{ left: 0, zIndex: 3 }}>
              Module
            </th>
            {allActions.map((a) => (
              <th key={a} scope="col">
                {actionText(a)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grantable.map((m) => {
            const count = m.actions.filter((a) => selected.has(`${m.key}:${a}`)).length;
            return (
              <tr key={m.key}>
                <th
                  scope="row"
                  style={{ position: 'sticky', left: 0, top: 'auto', zIndex: 1, textAlign: 'left', fontWeight: 500, color: 'var(--ink)', background: 'var(--surface)', whiteSpace: 'normal', minWidth: 220 }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', height: 'auto', paddingBlock: 4 }}
                    onClick={() => toggleRow(m)}
                    disabled={disabled}
                    title="Tick or clear every action for this module"
                  >
                    <span>
                      {m.label}
                      <span className="faint" style={{ display: 'block', fontSize: 11.5, fontWeight: 400 }}>
                        {m.ref} · {count}/{m.actions.length}
                      </span>
                    </span>
                  </button>
                </th>
                {allActions.map((a) =>
                  m.actions.includes(a) ? (
                    <td key={a}>
                      <input
                        type="checkbox"
                        aria-label={`${m.label}: ${actionText(a)}`}
                        checked={selected.has(`${m.key}:${a}`)}
                        onChange={() => toggle(m.key, a)}
                        disabled={disabled}
                      />
                    </td>
                  ) : (
                    <td key={a} className="na" aria-label="Not applicable">
                      –
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Data scope: all clusters, or a searchable multi-select of specific clusters. */
export function ScopePicker({ value, onChange, error }: { value: DataScope; onChange: (s: DataScope) => void; error?: string | undefined }) {
  const names = useClusterNames();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const specific = value.type === 'CLUSTERS';
  const list = usePagedList<Cluster>(['clusters', 'scope-picker'], `/v1/admin/clusters${qs({ status: 'ACTIVE', q, limit: 50 })}`, specific);
  const selected = value.type === 'CLUSTERS' ? value.clusterIds : [];
  const selectedSet = new Set(selected);
  const nameOf = (id: string) => {
    const c = names.map.get(id) ?? list.rows?.find((x) => x.id === id);
    return c ? `${c.name} (${c.code})` : 'Unknown cluster';
  };
  const toggle = (id: string) => {
    const next = selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange({ type: 'CLUSTERS', clusterIds: next });
  };

  return (
    <fieldset className="field" style={{ margin: 0 }}>
      <legend className="field-label">Data scope</legend>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Which clusters this admin can see and act on. Scope is set per admin, separately from roles.
      </p>
      <div className="grid-2" style={{ gap: 8, marginTop: 8 }}>
        <label className={`card checkbox`} style={{ alignItems: 'flex-start', borderColor: !specific ? 'var(--teal)' : undefined }}>
          <input type="radio" name="scope" checked={!specific} onChange={() => onChange({ type: 'GLOBAL' })} />
          <span>
            <strong>
              <Globe size={14} aria-hidden /> All clusters
            </strong>
            <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
              Including communities not yet in a cluster, and any cluster added later.
            </span>
          </span>
        </label>
        <label className="card checkbox" style={{ alignItems: 'flex-start', borderColor: specific ? 'var(--teal)' : undefined }}>
          <input type="radio" name="scope" checked={specific} onChange={() => onChange({ type: 'CLUSTERS', clusterIds: selected })} />
          <span>
            <strong>
              <Network size={14} aria-hidden /> Specific clusters
            </strong>
            <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
              Only the clusters you choose below.
            </span>
          </span>
        </label>
      </div>
      {specific ? (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <div aria-live="polite">
            {selected.length ? (
              selected.map((id) => (
                <span key={id} className="chip">
                  {nameOf(id)}
                  <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} aria-label={`Remove ${nameOf(id)}`} onClick={() => toggle(id)}>
                    <X size={12} />
                  </button>
                </span>
              ))
            ) : (
              <span className="muted">No clusters chosen yet.</span>
            )}
          </div>
          <SearchBox value={search} onChange={setSearch} label="Search clusters by name or code" />
          <div className="table-wrap" style={{ maxHeight: 240 }} role="group" aria-label="Clusters">
            {list.isLoading ? (
              <div className="stack-sm" style={{ padding: 12 }}>
                <Skeleton height={16} />
                <Skeleton height={16} />
              </div>
            ) : list.rows?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 4 }}>
                {list.rows.map((c) => (
                  <li key={c.id}>
                    <label className="checkbox" style={{ padding: '6px 8px' }}>
                      <input type="checkbox" checked={selectedSet.has(c.id)} onChange={() => toggle(c.id)} />
                      <span>
                        {c.name} <span className="muted">({c.code})</span>
                        <span className="faint" style={{ fontSize: 12 }}>
                          {' '}
                          · {c.communityCount} {c.communityCount === 1 ? 'community' : 'communities'}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ padding: 12, margin: 0 }}>
                {q ? 'No active clusters match.' : 'No active clusters yet. Create one under Locations → Clusters.'}
              </p>
            )}
            {list.hasMore ? (
              <div className="table-footer">
                <Button variant="ghost" size="sm" onClick={list.loadMore} busy={list.loadingMore}>
                  Load more clusters
                </Button>
              </div>
            ) : null}
          </div>
          {list.error ? <p className="field-error">Clusters could not be loaded.</p> : null}
        </div>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** "All clusters" or the chosen cluster names. */
export function scopeText(scope: DataScope, isSuperAdmin: boolean, nameOf: (id: string) => string): string {
  if (isSuperAdmin || scope.type === 'GLOBAL') return 'All clusters';
  return scope.clusterIds.map(nameOf).join(', ') || 'No clusters';
}

/** Role checkboxes with each role's description and size. */
export function RolePicker({ roles, value, onChange, loading }: { roles: Role[] | undefined; value: string[]; onChange: (ids: string[]) => void; loading?: boolean }) {
  return (
    <fieldset className="field" style={{ margin: 0 }}>
      <legend className="field-label">Roles</legend>
      <p className="field-hint" style={{ marginTop: 0 }}>
        The admin gets every permission in every role ticked here.
      </p>
      {loading ? (
        <Skeleton height={40} />
      ) : roles?.length ? (
        <div className="grid-2" style={{ gap: 8, marginTop: 8 }}>
          {roles.map((r) => {
            const on = value.includes(r.id);
            return (
              <label key={r.id} className="card checkbox" style={{ alignItems: 'flex-start', borderColor: on ? 'var(--teal)' : undefined }}>
                <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])} />
                <span>
                  <strong>{r.name}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                    {r.description ? `${r.description} · ` : ''}
                    {r.grants.length} {r.grants.length === 1 ? 'permission' : 'permissions'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          No roles yet. You can continue without one and add roles later, or create roles first under Roles.
        </p>
      )}
    </fieldset>
  );
}
