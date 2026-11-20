'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CatalogueVersionDetail } from '@nestovin/contracts';
import { api, rupeesToPaise } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, EmptyState, ErrorBanner, InfoBanner } from '../../components/ui';
import { useVersions } from './SetupPage';
import { useCategories, useServices } from './BasicsSteps';
import { DraftBar, useVersionDetail } from './PlansStep';

type CellKey = string; // `${kind}|${planId|componentId}|${categoryId}|${serviceId|''}`
const pkgKey = (planId: string, cat: string) => `P|${planId}|${cat}|`;
const svcKey = (planId: string, cat: string, serviceId: string) => `S|${planId}|${cat}|${serviceId}`;
const addonKey = (componentId: string, cat: string) => `A|${componentId}|${cat}|`;
const toText = (paise: number) => (paise / 100).toString();

/**
 * Price matrix (ADR-009): per plan, rows = residence categories, columns =
 * package price, individual service prices and optional add-ons. An EMPTY cell
 * means "not offered" (e.g. Gold not sold to 1 BHK). Add-on 0 = included.
 */
export function PricesStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const versions = useVersions(communityId);
  const shown = versions.data?.draft ?? versions.data?.published ?? null;
  const detail = useVersionDetail(shown?.id);
  const categories = useCategories(communityId);
  const services = useServices(communityId);
  const editable = shown?.status === 'DRAFT' && can(me, 'catalogue_pricing', 'edit');
  const activeCats = useMemo(() => (categories.data ?? []).filter((c) => c.status === 'ACTIVE'), [categories.data]);
  const [values, setValues] = useState<Record<CellKey, string>>({});
  const [dirty, setDirty] = useState(false);

  // Load the stored matrix into editable text cells.
  useEffect(() => {
    if (!detail.data) return;
    const v: Record<CellKey, string> = {};
    for (const p of detail.data.prices) {
      v[p.priceBasis === 'PACKAGE' ? pkgKey(p.planId, p.residenceCategoryId) : svcKey(p.planId, p.residenceCategoryId, p.serviceId!)] = toText(p.amountPaise);
    }
    for (const a of detail.data.addonPrices) v[addonKey(a.planComponentId, a.residenceCategoryId)] = toText(a.amountPaise);
    setValues(v);
    setDirty(false);
  }, [detail.data]);

  const invalid = Object.entries(values).filter(([, text]) => Number.isNaN(rupeesToPaise(text)));

  const save = useMutation({
    mutationFn: () => {
      const cells: { planId: string; residenceCategoryId: string; priceBasis: 'PACKAGE' | 'SERVICE'; serviceId: string | null; amountPaise: number }[] = [];
      const addonCells: { planComponentId: string; residenceCategoryId: string; amountPaise: number }[] = [];
      for (const [key, text] of Object.entries(values)) {
        const paise = rupeesToPaise(text);
        if (paise === null || Number.isNaN(paise)) continue;
        const [kind, ref, cat, serviceId] = key.split('|') as [string, string, string, string];
        if (kind === 'P' && paise > 0) cells.push({ planId: ref, residenceCategoryId: cat, priceBasis: 'PACKAGE', serviceId: null, amountPaise: paise });
        if (kind === 'S' && paise > 0) cells.push({ planId: ref, residenceCategoryId: cat, priceBasis: 'SERVICE', serviceId, amountPaise: paise });
        if (kind === 'A') addonCells.push({ planComponentId: ref, residenceCategoryId: cat, amountPaise: paise });
      }
      return api<CatalogueVersionDetail>(`/v1/admin/catalogue-versions/${shown!.id}/price-matrix`, { method: 'PUT', body: { cells, addonCells } });
    },
    onSuccess: (d) => qc.setQueryData(['catalogue-version', d.id], d),
  });

  const set = (key: CellKey, text: string) => {
    setValues((v) => ({ ...v, [key]: text }));
    setDirty(true);
  };

  const serviceName = (id: string) => services.data?.services.find((s) => s.serviceId === id)?.name ?? 'Service';

  return (
    <div className="stack">
      <h2 className="section-title">Price matrix</h2>
      <p className="field-hint">
        Prices in ₹ for one plan purchase (its validity period). Leave a cell <strong>empty</strong> to not offer that option to that category, e.g. no Gold for
        1 BHK. For add-ons, enter 0 if it is included in the package price.
      </p>
      <DraftBar communityId={communityId} />
      <ErrorBanner error={detail.error ?? save.error} />
      {save.isSuccess && !dirty ? <InfoBanner tone="success">Prices saved.</InfoBanner> : null}
      {activeCats.length === 0 ? <InfoBanner tone="warning">Define residence categories first.</InfoBanner> : null}
      {detail.data && detail.data.plans.length === 0 ? <EmptyState title="Add plans first, then set their prices here" /> : null}

      {detail.data?.plans.map((plan) => {
        const core = plan.components.filter((c) => !c.isOptionalAddon);
        const addons = plan.components.filter((c) => c.isOptionalAddon);
        return (
          <div key={plan.id} className="stack" style={{ gap: 8 }}>
            <h3 className="card-title">
              {plan.name} <span className="muted">({plan.validityDays} days)</span>
            </h3>
            <div className="table-wrap">
              <table className="table price-grid">
                <caption className="sr-only">{plan.name} prices</caption>
                <thead>
                  <tr>
                    <th scope="col">Residence category</th>
                    <th scope="col">Complete package</th>
                    {core.length > 1 ? core.map((c) => <th key={c.id} scope="col">{serviceName(c.serviceId)} only</th>) : null}
                    {addons.map((c) => (
                      <th key={c.id} scope="col">
                        + {serviceName(c.serviceId)} add-on{c.addonHours ? ` (${c.addonHours} h)` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCats.map((cat) => (
                    <tr key={cat.id}>
                      <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, background: 'transparent', color: 'var(--nv-text-primary)' }}>
                        {cat.label}
                      </th>
                      <PriceInput label={`${plan.name}, ${cat.label}, package`} value={values[pkgKey(plan.id, cat.id)] ?? ''} disabled={!editable} onChange={(t) => set(pkgKey(plan.id, cat.id), t)} />
                      {core.length > 1
                        ? core.map((c) => (
                            <PriceInput
                              key={c.id}
                              label={`${plan.name}, ${cat.label}, ${serviceName(c.serviceId)} only`}
                              value={values[svcKey(plan.id, cat.id, c.serviceId)] ?? ''}
                              disabled={!editable}
                              onChange={(t) => set(svcKey(plan.id, cat.id, c.serviceId), t)}
                            />
                          ))
                        : null}
                      {addons.map((c) => (
                        <PriceInput
                          key={c.id}
                          label={`${plan.name}, ${cat.label}, ${serviceName(c.serviceId)} add-on`}
                          value={values[addonKey(c.id, cat.id)] ?? ''}
                          disabled={!editable}
                          allowZero
                          onChange={(t) => set(addonKey(c.id, cat.id), t)}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {editable && detail.data?.plans.length ? (
        <div className="row">
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!dirty || invalid.length > 0}>
            Save prices
          </Button>
          {invalid.length ? <span className="field-error">Fix {invalid.length} invalid amount(s) (numbers only, up to 2 decimals).</span> : null}
          {dirty ? <span className="muted">Unsaved changes</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function PriceInput({
  label,
  value,
  disabled,
  allowZero,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  allowZero?: boolean;
  onChange: (text: string) => void;
}) {
  const paise = rupeesToPaise(value);
  const bad = Number.isNaN(paise) || (!allowZero && paise === 0);
  return (
    <td>
      <div className="price-cell">
        <span aria-hidden>₹</span>
        <input
          className="input input-compact"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={bad || undefined}
          placeholder="Not offered"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </td>
  );
}
