'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { usePathname } from 'next/navigation';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * One scroll-reveal for the whole site. Anything marked data-reveal that is still
 * below the fold arrives as it is scrolled to; everything else stays as rendered.
 * Reduced motion: nothing moves.
 */
export function Reveals() {
  const pathname = usePathname();

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const fold = window.innerHeight * 0.92;
      const items = gsap.utils
        .toArray<HTMLElement>('[data-reveal]')
        .filter((el) => el.getBoundingClientRect().top > fold);
      if (!items.length) return;
      gsap.set(items, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(items, {
        start: 'top 88%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, overwrite: true }),
      });
      ScrollTrigger.refresh();
    },
    { dependencies: [pathname], revertOnUpdate: true },
  );

  return null;
}
