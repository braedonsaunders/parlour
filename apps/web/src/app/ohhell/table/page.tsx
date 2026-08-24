'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { ohhellTablePack } from '@/lib/games/tablePacks/ohhell';

export default function OhHellTablePage() {
  return <GameTablePage pack={ohhellTablePack} />;
}
