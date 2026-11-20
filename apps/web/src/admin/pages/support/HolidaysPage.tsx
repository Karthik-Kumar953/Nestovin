'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Holiday } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, InfoBanner, PageHeader, TextInput } from '../../components/ui';

/** ADR-014: working days exclude Sundays and these holidays (organisation-wide). */
export function HolidaysPage() {
  const me = useMe();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['holidays'], queryFn: () => api<{ items: Holiday[] }>('/v1/admin/holidays') });
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api('/v1/admin/holidays', { method: 'POST', body: { date, name } }),
    onSuccess: async () => {
      setDate('');
      setName('');
      await qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });
  const remove = useMutation({
    mutationFn: (d: string) => api(`/v1/admin/holidays/${d}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
  const err = add.error instanceof ApiError ? add.error : null;
  return (
    <>
      <PageHeader title="Holiday calendar" description="Support deadlines count working days: Sundays and these holidays are skipped. Tickets escalate to the Cluster Admin after 2 working days and to the Super Admin after 2 more." />
      {!me.isSuperAdmin ? <InfoBanner>Only the Super Admin can change the calendar.</InfoBanner> : null}
      <DataTable
        caption="Holidays"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(h) => h.date}
        emptyTitle="No holidays listed"
        columns={[
          { header: 'Date', cell: (h) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date(`${h.date}T12:00:00`)) },
          { header: 'Holiday', cell: (h) => h.name },
          { header: '', className: 'actions', cell: (h) => (me.isSuperAdmin ? <Button variant="ghost" busy={remove.isPending && remove.variables === h.date} onClick={() => remove.mutate(h.date)}>Remove</Button> : null) },
        ]}
      />
      {me.isSuperAdmin ? (
        <form className="row" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={err?.field('date')} />
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} hint="e.g. Diwali" />
          <Button type="submit" disabled={!date || name.trim().length < 2} busy={add.isPending}>Add holiday</Button>
        </form>
      ) : null}
      <ErrorBanner error={err?.fields.length ? null : (add.error ?? remove.error)} />
    </>
  );
}
