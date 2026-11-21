'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Community, ImportBatch } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useNavigate } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import { useQueueCounts } from '../../components/Layout';
import {
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  FilterSelect,
  InfoBanner,
  PageHeader,
  Panel,
  SearchBox,
  Skeleton,
  StatusBadge,
  Toolbar,
  formatDateTime,
} from '../../components/ui';
import { FileSpreadsheet, ShieldCheck, Upload } from '../../components/icons';
import { BatchBadge } from '../setup/ImportStep';
import { CITY_SOURCE, COMMUNITY_STATUS_OPTIONS, SearchPicker, Unassigned } from './shared';

const importPath = (id: string) => `/locations/communities/${id}/setup?step=import&from=migration`;

function useBatches(communityId: string) {
  // Same key as the wizard's import step, so both screens share one cache.
  return useQuery({
    queryKey: ['setup', communityId, 'imports'],
    queryFn: () => api<{ items: ImportBatch[] }>(`/v1/admin/communities/${communityId}/import-batches`),
    select: (d) => d.items,
    staleTime: 30_000,
  });
}

/**
 * ADM-04 Community migration: one place to see every community's structure
 * import (towers and flats from Excel) and jump into the import step.
 */
export function MigrationPage() {
  const me = useMe();
  const navigate = useNavigate();
  const { counts } = useQueueCounts();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [cityId, setCityId] = useState('');
  const q = useDebounced(search);
  const allowed = can(me, 'community_migration', 'view');
  const list = usePagedList<Community>(['communities', 'migration'], `/v1/admin/communities${qs({ q, status, cityId, limit: 25 })}`, allowed);
  const waiting = counts.get('/locations/migration') ?? 0;

  if (!allowed) {
    return (
      <>
        <PageHeader title="Community migration" description="Import each community’s towers and flats from Excel." />
        <EmptyState title="You do not have access to community migration" icon={ShieldCheck}>
          Ask your Super Admin for the Community migration module.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Community migration"
        description="Import each community’s towers and flats from Excel. Every batch is checked, approved and then committed; nothing changes until the commit."
      />
      {waiting > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <InfoBanner tone="warning">
            {waiting === 1 ? '1 import is' : `${waiting} imports are`} waiting for a decision. Look for “Waiting for approval” or “Approved, not committed” below.
          </InfoBanner>
        </div>
      ) : null}
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search community name or code" />
        <SearchPicker compact source={CITY_SOURCE} label="City" emptyLabel="City: all" value={cityId} onChange={(v) => setCityId(v)} />
        <FilterSelect value={status} onChange={setStatus} label="Community status" options={COMMUNITY_STATUS_OPTIONS} />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Communities and their latest structure import"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(importPath(c.id))}
          emptyTitle={q || status || cityId ? 'No communities match these filters' : 'No communities yet'}
          emptyBody={q || status || cityId ? 'Clear a filter to see more.' : 'Create a community first, then import its structure here.'}
          columns={[
            {
              header: 'Community',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">
                    {c.cityName} · {c.clusterName ?? <Unassigned />}
                  </span>
                </span>
              ),
            },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            { header: 'Latest import', cell: (c) => <LatestImport communityId={c.id} /> },
            { header: 'Rows', className: 'num', cell: (c) => <LatestRows communityId={c.id} /> },
            { header: 'Actions', className: 'actions', cell: (c) => <ImportAction community={c} /> },
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
    </>
  );
}

function LatestImport({ communityId }: { communityId: string }) {
  const batches = useBatches(communityId);
  if (batches.isLoading) return <Skeleton height={16} width={120} />;
  if (batches.error) return <span className="faint">Could not load</span>;
  const b = batches.data?.[0];
  if (!b) return <span className="muted">Not imported yet</span>;
  return (
    <span className="primary-cell">
      <BatchBadge status={b.status} />
      <span className="sub">
        {b.source === 'DASHBOARD' ? 'Dashboard table' : b.fileName} · {formatDateTime(b.uploadedAt)}
      </span>
    </span>
  );
}

function LatestRows({ communityId }: { communityId: string }) {
  const batches = useBatches(communityId);
  const b = batches.data?.[0];
  if (!b) return <span className="faint">—</span>;
  return (
    <span className="primary-cell">
      {b.totalRows.toLocaleString('en-IN')}
      {b.errorRows ? (
        <span className="sub" style={{ color: 'var(--red)' }}>
          {b.errorRows.toLocaleString('en-IN')} with errors
        </span>
      ) : null}
    </span>
  );
}

function ImportAction({ community }: { community: Community }) {
  const batches = useBatches(community.id);
  const latest = batches.data?.[0];
  const pending = batches.data?.some((b) => b.status === 'VALIDATED' || b.status === 'APPROVED');
  const committed = batches.data?.some((b) => b.status === 'COMMITTED');
  return (
    <div className="row">
      {pending ? (
        <ButtonLink to={importPath(community.id)} variant="primary" size="sm" icon={FileSpreadsheet}>
          Review import
        </ButtonLink>
      ) : (
        <ButtonLink to={importPath(community.id)} variant={committed || latest ? 'secondary' : 'primary'} size="sm" icon={Upload}>
          {committed ? 'Re-import structure' : 'Import structure'}
        </ButtonLink>
      )}
    </div>
  );
}
