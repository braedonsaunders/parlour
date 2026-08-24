'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { orderedHand, type FxEvent, type MatchResult } from '@parlour/engine';
import { heartsCatalog } from '@parlour/game-hearts';
import { getAvatar } from '@/lib/avatars';
import { HEARTS_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { HEARTS_HAND_PACE_MS } from '@/lib/hearts/modes';
import type { HeartsTableView } from '@/lib/hearts/view';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { discardRotation, useFxAnimation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { TableMenu } from '../TableMenu';
import { PlayingCard } from '../PlayingCard';
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
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
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [deal, error, view]);

  if (error) {
    return (
      <main className={tableStyles.screen}>
        <div className={`${tableStyles.statusPanel} panel-soft`} role="alert">
          <strong>The table lost the thread.</strong>
          <span>{error}</span>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={tableStyles.screen} aria-busy="true">
        <div className={`${tableStyles.statusPanel} panel-soft`}>
          <span className={tableStyles.loadingPip} />
          <strong>Shuffling up…</strong>
        </div>
      </main>
    );
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const passReady = selectedPass.length === PASS_SIZE;

  return (
    <main
      ref={rootRef}
      className={tableStyles.screen}
      data-table-screen
      data-deal-state={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <header className={tableStyles.hud}>
        <div className="pill-soft">
          <span className={tableStyles.eyebrow}>Hearts</span>
          <strong>{view.phaseLabel}</strong>
        </div>
        <button
          type="button"
          className={`${tableStyles.menuButton} btn-fat btn-fat--ghost`}
          aria-label="Table menu"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          •••
        </button>
      </header>

      <section className={tableStyles.playfield} aria-label="Hearts table">
        <div className={tableStyles.feltMark} aria-hidden="true">
          ♥
        </div>
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
        <HeartsFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          localSeat={view.localSeat}
          rootRef={rootRef}
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
      </section>

      <div className={tableStyles.actionRail}>
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
          !localBusy &&
          view.decision === 'play' && (
            <span className={tableStyles.turnIndicator} aria-hidden="true">
              Your turn
            </span>
          )
        )}
      </div>

      {props.handEnd && (
        <HandEndOverlay info={props.handEnd} players={view.players} onNextHand={props.onNextHand} />
      )}

      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onQuit={() => {
          setMenuOpen(false);
          props.onQuit?.();
        }}
      />
    </main>
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
  const visibleCards = Math.min(displayCount, 6);
  const fanStep = visibleCards > 1 ? 20 / (visibleCards - 1) : 0;
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
        <div className={tableStyles.opponentCards} aria-label={`${displayCount} hidden cards`}>
          {Array.from({ length: visibleCards }, (_, index) => (
            <PlayingCard
              key={index}
              faceDown
              compact
              rotation={(index - (visibleCards - 1) / 2) * fanStep}
            />
          ))}
        </div>
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3rem, 5.4vw, 4.6rem)"
        className={tableStyles.avatar}
      />
      <div className={tableStyles.nameplate}>
        <strong>{player.name}</strong>
        {player.isBot && <small>bot</small>}
      </div>
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
  const visibleHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    heartsCatalog.handOrder,
    { jackDiamonds: view.jackDiamonds },
  );
  const passing = view.decision === 'pass' && !busy;
  const canPlayCards = view.decision === 'play' && !busy;

  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
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

function HeartsFxLayer({
  fx,
  fxKey,
  localSeat,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  localSeat: number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const planned = useMemo(() => {
    try {
      return { cues: buildFxTimeline(fx), error: null as string | null };
    } catch (caught) {
      return {
        cues: [] as FxCue[],
        error: caught instanceof Error ? caught.message : 'Invalid table effect',
      };
    }
  }, [fx]);

  useFxAnimation(planned.cues, rootRef, fxKey);

  return (
    <div className={tableStyles.fxLayer} aria-live="polite">
      {planned.error && (
        <div className={tableStyles.fxError}>Animation skipped: {planned.error}</div>
      )}
      {planned.cues.map((cue) => (
        <Cue key={`${fxKey}:${cue.id}`} cue={cue} localSeat={localSeat} />
      ))}
    </div>
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
      <div data-fx-cue={cue.id} data-card-flight className={tableStyles.flyingCard}>
        <i className={tableStyles.cardTrail} />
        <span data-flight-card className={tableStyles.flightCardVisual}>
          <PlayingCard card={cue.card} faceDown={faceDown} />
        </span>
        <i className={tableStyles.cardGlint} />
      </div>
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
    return <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.turnPop} />;
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
