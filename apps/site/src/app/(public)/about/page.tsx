import { about, site } from '@/site/content';
import { Container, EnquiryBand, PageHero, Photo, SectionHead } from '@/site/ui';

export const metadata = {
  title: 'About Nestovin',
  description: 'Why Nestovin exists and what it believes about home help.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <PageHero title={about.title} lede={about.story[0]!} />
      <section className="bg-surface py-16 md:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Photo src="/site/community-dawn.jpg" alt="A modern gated residential community at golden hour" className="aspect-[4/3]" />
          <div data-reveal>
            <p className="font-display text-[24px] leading-9 font-semibold text-charcoal md:text-[30px] md:leading-[42px]">{about.story[1]}</p>
            <p className="mt-6 font-display text-[18px] font-semibold text-teal">{site.tagline}</p>
          </div>
        </Container>
      </section>
      <section className="bg-surface py-16 md:py-24">
        <Container>
          <SectionHead title="What we believe" className="mb-12" />
          <div className="grid gap-10 md:grid-cols-3">
            {about.beliefs.map((b) => (
              <div key={b.title} className="border-t-[3px] border-brand pt-6" data-reveal>
                <h3 className="text-[21px] leading-8 font-semibold">{b.title}</h3>
                <p className="mt-2 text-[16px] leading-7 text-ink-2">{b.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <EnquiryBand title="Talk to us" body="Whether it is help at home, Nestovin for your community or a job with us, start with an enquiry." />
    </>
  );
}
