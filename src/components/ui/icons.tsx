/**
 * Custom hand-picked SVG icons, matched to the notebook/journal aesthetic.
 *
 * Every icon draws with stroke="currentColor" so it inherits the text colour of
 * its container (active/inactive tabs, buttons, badges). Small decorative
 * "flourish" paths (the gold star on the logo, the underline on the Today
 * bookmark, the star on the Library spine) render at reduced opacity so they
 * tint along with the container colour instead of hardcoding a separate hue.
 *
 * Sizes are controlled by CSS on the parent (tap targets unchanged); each svg
 * just fills the box it is given.
 */

interface IconProps {
  className?: string;
  size?: number;
}

function svgProps(size?: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
  };
}

/** Today tab — bookmark page with a small highlighter mark. */
export function IconToday({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M8.5 3.2h9c.6 0 1 .5 1 1.1v16.4l-5.5-4-5.5 4V4.3c0-.6.5-1.1 1-1.1Z" />
      <path d="M11.3 7.6 16.7 7.3" opacity={0.55} />
    </svg>
  );
}

/** Notebook tab — page with margin ruling and handwritten lines. */
export function IconNotebook({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M6.3 3.4h10.4c.9 0 1.6.8 1.5 1.7l-.9 14.6c-.1.9-.9 1.6-1.8 1.5l-8.3-.5c-.9 0-1.6-.8-1.5-1.7l.6-15.6Z" />
      <path d="M3.6 6.2c.3-.1 1.6-.4 2.2 0M3.3 10.4c.3-.1 1.7-.4 2.4 0M3.7 14.6c.3-.1 1.5-.3 2.1 0" opacity={0.55} />
      <path d="M9.3 8.7 15 9.1M8.9 12 14.5 12.3M8.7 15.3 12.6 15.5" />
    </svg>
  );
}

/** Library tab — books on a shelf with a small star on the leaning one. */
export function IconLibrary({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M3.6 5.9c-.1-.9.6-1.6 1.5-1.6h2.3v15.6H5.1c-.9 0-1.6-.7-1.5-1.6l0-12.4Z" />
      <path d="M9 4.3h2.9c.8 0 1.5.7 1.5 1.5v13.3c0 .8-.7 1.5-1.5 1.5H9V4.3Z" />
      <path d="M14.9 5.6 18.1 4.6c.8-.2 1.6.2 1.9 1l4 12.9c.2.8-.2 1.6-1 1.9l-3 .9c-.8.2-1.6-.2-1.9-1l-4.1-13c-.2-.7.2-1.5 1-1.7Z" />
      <path
        d="M21 21.3 21.5 22.6 22.9 22.2 22 23.3 22.6 24.6 21.3 23.9 20.3 24.9 20.6 23.5 19.3 22.9 20.7 22.6Z"
        transform="translate(-2 -4) scale(0.55)"
        strokeWidth={1.3}
        opacity={0.65}
      />
    </svg>
  );
}

/** Review tab — two curved arrows chasing each other. */
export function IconReview({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M4.3 12.4C4 8.3 7.4 4.7 11.7 4.6c3.8-.1 7 2.4 7.9 5.8" />
      <path d="M20.4 4.9 19.7 10.6 14.2 9.8" />
      <path d="M19.7 11.8c.4 4.1-3 7.8-7.3 8-3.9.2-7.1-2.3-8.1-5.7" />
      <path d="M3.5 19.4 4.4 13.7 9.9 14.6" />
    </svg>
  );
}

/** Spelling tab — puzzle piece. */
export function IconSpelling({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M9.3 4.6h4.9c.5 0 .9.4.9 1v1.9c1-.4 2.1.3 2.1 1.5s-1.1 1.9-2.1 1.5V13c0 .5-.4 1-.9 1h-2c.1-1.1-.7-2-1.7-2s-1.9.9-1.7 2H6.8c-.5 0-.9-.4-.9-1V9.9c-1 .4-2.1-.3-2.1-1.5s1.1-1.9 2.1-1.5V5.6c0-.5.4-1 .9-1h2.4Z" />
    </svg>
  );
}

/** Settings tab — cog with a round centre. */
export function IconSettings({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M9.4 4.8c-.1-.7.4-1.3 1.1-1.4h3c.7 0 1.2.6 1.1 1.4l-.3 1.7c.9.3 1.7.8 2.4 1.4l1.6-.7c.6-.3 1.4 0 1.7.7l1.4 2.6c.3.6.1 1.4-.5 1.8l-1.4 1c.1.5.1.9 0 1.4l1.4 1c.6.4.8 1.2.5 1.8l-1.4 2.6c-.3.6-1.1.9-1.7.7l-1.6-.7c-.7.6-1.5 1.1-2.4 1.4l.3 1.7c.1.7-.4 1.3-1.1 1.4h-3c-.7 0-1.2-.6-1.1-1.4l.3-1.7c-.9-.3-1.7-.8-2.4-1.4l-1.6.7c-.6.3-1.4 0-1.7-.7l-1.4-2.6c-.3-.6-.1-1.4.5-1.8l1.4-1c-.1-.5-.1-.9 0-1.4l-1.4-1c-.6-.4-.8-1.2-.5-1.8l1.4-2.6c.3-.6 1.1-.9 1.7-.7l1.6.7c.7-.6 1.5-1.1 2.4-1.4L9.4 4.8Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

/** App logo — annotated page, pencil, and a gold star. */
export function IconLogo({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M6 4.8C6 3.9 6.8 3.2 7.7 3.3L17 4.2l2.6 2.9-.3 13.6c0 .9-.8 1.6-1.7 1.5L6.9 21c-.9-.1-1-.9-.9-1.7L6 4.8Z" />
      <path d="M17 4.2 16.7 7.4 19.6 7" />
      <path d="M9 10.3 14.8 10M9 13 14.6 12.8M9 15.7 12.7 15.6" />
      <path d="M18.9 14.8l1.9 1.7-4.5 4.3-2.3-.3.2-2.3 4.7-4.4Z" strokeLinejoin="round" />
      <path
        d="M4.2 4 4.8 5.3 6.1 4.9 5.3 6 5.9 7.3 4.6 6.6 3.6 7.6 3.9 6.2 2.6 5.6 4 5.3Z"
        strokeWidth={1.3}
        opacity={0.65}
      />
    </svg>
  );
}

/** Pronunciation button on word cards — speaker with sound waves. */
export function IconSpeaker({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M3.8 9.8h3.3L11.6 6v12.2l-4.5-3.8H3.8c-.5 0-.9-.4-.9-1v-2.6c0-.5.4-1 .9-1Z" />
      <path d="M15 9.4c1.3 1 1.4 4.1 0 5.4M17.7 6.7c2.8 2.6 2.9 8.1 0 10.9" />
    </svg>
  );
}

/** Floating “add word” button — circled plus. */
export function IconAddWord({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12.1 3.3c4.9-.1 8.7 3.8 8.6 8.6-.1 4.8-3.9 8.6-8.6 8.6-4.8 0-8.5-3.9-8.6-8.6-.1-4.7 3.7-8.5 8.6-8.6Z" />
      <path d="M12 7.6v8.8M7.6 12h8.8" />
    </svg>
  );
}

/** Streak counter — two-layer campfire flame. */
export function IconStreak({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12.1 21c-4.3.1-6.9-2.6-6.8-6.2.1-2.7 1.8-4.1 2.6-6.4.5 1 1.2 1.9 2.1 1.8-.4-3.1.9-5.5 3.4-7.2.3 2.1 1.2 3.4 2.6 4.8 1.8 1.8 2.9 3.6 2.8 6.1-.1 3.9-2.6 7.2-6.7 7.1Z" />
      <path d="M12.2 21c1.9 0 3.1-1.3 3-2.9-.1-1.4-.8-2.1-1.3-3.1-.4 1.5-1 2.1-1.9 2.4.2-1.4-.2-2.2-1-3-.9 1.7-1.7 2.6-1.8 4.1-.1 1.5 1.1 2.6 3 2.5Z" opacity={0.55} />
    </svg>
  );
}

/** “Mastered / done” status — star with a little sparkle. */
export function IconMastered({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12.1 3.6 14.9 9l5.8.9-4.2 4 1 5.9-5.3-2.8-5.3 2.9.9-5.9-4.1-4.1 5.8-.8Z" strokeLinejoin="round" />
      <path
        d="M19.5 3.6 20 4.9 21.3 4.5 20.5 5.6 21.1 6.9 19.8 6.2 18.8 7.2 19.1 5.8 17.8 5.2 19.2 4.9Z"
        strokeWidth={1.2}
        opacity={0.65}
      />
    </svg>
  );
}

/** Notebook search box — magnifying glass over written lines. */
export function IconSearch({ className, size }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M11 4.4c3.6-.1 6.3 2.7 6.2 6.2-.1 3.5-2.8 6.3-6.2 6.2-3.5-.1-6.2-2.8-6.2-6.2 0-3.5 2.7-6.1 6.2-6.2Z" />
      <path d="M15.7 15.4 20.6 20.2" />
      <path d="M8 8.7h5.7M8.5 11.4h4M8.7 13.9h2.6" opacity={0.55} />
    </svg>
  );
}
