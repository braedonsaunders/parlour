'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { ginTablePack } from '@/lib/games/tablePacks/gin';

export default function GinTablePage() {
  return <GameTablePage pack={ginTablePack} />;
}
