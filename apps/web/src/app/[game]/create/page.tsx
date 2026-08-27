import { notFound } from 'next/navigation';
import { CreateRoomScreen } from '@/components/multiplayer/CreateRoomScreen';
import { CREATE_ROUTE_SEGMENTS } from '@/lib/rooms/createScreens';
import { gameForRoomSegment } from '@/lib/rooms/tableRoute';

/**
 * Every game's create route, built from the room vocabulary.
 *
 * This replaced thirteen near-identical page files. Adding a game to
 * `MULTIPLAYER_GAME_IDS` and giving it a `CREATE_SCREENS` entry is now the whole
 * job — its `/<segment>/create` route appears without anyone writing a page,
 * which is what stopped the fourteenth copy of this screen from drifting away
 * from the other thirteen.
 *
 * A static sibling directory does not shadow this: Next backtracks to the
 * dynamic branch when the static one has no matching child, so `/spades/create`
 * resolves here even though `app/spades/` exists. Verified against the export,
 * because it is the assumption the whole layout rests on.
 */
export function generateStaticParams() {
  return CREATE_ROUTE_SEGMENTS.map((game) => ({ game }));
}

export const dynamicParams = false;

export default async function CreateRoomRoute({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const gameId = gameForRoomSegment(game);
  if (!gameId) notFound();
  return <CreateRoomScreen gameId={gameId} />;
}
