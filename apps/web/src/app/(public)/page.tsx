import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: { absolute: 'Nestovin' },
  // Not indexed until the real website (Phase 1b) replaces this holding page.
  robots: { index: false, follow: false },
};

/**
 * Temporary holding page for "/". The Public Website (Home, Services, How It
 * Works, About, Contact & enquiry, FAQ, Privacy, Terms, Careers) is built here
 * after its design pass (Phase 1b), using client-approved copy.
 */
export default function HoldingPage() {
  return (
    <main
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div>
        <Image src="/nestovin-logo.png" alt="Nestovin" width={81} height={72} priority />
        <h1 style={{ fontFamily: 'var(--nv-font-heading)', margin: '16px 0 8px' }}>Nestovin</h1>
        <p style={{ color: 'var(--nv-text-secondary)', margin: 0 }}>A Home That Brings People Together</p>
      </div>
    </main>
  );
}
