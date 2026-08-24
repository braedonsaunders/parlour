'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { FxEvent } from '@parlour/engine';
import { scopaHowToPlay } from '@parlour/game-scopa';
import { useMatchTension } from '@/lib/audio/tension';
import { SCOPA_MATCH_PACE_MS } from '@/lib/scopa/modes';
import {
  optionsForCard,
  type ScopaPlayOption,
  type ScopaSeatView,
  type ScopaTableView,
} from '@/lib/scopa/view';
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
import styles from '@/styles/scopa.module.css';

export type ScopaTableScreenProps = {
  view: ScopaTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onPlay?: (card: string, take: readonly string[]) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function ScopaTableScreen(props: ScopaTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const deal = useDealPresentation(props.fx, props.fxKey, { reduced: reducedMotion });

  /**
   * The card the player has picked up but not yet committed.
   *
   * Scopa is the one table on the shelf where choosing a card is not the whole
   * move: the same card can often take several different sets off the table, so
   * a card with one option plays immediately and a card with more waits here
   * while the player picks which pile to sweep.
   */
  const [pending, setPending] = useState<string | null>(null);

  const tense = useMatchTension({
    expectedMs: SCOPA_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'scopa',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
  }));

  if (error) return <TableErrorScreen headline="The table lost the thread." message={error} />;
  if (!view) return <TableLoadingScreen copy="Laying out the table…" />;

  const others = view.players.filter((player) => player.seat !== view.localSeat);
  const local = view.players.find((player) => player.seat === view.localSeat);
  const playable = new Set(view.playableCards);
  const choices = pending ? optionsForCard(view.options, pending) : [];
  const highlighted = new Set(choices.length === 1 ? choices[0]!.take : []);

  const commit = (option: ScopaPlayOption) => {
    setPending(null);
    props.onPlay?.(option.card, option.take);
  };

  const pickCard = (card: string) => {
    const forCard = optionsForCard(view.options, card);
    if (forCard.length === 1) commit(forCard[0]!);
    else setPending((current) => (current === card ? null : card));
  };

  return (
    <TableShell rootRef={rootRef} className={styles.screen} dealState={dealStateAttr(deal)}>
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill eyebrow="Scopa" status={view.stageLabel}>
          <span className={styles.hudCluster}>
            <span className={styles.hudStat}>
              <small>Round</small>
              <strong>{view.roundNo}</strong>
            </span>
            <span className={styles.hudStat}>
              <small>To win</small>
              <strong>{view.target}</strong>
            </span>
            <span className={styles.hudStat}>
              <small>Stock</small>
              <strong>{view.stockCount}</strong>
            </span>
          </span>
        </TableTitlePill>
      </TableHud>

      <TablePlayfield
        label="Scopa table"
        seatCount={view.players.length}
        feltMark={<span className={styles.feltMark}>♦</span>}
      >
        <div className={styles.seatRing}>
          {others.map((player, index) => (
            <OpponentSeat key={player.seat} player={player} slot={index} of={others.length} />
          ))}
        </div>

        <div className={styles.tableCards} aria-label="Cards on the table">
          {view.table.length === 0 ? (
            <span className={styles.tableEmpty}>The table is clear</span>
          ) : (
            view.table.map((card) => (
              <span
                key={card}
                className={styles.tableCard}
                data-flight-target={card}
                data-taking={highlighted.has(card) || undefined}
              >
                <PlayingCard card={card} compact />
              </span>
            ))
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
              const canPlay = view.yourTurn && playable.has(card);
              return (
                <HandRailCard
                  key={card}
                  cardId={card}
                  index={index}
                  count={view.hand.length}
                  playable={canPlay}
                >
                  <PlayingCard
                    card={card}
                    disabled={view.yourTurn && !canPlay}
                    actionLabel="Play"
                    onClick={canPlay ? () => pickCard(card) : undefined}
                  />
                </HandRailCard>
              );
            })}
          </HandRail>
        </div>
      )}

      <TableActionRail>
        {view.matchOver ? (
          <p className={styles.matchOver}>
            {view.won === true ? 'You take the match.' : 'The match goes to the table.'}
          </p>
        ) : pending && choices.length > 1 ? (
          <div className={styles.choices}>
            <p className={styles.prompt}>Take which?</p>
            <div className={styles.choiceRow}>
              {choices.map((option, index) => (
                <button
                  key={`${option.card}-${index}`}
                  type="button"
                  className={`${styles.choice} btn-fat`}
                  onClick={() => commit(option)}
                >
                  {option.take.length === 0 ? (
                    <span className={styles.choiceLabel}>Lay it down</span>
                  ) : (
                    <span className={styles.choiceCards}>
                      {option.take.map((card) => (
                        <PlayingCard key={card} card={card} compact />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" className={styles.cancel} onClick={() => setPending(null)}>
              pick a different card
            </button>
          </div>
        ) : view.yourTurn ? (
          <p className={styles.prompt}>Play a card — match a card, or the sum of several.</p>
        ) : (
          <p className={styles.waiting} aria-live="polite">
            {props.busy ? 'Waiting for the table…' : 'Dealing…'}
          </p>
        )}
      </TableActionRail>

      <TableMenu
        open={menu.isOpen}
        onClose={menu.close}
        onQuit={menu.quit}
        howToPlay={{ doc: scopaHowToPlay, title: 'Scopa', subtitle: 'the fishing game' }}
      />
    </TableShell>
  );
}

function OpponentSeat({ player, slot, of }: { player: ScopaSeatView; slot: number; of: number }) {
  const style = {
    ['--seat-slot' as string]: String(slot),
    ['--seat-of' as string]: String(of),
  } as CSSProperties;
  return (
    <div className={styles.seat} style={style} data-turn={player.isTurn || undefined}>
      <div className={styles.seatCards} aria-hidden="true">
        {Array.from({ length: Math.min(player.handCount, 5) }, (_, index) => (
          <PlayingCard key={index} faceDown compact />
        ))}
      </div>
      <SeatBadge player={player} />
    </div>
  );
}

function SeatBadge({ player }: { player: ScopaSeatView }) {
  return (
    <div className={styles.seatBadge}>
      <AvatarBadge avatarId={player.avatarId} size={28} />
      <span className={styles.seatText}>
        <strong>{player.name}</strong>
        <small>
          {player.score} pts · {player.captured} taken
        </small>
      </span>
      {player.scope > 0 && (
        <span className={styles.scopeChip} aria-label={`${player.scope} scope`}>
          {player.scope}★
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
