import { create } from 'zustand';
import { type MenuDirection, inferMenuDirection, normalizePath } from '@/lib/menu/paths';

export type MenuNavState = {
  /** True after the first in-app menu tap this session; hydration still uses children. */
  active: boolean;
  /** iOS standalone: document URL is frozen so WebKit will not reload. */
  frozen: boolean;
  displayPath: string;
  previousPath: string | null;
  direction: MenuDirection | null;
  show: (path: string, direction: MenuDirection, frozen?: boolean) => void;
  deactivate: () => void;
};

export const useMenuNavStore = create<MenuNavState>((set, get) => ({
  active: false,
  frozen: false,
  displayPath: '/',
  previousPath: null,
  direction: null,
  show: (path, direction, frozen = get().frozen) => {
    const route = normalizePath(path);
    const current = get();
    if (current.active && current.displayPath === route) {
      if (frozen !== current.frozen) set({ frozen });
      return;
    }
    set({
      active: true,
      frozen,
      previousPath: current.displayPath,
      displayPath: route,
      direction,
    });
  },
  deactivate: () =>
    set({
      active: false,
      frozen: false,
      direction: null,
    }),
}));

export function resetMenuNavForTests(): void {
  useMenuNavStore.setState({
    active: false,
    frozen: false,
    displayPath: '/',
    previousPath: null,
    direction: null,
  });
}

export function directionForMenuChange(from: string, to: string): MenuDirection {
  return inferMenuDirection(from, to);
}
