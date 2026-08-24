'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { euchreTablePack } from '@/lib/games/tablePacks/euchre';

export default function EuchreTablePage() {
  return <GameTablePage pack={euchreTablePack} />;
}
