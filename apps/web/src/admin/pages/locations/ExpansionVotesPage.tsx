'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExpansionVoteAggregate } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import { useMe } from '../../auth/AuthProvider';
import { DataTable, Facts, FilterSelect, PageHeader, Panel, SearchBox, Toolbar, formatDate, formatDateTime } from '../../components/ui';
import { NoAccessPage } from '../HomePage';

type Sort = 'votes' | 'recent' | 'oldest' | 'name';
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'votes', label: 'Most votes' },
  { value: 'recent', label: 'Most recent vote' },
  { value: 'oldest', label: 'Oldest first vote' },
  { value: 'name', label: 'Name (A–Z)' },
];

/**
 * ADM-03A: residents vote for cities/communities Nestovin does not serve yet.
 * Votes are interest signals only; they never create a location, booking or
 * payment, and no automatic threshold triggers anything.
 */
export function ExpansionVotesPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [cityText, setCityText] = useState('');
  const [level, setLevel] = useState('');
  const [sort, setSort] = useState<Sort>('votes');
  const q = useDebounced(search.trim());
  const city = useDebounced(cityText.trim());
  const votes = useQuery({
    queryKey: ['expansion-votes', { q, city, level, sort }],
    queryFn: () => api<{ items: ExpansionVoteAggregate[] }>(`/v1/admin/expansion-votes${qs({ q, city, level, sort })}`),
    enabled: me.isSuperAdmin,
    placeholderData: (prev) => prev,
  });
  if (!me.isSuperAdmin) return <NoAccessPage />;
  const items = votes.data?.items ?? [];
  const total = items.reduce((n, v) => n + v.voteCount, 0);
  const latest = items.reduce<string | null>((m, v) => (!m || v.lastVoteAt > m ? v.lastVoteAt : m), null);
  const filtered = Boolean(q || city || level);

  return (
    <>
      <PageHeader
        title="Expansion votes"
        description="Interest from residents in places Nestovin does not serve yet. Votes inform your decision; nothing happens automatically."
      />
      {votes.data ? (
        <div style={{ marginBottom: 16 }}>
        <Facts
          items={[
            { label: filtered ? 'Votes shown' : 'Votes', value: total.toLocaleString('en-IN') },
            { label: 'Cities asked for', value: items.filter((v) => v.level === 'CITY').length },
            { label: 'Communities asked for', value: items.filter((v) => v.level === 'COMMUNITY').length },
            { label: 'Latest vote', value: latest ? formatDate(latest) : '—' },
          ]}
        />
        </div>
      ) : null}
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search city or community" />
        <span className="search-field">
          <input
            type="search"
            className="input input-compact"
            placeholder="City contains…"
            aria-label="Filter by city"
            value={cityText}
            onChange={(e) => setCityText(e.target.value)}
          />
        </span>
        <FilterSelect
          value={level}
          onChange={setLevel}
          label="Level"
          options={[
            { value: 'CITY', label: 'City' },
            { value: 'COMMUNITY', label: 'Community' },
          ]}
        />
        <select className="input input-compact" aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Expansion votes"
          loading={votes.isLoading}
          error={votes.error}
          rows={votes.data?.items}
          rowKey={(v) => `${v.level}:${v.cityName}:${v.communityName ?? ''}`}
          emptyTitle={filtered ? 'No votes match these filters' : 'No votes yet'}
          emptyBody={filtered ? 'Clear the search, city or level filter.' : 'Votes appear here once residents start using the Resident app.'}
          columns={[
            {
              header: 'Place',
              cell: (v) => (
                <span className="primary-cell">
                  {v.level === 'COMMUNITY' ? (v.communityName ?? 'Unnamed community') : v.cityName}
                  <span className="sub">{v.level === 'COMMUNITY' ? v.cityName : 'Whole city'}</span>
                </span>
              ),
            },
            {
              header: 'Level',
              cell: (v) => <span className={`badge badge-${v.level === 'CITY' ? 'teal' : 'neutral'}`}>{v.level === 'CITY' ? 'City' : 'Community'}</span>,
            },
            { header: 'Votes', className: 'num', cell: (v) => <strong>{v.voteCount.toLocaleString('en-IN')}</strong> },
            { header: 'First vote', cell: (v) => <span className="muted">{formatDate(v.firstVoteAt)}</span> },
            { header: 'Latest vote', cell: (v) => formatDateTime(v.lastVoteAt) },
          ]}
        />
      </Panel>
    </>
  );
}
