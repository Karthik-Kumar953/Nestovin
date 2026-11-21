'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ApiError } from '../lib/api';
import { Link } from '../lib/router';
import {
  CircleAlert,
  CircleCheck,
  Inbox,
  Info,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from './icons';

/*
 * Admin UI kit ("Concierge Run Sheet" system). Every screen builds from these,
 * so visual changes land here and in admin.tailwind.css, never per screen.
 * Shared design-system classes (.btn, .panel, .table …) live in that stylesheet's
 * components layer; one-off structure here uses Tailwind utilities directly.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';

export function Button({
  variant = 'primary',
  size,
  busy,
  icon: Icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm';
  busy?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className ?? ''}`}
    >
      {busy ? <span className="spinner" aria-hidden /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/** Link styled as a button (navigation, not an action). */
export function ButtonLink({
  to,
  variant = 'secondary',
  size,
  icon: Icon,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: 'sm';
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size ? `btn-${size}` : ''}`}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </Link>
  );
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field-invalid' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required ? (
          <span aria-hidden className="req">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children(id, describedBy)}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  error,
  hint,
  required,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined; hint?: string | undefined }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...rest} />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  error,
  hint,
  required,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string | undefined; hint?: string | undefined }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <textarea id={id} className="input textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...rest} />
      )}
    </Field>
  );
}

export function SelectInput({
  label,
  error,
  hint,
  required,
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <select id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...rest}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Header, title and body of the native <dialog> modal and drawer. */
const DIALOG_HEAD = 'flex items-center justify-between gap-3 border-b border-rule px-5 py-4';
const DIALOG_TITLE = 'text-[17px] leading-6 font-bold';
const DIALOG_BODY = 'flex flex-col gap-4 overflow-y-auto p-5';

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
    >
      {open ? (
        <>
          <header className={DIALOG_HEAD}>
            <h2 id={titleId} className={DIALOG_TITLE}>
              {title}
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>
          <div className={DIALOG_BODY}>{children}</div>
          {footer ? <footer className="modal-footer">{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}

/** Side panel for record details; keeps the list in place behind it. */
export function Drawer({
  title,
  subtitle,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      className="drawer"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
    >
      {open ? (
        <>
          <header className={DIALOG_HEAD}>
            <div>
              <h2 id={titleId} className={DIALOG_TITLE}>
                {title}
              </h2>
              {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>
          <div className={`${DIALOG_BODY} flex-1`}>
            {children}
          </div>
          {footer ? <footer className="modal-footer" style={{ borderRadius: 0 }}>{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}

/* ---------- Confirm dialog (every high-impact action asks once) ---------- */

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger' | 'warning';
  /** Requires the admin to type a reason; the promise resolves with it. */
  reason?: { label: string; required?: boolean; minLength?: number };
}
type ConfirmResult = { ok: false } | { ok: true; reason: string };
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<ConfirmResult>>(async () => ({ ok: true, reason: '' }));
const ToastContext = createContext<(message: string, tone?: 'success' | 'error') => void>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (r: ConfirmResult) => void } | null>(null);
  const [reason, setReason] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'success' | 'error' }[]>([]);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<ConfirmResult>((resolve) => {
        setReason('');
        setState({ opts, resolve });
      }),
    [],
  );
  const toast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const close = (r: ConfirmResult) => {
    state?.resolve(r);
    setState(null);
  };
  const opts = state?.opts;
  const min = opts?.reason ? (opts.reason.minLength ?? (opts.reason.required ? 3 : 0)) : 0;
  const reasonOk = !opts?.reason || reason.trim().length >= min;
  const ToneIcon = opts?.tone === 'danger' ? TriangleAlert : opts?.tone === 'warning' ? CircleAlert : ShieldCheck;

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toast}>
        {children}
        <Modal
          title={opts?.title ?? ''}
          open={Boolean(opts)}
          onClose={() => close({ ok: false })}
          footer={
            <>
              <Button variant="secondary" onClick={() => close({ ok: false })}>
                Cancel
              </Button>
              <Button
                variant={opts?.tone === 'danger' ? 'danger-solid' : 'primary'}
                disabled={!reasonOk}
                onClick={() => close({ ok: true, reason: reason.trim() })}
              >
                {opts?.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="confirm-body">
            <span className={`confirm-icon ${opts?.tone ?? ''}`} aria-hidden>
              <ToneIcon size={18} />
            </span>
            <div className="stack-sm" style={{ flex: 1 }}>
              <div>{opts?.body}</div>
              {opts?.reason ? (
                <TextArea
                  label={opts.reason.label}
                  required={opts.reason.required}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              ) : null}
            </div>
          </div>
        </Modal>
        <div className="pointer-events-none fixed right-5 bottom-5 z-200 flex flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              {t.tone === 'error' ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if ((await confirm({...})).ok) mutate();` */
export function useConfirm() {
  return useContext(ConfirmContext);
}
export function useToast() {
  return useContext(ToastContext);
}

/* ---------- Status ---------- */

const BADGE_TONE: Record<string, string> = {
  ACTIVE: 'success',
  READY: 'success',
  INVITED: 'info',
  DRAFT: 'neutral',
  IMPORTED: 'info',
  CONFIGURED: 'info',
  INACTIVE: 'neutral',
  DISABLED: 'error',
  SUSPENDED: 'error',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  AWAITING_APPROVAL: 'warning',
  IN_REVIEW: 'warning',
  REVIEW_REQUIRED: 'warning',
  VALIDATED: 'info',
  VERIFIED: 'success',
  APPROVED: 'success',
  COMMITTED: 'success',
  PUBLISHED: 'success',
  COMPLETED: 'success',
  CAPTURED: 'success',
  PAID: 'success',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  REJECTED: 'error',
  FAILED: 'error',
  NO_SHOW: 'error',
  OVERDUE: 'error',
  ESCALATED: 'error',
  RETURNED: 'warning',
  REVOKED: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  WITHDRAWN: 'neutral',
  SUPERSEDED: 'neutral',
  OPEN: 'info',
  ASSIGNED: 'teal',
  IN_PROGRESS: 'teal',
  SCHEDULED: 'neutral',
  NOT_READY: 'warning',
  PARTIALLY_PAID: 'warning',
};

export function humanize(status: string): string {
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusBadge({ status, tone }: { status: string; tone?: string }) {
  return <span className={`badge badge-${tone ?? BADGE_TONE[status] ?? 'neutral'}`}>{humanize(status)}</span>;
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.code === 'VALIDATION_FAILED' && error.fields.length
        ? `${error.message}.`
        : error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';
  return (
    <div className="banner banner-error" role="alert">
      <CircleAlert size={16} />
      <div>{message}</div>
      {error instanceof ApiError && error.requestId ? <span className="text-[12px] opacity-80">Reference {error.requestId}</span> : null}
    </div>
  );
}

export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div className={`banner banner-${tone}`}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  crumb,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  crumb?: { to: string; label: string };
}) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {crumb ? (
          <div className="breadcrumb">
            <Link to={crumb.to}>{crumb.label}</Link>
            <span className="faint">/</span>
          </div>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="panel">
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule px-[18px] py-3.5">
          <div style={{ minWidth: 0 }}>
            {title ? <h2 className="m-0 font-display text-[14.5px] leading-5 font-bold">{title}</h2> : null}
            {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </header>
      ) : null}
      {flush ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}

/** Page-level numbers as one line of facts (not a wall of metric cards). */
export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode; note?: ReactNode; tone?: 'amber' | 'red'; to?: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="facts">
      {items.map((f) => {
        const inner = (
          <>
            <span className="fact-label">
              {f.icon ? <f.icon size={14} /> : null}
              {f.label}
            </span>
            <span className="fact-value">{f.value}</span>
            {f.note ? <span className="fact-note">{f.note}</span> : null}
          </>
        );
        return f.to ? (
          <Link key={f.label} to={f.to} className={`fact ${f.tone ? `tone-${f.tone}` : ''}`}>
            {inner}
          </Link>
        ) : (
          <div key={f.label} className={`fact ${f.tone ? `tone-${f.tone}` : ''}`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number | undefined }[];
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" className="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
  label: string;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" aria-pressed={value === t.value} disabled={disabled} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden /> {label}…
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden />;
}

export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="empty">
      <span className="mb-2 grid size-10 place-items-center rounded-[10px] bg-teal-tint text-teal" aria-hidden>
        <Icon size={20} />
      </span>
      <p className="m-0 font-display text-[15px] leading-[22px] font-bold">{title}</p>
      {children ? <div className="empty-body">{children}</div> : null}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Semantic data table with sticky header, loading / error / empty states, and phone stacking. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  footer,
  caption,
  onRowClick,
  flush,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyBody?: ReactNode;
  footer?: ReactNode;
  caption?: string;
  onRowClick?: (row: T) => void;
  flush?: boolean;
}) {
  if (error) return <ErrorBanner error={error} />;
  if (loading && !rows)
    return (
      <div className={flush ? 'stack-sm panel-body' : 'table-wrap'} style={{ padding: 16 }} aria-busy>
        <div className="stack-sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={18} />
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  return (
    <div className="table-wrap" style={flush ? { border: 0, borderRadius: 0 } : undefined}>
      <table className="table stackable">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={
                onRowClick
                  ? (e) => {
                      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
                      onRowClick(r);
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.header} className={c.className} data-label={c.header}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer ? <div className="table-footer">{footer}</div> : null}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="search-field">
      <Search size={15} />
      <input type="search" className="input input-compact" placeholder={label} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

export function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select className="input input-compact" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return inr.format(paise / 100);
}
