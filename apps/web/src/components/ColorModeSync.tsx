'use client';

import { useEffect } from 'react';
import { useTableFxStore } from '@/stores/tableFx';

/** Keeps the whole app on one persisted color treatment. */
export function ColorModeSync() {
  const appColorMode = useTableFxStore((state) => state.appColorMode);

  useEffect(() => {
    document.documentElement.dataset.colorMode = appColorMode;
  }, [appColorMode]);

  return null;
}
