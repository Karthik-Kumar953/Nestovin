'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivationChecklist, CatalogueValidation, CatalogueVersionDetail, Community } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  formatDate,
  formatDateTime,
  InfoBanner,
  Panel,
  Skeleton,
  Spinner,
  StatusBadge,
  TextInput,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Circle, CircleCheck, Power, Stamp } from '../../components/icons';
import { useVersions } from './SetupPage';

export function PublishStep({ communityId, communityName }: { communityId: string; communityName?: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const versions = useVersions(communityId);
  const draft = versions.data?.draft ?? null;
  const published = versions.data?.published ?? null;
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
    onSuccess: async (v) => {
      await qc.invalidateQueries({ queryKey: ['catalogue-versions', communityId] });
      await qc.invalidateQueries({ queryKey: ['activation', communityId] });
      await qc.invalidateQueries({ queryKey: ['communities'] });
      toast(`Version ${v.versionNo} published`);
    },
  });
  const errors = validation.data?.issues.filter((i) => i.severity === 'ERROR') ?? [];
  const warnings = validation.data?.issues.filter((i) => i.severity === 'WARNING') ?? [];
  const where = communityName ?? 'this community';

  const onPublish = async () => {
    if (!draft) return;
    const r = await confirm({
      title: `Publish version ${draft.versionNo}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            Version {draft.versionNo} becomes the catalogue for {where}
            {effectiveFrom ? ` from ${formatDate(effectiveFrom)}` : ' from today'}
            {published ? `, replacing version ${published.versionNo}` : ''}. It is frozen and cannot be edited or unpublished; to change anything later, start a
            new draft.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Existing commitments keep the terms they were made on.
            {warnings.length ? ` ${warnings.length} warning(s) are still open.` : ''}
          </p>
        </div>
      ),
      confirmLabel: `Publish version ${draft.versionNo}`,
      tone: 'warning',
    });
    if (r.ok) publish.mutate();
  };

  return (
    <div className="stack">
      <div>
        <h2 className="section-title">Review and publish</h2>
        <p className="field-hint">
          Publishing freezes this version: it can no longer be edited, and future commitments use it. Existing commitments always keep the terms they were made
          on. To change anything later, start a new draft.
        </p>
      </div>
      <ErrorBanner error={versions.error ?? validation.error ?? publish.error} />
      {publish.isSuccess ? (
        <InfoBanner tone="success">Published. Residents in this community will see this catalogue once the community is active.</InfoBanner>
      ) : null}
      {versions.isLoading ? (
        <Skeleton height={80} />
      ) : !draft ? (
        <InfoBanner>
          {published
            ? `Version ${published.versionNo} is published. Start a new draft in the Plans step to make changes.`
            : 'There is no draft to publish. Start a draft in the Plans step.'}
        </InfoBanner>
      ) : validation.isLoading ? (
        <Spinner label="Checking the draft" />
      ) : (
        <Panel
          title={`Draft version ${draft.versionNo}`}
          subtitle={`${draft.planCount} plan(s)${published ? ` · replaces version ${published.versionNo}` : ' · first catalogue'}`}
        >
          <div className="stack">
            {errors.length ? (
              <div className="banner banner-error" role="alert">
                <div className="stack-sm">
                  <strong>Fix before publishing ({errors.length})</strong>
                  <ul className="issue-list">
                    {errors.map((i, k) => (
                      <li key={k}>{i.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <InfoBanner tone="success">Draft version {draft.versionNo} passes every check and is ready to publish.</InfoBanner>
            )}
            {warnings.length ? (
              <div className="banner banner-warning">
                <div className="stack-sm">
                  <strong>Worth checking ({warnings.length})</strong>
                  <ul className="issue-list">
                    {warnings.map((i, k) => (
                      <li key={k}>{i.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {can(me, 'catalogue_pricing', 'publish') ? (
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ maxWidth: 240, flex: '1 1 200px' }}>
                  <TextInput
                    label="Effective from (optional)"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    hint="Defaults to today"
                  />
                </div>
                <Button icon={Stamp} onClick={() => void onPublish()} busy={publish.isPending} disabled={!validation.data?.publishable}>
                  Publish version {draft.versionNo}
                </Button>
              </div>
            ) : (
              <p className="muted">You can review this draft but not publish it.</p>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Version history" flush>
        <DataTable
          flush
          caption="Catalogue versions"
          rows={versions.data?.all}
          loading={versions.isLoading}
          rowKey={(v) => v.id}
          emptyTitle="No versions yet"
          emptyBody="Start a draft in the Plans step."
          columns={[
            {
              header: 'Version',
              cell: (v) => (
                <span className="primary-cell">
                  Version {v.versionNo}
                  <span className="sub">{v.planCount} plan(s)</span>
                </span>
              ),
            },
            { header: 'Status', cell: (v) => <StatusBadge status={v.status} tone={v.status === 'DRAFT' ? 'info' : undefined} /> },
            { header: 'Effective from', cell: (v) => formatDate(v.effectiveFrom) },
            { header: 'Published', cell: (v) => <span className="muted">{formatDateTime(v.publishedAt)}</span> },
          ]}
        />
      </Panel>
    </div>
  );
}

export function ActivateStep({ communityId, community }: { communityId: string; community: Community }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const checklist = useQuery({
    queryKey: ['activation', communityId],
    queryFn: () => api<ActivationChecklist>(`/v1/admin/communities/${communityId}/activation`),
  });
  const activate = useMutation({
    mutationFn: () => api<ActivationChecklist>(`/v1/admin/communities/${communityId}/activate`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['communities'] });
      await qc.invalidateQueries({ queryKey: ['activation', communityId] });
      toast(`${community.name} is active`);
    },
  });
  const onActivate = async () => {
    const r = await confirm({
      title: `Activate ${community.name}?`,
      body: `${community.name} opens to residents with its published catalogue. To close it again, deactivate it from the community page.`,
      confirmLabel: 'Activate community',
      tone: 'warning',
    });
    if (r.ok) activate.mutate();
  };
  const checks = checklist.data?.checks ?? [];
  const left = checks.filter((c) => !c.ok).length;

  return (
    <div className="stack">
      <div>
        <h2 className="section-title">Activate community</h2>
        <p className="field-hint">Activation opens the community to residents. Everything below must be in place first.</p>
      </div>
      <ErrorBanner error={checklist.error ?? activate.error} />
      {community.status === 'ACTIVE' ? <InfoBanner tone="success">This community is active.</InfoBanner> : null}
      <Panel title="Checklist" subtitle={checklist.data ? (left ? `${left} item(s) left` : 'Everything is in place') : undefined}>
        {checklist.data ? (
          <ul className="checklist">
            {checks.map((c) => (
              <li key={c.key} className={c.ok ? 'ok' : 'todo'}>
                <span aria-hidden style={{ color: c.ok ? 'var(--teal)' : 'var(--faint)', display: 'inline-flex', alignSelf: 'center' }}>
                  {c.ok ? <CircleCheck size={16} /> : <Circle size={16} />}
                </span>
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
      </Panel>
      {community.status !== 'ACTIVE' && can(me, 'community_migration', 'publish') ? (
        <div>
          <Button icon={Power} onClick={() => void onActivate()} busy={activate.isPending} disabled={!checklist.data?.ready}>
            Activate community
          </Button>
        </div>
      ) : null}
    </div>
  );
}
