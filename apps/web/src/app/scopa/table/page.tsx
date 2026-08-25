'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { scopaTablePack } from '@/lib/games/tablePacks/scopa';

export default function ScopaTablePage() {
  return <GameTablePage pack={scopaTablePack} />;
}
