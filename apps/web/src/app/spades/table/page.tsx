'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { spadesTablePack } from '@/lib/games/tablePacks/spades';

export default function SpadesTablePage() {
  return <GameTablePage pack={spadesTablePack} />;
}
