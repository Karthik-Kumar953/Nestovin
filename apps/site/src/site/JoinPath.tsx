'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BadgeCheck, CalendarCheck, GraduationCap, MapPin, Phone, Send, Shirt, Wallet, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const path: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Send, title: 'Send your details', body: 'Your name and number through the enquiry form. No fee, ever.' },
  { icon: Phone, title: 'Our HR team calls you', body: 'We talk about the work you want and your experience.' },
  { icon: BadgeCheck, title: 'Meet and verify', body: 'A meeting, your identity and documents checked, and police verification.' },
  { icon: GraduationCap, title: 'Training', body: 'The work, hygiene, conduct in a home and the check-in app.' },
  { icon: Shirt, title: 'Uniform and photo ID', body: 'The uniform for your role and your Nestovin ID.' },
  { icon: MapPin, title: 'Homes near you', body: 'A fixed schedule with homes in one area, so travel stays short.' },
  { icon: Wallet, title: 'Salary every month', body: 'Paid by Nestovin every month, not in cash by the visit.' },
];

/**
 * Careers: the road from "send your details" to the first salary, walked sideways as you
 * scroll on large screens (pinned, scrubbed, with a marker travelling the road).
 * Phones and reduced motion read it as a plain vertical list.
 */
export function JoinPath() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const track = q('[data-track]')[0] as HTMLElement;
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 96);
        const stops = q('[data-stop]');
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: q('[data-pin]')[0],
            start: 'top top',
            end: () => `+=${distance() + window.innerHeight * 0.4}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        tl.to(track, { x: () => -distance() }, 0).to(q('[data-road-fill]'), { scaleX: 1 }, 0);
        stops.forEach((el, i) => {
          tl.fromTo(
            el.querySelector('[data-dot]'),
            { backgroundColor: 'var(--nv-surface)', color: 'var(--nv-teal-action)' },
            { backgroundColor: 'var(--nv-teal-action)', color: '#FFFFFF', duration: 0.05 },
            (i / stops.length) * 0.92,
          );
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="bg-canvas" aria-labelledby="path-title">
      <div data-pin className="flex min-h-svh flex-col justify-center overflow-hidden py-20 lg:pt-[96px] lg:pb-12">
        <div className="mx-auto w-full max-w-[1200px] px-5 md:px-8">
          <h2 id="path-title" className="max-w-[720px] text-[30px] leading-[38px] font-bold tracking-[-0.02em] md:text-[46px] md:leading-[54px]">
            From your first call to your first salary
          </h2>
          <p className="mt-4 max-w-[560px] text-[17px] leading-7 text-ink-2">Seven steps. We walk them with you.</p>
        </div>

        <div className="relative mt-12 lg:mt-16">
          <div data-track className="relative flex flex-col gap-0 px-5 will-change-transform md:px-8 lg:w-max lg:flex-row lg:gap-6 lg:pl-[max(2rem,calc((100vw-1200px)/2+2rem))] lg:pr-24">
            {/* the road (large screens) */}
            <span className="absolute top-7 right-[calc(6rem+240px-28px)] left-[max(2rem,calc((100vw-1200px)/2+2rem))] hidden h-1 rounded-full bg-line lg:block" aria-hidden />
            <span data-road-fill className="absolute top-7 right-[calc(6rem+240px-28px)] left-[max(2rem,calc((100vw-1200px)/2+2rem))] hidden h-1 origin-left scale-x-0 rounded-full bg-teal lg:block" aria-hidden />
            {/* the road (phones) */}
            <span className="absolute top-7 bottom-7 left-[47px] w-0.5 bg-line md:left-[59px] lg:hidden" aria-hidden />

            <ol className="contents">
              {path.map(({ icon: Icon, title, body }, i) => (
                <li key={title} data-stop className="relative grid grid-cols-[56px_1fr] gap-5 pb-8 lg:block lg:w-[300px] lg:pb-0">
                  <span data-dot className="relative z-10 grid size-14 place-items-center rounded-full border-2 border-teal bg-surface text-teal">
                    <Icon size={24} strokeWidth={1.9} aria-hidden />
                  </span>
                  <div className="pt-2 lg:mt-6 lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:p-6">
                    <p className="font-display text-[14px] font-bold text-teal tabular-nums">Step {i + 1}</p>
                    <h3 className="mt-1 text-[21px] leading-7 font-semibold">{title}</h3>
                    <p className="mt-2 text-[16px] leading-6 text-ink-2">{body}</p>
                  </div>
                </li>
              ))}
              <li className="relative hidden lg:block lg:w-[240px]">
                <span className="relative z-10 grid size-14 place-items-center rounded-full bg-brand-green text-white">
                  <CalendarCheck size={24} aria-hidden />
                </span>
                <p className="mt-6 font-display text-[22px] leading-7 font-semibold text-charcoal">Steady work, close to home</p>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
