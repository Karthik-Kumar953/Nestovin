'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowDown, Check, Pause, Play } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { heroFilm } from './content';
import { HeroScene } from './HeroScene';
import { LinkButton } from './ui';

gsap.registerPlugin(useGSAP);

const lines = ['Home help, organised', 'for your whole', 'community.'];
const lede =
  'Trained maids, cooks and caretakers for gated communities. Employed by Nestovin, assigned to your flat, and checked in at your door on every visit.';
const proof = ['Salaried Nestovin staff', 'Same person, same time', 'Checked in at your door'];

/**
 * Home hero. With the owner's film (Film A) dropped in, the promise sits over the film.
 * Until then, the hero is the drawn community lighting up: the site's own idea, not a
 * stock skyline. Entrance motion only; nothing here is tied to scroll.
 */
export function FilmHero() {
  return heroFilm.mp4 ? <FilmVersion /> : <DrawnVersion />;
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

function Headline({ onDark }: { onDark: boolean }) {
  return (
    <h1
      id="hero-title"
      className={`max-w-[760px] text-[40px] leading-[1.06] font-bold tracking-[-0.03em] sm:text-[52px] lg:text-[50px] xl:text-[56px] ${onDark ? 'text-white' : 'text-charcoal'}`}
    >
      {lines.map((l) => (
        <span key={l} data-line className="block overflow-hidden pb-[0.06em]">
          <span className="block">{l === 'community.' ? <span className={onDark ? 'text-brand-green' : 'text-teal'}>{l}</span> : l}</span>
        </span>
      ))}
    </h1>
  );
}

function Proof({ onDark }: { onDark: boolean }) {
  return (
    <ul data-fade className={`mt-9 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium ${onDark ? 'text-white' : 'text-charcoal'}`}>
      {proof.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-green-action text-white">
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
