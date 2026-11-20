'use client';

import { useQuery } from '@tanstack/react-query';
import type { Cluster, DataScope, Role } from '@nestovin/contracts';
import { api, type Page } from '../../lib/api';

export interface CatalogueModule {
  key: string;
  ref: string;
  label: string;
  actions: string[];
  grantable: boolean;
}

export type GrantPair = { module: string; action: string };

export const grantKey = (g: GrantPair) => `${g.module}:${g.action}`;

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

/** Active clusters for scope selection (Super Admin sees all). */
export function useActiveClusters() {
  return useQuery({
    queryKey: ['clusters', 'active-all'],
    queryFn: () => api<Page<Cluster>>('/v1/admin/clusters?status=ACTIVE&limit=100'),
  });
}

/** Module × action checkbox grid. Only grantable modules and their supported actions are shown. */
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

  function toggle(module: string, action: string) {
    const k = `${module}:${action}`;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(
      [...next].map((x) => {
        const [m, a] = x.split(':') as [string, string];
        return { module: m, action: a };
      }),
    );
  }

  function toggleRow(m: CatalogueModule) {
    const all = m.actions.every((a) => selected.has(`${m.key}:${a}`));
    const next = new Set(selected);
    for (const a of m.actions) {
      if (all) next.delete(`${m.key}:${a}`);
      else next.add(`${m.key}:${a}`);
    }
    onChange(
      [...next].map((x) => {
        const [mm, a] = x.split(':') as [string, string];
        return { module: mm, action: a };
      }),
    );
  }

  return (
    <div className="table-wrap">
      <table className="table perm-grid">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Module</th>
            {allActions.map((a) => (
              <th key={a} scope="col">
                {a.replace('_', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grantable.map((m) => (
            <tr key={m.key}>
              <th scope="row" style={{ textAlign: 'left', textTransform: 'none', letterSpacing: 0, background: 'transparent' }}>
                <button type="button" className="btn btn-ghost" onClick={() => toggleRow(m)} disabled={disabled} title="Toggle all actions">
                  {m.ref} · {m.label}
                </button>
              </th>
              {allActions.map((a) =>
                m.actions.includes(a) ? (
                  <td key={a}>
                    <input
                      type="checkbox"
                      aria-label={`${m.label}: ${a}`}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Data scope picker: all clusters or a specific list. */
export function ScopePicker({
  value,
  onChange,
  clusters,
  error,
}: {
  value: DataScope;
  onChange: (s: DataScope) => void;
  clusters: Cluster[];
  error?: string | undefined;
}) {
  const selected = value.type === 'CLUSTERS' ? new Set(value.clusterIds) : new Set<string>();
  return (
    <fieldset>
      <legend>Data scope</legend>
      <p className="field-hint">Which clusters this admin can see and act on. Scope is separate from roles.</p>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <label className="checkbox">
          <input type="radio" name="scope" checked={value.type === 'GLOBAL'} onChange={() => onChange({ type: 'GLOBAL' })} />
          All clusters (including communities not yet assigned to a cluster)
        </label>
        <label className="checkbox">
          <input
            type="radio"
            name="scope"
            checked={value.type === 'CLUSTERS'}
            onChange={() => onChange({ type: 'CLUSTERS', clusterIds: value.type === 'CLUSTERS' ? value.clusterIds : [] })}
          />
          Specific clusters
        </label>
        {value.type === 'CLUSTERS' ? (
          <div className="row" style={{ paddingLeft: 24 }}>
            {clusters.length === 0 ? <span className="muted">No active clusters yet. Create one under Locations → Clusters.</span> : null}
            {clusters.map((c) => (
              <label key={c.id} className="checkbox chip">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    onChange({ type: 'CLUSTERS', clusterIds: [...next] });
                  }}
                />
                {c.name} ({c.code})
              </label>
            ))}
          </div>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </fieldset>
  );
}
