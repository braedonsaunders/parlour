'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { blitzTablePack } from '@/lib/games/tablePacks/blitz';

export default function TablePage() {
  return <GameTablePage pack={blitzTablePack} />;
}
