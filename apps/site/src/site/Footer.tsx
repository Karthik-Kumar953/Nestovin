import { Mail, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { nav, services, site } from './content';
import { Logo } from './Header';
import { Container } from './ui';
import { AppBadges } from './AppBadges';

export function Footer() {
  const { email, phone, address, hours } = site.contact;
  const linkCls = 'text-line transition-colors hover:text-white';
  const headCls = 'font-display text-[13px] font-semibold tracking-[0.06em] text-white/60 uppercase';
  return (
    <footer className="bg-charcoal text-white">
      <Container className="py-14 md:py-16">
        {/* Brand on the left, the app on the right */}
        <div className="flex flex-col gap-8 border-b border-white/10 pb-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[420px]">
            <Link href="/" className="inline-flex rounded-sm" aria-label="Nestovin, home">
              <Logo onDark />
            </Link>
            <p className="mt-4 font-display text-[18px] font-semibold text-white">{site.tagline}</p>
            <p className="mt-2 text-[15px] leading-6 text-line">{site.description}</p>
          </div>
          <div>
            <p className={headCls}>The Nestovin app</p>
            <AppBadges size="sm" className="mt-3" />
          </div>
        </div>

        {/* Four even columns */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 pt-10 md:grid-cols-4">
          <nav aria-label="Services">
            <h2 className={headCls}>Services</h2>
            <ul className="mt-4 space-y-3 text-[15px]">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`} className={linkCls}>
                    {s.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/services" className={linkCls}>
                  All services
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className={headCls}>Nestovin</h2>
            <ul className="mt-4 space-y-3 text-[15px]">
              {nav
                .filter((n) => n.href !== '/services')
                .map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className={linkCls}>
                      {n.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          <div>
            <h2 className={headCls}>Talk to us</h2>
            <ul className="mt-4 space-y-3 text-[15px] text-line">
              {phone && (
                <li className="flex items-center gap-2.5">
                  <Phone size={17} className="shrink-0 text-brand-green" aria-hidden />
                  <a href={`tel:${phone}`} className={linkCls}>
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li className="flex items-center gap-2.5">
                  <Mail size={17} className="shrink-0 text-brand-green" aria-hidden />
                  <a href={`mailto:${email}`} className={linkCls}>
                    {email}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2.5">
                  <MapPin size={17} className="mt-0.5 shrink-0 text-brand-green" aria-hidden />
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

          <nav aria-label="Legal">
            <h2 className={headCls}>Legal</h2>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li>
                <Link href="/privacy" className={linkCls}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={linkCls}>
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-[14px] text-line md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} Nestovin. {site.promise}
          </p>
          <p>
            Designed by{' '}
            <a href="https://nexif.in" target="_blank" rel="noopener" className="font-semibold text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white">
              Nexif
            </a>
          </p>
        </Container>
      </div>
    </footer>
  );
}
