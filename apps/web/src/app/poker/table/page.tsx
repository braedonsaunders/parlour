'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { pokerTablePack } from '@/lib/games/tablePacks/poker';

export default function PokerTablePage() {
  return <GameTablePage pack={pokerTablePack} />;
}
