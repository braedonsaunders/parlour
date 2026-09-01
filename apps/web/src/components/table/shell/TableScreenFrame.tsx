'use client';

import type { ReactNode } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import { TableMenu } from '@/components/table/TableMenu';
import { TableCountdown } from './TableCountdown';
import { TableHud } from './TableHud';
import { TableShell, type TableShellProps } from './TableShell';
import type { TableMenuController } from './useTableMenu';

export type TableScreenFrameProps = Omit<TableShellProps, 'children'> & {
  /** Everything left of the shared menu affordance. */
  hud: ReactNode;
  menu: TableMenuController;
  howToPlay?: { doc: HowToPlayDoc; title: string; subtitle?: string };
  children: ReactNode;
};

/**
 * The invariant outer composition of a playable table: shell, HUD/menu button,
 * game-owned felt content, and the shared menu sheet. It adds no DOM of its own
 * and keeps game packs focused on the furniture inside the felt.
 */
export function TableScreenFrame({
  rootRef,
  className,
  dealState,
  hud,
  menu,
  howToPlay,
  children,
}: TableScreenFrameProps) {
  return (
    <TableShell rootRef={rootRef} className={className} dealState={dealState}>
      <TableHud onOpenMenu={menu.open}>{hud}</TableHud>
      {children}
      <TableCountdown />
      <TableMenu open={menu.isOpen} onClose={menu.close} onQuit={menu.quit} howToPlay={howToPlay} />
    </TableShell>
  );
}
