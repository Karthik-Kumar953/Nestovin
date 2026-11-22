import Link from 'next/link';
import { Container } from '@/site/ui';

export const metadata = { title: 'Privacy notice', alternates: { canonical: '/privacy' } };

/** OWNER: replace with the reviewed privacy policy before launch. This states only what the website does today. */
export default function PrivacyPage() {
  return (
    <section className="bg-surface py-14 md:py-20">
      <Container>
        <article className="max-w-[720px] text-[17px] leading-8 text-ink-2 [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-[24px] [&_h2]:font-semibold [&_p]:mt-3">
          <h1 className="text-[36px] leading-[44px] font-bold text-charcoal md:text-[48px] md:leading-[56px]">Privacy notice</h1>
          <p className="mt-6! rounded-md bg-info-bg px-4 py-3 text-[15px] leading-6 text-info">
            Our full privacy policy will be published with the Nestovin apps. This notice covers the website as it is today.
          </p>
          <h2>What this website collects</h2>
          <p>Only what you type into the enquiry form: your name and mobile number, and if you choose to give them, your email, city, community and message.</p>
          <h2>How we use it</h2>
          <p>To reply to your enquiry by phone, SMS or email, and to understand which communities are asking for Nestovin. We do not sell it.</p>
          <h2>Bookings and payments</h2>
          <p>The website takes no bookings or payments. Those happen only in the Nestovin app, under its own privacy policy.</p>
          <h2>Your choices</h2>
          <p>
            You can ask us to correct or delete your enquiry at any time.{' '}
            <Link href="/contact" className="font-medium text-teal underline">
              Send us an enquiry
            </Link>{' '}
            with your request.
          </p>
        </article>
      </Container>
    </section>
  );
}
