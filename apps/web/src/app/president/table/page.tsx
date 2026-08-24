'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { presidentTablePack } from '@/lib/games/tablePacks/president';

export default function PresidentTablePage() {
  return <GameTablePage pack={presidentTablePack} />;
}
