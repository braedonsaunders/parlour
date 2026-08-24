'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { heartsTablePack } from '@/lib/games/tablePacks/hearts';

export default function HeartsTablePage() {
  return <GameTablePage pack={heartsTablePack} />;
}
