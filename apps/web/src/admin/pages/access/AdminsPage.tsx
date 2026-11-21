'use client';

import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '../../lib/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUser, AdminUserDetail, DataScope } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import {
  Button,
  DataTable,
  Drawer,
  ErrorBanner,
  FilterSelect,
  formatDateTime,
  InfoBanner,
  PageHeader,
  Panel,
  SearchBox,
  StatusBadge,
  TextInput,
  Toolbar,
  useToast,
} from '../../components/ui';
import { Mail, UserPlus } from '../../components/icons';
import { PermissionGrid, RolePicker, ScopePicker, scopeText, useCatalogue, useClusterNames, useRoles, type GrantPair } from './shared';

export function AdminsPage() {
  const navigate = useNavigate();
  const names = useClusterNames();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<AdminUser>(['admins'], `/v1/admin/admins${qs({ q, status, limit: 25 })}`);
  const [inviting, setInviting] = useState(false);
  const nameOf = (id: string) => names.map.get(id)?.name ?? 'Unknown cluster';

  return (
    <>
      <PageHeader
        title="Admin users"
        description="Everyone uses the same portal; each admin sees only the modules their roles and extra permissions allow, within their data scope."
        actions={
          <Button icon={UserPlus} onClick={() => setInviting(true)}>
            Invite admin
          </Button>
        }
      />
      <div className="stack">
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} label="Search name or email" />
          <FilterSelect
            value={status}
            onChange={setStatus}
            label="Status"
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INVITED', label: 'Invited' },
              { value: 'DISABLED', label: 'Disabled' },
            ]}
          />
        </Toolbar>
        <Panel flush>
          <DataTable
            flush
            caption="Admin users"
            loading={list.isLoading}
            error={list.error}
            rows={list.rows}
            rowKey={(a) => a.id}
            onRowClick={(a) => navigate(`/access/admins/${a.id}`)}
            emptyTitle={q || status ? 'No admins match' : 'No admins yet'}
            emptyBody={q || status ? 'Clear the search or status filter.' : 'Invite your first admin and give them roles and a data scope.'}
            columns={[
              {
                header: 'Admin',
                cell: (a) => (
                  <span className="primary-cell">
                    <Link to={`/access/admins/${a.id}`}>{a.fullName}</Link>
                    <span className="sub">
                      {a.email}
                      {a.title ? ` · ${a.title}` : ''}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Access',
                cell: (a) =>
                  a.isSuperAdmin ? (
                    <span className="badge badge-warning">Super Admin</span>
                  ) : (
                    <>
                      {a.roles.map((r) => (
                        <span key={r.id} className="chip">
                          {r.name}
                        </span>
                      ))}
                      {a.extraGrants.length ? <span className="chip">+{a.extraGrants.length} extra</span> : null}
                      {!a.roles.length && !a.extraGrants.length ? <span className="muted">No access yet</span> : null}
                    </>
                  ),
              },
              {
                header: 'Data scope',
                cell: (a) => {
                  const text = scopeText(a.scope, a.isSuperAdmin, nameOf);
                  return a.scope.type === 'CLUSTERS' && !a.isSuperAdmin && a.scope.clusterIds.length > 2 ? (
                    <span title={text}>{a.scope.clusterIds.length} clusters</span>
                  ) : (
                    text
                  );
                },
              },
              { header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
              { header: 'Last sign-in', cell: (a) => (a.lastSignInAt ? formatDateTime(a.lastSignInAt) : <span className="muted">Never</span>) },
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
      {inviting ? <InviteAdmin onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="stack-sm">
      <h3 className="section-title" style={{ margin: 0 }}>
        <span className="count" style={{ marginRight: 8 }}>
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function InviteAdmin({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const roles = useRoles();
  const catalogue = useCatalogue();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [extraGrants, setExtraGrants] = useState<GrantPair[]>([]);
  const [showExtra, setShowExtra] = useState(false);
  const [scope, setScope] = useState<DataScope>({ type: 'CLUSTERS', clusterIds: [] });

  const invite = useMutation({
    mutationFn: () =>
      api<AdminUserDetail>('/v1/admin/admins', {
        method: 'POST',
        body: { email, fullName, title: title || undefined, roleIds, extraGrants, scope },
      }),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['admins'] });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      toast(`Invitation sent to ${a.email}`);
      onClose();
    },
  });
  const err = invite.error instanceof ApiError ? invite.error : null;
  const scopeIncomplete = scope.type === 'CLUSTERS' && scope.clusterIds.length === 0;
  const noAccess = roleIds.length === 0 && extraGrants.length === 0;

  return (
    <Drawer
      open
      title="Invite admin"
      subtitle="Details, roles, extra permissions and data scope"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Mail} onClick={() => invite.mutate()} busy={invite.isPending} disabled={!email || fullName.trim().length < 2 || scopeIncomplete}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="stack">
        <ErrorBanner error={err?.fields.length ? null : invite.error} />
        <Step n={1} title="Who">
          <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} required />
          <TextInput
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={err?.field('email')}
            hint="They receive an invitation to set a password and enrol two-factor verification."
            required
          />
          <TextInput label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} hint="Shown for reference only; it grants no access." />
        </Step>
        <Step n={2} title="Roles">
          <RolePicker roles={roles.data?.items} loading={roles.isLoading} value={roleIds} onChange={setRoleIds} />
          {err?.field('roleIds') ? <p className="field-error">{err.field('roleIds')}</p> : null}
        </Step>
        <Step n={3} title="Extra permissions (optional)">
          <p className="field-hint" style={{ margin: 0 }}>
            For this admin only, on top of their roles. {extraGrants.length ? `${extraGrants.length} ticked.` : ''}
          </p>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowExtra((v) => !v)} aria-expanded={showExtra}>
              {showExtra ? 'Hide extra permissions' : 'Add extra permissions'}
            </Button>
          </div>
          {showExtra ? (
            catalogue.data ? (
              <PermissionGrid modules={catalogue.data.modules} value={extraGrants} onChange={setExtraGrants} caption="Extra permissions" />
            ) : (
              <ErrorBanner error={catalogue.error} />
            )
          ) : null}
          {err?.field('extraGrants') ? <p className="field-error">{err.field('extraGrants')}</p> : null}
        </Step>
        <Step n={4} title="Data scope">
          <ScopePicker
            value={scope}
            onChange={setScope}
            error={err?.field('scope') ?? (scopeIncomplete ? 'Choose at least one cluster, or All clusters' : undefined)}
          />
        </Step>
        {noAccess ? (
          <InfoBanner tone="warning">No roles or extra permissions yet: they can sign in but will see no modules until you add access.</InfoBanner>
        ) : null}
      </div>
    </Drawer>
  );
}
