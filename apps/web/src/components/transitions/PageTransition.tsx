'use client';

import { useState, type AnimationEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isTableRoute, normalizePath } from '@/lib/transitions/tableWipe';
import s from '@/styles/page-transition.module.css';

const SHELL = 'relative z-10 min-h-dvh';

/**
 * Plays a short rise-and-fade whenever the route changes.
 *
 * Two details make this safe to wrap the whole app in:
 *
 *   - The animating class is dropped once the animation ends. A `transform`
 *     that lingers — even an identity one — turns this wrapper into the
 *     containing block for every `position: fixed` descendant, which would
 *     quietly re-anchor the corner chrome on every page.
 *   - Table routes opt out. They arrive under the full-screen wipe and run
 *     their own deal-in, and a transform on their ancestor would displace the
 *     fixed hand rail for the length of the animation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const route = normalizePath(pathname ?? '/');
  // Derived during render rather than in an effect: an effect would leave one
  // frame of the new page fully drawn before the animation could start it at
  // zero opacity, which reads as a flash.
  const [entered, setEntered] = useState({ route, settled: false });
  if (entered.route !== route) setEntered({ route, settled: false });

  const animate = !entered.settled && !isTableRoute(route);

  const settle = (event: AnimationEvent<HTMLDivElement>) => {
    // Page content animates too; only our own animation ends this transition.
    if (event.target !== event.currentTarget) return;
    setEntered({ route, settled: true });
  };

  return (
    <div className={animate ? `${SHELL} ${s.enter}` : SHELL} onAnimationEnd={settle}>
      {children}
    </div>
  );
}

export default PageTransition;
