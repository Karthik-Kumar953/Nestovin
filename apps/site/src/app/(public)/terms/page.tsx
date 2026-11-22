import Link from 'next/link';
import { Container } from '@/site/ui';

export const metadata = { title: 'Terms', alternates: { canonical: '/terms' } };

/** OWNER: replace with the reviewed terms of service before launch. */
export default function TermsPage() {
  return (
    <section className="bg-surface py-14 md:py-20">
      <Container>
        <article className="max-w-[720px] text-[17px] leading-8 text-ink-2 [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-[24px] [&_h2]:font-semibold [&_p]:mt-3">
          <h1 className="text-[36px] leading-[44px] font-bold text-charcoal md:text-[48px] md:leading-[56px]">Terms</h1>
          <p className="mt-6! rounded-md bg-info-bg px-4 py-3 text-[15px] leading-6 text-info">The terms of service for Nestovin plans will be published with the Nestovin apps.</p>
          <h2>This website</h2>
          <p>
            This website gives general information about Nestovin. It does not take bookings or payments, and nothing on it is an offer of service. Plans, prices and conditions for your flat are shown in the Nestovin app once your community is live.
          </p>
          <p>
            An enquiry sent from this website is a request for us to contact you. It is not a booking or a confirmed service.
          </p>
          <p>
            Questions?{' '}
            <Link href="/contact" className="font-medium text-teal underline">
              Send us an enquiry
            </Link>
            .
          </p>
        </article>
      </Container>
    </section>
  );
}
