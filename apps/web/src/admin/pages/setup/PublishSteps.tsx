'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivationChecklist, CatalogueValidation, CatalogueVersionDetail, Community } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Spinner, TextInput } from '../../components/ui';
import { useVersions } from './SetupPage';

export function PublishStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const versions = useVersions(communityId);
  const draft = versions.data?.draft ?? null;
  const validation = useQuery({
    queryKey: ['catalogue-validation', draft?.id],
    queryFn: () => api<CatalogueValidation>(`/v1/admin/catalogue-versions/${draft!.id}/validation`),
    enabled: Boolean(draft),
  });
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const publish = useMutation({
    mutationFn: () =>
      api<CatalogueVersionDetail>(`/v1/admin/catalogue-versions/${draft!.id}/publish`, {
        method: 'POST',
        body: effectiveFrom ? { effectiveFrom } : {},
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['catalogue-versions', communityId] });
      await qc.invalidateQueries({ queryKey: ['activation', communityId] });
      await qc.invalidateQueries({ queryKey: ['communities'] });
    },
  });
  const errors = validation.data?.issues.filter((i) => i.severity === 'ERROR') ?? [];
  const warnings = validation.data?.issues.filter((i) => i.severity === 'WARNING') ?? [];

  return (
    <div className="stack">
      <h2 className="section-title">Review &amp; publish</h2>
      <p className="field-hint">
        Publishing freezes this version: it can no longer be edited, and future commitments use it. Existing commitments always keep the terms they were
        made on. To change anything later, start a new draft.
      </p>
      <ErrorBanner error={versions.error ?? validation.error ?? publish.error} />
      {publish.isSuccess ? <InfoBanner tone="success">Published. Residents in this community will see this catalogue once the community is active.</InfoBanner> : null}
      {!draft ? (
        <InfoBanner>There is no draft to publish. Start a draft in the Plans step.</InfoBanner>
      ) : validation.isLoading ? (
        <Spinner label="Checking the draft" />
      ) : (
        <>
          {errors.length ? (
            <div className="card stack">
              <strong style={{ color: 'var(--nv-error-text)' }}>Fix before publishing ({errors.length})</strong>
              <ul className="issue-list">
                {errors.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <InfoBanner tone="success">Draft version {draft.versionNo} is ready to publish.</InfoBanner>
          )}
          {warnings.length ? (
            <div className="card stack">
              <strong style={{ color: 'var(--nv-warning-text)' }}>Worth checking ({warnings.length})</strong>
              <ul className="issue-list">
                {warnings.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {can(me, 'catalogue_pricing', 'publish') ? (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ maxWidth: 240 }}>
                <TextInput label="Effective from (optional)" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} hint="Defaults to today" />
              </div>
              <Button onClick={() => publish.mutate()} busy={publish.isPending} disabled={!validation.data?.publishable}>
                Publish version {draft.versionNo}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <section className="section">
        <h3 className="section-title" style={{ fontSize: 18 }}>
          Version history
        </h3>
        <DataTable
          caption="Catalogue versions"
          rows={versions.data?.all}
          loading={versions.isLoading}
          rowKey={(v) => v.id}
          emptyTitle="No versions yet"
          columns={[
            { header: 'Version', className: 'num', cell: (v) => v.versionNo },
            {
              header: 'Status',
              cell: (v) => (
                <span className={`badge badge-${v.status === 'PUBLISHED' ? 'success' : v.status === 'DRAFT' ? 'info' : 'neutral'}`}>
                  {v.status.charAt(0) + v.status.slice(1).toLowerCase()}
                </span>
              ),
            },
            { header: 'Plans', className: 'num', cell: (v) => v.planCount },
            { header: 'Effective from', cell: (v) => v.effectiveFrom ?? '—' },
            { header: 'Published', cell: (v) => formatDateTime(v.publishedAt) },
          ]}
        />
      </section>
    </div>
  );
}

export function ActivateStep({ communityId, community }: { communityId: string; community: Community }) {
  const me = useMe();
  const qc = useQueryClient();
  const checklist = useQuery({ queryKey: ['activation', communityId], queryFn: () => api<ActivationChecklist>(`/v1/admin/communities/${communityId}/activation`) });
  const activate = useMutation({
    mutationFn: () => api<ActivationChecklist>(`/v1/admin/communities/${communityId}/activate`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      await qc.invalidateQueries({ queryKey: ['activation', communityId] });
    },
  });
  return (
    <div className="stack">
      <h2 className="section-title">Activate community</h2>
      <p className="field-hint">Activation opens the community to residents. Everything below must be in place first.</p>
      <ErrorBanner error={checklist.error ?? activate.error} />
      {community.status === 'ACTIVE' ? <InfoBanner tone="success">This community is active.</InfoBanner> : null}
      {checklist.data ? (
        <ul className="checklist">
          {checklist.data.checks.map((c) => (
            <li key={c.key} className={c.ok ? 'ok' : 'todo'}>
              <span aria-hidden>{c.ok ? '✓' : '○'}</span>
              <span>
                {c.label}
                {c.detail ? <span className="muted"> · {c.detail}</span> : null}
              </span>
              <span className="sr-only">{c.ok ? 'done' : 'not done'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Spinner />
      )}
      {community.status !== 'ACTIVE' && can(me, 'community_migration', 'publish') ? (
        <div>
          <Button onClick={() => activate.mutate()} busy={activate.isPending} disabled={!checklist.data?.ready}>
            Activate community
          </Button>
        </div>
      ) : null}
    </div>
  );
}
