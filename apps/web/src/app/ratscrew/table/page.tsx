'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { ratscrewTablePack } from '@/lib/games/tablePacks/ratscrew';

export default function RatscrewTablePage() {
  return <GameTablePage pack={ratscrewTablePack} />;
}
