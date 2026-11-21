'use client';

import { useState } from 'react';
import type { AdminFeedback } from '@nestovin/contracts';
import { qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { Link, useSearchParams } from '../../lib/router';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  Facts,
  formatDate,
  formatDateTime,
  PageHeader,
  Panel,
  Segmented,
  Toolbar,
} from '../../components/ui';
import { MessageSquare, Star, ThumbsUp, TriangleAlert } from '../../components/icons';
import { useCommunityOptions } from '../demand/shared';
import { Stars } from './visits';

const RATINGS = [1, 2, 3, 4, 5];

/** ADM-12: resident feedback on visits (rating and comment), newest first. */
export function FeedbackPage() {
  const [params] = useSearchParams();
  const communities = useCommunityOptions();
  const [communityId, setCommunityId] = useState(params.get('communityId') ?? '');
  const [minRating, setMinRating] = useState(1);
  const [maxRating, setMaxRating] = useState(5);
  const [comments, setComments] = useState<'all' | 'with'>('all');
  const list = usePagedList<AdminFeedback>(
    ['admin-feedback'],
    `/v1/admin/feedback${qs({
      communityId: communityId || undefined,
      minRating: minRating > 1 ? minRating : undefined,
      maxRating: maxRating < 5 ? maxRating : undefined,
      withComment: comments === 'with' ? 'true' : undefined,
      limit: 50,
    })}`,
  );
  const [open, setOpen] = useState<AdminFeedback | null>(null);
  const rows = list.rows;
  const filtered = Boolean(communityId || minRating > 1 || maxRating < 5 || comments === 'with');
  const avg = rows?.length ? rows.reduce((n, r) => n + r.rating, 0) / rows.length : null;
  const low = rows?.filter((r) => r.rating <= 2).length ?? 0;
  const withText = rows?.filter((r) => r.comment?.trim()).length ?? 0;
  const shownNote = rows ? `of the ${rows.length} shown${list.hasMore ? ' so far' : ''}` : undefined;

  return (
    <>
      <PageHeader
        crumb={{ to: '/attendance', label: 'Attendance' }}
        title="Feedback"
        description="Ratings and comments residents leave after a visit. Newest first."
      />
      <div className="stack">
        <Toolbar>
          <select className="input input-compact" aria-label="Community" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
            <option value="">All communities</option>
            {(communities.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status !== 'ACTIVE' ? ` (${c.status.toLowerCase()})` : ''}
              </option>
            ))}
          </select>
          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <select
              className="input input-compact"
              aria-label="Lowest rating"
              value={minRating}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMinRating(v);
                if (v > maxRating) setMaxRating(v);
              }}
            >
              {RATINGS.map((r) => (
                <option key={r} value={r}>
                  From {r} {r === 1 ? 'star' : 'stars'}
                </option>
              ))}
            </select>
            <select
              className="input input-compact"
              aria-label="Highest rating"
              value={maxRating}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaxRating(v);
                if (v < minRating) setMinRating(v);
              }}
            >
              {RATINGS.map((r) => (
                <option key={r} value={r}>
                  to {r} {r === 1 ? 'star' : 'stars'}
                </option>
              ))}
            </select>
          </span>
          <Segmented
            label="Comments"
            value={comments}
            onChange={setComments}
            items={[
              { value: 'all', label: 'All feedback' },
              { value: 'with', label: 'With a comment' },
            ]}
          />
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCommunityId('');
                setMinRating(1);
                setMaxRating(5);
                setComments('all');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Toolbar>
        {rows?.length ? (
          <Facts
            items={[
              { label: 'Average rating', value: avg !== null ? avg.toFixed(1) : '—', note: shownNote, icon: Star },
              { label: '1–2 stars', value: low, note: shownNote, tone: low ? 'amber' : undefined, icon: TriangleAlert },
              { label: 'With a comment', value: withText, note: shownNote, icon: MessageSquare },
            ]}
          />
        ) : null}
        <Panel flush>
          <DataTable
            flush
            caption="Resident feedback"
            loading={list.isLoading}
            error={list.error}
            rows={rows}
            rowKey={(f) => f.occurrenceId}
            onRowClick={setOpen}
            emptyTitle={filtered ? 'No feedback matches' : 'No feedback yet'}
            emptyBody={filtered ? 'Widen the rating range or clear the filters.' : 'Residents can rate a visit in the Resident app once it is completed.'}
            columns={[
              { header: 'Rating', cell: (f) => <Stars rating={f.rating} /> },
              {
                header: 'Comment',
                cell: (f) => (f.comment?.trim() ? <span className="clamp prewrap">{f.comment}</span> : <span className="muted">No comment</span>),
              },
              {
                header: 'Resident',
                cell: (f) => (
                  <span className="primary-cell">
                    {f.resident.fullName ?? 'Resident'}
                    <span className="sub">
                      {f.flat.towerName} {f.flat.flatNumber} · {f.community.name}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Worker',
                cell: (f) =>
                  f.worker ? (
                    <span className="primary-cell" style={{ fontWeight: 400 }}>
                      <Link to={`/workforce/employees/${f.worker.id}`}>{f.worker.fullName}</Link>
                      <span className="sub">{f.worker.employeeCode}</span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                header: 'Visit',
                cell: (f) => (
                  <span className="primary-cell" style={{ fontWeight: 400 }}>
                    {formatDate(f.visitDate)}
                    <span className="sub">{f.serviceName}</span>
                  </span>
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
        </Panel>
      </div>
      {open ? (
        <Drawer
          open
          title={`${open.serviceName} · ${open.flat.towerName} ${open.flat.flatNumber}`}
          subtitle={`${formatDate(open.visitDate)} · ${open.community.name}`}
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Close
              </Button>
              {open.worker ? (
                <ButtonLink to={`/workforce/employees/${open.worker.id}`} icon={ThumbsUp}>
                  Open worker
                </ButtonLink>
              ) : null}
            </>
          }
        >
          <div className="stack">
            <Stars rating={open.rating} />
            {open.comment?.trim() ? (
              <blockquote className="prewrap" style={{ margin: 0, paddingLeft: 12, borderLeft: '2px solid var(--rule-strong)' }}>
                {open.comment}
              </blockquote>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                The resident left a rating without a comment.
              </p>
            )}
            <dl className="details" style={{ margin: 0 }}>
              <div>
                <dt>Resident</dt>
                <dd>{open.resident.fullName ?? 'Resident'}</dd>
              </div>
              <div>
                <dt>Flat</dt>
                <dd>
                  {open.flat.towerName} {open.flat.flatNumber}
                </dd>
              </div>
              <div>
                <dt>Worker</dt>
                <dd>{open.worker ? `${open.worker.fullName} (${open.worker.employeeCode})` : '—'}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(open.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
