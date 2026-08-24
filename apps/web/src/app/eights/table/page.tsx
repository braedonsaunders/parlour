'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { eightsTablePack } from '@/lib/games/tablePacks/eights';

export default function EightsTablePage() {
  return <GameTablePage pack={eightsTablePack} />;
}
