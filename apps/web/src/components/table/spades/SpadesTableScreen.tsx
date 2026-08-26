'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { spadesCatalog } from '@parlour/game-spades';
import { AnimatePresence } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { SPADES_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { SPADES_MATCH_PACE_MS } from '@/lib/spades/modes';
import { useMusicMood } from '@/stores/audio';
import { useProfileStore } from '@/stores/profile';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { bidLabel, bidToken, type SpadesTableView } from '@/lib/spades/view';
import { useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import {
  dealStateAttr,
  OpponentFan,
  SeatNameplate,
  TableCardFlight,
  TableErrorScreen,
  TableFxLayer,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import { SpadesFxLayer, SPADES_TEAM_ACCENTS } from './fx-layer';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/spades.module.css';

const TEAM_ACCENTS = SPADES_TEAM_ACCENTS;

export type SpadesTableScreenProps = {
  view: SpadesTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onBid?: (bid: number) => void;
  onBidNil?: () => void;
  onPlay?: (card: string) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function SpadesTableScreen(props: SpadesTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const deal = useDealPresentation(props.fx, props.fxKey, { reduced: reducedMotion });
  useTableAudio(props.fx, props.fxKey, SPADES_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: SPADES_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'spades',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    stage: view?.stageLabel ?? null,
    decision: view?.decision ?? null,
    handNo: view?.handNo ?? null,
    tricksPlayed: view?.tricksPlayed ?? null,
    dealer: view?.dealer ?? null,
    turn: view?.turn ?? null,
    spadesBroken: view?.spadesBroken ?? null,
    overtime: view?.overtime ?? null,
    ledSuit: view?.ledSuit ?? null,
    scores: view?.scores ?? null,
    bags: view?.bags ?? null,
    contracts: view ? [view.teams[0].contract, view.teams[1].contract] : null,
    bids: view ? view.players.map((player) => bidToken(player.bid)) : null,
    tricksWon: view ? view.players.map((player) => player.tricksWon) : null,
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), spadesCatalog.handOrder)
      : [],
    legalCards: deal.dealing ? [] : (view?.legalCards ?? []),
    bidOptions: deal.dealing ? [] : (view?.bidOptions ?? []),
    canBidNil: view?.canBidNil ?? false,
    targetScore: view?.targetScore ?? null,
    matchOver: view?.matchOver ?? null,
    lastHand: view?.lastHand ?? null,
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Cutting for the first deal…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={dealStateAttr(deal)}
      menu={menu}
      hud={
        <section className={styles.hudCluster}>
          <TableTitlePill eyebrow="Spades" status={view.stageLabel} />
          <TeamScores view={view} />
        </section>
      }
    >
      <TablePlayfield label="Spades table" feltMark="♠">
        <div className={styles.brokenFlag} data-spades-broken={String(view.spadesBroken)}>
          {view.spadesBroken ? '♠ broken' : '♠ not yet broken'}
        </div>
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            active={view.activeSeat === player.seat}
            displayCount={deal.visibleCount(player.seat, player.handCount)}
            bidding={view.stage === 'bidding'}
          />
        ))}
        <TrickZone view={view} />
        <LocalHand view={view} busy={localBusy} onPlay={props.onPlay} deal={deal} />
        {/* Shared flights paint first; named Spades moments stay readable above them. */}
        <SharedCueLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          reduced={reducedMotion}
        />
        <SpadesFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          localSeat={view.localSeat}
          rootRef={rootRef}
          reduced={reducedMotion}
        />
        <LastHandSummary view={view} />
        {view.decision === 'bid' && !localBusy && (
          <BidRail view={view} onBid={props.onBid} onBidNil={props.onBidNil} />
        )}
      </TablePlayfield>
    </TableScreenFrame>
  );
}

function TeamScores({ view }: { view: SpadesTableView }) {
  return (
    <section
      className={styles.teamScores}
      data-team-scores
      aria-label={`Partnership scores, first to ${view.targetScore}`}
    >
      <span className={styles.scoreTarget}>First to {view.targetScore}</span>
      {view.teams.map((team) => (
        <span
          key={team.team}
          className={styles.teamChip}
          data-testid="spades-team"
          data-team={team.team}
          data-bags={team.bags}
          data-contract={team.contract}
          data-tricks={team.tricks}
          style={{ '--team-accent': TEAM_ACCENTS[team.team] } as CSSProperties}
          aria-label={`${team.label}: ${team.score} points, ${team.bags} bag${
            team.bags === 1 ? '' : 's'
          }, ${team.tricks} of ${team.contract} tricks`}
        >
          <strong>{team.score}</strong>
          <small aria-hidden="true">
            {team.label} · {team.tricks}/{team.contract}
          </small>
          <span className={styles.bagRow} aria-hidden="true">
            {view.rules.bags ? (
              <>
                <i className={styles.bagPips} data-bags={team.bags}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <b key={index} data-on={index < team.bags % 10 || undefined} />
                  ))}
                </i>
                <em>{team.bags}</em>
              </>
            ) : (
              <em>no bags</em>
            )}
          </span>
          {team.nilSeats.map((nil) => (
            <span key={nil.seat} className={styles.nilBadge} data-intact={nil.intact || undefined}>
              nil
            </span>
          ))}
        </span>
      ))}
    </section>
  );
}

function Seat({
  player,
  active,
  displayCount,
  bidding,
}: {
  player: SpadesTableView['players'][number];
  active: boolean;
  displayCount: number;
  bidding: boolean;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = {
    '--seat-accent': avatar.accent,
    '--seat-shade': avatar.shade,
    '--team-accent': TEAM_ACCENTS[player.team],
  } as CSSProperties;

  return (
    <div
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`]} ${
        active ? tableStyles.seatActive : ''
      }`}
      style={style}
      data-team={player.team}
    >
      {!player.isLocal && (
        <OpponentFan
          count={displayCount}
          max={6}
          spread={22}
          renderCard={({ rotation }) => <PlayingCard faceDown compact rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      <span
        className={styles.seatBid}
        data-testid="spades-seat-bid"
        data-nil={player.bid?.nil || undefined}
        data-pending={player.bid === null || undefined}
        aria-label={
          player.bid === null
            ? `${player.name} has not bid`
            : player.bid.nil
              ? `${player.name} bid nil, ${player.tricksWon} taken`
              : `${player.name} bid ${player.bid.tricks}, ${player.tricksWon} taken`
        }
      >
        <b aria-hidden="true">{bidLabel(player.bid)}</b>
        {!bidding && (
          <i
            aria-hidden="true"
            data-over={
              (player.bid !== null && !player.bid.nil && player.tricksWon > player.bid.tricks) ||
              undefined
            }
          >
            {player.tricksWon}
          </i>
        )}
      </span>
      {player.isDealer && <span className={styles.dealerChip}>dealer</span>}
    </div>
  );
}

/**
 * The previous hand's scoring, kept on screen.
 *
 * An open table deals the next hand automatically, so the FX sheet that
 * announces a score is gone in about a second and a half — long enough to
 * notice, nowhere near long enough to check the arithmetic on a −100 nil or a
 * bag penalty. `lastHand` survives the auto-deal precisely so this can be read
 * at leisure, so it renders from state, stays until the next hand scores, and
 * is a plain live region rather than an animation.
 */
function LastHandSummary({ view }: { view: SpadesTableView }) {
  const summary = view.lastHand;
  const summaryHandNo = summary?.handNo ?? null;
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (summaryHandNo === null || typeof window.matchMedia !== 'function') return;
    const compact = window.matchMedia(
      '(max-width: 900px), (orientation: landscape) and (max-height: 560px)',
    );
    const followViewport = () => setExpanded(!compact.matches);
    followViewport();
    if (typeof compact.addEventListener === 'function') {
      compact.addEventListener('change', followViewport);
      return () => compact.removeEventListener('change', followViewport);
    }
    compact.addListener?.(followViewport);
    return () => compact.removeListener?.(followViewport);
  }, [summaryHandNo]);

  if (!summary) return null;
  return (
    <section
      className={styles.lastHand}
      data-testid="spades-last-hand"
      data-expanded={expanded}
      aria-label={`Hand ${summary.handNo} scoring`}
      role="status"
    >
      <header className={styles.lastHandHead}>
        <button
          type="button"
          className={styles.lastHandToggle}
          data-testid="spades-last-hand-toggle"
          aria-expanded={expanded}
          aria-controls={`spades-last-hand-rows-${summary.handNo}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <strong>Hand {summary.handNo}</strong>
          <span className={styles.lastHandCompact}>
            {summary.teams
              .map(
                (team) =>
                  `${team.team === view.localSeat % 2 ? 'us' : 'them'} ${team.delta >= 0 ? '+' : ''}${team.delta}`,
              )
              .join(' · ')}
          </span>
          <span className={styles.lastHandChevron} aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
        {view.overtime && (
          <em className={styles.overtimeFlag} data-testid="spades-overtime">
            level at {view.targetScore} — playing on
          </em>
        )}
      </header>
      <ul
        id={`spades-last-hand-rows-${summary.handNo}`}
        className={styles.lastHandRows}
        hidden={!expanded}
      >
        {summary.teams.map((team) => (
          <li
            key={team.team}
            className={styles.lastHandRow}
            data-team={team.team}
            data-made={team.made || undefined}
            data-testid="spades-last-hand-team"
            style={{ '--row-accent': TEAM_ACCENTS[team.team % 2] } as CSSProperties}
          >
            <span className={styles.lastHandVerdict}>
              {team.made ? 'made' : 'set'} {team.nonNilTricks}/{team.contract}
            </span>
            <span className={styles.lastHandDelta}>
              {team.delta >= 0 ? `+${team.delta}` : team.delta}
            </span>
            <span className={styles.lastHandTotal}>{team.scoreAfter}</span>
            <dl className={styles.lastHandDetail}>
              <div>
                <dt>contract</dt>
                <dd>{team.contractDelta >= 0 ? `+${team.contractDelta}` : team.contractDelta}</dd>
              </div>
              {(team.nilDelta !== 0 || team.nilTricks > 0) && (
                <div>
                  <dt>nil</dt>
                  <dd>
                    {team.nilDelta >= 0 ? `+${team.nilDelta}` : team.nilDelta}
                    {team.nilTricks > 0 &&
                      ` (${team.nilTricks} trick${team.nilTricks === 1 ? '' : 's'} taken)`}
                  </dd>
                </div>
              )}
              <div>
                <dt>overtricks</dt>
                <dd>{team.overtricks}</dd>
              </div>
              <div>
                <dt>bags</dt>
                <dd>
                  {team.bagsTaken} this hand · {team.bagsAfter} on the card
                </dd>
              </div>
              {team.bagPenalty > 0 && (
                <div data-testid="spades-bag-penalty">
                  <dt>bag penalty</dt>
                  <dd>−{team.bagPenalty} points</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrickZone({ view }: { view: SpadesTableView }) {
  return (
    <div className={styles.trickZone} data-zone="trick" aria-label="Current trick">
      {view.trick.map((play) => (
        <span
          key={play.seat}
          className={styles.trickCard}
          data-seat={play.seat}
          data-team={play.seat % 2}
        >
          <PlayingCard card={play.card} />
        </span>
      ))}
    </div>
  );
}

function LocalHand({
  view,
  busy,
  onPlay,
  deal,
}: {
  view: SpadesTableView;
  busy: boolean;
  onPlay?: (card: string) => void;
  deal: DealPresentation;
}) {
  const visibleHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    spadesCatalog.handOrder,
  );
  const interactive = !busy && view.decision === 'play';
  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={dealStateAttr(deal)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleHand.map((card, index) => {
          const playable = view.legalCards.includes(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={interactive ? playable : undefined}
            >
              {/* data-card lives here rather than on the shared PlayingCard so
                  Spades gets a stable per-card selector without changing the
                  chassis every other table renders. */}
              <span data-card={card} className={styles.handCardSlot}>
                <PlayingCard
                  card={card}
                  actionLabel="Play"
                  disabled={!interactive || !playable}
                  onClick={() => onPlay?.(card)}
                />
              </span>
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

/**
 * The 0–13 bid rail plus Nil.
 *
 * Thirteen cards fan tighter than any other table on the shelf, so the keyboard
 * path is the accessible route past a crowded hand rather than a nicety: the
 * rail is a roving-tabindex radiogroup, arrows move the highlight, digits type
 * a two-digit bid, `n` picks Nil and Enter commits.
 */
function BidRail({
  view,
  onBid,
  onBidNil,
}: {
  view: SpadesTableView;
  onBid?: (bid: number) => void;
  onBidNil?: () => void;
}) {
  const options = view.bidOptions;
  const railRef = useRef<HTMLDivElement>(null);
  const pendingDigits = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  // The highlight is keyed to the hand: a new deal resets it without an effect,
  // so a fresh bid never inherits the last hand's cursor and the render stays
  // cascade-free (same idiom Hearts uses for its pass picks).
  const railKey = `${view.handNo}:${options.length}`;
  const [focusState, setFocusState] = useState<{ key: string; index: number }>({
    key: railKey,
    index: 0,
  });
  const focused = focusState.key === railKey ? focusState.index : 0;
  const setFocused = useCallback(
    (index: number) => setFocusState({ key: railKey, index }),
    [railKey],
  );

  const commit = useCallback(
    (index: number) => {
      const bid = options[index];
      if (bid !== undefined) onBid?.(bid);
    },
    [onBid, options],
  );

  const focusAt = useCallback(
    (index: number) => {
      setFocused(index);
      railRef.current
        ?.querySelectorAll<HTMLButtonElement>('[data-testid="spades-bid"]')
        [index]?.focus();
    },
    [setFocused],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    // Enter and Space are left to the button element so a bid fires once, and
    // held keys must not machine-gun a shortcut.
    if (event.repeat) return;
    if (key === 'n' || key === 'N') {
      if (view.canBidNil) {
        event.preventDefault();
        onBidNil?.();
      }
      return;
    }
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      // Two-digit bids ("1" then "3") need a moment to arrive; anything older
      // than the window starts a fresh number.
      const now = event.timeStamp;
      const previous = pendingDigits.current;
      const combined =
        previous.value.length > 0 && now - previous.at < 900 ? `${previous.value}${key}` : key;
      const asNumber = Number.parseInt(combined, 10);
      const index = options.indexOf(asNumber);
      if (index >= 0) {
        pendingDigits.current = { value: combined, at: now };
        focusAt(index);
      } else {
        const single = options.indexOf(Number.parseInt(key, 10));
        pendingDigits.current = { value: key, at: now };
        if (single >= 0) focusAt(single);
      }
      return;
    }
    const delta =
      key === 'ArrowRight' || key === 'ArrowDown'
        ? 1
        : key === 'ArrowLeft' || key === 'ArrowUp'
          ? -1
          : 0;
    if (delta !== 0) {
      event.preventDefault();
      focusAt(Math.min(options.length - 1, Math.max(0, focused + delta)));
      return;
    }
    if (key === 'Home') {
      event.preventDefault();
      focusAt(0);
    } else if (key === 'End') {
      event.preventDefault();
      focusAt(options.length - 1);
    }
  };

  return (
    <div className={styles.bidRail} role="group" aria-label="Your bid">
      <p className={styles.bidPrompt}>
        How many tricks? {view.canBidNil && <span>Nil scores ±100 — take none at all.</span>}
      </p>
      {/* A toolbar, not a radiogroup: moving the highlight is not choosing a
          bid, and aria-checked would tell a screen-reader user they had
          already bid the number they merely arrowed onto. Plain buttons keep
          Enter/Space native, so nothing double-fires. */}
      <div
        ref={railRef}
        className={styles.bidOptions}
        data-testid="spades-bid-rail"
        role="toolbar"
        aria-label="Number of tricks to bid"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {options.map((bid, index) => (
          <button
            key={bid}
            type="button"
            tabIndex={focused === index ? 0 : -1}
            data-testid="spades-bid"
            data-bid={bid}
            data-focused={focused === index || undefined}
            className={styles.bidChip}
            onFocus={() => setFocused(index)}
            onClick={() => commit(index)}
          >
            {bid}
          </button>
        ))}
      </div>
      {view.canBidNil && (
        <button
          type="button"
          className={`btn-fat btn-fat--ghost ${styles.nilAction}`}
          data-testid="spades-bid-nil"
          onClick={() => onBidNil?.()}
        >
          Bid Nil
        </button>
      )}
    </div>
  );
}

function SharedCueLayer({
  fx,
  fxKey,
  rootRef,
  reduced = false,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  reduced?: boolean;
}) {
  return (
    <TableFxLayer
      fx={fx}
      fxKey={fxKey}
      rootRef={rootRef}
      reduced={reduced}
      presentation="hidden"
      renderCue={(cue) => {
        if (cue.type === 'deal') {
          // Spades deals every card as `??` — the engine withholds the identity
          // even for your own seat, so the flight is always a back and the face
          // arrives with the hand rail rather than mid-air.
          return (
            <TableCardFlight cueId={cue.id}>
              <PlayingCard faceDown />
            </TableCardFlight>
          );
        }
        if (cue.type === 'trick-play') {
          return (
            <TableCardFlight cueId={cue.id}>
              <PlayingCard card={cue.card} />
            </TableCardFlight>
          );
        }
        if (cue.type === 'trick-collect') {
          return (
            <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.turnPop}>
              ×{cue.count}
            </span>
          );
        }
        if (cue.type === 'turn') {
          return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
        }
        return null;
      }}
    />
  );
}
