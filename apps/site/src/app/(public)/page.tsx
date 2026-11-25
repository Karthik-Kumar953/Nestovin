import { ArrowRight, Check, Plus, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { careers, communities, difference, faq, paths, services, site } from '@/site/content';
import { DayStory } from '@/site/DayStory';
import { CommunityStory } from '@/site/CommunityStory';
import { FilmHero } from '@/site/FilmHero';
import { ServiceRail } from '@/site/ServiceRail';
import { Container, EmblemWatermark, EnquiryBand, LinkButton, SectionHead } from '@/site/ui';

export const metadata = { alternates: { canonical: '/' } };

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Nestovin',
    url: site.url,
    logo: `${site.url}/nestovin-logo.png`,
    slogan: 'A Home That Brings People Together',
    description: site.description,
    makesOffer: services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, description: s.short } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <FilmHero />
      <CommunityStory />

      {/* Three ways in */}
      <section className="bg-surface" aria-labelledby="paths-title">
        <Container className="py-14 md:py-16">
          <h2 id="paths-title" className="sr-only">
            Where would you like to start?
          </h2>
          <ul className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {paths.map((p) => (
              <li key={p.href} data-reveal>
                <Link href={p.href} className="group flex h-full items-center justify-between gap-6 py-6 md:px-8 md:py-2 md:first:pl-0">
                  <span>
                    <span className="block text-[14px] font-medium text-teal">{p.who}</span>
                    <span className="mt-1 block font-display text-[20px] leading-7 font-semibold text-charcoal">{p.what}</span>
                  </span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-teal transition-[background-color,color,border-color,transform] duration-300 group-hover:translate-x-1 group-hover:border-teal group-hover:bg-teal group-hover:text-white">
                    <ArrowRight size={18} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <ServiceRail />

      {/* A day at your flat */}
      <section className="bg-canvas py-20 md:py-28" aria-labelledby="day-title">
        <Container>
          <SectionHead
            id="day-title"
            title="A day at your flat"
            lede="What Nestovin looks like from your side of the door. A sample day."
            className="mb-14 md:mb-20"
          />
          <DayStory />
        </Container>
      </section>

      {/* Not a marketplace */}
      <section className="bg-surface py-20 md:py-28" aria-labelledby="diff-title">
        <Container className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionHead id="diff-title" title={difference.title} lede={difference.body} />
            <div className="mt-8" data-reveal>
              <LinkButton href="/trust" variant="quiet" arrow>
                How we keep your home safe
              </LinkButton>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface" data-reveal>
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <caption className="sr-only">Nestovin compared with arranging help on your own</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="w-[32%] px-5 py-4 md:px-6">
                    <span className="sr-only">Topic</span>
                  </th>
                  <th scope="col" className="px-5 py-4 md:px-6">
                    <span className="inline-flex items-center gap-2 font-display text-[16px] font-bold text-teal">
                      <Image src="/nestovin-logo.png" alt="" width={20} height={18} /> Nestovin
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-4 font-display text-[16px] font-semibold text-ink-2 md:px-6">
                    On your own
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {difference.rows.map((r) => (
                  <tr key={r.topic} className="align-top">
                    <th scope="row" className="px-5 py-4 font-medium text-charcoal md:px-6">
                      {r.topic}
                    </th>
                    <td className="bg-canvas/60 px-5 py-4 md:px-6">
                      <span className="flex gap-2 text-charcoal">
                        <Check size={18} className="mt-0.5 shrink-0 text-green-action" aria-hidden />
                        {r.us}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink-2 md:px-6">
                      <span className="flex gap-2">
                        <X size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                        {r.them}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      {/* How a community joins */}
      <section className="relative isolate overflow-hidden bg-canvas py-20 md:py-28" aria-labelledby="join-title">
        <EmblemWatermark className="absolute -right-24 -bottom-16 -z-10 w-[560px]" />
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <div>
              <SectionHead
                id="join-title"
                title="It starts with your community"
                lede="Nestovin starts in a community when its residents ask for it. We map your towers and flats, agree time windows with the committee, and build a trained team for your community."
              />
              <ol className="mt-10 space-y-0">
                {communities.onboarding.map((s, i) => (
                  <li key={s.title} data-reveal className="relative grid grid-cols-[40px_1fr] gap-4 pb-6 last:pb-0">
                    {i < communities.onboarding.length - 1 && <span className="absolute top-10 bottom-0 left-[19px] w-0.5 bg-line" aria-hidden />}
                    <span className="relative grid size-10 place-items-center rounded-full bg-teal font-display text-[15px] font-bold text-white tabular-nums">{i + 1}</span>
                    <div className="pt-1.5">
                      <h3 className="text-[18px] leading-7 font-semibold">{s.title}</h3>
                      <p className="mt-0.5 text-[15px] leading-6 text-ink-2">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-10 flex flex-wrap gap-3" data-reveal>
                <LinkButton href="/contact?type=community" arrow>
                  Ask for Nestovin in your community
                </LinkButton>
              </div>
            </div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl sm:aspect-[16/12] lg:aspect-[4/5]" data-reveal>
              <Image src="/site/community-dawn.jpg" alt="A modern gated residential community at golden hour" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
            </div>
          </div>
        </Container>
      </section>

      {/* Careers, in one line: the full story lives on /careers */}
      <section className="border-t border-line bg-surface py-12 md:py-14" aria-labelledby="car-title">
        <Container className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative hidden size-20 shrink-0 overflow-hidden rounded-full sm:block">
              <Image src="/site/team.jpg" alt="" fill sizes="80px" className="object-cover" />
            </div>
            <div>
              <h2 id="car-title" className="text-[24px] leading-8 font-semibold md:text-[28px] md:leading-9">
                {careers.title}
              </h2>
              <p className="mt-1 max-w-[560px] text-[16px] leading-6 text-ink-2">A monthly salary, training before you start, and homes near where you live.</p>
            </div>
          </div>
          <LinkButton href="/careers" variant="secondary" arrow className="self-start md:self-auto">
            Work with Nestovin
          </LinkButton>
        </Container>
      </section>

      {/* A few questions, answered here; the full list lives on /faq */}
      <section className="bg-canvas py-20 md:py-28" aria-labelledby="home-faq-title">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div data-reveal>
            <SectionHead id="home-faq-title" title="Questions, answered" lede="The things residents ask us most. If yours is not here, send us an enquiry and a person will reply." />
            <LinkButton href="/faq" variant="quiet" arrow className="mt-6">
              All questions
            </LinkButton>
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" data-reveal>
            {faq[0]!.items.slice(0, 5).map((it, i) => (
              <details key={it.q} className="group" open={i === 0}>
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-[17px] font-semibold text-charcoal transition-colors hover:bg-canvas md:px-6 [&::-webkit-details-marker]:hidden">
                  {it.q}
                  <Plus size={20} aria-hidden className="shrink-0 text-teal transition-transform duration-300 group-open:rotate-45" />
                </summary>
                <p className="px-5 pb-5 text-[16px] leading-7 text-ink-2 md:px-6">{it.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <EnquiryBand />
    </>
  );
}
