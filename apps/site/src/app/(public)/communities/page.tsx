import { Building2, ShieldCheck, Users, Vote } from 'lucide-react';
import { communities } from '@/site/content';
import { Container, EnquiryBand, LinkButton, PageHero, SectionHead } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export const metadata = {
  title: 'For communities, RWAs and facility managers',
  description: 'Bring Nestovin to your gated community: one accountable provider for home help across every tower. Residents decide; the committee buys nothing.',
  alternates: { canonical: '/communities' },
};

const icons = [Building2, ShieldCheck, Vote, Users];

export default function CommunitiesPage() {
  return (
    <>
      <PageHero title={communities.title} lede={communities.body} {...pageHero('communities')} imageAlt="A modern gated residential community at golden hour">
        <LinkButton href="/contact?type=community" variant="onBrand" arrow>
          Talk to us about your community
        </LinkButton>
      </PageHero>
      <section className="bg-surface py-16 md:py-24">
        <Container>
          <SectionHead title="What changes for your community" className="mb-12" />
          <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
            {communities.benefits.map((b, i) => {
              const Icon = icons[i]!;
              return (
                <div key={b.title} className="flex gap-5" data-reveal>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-teal text-white">
                    <Icon size={22} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[21px] leading-8 font-semibold">{b.title}</h3>
                    <p className="mt-1.5 text-[16px] leading-7 text-ink-2">{b.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>
      <section className="bg-canvas py-16 md:py-24">
        <Container>
          <SectionHead title="How we start in a community" lede="Five steps, from the first conversation to service at every flat." className="mb-12" />
          <ol className="grid gap-4 md:grid-cols-5">
            {communities.onboarding.map((s, i) => (
              <li key={s.title} className="relative rounded-lg border border-line bg-surface p-5" data-reveal>
                <span className="grid size-10 place-items-center rounded-full bg-teal font-display text-[15px] font-bold text-white tabular-nums">{i + 1}</span>
                <h3 className="mt-4 text-[17px] leading-6 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <section className="bg-surface py-16 md:py-20">
        <Container className="max-w-[860px]">
          <div className="rounded-xl bg-canvas p-8 md:p-10" data-reveal>
            <h2 className="text-[26px] leading-9 font-semibold">Not in your city yet?</h2>
            <p className="mt-3 text-[17px] leading-7 text-ink-2">
              Residents can ask for Nestovin in their city or community. The more homes that ask, the sooner we plan it. Asking in the app comes with the Nestovin apps; until then, send us an enquiry.
            </p>
          </div>
        </Container>
      </section>
      <EnquiryBand title="Start the conversation" body="Tell us your community's name, city and roughly how many flats it has. We will set up a call with the committee or facility manager." href="/contact?type=community" />
    </>
  );
}
