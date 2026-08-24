'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { spiteTablePack } from '@/lib/games/tablePacks/spite';

export default function SpiteTablePage() {
  return <GameTablePage pack={spiteTablePack} />;
}
