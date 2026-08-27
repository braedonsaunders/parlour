'use client';

import { GameTablePage } from '@/components/table/GameTablePage';
import { durakTablePack } from '@/lib/games/tablePacks/durak';

export default function DurakTablePage() {
  return <GameTablePage pack={durakTablePack} />;
}
