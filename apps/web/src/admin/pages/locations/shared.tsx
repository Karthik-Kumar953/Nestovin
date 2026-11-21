'use client';

import { useEffect, useRef, useState } from 'react';
import type { City, Cluster, Community } from '@nestovin/contracts';
import { qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { Field, SearchBox } from '../../components/ui';
import { Check, ChevronsUpDown } from '../../components/icons';
import './locations.css';

/* ---------- Search picker (dropdowns that must reach past the first 100 rows) ---------- */

export interface PickerOption {
  value: string;
  label: string;
  sub?: string | undefined;
}

export interface PickerSource<T> {
  key: string;
  path: (q: string) => string;
  toOption: (row: T) => PickerOption;
}

export const CITY_SOURCE: PickerSource<City> = {
  key: 'cities',
  path: (q) => `/v1/admin/cities${qs({ q, status: 'ACTIVE', limit: 25 })}`,
  toOption: (c) => ({ value: c.id, label: c.name, sub: c.state }),
};

export const CLUSTER_SOURCE: PickerSource<Cluster> = {
  key: 'clusters',
  path: (q) => `/v1/admin/clusters${qs({ q, status: 'ACTIVE', limit: 25 })}`,
  toOption: (c) => ({ value: c.id, label: c.name, sub: c.code }),
};

export const COMMUNITY_SOURCE: PickerSource<Community> = {
  key: 'communities',
  path: (q) => `/v1/admin/communities${qs({ q, limit: 25 })}`,
  toOption: (c) => ({ value: c.id, label: c.name, sub: `${c.code} · ${c.cityName}` }),
};

/**
 * A searchable single-select backed by a paged API list (`q` + "Load more"),
 * so the 101st city or cluster is always reachable.
 */
export function SearchPicker<T>({
  source,
  value,
  selectedLabel,
  onChange,
  label,
  emptyLabel,
  exclude,
  compact,
  disabled,
  required,
  hint,
  error,
}: {
  source: PickerSource<T>;
  value: string;
  /** Label for the current value (pickers do not fetch single records). */
  selectedLabel?: string | null | undefined;
  onChange: (value: string, option: PickerOption | null) => void;
  /** Accessible name; also the visible field label when not compact. */
  label: string;
  /** Text for "no value" (e.g. "City: all"). When set, the list offers a way back to it. */
  emptyLabel: string;
  exclude?: string[];
  compact?: boolean;
  disabled?: boolean;
  required?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<PickerOption | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const shown = value ? (known?.value === value ? known.label : (selectedLabel ?? 'Selected')) : emptyLabel;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const trigger = (id?: string, describedBy?: string) => (
    <div
      className="loc-picker"
      ref={wrap}
      style={compact ? undefined : { display: 'flex', flexDirection: 'column' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        id={id}
        type="button"
        className={`input loc-picker-trigger ${compact ? 'input-compact' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={compact ? `${label}: ${shown}` : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? undefined : 'muted'}>{shown}</span>
        <ChevronsUpDown size={14} />
      </button>
      {open ? (
        <PickerPopover
          inline={!compact}
          source={source}
          label={label}
          value={value}
          emptyLabel={emptyLabel}
          exclude={exclude}
          onPick={(o) => {
            setKnown(o);
            onChange(o?.value ?? '', o);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );

  if (compact) return trigger();
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(id, describedBy) => trigger(id, describedBy)}
    </Field>
  );
}

function PickerPopover<T>({
  inline,
  source,
  label,
  value,
  emptyLabel,
  exclude,
  onPick,
}: {
  inline: boolean;
  source: PickerSource<T>;
  label: string;
  value: string;
  emptyLabel: string;
  exclude?: string[] | undefined;
  onPick: (o: PickerOption | null) => void;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const list = usePagedList<T>([source.key, 'picker'], source.path(q));
  const options = (list.rows ?? []).map(source.toOption).filter((o) => !exclude?.includes(o.value));
  return (
    <div className={`loc-picker-pop ${inline ? 'loc-picker-pop-inline' : ''}`}>
      <SearchBox value={search} onChange={setSearch} label={`Search ${label.toLowerCase()}`} />
      <ul className="loc-picker-list" role="listbox" aria-label={label}>
        <li>
          <button type="button" role="option" aria-selected={!value} className="loc-picker-option" onClick={() => onPick(null)}>
            <span className="muted">{emptyLabel}</span>
            {!value ? <Check size={14} /> : null}
          </button>
        </li>
        {options.map((o) => (
          <li key={o.value}>
            <button type="button" role="option" aria-selected={o.value === value} className="loc-picker-option" onClick={() => onPick(o)}>
              <span>
                {o.label}
                {o.sub ? <span className="sub">{o.sub}</span> : null}
              </span>
              {o.value === value ? <Check size={14} /> : null}
            </button>
          </li>
        ))}
      </ul>
      {list.isLoading ? <p className="loc-picker-note">Loading…</p> : null}
      {list.error ? <p className="loc-picker-note">Could not load the list. Try again.</p> : null}
      {!list.isLoading && !list.error && options.length === 0 ? <p className="loc-picker-note">No matches for “{search}”.</p> : null}
      {list.hasMore ? (
        <button type="button" className="loc-picker-option" onClick={list.loadMore} disabled={list.loadingMore}>
          <span className="muted">{list.loadingMore ? 'Loading…' : 'Load more'}</span>
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Small shared bits ---------- */

/** Dashed = unassigned (system rule). */
export function Unassigned({ children = 'Unassigned' }: { children?: string }) {
  return <span className="loc-unassigned">{children}</span>;
}

export const COMMUNITY_STATUS_OPTIONS = ['DRAFT', 'IMPORTED', 'CONFIGURED', 'ACTIVE', 'INACTIVE'].map((s) => ({
  value: s,
  label: s.charAt(0) + s.slice(1).toLowerCase(),
}));

export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
