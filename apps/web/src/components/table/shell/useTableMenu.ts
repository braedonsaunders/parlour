'use client';

import { useState } from 'react';

export type TableMenuController = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Closes the sheet first so the table is back before the route changes. */
  quit: () => void;
};

export function useTableMenu(onQuit?: () => void): TableMenuController {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    quit: () => {
      setIsOpen(false);
      onQuit?.();
    },
  };
}
