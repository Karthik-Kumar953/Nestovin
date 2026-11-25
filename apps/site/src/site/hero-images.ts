import fs from 'node:fs';
import path from 'node:path';

/**
 * Page hero photographs. Each page has its own file (prompts in
 * docs/Design/Website_Page_Hero_Prompts.md). Until that file is saved in public/site, the page
 * uses an existing photo, so a new photo appears on the next build without a code change.
 * Server-only (reads the file system at build time); never import from a client component.
 */
const heroes = {
  services: { file: '/site/hero-services.jpg', fallback: '/site/team.jpg', focus: '50% 30%' },
  maid: { file: '/site/hero-maid.jpg', fallback: '/site/maid.jpg', focus: '40% 30%' },
  cook: { file: '/site/hero-cook.jpg', fallback: '/site/cook.jpg', focus: '55% 30%' },
  caretaker: { file: '/site/hero-caretaker.jpg', fallback: '/site/caretaker.jpg', focus: '55% 30%' },
  'how-it-works': { file: '/site/hero-how-it-works.jpg', fallback: '/site/family-morning.jpg', focus: '55% 35%' },
  trust: { file: '/site/hero-trust.jpg', fallback: '/site/door-checkin.jpg', focus: '55% 30%' },
  communities: { file: '/site/hero-communities.jpg', fallback: '/site/community-dawn.jpg', focus: '50% 40%' },
  careers: { file: '/site/hero-careers.jpg', fallback: '/site/training.jpg', focus: '50% 30%' },
  about: { file: '/site/hero-about.jpg', fallback: '/site/family-morning.jpg', focus: '55% 35%' },
  faq: { file: '/site/hero-faq.jpg', fallback: '/site/support-desk.jpg', focus: '50% 35%' },
} as const;

export type HeroPage = keyof typeof heroes;

export function pageHero(page: HeroPage): { image: string; focus: string } {
  const h = heroes[page];
  const exists = fs.existsSync(path.join(process.cwd(), 'public', h.file));
  return { image: exists ? h.file : h.fallback, focus: h.focus };
}
