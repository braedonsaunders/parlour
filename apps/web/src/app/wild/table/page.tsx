'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { wildTablePack } from '@/lib/games/tablePacks/wild';

export default function WildTablePage() {
  return <GameTablePage pack={wildTablePack} />;
}
