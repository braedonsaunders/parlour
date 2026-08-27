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

  /*
   * The press sound belongs to a press, and on a touch screen `pointerdown`
   * cannot yet tell one from the start of a scroll. The games shelf is a row of
   * tiles that are themselves buttons, so on iOS every swipe along it began by
   * pressing a button and the shelf clicked at you the whole way down.
   *
   * A mouse or a pen cannot scroll the page by pressing, so those still sound
   * immediately. A finger has to finish the gesture first: it sounds on release,
   * and only if it stayed put and lifted on the control it started on.
   */
  useEffect(() => {
    const CONTROLS = 'button, a, [role="switch"]';
    /** How far a finger may wander and still have meant to press. */
    const PRESS_SLOP_PX = 10;
    let pending: { id: number; x: number; y: number; control: Element } | null = null;

    const controlUnder = (target: EventTarget | null) =>
      target instanceof Element ? target.closest(CONTROLS) : null;

    const onPointerDown = (event: PointerEvent) => {
      const control = controlUnder(event.target);
      if (!control) return;
      if (event.pointerType !== 'touch') {
        manager.play(PARLOUR_SFX.uiPress);
        return;
      }
      pending = { id: event.pointerId, x: event.clientX, y: event.clientY, control };
    };

    const onPointerUp = (event: PointerEvent) => {
      const armed = pending;
      pending = null;
      if (!armed || armed.id !== event.pointerId) return;
      const travelled = Math.hypot(event.clientX - armed.x, event.clientY - armed.y);
      if (travelled > PRESS_SLOP_PX) return;
      if (controlUnder(event.target) !== armed.control) return;
      manager.play(PARLOUR_SFX.uiPress);
    };

    // Fired the moment the browser claims the gesture for scrolling — the one
    // unambiguous signal that this touch was never going to be a press.
    const onPointerCancel = () => {
      pending = null;
    };

    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerCancel, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [manager]);

  return null;
}
