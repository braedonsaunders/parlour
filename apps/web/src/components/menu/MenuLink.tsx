'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';
import { useMenuRouter } from '@/hooks/useMenuRouter';
import type { MenuDirection } from '@/lib/menu/paths';

type MenuLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> & {
  href: string;
  direction?: MenuDirection;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * In-app menu travel that never lets iOS follow the raw href. A standalone
 * PWA treating `<a>` as a document load is why the theme died and the shelf
 * felt like a refresh.
 */
export function MenuLink({ href, direction = 'back', onClick, ...props }: MenuLinkProps) {
  const nav = useMenuRouter();

  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        nav.push(href, direction);
      }}
    />
  );
}
