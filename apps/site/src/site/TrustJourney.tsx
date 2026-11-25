'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BadgeCheck, GraduationCap, IdCard, KeyRound, LifeBuoy, Lock, Wallet } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { trust } from './content';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const icons = [BadgeCheck, GraduationCap, IdCard, Wallet, KeyRound, Lock, LifeBuoy];

/**
 * The seven checks as one path. A line fills as you read; each check lights up as the
 * line reaches it, and the sticky column keeps count. Every item is fully readable
 * without motion: lighting up is extra emphasis, never the way content appears.
 */
export function TrustJourney() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          q('[data-fill]'),
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: q('[data-list]')[0], start: 'top 55%', end: 'bottom 55%', scrub: 0.4 },
          },
        );
        q('[data-item]').forEach((el, i) => {
          ScrollTrigger.create({
            trigger: el,
            start: 'top 58%',
            end: 'bottom 58%',
            toggleClass: { targets: el, className: 'is-on' },
            onEnter: () => setActive(i),
            onEnterBack: () => setActive(i),
          });
        });
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        q('[data-item]').forEach((el) => el.classList.add('is-on'));
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div className="lg:sticky lg:top-[120px] lg:self-start">
        <h2 className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] md:text-[44px] md:leading-[52px]">Seven checks between a stranger and your front door</h2>
        <p className="mt-4 max-w-[440px] text-[17px] leading-7 text-ink-2">From the day someone joins Nestovin to every visit after that.</p>
        <div className="mt-10 hidden items-end gap-3 lg:flex" aria-hidden>
          <span className="font-display text-[88px] leading-none font-bold text-teal tabular-nums">0{active + 1}</span>
          <span className="pb-3 font-display text-[22px] font-semibold text-ink-2 tabular-nums">/ 0{trust.length}</span>
        </div>
        <p className="mt-2 hidden font-display text-[18px] font-semibold text-charcoal lg:block" aria-hidden>
          {trust[active]!.step}
        </p>
      </div>

      <ol data-list className="relative">
        <span className="absolute top-7 bottom-7 left-[27px] w-0.5 bg-line" aria-hidden />
        <span data-fill className="absolute top-7 bottom-7 left-[27px] w-0.5 origin-top bg-teal" aria-hidden />
        {trust.map((t, i) => {
          const Icon = icons[i]!;
          return (
            <li
              key={t.title}
              data-item
              className="group/item relative grid grid-cols-[56px_1fr] gap-5 pb-8 last:pb-0 md:gap-7"
            >
              <span className="relative z-10 grid size-14 place-items-center rounded-full border-2 border-line bg-surface text-teal transition-[background-color,border-color,color,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-[.is-on]/item:scale-105 group-[.is-on]/item:border-teal group-[.is-on]/item:bg-teal group-[.is-on]/item:text-white">
                <Icon size={24} strokeWidth={1.9} aria-hidden />
              </span>
              <div className="overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-500 group-[.is-on]/item:border-brand/40 group-[.is-on]/item:shadow-[0_18px_40px_-28px_rgb(0_121_107/0.55)]">
                {'image' in t ? (
                  <div className="relative aspect-[16/8]">
                    <Image src={t.image} alt={t.imageAlt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
                  </div>
                ) : null}
                <div className="p-6 md:p-7">
                  <p className="text-[14px] font-semibold text-teal">{t.step}</p>
                  <h3 className="mt-1 text-[21px] leading-8 font-semibold md:text-[23px]">{t.title}</h3>
                  <p className="mt-2 text-[16px] leading-7 text-ink-2">{t.body}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
