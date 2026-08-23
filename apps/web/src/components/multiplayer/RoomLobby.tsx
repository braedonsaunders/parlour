'use client';

import { useState } from 'react';

export type LobbySeat = {
  seat: number;
  name: string;
  avatar: string;
  bot: boolean;
  connected: boolean;
};

type RoomLobbyProps = {
  code: string;
  shareUrl: string;
  seats: LobbySeat[];
  capacity: number;
  isHost: boolean;
  connection: 'connecting' | 'connected' | 'reconnecting';
  onStart?: () => void;
  onAddBot?: (seat: number) => void;
};

export function RoomLobby({
  code,
  shareUrl,
  seats,
  capacity,
  isHost,
  connection,
  onStart,
  onAddBot,
}: RoomLobbyProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const occupied = new Map(seats.map((seat) => [seat.seat, seat]));

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
      await navigator.share({ title: 'Join my parlour', text: `Room ${code}`, url: shareUrl });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCopyState('error');
    }
  }

  return (
    <section className="panel-soft w-full max-w-4xl p-6" aria-labelledby="room-heading">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-dusk-200">Room code</p>
          <h1
            id="room-heading"
            className="text-warm-glow font-display text-6xl font-black tracking-[0.16em]"
          >
            {code}
          </h1>
          <p className="mt-1 text-sm text-dusk-100" role="status">
            {connection === 'connected'
              ? 'The table is connected'
              : connection === 'reconnecting'
                ? 'Reconnecting — your seat is saved'
                : 'Finding the table…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-fat btn-fat--ghost" type="button" onClick={copyLink}>
            {copyState === 'copied' ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn-fat btn-fat--teal" type="button" onClick={shareRoom}>
            Share
          </button>
        </div>
      </div>

      {copyState === 'error' && (
        <p className="mt-3 text-sm text-hearth-200" role="alert">
          Couldn’t open sharing. Copy this address manually: {shareUrl}
        </p>
      )}

      <ol className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Table seats">
        {Array.from({ length: capacity }, (_, seat) => {
          const player = occupied.get(seat);
          return (
            <li
              key={seat}
              className="panel-soft flex min-h-36 flex-col items-center justify-center p-4 text-center"
            >
              {player ? (
                <>
                  <span className="text-4xl" aria-hidden="true">
                    {player.avatar}
                  </span>
                  <strong className="mt-2 font-display">
                    {player.name}
                    {player.bot ? ' (bot)' : ''}
                  </strong>
                  <span className="text-xs text-dusk-200">
                    {player.connected ? 'Ready' : 'Rejoining…'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl text-dusk-300" aria-hidden="true">
                    ＋
                  </span>
                  <span className="text-sm text-dusk-200">Open chair</span>
                  {isHost && onAddBot && (
                    <button
                      className="mt-2 text-xs font-bold text-hearth-200 underline"
                      type="button"
                      onClick={() => onAddBot(seat)}
                    >
                      Add bot
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {isHost && (
        <button
          className="btn-fat mt-6 w-full"
          type="button"
          disabled={seats.length < 2 || connection !== 'connected'}
          onClick={onStart}
        >
          Start match
        </button>
      )}
    </section>
  );
}
