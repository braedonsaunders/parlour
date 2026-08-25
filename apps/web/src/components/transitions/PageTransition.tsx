'use client';

import type { ReactNode } from 'react';

const SHELL = 'relative z-10 min-h-dvh';

/**
 * Stable stacking wrapper over the live scene.
 *
 * Menu hops must not put transform, opacity, filter, or will-change on this
 * full-viewport shell. Windows DComp paints a newly promoted overlay black
 * for a frame — once when the layer is created, and again when it drops.
 * Table routes arrive under the wipe; they do not need a wrapper animation.
 */
export function PageTransition({ children }: { children: ReactNode; route?: string }) {
  return <div className={SHELL}>{children}</div>;
}

export default PageTransition;
