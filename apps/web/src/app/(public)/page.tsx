import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: { absolute: 'Nestovin' },
  // Not indexed until the real website replaces this holding page.
  robots: { index: false, follow: false },
};

/**
 * Temporary holding page for "/". The Public Website (Home, Services, How It
 * Works, About, Contact & enquiry, FAQ, Privacy, Terms, Careers) is built here
 * with Tailwind CSS after its design direction is approved, using client copy.
 */
export default function HoldingPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Image src="/nestovin-logo.png" alt="Nestovin" width={81} height={72} priority className="mx-auto" />
        <h1 className="mt-4 mb-2 text-3xl font-bold tracking-tight">Nestovin</h1>
        <p className="text-ink-2">A Home That Brings People Together</p>
      </div>
    </main>
  );
}
