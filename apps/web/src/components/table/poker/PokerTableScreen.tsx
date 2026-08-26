'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { FxEvent } from '@parlour/engine';
import { pokerHowToPlay } from '@parlour/game-poker';
import { POKER_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { POKER_MATCH_PACE_MS, formatChips } from '@/lib/poker/modes';
import type { PokerSeatView, PokerTableView } from '@/lib/poker/view';
import { useMusicMood } from '@/stores/audio';
import { useProfileStore } from '@/stores/profile';
import { useDealPresentation } from '@/lib/table/deal-presentation';
import { useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import {
  TableActionRail,
  TableErrorScreen,
  TableFxLayer,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  dealStateAttr,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import styles from '@/styles/poker.module.css';

export type PokerTableScreenProps = {
  view: PokerTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onFold?: () => void;
  onCheck?: () => void;
  onCall?: () => void;
  onBet?: (to: number) => void;
  onRaise?: (to: number) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function PokerTableScreen(props: PokerTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const deal = useDealPresentation(props.fx, props.fxKey, { reduced: reducedMotion });
  useTableAudio(props.fx, props.fxKey, POKER_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: POKER_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'poker',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
  }));

  if (error) return <TableErrorScreen headline="The table lost the thread." message={error} />;
  if (!view) return <TableLoadingScreen copy="Setting out the chips…" />;

  const seated = view.players.filter((player) => !player.out || player.seat === view.localSeat);
  const others = seated.filter((player) => player.seat !== view.localSeat);
  const local = view.players.find((player) => player.seat === view.localSeat);
  const committed = local ? local.bet : 0;

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={dealStateAttr(deal)}
      menu={menu}
      hud={
        <TableTitlePill eyebrow="Poker" status={view.streetLabel}>
          <span className={styles.hudChips}>
            <span className={styles.hudStat} data-you>
              <small>Your chips</small>
              <strong>{formatChips(local?.stack ?? 0)}</strong>
            </span>
            <span className={styles.hudStat}>
              <small>Blinds</small>
              <strong>
                {formatChips(view.smallBlind)}/{formatChips(view.bigBlind)}
                {view.ante > 0 ? ` + ${formatChips(view.ante)}` : ''}
              </strong>
            </span>
            <span className={styles.hudStat}>
              <small>Hand</small>
              <strong>{view.handNo}</strong>
            </span>
          </span>
        </TableTitlePill>
      }
      howToPlay={{ doc: pokerHowToPlay, title: 'Poker', subtitle: 'no-limit hold’em' }}
    >
      <TablePlayfield
        label="Poker table"
        seatCount={view.players.length}
        feltMark={<span className={styles.feltMark}>♠</span>}
      >
        <div className={styles.seatRing} data-seats={view.players.length}>
          {others.map((player, index) => (
            <OpponentSeat
              key={player.seat}
              player={player}
              slot={index}
              of={others.length}
              showdown={view.street === 'hand-over'}
            />
          ))}
        </div>

        <div className={styles.centre}>
          <Board cards={view.board} highlight={view.bestFive} />
          <div className={styles.pot} aria-live="polite">
            <small>Pot</small>
            <strong>{formatChips(view.pot)}</strong>
          </div>
          {view.lastHand && view.street === 'hand-over' && <HandResult view={view} />}
        </div>

        <TableFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          reduced={reducedMotion}
          // The board and the chip bubbles already narrate this table, so the
          // shared layer only carries card flights.
          renderCue={() => null}
        />
      </TablePlayfield>

      {local && (
        <div className={styles.localStrip}>
          <div className={styles.localStack}>
            {/* The stack lives in the readout beside it, so the local badge
                carries only the name and the button. */}
            <SeatBadge player={local} hideStack />
            <span className={styles.stackReadout}>
              <small>Stack</small>
              <strong>{formatChips(local.stack)}</strong>
            </span>
            {committed > 0 && (
              <span className={styles.stackReadout} data-wagered>
                <small>In front</small>
                <strong>{formatChips(committed)}</strong>
              </span>
            )}
          </div>
          <HandRail
            count={view.hand.length}
            zone="hand:0"
            label="Your cards"
            dealState={deal.dealing ? 'dealing' : 'complete'}
            fanPlan={view.hand}
          >
            {view.hand.map((card, index) => (
              <HandRailCard key={card} cardId={card} index={index} count={view.hand.length}>
                <PlayingCard card={card} />
              </HandRailCard>
            ))}
          </HandRail>
          {view.handLabel && <p className={styles.handLabel}>{view.handLabel}</p>}
        </div>
      )}

      <TableActionRail>
        <BettingControls
          view={view}
          busy={props.busy}
          onFold={props.onFold}
          onCheck={props.onCheck}
          onCall={props.onCall}
          onBet={props.onBet}
          onRaise={props.onRaise}
        />
      </TableActionRail>
    </TableScreenFrame>
  );
}

function Board({ cards, highlight }: { cards: readonly string[]; highlight: readonly string[] }) {
  const marked = new Set(highlight);
  return (
    <div className={styles.board} aria-label="Community cards">
      {Array.from({ length: 5 }, (_, index) => {
        const card = cards[index];
        // Both the empty slot and the dealt card carry the zone, so a flight
        // aimed at `board:2` has somewhere to land whether or not the card has
        // reached the DOM yet.
        if (!card) {
          return (
            <span
              key={`slot-${index}`}
              className={styles.boardSlot}
              data-zone={`board:${index}`}
              aria-hidden="true"
            />
          );
        }
        return (
          <span
            key={card}
            className={styles.boardCard}
            data-zone={`board:${index}`}
            data-flight-target={card}
            data-in-hand={marked.has(card) || undefined}
          >
            <PlayingCard card={card} compact />
          </span>
        );
      })}
    </div>
  );
}

function OpponentSeat({
  player,
  slot,
  of,
  showdown,
}: {
  player: PokerSeatView;
  slot: number;
  of: number;
  showdown: boolean;
}) {
  const style = {
    ['--seat-slot' as string]: String(slot),
    ['--seat-of' as string]: String(of),
  } as CSSProperties;

  return (
    <div
      className={styles.seat}
      style={style}
      data-folded={player.folded || undefined}
      data-out={player.out || undefined}
      data-turn={player.isTurn || undefined}
    >
      <div className={styles.seatCards}>
        {player.hole.map((card, index) =>
          player.holeFaceUp ? (
            <PlayingCard key={`${player.seat}-${card}-${index}`} card={card} compact />
          ) : (
            <PlayingCard key={`${player.seat}-back-${index}`} faceDown compact />
          ),
        )}
      </div>
      <SeatBadge player={player} />
      {player.lastAction && !showdown && (
        <span className={styles.actionBubble}>{player.lastAction}</span>
      )}
      {player.handLabel && showdown && (
        <span className={styles.showdownLabel}>{player.handLabel}</span>
      )}
      {player.bet > 0 && (
        <span className={styles.seatBet} aria-label={`${player.name} has bet`}>
          {formatChips(player.bet)}
        </span>
      )}
    </div>
  );
}

function SeatBadge({ player, hideStack }: { player: PokerSeatView; hideStack?: boolean }) {
  return (
    <div className={styles.seatBadge}>
      <AvatarBadge avatarId={player.avatarId} size={28} />
      <span className={styles.seatText}>
        <strong>{player.name}</strong>
        {!hideStack && (
          <small>
            {player.out ? `Out · ${ordinal(player.place)}` : formatChips(player.stack)}
            {player.allIn && !player.out ? ' · all in' : ''}
          </small>
        )}
        {hideStack && player.allIn && <small>all in</small>}
      </span>
      {player.isButton && (
        <span className={styles.buttonChip} aria-label="Dealer button">
          D
        </span>
      )}
    </div>
  );
}

function ordinal(place: number | null): string {
  if (place === null) return '—';
  const suffix =
    place % 10 === 1 && place !== 11
      ? 'st'
      : place % 10 === 2 && place !== 12
        ? 'nd'
        : place % 10 === 3 && place !== 13
          ? 'rd'
          : 'th';
  return `${place}${suffix}`;
}

function HandResult({ view }: { view: PokerTableView }) {
  const summary = view.lastHand;
  if (!summary) return null;
  const winners = [...new Set(summary.awards.map((award) => award.seat))];
  const names = winners
    .map((seat) => view.players.find((player) => player.seat === seat)?.name ?? `Seat ${seat + 1}`)
    .join(' & ');
  const best = summary.shown.find((entry) => !entry.mucked && entry.rank);
  return (
    <div className={styles.handResult} role="status">
      <strong>{names || 'Nobody'} takes it</strong>
      {summary.walkover ? (
        <small>everyone folded</small>
      ) : (
        best && <small>{best.rank?.label}</small>
      )}
    </div>
  );
}

/**
 * Fold / check / call and the raise control.
 *
 * The rules accept any whole number between the minimum raise and a shove, so
 * the slider is the real control and the ladder buttons are shortcuts onto it —
 * not the other way round. That keeps a player who wants to bet 137 able to.
 */
function BettingControls({
  view,
  busy,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
}: Pick<PokerTableScreenProps, 'busy' | 'onFold' | 'onCheck' | 'onCall' | 'onBet' | 'onRaise'> & {
  view: PokerTableView;
}) {
  const action = view.action;
  const min = action?.minRaiseTo ?? 0;
  const max = action?.maxRaiseTo ?? 0;

  // The slider belongs to one betting decision. Rather than resetting it from
  // an effect — which costs a second render every time the action moves — the
  // pending amount carries the spot it was chosen for, and any other spot
  // simply reads as the minimum.
  const spot = `${view.handNo}:${view.street}:${min}:${max}`;
  const [pending, setPending] = useState<{ spot: string; to: number } | null>(null);
  const chosen = pending?.spot === spot ? pending.to : min;
  const setAmount = (to: number) => setPending({ spot, to });

  if (view.matchOver) {
    return (
      <p className={styles.matchOver}>
        {view.won === true ? 'You took every chip.' : 'You are out.'}
      </p>
    );
  }

  if (!action) {
    return (
      <p className={styles.waiting} aria-live="polite">
        {busy ? 'Waiting for the table…' : 'Dealing…'}
      </p>
    );
  }

  const raiseTo = Math.max(min, Math.min(max, chosen));
  const commit = () => (view.currentBet === 0 ? onBet?.(raiseTo) : onRaise?.(raiseTo));

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        {action.canFold && (
          <button type="button" className="btn-fat btn-fat--ghost" onClick={onFold}>
            Fold
          </button>
        )}
        {action.canCheck && (
          <button type="button" className="btn-fat" onClick={onCheck}>
            Check
          </button>
        )}
        {action.canCall && (
          <button type="button" className="btn-fat" onClick={onCall}>
            Call {formatChips(action.callAmount)}
          </button>
        )}
        {action.canRaise && (
          <button type="button" className="btn-fat btn-fat--teal" onClick={commit}>
            {action.raiseVerb === 'bet' ? 'Bet' : 'Raise to'} {formatChips(raiseTo)}
          </button>
        )}
      </div>

      {action.canRaise && max > min && (
        <div className={styles.raiseRow}>
          <input
            type="range"
            className={styles.slider}
            min={min}
            max={max}
            step={1}
            value={raiseTo}
            aria-label="Amount to raise to"
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          <div className={styles.ladder}>
            {action.raiseOptions.map((option) => (
              <button
                key={option.to}
                type="button"
                className={styles.ladderButton}
                data-selected={option.to === raiseTo || undefined}
                onClick={() => setAmount(option.to)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
