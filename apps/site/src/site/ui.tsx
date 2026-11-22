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
export function EmblemWatermark({ className = '' }: { className?: string }) {
  return (
    <svg className={`pointer-events-none ${className}`} viewBox="0 0 200 200" aria-hidden fill="none">
      <path d="M30 190V82L100 22l70 60v108" stroke="currentColor" strokeWidth="14" strokeLinejoin="round" />
      <path d="M62 190v-70l72 70" stroke="currentColor" strokeWidth="14" strokeLinejoin="round" />
      <rect x="112" y="78" width="26" height="26" rx="3" fill="currentColor" />
    </svg>
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
export function PageHero({
  title,
  lede,
  image,
  imageAlt,
  children,
}: {
  title: ReactNode;
  lede: ReactNode;
  image?: string;
  imageAlt?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-canvas">
      <EmblemWatermark className="absolute -top-10 -right-16 -z-10 w-[360px] text-brand/[0.06] md:w-[520px]" />
      <Container className={`grid gap-10 pt-14 pb-24 md:pt-20 md:pb-32 ${image ? 'lg:grid-cols-[1.05fr_1fr] lg:items-center' : ''}`}>
        <div className="hero-in max-w-[640px]">
          <h1 className="text-[34px] leading-[42px] font-bold tracking-[-0.02em] md:text-[54px] md:leading-[62px]">{title}</h1>
          <p className="mt-5 text-lg leading-8 text-ink-2">{lede}</p>
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
        {image && <Photo src={image} alt={imageAlt ?? ''} priority className="hero-in aspect-[16/11]" />}
      </Container>
      <BrandWave className="absolute inset-x-0 bottom-0 -z-10 h-16 w-full md:h-24" />
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
          <EmblemWatermark className="absolute -right-10 -bottom-16 -z-10 w-[280px] text-white/[0.08]" />
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
