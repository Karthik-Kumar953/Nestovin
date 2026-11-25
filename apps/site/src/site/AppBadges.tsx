/**
 * Store badges for the Nestovin app. The apps are not launched yet, so these are not links:
 * each badge says "Coming soon on" with the store's real mark. Store marks keep their own
 * brand colours (the one place the site steps outside DESIGN.md, as store badges must).
 */
export function AppBadges({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-12 gap-2 px-3' : 'h-12 gap-2.5 px-3 sm:h-14 sm:gap-3 sm:px-4';
  const big = size === 'sm' ? 'text-[16px]' : 'text-[16px] sm:text-[18px]';
  const icon = size === 'sm' ? 'size-6' : 'size-6 sm:size-7';
  return (
    <ul className={`flex flex-wrap gap-2.5 sm:gap-3 ${className}`} aria-label="Nestovin app, coming soon">
      <li className={`flex items-center rounded-xl bg-black text-white shadow-[0_0_0_1px_rgb(255_255_255/0.22)] ${box}`}>
        <GooglePlayMark className={icon} />
        <span className="leading-none">
          <span className="block text-[11px] font-medium tracking-[0.02em] text-white/80 uppercase">Coming soon on</span>
          <span className={`mt-1 block font-display font-semibold tracking-[-0.01em] ${big}`}>Google Play</span>
        </span>
      </li>
      <li className={`flex items-center rounded-xl bg-black text-white shadow-[0_0_0_1px_rgb(255_255_255/0.22)] ${box}`}>
        <AppleMark className={icon} />
        <span className="leading-none">
          <span className="block text-[11px] font-medium tracking-[0.02em] text-white/80 uppercase">Coming soon on</span>
          <span className={`mt-1 block font-display font-semibold tracking-[-0.01em] ${big}`}>App Store</span>
        </span>
      </li>
    </ul>
  );
}

function GooglePlayMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <path d="M48 28 292 256 48 484c-9-6-14-17-14-30V58c0-13 5-24 14-30Z" fill="#00C3FF" />
      <path d="M48 28c8-5 19-6 30 0l292 166-78 62L48 28Z" fill="#00E676" />
      <path d="M370 194l70 40c24 14 24 30 0 44l-70 40-78-62 78-62Z" fill="#FFCE00" />
      <path d="M292 256l78 62L78 484c-11 6-22 5-30 0l244-228Z" fill="#FF3A44" />
    </svg>
  );
}

function AppleMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}
