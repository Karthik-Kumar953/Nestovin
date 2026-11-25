import { PackageSearch, QrCode } from 'lucide-react';
import Image from 'next/image';
import { CheckInDemo } from '@/site/CheckInDemo';
import { TrustJourney } from '@/site/TrustJourney';
import { Container, EnquiryBand, PageHero } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export const metadata = {
  title: 'Trust and safety',
  description: 'How Nestovin verifies, trains, employs and checks in every staff member who enters your home, and how it protects your details.',
  alternates: { canonical: '/trust' },
};

export default function TrustPage() {
  return (
    <>
      <PageHero
        title="Someone you can let into your home"
        lede="Trust is not a badge on a website. It is a set of checks that happen before someone joins, before the first visit, and at your door every day."
        {...pageHero('trust')}
        imageAlt="A resident at their front door showing a check-in code to a Nestovin cook"
      />
      <section className="bg-surface py-16 md:py-28">
        <Container>
          <TrustJourney />
        </Container>
      </section>
      <section className="bg-canvas py-16 md:py-28">
        <Container>
          <CheckInDemo />
          <ul className="mt-16 grid gap-5 md:mt-20 md:grid-cols-2">
            {[
              {
                icon: QrCode,
                title: 'A parent at home alone',
                body: 'Add them as a family member in the Nestovin app. At the door they simply show the visit QR code on their phone, and the visit starts.',
              },
              {
                icon: PackageSearch,
                title: 'If something goes missing',
                body: 'Tell us straight away through the app or by contacting us. A person takes up every report, and Nestovin takes action against theft.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-5 rounded-xl border border-line bg-surface p-6 md:p-8" data-reveal>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-teal text-white">
                  <Icon size={22} aria-hidden />
                </span>
                <div>
                  <h3 className="text-[21px] leading-8 font-semibold">{title}</h3>
                  <p className="mt-1 text-[16px] leading-7 text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <section className="bg-surface py-16 md:py-24">
        <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[16/11] overflow-hidden rounded-xl" data-reveal>
            <Image src="/site/id-detail.jpg" alt="Nestovin caretaker uniform with teal collar, white embroidered house emblem and photo ID card" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
          <div data-reveal>
            <h2 className="text-[28px] leading-9 font-semibold md:text-[38px] md:leading-[46px]">Fair to the people who work in your home</h2>
            <ul className="mt-6 space-y-4 text-[17px] leading-7 text-ink-2">
              <li>Location is recorded only at the moment a visit is checked in. Nobody is tracked through the day.</li>
              <li>Staff have a fixed schedule, a uniform for their role and a Nestovin photo ID.</li>
              <li>They are paid a monthly salary by Nestovin, never in cash by the visit.</li>
              <li>Corrections to a visit record are reviewed by a person, and the original record is kept.</li>
            </ul>
          </div>
        </Container>
      </section>
      <EnquiryBand title="Questions about who comes to your home?" body="Ask us anything about our checks, our staff or how visits work. A person from Nestovin will answer." />
    </>
  );
}
