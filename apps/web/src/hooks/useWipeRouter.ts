'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { runTableWipe } from '@/lib/transitions/runTableWipe';
import { isTableRoute, routeOfHref } from '@/lib/transitions/tableWipe';

/**
 * Drop-in `useRouter` whose `push`/`replace` play the full-screen table wipe
 * when the destination is a table route. Every other method — and every
 * non-table destination — behaves exactly like the plain router.
 */
export function useWipeRouter() {
  const router = useRouter();
  const pathname = usePathname();

  return useMemo(() => {
    const wipe = (go: () => void, href: string) => {
      const target = routeOfHref(href);
      const origin = pathname ?? '/';
      if (isTableRoute(target)) runTableWipe(go, target, origin);
      else go();
    };

    // Rest args rather than a named `options` parameter: forwarding an explicit
    // `undefined` would change the call the underlying router — and anything
    // spying on it — actually sees.
    return {
      push: (...args: Parameters<typeof router.push>) => wipe(() => router.push(...args), args[0]),
      replace: (...args: Parameters<typeof router.replace>) =>
        wipe(() => router.replace(...args), args[0]),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      prefetch: (...args: Parameters<typeof router.prefetch>) => router.prefetch(...args),
    };
  }, [router, pathname]);
}

export type WipeRouter = ReturnType<typeof useWipeRouter>;
