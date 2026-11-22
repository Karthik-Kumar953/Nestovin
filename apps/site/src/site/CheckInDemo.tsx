'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check } from 'lucide-react';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const CODE = ['4', '8', '2', '7'];
const steps = [
  { title: 'Your app shows a one-time code', body: 'Or a QR code, created for this visit only.' },
  { title: 'Staff enter it at your door', body: 'No code, no visit. Nobody starts without you.' },
  { title: 'The visit starts on record', body: 'Time and location are captured at that moment only.' },
  { title: 'You see it in your app', body: 'Start and finish, with your history kept.' },
];

/** The check-in at the door, played once when it scrolls into view. Illustrative. */
export function CheckInDemo() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set(q('[data-typed]'), { autoAlpha: 0, y: 8 });
        gsap.set(q('[data-done]'), { autoAlpha: 0, scale: 0.9 });
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: 'top 65%', once: true }, defaults: { ease: 'expo.out' } })
          .from(q('[data-code] > span'), { autoAlpha: 0, y: 10, stagger: 0.08, duration: 0.5 })
          .to(q('[data-typed]'), { autoAlpha: 1, y: 0, stagger: 0.18, duration: 0.4 }, '+=0.3')
          .to(q('[data-done]'), { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }, '+=0.2');
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div>
        <h2 className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] md:text-[44px] md:leading-[52px]">What happens at your door</h2>
        <ol className="mt-8 space-y-5">
          {steps.map((s, i) => (
            <li key={s.title} data-step className="grid grid-cols-[36px_1fr] gap-4">
              <span className="grid size-9 place-items-center rounded-full bg-teal font-display text-[15px] font-bold text-white tabular-nums">{i + 1}</span>
              <div className="pt-1">
                <p className="font-display text-[19px] font-semibold text-charcoal">{s.title}</p>
                <p className="mt-0.5 text-[16px] leading-6 text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <figure role="img" className="relative grid grid-cols-2 gap-4 rounded-2xl bg-[linear-gradient(150deg,var(--nv-teal-deep),var(--nv-teal-action)_60%,var(--nv-green-action)_130%)] p-5 sm:gap-6 sm:p-8" aria-label="Illustration: the resident's phone shows code 4827 and the staff member's phone enters it, then the visit shows as checked in">
        {/* resident phone */}
        <div className="rounded-[22px] bg-surface p-4 shadow-[0_24px_48px_-24px_rgb(17_24_39/0.6)] sm:p-5" aria-hidden>
          <p className="text-[12px] font-semibold text-ink-2">Resident app</p>
          <p className="mt-3 font-display text-[15px] font-semibold text-charcoal">Your visit code</p>
          <p data-code className="mt-3 flex gap-1.5 sm:gap-2">
            {CODE.map((d, i) => (
              <span key={i} className="grid h-12 flex-1 place-items-center rounded-md bg-canvas font-display text-[24px] font-bold text-teal-deep tabular-nums sm:h-14 sm:text-[28px]">
                {d}
              </span>
            ))}
          </p>
          <p className="mt-3 text-[12px] leading-4 text-ink-2">Share at the door. Valid for this visit only.</p>
        </div>
        {/* staff phone */}
        <div className="rounded-[22px] bg-surface p-4 shadow-[0_24px_48px_-24px_rgb(17_24_39/0.6)] sm:p-5" aria-hidden>
          <p className="text-[12px] font-semibold text-ink-2">Staff app</p>
          <p className="mt-3 font-display text-[15px] font-semibold text-charcoal">Flat 1204 · Cook</p>
          <p className="mt-3 flex gap-1.5 sm:gap-2">
            {CODE.map((d, i) => (
              <span key={i} className="grid h-12 flex-1 place-items-center rounded-md border-2 border-line font-display text-[24px] font-bold text-charcoal tabular-nums sm:h-14 sm:text-[28px]">
                <span data-typed>{d}</span>
              </span>
            ))}
          </p>
          <p className="mt-3 text-[12px] leading-4 text-ink-2">Enter the resident&rsquo;s code to start.</p>
        </div>
        {/* result */}
        <div data-done className="col-span-2 flex items-center gap-4 rounded-xl bg-charcoal p-4 text-white sm:p-5" aria-hidden>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-green">
            <Check size={22} strokeWidth={3} />
          </span>
          <div>
            <p className="font-display text-[17px] font-semibold">Checked in · 07:00</p>
            <p className="text-[14px] text-white/75">Visit started at flat 1204</p>
          </div>
        </div>
      </figure>
    </div>
  );
}
