'use client';

import { useEffect, useRef, useState } from 'react';
import type { FxEvent, LegalMove } from '@parlour/engine';
import { AvatarBadge } from '@/components/AvatarBadge';
import { HandRail, HandRailCard } from '@/components/table/HandRail';
import {
  SeatNameplate,
  TableErrorScreen,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useTableAudio } from '../fx-animation';
import { SCOPA_SFX_PACK } from '@/lib/audio/sfx';
import { playOptionsFor, type ScopaCardView, type ScopaTableView } from '@/lib/scopa/view';
import styles from '@/styles/scopa.module.css';

export interface ScopaTableScreenProps {
  view: ScopaTableView | null;
  legal?: readonly LegalMove[];
  fx: readonly FxEvent[];
  fxKey: number | string;
  busy?: boolean;
  error?: string | null;
  onPlay?: (move: LegalMove) => void;
  onQuit?: () => void;
}

const SUIT_GLYPH: Record<string, string> = {
  denari: '●',
  coppe: '♥',
  spade: '♠',
  bastoni: '♣',
};

export function ScopaTableScreen({
  view,
  legal = [],
  fx,
  fxKey,
  busy = false,
  error = null,
  onPlay,
  onQuit,
}: ScopaTableScreenProps) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  useTableAudio(fx, fxKey, SCOPA_SFX_PACK.id);

  const [held, setHeld] = useState<string | null>(null);

  /*
   * A held card is only held while the rules still offer it.
   *
   * Derived rather than cleared in an effect: setting state from an effect on
   * every accepted move cascades a render, and a selection that outlived the
   * move that invalidated it would offer a capture the table no longer has.
   */
  const playable = new Set(view?.playable ?? []);
  const selected = held !== null && playable.has(held) ? held : null;
  const options = playOptionsFor(legal, selected, view?.table.length ?? 0);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeld(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  useGameTextSurface(() => {
    if (error) return { game: 'scopa', status: 'error', error };
    if (!view) return { game: 'scopa', status: 'loading', error: null };
    return {
      game: 'scopa',
      status: view.status,
      round: view.roundNo,
      target: view.target,
      yourTurn: view.isLocalTurn,
      held: selected,
      table: view.table.map((card) => card.card),
      hand: view.hand.map((card) => card.card),
      options: options.map((option) => (option.pose ? 'pose' : option.take.join('+'))),
      seats: view.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        score: seat.score,
        captured: seat.captured,
        scope: seat.scope,
      })),
      error: null,
    };
  });

  if (error) {
    return <TableErrorScreen headline="The Scopa table lost the thread." message={error} />;
  }
  if (!view) return <TableLoadingScreen copy="Turning four cards onto the felt…" />;

  const local = view.seats.find((seat) => seat.isLocal) ?? null;
  const others = view.seats.filter((seat) => !seat.isLocal);
  // Every table card any offered capture would take; the rest dim while held.
  const reachable = new Set(options.flatMap((option) => option.take));

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      menu={menu}
      hud={
        <TableTitlePill eyebrow="Scopa" status={view.stageLabel}>
          <span className={styles.stock}>
            stock <b>{view.stockCount}</b>
          </span>
        </TableTitlePill>
      }
    >
      <TablePlayfield label="Scopa table" feltMark="S" className={styles.playfield}>
        <div
          className={styles.board}
          data-testid="scopa-board"
          data-holding={selected !== null || undefined}
        >
          <ol className={styles.seats}>
            {others.map((seat) => (
              <li key={seat.seat} className={styles.seat} data-turn={seat.isTurn || undefined}>
                <AvatarBadge avatarId={seat.avatarId} size="clamp(2.2rem, 3.8vw, 3.2rem)" />
                <SeatNameplate name={seat.name} isBot={seat.isBot} />
                <p className={styles.pips} data-testid={`scopa-seat-${seat.seat}`}>
                  <span>
                    {seat.score}
                    <small>pts</small>
                  </span>
                  <span>
                    {seat.captured}
                    <small>taken</small>
                  </span>
                  <span>
                    {seat.handCount}
                    <small>hand</small>
                  </span>
                </p>
              </li>
            ))}
          </ol>

          <ul className={styles.table} data-testid="scopa-table" aria-label="Cards on the table">
            {view.table.map((card) => (
              <li key={card.card}>
                <ScopaCard
                  card={card}
                  dim={selected !== null && !reachable.has(card.card)}
                  testid={`scopa-table-${card.card}`}
                />
              </li>
            ))}
            {view.table.length === 0 ? (
              <li className={styles.tableEmpty} aria-label="The table is empty">
                felt is clear
              </li>
            ) : null}
          </ul>

          {selected !== null && options.length > 0 ? (
            <div className={styles.chooser} role="group" aria-label="Choose what to take">
              {/*
                The sum capture is the decision this table exists for. When a
                card matches several combinations the rules treat each as its
                own move, so each gets its own button rather than the table
                guessing which one you meant.
              */}
              <p className={styles.chooserPrompt}>
                {options.length === 1
                  ? options[0]!.pose
                    ? 'Nothing matches — lay it down.'
                    : 'One capture available.'
                  : `${options.length} ways to play it.`}
              </p>
              <div className={styles.chooserButtons}>
                {options.map((option) => (
                  <button
                    key={option.pose ? 'pose' : option.take.join('+')}
                    type="button"
                    className={styles.takeButton}
                    data-pose={option.pose || undefined}
                    data-scopa={option.scopa || undefined}
                    data-testid={option.pose ? 'scopa-pose' : `scopa-take-${option.take.join('+')}`}
                    disabled={busy}
                    onClick={() => {
                      setHeld(null);
                      onPlay?.(option.move);
                    }}
                  >
                    {option.pose ? (
                      <span>lay it down</span>
                    ) : (
                      <>
                        <span>
                          take {option.take.map((card) => captureLabel(card)).join(' + ')}
                        </span>
                        {option.scopa ? <em>scopa!</em> : null}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {local ? (
            <div className={styles.localRow}>
              <AvatarBadge avatarId={local.avatarId} size="clamp(2.2rem, 3.8vw, 3.2rem)" />
              <SeatNameplate name={local.name} />
              <p className={styles.pips} data-testid="scopa-seat-0">
                <span>
                  {local.score}
                  <small>pts</small>
                </span>
                <span>
                  {local.captured}
                  <small>taken</small>
                </span>
                <span>
                  {local.scope}
                  <small>scope</small>
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <HandRail count={view.hand.length} zone={`hand:${view.localSeat}`} label="Your hand">
          {view.hand.map((card, index) => (
            <HandRailCard
              key={card.card}
              cardId={card.card}
              index={index}
              count={view.hand.length}
              playable={playable.has(card.card)}
              justDrawn={selected === card.card}
            >
              <button
                type="button"
                className={styles.handCard}
                data-held={selected === card.card ? '' : undefined}
                disabled={busy || !playable.has(card.card)}
                onClick={() => setHeld(selected === card.card ? null : card.card)}
                aria-label={`${selected === card.card ? 'Put back' : 'Choose'} ${captureLabel(card.card)}`}
              >
                <ScopaCard card={card} />
              </button>
            </HandRailCard>
          ))}
        </HandRail>
      </TablePlayfield>

      <span hidden data-fx-key={String(fxKey)} data-fx-count={fx.length} />
    </TableScreenFrame>
  );
}

/** "7 of coins" reads better than a card id in a button or a label. */
function captureLabel(card: string): string {
  const [suit, value] = card.split('-');
  return `${value ?? ''}${SUIT_GLYPH[suit ?? ''] ?? ''}`;
}

function ScopaCard({
  card,
  dim = false,
  testid,
}: {
  card: ScopaCardView;
  dim?: boolean;
  testid?: string;
}) {
  return (
    <span
      className={styles.face}
      data-suit={card.suit}
      data-dim={dim || undefined}
      data-settebello={card.settebello || undefined}
      data-testid={testid}
      aria-label={`${card.value} of ${card.suit}`}
    >
      <b>{card.label}</b>
      <small aria-hidden="true">{SUIT_GLYPH[card.suit] ?? ''}</small>
    </span>
  );
}
