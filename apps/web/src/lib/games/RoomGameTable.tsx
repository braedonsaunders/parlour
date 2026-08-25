'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { GameTablePage } from '@/components/table/GameTablePage';
import { type MultiplayerRoomSession } from '@/app/_multiplayer/roomSession';
import type { MultiplayerGameId } from '@/lib/rooms/gameIds';
import { blitzTablePack } from './tablePacks/blitz';
import { cribbageTablePack } from './tablePacks/cribbage';
import { eightsTablePack } from './tablePacks/eights';
import { euchreTablePack } from './tablePacks/euchre';
import { ginTablePack } from './tablePacks/gin';
import { heartsTablePack } from './tablePacks/hearts';
import { ohhellTablePack } from './tablePacks/ohhell';
import { pokerTablePack } from './tablePacks/poker';
import { presidentTablePack } from './tablePacks/president';
import { ratscrewTablePack } from './tablePacks/ratscrew';
import { spadesTablePack } from './tablePacks/spades';
import { wildTablePack } from './tablePacks/wild';

/**
 * The live friend table for a room, without changing the document URL.
 *
 * iOS standalone (and a cache-first service worker) treat a lobby → `/table`
 * navigation as a new document. That drops the in-memory room handle and leaves
 * the host on “Finding the table…”. Same JS context, same session.
 */
export function RoomGameTable({ gameId }: { gameId: MultiplayerGameId }) {
  switch (gameId) {
    case 'blitz':
      return <GameTablePage pack={blitzTablePack} />;
    case 'cribbage':
      return <GameTablePage pack={cribbageTablePack} />;
    case 'eights':
      return <GameTablePage pack={eightsTablePack} />;
    case 'euchre':
      return <GameTablePage pack={euchreTablePack} />;
    case 'gin':
      return <GameTablePage pack={ginTablePack} />;
    case 'hearts':
      return <GameTablePage pack={heartsTablePack} />;
    case 'ohhell':
      return <GameTablePage pack={ohhellTablePack} />;
    case 'poker':
      return <GameTablePage pack={pokerTablePack} />;
    case 'president':
      return <GameTablePage pack={presidentTablePack} />;
    case 'ratscrew':
      return <GameTablePage pack={ratscrewTablePack} />;
    case 'spades':
      return <GameTablePage pack={spadesTablePack} />;
    case 'wildpile':
      return <GameTablePage pack={wildTablePack} />;
  }
}

/** Host create pages: deal in place when Start lands, instead of routing away. */
export function HostRoomMatch({
  session,
  children,
}: {
  session: MultiplayerRoomSession;
  children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  if (snapshot.stage === 'table' && snapshot.gameId) {
    return <RoomGameTable gameId={snapshot.gameId} />;
  }
  return children;
}
