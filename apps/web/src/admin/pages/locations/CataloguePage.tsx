'use client';

import { useState } from 'react';
import type { Community } from '@nestovin/contracts';
import { qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useNavigate } from '../../lib/router';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  SearchBox,
  Skeleton,
  StatusBadge,
  Toolbar,
  formatDate,
} from '../../components/ui';
import { ShieldCheck, Stamp } from '../../components/icons';
import { useVersions } from '../setup/SetupPage';
import { CITY_SOURCE, COMMUNITY_STATUS_OPTIONS, SearchPicker } from './shared';

const stepPath = (id: string, step: 'plans' | 'prices' | 'publish') => `/locations/communities/${id}/setup?step=${step}&from=catalogue`;

/**
 * ADM-07 Catalogue & pricing: every community's catalogue at a glance (published
 * version, draft in progress, effective date) with links into the setup wizard.
 * Each community is priced on its own; nothing is copied from a global list.
 */
export function CataloguePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [cityId, setCityId] = useState('');
  const q = useDebounced(search);
  const allowed = can(me, 'catalogue_pricing', 'view');
  const list = usePagedList<Community>(['communities', 'catalogue'], `/v1/admin/communities${qs({ q, status, cityId, limit: 25 })}`, allowed);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Catalogue & pricing" description="Plans and prices for each community." />
        <EmptyState title="You do not have access to catalogue and pricing" icon={ShieldCheck}>
          Ask your Super Admin for the Catalogue &amp; pricing module.
        </EmptyState>
      </>
    );
  }
  const filtered = Boolean(q || status || cityId);

  return (
    <>
      <PageHeader
        title="Catalogue & pricing"
        description="Plans and prices for each community. Changes are made in a draft and only reach residents when the draft is published."
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search community name or code" />
        <SearchPicker compact source={CITY_SOURCE} label="City" emptyLabel="City: all" value={cityId} onChange={(v) => setCityId(v)} />
        <FilterSelect value={status} onChange={setStatus} label="Community status" options={COMMUNITY_STATUS_OPTIONS} />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Communities and their catalogue"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(stepPath(c.id, 'plans'))}
          emptyTitle={filtered ? 'No communities match these filters' : 'No communities yet'}
          emptyBody={filtered ? 'Clear a filter to see more.' : 'Create a community first, then build its catalogue here.'}
          columns={[
            {
              header: 'Community',
              cell: (c) => (
                <span className="primary-cell">
                  {c.name}
                  <span className="sub">
                    {c.cityName} · <StatusLabel status={c.status} />
                  </span>
                </span>
              ),
            },
            { header: 'Published', cell: (c) => <PublishedCell communityId={c.id} /> },
            { header: 'Draft', cell: (c) => <DraftCell communityId={c.id} /> },
            { header: 'Actions', className: 'actions', cell: (c) => <CatalogueActions communityId={c.id} /> },
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

function StatusLabel({ status }: { status: string }) {
  return <>{status.charAt(0) + status.slice(1).toLowerCase()}</>;
}

function PublishedCell({ communityId }: { communityId: string }) {
  const v = useVersions(communityId);
  if (v.isLoading) return <Skeleton height={16} width={110} />;
  if (v.error) return <span className="faint">Could not load</span>;
  const p = v.data?.published;
  if (!p) return <span className="muted">No catalogue yet</span>;
  return (
    <span className="primary-cell">
      <span className="row" style={{ gap: 6 }}>
        <StatusBadge status="PUBLISHED" />
        Version {p.versionNo}
      </span>
      <span className="sub">
        {p.planCount} plan(s) · effective {formatDate(p.effectiveFrom ?? p.publishedAt)}
      </span>
    </span>
  );
}

function DraftCell({ communityId }: { communityId: string }) {
  const v = useVersions(communityId);
  if (v.isLoading) return <Skeleton height={16} width={90} />;
  const d = v.data?.draft;
  if (!d) return <span className="faint">No draft</span>;
  return (
    <span className="primary-cell">
      <span className="row" style={{ gap: 6 }}>
        <StatusBadge status="DRAFT" tone="info" />
        Version {d.versionNo}
      </span>
      <span className="sub">{d.planCount} plan(s), not published</span>
    </span>
  );
}

function CatalogueActions({ communityId }: { communityId: string }) {
  const v = useVersions(communityId);
  const draft = v.data?.draft;
  return (
    <div className="row">
      <ButtonLink to={stepPath(communityId, 'plans')} variant="ghost" size="sm">
        Plans
      </ButtonLink>
      <ButtonLink to={stepPath(communityId, 'prices')} variant="ghost" size="sm">
        Prices
      </ButtonLink>
      <ButtonLink to={stepPath(communityId, 'publish')} variant={draft ? 'primary' : 'secondary'} size="sm" icon={draft ? Stamp : undefined}>
        {draft ? 'Review & publish' : 'Versions'}
      </ButtonLink>
    </div>
  );
}
