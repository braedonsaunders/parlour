'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { cribbageHowToPlay } from '@parlour/game-cribbage';
import { AnimatePresence, motion } from 'motion/react';
import { AvatarBadge } from '@/components/AvatarBadge';
import { getAvatar } from '@/lib/avatars';
import { CRIBBAGE_SFX_PACK } from '@/lib/audio/sfx';
import type { CribbageSeatView, CribbageTableView } from '@/lib/cribbage/view';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { useFxAnimation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { TableMenu } from '../TableMenu';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/cribbage.module.css';

export interface CribbageTableScreenProps {
  view: CribbageTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onDiscard?: (cards: readonly [string, string]) => void;
  onCut?: () => void;
  onPlay?: (card: string) => void;
  onClaim?: () => void;
  onSteal?: () => void;
  onQuit?: () => void;
}

export function CribbageTableScreen(props: CribbageTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, CRIBBAGE_SFX_PACK.id);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
        coordinateSystem: 'CSS pixels; origin is top-left, x grows right, y grows down',
        game: 'cribbage',
        status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
        error,
        phase: view?.phase ?? null,
        phaseLabel: view?.phaseLabel ?? null,
        activeSeat: view?.activeSeat ?? null,
        dealer: view?.dealer ?? null,
        scores: view?.players.map((player) => ({
          seat: player.seat,
          score: player.score,
          gamesWon: player.gamesWon,
          handCount: player.handCount,
        })),
        runningCount: view?.runningCount ?? null,
        starter: view?.starter ?? null,
        pile: view?.pile ?? [],
        hand: view ? deal.visibleCards(view.hand, view.localSeat) : [],
        legal: deal.dealing ? null : (view?.legal ?? null),
        activeFx: props.fx.map(({ kind, at }) => ({ kind, at: at ?? 0 })),
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [deal, error, props.fx, view]);

  if (error) {
    return (
      <main className={tableStyles.screen}>
        <div className={`${tableStyles.statusPanel} panel-soft`} role="alert">
          <strong>The cribbage table lost the count.</strong>
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
          <strong>Drilling the peg holes…</strong>
        </div>
      </main>
    );
  }

  const tableBusy = (props.busy ?? false) || deal.dealing;
  return (
    <main
      ref={rootRef}
      className={`${tableStyles.screen} ${styles.screen}`}
      data-table-screen
      data-deal-state={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <header className={tableStyles.hud}>
        <div className="pill-soft">
          <span className={tableStyles.eyebrow}>Cribbage</span>
          <strong>{phaseCopy(view)}</strong>
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

      <section className={tableStyles.playfield} aria-label="Cribbage table">
        <div className={styles.feltMonogram} aria-hidden="true">
          121
        </div>
        <OpponentSeat view={view} deal={deal} />
        <PeggingBoard view={view} fx={props.fx} />
        <TableCards view={view} deal={deal} />
        <LocalHand
          key={`${view.localSeat}:${view.dealNo}`}
          {...props}
          view={view}
          busy={tableBusy}
          deal={deal}
        />
        <CribbageFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          localSeat={view.localSeat}
        />
      </section>

      <div className={`${tableStyles.actionRail} ${styles.actionRail}`}>
        {view.legal.cut && (
          <button type="button" className="btn-fat" disabled={tableBusy} onClick={props.onCut}>
            Cut the starter
          </button>
        )}
        {view.legal.claim && (
          <button type="button" className="btn-fat" disabled={tableBusy} onClick={props.onClaim}>
            Claim points
          </button>
        )}
        {view.legal.steal && (
          <button
            type="button"
            className="btn-fat btn-fat--teal"
            disabled={tableBusy}
            onClick={props.onSteal}
          >
            Muggins!
          </button>
        )}
      </div>

      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        howToPlay={{ doc: cribbageHowToPlay, title: 'Cribbage', subtitle: 'the pegging race' }}
        onQuit={() => {
          setMenuOpen(false);
          props.onQuit?.();
        }}
      />
    </main>
  );
}

function phaseCopy(view: CribbageTableView): string {
  const target = view.targetGames > 1 ? ` · first to ${view.targetGames} games` : '';
  if (view.phase === 'discard') return `Choose two for the crib${target}`;
  if (view.phase === 'cut') return `Deal ${view.dealNo + 1} · cut the starter${target}`;
  if (view.phase === 'peg') return `Pegging · count ${view.runningCount}${target}`;
  if (view.phase.startsWith('show')) return `The show${target}`;
  return `${view.phaseLabel}${target}`;
}

function OpponentSeat({ view, deal }: { view: CribbageTableView; deal: DealPresentation }) {
  const opponent = view.players.find((player) => !player.isLocal);
  if (!opponent) return null;
  const avatar = getAvatar(opponent.avatarId);
  const count = deal.visibleCount(opponent.seat, opponent.handCount);
  return (
    <motion.div
      data-seat={opponent.seat}
      className={styles.opponentSeat}
      style={{ '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties}
      animate={view.activeSeat === opponent.seat ? { scale: [1, 1.04, 1.015] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div className={styles.opponentCards} aria-label={`${count} hidden cards`}>
        {Array.from({ length: Math.min(count, 6) }, (_, index) => (
          <PlayingCard
            key={index}
            compact
            faceDown
            rotation={(index - (Math.min(count, 6) - 1) / 2) * 6}
          />
        ))}
      </div>
      <AvatarBadge avatarId={opponent.avatarId} size={52} className={styles.avatar} />
      <div className={styles.nameplate}>
        <strong>{opponent.name}</strong>
        <span>{opponent.isBot ? 'house bot' : 'friend'}</span>
      </div>
      <ScoreLozenge player={opponent} target={view.targetGames} dealer={view.dealer} />
    </motion.div>
  );
}

function ScoreLozenge({
  player,
  target,
  dealer,
}: {
  player: CribbageSeatView;
  target: number;
  dealer: number;
}) {
  return (
    <div className={styles.scoreLozenge} data-dealer={dealer === player.seat || undefined}>
      <b>{player.score}</b>
      <span>/ 121</span>
      {target > 1 && (
        <em>
          {player.gamesWon} game{player.gamesWon === 1 ? '' : 's'}
        </em>
      )}
    </div>
  );
}

function TableCards({ view, deal }: { view: CribbageTableView; deal: DealPresentation }) {
  const pile = view.pile.slice(-5);
  return (
    <div className={styles.tableCards}>
      <div
        className={styles.stock}
        data-zone="stock"
        aria-label={`${view.stockCount} cards in stock`}
      >
        <PlayingCard compact faceDown />
        <span>{view.stockCount + deal.pendingStockCards}</span>
      </div>
      <div className={styles.starter} data-zone="discard" aria-label="Starter card">
        {view.starter ? (
          <PlayingCard compact card={view.starter} />
        ) : (
          <span className={styles.emptyCard}>cut</span>
        )}
        <small>starter</small>
      </div>
      <div
        className={styles.crib}
        data-zone="crib"
        aria-label={`${view.cribCount} cards in the crib`}
      >
        {view.cribCount > 0 ? (
          <PlayingCard compact faceDown />
        ) : (
          <span className={styles.emptyCard}>crib</span>
        )}
        <small>{view.dealer === view.localSeat ? 'your crib' : 'their crib'}</small>
      </div>
      <div
        className={styles.pegPile}
        data-zone="peg"
        aria-label={`Running count ${view.runningCount}`}
      >
        <output>{view.runningCount}</output>
        <div>
          {pile.map((card, index) => (
            <PlayingCard key={`${card}:${index}`} compact card={card} rotation={(index - 2) * 4} />
          ))}
        </div>
        <small>running count</small>
      </div>
    </div>
  );
}

function LocalHand(
  props: CribbageTableScreenProps & {
    view: CribbageTableView;
    busy: boolean;
    deal: DealPresentation;
  },
) {
  const { view } = props;
  const local = view.players.find((player) => player.isLocal);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const visibleHand = props.deal.visibleCards(view.hand, view.localSeat);
  const selectedVisible = selected.filter((card) => visibleHand.includes(card)).slice(0, 2);
  const discarding = view.legal.discardPairs.length > 0;
  const pair =
    selectedVisible.length === 2 ? ([selectedVisible[0]!, selectedVisible[1]!] as const) : null;
  const pairLegal =
    pair !== null &&
    view.legal.discardPairs.some(
      (candidate) => candidate.includes(pair[0]) && candidate.includes(pair[1]),
    );

  if (!local) return null;
  const toggle = (card: string) => {
    if (!discarding || props.busy) return;
    setSelected((current) => {
      const visible = current.filter((candidate) => visibleHand.includes(candidate)).slice(0, 2);
      return visible.includes(card)
        ? visible.filter((candidate) => candidate !== card)
        : visible.length < 2
          ? [...visible, card]
          : [visible[1]!, card];
    });
  };

  return (
    <>
      <div className={styles.localStatus}>
        <AvatarBadge avatarId={local.avatarId} size={42} />
        <ScoreLozenge player={local} target={view.targetGames} dealer={view.dealer} />
      </div>
      <HandRail
        count={visibleHand.length}
        zone={`hand:${view.localSeat}`}
        label="Your cribbage hand"
        dealState={props.deal.sequence ? (props.deal.complete ? 'complete' : 'dealing') : undefined}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visibleHand.map((card, index) => {
            const playable = view.legal.playCards.includes(card);
            const selectable =
              discarding && (selectedVisible.includes(card) || selectedVisible.length < 2);
            const interactive =
              !props.busy && (playable || selectable || selectedVisible.includes(card));
            return (
              <HandRailCard
                key={card}
                cardId={card}
                index={index}
                count={visibleHand.length}
                playable={
                  discarding ? selectable : view.legal.playCards.length > 0 ? playable : undefined
                }
              >
                <span
                  className={styles.handChoice}
                  data-selected={selectedVisible.includes(card) || undefined}
                >
                  <PlayingCard
                    card={card}
                    disabled={!interactive}
                    actionLabel={discarding ? 'Discard' : 'Play'}
                    onClick={() => (playable ? props.onPlay?.(card) : toggle(card))}
                  />
                </span>
              </HandRailCard>
            );
          })}
        </AnimatePresence>
      </HandRail>
      {discarding && (
        <div className={styles.discardCommit}>
          <span>{selectedVisible.length}/2 chosen</span>
          <button
            type="button"
            className="btn-fat"
            disabled={!pairLegal || props.busy}
            onClick={() => pair && props.onDiscard?.(pair)}
          >
            Slide to {view.dealer === view.localSeat ? 'your' : 'their'} crib
          </button>
        </div>
      )}
    </>
  );
}

type Point = { x: number; y: number };

function boardPoint(score: number): Point {
  const value = Math.max(0, Math.min(121, Math.round(score)));
  if (value <= 30) return { x: 54 + value * 21.4, y: 34 };
  if (value <= 60) return { x: 696 - (value - 31) * 21.4, y: 74 };
  if (value <= 90) return { x: 54 + (value - 61) * 21.4, y: 114 };
  if (value <= 120) return { x: 696 - (value - 91) * 21.4, y: 154 };
  return { x: 34, y: 154 };
}

function PeggingBoard({ view, fx }: { view: CribbageTableView; fx: readonly FxEvent[] }) {
  const moves = new Map<number, { from: number; to: number }>();
  for (const event of fx) {
    if (event.kind !== 'cribbage.peg' || !isPayload(event.payload)) continue;
    const { seat, from, to } = event.payload;
    if (typeof seat === 'number' && typeof from === 'number' && typeof to === 'number') {
      moves.set(seat, { from, to });
    }
  }

  const holes = useMemo(
    () => Array.from({ length: 122 }, (_, score) => ({ score, ...boardPoint(score) })),
    [],
  );
  const skunk = boardPoint(90);
  return (
    <div className={styles.boardWrap} aria-label="Cribbage pegging board">
      <svg className={styles.board} viewBox="0 0 750 188" role="img" aria-labelledby="board-title">
        <title id="board-title">Pegging board, race to 121</title>
        <path
          className={styles.street}
          d="M54 34 H696 Q726 34 726 54 Q726 74 696 74 H54 Q24 74 24 94 Q24 114 54 114 H696 Q726 114 726 134 Q726 154 696 154 H34"
        />
        <line className={styles.skunkLine} x1={skunk.x} y1="96" x2={skunk.x} y2="172" />
        <text className={styles.skunkLabel} x={skunk.x - 4} y="181">
          90 · skunk
        </text>
        {holes.map((hole) => (
          <g key={hole.score}>
            <circle className={styles.hole} cx={hole.x} cy={hole.y - 5} r="2.7" />
            <circle className={styles.hole} cx={hole.x} cy={hole.y + 5} r="2.7" />
            {(hole.score === 0 || hole.score === 121 || hole.score % 10 === 0) && (
              <text className={styles.holeLabel} x={hole.x} y={hole.y - 12}>
                {hole.score}
              </text>
            )}
          </g>
        ))}
        {view.players.flatMap((player, seatIndex) => {
          const lane = seatIndex === 0 ? -5 : 5;
          const move = moves.get(player.seat);
          const front = boardPoint(move?.to ?? player.score);
          const back = boardPoint(move?.from ?? Math.max(0, player.score - 1));
          const color = getAvatar(player.avatarId).accent;
          return [
            <motion.circle
              key={`${player.seat}:back`}
              className={styles.backPeg}
              initial={false}
              animate={{ cx: back.x, cy: back.y + lane }}
              transition={{ duration: move ? 0.24 : 0, ease: 'easeOut' }}
              r="5.2"
              fill={color}
            />,
            <motion.circle
              key={`${player.seat}:front`}
              className={styles.frontPeg}
              initial={false}
              animate={{ cx: front.x, cy: front.y + lane }}
              transition={{
                duration: move ? 0.38 : 0,
                ease: [0.2, 0.9, 0.25, 1.18],
              }}
              r="6.2"
              fill={color}
            />,
          ];
        })}
      </svg>
      <div className={styles.boardScores}>
        {view.players.map((player) => (
          <span
            key={player.seat}
            style={{ '--peg-color': getAvatar(player.avatarId).accent } as CSSProperties}
          >
            <i /> {player.isLocal ? 'You' : player.name} <b>{player.score}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function CribbageFxLayer({
  fx,
  fxKey,
  rootRef,
  localSeat,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  localSeat: number;
}) {
  const planned = useMemo(() => {
    try {
      return { cues: buildFxTimeline(fx), error: null };
    } catch (error) {
      return {
        cues: [] as FxCue[],
        error: error instanceof Error ? error.message : 'Invalid effect',
      };
    }
  }, [fx]);
  useFxAnimation(planned.cues, rootRef, fxKey);
  const calls = useMemo(() => cribbageCalls(fx), [fx]);

  return (
    <div className={tableStyles.fxLayer} aria-live="polite">
      {planned.error && (
        <div className={tableStyles.fxError}>Animation skipped: {planned.error}</div>
      )}
      {planned.cues.map((cue) => (
        <CribCue key={`${fxKey}:${cue.id}`} cue={cue} localSeat={localSeat} />
      ))}
      {calls.map((call) => (
        <motion.div
          key={`${fxKey}:${call.id}`}
          className={styles.callout}
          data-kind={call.kind}
          initial={{ opacity: 0, scale: 0.45, y: 16 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.45, 1.08, 1, 0.96], y: [16, 0, 0, -12] }}
          transition={{ duration: 1.05, times: [0, 0.2, 0.72, 1], delay: call.atMs / 1000 }}
        >
          <strong>{call.text}</strong>
          {call.detail && <span>{call.detail}</span>}
        </motion.div>
      ))}
      {fx.flatMap((event, index) =>
        event.kind === 'cribbage.crib.fly' && isPayload(event.payload)
          ? [
              <motion.div
                key={`${fxKey}:crib:${index}`}
                className={styles.cribFlight}
                data-from={event.payload.seat === localSeat ? 'local' : 'remote'}
                initial={{
                  opacity: 0,
                  y: event.payload.seat === localSeat ? 180 : -150,
                  scale: 0.8,
                }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: [event.payload.seat === localSeat ? 180 : -150, 0, 0, 0],
                  scale: [0.8, 1.05, 0.92, 0.92],
                }}
                transition={{
                  duration: 0.72,
                  times: [0, 0.32, 0.72, 1],
                  delay: (event.at ?? 0) / 1000,
                }}
              >
                <PlayingCard compact faceDown rotation={-7} />
                <PlayingCard compact faceDown rotation={7} />
              </motion.div>,
            ]
          : [],
      )}
    </div>
  );
}

function CribCue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (
    cue.type === 'deal' ||
    cue.type === 'flip' ||
    cue.type === 'draw' ||
    cue.type === 'discard' ||
    cue.type === 'layoff'
  ) {
    return (
      <div data-fx-cue={cue.id} data-card-flight className={tableStyles.flyingCard}>
        <i className={tableStyles.cardTrail} />
        <span data-flight-card className={tableStyles.flightCardVisual}>
          <PlayingCard
            card={cue.card}
            faceDown={cue.type === 'deal' && cue.to !== `hand:${localSeat}`}
          />
        </span>
        <i className={tableStyles.cardGlint} />
      </div>
    );
  }
  if (cue.type === 'showdown') {
    return (
      <div data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.showBurst}>
        <small>The show</small>
        <strong>{cue.handValue}</strong>
      </div>
    );
  }
  return <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.turnPop} />;
}

type CribCall = { id: string; kind: string; text: string; detail: string | null; atMs: number };

function cribbageCalls(fx: readonly FxEvent[]): CribCall[] {
  return fx.flatMap((event, index): CribCall[] => {
    const atMs = Math.max(0, event.at ?? 0);
    const payload = isPayload(event.payload) ? event.payload : {};
    const points = typeof payload.points === 'number' ? payload.points : 0;
    const reason = typeof payload.reason === 'string' ? payload.reason : null;
    const base = { id: `${index}:${event.kind}`, kind: event.kind, atMs };
    switch (event.kind) {
      case 'cribbage.score':
        return [
          {
            ...base,
            text: `+${points}`,
            detail: reason ? reason.replace('thirtyone', 'thirty-one') : null,
          },
        ];
      case 'cribbage.go':
        return [{ ...base, text: 'GO', detail: 'count resets when nobody can play' }];
      case 'cribbage.thirtyone':
        return [{ ...base, text: '31', detail: 'two points' }];
      case 'cribbage.heels':
        return [{ ...base, text: 'His heels!', detail: 'jack cut · dealer +2' }];
      case 'cribbage.muggins':
        return [{ ...base, text: 'Muggins!', detail: `${points} stolen` }];
      case 'cribbage.skunk':
        return [{ ...base, text: 'SKUNKED', detail: 'held below the 90 line' }];
      default:
        return [];
    }
  });
}

function isPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
