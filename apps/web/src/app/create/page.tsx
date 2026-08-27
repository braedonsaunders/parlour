'use client';

import { CreateRoomScreen } from '@/components/multiplayer/CreateRoomScreen';

/**
 * Blitz's create route.
 *
 * The only game whose room does not live at `/<game>/create`: this URL shipped
 * before there was a second game to generalise from, the shelf still links to
 * it, and it may be on somebody's home screen. Keeping it is four lines;
 * moving it would 404 a URL that is already out there.
 */
export default function CreateBlitzRoomPage() {
  return <CreateRoomScreen gameId="blitz" />;
}
