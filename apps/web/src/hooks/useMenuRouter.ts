'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GAMES } from '@/lib/games/shelf';
import { type MenuDirection, MENU_VIEW_ROUTES } from '@/lib/menu/paths';
import { navigateMenu } from '@/lib/menu/navigate';
import { prefetchMenuView, prefetchMenuViews } from '@/lib/menu/views';

export function useMenuRouter() {
  const router = useRouter();

  return useMemo(() => {
    return {
      push: (href: string, direction: MenuDirection = 'forward') => {
        navigateMenu(router, href, direction);
      },
      prefetch: (href: string) => {
        void prefetchMenuView(href);
        void router.prefetch?.(href);
      },
      prefetchShelf: () => {
        prefetchMenuViews(MENU_VIEW_ROUTES);
        void router.prefetch?.('/games');
        void router.prefetch?.('/');
        for (const game of GAMES) {
          if (game.href) void router.prefetch?.(game.href);
        }
      },
    };
  }, [router]);
}

export type MenuRouter = ReturnType<typeof useMenuRouter>;
