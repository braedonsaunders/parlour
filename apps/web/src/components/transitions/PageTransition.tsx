'use client';

import { useState, type AnimationEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { MenuDirection } from '@/lib/menu/paths';
import { useMenuNavStore } from '@/stores/menuNav';
import { isTableRoute, normalizePath } from '@/lib/transitions/tableWipe';
import s from '@/styles/page-transition.module.css';

const SHELL = 'relative z-10 min-h-dvh';

type EnterKind = 'boot' | MenuDirection | 'none';

type Entered = {
  route: string;
  settled: boolean;
  kind: EnterKind;
};

function enterKindFor(route: string, hadRoute: boolean): EnterKind {
  if (isTableRoute(route)) return 'none';
  if (!hadRoute) return 'boot';
  return useMenuNavStore.getState().direction ?? 'forward';
}

function enterClass(kind: EnterKind): string | null {
  if (kind === 'none') return null;
  if (kind === 'back') return s.enterBack ?? null;
  if (kind === 'forward') return s.enterForward ?? null;
  return s.enter ?? null;
}

/**
 * Plays a short motion whenever the menu route changes.
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
export function PageTransition({
  children,
  route: routeProp,
}: {
  children: ReactNode;
  route?: string;
}) {
  const pathname = usePathname();
  const route = normalizePath(routeProp ?? pathname ?? '/');
  // Derived during render rather than in an effect: an effect would leave one
  // frame of the new page fully drawn before the animation could start it at
  // zero opacity, which reads as a flash.
  const [entered, setEntered] = useState<Entered>({
    route,
    settled: false,
    kind: enterKindFor(route, false),
  });
  if (entered.route !== route) {
    setEntered({ route, settled: false, kind: enterKindFor(route, true) });
  }

  const motion = !entered.settled ? enterClass(entered.kind) : null;

  const settle = (event: AnimationEvent<HTMLDivElement>) => {
    // Page content animates too; only our own animation ends this transition.
    if (event.target !== event.currentTarget) return;
    setEntered({ route, settled: true, kind: entered.kind });
  };

  return (
    <div className={motion ? `${SHELL} ${motion}` : SHELL} onAnimationEnd={settle}>
      {children}
    </div>
  );
}

export default PageTransition;
