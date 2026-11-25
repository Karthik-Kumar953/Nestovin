'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Check, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';

gsap.registerPlugin(useGSAP);

/**
 * The hero illustration. It performs Nestovin's operating model (PRD §2.1):
 * residents in a community ask for Nestovin (windows light up), Nestovin builds a
 * team for that community (uniformed team at the gate), and each flat gets its own
 * person and time (your flat called out). Illustrative only.
 */

const FLOORS = 12;
const PER_FLOOR = 4;
const TOWER_X = 236;
const TOP_Y = 118;
const FLOOR_H = 32;
const WIN_W = 38;
const WIN_H = 18;
const WIN_GAP = 56;

// Deterministic "residents who asked" so server and client render the same.
const LIT = new Set([
  '12-1', '11-2', '11-3', '10-1', '10-4', '9-2', '9-3', '9-4', '8-1', '8-3', '7-2', '7-4',
  '6-1', '6-3', '5-2', '5-4', '4-1', '4-2', '3-3', '3-4', '2-1', '2-2', '1-3', '11-4', '6-4', '1-1',
]);

const story = [
  'Residents in a community ask for Nestovin',
  'Nestovin builds a trained team for that community',
  'Every flat gets its own person, at its own time',
];

function windowXY(floor: number, flat: number) {
  return { x: TOWER_X + 18 + (flat - 1) * WIN_GAP, y: TOP_Y + 16 + (FLOORS - floor) * FLOOR_H };
}

function Person({ x, role }: { x: number; role: 'maid' | 'cook' | 'caretaker' }) {
  const body = { maid: 'var(--nv-primary)', cook: '#FFFFFF', caretaker: 'var(--nv-border)' }[role];
  return (
    <g transform={`translate(${x} 566) scale(1.25) translate(0 -566)`}>
      {/* legs */}
      <rect x="-6" y="548" width="5" height="16" rx="2" fill="var(--nv-charcoal)" />
      <rect x="1" y="548" width="5" height="16" rx="2" fill="var(--nv-charcoal)" />
      {/* body */}
      <rect x="-10" y="518" width="20" height="34" rx="8" fill={body} stroke="var(--nv-charcoal)" strokeWidth="1.2" />
      {role === 'maid' && <rect x="-6" y="532" width="12" height="16" rx="3" fill="var(--nv-background)" />}
      {role === 'cook' && <rect x="-6" y="530" width="12" height="20" rx="3" fill="var(--nv-teal-action)" />}
      {role === 'caretaker' && <path d="M-6 519l6 6 6-6" stroke="var(--nv-primary)" strokeWidth="2.4" fill="none" />}
      {/* head */}
      <circle cx="0" cy="508" r="8" fill="var(--nv-neutral-400)" stroke="var(--nv-charcoal)" strokeWidth="1.2" />
      {role === 'cook' && <rect x="-7" y="494" width="14" height="9" rx="4" fill="#FFFFFF" stroke="var(--nv-charcoal)" strokeWidth="1.2" />}
      {role === 'caretaker' && <path d="M-8 504a8 8 0 0 1 16 0h4" fill="var(--nv-primary)" stroke="var(--nv-charcoal)" strokeWidth="1.2" />}
      {role === 'maid' && <circle cx="0" cy="498" r="4" fill="var(--nv-charcoal)" />}
    </g>
  );
}

export function Tower() {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lit = q('[data-lit="true"]');
      const team = q('[data-team] > g');
      const callout = q('[data-callout]');
      const target = q('[data-flat="12-4"]');

      if (reduce) {
        gsap.set(lit, { attr: { fill: 'var(--nv-primary)' } });
        gsap.set(target, { attr: { fill: 'var(--nv-secondary)' } });
        gsap.set([team, callout], { autoAlpha: 1, x: 0, scale: 1 });
        setStep(2);
        return;
      }

      tl.current = gsap
        .timeline({ delay: 0.5, defaults: { ease: 'expo.out' } })
        .call(() => setStep(0))
        .to(lit, {
          attr: { fill: 'var(--nv-primary)' },
          duration: 0.5,
          stagger: { each: 0.07, from: 'random' },
        })
        .call(() => setStep(1), [], '+=0.2')
        .fromTo(team, { autoAlpha: 0, x: -70 }, { autoAlpha: 1, x: 0, duration: 1.1, stagger: 0.14 }, '<')
        .call(() => setStep(2), [], '+=0.5')
        .to(target, { attr: { fill: 'var(--nv-secondary)' }, duration: 0.4 }, '<')
        .fromTo(
          callout,
          { autoAlpha: 0, y: 10, scale: 0.94, transformOrigin: '0% 100%' },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.8 },
          '<',
        );
    },
    { scope: root },
  );

  const replay = () => {
    const q = gsap.utils.selector(root);
    if (!tl.current) return;
    gsap.set(q('[data-lit="true"]'), { attr: { fill: 'var(--nv-surface-subtle)' } });
    tl.current.restart(true);
  };

  const t = windowXY(12, 4);

  return (
    <figure ref={root} className="relative mx-auto w-full max-w-[500px] lg:mr-0">
      <svg viewBox="0 0 560 590" className="h-auto w-full" role="img" aria-labelledby="tower-title tower-desc">
        <title id="tower-title">Illustration of a residential community using Nestovin</title>
        <desc id="tower-desc">
          A residential tower whose windows light up as residents ask for Nestovin. A uniformed Nestovin team of a maid, a cook and a caretaker arrives at the community gate, and your flat is shown with its cook checked in at 7:00.
        </desc>

        {/* sky disc */}
        <circle cx="300" cy="300" r="262" fill="var(--nv-surface)" />
        <circle cx="300" cy="300" r="262" fill="none" stroke="var(--nv-border)" />

        {/* back tower */}
        <g>
          <path d="M84 238L156 192L228 238" fill="none" stroke="var(--nv-charcoal)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <rect x="147" y="208" width="18" height="18" rx="3" fill="var(--nv-secondary)" />
          <rect x="92" y="236" width="128" height="330" rx="4" fill="var(--nv-surface)" stroke="var(--nv-neutral-400)" strokeWidth="1.2" />
          {Array.from({ length: 9 }).map((_, f) =>
            Array.from({ length: 3 }).map((__, n) => (
              <rect key={`b${f}-${n}`} x={106 + n * 38} y={254 + f * 33} width="26" height="15" rx="3" fill="var(--nv-surface-subtle)" stroke="var(--nv-border)" />
            )),
          )}
        </g>

        {/* main tower */}
        <g>
          <rect x={TOWER_X + 16} y={TOP_Y - 10} width="204" height="10" rx="2" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
          <rect x={TOWER_X} y={TOP_Y} width="236" height={FLOORS * FLOOR_H + 64} rx="4" fill="var(--nv-surface)" stroke="var(--nv-charcoal)" strokeWidth="2" />
          {Array.from({ length: FLOORS }).map((_, i) => {
            const floor = FLOORS - i;
            return Array.from({ length: PER_FLOOR }).map((__, j) => {
              const flat = j + 1;
              const key = `${floor}-${flat}`;
              const { x, y } = windowXY(floor, flat);
              return (
                <rect
                  key={key}
                  data-flat={key}
                  data-lit={LIT.has(key) ? 'true' : 'false'}
                  x={x}
                  y={y}
                  width={WIN_W}
                  height={WIN_H}
                  rx="3"
                  fill="var(--nv-surface-subtle)"
                  stroke="var(--nv-border)"
                />
              );
            });
          })}
          {/* entrance */}
          <rect x={TOWER_X + 98} y={TOP_Y + FLOORS * FLOOR_H + 22} width="40" height="42" rx="4" fill="var(--nv-background)" stroke="var(--nv-charcoal)" strokeWidth="1.5" />
        </g>

        {/* ground, garden, gate */}
        <path d="M40 566H520" stroke="var(--nv-charcoal)" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 566c10-26 30-26 40 0M480 566c10-30 34-30 44 0" fill="var(--nv-secondary)" opacity="0.35" />
        <g stroke="var(--nv-charcoal)" strokeWidth="1.6" fill="var(--nv-surface)">
          <rect x="40" y="500" width="14" height="66" rx="2" />
          <rect x="200" y="500" width="14" height="66" rx="2" />
        </g>
        <path d="M54 512H200" stroke="var(--nv-neutral-400)" strokeWidth="1.5" strokeDasharray="4 5" />

        {/* the team */}
        <g data-team>
          <g style={{ opacity: 0 }}><Person x={86} role="maid" /></g>
          <g style={{ opacity: 0 }}><Person x={126} role="cook" /></g>
          <g style={{ opacity: 0 }}><Person x={166} role="caretaker" /></g>
        </g>

        {/* "your flat" callout */}
        <g data-callout style={{ opacity: 0 }}>
          <path d={`M${t.x + WIN_W / 2} ${t.y - 2} L${t.x + WIN_W / 2 - 8} ${t.y - 18} L${t.x + WIN_W / 2 + 8} ${t.y - 18} Z`} fill="var(--nv-charcoal)" />
          <rect x={t.x - 152} y={t.y - 86} width="232" height="70" rx="12" fill="var(--nv-charcoal)" />
          <text x={t.x - 134} y={t.y - 60} fill="#FFFFFF" fontFamily="var(--font-manrope)" fontWeight="700" fontSize="15">
            Your flat
          </text>
          <text x={t.x - 134} y={t.y - 38} fill="var(--nv-border)" fontFamily="var(--font-inter)" fontSize="13">
            Cook · 07:00 · Checked in
          </text>
          <circle cx={t.x + 63} cy={t.y - 52} r="13" fill="var(--nv-secondary)" />
          <path d={`M${t.x + 57} ${t.y - 52} l4 4 8-8`} stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>

      <figcaption className="mt-4">
        <ol className="grid gap-2 sm:grid-cols-3">
          {story.map((s, i) => (
            <li
              key={s}
              aria-current={step === i ? 'step' : undefined}
              className={`flex gap-2 rounded-md px-3 py-2 text-[14px] leading-5 transition-colors duration-500 ${
                step === i ? 'bg-surface text-charcoal ring-1 ring-line' : 'text-ink-2'
              }`}
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-colors duration-500 ${
                  step >= i ? 'bg-teal text-white' : 'bg-subtle text-ink-2'
                }`}
              >
                {step > i ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center justify-between text-[13px] text-ink-2">
          <span>Illustration. Each lit window is a home that asked for Nestovin.</span>
          <button type="button" onClick={replay} className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 font-medium text-teal hover:text-teal-deep">
            <RotateCcw size={14} aria-hidden /> Replay
          </button>
        </div>
      </figcaption>
    </figure>
  );
}
