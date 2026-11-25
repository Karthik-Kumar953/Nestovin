'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { day } from './content';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const chip: Record<string, string> = {
  'Checked in': 'bg-success-bg text-success',
  Arriving: 'bg-warning-bg text-warning',
  Scheduled: 'bg-info-bg text-info',
};

/**
 * "A day at your flat". Desktop: the photo stays pinned beside the timeline and
 * crossfades as each time reaches the middle of the screen; the day's line fills.
 * Mobile and reduced motion: each moment carries its own photo, nothing pins.
 */
export function DayStory() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const beats = gsap.utils.toArray<HTMLElement>('[data-beat]');
      beats.forEach((el, i) =>
        ScrollTrigger.create({
          trigger: el,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: (self) => self.isActive && setActive(i),
        }),
      );
      if (!reduce) {
        gsap.fromTo(
          '[data-day-line]',
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: '[data-day-list]', start: 'top 55%', end: 'bottom 55%', scrub: 0.4 },
          },
        );
      }
    },
    { scope: root },
  );

  const current = day[active]!;

  return (
    <div ref={root} className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div className="hidden lg:block">
        <div className="sticky top-[104px] aspect-[4/5] max-h-[calc(100dvh-140px)] w-full overflow-hidden rounded-xl bg-subtle">
          {day.map((b, i) => (
            <Image
              key={b.time}
              src={b.image}
              alt={i === active ? b.alt : ''}
              aria-hidden={i !== active}
              fill
              sizes="50vw"
              className={`object-cover transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                i === active ? 'scale-100 opacity-100' : 'scale-[1.05] opacity-0'
              }`}
            />
          ))}
          <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-md bg-surface px-4 py-2.5 shadow-[0_10px_30px_-14px_rgb(17_24_39/0.45)]">
            <span className="font-display text-[24px] font-bold text-charcoal tabular-nums">{current.time}</span>
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${chip[current.state]}`}>{current.state}</span>
            <span className="text-[13px] text-ink-2">Your flat</span>
          </div>
        </div>
      </div>

      <ol className="relative" data-day-list>
        <span className="absolute top-3 bottom-3 left-[27px] w-0.5 rounded-full bg-line" aria-hidden />
        <span className="absolute top-3 bottom-3 left-[27px] w-0.5 origin-top rounded-full bg-brand" data-day-line aria-hidden />
        {day.map((b, i) => (
          <li key={b.time} data-beat className="relative grid grid-cols-[56px_1fr] gap-5 pb-14 last:pb-0 lg:min-h-[58dvh] lg:pb-0">
            <div
              className={`relative z-10 grid size-14 place-items-center rounded-full border-2 font-display text-[14px] font-bold tabular-nums transition-colors duration-500 ${
                i <= active ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-ink-2'
              }`}
            >
              {b.time}
            </div>
            <div className="pt-2.5">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${chip[b.state]}`}>{b.state}</span>
              <h3 className="mt-3 text-[24px] leading-8 font-semibold md:text-[30px] md:leading-[38px]">{b.title}</h3>
              <p className="mt-3 max-w-[460px] text-[17px] leading-7 text-ink-2">{b.body}</p>
              <div className="relative mt-6 aspect-[16/10] overflow-hidden rounded-lg lg:hidden">
                <Image src={b.image} alt={b.alt} fill sizes="100vw" className="object-cover" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
