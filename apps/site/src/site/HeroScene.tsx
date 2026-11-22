'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';
import { asked, FH, GROUND, Person, TARGET, top, towers, win } from './CommunityStory';

gsap.registerPlugin(useGSAP);

const tw = win(TARGET.tower, TARGET.floor, TARGET.col);

/**
 * The hero picture while the film is not in yet: the drawn community, lit up. It draws
 * itself once on load (no scroll): towers, the homes on Nestovin, the team at the gate,
 * and flat 1204 checking in. Server-rendered in its final state, so it reads without JS.
 */
export function HeroScene() {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        q('[data-outline]').forEach((el) => {
          const len = (el as unknown as SVGGeometryElement).getTotalLength?.() ?? 1200;
          gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap
          .timeline({ defaults: { ease: 'power2.out' }, delay: 0.2 })
          .to(q('[data-outline]'), { strokeDashoffset: 0, duration: 1, stagger: 0.08, ease: 'power1.inOut' })
          .from(q('[data-fill]'), { autoAlpha: 0, duration: 0.5 }, '-=0.45')
          .from(q('[data-lit]'), { attr: { fill: 'var(--nv-surface-subtle)' }, duration: 0.5, stagger: { each: 0.012, from: 'random' } }, '-=0.2')
          .from(q('[data-person]'), { y: 24, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, '-=0.3')
          .from(q('[data-target]'), { attr: { fill: 'var(--nv-surface-subtle)' }, duration: 0.2 })
          .from(q('[data-callout]'), { autoAlpha: 0, scale: 0.9, transformOrigin: '0% 50%', duration: 0.5, ease: 'back.out(1.6)' });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const B = towers[1]!;

  return (
    <svg
      ref={root}
      viewBox="16 40 728 480"
      className="h-auto w-full"
      role="img"
      aria-label="Illustration: a gated community with three towers. Homes using Nestovin are lit, the Nestovin team stands at the gate, and flat 1204 is checked in for the cook at 7:00."
    >
      <g data-fill>
        <path d="M0 500C120 440 250 470 360 452s270-40 400 10V560H0Z" fill="var(--nv-primary)" opacity="0.08" />
      </g>

      {towers.map((t) => (
        <g key={t.id}>
          <rect data-fill x={t.x} y={top(t)} width={t.w} height={t.floors * FH + 46} rx="5" fill="var(--nv-surface)" />
          <rect data-outline x={t.x} y={top(t)} width={t.w} height={t.floors * FH + 46} rx="5" fill="none" stroke="var(--nv-charcoal)" strokeWidth="2" />
          <rect data-fill x={t.x + 14} y={top(t) - 9} width={t.w - 28} height="9" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
          {Array.from({ length: t.floors }).map((_, i) =>
            Array.from({ length: t.cols }).map((__, c) => {
              const f = t.floors - i;
              const r = win(t, f, c);
              const isTarget = t === TARGET.tower && f === TARGET.floor && c === TARGET.col;
              const lit = !isTarget && asked(t, f, c);
              return (
                <rect
                  key={`${t.id}${f}-${c}`}
                  data-lit={lit ? '' : undefined}
                  data-target={isTarget ? '' : undefined}
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx="3"
                  fill={isTarget ? 'var(--nv-secondary)' : lit ? 'var(--nv-primary)' : 'var(--nv-surface-subtle)'}
                  stroke="var(--nv-border)"
                />
              );
            }),
          )}
          <rect data-fill x={t.x + t.w / 2 - 17} y={GROUND - 36} width="34" height="36" rx="4" fill="var(--nv-background)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
        </g>
      ))}

      {/* ground and gate */}
      <path data-outline d={`M24 ${GROUND}H696`} stroke="var(--nv-charcoal)" strokeWidth="2" strokeLinecap="round" />
      <g data-fill>
        <path d={`M40 ${GROUND}c10-28 34-28 44 0M660 ${GROUND}c10-30 34-30 44 0`} fill="var(--nv-secondary)" opacity="0.45" />
        <rect x="34" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
        <rect x="84" y={GROUND - 74} width="12" height="74" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.6" />
        <path d={`M40 ${GROUND - 74}Q65 ${GROUND - 98} 90 ${GROUND - 74}`} stroke="var(--nv-charcoal)" strokeWidth="1.6" fill="none" />
      </g>

      <g data-person>
        <Person x={330} role="maid" />
      </g>
      <g data-person>
        <Person x={372} role="cook" />
      </g>
      <g data-person>
        <Person x={420} role="caretaker" />
      </g>

      {/* flat 1204, checked in */}
      <g data-callout>
        <path d={`M${tw.x + tw.w + 4} ${tw.y + tw.h / 2}L${B.x + B.w + 22} ${tw.y + 26}`} stroke="var(--nv-charcoal)" strokeWidth="1.6" />
        <rect x={B.x + B.w + 20} y={tw.y - 6} width="238" height="72" rx="14" fill="var(--nv-charcoal)" />
        <text x={B.x + B.w + 40} y={tw.y + 22} fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="17">
          Flat 1204
        </text>
        <text x={B.x + B.w + 40} y={tw.y + 46} fill="var(--nv-border)" fontFamily="var(--font-inter)" fontSize="14">
          Cook · 07:00 · Checked in
        </text>
        <circle cx={B.x + B.w + 230} cy={tw.y + 30} r="14" fill="var(--nv-secondary)" />
        <path d={`M${B.x + B.w + 223} ${tw.y + 30} l5 5 9-9`} stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
