'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PageTransition } from '@/components/transitions/PageTransition';
import { readFrozenMenuPath } from '@/lib/menu/history';
import { keepMenuAudioAlive } from '@/lib/menu/keepAlive';
import { inferMenuDirection, isMenuViewRoute, normalizePath } from '@/lib/menu/paths';
import { useMenuView } from '@/lib/menu/views';
import { useMenuNavStore } from '@/stores/menuNav';
import { isTableRoute } from '@/lib/transitions/tableWipe';

/**
 * Renders cached menu screens the moment a tap lands, instead of waiting for
 * Next to fetch the next static route. On iOS PWAs the document URL stays put
 * so the theme song is not killed by a standalone navigation.
 */
export function MenuShell({ children }: { children: ReactNode }) {
  const pathname = normalizePath(usePathname() ?? '/');
  const active = useMenuNavStore((state) => state.active);
  const displayPath = useMenuNavStore((state) => state.displayPath);
  const previousPath = useMenuNavStore((state) => state.previousPath);

  const route = active ? displayPath : pathname;
  const View = useMenuView(route);
  const Previous = useMenuView(previousPath ?? '');

  useEffect(() => {
    const store = useMenuNavStore.getState();
    if (!store.active) {
      useMenuNavStore.setState({ displayPath: pathname });
    }
  }, [pathname]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const menu = readFrozenMenuPath(event.state);
      if (!menu) return;
      keepMenuAudioAlive();
      useMenuNavStore.getState().show(menu, 'back', true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const store = useMenuNavStore.getState();
    if (store.frozen && store.active) return;
    if (isTableRoute(pathname) || !isMenuViewRoute(pathname)) return;
    if (store.active && store.displayPath !== pathname) {
      store.show(pathname, inferMenuDirection(store.displayPath, pathname), false);
    }
  }, [pathname]);

  if (isTableRoute(pathname) || isTableRoute(route)) {
    return <PageTransition route={pathname}>{children}</PageTransition>;
  }

  if (active && View) {
    return (
      <PageTransition route={route}>
        <View />
      </PageTransition>
    );
  }

  if (active && Previous && route !== pathname) {
    return (
      <PageTransition route={previousPath ?? pathname}>
        <Previous />
      </PageTransition>
    );
  }

  return <PageTransition route={active ? route : pathname}>{children}</PageTransition>;
}

export default MenuShell;
