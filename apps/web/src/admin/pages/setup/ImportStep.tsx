'use client';

import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IMPORT_COLUMNS, IMPORT_LIMITS, XLSX_MIME, type ImportBatch, type ImportRowsPage } from '@nestovin/contracts';
import { api, apiDownload, apiUpload } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  Panel,
  Tabs,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CheckCheck, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileDown, Upload, X } from '../../components/icons';
import { useCategories } from './BasicsSteps';
import { GridEntry } from './GridEntry';
import '../locations/locations.css';

const BATCH_TONE: Record<ImportBatch['status'], string> = {
  VALIDATED: 'info',
  INVALID: 'error',
  APPROVED: 'warning',
  REJECTED: 'neutral',
  COMMITTED: 'success',
  CANCELLED: 'neutral',
};
const BATCH_LABEL: Record<ImportBatch['status'], string> = {
  VALIDATED: 'Waiting for approval',
  INVALID: 'Has errors',
  APPROVED: 'Approved, not committed',
  REJECTED: 'Rejected',
  COMMITTED: 'Committed',
  CANCELLED: 'Cancelled',
};

export function BatchBadge({ status }: { status: ImportBatch['status'] }) {
  return <span className={`badge badge-${BATCH_TONE[status]}`}>{BATCH_LABEL[status]}</span>;
}

const n = (x: number) => x.toLocaleString('en-IN');
const MB = 1024 * 1024;
const fileSize = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Excel migration (ADM-04, ADR-011): structure only, all-or-nothing.
 * Upload -> validation report -> approve -> commit. Commit never activates the community.
 */
export function ImportStep({ communityId, communityName }: { communityId: string; communityName?: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const categories = useCategories(communityId);
  const batches = useQuery({
    queryKey: ['setup', communityId, 'imports'],
    queryFn: () => api<{ items: ImportBatch[] }>(`/v1/admin/communities/${communityId}/import-batches`),
    select: (d) => d.items,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'excel' | 'table'>('excel');

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['setup', communityId] });
    await qc.invalidateQueries({ queryKey: ['activation', communityId] });
    await qc.invalidateQueries({ queryKey: ['communities'] });
    await qc.invalidateQueries({ queryKey: ['towers'] });
    await qc.invalidateQueries({ queryKey: ['import-batches'] });
  };

  const download = useMutation({
    mutationFn: () => apiDownload(`/v1/admin/communities/${communityId}/import-template`, 'nestovin-migration.xlsx'),
  });
  const exportStructure = useMutation({
    mutationFn: () => apiDownload(`/v1/admin/communities/${communityId}/structure-export`, 'nestovin-structure.xlsx'),
  });

  const open = batches.data?.find((b) => b.status === 'VALIDATED' || b.status === 'APPROVED');
  const current = batches.data?.find((b) => b.id === selected) ?? open ?? batches.data?.[0];
  const noCategories = categories.data && categories.data.filter((c) => c.status === 'ACTIVE').length === 0;
  const canCreate = can(me, 'community_migration', 'create');

  return (
    <div className="stack">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Towers and flats
        </h2>
        <Button variant="ghost" size="sm" icon={FileDown} onClick={() => exportStructure.mutate()} busy={exportStructure.isPending}>
          Export current structure
        </Button>
      </div>
      <p className="field-hint">
        One row per flat: {IMPORT_COLUMNS.join(' · ')}. No residents’ names or phone numbers; residents register themselves in the app. A batch is
        imported only when every row is valid. Re-importing updates changed flats and never deletes any.
      </p>
      {noCategories ? (
        <InfoBanner tone="warning">Define residence categories first (previous step). The import checks every row against them.</InfoBanner>
      ) : null}
      <ErrorBanner error={download.error ?? exportStructure.error ?? batches.error} />

      <div>
        <Tabs
          label="How to add flats"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'excel', label: 'Excel upload' },
            { value: 'table', label: 'Enter in table' },
          ]}
        />
        {mode === 'excel' ? (
          <Panel
            title="Upload the filled template"
            subtitle={`.xlsx only, up to ${IMPORT_LIMITS.maxBytes / MB} MB and ${n(IMPORT_LIMITS.maxRows)} rows.`}
            actions={
              <Button variant="secondary" size="sm" icon={Download} onClick={() => download.mutate()} busy={download.isPending}>
                Download template
              </Button>
            }
          >
            {canCreate ? (
              <ExcelDrop
                communityId={communityId}
                disabled={Boolean(open) || Boolean(noCategories)}
                onUploaded={async (b) => {
                  setSelected(b.id);
                  await refresh();
                }}
              />
            ) : (
              <p className="muted">You can view imports but not upload them.</p>
            )}
          </Panel>
        ) : canCreate ? (
          <GridEntry
            communityId={communityId}
            categories={(categories.data ?? []).filter((c) => c.status === 'ACTIVE').map((c) => ({ code: c.code, label: c.label }))}
            disabled={Boolean(open) || Boolean(noCategories)}
            onSubmitted={(b) => {
              setSelected(b.id);
              void refresh();
            }}
          />
        ) : (
          <p className="muted">You can view imports but not enter them.</p>
        )}
      </div>
      {open ? (
        <InfoBanner tone="warning">An import is waiting for a decision below. Commit, reject or cancel it before adding another batch.</InfoBanner>
      ) : null}

      {current ? <BatchPanel key={current.id} batch={current} communityName={communityName} onChanged={refresh} /> : null}

      <Panel title="Import history" flush>
        <DataTable
          flush
          caption="Import history"
          rows={batches.data}
          loading={batches.isLoading}
          rowKey={(b) => b.id}
          onRowClick={(b) => setSelected(b.id)}
          emptyTitle="No imports yet"
          emptyBody="Upload the filled template or enter rows in the table to start."
          columns={[
            {
              header: 'Batch',
              cell: (b) => (
                <span className="primary-cell">
                  {b.source === 'DASHBOARD' ? 'Dashboard table' : b.fileName}
                  <span className="sub">{formatDateTime(b.uploadedAt)}</span>
                </span>
              ),
            },
            { header: 'Rows', className: 'num', cell: (b) => n(b.totalRows) },
            { header: 'Errors', className: 'num', cell: (b) => (b.errorRows ? <span style={{ color: 'var(--red)' }}>{n(b.errorRows)}</span> : '0') },
            { header: 'Status', cell: (b) => <BatchBadge status={b.status} /> },
            {
              header: 'Actions',
              className: 'actions',
              cell: (b) => (
                <div className="row">
                  <Button variant={current?.id === b.id ? 'secondary' : 'ghost'} size="sm" onClick={() => setSelected(b.id)} aria-pressed={current?.id === b.id}>
                    {current?.id === b.id ? 'Showing' : 'View'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ---------- Drop zone ---------- */

function ExcelDrop({ communityId, disabled, onUploaded }: { communityId: string; disabled: boolean; onUploaded: (b: ImportBatch) => Promise<void> }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const upload = useMutation({
    mutationFn: (f: File) => apiUpload<ImportBatch>(`/v1/admin/communities/${communityId}/import-batches`, f, XLSX_MIME),
    onSuccess: async (b) => {
      setFile(null);
      toast(b.status === 'INVALID' ? 'Workbook checked: fix the errors and upload again' : 'Workbook checked and waiting for approval', b.status === 'INVALID' ? 'error' : 'success');
      await onUploaded(b);
    },
  });

  const pick = (f: File | undefined) => {
    upload.reset();
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setFile(null);
      setProblem('Choose an Excel workbook (.xlsx). Older .xls and .csv files are not accepted.');
      return;
    }
    if (f.size > IMPORT_LIMITS.maxBytes) {
      setFile(null);
      setProblem(`${f.name} is ${fileSize(f.size)}. The limit is ${IMPORT_LIMITS.maxBytes / MB} MB; split the workbook and upload each part.`);
      return;
    }
    setProblem(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) pick(e.dataTransfer.files[0]);
  };

  return (
    <div className="stack-sm">
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label="Choose Excel file"
        tabIndex={-1}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        className="dropzone"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label="Drop an Excel file here or choose one"
        data-over={over}
        style={disabled ? { cursor: 'not-allowed', opacity: 0.6 } : undefined}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Upload size={22} />
        <strong>Drop the filled workbook here</strong>
        <span className="muted">or click to choose a .xlsx file (5 MB max)</span>
      </div>
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
      {file ? (
        <div className="row-between" style={{ padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 'var(--r-md)', flexWrap: 'wrap', gap: 8 }}>
          <span className="row" style={{ minWidth: 0 }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--teal)', flex: 'none' }} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong>{file.name}</strong> <span className="muted">· {fileSize(file.size)}</span>
            </span>
          </span>
          <span className="row">
            <Button variant="ghost" size="sm" icon={X} onClick={() => setFile(null)} disabled={upload.isPending}>
              Remove
            </Button>
            <Button size="sm" icon={Upload} busy={upload.isPending} disabled={disabled} onClick={() => upload.mutate(file)}>
              Upload and check
            </Button>
          </span>
        </div>
      ) : null}
      <ErrorBanner error={upload.error} />
    </div>
  );
}

/* ---------- Batch report ---------- */

type RowFilter = 'all' | 'error' | 'warning' | 'ok';
const PAGE = 200;

function BatchPanel({
  batch,
  communityName,
  onChanged,
}: {
  batch: ImportBatch;
  communityName: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const me = useMe();
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<RowFilter>(batch.errorRows ? 'error' : batch.warningRows ? 'warning' : 'all');
  const [offset, setOffset] = useState(0);
  const rows = useQuery({
    queryKey: ['import-rows', batch.id, filter, offset],
    queryFn: () => api<ImportRowsPage>(`/v1/admin/import-batches/${batch.id}/rows?status=${filter}&offset=${offset}&limit=${PAGE}`),
    enabled: batch.totalRows > 0,
    placeholderData: (prev) => prev,
  });
  const action = useMutation({
    mutationFn: ({ verb, reason }: { verb: 'approve' | 'commit' | 'cancel' | 'reject'; reason?: string }) =>
      api<ImportBatch>(`/v1/admin/import-batches/${batch.id}/${verb}`, {
        method: 'POST',
        body: verb === 'commit' ? undefined : reason ? { reason } : {},
      }),
    onSuccess: async (_b, { verb }) => {
      toast({ approve: 'Import approved', commit: 'Import committed', cancel: 'Import cancelled', reject: 'Import rejected' }[verb]);
      await onChanged();
    },
  });
  const where = communityName ?? 'this community';
  const flats = batch.flatsNew + batch.flatsUpdated || batch.validRows;
  const live = batch.status === 'VALIDATED' || batch.status === 'APPROVED';

  const approve = async () => {
    const r = await confirm({
      title: 'Approve this import?',
      body: `It will create ${n(batch.towersNew)} tower(s) and ${n(batch.flatsNew)} flat(s), and update ${n(batch.flatsUpdated)} flat(s) in ${where} once it is committed. Approving does not change anything yet.`,
      confirmLabel: 'Approve import',
    });
    if (r.ok) action.mutate({ verb: 'approve' });
  };
  const commit = async () => {
    const r = await confirm({
      title: `Commit ${n(flats)} flats to ${where}?`,
      body: `Commit ${n(flats)} flats to ${where}? This cannot be undone. It creates ${n(batch.towersNew)} tower(s) and ${n(batch.flatsNew)} flat(s) and updates ${n(batch.flatsUpdated)}. The community stays inactive until you activate it in the last step.`,
      confirmLabel: 'Commit import',
      tone: 'danger',
    });
    if (r.ok) action.mutate({ verb: 'commit' });
  };
  const reject = async () => {
    const r = await confirm({
      title: 'Reject this import?',
      body: 'Nothing is imported. The uploader sees your reason, fixes the workbook and uploads it again.',
      confirmLabel: 'Reject import',
      tone: 'danger',
      reason: { label: 'What needs fixing?', required: true, minLength: 3 },
    });
    if (r.ok) action.mutate({ verb: 'reject', reason: r.reason });
  };
  const cancel = async () => {
    const r = await confirm({
      title: 'Cancel this import?',
      body: 'Nothing is imported and the batch is closed. You can upload a new batch afterwards.',
      confirmLabel: 'Cancel import',
      tone: 'warning',
      reason: { label: 'Reason (optional)' },
    });
    if (r.ok) action.mutate({ verb: 'cancel', reason: r.reason || undefined });
  };

  const total = rows.data?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <Panel
      title={batch.source === 'DASHBOARD' ? 'Dashboard table batch' : batch.fileName}
      subtitle={
        <>
          <BatchBadge status={batch.status} /> <span className="muted">Uploaded {formatDateTime(batch.uploadedAt)}</span>
        </>
      }
      actions={
        live ? (
          <>
            {can(me, 'community_migration', 'create') ? (
              <Button variant="ghost" size="sm" onClick={() => void cancel()} disabled={action.isPending}>
                Cancel
              </Button>
            ) : null}
            {can(me, 'community_migration', 'approve') ? (
              <Button variant="danger" size="sm" onClick={() => void reject()} disabled={action.isPending}>
                Reject
              </Button>
            ) : null}
            {batch.status === 'VALIDATED' && can(me, 'community_migration', 'approve') ? (
              <Button size="sm" icon={CheckCheck} onClick={() => void approve()} busy={action.isPending}>
                Approve
              </Button>
            ) : null}
            {batch.status === 'APPROVED' && can(me, 'community_migration', 'publish') ? (
              <Button size="sm" onClick={() => void commit()} busy={action.isPending}>
                Commit to community
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="stack">
        <ErrorBanner error={action.error} />
        {batch.fileErrors.length ? (
          <div className="banner banner-error" role="alert">
            <div>{batch.fileErrors.join(' ')}</div>
          </div>
        ) : null}
        {batch.status === 'COMMITTED' ? (
          <InfoBanner tone="success">
            Imported {n(batch.towersNew)} new tower(s), {n(batch.flatsNew)} new flat(s) and {n(batch.flatsUpdated)} update(s)
            {batch.committedAt ? ` on ${formatDateTime(batch.committedAt)}` : ''}. The community is not active yet; finish setup and activate it in the last
            step.
          </InfoBanner>
        ) : null}
        {batch.status === 'REJECTED' && batch.decisionReason ? <InfoBanner tone="warning">Rejected: {batch.decisionReason}</InfoBanner> : null}
        {batch.status === 'INVALID' ? (
          <InfoBanner tone="warning">This batch has errors and cannot be approved. Fix the rows below in the workbook and upload it again.</InfoBanner>
        ) : null}

        {batch.totalRows > 0 ? (
          <>
            <dl className="details" style={{ margin: 0 }}>
              <div>
                <dt>Rows</dt>
                <dd>
                  <strong>{n(batch.totalRows)}</strong>
                </dd>
              </div>
              <div>
                <dt>Valid</dt>
                <dd>{n(batch.validRows)}</dd>
              </div>
              <div>
                <dt>With errors</dt>
                <dd style={batch.errorRows ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{n(batch.errorRows)}</dd>
              </div>
              <div>
                <dt>Will create</dt>
                <dd>
                  {n(batch.towersNew)} tower(s), {n(batch.flatsNew)} flat(s)
                </dd>
              </div>
              <div>
                <dt>Will update</dt>
                <dd>{n(batch.flatsUpdated)} flat(s)</dd>
              </div>
            </dl>
            <div>
              <Tabs
                label="Filter rows"
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setOffset(0);
                }}
                items={[
                  { value: 'all', label: 'All', count: batch.totalRows },
                  { value: 'error', label: 'Errors', count: batch.errorRows },
                  { value: 'warning', label: 'Warnings', count: batch.warningRows },
                  { value: 'ok', label: 'OK' },
                ]}
              />
              <div className="table-wrap">
                <DataTable
                  flush
                  caption="Row report"
                  rows={rows.data?.items}
                  loading={rows.isLoading}
                  error={rows.error}
                  rowKey={(r) => String(r.rowNumber)}
                  emptyTitle={filter === 'error' ? 'No rows with errors' : filter === 'warning' ? 'No rows with warnings' : 'No rows here'}
                  columns={[
                    { header: 'Row', className: 'num', cell: (r) => r.rowNumber },
                    {
                      header: 'Flat',
                      cell: (r) => (
                        <span className="primary-cell">
                          {String(r.raw['Flat number'] ?? '') || <span className="faint">No flat number</span>}
                          <span className="sub">
                            {[r.raw['Tower'], r.raw['Residence category']].map((x) => String(x ?? '')).filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                      ),
                    },
                    {
                      header: 'Result',
                      cell: (r) =>
                        r.errors.length ? (
                          <span style={{ color: 'var(--red)' }}>{r.errors.join('; ')}</span>
                        ) : r.warnings.length ? (
                          <span style={{ color: 'var(--amber)' }}>{r.warnings.join('; ')}</span>
                        ) : (
                          <span className="muted">{r.action === 'UNCHANGED' ? 'No change' : r.action === 'UPDATE' ? 'Update' : 'New'}</span>
                        ),
                    },
                  ]}
                />
                {total > 0 ? (
                  <div className="loc-pager">
                    <span aria-live="polite">
                      Rows {n(from)}–{n(to)} of {n(total)}
                      {rows.isFetching ? ' · loading…' : ''}
                    </span>
                    <span className="row">
                      <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={offset === 0 || rows.isFetching} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
                        Previous
                      </Button>
                      <Button variant="secondary" size="sm" disabled={to >= total || rows.isFetching} onClick={() => setOffset((o) => o + PAGE)}>
                        Next
                        <ChevronRight size={14} />
                      </Button>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
