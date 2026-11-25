'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';
import { asked, beats, FH, GROUND, Person, TARGET, top, towers, win } from './CommunityStory';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Where the first card sticks (below the header), and how far each next card sits below it. */
const STICK = 88;
const STEP = 14;

/**
 * Phones: "How Nestovin works" as a stack of five cards. As you scroll, each card slides up
 * from below and settles on top of the one before, a little lower, so the earlier cards'
 * edges peek out above it like a deck; the covered cards ease back slightly. The stacking is
 * the browser's own sticky scrolling, so it follows the finger exactly and never pins or
 * fights the page; GSAP only adds the gentle scale-back. With reduced motion the cards still
 * stack, without the scale.
 */
export function CommunityCards() {
  const root = useRef<HTMLDivElement>(null);

  // Every card gets the height of the tallest, so a covered card never peeks out below the top one.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-step-card] > div'));
    const even = () => {
      cards.forEach((c) => (c.style.minHeight = ''));
      const tallest = Math.max(...cards.map((c) => c.offsetHeight));
      cards.forEach((c) => (c.style.minHeight = `${tallest}px`));
    };
    even();
    const ro = new ResizeObserver(() => requestAnimationFrame(even));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference) and (max-width: 767px)', () => {
        const items = gsap.utils.toArray<HTMLElement>('[data-step-card]', root.current);
        items.forEach((item, i) => {
          const next = items[i + 1];
          const card = item.firstElementChild as HTMLElement | null;
          if (!next || !card) return;
          gsap.to(card, {
            scale: 0.94,
            transformOrigin: '50% 0%',
            ease: 'none',
            scrollTrigger: { trigger: next, start: 'top bottom', end: `top ${STICK + (i + 1) * STEP}px`, scrub: true },
          });
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="overflow-x-clip">
      <div className="px-5">
        <h2 id="how-title-cards" className="text-[30px] leading-[38px] font-bold tracking-[-0.02em]">
          How Nestovin works
        </h2>
        <p className="mt-2 text-[16px] leading-7 text-ink-2">Five steps, from your community asking to every visit checked in.</p>
      </div>

      <ol className="mt-8 flex flex-col gap-5 px-5 pb-4" aria-label="How Nestovin works, five steps">
        {beats.map((b, i) => (
          <li key={b.title} data-step-card className="sticky" style={{ top: STICK + i * STEP }}>
            <div className="flex flex-col overflow-hidden rounded-[24px] bg-surface shadow-[0_0_0_1px_rgb(17_24_39/0.07),0_-10px_30px_-18px_rgb(17_24_39/0.25),0_24px_48px_-28px_rgb(17_24_39/0.35)] will-change-transform">
              <MiniScene stage={i} />
              <div className="p-6 pt-5">
                <p className="font-display text-[14px] font-bold text-teal tabular-nums">
                  Step 0{i + 1} <span className="font-semibold text-ink-2">/ 0{beats.length}</span>
                </p>
                <h3 className="mt-1.5 text-[22px] leading-[29px] font-bold tracking-[-0.01em]">{b.title}</h3>
                <p className="mt-2 text-[16px] leading-7 text-ink-2">{b.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The community drawing at one step, static (no scroll timeline). */
function MiniScene({ stage }: { stage: number }) {
  const B = towers[1]!;
  const tw = win(TARGET.tower, TARGET.floor, TARGET.col);
  const tcx = tw.x + tw.w / 2;
  const tcy = tw.y + tw.h / 2;
  const lit = stage >= 4 ? 'var(--nv-secondary)' : 'var(--nv-primary)';
  return (
    <svg viewBox="0 0 720 560" className="block h-auto w-full bg-surface" aria-hidden>
      <path d="M0 500C120 440 250 470 360 452s230-40 360 10V560H0Z" fill="var(--nv-primary)" opacity="0.07" />
      <circle cx="610" cy="120" r="46" fill="var(--nv-secondary)" opacity="0.14" />
      {stage >= 2 && (
        <>
          <rect x="72" y="40" width="612" height="484" rx="26" fill="none" stroke="var(--nv-primary)" strokeWidth="2" strokeDasharray="10 8" />
          <rect x="268" y="24" width="220" height="32" rx="16" fill="var(--nv-teal-action)" />
          <text x="378" y="45" textAnchor="middle" fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="14">
            Your community
          </text>
        </>
      )}
      {towers.map((t) => (
        <g key={t.id}>
          <rect x={t.x} y={top(t)} width={t.w} height={t.floors * FH + 46} rx="5" fill="var(--nv-background)" stroke="var(--nv-charcoal)" strokeWidth="2" />
          <rect x={t.x + 14} y={top(t) - 9} width={t.w - 28} height="9" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
          {Array.from({ length: t.floors }).map((_, i) =>
            Array.from({ length: t.cols }).map((__, c) => {
              const f = t.floors - i;
              const r = win(t, f, c);
              const isTarget = t === TARGET.tower && f === TARGET.floor && c === TARGET.col;
              const on = !isTarget && stage >= 1 && asked(t, f, c);
              const fill = isTarget && stage >= 4 ? 'var(--nv-secondary)' : on ? lit : 'var(--nv-surface-subtle)';
              return <rect key={`${t.id}${f}-${c}`} x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill={fill} stroke="var(--nv-border)" />;
            }),
          )}
          <rect x={t.x + t.w / 2 - 17} y={GROUND - 36} width="34" height="36" rx="4" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
          {stage >= 2 && (
            <g>
              <circle cx={t.x + t.w / 2} cy={top(t) - 30} r="15" fill="var(--nv-charcoal)" />
              <text x={t.x + t.w / 2} y={top(t) - 25} textAnchor="middle" fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="14">
                {t.id}
              </text>
            </g>
          )}
        </g>
      ))}
      <path d={`M24 ${GROUND}H696`} stroke="var(--nv-charcoal)" strokeWidth="2" strokeLinecap="round" />
      <path d={`M40 ${GROUND}c10-28 34-28 44 0M660 ${GROUND}c10-30 34-30 44 0`} fill="var(--nv-secondary)" opacity="0.45" />
      <rect x="34" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
      <rect x="84" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
      <path d={`M40 ${GROUND - 74}Q65 ${GROUND - 98} 90 ${GROUND - 74}`} stroke="var(--nv-charcoal)" strokeWidth="1.6" fill="none" />
      {stage >= 3 && (
        <>
          <Person x={330} role="maid" />
          <Person x={372} role="cook" />
          <Person x={420} role="caretaker" />
        </>
      )}
      {stage >= 4 && (
        <>
          <circle cx={B.x + B.w + 20} cy={top(B) + 30} r="16" fill="var(--nv-secondary)" />
          <path d={`M${B.x + B.w + 13} ${top(B) + 30} l5 5 9-9`} stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M${tcx} ${tcy + 14} l-9 16h18Z`} fill="var(--nv-charcoal)" />
          <rect x={tcx - 190} y={tcy + 30} width="236" height="76" rx="14" fill="var(--nv-charcoal)" />
          <text x={tcx - 170} y={tcy + 60} fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="17">
            Your flat
          </text>
          <text x={tcx - 170} y={tcy + 84} fill="var(--nv-border)" fontFamily="var(--font-inter)" fontSize="14">
            Cook · 07:00 · Checked in
          </text>
          <circle cx={tcx + 16} cy={tcy + 68} r="15" fill="var(--nv-secondary)" />
          <path d={`M${tcx + 9} ${tcy + 68} l5 5 9-9`} stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
