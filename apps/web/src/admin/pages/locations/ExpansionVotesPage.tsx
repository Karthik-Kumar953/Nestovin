'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExpansionVoteAggregate } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import { DataTable, formatDateTime, PageHeader } from '../../components/ui';
import { NoAccessPage } from '../HomePage';

/**
 * ADM-03A: residents vote for cities/communities Nestovin does not serve yet.
 * Votes are interest signals only; they never create a location, booking or
 * payment, and no automatic threshold triggers anything.
 */
export function ExpansionVotesPage() {
  const me = useMe();
  const votes = useQuery({
    queryKey: ['expansion-votes'],
    queryFn: () => api<{ items: ExpansionVoteAggregate[] }>('/v1/admin/expansion-votes'),
    enabled: me.isSuperAdmin,
  });
  if (!me.isSuperAdmin) return <NoAccessPage />;
  return (
    <>
      <PageHeader
        title="Expansion votes"
        description="Interest from residents in cities and communities Nestovin does not serve yet. Votes inform your decision; they do not trigger anything automatically."
      />
      <DataTable
        caption="Expansion votes"
        loading={votes.isLoading}
        error={votes.error}
        rows={votes.data?.items}
        rowKey={(v) => `${v.level}:${v.cityName}:${v.communityName ?? ''}`}
        emptyTitle="No votes yet"
        emptyBody="Votes appear here once residents start using the Resident app."
        columns={[
          { header: 'Level', cell: (v) => (v.level === 'CITY' ? 'City' : 'Community') },
          { header: 'City', cell: (v) => v.cityName },
          { header: 'Community', cell: (v) => v.communityName ?? '—' },
          { header: 'Votes', className: 'num', cell: (v) => <strong>{v.voteCount}</strong> },
          { header: 'First vote', cell: (v) => formatDateTime(v.firstVoteAt) },
          { header: 'Latest vote', cell: (v) => formatDateTime(v.lastVoteAt) },
        ]}
      />
    </>
  );
}
