import { GraduationCap, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import Image from 'next/image';
import { careers, services } from '@/site/content';
import { JoinPath } from '@/site/JoinPath';
import { Container, EnquiryBand, LinkButton, PageHero, SectionHead, ServiceBadge } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export const metadata = {
  title: 'Careers: maid, cook and caretaker jobs',
  description: 'Work with Nestovin as a maid, cook or caretaker: a monthly salary, training before you start, and work close to home.',
  alternates: { canonical: '/careers' },
};

const pointIcons = [Wallet, GraduationCap, MapPin, ShieldCheck];

export default function CareersPage() {
  return (
    <>
      <PageHero title={careers.title} lede={careers.body} {...pageHero('careers')} imageAlt="New Nestovin staff learning together in a bright training room">
        <LinkButton href="/contact?type=careers" variant="onBrand" arrow>
          Send your details
        </LinkButton>
        <LinkButton href="#path-title" variant="outlineLight">
          See how joining works
        </LinkButton>
      </PageHero>

      {/* What you get */}
      <section className="bg-surface py-16 md:py-24">
        <Container>
          <SectionHead title="What you get" lede="Steady work that respects your time, your skills and your family." />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {careers.points.map((p, i) => {
              const Icon = pointIcons[i]!;
              return (
                <li key={p.title} className="group rounded-xl border border-line bg-canvas p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-brand/40 md:p-7" data-reveal>
                  <span className="grid size-12 place-items-center rounded-full bg-teal text-white">
                    <Icon size={22} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-[20px] leading-7 font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[16px] leading-6 text-ink-2">{p.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <JoinPath />

      {/* Roles */}
      <section className="bg-surface py-16 md:py-24" aria-labelledby="roles-title">
        <Container>
          <SectionHead id="roles-title" title="Roles we hire for" lede="Each role has its own uniform, its own training and a schedule you know in advance." />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {services.map((s) => (
              <li key={s.slug} className="overflow-hidden rounded-xl border border-line bg-canvas" data-reveal>
                <div className="relative aspect-[4/3]">
                  <Image src={s.image} alt={s.imageAlt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <ServiceBadge slug={s.slug} size="sm" />
                    <h3 className="text-[22px] font-semibold">{careers.roles[services.indexOf(s)] ?? s.name}</h3>
                  </div>
                  <p className="mt-3 text-[15px] leading-6 text-ink-2">{s.uniform}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-[620px] text-[16px] leading-7 text-ink-2" data-reveal>
            {careers.how} <strong className="font-semibold text-charcoal">Nestovin never asks for a fee to apply or to get a job.</strong>
          </p>
        </Container>
      </section>

      <EnquiryBand title="Ready to join the team?" body="Send your name and number through the enquiry form. Our HR team will call you." href="/contact?type=careers" cta="Send your details" />
    </>
  );
}
