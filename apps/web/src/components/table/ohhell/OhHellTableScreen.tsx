'use client';

import { useRef } from 'react';
import type { FxEvent } from '@parlour/engine';
import { PlayingCard } from '@/components/table/PlayingCard';
import { HandRail, HandRailCard } from '@/components/table/HandRail';
import { AvatarBadge } from '@/components/AvatarBadge';
import { OHHELL_SFX_PACK } from '@/lib/audio/sfx';
import { useTableAudio } from '../fx-animation';
import {
  OpponentFan,
  SeatNameplate,
  TableErrorScreen,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import type { OhHellTableView } from '@/lib/ohhell/view';
import styles from '@/styles/ohhell.module.css';

export interface OhHellTableScreenProps {
  view: OhHellTableView | null;
  fx: readonly FxEvent[];
  fxKey: number | string;
  busy?: boolean;
  error?: string | null;
  onBid?: (bid: number) => void;
  onChooseTrump?: (suit: string) => void;
  onPlay?: (card: string) => void;
  onNextRound?: () => void;
  onQuit?: () => void;
}

const SUIT_GLYPH: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function OhHellTableScreen({
  view,
  fx,
  fxKey,
  busy = false,
  error = null,
  onBid,
  onChooseTrump,
  onPlay,
  onNextRound,
  onQuit,
}: OhHellTableScreenProps) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  useTableAudio(fx, fxKey, OHHELL_SFX_PACK.id);

  useGameTextSurface(() => {
    if (error) return { game: 'ohhell', status: 'error', error };
    if (!view) return { game: 'ohhell', status: 'loading', error: null };
    return {
      game: 'ohhell',
      status: view.matchOver ? 'ended' : 'playing',
      round: view.round,
      rounds: view.rounds,
      handSize: view.handSize,
      stage: view.stage,
      trump: view.trumpSuit,
      bidTotal: view.bidTotal,
      tricksAvailable: view.handSize,
      decision: view.decision,
      hand: [...view.hand],
      trick: view.trick.map((play) => `${play.seat}:${play.card}`),
      seats: view.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        bid: seat.bid,
        tricks: seat.tricksWon,
        score: seat.score,
        standing: seat.standing,
        dealer: seat.isDealer,
      })),
      error: null,
    };
  });

  if (error) {
    return <TableErrorScreen headline="The Oh Hell table lost the thread." message={error} />;
  }
  if (!view) return <TableLoadingScreen copy="Turning a card for trump…" />;

  const local = view.seats.find((seat) => seat.isLocal) ?? null;
  const others = view.seats.filter((seat) => !seat.isLocal);
  const playable = new Set(view.playable);

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      menu={menu}
      hud={
        <TableTitlePill eyebrow="Oh Hell!" status={view.stageLabel}>
          <span className={styles.contract} data-testid="ohhell-contract">
            bid <b>{view.bidTotal}</b> of <b>{view.handSize}</b>
            {view.bidTotal === view.handSize ? (
              <em className={styles.evenWarning}> · nobody is safe</em>
            ) : null}
          </span>
        </TableTitlePill>
      }
    >
      <TablePlayfield label="Oh Hell table" feltMark="O" className={styles.playfield}>
        <div className={styles.board} data-testid="ohhell-board">
          <ol className={styles.seats}>
            {others.map((seat) => (
              <li
                key={seat.seat}
                className={styles.seat}
                data-active={seat.seat === view.activeSeat || undefined}
              >
                <OpponentFan
                  count={seat.handCount}
                  max={6}
                  spread={22}
                  renderCard={({ rotation }) => (
                    <PlayingCard faceDown compact rotation={rotation} />
                  )}
                />
                <AvatarBadge avatarId={seat.avatarId} size="clamp(2.6rem, 4.4vw, 3.6rem)" />
                <SeatNameplate name={seat.name} isBot={seat.isBot} />
                <ScorePips seat={seat} handSize={view.handSize} />
              </li>
            ))}
          </ol>

          <div className={styles.centre}>
            <div className={styles.trump} data-testid="ohhell-trump">
              {view.trumpCard ? (
                <PlayingCard card={view.trumpCard} compact />
              ) : (
                <span className={styles.noTrump} aria-label="No trump this round">
                  no
                  <br />
                  trump
                </span>
              )}
              <span className={styles.trumpLabel}>
                {view.trumpSuit ? `${SUIT_GLYPH[view.trumpSuit] ?? ''} trump` : 'no trump'}
              </span>
            </div>

            <ul className={styles.trick} data-testid="ohhell-trick">
              {view.trick.map((play) => (
                <li
                  key={`${play.seat}:${play.card}`}
                  data-seat={play.seat}
                  data-local={play.isLocal || undefined}
                >
                  <PlayingCard card={play.card} compact />
                </li>
              ))}
            </ul>
          </div>
          {view.decision === 'bid' ? (
            <BidRail
              options={view.bidOptions}
              forbidden={view.forbiddenBid}
              handSize={view.handSize}
              busy={busy}
              onBid={onBid}
            />
          ) : null}

          {view.decision === 'trump' ? (
            <div className={styles.actionRail} role="group" aria-label="Name trump">
              <p className={styles.railPrompt}>The flip turned a Wizard — name trump.</p>
              <div className={styles.railButtons}>
                {view.trumpChoices.map((suit) => (
                  <button
                    key={suit}
                    type="button"
                    className={styles.trumpButton}
                    disabled={busy}
                    onClick={() => onChooseTrump?.(suit)}
                    aria-label={`Name ${suit} trump`}
                  >
                    <span aria-hidden="true">{SUIT_GLYPH[suit] ?? ''}</span>
                    <small>{suit}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {local ? (
            <div className={styles.localRow}>
              <AvatarBadge avatarId={local.avatarId} size="clamp(2.6rem, 4.4vw, 3.6rem)" />
              <SeatNameplate name={local.name} />
              <ScorePips seat={local} handSize={view.handSize} />
            </div>
          ) : null}
        </div>

        <HandRail count={view.hand.length} zone={`hand:${view.localSeat}`} label="Your hand">
          {view.hand.map((card, index) => (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={view.hand.length}
              playable={playable.has(card)}
            >
              <PlayingCard
                card={card}
                actionLabel="Play"
                disabled={busy || !playable.has(card)}
                onClick={playable.has(card) ? () => onPlay?.(card) : undefined}
              />
            </HandRailCard>
          ))}
        </HandRail>

        {view.roundOver && !view.matchOver ? (
          <div className={styles.roundEnd} data-testid="ohhell-round-end">
            <h2>Round {view.round} scored</h2>
            <ul>
              {view.seats.map((seat) => (
                <li key={seat.seat} data-standing={seat.standing}>
                  <b>{seat.name}</b> bid {seat.bid ?? 0}, took {seat.tricksWon} ·{' '}
                  <span>{seat.score}</span>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.nextRound} onClick={() => onNextRound?.()}>
              Deal round {Math.min(view.round + 1, view.rounds)}
            </button>
          </div>
        ) : null}
      </TablePlayfield>

      <span hidden data-fx-key={String(fxKey)} data-fx-count={fx.length} />
    </TableScreenFrame>
  );
}

/**
 * A seat's bid, its tricks so far, and its running score.
 *
 * `standing` is what makes the row worth reading: in Oh Hell being *over* your
 * bid is as bad as being under, and a table that only shows tricks taken makes
 * the player do that subtraction every trick.
 */
function ScorePips({
  seat,
  handSize,
}: {
  seat: OhHellTableView['seats'][number];
  handSize: number;
}) {
  return (
    <p
      className={styles.pips}
      data-standing={seat.standing}
      data-testid={`ohhell-seat-${seat.seat}`}
    >
      <span className={styles.bid}>
        {seat.bid === null ? '—' : seat.bid}
        <small>bid</small>
      </span>
      <span className={styles.tricks}>
        {seat.tricksWon}
        <small>of {handSize}</small>
      </span>
      <span className={styles.score}>
        {seat.score}
        <small>pts</small>
      </span>
    </p>
  );
}

function BidRail({
  options,
  forbidden,
  handSize,
  busy,
  onBid,
}: {
  options: readonly number[];
  forbidden: number | null;
  handSize: number;
  busy: boolean;
  onBid?: (bid: number) => void;
}) {
  return (
    <div className={styles.actionRail} role="group" aria-label="Place your bid">
      <p className={styles.railPrompt}>
        How many of the {handSize} will you take?
        {forbidden === null ? null : (
          <em className={styles.hooked}>
            {' '}
            {forbidden} is hooked — the dealer cannot make it even.
          </em>
        )}
      </p>
      <div className={styles.railButtons}>
        {options.map((bid) => (
          <button
            key={bid}
            type="button"
            className={styles.bidButton}
            disabled={busy}
            onClick={() => onBid?.(bid)}
            aria-label={`Bid ${bid}`}
            data-testid={`ohhell-bid-${bid}`}
          >
            {bid}
          </button>
        ))}
      </div>
    </div>
  );
}
