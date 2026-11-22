import { Ban, CircleCheck, Hourglass, Users } from 'lucide-react';
import { modes, steps } from '@/site/content';
import { DayStory } from '@/site/DayStory';
import { Container, EnquiryBand, LinkButton, PageHero, SectionHead } from '@/site/ui';

export const metadata = {
  title: 'How it works',
  description: 'How Nestovin starts in a community, verifies your flat, assigns trained staff and checks in every visit at your door.',
  alternates: { canonical: '/how-it-works' },
};

const never = ['Pay staff in cash', 'Find a replacement yourself', "Track anyone's location"];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero title="From your community joining to the first knock on your door" lede="Nestovin works community by community. Here is every step, in the order it happens.">
        <LinkButton href="/contact" arrow>
          Send an enquiry
        </LinkButton>
      </PageHero>

      <section className="bg-surface py-16 md:py-24" aria-label="Steps">
        <Container>
          <ol className="relative mx-auto max-w-[860px]">
            <span className="absolute top-6 bottom-6 left-[27px] w-0.5 bg-line" aria-hidden />
            {steps.map((s) => (
              <li key={s.n} className="relative grid grid-cols-[56px_1fr] gap-6 pb-12 last:pb-0" data-reveal>
                <span className="relative grid size-14 place-items-center rounded-full bg-teal font-display text-[18px] font-bold text-white tabular-nums">{s.n}</span>
                <div className="pt-2">
                  <h2 className="text-[24px] leading-8 font-semibold">{s.title}</h2>
                  <p className="mt-2 max-w-[640px] text-[17px] leading-7 text-ink-2">{s.body}</p>
                  {s.n === '03' && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      {modes.map((m, i) => (
                        <div key={m.name} className="rounded-lg border border-line bg-canvas p-5">
                          <h3 className="flex items-center gap-2 text-[18px] font-semibold">
                            {i === 0 ? <CircleCheck size={20} className="text-teal" aria-hidden /> : <Users size={20} className="text-teal" aria-hidden />}
                            {m.name}
                          </h3>
                          <p className="mt-2 text-[15px] leading-6 text-ink-2">{m.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="bg-canvas py-16 md:py-24" aria-labelledby="day-title">
        <Container>
          <SectionHead id="day-title" title="What a day looks like once you are set up" lede="A sample day at flat 1204, from the cook's arrival to the caretaker's evening hours." className="mb-14" />
          <DayStory />
        </Container>
      </section>

      <section className="bg-surface py-16 md:py-24">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <SectionHead title="What you will never be asked to do" lede="Nestovin carries the running of home help, so these are never on you." />
          <ul className="grid gap-3">
            {never.map((n) => (
              <li key={n} className="flex items-center gap-4 rounded-lg border border-line p-5 text-[18px] font-medium text-charcoal" data-reveal>
                <span className="grid size-10 place-items-center rounded-full bg-error-bg text-error">
                  <Ban size={20} aria-hidden />
                </span>
                {n}
              </li>
            ))}
            <li className="flex items-center gap-4 rounded-lg bg-canvas p-5 text-[16px] text-ink-2" data-reveal>
              <span className="grid size-10 place-items-center rounded-full bg-surface text-teal">
                <Hourglass size={20} aria-hidden />
              </span>
              Something late or not right? Raise a request in the app, and it gets an owner and a deadline.
            </li>
          </ul>
        </Container>
      </section>
      <EnquiryBand title="Want Nestovin at home?" body="Tell us your community and what you need. We will tell you honestly whether we run there yet, and what happens next." />
    </>
  );
}
