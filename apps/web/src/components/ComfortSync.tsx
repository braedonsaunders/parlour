'use client';

import { useEffect } from 'react';
import { useProfileStore } from '@/stores/profile';

/** Applies the profile's comfort preferences to the document (motion calm-down). */
export function ComfortSync() {
  const reduced = useProfileStore((s) => s.settings.reducedMotion);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
    return () => document.documentElement.classList.remove('reduce-motion');
  }, [reduced]);

  return null;
}
