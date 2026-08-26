'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { resolveMusicContext } from '@/lib/audio/context';
import { keepMenuAudioAlive } from '@/lib/menu/keepAlive';
import { useAnyActiveRoom } from '@/lib/table/useRoomTable';
import { useAudioManager, useMusicController } from '@/stores/audio';
import type { MultiplayerRoomSession, MultiplayerSeat } from '@/app/_multiplayer/roomSession';

type RoomPresenceFrame = {
  room: MultiplayerRoomSession;
  seats: readonly MultiplayerSeat[];
};

function roomPresenceChange(
  previous: readonly MultiplayerSeat[],
  current: readonly MultiplayerSeat[],
): 'joined' | 'left' | null {
  const before = new Map(previous.filter((seat) => !seat.bot).map((seat) => [seat.seat, seat]));
  const after = new Map(current.filter((seat) => !seat.bot).map((seat) => [seat.seat, seat]));

  const joined = [...after].some(([seat, player]) => {
    const prior = before.get(seat);
    return player.connected && (!prior || !prior.connected || prior.profileId !== player.profileId);
  });
  if (joined) return 'joined';

  const left = [...before].some(([seat, player]) => {
    const next = after.get(seat);
    return player.connected && (!next || !next.connected || next.profileId !== player.profileId);
  });
  return left ? 'left' : null;
}

/** Preloads audio on every route, unlocks it on gesture, and keeps the music alive. */
export function AudioDirector() {
  const manager = useAudioManager();
  const controller = useMusicController();
  const pathname = usePathname();
  const { room, snapshot: roomSnapshot } = useAnyActiveRoom();
  const previousPresence = useRef<RoomPresenceFrame | null>(null);

  useEffect(() => {
    if (!room || !roomSnapshot?.room || roomSnapshot.connection === 'closed') {
      previousPresence.current = null;
      return;
    }

    const previous = previousPresence.current;
    previousPresence.current = { room, seats: roomSnapshot.seats };
    if (!previous || previous.room !== room) return;

    const change = roomPresenceChange(previous.seats, roomSnapshot.seats);
    if (change === 'joined') manager.play(PARLOUR_SFX.roomPlayerJoined);
    else if (change === 'left') manager.play(PARLOUR_SFX.roomPlayerLeft);
  }, [manager, room, roomSnapshot]);

  useEffect(() => {
    controller.setMenu(resolveMusicContext(pathname) === 'menu');
    const kick = () => {
      if (!manager.isPageActive() || !manager.isUnlocked() || manager.gainFor('music') <= 0) return;
      controller.autoStart();
      keepMenuAudioAlive();
    };
    const unsubscribe = manager.subscribe(kick);
    kick();
    return unsubscribe;
  }, [controller, manager, pathname]);

  useEffect(() => {
    controller.setPageActive(manager.isPageActive());
    return manager.subscribePageActive((active) => controller.setPageActive(active));
  }, [controller, manager]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, [role="switch"]')) {
        manager.play(PARLOUR_SFX.uiPress);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [manager]);

  return null;
}
