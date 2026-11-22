'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { nav } from './content';
import { buttonClass } from './ui';

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/nestovin-logo.png" alt="" width={38} height={34} priority />
      <span className={`font-display text-[22px] font-bold tracking-[-0.02em] ${onDark ? 'text-white' : 'text-charcoal'}`}>Nestovin</span>
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const burger = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Open menu = a modal: page behind is inert, Tab stays inside, Esc closes and returns focus.
  useEffect(() => {
    if (!open) return;
    const behind = [document.getElementById('main'), document.querySelector('footer')].filter(Boolean) as HTMLElement[];
    document.documentElement.style.overflow = 'hidden';
    behind.forEach((el) => (el.inert = true));
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        burger.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [burger.current, ...Array.from(panel.current?.querySelectorAll<HTMLElement>('a') ?? [])].filter(Boolean) as HTMLElement[];
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = '';
      behind.forEach((el) => (el.inert = false));
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[border-color,background-color,box-shadow] duration-300 ${
        scrolled || open ? 'border-line bg-surface shadow-[0_8px_24px_-18px_rgb(17_24_39/0.25)]' : 'border-transparent bg-canvas'
      }`}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between gap-3 px-5 md:px-8 xl:gap-6">
        <Link href="/" className="rounded-sm" aria-label="Nestovin, home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center xl:gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`relative block rounded-sm px-2 py-2 whitespace-nowrap xl:px-3 text-[15px] font-medium transition-colors duration-200 ${
                    isActive(item.href) ? 'text-teal' : 'text-ink-2 hover:text-charcoal'
                  }`}
                >
                  {item.label}
                  <span
                    aria-hidden
                    className={`absolute inset-x-2 -bottom-[15px] xl:inset-x-3 h-[3px] origin-left rounded-full bg-brand transition-transform duration-300 ${
                      isActive(item.href) ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/contact" className={`${buttonClass('primary')} whitespace-nowrap max-sm:min-h-11 max-sm:px-4 max-sm:text-[14px]`}>
            <span className="sm:hidden">Enquire</span>
            <span className="hidden sm:inline">Send an enquiry</span>
          </Link>
          <button
            ref={burger}
            type="button"
            className="inline-flex size-12 items-center justify-center rounded-md text-charcoal hover:bg-surface lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
          </button>
        </div>
      </div>

      <div ref={panel} id="mobile-nav" hidden={!open} className="fixed inset-x-0 top-[72px] bottom-0 overflow-y-auto bg-surface lg:hidden">
        <nav aria-label="Mobile" className="px-5 pt-4 pb-10">
          <ul className="divide-y divide-line">
            {[...nav, { href: '/contact', label: 'Contact' }].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex min-h-14 items-center font-display text-xl font-semibold ${isActive(item.href) ? 'text-teal' : 'text-charcoal'}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/contact" className={`${buttonClass('primary')} mt-8 w-full`}>
            Send an enquiry
          </Link>
        </nav>
      </div>
    </header>
  );
}
