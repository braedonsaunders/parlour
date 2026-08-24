'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { orderedHand, type FxEvent, type MatchResult } from '@parlour/engine';
import { heartsCatalog } from '@parlour/game-hearts';
import { getAvatar } from '@/lib/avatars';
import { HEARTS_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { HEARTS_HAND_PACE_MS } from '@/lib/hearts/modes';
import type { HeartsTableView } from '@/lib/hearts/view';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import { discardRotation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { TableMenu } from '../TableMenu';
import { PlayingCard } from '../PlayingCard';
import {
  dealStateAttr,
  OpponentFan,
  SeatNameplate,
  TableActionRail,
  TableCardFlight,
  TableErrorScreen,
  TableFxLayer,
  TableHud,
  TableLoadingScreen,
  TablePlayfield,
  TableShell,
  TableTitlePill,
  TableTurnIndicator,
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import heartsStyles from '@/styles/hearts.module.css';

const PASS_SIZE = 3;

export interface HeartsHandEndInfo {
  result: MatchResult;
  scores: readonly number[];
  matchOver: boolean;
}

export type HeartsTableScreenProps = {
  view: HeartsTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  /** local player's name/avatar already resolved in the view */
  onPass?: (cards: readonly string[]) => void;
  onPlayCard?: (card: string) => void;
  onNextHand?: () => void;
  onQuit?: () => void;
  handEnd?: HeartsHandEndInfo | null;
};

export function HeartsTableScreen(props: HeartsTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  // Pass picks are keyed to the fx round: a new deal/wall resets them without
  // an effect (derived state keeps renders cascade-free).
  const [passState, setPassState] = useState<{ key: string; picks: readonly string[] }>({
    key: '',
    picks: [],
  });
  const roundKey = String(props.fxKey);
  const selectedPass = passState.key === roundKey ? passState.picks : [];
  const togglePass = (card: string) =>
    setPassState({
      key: roundKey,
      picks: selectedPass.includes(card)
        ? selectedPass.filter((c) => c !== card)
        : selectedPass.length >= PASS_SIZE
          ? selectedPass
          : [...selectedPass, card],
    });
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, HEARTS_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: HEARTS_HAND_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'hearts',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    decision: view?.decision ?? null,
    phaseLabel: view?.phaseLabel ?? null,
    trick: view ? view.trick.map((play) => play.card) : [],
    ledSuit: view?.ledSuit ?? null,
    heartsBroken: view?.heartsBroken ?? false,
    awaitingPass: view?.awaitingPass ?? [],
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), heartsCatalog.handOrder, {
          jackDiamonds: view.jackDiamonds,
        })
      : [],
    playableCards: deal.dealing ? [] : (view?.playableCards ?? []),
    scores: view ? Object.fromEntries(view.players.map((p) => [p.seat, p.score])) : {},
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Shuffling up…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const passReady = selectedPass.length === PASS_SIZE;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
        <TableHud onOpenMenu={menu.open}>
          <TableTitlePill eyebrow="Hearts" status={view.phaseLabel} />
        </TableHud>

        <TablePlayfield label="Hearts table" feltMark="♥">
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              active={view.activeSeat === player.seat}
              choosing={view.awaitingPass.includes(player.seat)}
              displayCount={deal.visibleCount(player.seat, player.handCount)}
            />
          ))}
          <TableBadges view={view} />
          <TrickArea trick={view.trick} />
          <LocalHand
            view={view}
            busy={localBusy}
            selectedPass={selectedPass}
            onTogglePass={togglePass}
            onPlayCard={props.onPlayCard}
            deal={deal}
          />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />
          {view.decision === 'pass' && !localBusy && (
            <div
              className={heartsStyles.passBanner}
              role="group"
              aria-label="Choose three cards to pass"
            >
              <div className={heartsStyles.passCount} aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className={heartsStyles.passPip}
                    data-filled={index < selectedPass.length}
                  />
                ))}
              </div>
            </div>
          )}
        </TablePlayfield>

        <TableActionRail>
          {view.decision === 'pass' && !localBusy ? (
            <button
              type="button"
              className="btn-fat"
              disabled={!passReady}
              data-testid="confirm-pass"
              onClick={() => {
                if (passReady) props.onPass?.(selectedPass);
              }}
            >
              {passReady
                ? `Pass ${PASS_SIZE} ${view.passDirection ?? ''}`.trim()
                : `Pick ${PASS_SIZE - selectedPass.length} more`}
            </button>
          ) : (
            !localBusy && view.decision === 'play' && <TableTurnIndicator />
          )}
        </TableActionRail>

        {props.handEnd && (
          <HandEndOverlay
            info={props.handEnd}
            players={view.players}
            onNextHand={props.onNextHand}
          />
        )}

        <TableMenu open={menu.isOpen} onClose={menu.close} onQuit={menu.quit} />
      </TableShell>
    </ArrivalProvider>
  );
}

function Seat({
  player,
  active,
  choosing,
  displayCount,
}: {
  player: HeartsTableView['players'][number];
  active: boolean;
  choosing: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`]} ${active ? tableStyles.seatActive : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={displayCount}
          max={6}
          spread={20}
          renderCard={({ rotation }) => <PlayingCard faceDown compact rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3rem, 5.4vw, 4.6rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      <span className={heartsStyles.scoreChip} data-score-chip={player.seat}>
        {player.score}
        <small aria-hidden="true">pts</small>
      </span>
      {choosing && (
        <span className={heartsStyles.takenChip} aria-hidden="true">
          choosing…
        </span>
      )}
    </motion.div>
  );
}

function TableBadges({ view }: { view: HeartsTableView }) {
  const directionArrow: Record<string, string> = {
    left: '←',
    right: '→',
    across: '⇄',
    hold: '⊘',
  };
  return (
    <div className={heartsStyles.tableBadges} data-table-badges>
      {view.passDirection && (
        <span className={heartsStyles.directionChip} aria-label={`passing ${view.passDirection}`}>
          {directionArrow[view.passDirection] ?? '·'} {view.passDirection}
        </span>
      )}
      {view.heartsBroken && <span className={heartsStyles.brokenChip}>hearts broken</span>}
    </div>
  );
}

function TrickArea({ trick }: { trick: HeartsTableView['trick'] }) {
  return (
    <div className={heartsStyles.trickArea} aria-label="Current trick" data-zone="discard">
      <AnimatePresence initial={false}>
        {trick.map((play) => (
          <motion.div
            key={play.card}
            className={`${heartsStyles.trickSlot} ${heartsStyles[`trickSlot${play.seat}`]}`}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.3, 1] }}
          >
            <PlayingCard card={play.card} rotation={discardRotation(play.card, play.seat)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LocalHand({
  view,
  busy,
  selectedPass,
  onTogglePass,
  onPlayCard,
  deal,
}: {
  view: HeartsTableView;
  busy: boolean;
  selectedPass: readonly string[];
  onTogglePass: (card: string) => void;
  onPlayCard?: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    heartsCatalog.handOrder,
    { jackDiamonds: view.jackDiamonds },
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const passing = view.decision === 'pass' && !busy;
  const canPlayCards = view.decision === 'play' && !busy;

  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={dealStateAttr(deal)}
      fanPlan={plannedHand}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleHand.map((card, index) => {
          const playable = passing || (canPlayCards && view.playableCards.includes(card));
          const picked = selectedPass.includes(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={busy ? undefined : playable}
            >
              <PlayingCard
                card={card}
                disabled={!playable}
                rotation={picked ? 0 : undefined}
                onClick={() => (passing ? onTogglePass(card) : onPlayCard?.(card))}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (
    cue.type === 'deal' ||
    cue.type === 'flip' ||
    cue.type === 'draw' ||
    cue.type === 'discard' ||
    cue.type === 'trick-play' ||
    cue.type === 'transfer'
  ) {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}`) ||
      (cue.type === 'transfer' && cue.to !== `hand:${localSeat}`);
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={cue.card} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'knock') {
    return (
      <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.burst}>
        <span className={tableStyles.ripple} />
        <strong>Q♠</strong>
      </span>
    );
  }
  if (cue.type === 'blitz') {
    return (
      <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.burst}>
        <span className={tableStyles.starburst} />
        <strong>MOON!</strong>
      </span>
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
}

export function HandEndOverlay({
  info,
  players,
  onNextHand,
}: {
  info: HeartsHandEndInfo;
  players: HeartsTableView['players'];
  onNextHand?: () => void;
}) {
  const ordered = [...info.result.rankings].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  return (
    <div
      className={heartsStyles.handEnd}
      role="dialog"
      aria-label="Hand scored"
      data-testid="hand-end"
    >
      <div className={`${heartsStyles.handEndPanel} panel-soft`}>
        <strong className="font-display text-lg font-extrabold text-hearth-50">
          {info.matchOver ? 'Match over' : 'Hand scored'}
        </strong>
        <div className={heartsStyles.handEndRows}>
          {ordered.map((entry, index) => {
            const player = players.find((candidate) => candidate.seat === entry.seat);
            const detail = entry.detail ?? {};
            const moon = detail.moon === true;
            const disputed = detail.disputed === true;
            return (
              <motion.div
                key={entry.seat}
                className={heartsStyles.handEndRow}
                data-winner={entry.rank === 1}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
              >
                <AvatarBadge avatarId={player?.avatarId ?? 'slate'} size="1.9rem" />
                <strong>{player?.name ?? `Seat ${entry.seat}`}</strong>
                {moon && <span className={heartsStyles.moonStamp}>MOON</span>}
                {disputed && (
                  <span className={heartsStyles.moonStamp} title="Broke follow suit under audit">
                    disputed
                  </span>
                )}
                <span className="font-display font-extrabold">
                  +{String(detail.points ?? 0)} → {info.scores[entry.seat] ?? 0}
                </span>
              </motion.div>
            );
          })}
        </div>
        {!info.matchOver && (
          <button type="button" className="btn-fat" onClick={onNextHand} data-testid="next-hand">
            Deal the next hand
          </button>
        )}
      </div>
    </div>
  );
}
