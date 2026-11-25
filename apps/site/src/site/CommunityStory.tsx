'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, useState } from 'react';
import { CommunityCards } from './CommunityCards';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * "How Nestovin works", acted out by a drawn community as you scroll (pinned, scrubbed).
 * Each beat is one fact of the operating model (PRD §2, §9, §10; Brand Kit onboarding):
 * community by community, residents ask, towers and flats mapped, a team assigned by
 * Nestovin, every visit checked in at the door, cover from the same team. Illustrative.
 */

export const beats = [
  {
    title: 'It starts with one community',
    body: 'Nestovin works community by community: your gate, your towers, your neighbours. Not an app of strangers across the city.',
  },
  {
    title: 'Residents ask for it',
    body: 'Homes in the community tell us what they need. When enough of them ask, we plan the service around them.',
  },
  {
    title: 'We map every tower and flat',
    body: 'We map your towers and flats and agree visit time windows with your committee before anyone starts.',
  },
  {
    title: 'A trained team is assigned',
    body: 'Nestovin employs, verifies and trains a team for your community. You do not pick from profiles. We assign your person.',
  },
  {
    title: 'Checked in at your door',
    body: "Every visit is checked in with your code at the door, and if your usual person is on leave, cover comes from your community's trained team.",
  },
];

export const GROUND = 500;
export const FH = 30; // floor height

export interface TowerSpec {
  id: string;
  x: number;
  w: number;
  floors: number;
  cols: number;
}
export const towers: TowerSpec[] = [
  { id: 'A', x: 96, w: 150, floors: 8, cols: 3 },
  { id: 'B', x: 286, w: 184, floors: 12, cols: 4 },
  { id: 'C', x: 510, w: 150, floors: 7, cols: 3 },
];

export const top = (t: TowerSpec) => GROUND - (t.floors * FH + 46);
export const win = (t: TowerSpec, floor: number, col: number) => {
  const ww = t.cols === 4 ? 30 : 28;
  const gap = (t.w - 32 - t.cols * ww) / (t.cols - 1);
  return { x: t.x + 16 + col * (ww + gap), y: top(t) + 16 + (t.floors - floor) * FH, w: ww, h: 14 };
};
// Deterministic "homes that asked" so server and client agree.
export const asked = (t: TowerSpec, f: number, c: number) => (f * 7 + c * 3 + t.floors) % 5 < 3;
export const TARGET = { tower: towers[1]!, floor: 12, col: 3 };
const tw = win(TARGET.tower, TARGET.floor, TARGET.col);
const tcx = tw.x + tw.w / 2;
const tcy = tw.y + tw.h / 2;

export function Person({ x, role }: { x: number; role: 'maid' | 'cook' | 'caretaker' }) {
  const body = { maid: 'var(--nv-primary)', cook: '#FFFFFF', caretaker: 'var(--nv-border)' }[role];
  const b = GROUND;
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="-6" y={b - 18} width="5" height="17" rx="2" fill="var(--nv-charcoal)" />
      <rect x="1" y={b - 18} width="5" height="17" rx="2" fill="var(--nv-charcoal)" />
      <rect x="-11" y={b - 52} width="22" height="38" rx="9" fill={body} stroke="var(--nv-charcoal)" strokeWidth="1.3" />
      {role === 'maid' && <rect x="-7" y={b - 36} width="14" height="18" rx="3" fill="var(--nv-background)" />}
      {role === 'cook' && <rect x="-7" y={b - 39} width="14" height="22" rx="3" fill="var(--nv-teal-action)" />}
      {role === 'caretaker' && <path d={`M-7 ${b - 51}l7 7 7-7`} stroke="var(--nv-primary)" strokeWidth="2.6" fill="none" />}
      <circle cx="0" cy={b - 63} r="9" fill="var(--nv-neutral-400)" stroke="var(--nv-charcoal)" strokeWidth="1.3" />
      {role === 'cook' && <rect x="-8" y={b - 79} width="16" height="10" rx="4" fill="#FFFFFF" stroke="var(--nv-charcoal)" strokeWidth="1.3" />}
      {role === 'caretaker' && <path d={`M-9 ${b - 67}a9 9 0 0 1 18 0h5`} fill="var(--nv-primary)" stroke="var(--nv-charcoal)" strokeWidth="1.3" />}
      {role === 'maid' && <circle cx="0" cy={b - 74} r="4.5" fill="var(--nv-charcoal)" />}
      {/* ID lanyard */}
      <rect x="2" y={b - 44} width="6" height="8" rx="1.5" fill="#FFFFFF" stroke="var(--nv-primary)" strokeWidth="1.2" />
    </g>
  );
}

export function CommunityStory() {
  const root = useRef<HTMLElement>(null);
  const [beat, setBeat] = useState(beats.length - 1);
  const [animated, setAnimated] = useState(false);

  // The animated layout is shorter than the static list it replaces: re-measure pins.
  useEffect(() => {
    if (animated) requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [animated]);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      // Phones get stacked step cards that rise in as they scroll into view (CommunityCards); the pinned story runs from 768px.
      mm.add('(prefers-reduced-motion: no-preference) and (min-width: 768px)', () => {
        setAnimated(true);
        setBeat(0);
        const outlines = q('[data-outline]');
        outlines.forEach((el) => {
          const len = (el as unknown as SVGGeometryElement).getTotalLength?.() ?? 1200;
          gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.set(q('[data-fill]'), { autoAlpha: 0 });
        gsap.set(q('[data-asked]'), { attr: { fill: 'var(--nv-surface-subtle)' } });
        gsap.set(q('[data-map]'), { autoAlpha: 0 });
        gsap.set(q('[data-target]'), { attr: { fill: 'var(--nv-surface-subtle)' } });
        gsap.set(q('[data-boundary]'), { autoAlpha: 0, scale: 0.94, transformOrigin: '50% 50%' });
        gsap.set(q('[data-person]'), { x: -380, autoAlpha: 0 });
        gsap.set(q('[data-callout]'), { autoAlpha: 0, scale: 0.85, transformOrigin: '50% 0%' });
        gsap.set(q('[data-tick]'), { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' });

        let starts: number[] = [];
        const isSmall = window.matchMedia('(max-width: 767px)').matches;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: () => `+=${window.innerHeight * (isSmall ? 2 : 2.6)}`,
            pin: q('[data-stage]')[0],
            scrub: 0.7,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: () => {
              const t = tl.time();
              let b = 0;
              starts.forEach((st, i) => {
                if (t >= st - 0.05) b = i;
              });
              setBeat(b);
            },
          },
        });

        // 1: the community draws itself once as the section comes into view (not on the
        // scrub), so the first pinned frame is never an empty card.
        const draw = gsap
          .timeline({ paused: true })
          .to(outlines, { strokeDashoffset: 0, duration: 1.4, stagger: 0.06, ease: 'power2.inOut' })
          .to(q('[data-fill]'), { autoAlpha: 1, duration: 0.5, ease: 'power1.out' }, '-=0.5');
        ScrollTrigger.create({ trigger: root.current, start: 'top 75%', once: true, onEnter: () => draw.play() });
        tl.addLabel('b0')
          .to({}, { duration: 0.6 })
          // 2: homes ask
          .addLabel('b1')
          .to(q('[data-asked]'), { attr: { fill: 'var(--nv-primary)' }, duration: 0.6, stagger: { each: 0.012, from: 'random' } })
          .to({}, { duration: 0.3 })
          // 3: mapped, one boundary
          .addLabel('b2')
          .to(q('[data-boundary]'), { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'power2.out' })
          .to(q('[data-map]'), { autoAlpha: 1, duration: 0.3, stagger: 0.08 }, '-=0.4')
          .to({}, { duration: 0.2 })
          // 4: the team walks in through the gate
          .addLabel('b3')
          .to(q('[data-person]'), { x: 0, autoAlpha: 1, duration: 0.85, stagger: 0.1, ease: 'power1.out' })
          .to({}, { duration: 0.25 })
          // 5: zoom to your flat, check in, then every home checks in
          .addLabel('b4')
          .to(q('[data-scene]'), { scale: isSmall ? 1.7 : 1.9, svgOrigin: `${tcx} ${tcy}`, duration: 0.6, ease: 'power2.inOut' })
          .to(q('[data-target]'), { attr: { fill: 'var(--nv-secondary)' }, duration: 0.15 })
          .to(q('[data-callout]'), { autoAlpha: 1, scale: 1, duration: 0.25, ease: 'back.out(1.6)' })
          .to({}, { duration: 0.25 })
          .to(q('[data-callout]'), { autoAlpha: 0, duration: 0.15 })
          .to(q('[data-scene]'), { scale: 1, svgOrigin: `${tcx} ${tcy}`, duration: 0.5, ease: 'power2.inOut' }, '<')
          .to(q('[data-asked]'), { attr: { fill: 'var(--nv-secondary)' }, duration: 0.4, stagger: { each: 0.006, from: 'end' } })
          .to(q('[data-tick]'), { autoAlpha: 1, scale: 1, duration: 0.2 }, '-=0.2')
          .to({}, { duration: 0.2 });
        starts = beats.map((_, i) => tl.labels[`b${i}`] ?? 0);
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const B = towers[1]!;

  return (
    <section ref={root} id="how" className="relative bg-canvas" aria-label="How Nestovin works">
      <div className="pt-14 pb-16 md:hidden">
        <CommunityCards />
      </div>
      <div data-stage className={`hidden md:flex ${animated ? 'h-svh' : 'min-h-svh'} items-center overflow-hidden pt-[88px] pb-6 md:pt-[72px] md:pb-4`}>
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-6 px-5 md:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div className="order-2 mx-auto w-full max-w-[640px] lg:order-1 lg:mx-0 lg:max-w-none">
            <h2 id="how-title" className="sr-only">
              How Nestovin works
            </h2>

            {/* Animated: one beat at a time. Static: every beat as a list. */}
            {animated ? (
              <>
              {/* Screen readers get every beat in order; the visual crossfade is hidden from them. */}
              <ol className="sr-only">
                {beats.map((b) => (
                  <li key={b.title}>
                    <h3>{b.title}</h3>
                    <p>{b.body}</p>
                  </li>
                ))}
              </ol>
              <div className="relative min-h-[230px] lg:min-h-[300px]" aria-hidden>
                {beats.map((b, i) => (
                  <div
                    key={b.title}
                    className={`absolute inset-x-0 top-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      beat === i ? 'translate-y-0 opacity-100' : beat > i ? '-translate-y-4 opacity-0' : 'translate-y-4 opacity-0'
                    }`}
                  >
                    <p className="font-display text-[15px] font-bold text-ink-2 tabular-nums">
                      0{i + 1} <span className="font-semibold">/ 0{beats.length}</span>
                    </p>
                    <h3 className="mt-2 text-[32px] leading-[40px] font-bold tracking-[-0.02em] lg:text-[40px] lg:leading-[48px] xl:text-[44px] xl:leading-[52px]">{b.title}</h3>
                    <p className="mt-4 max-w-[460px] text-[17px] leading-7 text-ink-2 md:text-[18px] md:leading-8">{b.body}</p>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <ol className="space-y-6">
                {beats.map((b, i) => (
                  <li key={b.title}>
                    <p className="font-display text-[15px] font-bold text-ink-2 tabular-nums">0{i + 1}</p>
                    <h3 className="mt-1 text-[24px] leading-8 font-bold">{b.title}</h3>
                    <p className="mt-2 max-w-[460px] text-[16px] leading-7 text-ink-2">{b.body}</p>
                  </li>
                ))}
              </ol>
            )}

            {animated && (
              <ol className="mt-6 flex gap-2 lg:mt-8" aria-hidden>
                {beats.map((b, i) => (
                  <li key={b.title} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full origin-left rounded-full bg-teal transition-transform duration-500"
                      style={{ transform: `scaleX(${beat >= i ? 1 : 0})` }}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>

          <figure className="order-1 lg:order-2">
            <svg viewBox="0 0 720 560" className="mx-auto h-auto max-h-[46svh] w-full lg:max-h-[74svh]" role="img" aria-labelledby="cs-t cs-d">
              <title id="cs-t">Illustration of a gated community using Nestovin</title>
              <desc id="cs-d">
                Three residential towers. Windows light up for homes that asked for Nestovin, the community is mapped, a maid, a cook and a caretaker walk in through the gate, and your flat is checked in at 7:00.
              </desc>
              <defs>
                <clipPath id="cs-clip">
                  <rect x="0" y="0" width="720" height="560" rx="28" />
                </clipPath>
              </defs>
              <g clipPath="url(#cs-clip)">
                <rect width="720" height="560" fill="var(--nv-surface)" />
                <g data-scene>
                  {/* sun and hills */}
                  <g data-fill>
                    <circle cx="610" cy="120" r="46" fill="var(--nv-secondary)" opacity="0.14" />
                  </g>
                  <g data-fill>
                    <path d="M0 500C120 440 250 470 360 452s230-40 360 10V560H0Z" fill="var(--nv-primary)" opacity="0.07" />
                  </g>

                  {/* community boundary (one community, one team) */}
                  <rect
                    data-boundary
                    x="72"
                    y="40"
                    width="612"
                    height="484"
                    rx="26"
                    fill="none"
                    stroke="var(--nv-primary)"
                    strokeWidth="2"
                    strokeDasharray="10 8"
                  />
                  <g data-map>
                    <rect x="268" y="24" width="220" height="32" rx="16" fill="var(--nv-teal-action)" />
                    <text x="378" y="45" textAnchor="middle" fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="14">
                      Your community
                    </text>
                  </g>

                  {towers.map((t) => (
                    <g key={t.id}>
                      <rect data-fill x={t.x} y={top(t)} width={t.w} height={t.floors * FH + 46} rx="5" fill="var(--nv-background)" />
                      <rect
                        data-outline
                        x={t.x}
                        y={top(t)}
                        width={t.w}
                        height={t.floors * FH + 46}
                        rx="5"
                        fill="none"
                        stroke="var(--nv-charcoal)"
                        strokeWidth="2"
                      />
                      <rect data-fill x={t.x + 14} y={top(t) - 9} width={t.w - 28} height="9" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
                      {Array.from({ length: t.floors }).map((_, i) =>
                        Array.from({ length: t.cols }).map((__, c) => {
                          const f = t.floors - i;
                          const r = win(t, f, c);
                          const isTarget = t === TARGET.tower && f === TARGET.floor && c === TARGET.col;
                          return (
                            <rect
                              key={`${t.id}${f}-${c}`}
                              data-fill
                              data-asked={!isTarget && asked(t, f, c) ? '' : undefined}
                              data-target={isTarget ? '' : undefined}
                              x={r.x}
                              y={r.y}
                              width={r.w}
                              height={r.h}
                              rx="3"
                              fill={isTarget ? 'var(--nv-secondary)' : asked(t, f, c) ? 'var(--nv-secondary)' : 'var(--nv-surface-subtle)'}
                              stroke="var(--nv-border)"
                            />
                          );
                        }),
                      )}
                      {/* entrance */}
                      <rect data-fill x={t.x + t.w / 2 - 17} y={GROUND - 36} width="34" height="36" rx="4" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
                      {/* tower label */}
                      <g data-map>
                        <circle cx={t.x + t.w / 2} cy={top(t) - 30} r="15" fill="var(--nv-charcoal)" />
                        <text x={t.x + t.w / 2} y={top(t) - 25} textAnchor="middle" fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="14">
                          {t.id}
                        </text>
                      </g>
                    </g>
                  ))}

                  {/* every visit checked in */}
                  <g data-tick>
                    <circle cx={B.x + B.w + 20} cy={top(B) + 30} r="16" fill="var(--nv-secondary)" />
                    <path d={`M${B.x + B.w + 13} ${top(B) + 30} l5 5 9-9`} stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </g>

                  {/* ground and gate */}
                  <path data-outline d={`M24 ${GROUND}H696`} stroke="var(--nv-charcoal)" strokeWidth="2" strokeLinecap="round" />
                  <g data-fill>
                    <path d={`M40 ${GROUND}c10-28 34-28 44 0M660 ${GROUND}c10-30 34-30 44 0`} fill="var(--nv-secondary)" opacity="0.45" />
                    <rect x="34" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
                    <rect x="84" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
                    <path d={`M40 ${GROUND - 74}Q65 ${GROUND - 98} 90 ${GROUND - 74}`} stroke="var(--nv-charcoal)" strokeWidth="1.6" fill="none" />
                  </g>

                  {/* the team */}
                  <g data-person>
                    <Person x={330} role="maid" />
                  </g>
                  <g data-person>
                    <Person x={372} role="cook" />
                  </g>
                  <g data-person>
                    <Person x={420} role="caretaker" />
                  </g>
                </g>

                {/* "your flat" callout, in screen space (not zoomed) */}
                <g data-callout style={{ opacity: 0 }}>
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
                </g>
              </g>
            </svg>
          </figure>
        </div>
      </div>
    </section>
  );
}
