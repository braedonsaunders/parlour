'use client';

import { useState } from 'react';
import type { MultiplayerRoomSnapshot } from '@/app/_multiplayer/roomSession';
import { useT } from '@/lib/i18n';

export type LobbySeat = {
  seat: number;
  name: string;
  avatar: string;
  bot: boolean;
  connected: boolean;
};

type RoomLobbySnapshot = Pick<
  MultiplayerRoomSnapshot,
  'settings' | 'security' | 'seats' | 'connection' | 'error' | 'listed'
>;

type RoomLobbyProps = {
  snapshot: RoomLobbySnapshot;
  code: string;
  shareUrl: string;
  seats: LobbySeat[];
  isHost: boolean;
  onStart?: () => void | Promise<void>;
  onAddBot?: (seat: number) => void;
  /** Host-only: put this table on the public open-table list, or take it off. */
  onListedChange?: (listed: boolean) => void;
};

export function RoomLobby({
  snapshot,
  code,
  shareUrl,
  seats,
  isHost,
  onStart,
  onAddBot,
  onListedChange,
}: RoomLobbyProps) {
  const t = useT();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [starting, setStarting] = useState(false);
  const occupied = new Map(seats.map((seat) => [seat.seat, seat]));
  const capacity = snapshot.settings?.seats ?? seats.length;
  const liveConnection = snapshot.connection;
  const connection = liveConnection === 'closed' ? 'reconnecting' : liveConnection;
  const error = snapshot.error;

  async function handleStart() {
    if (!onStart || starting) return;
    setStarting(true);
    try {
      await onStart();
    } catch {
      // The session already put the player-facing copy on snapshot.error.
    } finally {
      setStarting(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  async function shareRoom() {
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({
        title: t('room.shareTitle'),
        text: t('room.shareText', { code }),
        url: shareUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCopyState('error');
    }
  }

  return (
    <section className="panel-soft w-full max-w-4xl p-6 shortscape:p-3" aria-labelledby="room-heading">
      <div className="flex flex-wrap items-center justify-between gap-5 shortscape:gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-dusk-200 shortscape:hidden">
            {t('room.codeLabel')}
          </p>
          <h1
            id="room-heading"
            className="text-warm-glow font-display text-6xl font-black tracking-[0.16em] shortscape:text-3xl"
          >
            {code}
          </h1>
          <p className="mt-1 text-sm text-dusk-100 shortscape:mt-0 shortscape:text-xs" role="status">
            {connection === 'connected'
              ? t('room.connected')
              : connection === 'reconnecting'
                ? t('room.reconnecting')
                : t('room.finding')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-fat btn-fat--ghost" type="button" onClick={copyLink}>
            {copyState === 'copied' ? t('room.copied') : t('room.copyLink')}
          </button>
          <button className="btn-fat btn-fat--teal" type="button" onClick={shareRoom}>
            {t('room.share')}
          </button>
        </div>
      </div>

      {copyState === 'error' && (
        <p className="mt-3 text-sm text-hearth-200" role="alert">
          {t('room.shareFailed', { url: shareUrl })}
        </p>
      )}

      <ol className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 shortscape:mt-2 shortscape:gap-2" aria-label={t('room.seatsLabel')}>
        {Array.from({ length: capacity }, (_, seat) => {
          const player = occupied.get(seat);
          return (
            <li
              key={seat}
              className="panel-soft flex min-h-36 flex-col items-center justify-center p-4 text-center shortscape:min-h-20 shortscape:p-2"
            >
              {player ? (
                <>
                  <span className="text-4xl shortscape:text-2xl" aria-hidden="true">
                    {player.avatar}
                  </span>
                  <strong className="mt-2 font-display shortscape:mt-0.5 shortscape:text-sm">
                    {player.name}
                    {player.bot ? ` (${t('room.bot')})` : ''}
                  </strong>
                  <span className="text-xs text-dusk-200">
                    {player.connected ? t('room.ready') : t('room.rejoining')}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl text-dusk-300" aria-hidden="true">
                    ＋
                  </span>
                  <span className="text-sm text-dusk-200">{t('room.openChair')}</span>
                  {isHost && onAddBot && (
                    <button
                      className="mt-2 text-xs font-bold text-hearth-200 underline"
                      type="button"
                      data-testid="add-bot"
                      onClick={() => onAddBot(seat)}
                    >
                      {t('room.addBot')}
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {isHost && onListedChange && (
        <label
          className="panel-soft mt-4 flex cursor-pointer items-start gap-3 p-4 shortscape:mt-2 shortscape:p-2"
          data-testid="list-publicly"
        >
          <input
            type="checkbox"
            checked={snapshot.listed}
            onChange={(event) => onListedChange(event.currentTarget.checked)}
            className="mt-1 size-5 shrink-0 accent-hearth-300"
          />
          <span>
            <strong className="font-display text-dusk-50">{t('room.listPublicly')}</strong>
            <span className="mt-0.5 block text-sm text-dusk-100/85 shortscape:hidden">
              {snapshot.listed ? t('room.listedDetail') : t('room.listPubliclyDetail')}
            </span>
          </span>
        </label>
      )}

      {error && (
        <p className="mt-4 text-sm text-hearth-200" role="alert">
          {error}
        </p>
      )}

      {isHost && (
        <button
          className="btn-fat mt-6 w-full shortscape:mt-2"
          type="button"
          // Addressed by test id, not by label: this button reads "Start match",
          // "Waiting for one more" or "Dealing…" depending on the table, in five
          // languages. A browser suite matching on any of those finds nothing
          // most of the time, which cost three separate debugging sessions.
          data-testid="start-match"
          disabled={starting || seats.length < capacity || connection !== 'connected'}
          onClick={() => void handleStart()}
        >
          {starting
            ? t('table.dealing')
            : seats.length < capacity
              ? t.count('room.waitingFor', capacity - seats.length)
              : t('room.start')}
        </button>
      )}
    </section>
  );
}
