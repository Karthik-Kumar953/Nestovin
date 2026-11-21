'use client';

import type { Occurrence } from '@nestovin/contracts';
import { Star } from '../../components/icons';

/*
 * Local helpers for showing visits over time with the run-sheet language from
 * Home (true-duration blocks in lanes, `visit <state>` classes, now line).
 */

export type VisitState = 'done' | 'progress' | 'upcoming' | 'late' | 'noshow' | 'unassigned' | 'exception';

export const STATE_LABEL: Record<VisitState, string> = {
  done: 'Done',
  progress: 'In progress',
  upcoming: 'Scheduled',
  late: 'Late',
  noshow: 'No-show',
  unassigned: 'No worker',
  exception: 'Exception',
};

const LATE_GRACE_MIN = 10;

export function visitState(v: Pick<Occurrence, 'status' | 'startsAt' | 'assignment'>, now: number): VisitState {
  if (v.status === 'COMPLETED') return 'done';
  if (v.status === 'NO_SHOW') return 'noshow';
  if (v.status === 'EXCEPTION') return 'exception';
  if (v.status === 'IN_PROGRESS' || v.status === 'COMPLETION_SUBMITTED') return 'progress';
  if (!v.assignment) return 'unassigned';
  if (v.startsAt && new Date(v.startsAt).getTime() + LATE_GRACE_MIN * 60_000 < now) return 'late';
  return 'upcoming';
}

const IST = 'Asia/Kolkata';

/** YYYY-MM-DD in IST, offset by whole days. */
export function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d.getTime() + days * 86_400_000));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

export function istHours(iso: string | number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}

export function istTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "Mon, 24 Nov" */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T06:00:00+05:30`));
}

const hourLabel = (h: number) => (h === 12 ? '12 pm' : h === 0 || h === 24 ? '12 am' : h > 12 ? `${h - 12} pm` : `${h} am`);

/**
 * One day of visits as a run sheet: one lane per worker (unassigned visits on
 * a dashed "No worker" lane first), blocks sized to the visit's real duration.
 */
export function DayRunSheet({
  visits,
  now,
  onSelect,
  label,
}: {
  visits: Occurrence[];
  now: number;
  onSelect: (v: Occurrence) => void;
  label: string;
}) {
  const timed = visits.filter((v) => v.startsAt);
  const untimed = visits.filter((v) => !v.startsAt);
  let start = 6;
  let end = 21;
  for (const v of timed) {
    start = Math.min(start, Math.floor(istHours(v.startsAt!)));
    end = Math.max(end, Math.ceil(v.endsAt ? istHours(v.endsAt) : istHours(v.startsAt!) + 1));
  }
  end = Math.min(end, 24);
  const span = end - start;
  const pct = (h: number) => `${((Math.min(Math.max(h, start), end) - start) * 100) / span}%`;

  const lanes = new Map<string, { title: string; sub: string; unassigned: boolean; list: Occurrence[] }>();
  for (const v of timed) {
    const k = v.assignment?.employeeId ?? '__none';
    const lane = lanes.get(k) ?? {
      title: v.assignment ? v.assignment.employeeName : 'No worker',
      sub: v.assignment ? v.assignment.employeeCode : 'Needs a one-day cover',
      unassigned: !v.assignment,
      list: [],
    };
    lane.list.push(v);
    lanes.set(k, lane);
  }
  const ordered = [...lanes.values()].sort((a, b) => (a.unassigned !== b.unassigned ? (a.unassigned ? -1 : 1) : a.title.localeCompare(b.title)));
  const nowH = istHours(now);
  const today = istDate(0);
  const showNow = visits[0]?.scheduledDate === today && nowH >= start && nowH <= end;

  return (
    <>
      {ordered.length ? (
        <div className="runsheet" style={{ ['--hours' as string]: span }}>
          <div className="runsheet-inner" role="table" aria-label={label}>
            <div className="runsheet-axis" role="row">
              <span role="columnheader" style={{ padding: '8px 18px' }}>
                Worker
              </span>
              <div className="runsheet-hours" role="columnheader" aria-label="Time of day">
                {Array.from({ length: span + 1 }, (_, i) => start + i)
                  .filter((h) => h % 3 === 0)
                  .map((h) => (
                    <span key={h} style={{ left: pct(h) }}>
                      {hourLabel(h)}
                    </span>
                  ))}
              </div>
              <span role="columnheader" style={{ padding: '8px 18px 8px 8px', textAlign: 'right' }}>
                Visits
              </span>
            </div>
            {ordered.map((lane) => {
              const tracks: number[] = [];
              const placed = lane.list
                .slice()
                .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))
                .map((v) => {
                  const s = istHours(v.startsAt!);
                  const e = Math.max(v.endsAt ? istHours(v.endsAt) : s + 1, s + 0.5);
                  let t = tracks.findIndex((x) => x <= s);
                  if (t === -1) {
                    t = tracks.length;
                    tracks.push(e);
                  } else tracks[t] = e;
                  return { v, s, e, t, state: visitState(v, now) };
                });
              const done = placed.filter((p) => p.state === 'done').length;
              return (
                <div key={lane.title + lane.sub} className="runsheet-lane" role="row">
                  <div className="lane-label" role="rowheader">
                    <strong title={lane.title} style={lane.unassigned ? { color: 'var(--amber)' } : undefined}>
                      {lane.title}
                    </strong>
                    <span>{lane.sub}</span>
                  </div>
                  <div className="lane-track" role="cell" style={{ height: Math.max(52, tracks.length * 24 + 16) }}>
                    {placed.map((p, i) => {
                      const what = `${p.v.serviceName} · ${p.v.flat.towerName} ${p.v.flat.flatNumber}`;
                      return (
                        <button
                          key={p.v.id}
                          type="button"
                          className={`visit ${p.state}`}
                          onClick={() => onSelect(p.v)}
                          style={{
                            left: pct(p.s),
                            width: `calc(${pct(p.e)} - ${pct(p.s)})`,
                            top: 8 + p.t * 24,
                            textAlign: 'left',
                            animationDelay: `${Math.min(i * 18, 360)}ms`,
                          }}
                          title={`${what}\n${istTime(p.v.startsAt)}–${istTime(p.v.endsAt)} · ${STATE_LABEL[p.state]}`}
                          aria-label={`${what}, ${istTime(p.v.startsAt)} to ${istTime(p.v.endsAt)}, ${STATE_LABEL[p.state]}. Open visit`}
                        >
                          {p.v.serviceName} · {p.v.flat.flatNumber}
                        </button>
                      );
                    })}
                    {showNow ? <span className="now-line" style={{ left: pct(nowH) }} /> : null}
                  </div>
                  <div className="lane-total" role="cell">
                    <strong>{lane.list.length}</strong>
                    <span>{lane.unassigned ? 'to cover' : `${done} done`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {untimed.length ? (
        <div className="panel-body" style={{ borderTop: ordered.length ? '1px solid var(--rule)' : undefined }}>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: 12.5 }}>
            Time to be set ({untimed.length})
          </p>
          <div>
            {untimed.map((v) => (
              <button key={v.id} type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => onSelect(v)}>
                Visit {v.visitNo} · {v.serviceName} · {v.flat.towerName} {v.flat.flatNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function RunSheetLegend({ states }: { states: VisitState[] }) {
  return (
    <div className="runsheet-legend" aria-hidden>
      {states.map((s) => (
        <span key={s} className="legend-item">
          <span className={`legend-swatch visit ${s}`} style={{ position: 'static', animation: 'none', width: 14, height: 10, padding: 0 }} />
          {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/** Rating as five stars plus the number (never colour alone). */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="row" style={{ gap: 2, flexWrap: 'nowrap', display: 'inline-flex', alignItems: 'center' }} aria-label={`Rated ${rating} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          aria-hidden
          style={{ color: i <= rating ? 'var(--ink-2)' : 'var(--rule-strong)' }}
          fill={i <= rating ? 'currentColor' : 'none'}
        />
      ))}
      <span className="num" style={{ marginLeft: 6, fontWeight: 600 }} aria-hidden>
        {rating}/5
      </span>
    </span>
  );
}
