import { Footer } from '@/site/Footer';
import { Header } from '@/site/Header';
import './(public)/site.css';
import { Container, LinkButton } from '@/site/ui';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <Header />
      <main id="main" className="flex-1">
        <Body />
      </main>
      <Footer />
    </div>
  );
}

function Body() {
  return (
    <section className="bg-canvas py-24 md:py-32">
      <Container className="max-w-[640px] text-center">
        <p className="font-display text-[72px] leading-none font-bold text-brand">404</p>
        <h1 className="mt-6 text-[32px] leading-10 font-bold md:text-[40px] md:leading-[48px]">This page has moved out</h1>
        <p className="mt-4 text-lg leading-8 text-ink-2">The page you were looking for is not here. Try the home page, or send us an enquiry.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/">Go to the home page</LinkButton>
          <LinkButton href="/contact" variant="secondary">Send an enquiry</LinkButton>
        </div>
      </Container>
    </section>
  );
}
