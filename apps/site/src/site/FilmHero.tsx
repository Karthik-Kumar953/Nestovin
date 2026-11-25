'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowDown, Check, Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState, type RefObject } from 'react';
import { heroFilm } from './content';
import { AppBadges } from './AppBadges';
import { CommunityRequestButton } from './CommunityRequest';
import { HeroScene } from './HeroScene';
import { LinkButton } from './ui';

gsap.registerPlugin(useGSAP);

const lines = ['Get House Help,', 'for your Community.'];
const lede =
  'Trained maids, cooks and caretakers for gated communities. Employed by Nestovin, assigned to your flat, and checked in at your door on every visit.';
/** The home hero's short line: the same promise in two lines. */
const shortLede = 'Trained maids, cooks and caretakers for your everyday needs.';
const proof = ["Nestovin's own trained staff", 'Checked in at your door'];

/**
 * Home hero. With the owner's film (Film A) dropped in, the promise sits over the film.
 * Until then, the hero is the drawn community lighting up: the site's own idea, not a
 * stock skyline. Entrance motion only; nothing here is tied to scroll.
 */
export function FilmHero() {
  if (heroFilm.mp4) return <FilmVersion />;
  return heroFilm.photo ? <PhotoVersion /> : <DrawnVersion />;
}

function useEntrance(root: RefObject<HTMLElement | null>, onReduce?: () => void) {
  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'expo.out' } })
          .from(q('[data-line] > span'), { yPercent: 110, duration: 1.1, stagger: 0.09 }, 0.1)
          .from(q('[data-fade]'), { autoAlpha: 0, y: 16, duration: 0.9, stagger: 0.07 }, 0.45)
          .from(q('[data-media]'), { scale: 1.06, duration: 2.2, ease: 'power2.out' }, 0);
      });
      if (onReduce) mm.add('(prefers-reduced-motion: reduce)', onReduce);
      return () => mm.revert();
    },
    { scope: root },
  );
}

function Headline({ onDark, compact = false }: { onDark: boolean; compact?: boolean }) {
  return (
    <h1
      id="hero-title"
      className={`max-w-[760px] text-[36px] leading-[1.06] min-[400px]:text-[40px] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[50px] xl:text-[56px] ${compact ? '!text-[34px] min-[400px]:!text-[38px] md:!text-[44px] lg:!text-[42px] xl:!text-[48px]' : ''} ${onDark ? 'text-white' : 'text-charcoal'}`}
    >
      {lines.map((l) => (
        <span key={l} data-line className="-mb-[0.06em] block overflow-hidden pb-[0.12em]">
          <span className="block">{l === 'community.' && !compact ? <span className={onDark ? 'text-brand-green' : 'text-teal'}>{l}</span> : l}</span>
        </span>
      ))}
    </h1>
  );
}

function Proof({ onDark, light = false }: { onDark: boolean; light?: boolean }) {
  return (
    <ul data-fade className={`flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium mt-9 ${onDark ? 'text-white' : 'text-charcoal'}`}>
      {proof.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <span className={`grid size-5 place-items-center rounded-full ${light ? 'bg-white text-teal-deep' : 'bg-green-action text-white'}`}>
            <Check size={13} strokeWidth={3} aria-hidden />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function DrawnVersion() {
  const root = useRef<HTMLElement>(null);
  useEntrance(root);
  return (
    <section ref={root} className="relative isolate overflow-hidden bg-canvas" aria-labelledby="hero-title">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-6 px-5 pt-10 pb-14 md:px-8 md:pt-14 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[1.12fr_1fr] lg:gap-10 lg:py-12">
        <div>
          <Headline onDark={false} />
          <p data-fade className="mt-6 max-w-[520px] text-[18px] leading-8 text-ink-2">
            {lede}
          </p>
          <div data-fade className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/contact" arrow>
              Send an enquiry
            </LinkButton>
            <LinkButton href="#how" variant="secondary">
              See how it works
            </LinkButton>
          </div>
          <Proof onDark={false} />
        </div>
        <div data-fade className="-mx-2 sm:mx-0">
          <HeroScene />
        </div>
      </div>
    </section>
  );
}

/**
 * The owner's hero photograph covers the whole first screen, edge to edge. A brand-green
 * overlay rises from the bottom (where the aprons and badges are), so the words sit on top of
 * the photo at the bottom while the three faces stay clear above them. Wide screens lay the
 * words out as one band: the headline on the left, the paragraph, buttons and trust points on
 * the right. Phones stack them.
 */
function PhotoVersion() {
  const root = useRef<HTMLElement>(null);
  useEntrance(root);
  return (
    <section
      ref={root}
      className="relative isolate flex min-h-[calc(100svh-72px)] flex-col justify-end overflow-hidden bg-teal-deep"
      aria-labelledby="hero-title"
    >
      <div className="absolute inset-0 -z-10" aria-hidden>
        {/* Phones and tablets: the photo is wider than the screen and pinned to the top, so all
            three faces show; it melts into the overlay below. Laptops: it covers everything. */}
        <div data-media className="absolute top-0 left-[-69%] aspect-[1670/942] w-[200%] sm:left-[-35%] sm:w-[150%] lg:inset-0 lg:aspect-auto lg:w-auto">
          <Image src={heroFilm.photo} alt="" fill priority sizes="(min-width: 1024px) 100vw, 200vw" className="object-cover lg:object-[50%_30%]" />
        </div>
        {/* Overlay: deep brand green from the bottom, a light tint on top so the nav edge reads. */}
        <div className="absolute inset-x-0 top-0 h-[calc(112.8vw+2px)] bg-[linear-gradient(to_bottom,rgb(0_105_92/0)_52%,rgb(0_105_92/0.5)_74%,rgb(0_105_92/0.88)_90%,var(--nv-teal-deep)_99%)] sm:h-[calc(84.6vw+2px)] lg:hidden" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(to_top,rgb(0_105_92/0.82)_0%,rgb(0_105_92/0.5)_20%,rgb(0_105_92/0.12)_40%,rgb(0_105_92/0)_52%)] lg:block" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(ellipse_58%_80%_at_0%_100%,rgb(0_105_92/0.62)_0%,rgb(0_105_92/0.28)_45%,transparent_72%)] lg:block" />
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(to_bottom,rgb(0_105_92/0.22),transparent)]" />
      </div>
      <span className="sr-only">{heroFilm.photoAlt}</span>

      <div className="mx-auto w-full max-w-[1200px] px-5 pt-[calc(112.8vw-110px)] pb-10 sm:pt-[calc(84.6vw-170px)] md:px-8 md:pb-14 lg:pt-0 lg:pb-16">
        {/* Two blocks in one row on laptops: the promise on the left, the actions on the right,
            both sitting on the same bottom line. Phones stack them. */}
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-[620px] [text-shadow:0_1px_18px_rgb(0_50_44/0.5)]">
            <Headline onDark compact />
            <p data-fade className="mt-4 max-w-[560px] text-[17px] leading-7 text-white md:text-[18px] md:leading-8">
              {shortLede}
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-4 lg:mt-0 lg:shrink-0 lg:items-end">
            <div data-fade>
              <CommunityRequestButton />
            </div>
            <div data-fade>
              <AppBadges className="lg:justify-end" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilmVersion() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  useEntrance(root, () => {
    video.current?.pause();
    setPlaying(false);
  });

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <section ref={root} className="relative isolate bg-charcoal" aria-labelledby="hero-title">
      <div className="relative h-[calc(100svh-72px)] min-h-[560px] overflow-hidden md:min-h-[640px]">
        <div data-media className="absolute inset-0">
          <video
            ref={video}
            className="size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={heroFilm.poster}
            aria-hidden
          >
            {heroFilm.webm && <source src={heroFilm.webm} type="video/webm" />}
            <source src={heroFilm.mp4} type="video/mp4" />
          </video>
        </div>
        {/* Phones: copy spans the frame, so the scrim rises from the bottom. Wider: from the left. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(17_24_39/0.92)_0%,rgb(17_24_39/0.75)_55%,rgb(17_24_39/0.35)_100%)] md:hidden" aria-hidden />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgb(17_24_39/0.86)_0%,rgb(17_24_39/0.62)_42%,rgb(17_24_39/0.08)_75%)] md:block" aria-hidden />

        <div className="relative mx-auto flex h-full w-full max-w-[1200px] flex-col justify-end px-5 pb-14 md:justify-center md:px-8 md:pb-16">
          <Headline onDark />
          <p data-fade className="mt-6 max-w-[540px] text-[18px] leading-8 text-white md:text-[19px]">
            {lede}
          </p>
          <div data-fade className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/contact" arrow>
              Send an enquiry
            </LinkButton>
            <LinkButton href="#how" variant="ghostLight">
              See how it works
            </LinkButton>
          </div>
          <Proof onDark />
        </div>

        <a href="#how" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[13px] font-medium text-white hover:underline md:flex">
          Scroll to see how it works
          <ArrowDown size={18} aria-hidden />
        </a>

        <button
          type="button"
          onClick={toggle}
          className="absolute right-5 bottom-5 grid size-11 place-items-center rounded-full bg-charcoal/60 text-white transition-colors hover:bg-charcoal/80 md:right-8"
          aria-label={playing ? 'Pause background film' : 'Play background film'}
        >
          {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
        </button>
      </div>
    </section>
  );
}
