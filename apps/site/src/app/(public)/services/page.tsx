import { ArrowRight, Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { services } from '@/site/content';
import { Container, EnquiryBand, PageHero, ServiceBadge } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export const metadata = {
  title: 'Services: maid, cook and caretaker',
  description: "Maid, cook and caretaker services from Nestovin, done by Nestovin's own trained, verified staff assigned to your flat.",
  alternates: { canonical: '/services' },
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        {...pageHero('services')}
        imageAlt="Three Nestovin staff in their role uniforms"
        title="Maid, cook and caretaker"
        lede="Three services, each done by a Nestovin employee who is verified, trained and assigned to your flat. What is included depends on the plan your community offers; the app shows you the full list before you choose."
      />
      <section className="bg-surface py-16 md:py-24">
        <Container className="space-y-6">
          {services.map((s, i) => (
            <article key={s.slug} data-reveal className="grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-2">
              <div className={`relative aspect-[16/10] lg:aspect-auto lg:min-h-[460px] ${i % 2 ? 'lg:order-2' : ''}`}>
                <Image src={s.image} alt={s.imageAlt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-col p-6 md:p-10">
                <div className="flex items-center gap-4">
                  <ServiceBadge slug={s.slug} />
                  <div>
                    <h2 className="text-[30px] leading-[38px] font-bold">{s.name}</h2>
                    <p className="text-[15px] font-medium text-teal">{s.line}</p>
                  </div>
                </div>
                <p className="mt-5 text-[17px] leading-7 text-ink-2">{s.summary}</p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {s.tasks[0]!.items.slice(0, 4).map((t) => (
                    <li key={t} className="flex gap-2 text-[15px] text-ink">
                      <Check size={18} className="mt-0.5 shrink-0 text-green-action" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                {s.note && <p className="mt-6 rounded-md bg-info-bg px-4 py-3 text-[15px] text-info">{s.note}</p>}
                <Link href={`/services/${s.slug}`} className="group mt-auto inline-flex min-h-12 items-center gap-2 pt-8 font-display text-[16px] font-semibold text-teal hover:text-teal-deep">
                  Everything in the {s.name.toLowerCase()} service
                  <ArrowRight size={18} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </article>
          ))}
          <p className="mx-auto max-w-[720px] pt-6 text-center text-[16px] leading-7 text-ink-2" data-reveal>
            Prices are not shown here because they are set for each community and home size. Once your community is live, the Nestovin app shows exactly what your flat can choose.
          </p>
        </Container>
      </section>
      <EnquiryBand title="Want Nestovin at home?" body="Tell us your community and what you need. We will tell you honestly whether we run there yet, and what happens next." />
    </>
  );
}
