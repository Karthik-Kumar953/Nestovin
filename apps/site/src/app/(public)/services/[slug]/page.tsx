import { ArrowRight, Check, Clock, Shirt, X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { services } from '@/site/content';
import { Container, EnquiryBand, LinkButton, PageHero, ServiceBadge } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  return s ? { title: `${s.name} service`, description: `${s.short} ${s.summary}`, alternates: { canonical: `/services/${s.slug}` } } : {};
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  if (!s) notFound();
  const others = services.filter((x) => x.slug !== s.slug);

  return (
    <>
      <PageHero title={s.name} lede={s.summary} {...pageHero(s.slug)} imageAlt={s.imageAlt}>
        <LinkButton href="/contact" variant="onBrand" arrow>
          Send an enquiry
        </LinkButton>
      </PageHero>

      <section className="bg-surface py-16 md:py-24">
        <Container>
          <h2 className="text-[28px] leading-9 font-semibold md:text-[36px] md:leading-[44px]" data-reveal>
            How often we come
          </h2>
          <p className="mt-3 max-w-[620px] text-[17px] leading-7 text-ink-2" data-reveal>
            Plans range from a single visit to help through the day. Which ones your community offers, and the time windows, are set when it joins.
          </p>
          <ul className={`mt-8 grid gap-4 ${s.rhythm.length > 1 ? 'md:grid-cols-3' : 'md:max-w-[420px]'}`}>
            {s.rhythm.map((r) => (
              <li key={r.name} className="rounded-lg border border-line bg-canvas p-6" data-reveal>
                <Clock size={22} className="text-teal" aria-hidden />
                <h3 className="mt-4 text-[20px] font-semibold">{r.name}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{r.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="bg-canvas py-16 md:py-24">
        <Container className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-[28px] leading-9 font-semibold md:text-[36px] md:leading-[44px]" data-reveal>
              What is included
            </h2>
            <p className="mt-3 max-w-[600px] text-[17px] leading-7 text-ink-2" data-reveal>
              The exact tasks and how often they are done depend on your plan. You see the full list for your flat in the app before you choose.
            </p>
            <div className="mt-10 space-y-10">
              {s.tasks.map((g) => (
                <div key={g.group} data-reveal>
                  <h3 className="border-b border-line pb-3 text-[19px] font-semibold">{g.group}</h3>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {g.items.map((t) => (
                      <li key={t} className="flex gap-2.5 text-[16px] text-ink">
                        <Check size={18} className="mt-1 shrink-0 text-green-action" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <aside className="space-y-5 self-start lg:sticky lg:top-[104px]">
            <div className="rounded-lg border border-line bg-surface p-6">
              <h2 className="font-display text-[19px] font-semibold text-charcoal">Not part of this service</h2>
              <ul className="mt-4 space-y-3">
                {s.notIncluded.map((t) => (
                  <li key={t} className="flex gap-2.5 text-[15px] text-ink-2">
                    <X size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            {s.note && <p className="rounded-lg bg-info-bg p-5 text-[15px] leading-6 text-info">{s.note}</p>}
            <div className="flex gap-4 rounded-lg border border-line bg-surface p-6">
              <ServiceBadge slug={s.slug} size="sm" />
              <div>
                <h2 className="flex items-center gap-2 font-display text-[19px] font-semibold text-charcoal">
                  <Shirt size={18} className="text-teal" aria-hidden /> How to recognise us
                </h2>
                <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{s.uniform}</p>
              </div>
            </div>
          </aside>
        </Container>
      </section>

      <section className="bg-surface py-16 md:py-20">
        <Container>
          <h2 className="text-[24px] leading-8 font-semibold">Other services</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {others.map((o) => (
              <Link key={o.slug} href={`/services/${o.slug}`} className="group flex items-center gap-4 rounded-lg border border-line p-6 transition-colors duration-200 hover:border-teal">
                <ServiceBadge slug={o.slug} />
                <div className="flex-1">
                  <div className="font-display text-[21px] font-semibold text-charcoal">{o.name}</div>
                  <p className="mt-1 text-[15px] text-ink-2">{o.short}</p>
                </div>
                <ArrowRight size={20} aria-hidden className="shrink-0 text-teal transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <EnquiryBand />
    </>
  );
}
