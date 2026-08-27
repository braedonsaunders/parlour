'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { pinochleTablePack } from '@/lib/games/tablePacks/pinochle';

export default function PinochleTablePage() {
  return <GameTablePage pack={pinochleTablePack} />;
}
