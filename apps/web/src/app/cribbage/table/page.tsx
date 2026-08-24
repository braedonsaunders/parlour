'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { cribbageTablePack } from '@/lib/games/tablePacks/cribbage';

export default function CribbageTablePage() {
  return <GameTablePage pack={cribbageTablePack} />;
}
