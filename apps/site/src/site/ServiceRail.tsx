import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { services } from './content';
import { LinkButton, ServiceBadge } from './ui';

/**
 * The three services, side by side. A plain grid on purpose: the home page has one
 * scroll-driven moment (the community story); this section reads at normal scroll speed.
 */
export function ServiceRail() {
  return (
    <section className="border-t border-line bg-surface py-20 md:py-28" aria-labelledby="svc-title">
      <div className="mx-auto w-full max-w-[1200px] px-5 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[640px]">
            <h2 id="svc-title" className="text-[30px] leading-[38px] font-bold tracking-[-0.02em] md:text-[44px] md:leading-[52px]">
              Clean homes. Healthy meals. Caring people.
            </h2>
            <p className="mt-4 text-[17px] leading-7 text-ink-2">
              Three services, each run properly. Plans and prices are set for each community and shown in the Nestovin app once your community is live.
            </p>
          </div>
          <LinkButton href="/services" variant="secondary" className="self-start md:self-auto">
            All services
          </LinkButton>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {services.map((s) => (
            <li key={s.slug} data-reveal>
              <Link
                href={`/services/${s.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas transition-[border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_18px_40px_-28px_rgb(0_121_107/0.55)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image src={s.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                </div>
                <div className="flex flex-1 flex-col p-6 md:p-7">
                  <div className="flex items-center gap-3">
                    <ServiceBadge slug={s.slug} size="sm" />
                    <h3 className="text-[24px] leading-8 font-bold">{s.name}</h3>
                  </div>
                  <p className="mt-3 text-[16px] leading-6 text-ink-2">{s.short}</p>
                  {s.slug === 'caretaker' && <p className="mt-2 text-[14px] leading-5 text-ink-2">Added to a maid or cook plan.</p>}
                  <span className="mt-auto flex items-center gap-2 pt-6 font-display text-[15px] font-semibold text-teal">
                    About the {s.name.toLowerCase()} service
                    <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
