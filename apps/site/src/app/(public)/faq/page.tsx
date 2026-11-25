import { Plus } from 'lucide-react';
import { faq } from '@/site/content';
import { Container, EnquiryBand, PageHero } from '@/site/ui';
import { pageHero } from '@/site/hero-images';

export const metadata = {
  title: 'Frequently asked questions',
  description: 'Answers about Nestovin for residents, communities and job seekers: availability, prices, staff, check-in, payments and caretakers.',
  alternates: { canonical: '/faq' },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.flatMap((g) => g.items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } }))),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHero
        title="Questions, answered"
        lede="If your question is not here, send us an enquiry and a person will reply."
        {...pageHero('faq')}
        imageAlt="A Nestovin support team member answering a call at a bright desk"
      />
      <section className="bg-surface py-16 md:py-24">
        <Container className="grid gap-14 lg:grid-cols-[240px_1fr]">
          <nav aria-label="FAQ sections" className="hidden lg:block">
            <ul className="sticky top-[104px] space-y-3">
              {faq.map((g) => (
                <li key={g.group}>
                  <a href={`#${slug(g.group)}`} className="text-[15px] font-medium text-ink-2 hover:text-teal">
                    {g.group}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-14">
            {faq.map((g, gi) => (
              <section key={g.group} aria-labelledby={slug(g.group)} className="scroll-mt-[104px]">
                <h2 id={slug(g.group)} className="text-[26px] leading-9 font-semibold">
                  {g.group}
                </h2>
                <div className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {g.items.map((it, i) => (
                    <details key={it.q} className="group" open={gi === 0 && i === 0}>
                      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-[17px] font-semibold text-charcoal transition-colors hover:bg-canvas md:px-6 [&::-webkit-details-marker]:hidden">
                        {it.q}
                        <Plus size={20} aria-hidden className="shrink-0 text-teal transition-transform duration-300 group-open:rotate-45" />
                      </summary>
                      <p className="px-5 pb-5 text-[16px] leading-7 text-ink-2 md:px-6">{it.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </section>
      <EnquiryBand title="Still have a question?" body="Send us an enquiry and someone from Nestovin will get back to you." />
    </>
  );
}
