'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { nav } from './content';
import { buttonClass } from './ui';

export function Logo({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/nestovin-logo.png"
        alt=""
        width={38}
        height={34}
        priority
        className={`origin-left transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${compact ? 'scale-[0.84]' : ''}`}
      />
      <span
        className={`font-display font-bold tracking-[-0.02em] transition-[font-size] duration-500 ${compact ? 'text-[19px]' : 'text-[22px]'} ${onDark ? 'text-white' : 'text-charcoal'}`}
      >
        Nestovin
      </span>
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
    const onScroll = () => setScrolled(window.scrollY > 48);
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
  const floating = scrolled && !open;

  return (
    // The header keeps a fixed 72px slot so the page never jumps; only the bar inside changes.
    <header className="sticky top-0 z-40 h-[72px]">
      <div
        className={`absolute inset-x-0 mx-auto flex items-center transition-[top,max-width,height,border-radius,background-color,box-shadow,padding] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          floating
            ? 'top-2 h-14 max-w-[min(1180px,calc(100%-24px))] rounded-full bg-surface/85 px-3 shadow-[0_0_0_1px_rgb(17_24_39/0.06),0_16px_40px_-18px_rgb(17_24_39/0.35)] backdrop-blur-xl md:px-4'
            : 'top-0 h-[72px] max-w-full rounded-none bg-surface px-5 md:px-8'
        }`}
      >
        <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[auto_1fr_auto] xl:grid-cols-[1fr_auto_1fr]">
          {/* 1. Logo */}
          <Link href="/" className="justify-self-start rounded-sm" aria-label="Nestovin, home">
            <Logo compact={floating} />
          </Link>

          {/* 2. Links, centred */}
          <nav aria-label="Main" className="hidden justify-self-center lg:block">
            <ul className="flex items-center gap-0.5 xl:gap-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={`block rounded-full px-2.5 py-2 text-[14px] font-medium whitespace-nowrap transition-colors duration-200 xl:px-3.5 xl:text-[15px] ${
                      isActive(item.href) ? 'bg-teal/10 text-teal' : 'text-ink-2 hover:bg-subtle hover:text-charcoal'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* 3. Action */}
          <div className="flex items-center gap-1.5 justify-self-end">
            <Link
              href="/contact"
              className={`${buttonClass('primary')} whitespace-nowrap transition-[min-height,padding,border-radius,font-size,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] max-sm:min-h-10 max-sm:px-4 max-sm:text-[14px] ${floating ? '!min-h-10 !rounded-full !px-5 !text-[14px] !shadow-none' : ''}`}
            >
              <span className="sm:hidden">Enquire</span>
              <span className="hidden sm:inline">Send an enquiry</span>
            </Link>
            <button
              ref={burger}
              type="button"
              className="relative inline-flex size-11 items-center justify-center rounded-full text-charcoal hover:bg-subtle lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              <span aria-hidden className="relative block h-4 w-5">
                <span className={`absolute left-0 block h-[2px] w-5 rounded-full bg-current transition-[top,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? 'top-[7px] rotate-45' : 'top-0'}`} />
                <span className={`absolute top-[7px] left-0 block h-[2px] w-5 rounded-full bg-current transition-opacity duration-200 ${open ? 'opacity-0' : 'opacity-100'}`} />
                <span className={`absolute left-0 block h-[2px] w-5 rounded-full bg-current transition-[top,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? 'top-[7px] -rotate-45' : 'top-[14px]'}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Phones: the menu fills the screen and its items trail in one after another. */}
      <div ref={panel} id="mobile-nav" hidden={!open} className="nav-panel fixed inset-x-0 top-[72px] bottom-0 overflow-y-auto bg-surface lg:hidden">
        <nav aria-label="Mobile" className="px-5 pt-4 pb-10">
          <ul>
            {[...nav, { href: '/contact', label: 'Contact' }].map((item, i) => (
              <li key={item.href} className="nav-item border-b border-line" style={{ animationDelay: `${60 + i * 45}ms` }}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex min-h-14 items-center justify-between font-display text-[22px] font-semibold ${isActive(item.href) ? 'text-teal' : 'text-charcoal'}`}
                >
                  {item.label}
                  <ArrowRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="nav-item" style={{ animationDelay: `${60 + (nav.length + 1) * 45}ms` }}>
            <Link href="/contact" className={`${buttonClass('primary')} mt-8 w-full`}>
              Send an enquiry
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
