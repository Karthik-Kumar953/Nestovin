import { Mail, MapPin, Phone, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { nav, services, site } from './content';
import { Logo } from './Header';
import { Container } from './ui';

export function AppBadges() {
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Nestovin apps">
      {['App Store', 'Google Play'].map((store) => (
        <li key={store} className="flex min-h-12 items-center gap-3 rounded-md border border-white/20 px-4 py-2 text-white">
          <Smartphone size={20} className="text-brand-green" aria-hidden />
          <span className="leading-tight">
            <span className="block text-[12px] text-line">Coming soon on</span>
            <span className="block font-display text-[15px] font-semibold">{store}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Footer() {
  const { email, phone, address, hours } = site.contact;
  const linkCls = 'text-line transition-colors hover:text-white';
  return (
    <footer className="bg-charcoal text-white">
      <Container className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
        <div>
          <Link href="/" className="inline-flex rounded-sm" aria-label="Nestovin, home">
            <Logo onDark />
          </Link>
          <p className="mt-4 font-display text-[17px] font-semibold text-white">{site.tagline}</p>
          <p className="mt-2 max-w-[340px] text-[15px] leading-6 text-line">{site.description}</p>
          <div className="mt-6">
            <AppBadges />
          </div>
        </div>

        <nav aria-label="Services">
          <h2 className="font-display text-[15px] font-semibold text-white">Services</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className={linkCls}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="font-display text-[15px] font-semibold text-white">Nestovin</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            {[...nav.filter((n) => n.href !== '/services'), { href: '/faq', label: 'FAQ' }].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={linkCls}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-[15px] font-semibold text-white">Talk to us</h2>
          <ul className="mt-4 space-y-3 text-[15px] text-line">
            {phone && (
              <li className="flex items-center gap-2.5">
                <Phone size={18} className="text-brand-green" aria-hidden />
                <a href={`tel:${phone}`} className={linkCls}>{phone}</a>
              </li>
            )}
            {email && (
              <li className="flex items-center gap-2.5">
                <Mail size={18} className="text-brand-green" aria-hidden />
                <a href={`mailto:${email}`} className={linkCls}>{email}</a>
              </li>
            )}
            {address && (
              <li className="flex items-start gap-2.5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-brand-green" aria-hidden />
                <span>{address}</span>
              </li>
            )}
            <li>{hours}</li>
            <li>
              <Link href="/contact" className="font-semibold text-white underline decoration-brand-green decoration-2 underline-offset-4 hover:decoration-white">
                Send an enquiry
              </Link>
            </li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-[14px] text-line md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Nestovin. {site.promise}</p>
          <ul className="flex gap-6">
            <li><Link href="/privacy" className={linkCls}>Privacy</Link></li>
            <li><Link href="/terms" className={linkCls}>Terms</Link></li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}
