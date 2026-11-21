'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { IMPORT_OCCUPANCY_VALUES, type GridRow, type GridValidation, type ImportBatch } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { Button, ErrorBanner, InfoBanner } from '../../components/ui';
import { X } from '../../components/icons';

type Row = { tower: string; floor: string; flatNumber: string; bhkType: string; areaSqft: string; category: string; occupancy: string };
const empty = (): Row => ({ tower: '', floor: '', flatNumber: '', bhkType: '', areaSqft: '', category: '', occupancy: '' });
const FIELDS: { key: keyof Row; label: string; width: number }[] = [
  { key: 'tower', label: 'Tower', width: 110 },
  { key: 'floor', label: 'Floor', width: 70 },
  { key: 'flatNumber', label: 'Flat number', width: 100 },
  { key: 'bhkType', label: 'BHK type', width: 90 },
  { key: 'areaSqft', label: 'Area (sq ft)', width: 100 },
  { key: 'category', label: 'Residence category', width: 150 },
  { key: 'occupancy', label: 'Occupancy', width: 110 },
];

const toPayload = (rows: Row[]): GridRow[] =>
  rows.map((r) => ({
    tower: r.tower,
    flatNumber: r.flatNumber,
    category: r.category,
    floor: r.floor.trim() === '' ? null : r.floor,
    bhkType: r.bhkType.trim() || null,
    areaSqft: r.areaSqft.trim() === '' ? null : r.areaSqft,
    occupancy: r.occupancy || null,
  }));

/**
 * ADM-04 dashboard entry: type or paste (from Excel / Sheets) rows straight into
 * the table, check them against the same rules as the Excel import, then submit
 * as a batch for approval and commit.
 */
export function GridEntry({
  communityId,
  categories,
  disabled,
  onSubmitted,
}: {
  communityId: string;
  categories: { code: string; label: string }[];
  disabled: boolean;
  onSubmitted: (b: ImportBatch) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, empty));
  const [result, setResult] = useState<GridValidation | null>(null);

  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim() !== ''));
  // The server numbers rows by table position (row 1 = number 2), like spreadsheet rows.
  const problems = new Map<number, string[]>();
  for (const v of result?.rows ?? []) {
    if (v.errors.length) problems.set(v.rowNumber - 2, v.errors);
  }

  const check = useMutation({
    mutationFn: () => api<GridValidation>(`/v1/admin/communities/${communityId}/import-grid/validate`, { method: 'POST', body: { rows: toPayload(rows) } }),
    onSuccess: setResult,
  });
  const submit = useMutation({
    mutationFn: () => api<ImportBatch>(`/v1/admin/communities/${communityId}/import-grid`, { method: 'POST', body: { rows: toPayload(rows) } }),
    onSuccess: (b) => {
      setRows(Array.from({ length: 5 }, empty));
      setResult(null);
      onSubmitted(b);
    },
  });

  const update = (i: number, key: keyof Row, value: string) => {
    setResult(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  };

  /** Paste a block copied from Excel/Sheets (tab-separated) starting at the focused cell. */
  const onPaste = (i: number, col: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, k, a) => !(k === a.length - 1 && l === ''));
    setResult(null);
    setRows((rs) => {
      const next = [...rs];
      lines.forEach((line, dr) => {
        const target = i + dr;
        while (next.length <= target) next.push(empty());
        const cells = line.split('\t');
        const r = { ...next[target]! };
        cells.forEach((cell, dc) => {
          const field = FIELDS[col + dc];
          if (field) r[field.key] = cell.trim();
        });
        next[target] = r;
      });
      return next;
    });
  };

  return (
    <div className="stack">
      <p className="field-hint">
        Type flats below, or copy rows from Excel / Google Sheets and paste into the first cell. Rows are checked with the same rules as the Excel import; nothing is
        saved until you submit, and nothing changes until the batch is approved and committed.
      </p>
      <div className="table-wrap">
        <table className="table grid-entry">
          <caption className="sr-only">Flats to import</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              {FIELDS.map((f) => (
                <th key={f.key} scope="col" style={{ minWidth: f.width }}>
                  {f.label}
                  {['tower', 'flatNumber', 'category'].includes(f.key) ? ' *' : ''}
                </th>
              ))}
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={problems.has(i) ? 'row-invalid' : undefined}>
                <td className="muted">{i + 1}</td>
                {FIELDS.map((f, col) => (
                  <td key={f.key}>
                    {f.key === 'category' ? (
                      <select className="input input-compact" aria-label={`Row ${i + 1} ${f.label}`} value={r.category} disabled={disabled} onChange={(e) => update(i, 'category', e.target.value)}>
                        <option value="">Choose…</option>
                        {categories.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                        {r.category && !categories.some((c) => c.code === r.category) ? <option value={r.category}>{r.category}</option> : null}
                      </select>
                    ) : f.key === 'occupancy' ? (
                      <select className="input input-compact" aria-label={`Row ${i + 1} ${f.label}`} value={r.occupancy} disabled={disabled} onChange={(e) => update(i, 'occupancy', e.target.value)}>
                        <option value="">—</option>
                        {IMPORT_OCCUPANCY_VALUES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input input-compact"
                        aria-label={`Row ${i + 1} ${f.label}`}
                        value={r[f.key]}
                        disabled={disabled}
                        inputMode={f.key === 'floor' || f.key === 'areaSqft' ? 'decimal' : undefined}
                        onChange={(e) => update(i, f.key, e.target.value)}
                        onPaste={(e) => onPaste(i, col, e)}
                      />
                    )}
                  </td>
                ))}
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={X}
                    aria-label={`Remove row ${i + 1}`}
                    disabled={disabled}
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [empty()]))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {[...problems.entries()].slice(0, 20).map(([i, errs]) => (
        <p key={i} className="field-error">
          Row {i + 1}: {errs.join('; ')}
        </p>
      ))}
      {result && result.counts.errors === 0 ? (
        <InfoBanner tone="success">
          All {result.counts.valid} rows are valid: {result.counts.flatsNew} new flat(s), {result.counts.flatsUpdated} update(s), {result.counts.towersNew} new tower(s).
        </InfoBanner>
      ) : null}
      <ErrorBanner error={check.error ?? submit.error} />
      <div className="row">
        <Button variant="ghost" disabled={disabled} onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 5 }, empty)])}>
          Add 5 rows
        </Button>
        <Button variant="secondary" disabled={disabled || filled.length === 0} busy={check.isPending} onClick={() => check.mutate()}>
          Check rows
        </Button>
        <Button disabled={disabled || filled.length === 0 || !result || result.counts.errors > 0} busy={submit.isPending} onClick={() => submit.mutate()}>
          Submit for approval ({filled.length})
        </Button>
      </div>
    </div>
  );
}
