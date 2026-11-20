'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IMPORT_COLUMNS, XLSX_MIME, type ImportBatch, type ImportRow } from '@nestovin/contracts';
import { api, apiDownload, apiUpload } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  Modal,
  TextArea,
} from '../../components/ui';
import { useCategories } from './BasicsSteps';
import { GridEntry } from './GridEntry';

const BATCH_TONE: Record<ImportBatch['status'], string> = {
  VALIDATED: 'info',
  INVALID: 'error',
  APPROVED: 'warning',
  REJECTED: 'neutral',
  COMMITTED: 'success',
  CANCELLED: 'neutral',
};

function BatchBadge({ status }: { status: ImportBatch['status'] }) {
  return (
    <span className={`badge badge-${BATCH_TONE[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

/**
 * Excel migration (ADM-04, ADR-011): structure only, all-or-nothing.
 * Upload -> validation report -> approve -> commit. Commit never activates the community.
 */
export function ImportStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const categories = useCategories(communityId);
  const batches = useQuery({
    queryKey: ['setup', communityId, 'imports'],
    queryFn: () =>
      api<{ items: ImportBatch[] }>(`/v1/admin/communities/${communityId}/import-batches`),
    select: (d) => d.items,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ImportBatch | null>(null);
  const [mode, setMode] = useState<'table' | 'excel'>('table');

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['setup', communityId] });
    await qc.invalidateQueries({ queryKey: ['activation', communityId] });
    await qc.invalidateQueries({ queryKey: ['communities'] });
    await qc.invalidateQueries({ queryKey: ['towers'] });
  };

  const download = useMutation({
    mutationFn: () =>
      apiDownload(
        `/v1/admin/communities/${communityId}/import-template`,
        'nestovin-migration.xlsx',
      ),
  });
  const exportStructure = useMutation({
    mutationFn: () =>
      apiDownload(
        `/v1/admin/communities/${communityId}/structure-export`,
        'nestovin-structure.xlsx',
      ),
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportBatch>(
        `/v1/admin/communities/${communityId}/import-batches`,
        file,
        XLSX_MIME,
      ),
    onSuccess: async (b) => {
      setSelected(b.id);
      await refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'approve' | 'commit' | 'cancel' }) =>
      api<ImportBatch>(`/v1/admin/import-batches/${id}/${verb}`, {
        method: 'POST',
        body: verb === 'commit' ? undefined : {},
      }),
    onSuccess: refresh,
  });

  const open = batches.data?.find((b) => b.status === 'VALIDATED' || b.status === 'APPROVED');
  const current = batches.data?.find((b) => b.id === selected) ?? open ?? batches.data?.[0];
  const noCategories =
    categories.data && categories.data.filter((c) => c.status === 'ACTIVE').length === 0;

  return (
    <div className="stack">
      <div className="page-header">
        <h2 className="section-title">Towers and flats</h2>
        <Button
          variant="ghost"
          onClick={() => exportStructure.mutate()}
          busy={exportStructure.isPending}
        >
          Export current structure (Excel)
        </Button>
      </div>
      <p className="field-hint">
        One row per flat: {IMPORT_COLUMNS.join(' · ')}. Enter rows in the table or import an Excel
        file. No residents’ names or phone numbers; residents register themselves in the app. A
        batch is imported only when every row is valid. Re-importing updates changed flats and never
        deletes any.
      </p>
      <div className="row" role="tablist" aria-label="How to enter flats">
        <Button
          variant={mode === 'table' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={mode === 'table'}
          onClick={() => setMode('table')}
        >
          Enter in table
        </Button>
        <Button
          variant={mode === 'excel' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={mode === 'excel'}
          onClick={() => setMode('excel')}
        >
          Excel import
        </Button>
      </div>
      {noCategories ? (
        <InfoBanner tone="warning">
          Define residence categories first (previous step). The import checks every row against
          them.
        </InfoBanner>
      ) : null}
      <ErrorBanner
        error={
          download.error ?? exportStructure.error ?? upload.error ?? action.error ?? batches.error
        }
      />

      {mode === 'table' && can(me, 'community_migration', 'create') ? (
        <GridEntry
          communityId={communityId}
          categories={(categories.data ?? [])
            .filter((c) => c.status === 'ACTIVE')
            .map((c) => ({ code: c.code, label: c.label }))}
          disabled={Boolean(open) || Boolean(noCategories)}
          onSubmitted={(b) => {
            setSelected(b.id);
            void refresh();
          }}
        />
      ) : null}

      {mode === 'excel' ? (
        <div className="row">
          <Button variant="secondary" onClick={() => download.mutate()} busy={download.isPending}>
            Download template
          </Button>
          {can(me, 'community_migration', 'create') ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label="Choose Excel file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button
                onClick={() => fileRef.current?.click()}
                busy={upload.isPending}
                disabled={Boolean(open) || Boolean(noCategories)}
              >
                Upload filled workbook
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <p className="field-hint">
          An import is waiting for a decision below. Commit, reject or cancel it before entering or
          uploading another batch.
        </p>
      ) : null}

      {current ? (
        <BatchPanel
          batch={current}
          busy={action.isPending}
          onApprove={() => action.mutate({ id: current.id, verb: 'approve' })}
          onCommit={() => action.mutate({ id: current.id, verb: 'commit' })}
          onCancel={() => action.mutate({ id: current.id, verb: 'cancel' })}
          onReject={() => setRejecting(current)}
        />
      ) : null}

      <section className="section">
        <h3 className="section-title" style={{ fontSize: 18 }}>
          Import history
        </h3>
        <DataTable
          caption="Import history"
          rows={batches.data}
          loading={batches.isLoading}
          rowKey={(b) => b.id}
          emptyTitle="No imports yet"
          columns={[
            { header: 'Uploaded', cell: (b) => formatDateTime(b.uploadedAt) },
            {
              header: 'Source',
              cell: (b) => (b.source === 'DASHBOARD' ? 'Dashboard table' : b.fileName),
            },
            { header: 'Rows', className: 'num', cell: (b) => b.totalRows },
            { header: 'Errors', className: 'num', cell: (b) => b.errorRows },
            { header: 'Status', cell: (b) => <BatchBadge status={b.status} /> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (b) => (
                <Button variant="ghost" onClick={() => setSelected(b.id)}>
                  View
                </Button>
              ),
            },
          ]}
        />
      </section>
      {rejecting ? (
        <RejectBatch
          batch={rejecting}
          onClose={async () => {
            setRejecting(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function BatchPanel({
  batch,
  busy,
  onApprove,
  onCommit,
  onCancel,
  onReject,
}: {
  batch: ImportBatch;
  busy: boolean;
  onApprove: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onReject: () => void;
}) {
  const me = useMe();
  const [onlyProblems, setOnlyProblems] = useState(true);
  const rows = useQuery({
    queryKey: ['import-rows', batch.id, onlyProblems],
    queryFn: () =>
      api<{ items: ImportRow[]; nextAfterRow: number | null }>(
        `/v1/admin/import-batches/${batch.id}/rows?onlyProblems=${onlyProblems}&limit=200`,
      ),
    enabled: batch.totalRows > 0,
  });

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{batch.fileName}</strong> <BatchBadge status={batch.status} />
          <div className="muted">Uploaded {formatDateTime(batch.uploadedAt)}</div>
        </div>
        <div className="row">
          {batch.status === 'VALIDATED' && can(me, 'community_migration', 'approve') ? (
            <Button onClick={onApprove} busy={busy}>
              Approve import
            </Button>
          ) : null}
          {batch.status === 'APPROVED' && can(me, 'community_migration', 'publish') ? (
            <Button onClick={onCommit} busy={busy}>
              Commit to community
            </Button>
          ) : null}
          {(batch.status === 'VALIDATED' || batch.status === 'APPROVED') &&
          can(me, 'community_migration', 'approve') ? (
            <Button variant="danger" onClick={onReject}>
              Reject
            </Button>
          ) : null}
          {(batch.status === 'VALIDATED' || batch.status === 'APPROVED') &&
          can(me, 'community_migration', 'create') ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {batch.fileErrors.length ? (
        <div className="banner banner-error" role="alert">
          <div>{batch.fileErrors.join(' ')}</div>
        </div>
      ) : null}
      {batch.status === 'COMMITTED' ? (
        <InfoBanner tone="success">
          Imported: {batch.towersNew} new tower(s), {batch.flatsNew} new flat(s),{' '}
          {batch.flatsUpdated} updated. The community is not active yet; finish the setup and
          activate it in the last step.
        </InfoBanner>
      ) : null}
      {batch.status === 'REJECTED' && batch.decisionReason ? (
        <InfoBanner tone="warning">Rejected: {batch.decisionReason}</InfoBanner>
      ) : null}

      {batch.totalRows > 0 ? (
        <>
          <dl className="kv">
            <dt>Rows</dt>
            <dd>
              {batch.totalRows} ({batch.validRows} valid, {batch.errorRows} with errors)
            </dd>
            <dt>Will create</dt>
            <dd>
              {batch.towersNew} tower(s), {batch.flatsNew} flat(s)
            </dd>
            <dt>Will update</dt>
            <dd>{batch.flatsUpdated} existing flat(s)</dd>
          </dl>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
            Show only rows with errors or warnings
          </label>
          <DataTable
            caption="Row report"
            rows={rows.data?.items}
            loading={rows.isLoading}
            error={rows.error}
            rowKey={(r) => String(r.rowNumber)}
            emptyTitle={onlyProblems ? 'No problems found' : 'No rows'}
            columns={[
              { header: 'Row', className: 'num', cell: (r) => r.rowNumber },
              { header: 'Tower', cell: (r) => String(r.raw['Tower'] ?? '') },
              { header: 'Flat', cell: (r) => String(r.raw['Flat number'] ?? '') },
              { header: 'Category', cell: (r) => String(r.raw['Residence category'] ?? '') },
              {
                header: 'Result',
                cell: (r) =>
                  r.errors.length ? (
                    <span style={{ color: 'var(--nv-error-text)' }}>{r.errors.join('; ')}</span>
                  ) : r.warnings.length ? (
                    <span style={{ color: 'var(--nv-warning-text)' }}>{r.warnings.join('; ')}</span>
                  ) : (
                    <span className="muted">
                      {r.action === 'UNCHANGED'
                        ? 'No change'
                        : r.action === 'UPDATE'
                          ? 'Update'
                          : 'New'}
                    </span>
                  ),
              },
            ]}
            footer={
              rows.data?.nextAfterRow ? (
                <span className="muted">Showing the first 200 rows.</span>
              ) : null
            }
          />
        </>
      ) : null}
    </div>
  );
}

function RejectBatch({ batch, onClose }: { batch: ImportBatch; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () =>
      api(`/v1/admin/import-batches/${batch.id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      title="Reject import"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => reject.mutate()}
            busy={reject.isPending}
            disabled={reason.trim().length < 3}
          >
            Reject
          </Button>
        </>
      }
    >
      <ErrorBanner error={reject.error} />
      <TextArea
        label="What needs fixing?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        required
      />
    </Modal>
  );
}
