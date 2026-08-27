'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { palaceTablePack } from '@/lib/games/tablePacks/palace';

export default function PalaceTablePage() {
  return <GameTablePage pack={palaceTablePack} />;
}
