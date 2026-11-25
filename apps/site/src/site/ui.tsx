import { ArrowRight, ChefHat, HeartHandshake, Sparkles, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ServiceSlug } from './content';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-5 md:px-8 ${className}`}>{children}</div>;
}

const btnBase =
  'group inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md px-6 font-display text-[15px] font-semibold transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97]';

const btnVariants = {
  primary: 'bg-teal text-white shadow-[0_8px_20px_-10px_rgb(0_121_107/0.7)] hover:bg-teal-deep',
  secondary: 'border border-teal bg-surface text-teal hover:bg-canvas',
  quiet: 'px-1 text-teal hover:text-teal-deep',
  onBrand: 'bg-white text-teal-deep hover:bg-canvas',
  ghostLight: 'border border-white/80 bg-charcoal/30 text-white hover:bg-white/15',
  outlineLight: 'border border-white/70 text-white hover:border-white hover:bg-white/10',
} as const;
export type ButtonVariant = keyof typeof btnVariants;

export const buttonClass = (variant: ButtonVariant = 'primary') => `${btnBase} ${btnVariants[variant]}`;

export function LinkButton({
  href,
  children,
  variant = 'primary',
  arrow = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonClass(variant)} ${className}`}>
      {children}
      {arrow && <ArrowRight aria-hidden size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" />}
    </Link>
  );
}

/** Heading plus optional lede. The heading carries the weight; no label above it. */
export function SectionHead({
  title,
  lede,
  id,
  className = '',
  align = 'left',
}: {
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`max-w-[680px] ${align === 'center' ? 'mx-auto text-center' : ''} ${className}`} data-reveal>
      <h2 id={id} className="text-[28px] leading-[36px] font-semibold tracking-[-0.015em] md:text-[40px] md:leading-[48px]">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[17px] leading-7 text-ink-2 md:text-lg md:leading-8">{lede}</p>}
    </div>
  );
}

const serviceIcon: Record<ServiceSlug, LucideIcon> = { maid: Sparkles, cook: ChefHat, caretaker: HeartHandshake };

/** Round teal service badge (Brand Kit icon style). */
export function ServiceBadge({ slug, size = 'md' }: { slug: ServiceSlug; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = serviceIcon[slug];
  const box = { sm: 'size-10', md: 'size-12', lg: 'size-16' }[size];
  const icon = { sm: 18, md: 22, lg: 28 }[size];
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full bg-teal text-white`} aria-hidden>
      <Icon size={icon} strokeWidth={1.9} />
    </span>
  );
}

/** The Brand Kit's sweeping teal-to-green shape. Decorative. */
export function BrandWave({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      className={`pointer-events-none ${className}`}
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      aria-hidden
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id="nv-wave-a" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--nv-teal-deep)" />
          <stop offset="0.55" stopColor="var(--nv-primary)" />
          <stop offset="1" stopColor="var(--nv-secondary)" />
        </linearGradient>
      </defs>
      <path d="M0 220V120C260 40 520 10 800 70c260 55 440 40 640-40v190Z" fill="var(--nv-primary)" opacity="0.14" />
      <path d="M0 220V160C300 80 560 70 860 120c230 38 400 30 580-30v130Z" fill="url(#nv-wave-a)" />
    </svg>
  );
}

/** Faint house-emblem pattern (Brand Kit "brand pattern"). Decorative. */
/**
 * The real Nestovin mark as a large, faint watermark. On light grounds it keeps the brand
 * teal and green; on dark grounds (`onDark`) it becomes a soft white silhouette.
 * Size and position come from `className` (width, inset, z-index).
 */
export function EmblemWatermark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <img
      src="/nestovin-logo.png"
      alt=""
      aria-hidden
      draggable={false}
      className={`pointer-events-none h-auto select-none ${onDark ? 'opacity-[0.09] brightness-0 invert' : 'opacity-[0.11]'} ${className}`}
    />
  );
}

export function Photo({
  src,
  alt,
  className = '',
  priority = false,
  sizes = '(min-width: 1024px) 50vw, 100vw',
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-subtle ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}

/** Inner-page header: mint ground, emblem watermark, brand wave under it. */
/**
 * Inner-page hero, in the same style as the home hero: the page's photograph covers the whole
 * hero, a brand-green overlay rises from the bottom, and the words sit on top of it at the
 * bottom left. Pages without a photo keep the light version with the logo watermark.
 * `focus` is the photo's object-position, so phones crop to the person, not the wall.
 */
export function PageHero({
  title,
  lede,
  image,
  imageAlt,
  focus = '50% 35%',
  children,
}: {
  title: ReactNode;
  lede: ReactNode;
  image?: string;
  imageAlt?: string;
  focus?: string;
  children?: ReactNode;
}) {
  if (!image) {
    return (
      <section className="relative isolate overflow-hidden bg-canvas">
        <EmblemWatermark className="absolute -top-6 -right-20 -z-10 w-[400px] md:-right-16 md:w-[600px]" />
        <Container className="pt-14 pb-24 md:pt-20 md:pb-32">
          <div className="hero-in max-w-[640px]">
            <h1 className="text-[34px] leading-[42px] font-bold tracking-[-0.02em] md:text-[54px] md:leading-[62px]">{title}</h1>
            <p className="mt-5 text-lg leading-8 text-ink-2">{lede}</p>
            {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
          </div>
        </Container>
        <BrandWave className="absolute inset-x-0 bottom-0 -z-10 h-16 w-full md:h-24" />
      </section>
    );
  }
  return (
    <section className="relative isolate flex min-h-[min(calc(100svh-72px),760px)] items-end overflow-hidden bg-teal-deep md:min-h-[min(calc(100svh-72px),720px)]">
      <Image src={image} alt={imageAlt ?? ''} fill priority sizes="100vw" className="hero-zoom -z-20 object-cover" style={{ objectPosition: focus }} />
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(0_105_92/0.92)_0%,rgb(0_105_92/0.72)_28%,rgb(0_105_92/0.25)_50%,rgb(0_105_92/0)_66%)] md:bg-[linear-gradient(to_top,rgb(0_105_92/0.82)_0%,rgb(0_105_92/0.5)_22%,rgb(0_105_92/0.12)_42%,rgb(0_105_92/0)_55%)]"
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 hidden bg-[radial-gradient(ellipse_58%_80%_at_0%_100%,rgb(0_105_92/0.6)_0%,rgb(0_105_92/0.26)_45%,transparent_72%)] md:block" aria-hidden />
      <div className="absolute inset-x-0 top-0 -z-10 h-24 bg-[linear-gradient(to_bottom,rgb(0_105_92/0.2),transparent)]" aria-hidden />
      <Container className="pt-48 pb-12 md:pb-16">
        <div className="hero-in max-w-[680px] [text-shadow:0_1px_18px_rgb(0_50_44/0.5)]">
          <h1 className="text-[36px] leading-[42px] font-bold tracking-[-0.025em] text-white min-[400px]:text-[40px] min-[400px]:leading-[46px] md:text-[50px] md:leading-[56px]">
            {title}
          </h1>
          <p className="mt-5 max-w-[600px] text-[17px] leading-7 text-white md:text-lg md:leading-8">{lede}</p>
          {children && <div className="mt-8 flex flex-col gap-3 [text-shadow:none] sm:flex-row sm:flex-wrap">{children}</div>}
        </div>
      </Container>
    </section>
  );
}

/** Closing band: the one brand-gradient surface on each page. */
export function EnquiryBand({
  title = 'Want Nestovin in your community?',
  body = 'Tell us where you live and what you need. We will tell you honestly where things stand.',
  href = '/contact',
  cta = 'Send an enquiry',
}: {
  title?: string;
  body?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <section className="bg-surface py-16 md:py-24">
      <Container>
        <div
          className="relative isolate overflow-hidden rounded-xl bg-teal-deep px-6 py-12 text-white md:px-14 md:py-16"
          data-reveal
        >
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,var(--nv-teal-deep)_0%,var(--nv-teal-action)_55%,var(--nv-green-action)_100%)]" aria-hidden />
          <EmblemWatermark onDark className="absolute -right-10 -bottom-16 -z-10 w-[340px]" />
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-[580px]">
              <h2 className="text-[28px] leading-9 font-semibold text-white md:text-[38px] md:leading-[46px]">{title}</h2>
              <p className="mt-3 text-[17px] leading-7 text-white">{body}</p>
            </div>
            <LinkButton href={href} variant="onBrand" arrow className="self-start md:self-auto">
              {cta}
            </LinkButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
