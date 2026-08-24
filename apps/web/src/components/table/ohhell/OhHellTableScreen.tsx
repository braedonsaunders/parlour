'use client';

import { useRef, type CSSProperties } from 'react';
import type { FxEvent } from '@parlour/engine';
import { ohhellHowToPlay } from '@parlour/game-ohhell';
import { useMatchTension } from '@/lib/audio/tension';
import { OHHELL_MATCH_PACE_MS } from '@/lib/ohhell/modes';
import { SUIT_GLYPHS, cardBadge, type OhHellSeatView, type OhHellTableView } from '@/lib/ohhell/view';
import { useMusicMood } from '@/stores/audio';
import { useProfileStore } from '@/stores/profile';
import { useDealPresentation } from '@/lib/table/deal-presentation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { TableMenu } from '../TableMenu';
import {
  TableActionRail,
  TableErrorScreen,
  TableFxLayer,
  TableHud,
  TableLoadingScreen,
  TablePlayfield,
  TableShell,
  TableTitlePill,
  dealStateAttr,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import styles from '@/styles/ohhell.module.css';

export type OhHellTableScreenProps = {
  view: OhHellTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onBid?: (bid: number) => void;
  onPlay?: (card: string) => void;
  onChooseTrump?: (suit: string) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function OhHellTableScreen(props: OhHellTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const deal = useDealPresentation(props.fx, props.fxKey, { reduced: reducedMotion });

  const tense = useMatchTension({
    expectedMs: OHHELL_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'ohhell',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
  }));

  if (error) return <TableErrorScreen headline="The table lost the thread." message={error} />;
  if (!view) return <TableLoadingScreen copy="Cutting for the deal…" />;

  const others = view.players.filter((player) => player.seat !== view.localSeat);
  const local = view.players.find((player) => player.seat === view.localSeat);
  const legal = new Set(view.legalCards);

  return (
    <TableShell rootRef={rootRef} className={styles.screen} dealState={dealStateAttr(deal)}>
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill eyebrow="Oh Hell" status={view.stageLabel}>
          <span className={styles.hudCluster}>
            <span className={styles.hudStat}>
              <small>Round</small>
              <strong>
                {view.roundNo}/{view.totalRounds}
              </strong>
            </span>
            <span className={styles.hudStat}>
              <small>Cards</small>
              <strong>{view.handSize}</strong>
            </span>
            <span className={styles.hudStat}>
              <small>Trump</small>
              <strong className={styles.trumpGlyph} data-suit={view.trumpSuit ?? 'none'}>
                {view.trumpSuit ? (SUIT_GLYPHS[view.trumpSuit] ?? '?') : 'none'}
              </strong>
            </span>
          </span>
        </TableTitlePill>
      </TableHud>

      <TablePlayfield
        label="Oh Hell table"
        seatCount={view.players.length}
        feltMark={<span className={styles.feltMark}>{view.trumpSuit ? SUIT_GLYPHS[view.trumpSuit] : '♠'}</span>}
      >
        <div className={styles.seatRing}>
          {others.map((player, index) => (
            <OpponentSeat key={player.seat} player={player} slot={index} of={others.length} />
          ))}
        </div>

        <div className={styles.centre}>
          <div className={styles.trickZone} aria-label="Current trick">
            {view.trick.length === 0 ? (
              <span className={styles.trickEmpty}>
                {view.stage === 'bidding' ? 'Everyone bids first' : 'Lead a card'}
              </span>
            ) : (
              view.trick.map((play) => (
                <span key={play.card} className={styles.trickCard} data-flight-target={play.card}>
                  <PlayingCard card={play.card} compact />
                  <small>{view.players[play.seat]?.name ?? `Seat ${play.seat + 1}`}</small>
                </span>
              ))
            )}
          </div>
          {view.trumpCard && (
            <div className={styles.trumpCard}>
              <small>Turned</small>
              <PlayingCard card={view.trumpCard} compact />
            </div>
          )}
        </div>

        <TableFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          reduced={reducedMotion}
          renderCue={() => null}
        />
      </TablePlayfield>

      {local && (
        <div className={styles.localStrip}>
          <SeatBadge player={local} />
          <HandRail
            count={view.hand.length}
            zone={`hand:${view.localSeat}`}
            label="Your hand"
            dealState={deal.dealing ? 'dealing' : 'complete'}
            fanPlan={view.hand}
          >
            {view.hand.map((card, index) => {
              const playable = view.decision === 'play' && legal.has(card);
              return (
                <HandRailCard
                  key={card}
                  cardId={card}
                  index={index}
                  count={view.hand.length}
                  playable={playable}
                >
                  <PlayingCard
                    card={card}
                    disabled={view.decision === 'play' && !playable}
                    actionLabel="Play"
                    onClick={playable ? () => props.onPlay?.(card) : undefined}
                  />
                </HandRailCard>
              );
            })}
          </HandRail>
        </div>
      )}

      <TableActionRail>
        <Decision view={view} busy={props.busy} onBid={props.onBid} onChooseTrump={props.onChooseTrump} />
      </TableActionRail>

      <TableMenu
        open={menu.isOpen}
        onClose={menu.close}
        onQuit={menu.quit}
        howToPlay={{ doc: ohhellHowToPlay, title: 'Oh Hell', subtitle: 'the bidding game' }}
      />
    </TableShell>
  );
}

function OpponentSeat({
  player,
  slot,
  of,
}: {
  player: OhHellSeatView;
  slot: number;
  of: number;
}) {
  const style = {
    ['--seat-slot' as string]: String(slot),
    ['--seat-of' as string]: String(of),
  } as CSSProperties;
  return (
    <div className={styles.seat} style={style} data-turn={player.isTurn || undefined}>
      <div className={styles.seatCards} aria-hidden="true">
        {Array.from({ length: Math.min(player.handCount, 7) }, (_, index) => (
          <PlayingCard key={index} faceDown compact />
        ))}
      </div>
      <SeatBadge player={player} />
    </div>
  );
}

function SeatBadge({ player }: { player: OhHellSeatView }) {
  return (
    <div className={styles.seatBadge}>
      <AvatarBadge avatarId={player.avatarId} size={28} />
      <span className={styles.seatText}>
        <strong>{player.name}</strong>
        <small>{player.score} pts</small>
      </span>
      {player.bid !== null && (
        <span
          className={styles.bidChip}
          data-made={player.onTrack || undefined}
          data-over={player.tricksWon > player.bid || undefined}
          aria-label={`bid ${player.bid}, took ${player.tricksWon}`}
        >
          {player.tricksWon}/{player.bid}
        </span>
      )}
      {player.isDealer && (
        <span className={styles.dealerChip} aria-label="Dealer">
          D
        </span>
      )}
    </div>
  );
}

/**
 * The bid rail, the trump picker, or a line saying whose turn it is.
 *
 * Only one of the three can ever be live, because the engine offers exactly one
 * kind of move at a time — so this reads the decision rather than the stage.
 */
function Decision({
  view,
  busy,
  onBid,
  onChooseTrump,
}: {
  view: OhHellTableView;
  busy?: boolean;
  onBid?: (bid: number) => void;
  onChooseTrump?: (suit: string) => void;
}) {
  if (view.matchOver) {
    return (
      <p className={styles.matchOver}>
        {view.won === true ? 'You take the match.' : 'The match goes to the table.'}
      </p>
    );
  }

  if (view.decision === 'trump') {
    return (
      <div className={styles.decision}>
        <p className={styles.prompt}>A Wizard turned — name trump.</p>
        <div className={styles.suitRow}>
          {view.trumpOptions.map((suit) => (
            <button
              key={suit}
              type="button"
              className={`${styles.suitButton} btn-fat`}
              data-suit={suit}
              onClick={() => onChooseTrump?.(suit)}
            >
              {SUIT_GLYPHS[suit] ?? suit}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view.decision === 'bid') {
    return (
      <div className={styles.decision}>
        <p className={styles.prompt}>
          How many tricks?
          {view.forbiddenBid !== null && (
            <span className={styles.hook}> · {view.forbiddenBid} is hooked</span>
          )}
        </p>
        <div className={styles.bidRow}>
          {view.bidOptions.map((bid) => (
            <button
              key={bid}
              type="button"
              className={`${styles.bidButton} btn-fat`}
              onClick={() => onBid?.(bid)}
            >
              {bid}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view.decision === 'play') {
    return <p className={styles.prompt}>Your lead — pick a card.</p>;
  }

  return (
    <p className={styles.waiting} aria-live="polite">
      {busy ? 'Waiting for the table…' : 'Dealing…'}
    </p>
  );
}

export { cardBadge };
