import { createElement, useSyncExternalStore, type ComponentType, type ReactElement } from 'react';
import { MENU_VIEW_ROUTES, isMenuViewRoute, normalizePath } from '@/lib/menu/paths';

type PageModule = { default: ComponentType };

/**
 * Static import() map so the bundler emits one chunk per setup screen. The
 * shelf prefetches these while the player is still browsing tiles; a tap then
 * mounts the cached page instead of waiting on Next's route payload.
 */
export const MENU_VIEW_LOADERS: Record<string, () => Promise<PageModule>> = {
  '/': () => import('@/app/page'),
  '/games': () => import('@/app/games/page'),
  '/play': () => import('@/app/play/page'),
  '/cribbage': () => import('@/app/cribbage/page'),
  '/wild': () => import('@/app/wild/page'),
  '/eights': () => import('@/app/eights/page'),
  '/ratscrew': () => import('@/app/ratscrew/page'),
  '/euchre': () => import('@/app/euchre/page'),
  '/spades': () => import('@/app/spades/page'),
  '/poker': () => import('@/app/poker/page'),
  '/ohhell': () => import('@/app/ohhell/page'),
  '/scopa': () => import('@/app/scopa/page'),
  '/spite': () => import('@/app/spite/page'),
  '/klondike': () => import('@/app/klondike/page'),
  '/golf': () => import('@/app/golf/page'),
  '/freecell': () => import('@/app/freecell/page'),
  '/spider': () => import('@/app/spider/page'),
  '/pyramid': () => import('@/app/pyramid/page'),
  '/hearts': () => import('@/app/hearts/page'),
  '/gin': () => import('@/app/gin/page'),
  '/president': () => import('@/app/president/page'),
};

const cache = new Map<string, ComponentType>();
const pending = new Map<string, Promise<ComponentType | null>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function peekMenuView(pathname: string): ComponentType | null {
  return cache.get(normalizePath(pathname)) ?? null;
}

export function prefetchMenuView(pathname: string): Promise<ComponentType | null> {
  const route = normalizePath(pathname);
  const cached = cache.get(route);
  if (cached) return Promise.resolve(cached);

  const inflight = pending.get(route);
  if (inflight) return inflight;

  const load = MENU_VIEW_LOADERS[route];
  if (!load) return Promise.resolve(null);

  const request = load()
    .then((mod) => {
      cache.set(route, mod.default);
      pending.delete(route);
      notify();
      return mod.default;
    })
    .catch(() => {
      pending.delete(route);
      return null;
    });

  pending.set(route, request);
  return request;
}

export function prefetchMenuViews(paths: readonly string[] = MENU_VIEW_ROUTES): void {
  for (const path of paths) void prefetchMenuView(path);
}

export function useMenuView(pathname: string): ReactElement | null {
  const route = normalizePath(pathname);
  const View = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      if (isMenuViewRoute(route)) void prefetchMenuView(route);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => cache.get(route) ?? null,
    () => null,
  );
  return View ? createElement(View) : null;
}

export function resetMenuViewsForTests(): void {
  cache.clear();
  pending.clear();
}
