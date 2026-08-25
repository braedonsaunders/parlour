import { freezesMenuDocument, pushFrozenMenu } from '@/lib/menu/history';
import { keepMenuAudioAlive } from '@/lib/menu/keepAlive';
import { type MenuDirection, isMenuViewRoute, menuPath } from '@/lib/menu/paths';
import { prefetchMenuView } from '@/lib/menu/views';
import { useMenuNavStore } from '@/stores/menuNav';
import { isTableRoute } from '@/lib/transitions/tableWipe';

export type MenuNavRouter = {
  push: (href: string) => void;
  prefetch?: (href: string) => void;
};

/**
 * Instant menu travel: swap the cached view, keep the theme in this tap, and
 * on iOS PWAs avoid changing the document URL so WebKit will not reload.
 */
export function navigateMenu(router: MenuNavRouter, href: string, direction: MenuDirection): void {
  const target = menuPath(href);
  keepMenuAudioAlive();

  if (isTableRoute(target) || !isMenuViewRoute(target)) {
    useMenuNavStore.getState().deactivate();
    router.push(href);
    keepMenuAudioAlive();
    return;
  }

  void prefetchMenuView(target);
  router.prefetch?.(href);

  const frozen = freezesMenuDocument();
  const previous = useMenuNavStore.getState().displayPath;
  useMenuNavStore.getState().show(target, direction, frozen);

  if (frozen) {
    pushFrozenMenu(target, previous);
    keepMenuAudioAlive();
    return;
  }

  router.push(href);
  keepMenuAudioAlive();
}
