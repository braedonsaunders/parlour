'use client';

import { useRef, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { spiteFace, spiteHowToPlay } from '@parlour/game-spite';
import { useMatchTension } from '@/lib/audio/tension';
import { SPITE_MATCH_PACE_MS } from '@/lib/spite/modes';
import {
  buildsForCard,
  discardsForCard,
  rankLabel,
  type SpiteSeatView,
  type SpiteTableView,
} from '@/lib/spite/view';
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
import styles from '@/styles/spite.module.css';

export type SpiteTableScreenProps = {
  view: SpiteTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onBuild?: (card: string, pile: number, rank: number) => void;
  onDiscard?: (card: string, pile: number) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function SpiteTableScreen(props: SpiteTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const deal = useDealPresentation(props.fx, props.fxKey, { reduced: reducedMotion });

  /**
   * The card the player has picked up, waiting for a destination.
   *
   * Spite is a two-part move — take a card, then choose a pile — and the same
   * card can often go to several centre builds or any of your discards. Picking
   * the card first and lighting up its destinations is the only way to make
   * that legible without a drag interaction.
   */
  const [held, setHeld] = useState<string | null>(null);

  const tense = useMatchTension({
    expectedMs: SPITE_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'spite',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
  }));

  if (error) return <TableErrorScreen headline="The table lost the thread." message={error} />;
  if (!view) return <TableLoadingScreen copy="Stacking the payoff piles…" />;

  const local = view.players.find((player) => player.seat === view.localSeat);
  const others = view.players.filter((player) => player.seat !== view.localSeat);
  const movable = new Set(view.movableCards);

  const heldBuilds = held ? buildsForCard(view.builds, held) : [];
  const heldDiscards = held ? discardsForCard(view.discards, held) : [];
  const buildTargets = new Set(heldBuilds.map((option) => option.pile));

  const take = (card: string) => setHeld((current) => (current === card ? null : card));

  const toCentre = (pile: number) => {
    const option = heldBuilds.find((candidate) => candidate.pile === pile);
    if (!option) return;
    setHeld(null);
    props.onBuild?.(option.card, option.pile, option.rank);
  };

  const toDiscard = (pile: number) => {
    const option = heldDiscards.find((candidate) => candidate.pile === pile);
    if (!option) return;
    setHeld(null);
    props.onDiscard?.(option.card, option.pile);
  };

  return (
    <TableShell rootRef={rootRef} className={styles.screen} dealState={dealStateAttr(deal)}>
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill eyebrow="Spite & Malice" status={view.yourTurn ? 'Your turn' : 'Playing'}>
          <span className={styles.hudCluster}>
            <span className={styles.hudStat}>
              <small>Your pile</small>
              <strong>{local?.payoffLeft ?? 0}</strong>
            </span>
            <span className={styles.hudStat}>
              <small>Stock</small>
              <strong>{view.stockCount}</strong>
            </span>
          </span>
        </TableTitlePill>
      </TableHud>

      <TablePlayfield
        label="Spite and Malice table"
        seatCount={view.players.length}
        feltMark={<span className={styles.feltMark}>♠</span>}
      >
        <div className={styles.opponents}>
          {others.map((player) => (
            <OpponentSeat key={player.seat} player={player} />
          ))}
        </div>

        <div className={styles.centre} aria-label="Centre builds">
          {view.centre.map((pile) => {
            const targeted = buildTargets.has(pile.index);
            return (
              <button
                key={pile.index}
                type="button"
                className={styles.centrePile}
                data-target={targeted || undefined}
                disabled={!targeted}
                onClick={() => toCentre(pile.index)}
                aria-label={`Centre pile ${pile.index + 1}, needs ${rankLabel(pile.nextRank)}`}
              >
                {pile.top ? (
                  <PlayingCard card={pile.top} face={spiteFace(pile.top)} compact />
                ) : (
                  <span className={styles.centreEmpty}>{rankLabel(pile.nextRank)}</span>
                )}
                <small className={styles.needs}>needs {rankLabel(pile.nextRank)}</small>
              </button>
            );
          })}
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
          <div className={styles.localPiles}>
            <div className={styles.payoff}>
              <small>Payoff · {local.payoffLeft}</small>
              {local.payoffTop ? (
                <button
                  type="button"
                  className={styles.payoffCard}
                  data-held={held === local.payoffTop || undefined}
                  disabled={!movable.has(local.payoffTop)}
                  onClick={() => take(local.payoffTop as string)}
                >
                  <PlayingCard card={local.payoffTop} face={spiteFace(local.payoffTop)} compact />
                </button>
              ) : (
                <span className={styles.payoffEmpty}>empty</span>
              )}
            </div>

            <div className={styles.discardRow}>
              {local.discardTops.map((top, pile) => {
                const canDrop = heldDiscards.some((option) => option.pile === pile);
                const canTake = top !== null && movable.has(top);
                return (
                  <button
                    key={pile}
                    type="button"
                    className={styles.discardPile}
                    data-target={canDrop || undefined}
                    data-held={top !== null && held === top ? true : undefined}
                    disabled={!canDrop && !canTake}
                    onClick={() => (canDrop ? toDiscard(pile) : top && take(top))}
                    aria-label={`Discard pile ${pile + 1}, ${local.discardCounts[pile] ?? 0} cards`}
                  >
                    {top ? (
                      <PlayingCard card={top} face={spiteFace(top)} compact />
                    ) : (
                      <span className={styles.discardEmpty} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <HandRail
            count={view.hand.length}
            zone={`hand:${view.localSeat}`}
            label="Your hand"
            dealState={deal.dealing ? 'dealing' : 'complete'}
            fanPlan={view.hand}
          >
            {view.hand.map((card, index) => {
              const canMove = view.yourTurn && movable.has(card);
              return (
                <HandRailCard
                  key={card}
                  cardId={card}
                  index={index}
                  count={view.hand.length}
                  playable={canMove}
                >
                  <PlayingCard
                    card={card}
                    disabled={view.yourTurn && !canMove}
                    actionLabel="Take"
                    onClick={canMove ? () => take(card) : undefined}
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
            {view.won === true ? 'You emptied your pile first.' : 'Beaten to it.'}
          </p>
        ) : held ? (
          <p className={styles.prompt}>
            {heldBuilds.length > 0
              ? 'Pick a lit centre pile — or one of your discards to end the turn.'
              : 'Pick a discard pile to end your turn.'}
            <button type="button" className={styles.cancel} onClick={() => setHeld(null)}>
              put it back
            </button>
          </p>
        ) : view.yourTurn ? (
          <p className={styles.prompt}>
            {view.mustDiscard
              ? 'Nothing builds — discard to end your turn.'
              : 'Take a card from your hand, your payoff pile, or a discard.'}
          </p>
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
        howToPlay={{
          doc: spiteHowToPlay,
          title: 'Spite & Malice',
          subtitle: 'the payoff pile race',
        }}
      />
    </TableShell>
  );
}

function OpponentSeat({ player }: { player: SpiteSeatView }) {
  return (
    <div className={styles.seat} data-turn={player.isTurn || undefined}>
      <div className={styles.seatBadge}>
        <AvatarBadge avatarId={player.avatarId} size={28} />
        <span className={styles.seatText}>
          <strong>{player.name}</strong>
          <small>{player.payoffLeft} to go</small>
        </span>
      </div>
      <div className={styles.seatPiles}>
        {player.payoffTop ? (
          <PlayingCard card={player.payoffTop} face={spiteFace(player.payoffTop)} compact />
        ) : (
          <span className={styles.discardEmpty} />
        )}
        {player.discardTops.map((top, pile) => (
          <span key={pile} className={styles.seatDiscard}>
            {top ? <PlayingCard card={top} face={spiteFace(top)} compact /> : <span className={styles.discardEmpty} />}
          </span>
        ))}
      </div>
    </div>
  );
}
