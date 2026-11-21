'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Holiday } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, Facts, InfoBanner, PageHeader, Panel, TextInput, useConfirm, useToast } from '../../components/ui';
import { CalendarDays, CalendarX, Plus, Trash2 } from '../../components/icons';

const longDate = (d: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00`));
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** ADR-014: working days exclude Sundays and these holidays (organisation-wide). */
export function HolidaysPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useQuery({ queryKey: ['holidays'], queryFn: () => api<{ items: Holiday[] }>('/v1/admin/holidays') });
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api('/v1/admin/holidays', { method: 'POST', body: { date, name: name.trim() } }),
    onSuccess: async () => {
      toast(`${name.trim()} added`);
      setDate('');
      setName('');
      await qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });
  const remove = useMutation({
    mutationFn: (d: string) => api(`/v1/admin/holidays/${d}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast('Holiday removed');
      await qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });
  const err = add.error instanceof ApiError ? add.error : null;

  const today = todayIst();
  const items = list.data?.items;
  const upcoming = items?.filter((h) => h.date >= today) ?? [];
  const next = [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0];
  const year = today.slice(0, 4);

  const onRemove = async (h: Holiday) => {
    const r = await confirm({
      title: `Remove ${h.name}?`,
      body: `${longDate(h.date)} counts as a working day again for support deadlines.`,
      confirmLabel: 'Remove holiday',
      tone: 'danger',
    });
    if (r.ok) remove.mutate(h.date);
  };

  return (
    <>
      <PageHeader
        title="Holiday calendar"
        description="Support deadlines count working days: Sundays and these holidays are skipped. Tickets escalate to the Cluster Admin after 2 working days and to the Super Admin after 2 more."
      />
      <Facts
        items={[
          { label: `Holidays in ${year}`, value: items ? items.filter((h) => h.date.startsWith(year)).length : '—', icon: CalendarDays },
          { label: 'Next holiday', value: next ? next.name : 'None listed', note: next ? longDate(next.date) : undefined, icon: CalendarX },
        ]}
      />
      {!me.isSuperAdmin ? <InfoBanner>Only the Super Admin can change the calendar.</InfoBanner> : null}
      <div className={me.isSuperAdmin ? 'split' : undefined}>
        <Panel title="Holidays" flush>
          <ErrorBanner error={remove.error} />
          <DataTable
            flush
            caption="Holidays"
            loading={list.isLoading}
            error={list.error}
            rows={items}
            rowKey={(h) => h.date}
            emptyTitle="No holidays listed"
            emptyBody={me.isSuperAdmin ? 'Add the year’s holidays so support deadlines skip them.' : 'Until holidays are added, only Sundays are skipped.'}
            columns={[
              {
                header: 'Date',
                cell: (h) => (
                  <span className="primary-cell">
                    {longDate(h.date)}
                    {h.date < today ? <span className="sub">Past</span> : null}
                  </span>
                ),
              },
              { header: 'Holiday', cell: (h) => <span className={h.date < today ? 'muted' : undefined}>{h.name}</span> },
              ...(me.isSuperAdmin
                ? [
                    {
                      header: 'Actions',
                      className: 'actions',
                      cell: (h: Holiday) => (
                        <Button variant="ghost" size="sm" icon={Trash2} busy={remove.isPending && remove.variables === h.date} onClick={() => void onRemove(h)} aria-label={`Remove ${h.name}`}>
                          Remove
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Panel>
        {me.isSuperAdmin ? (
          <Panel title="Add a holiday" subtitle="Applies to every cluster.">
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate();
              }}
            >
              <TextInput label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={err?.field('date')} />
              <TextInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} hint="For example, Diwali" />
              <ErrorBanner error={err?.fields.length ? null : add.error} />
              <div className="row">
                <Button type="submit" icon={Plus} disabled={!date || name.trim().length < 2} busy={add.isPending}>
                  Add holiday
                </Button>
              </div>
            </form>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
