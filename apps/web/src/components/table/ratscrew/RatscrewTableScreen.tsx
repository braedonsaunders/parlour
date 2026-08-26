'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { RATSCREW_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { RATSCREW_MATCH_PACE_MS } from '@/lib/ratscrew/modes';
import { slapPatternLabel, type RatscrewTableView } from '@/lib/ratscrew/view';
import { useMusicMood } from '@/stores/audio';
import { type FxCue } from '@/lib/table/fx-motion';
import { useDealPresentation } from '@/lib/table/deal-presentation';
import { useTableAudio } from '../fx-animation';
import { PlayingCard } from '../PlayingCard';
import {
  SeatNameplate,
  TableActionRail,
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
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/ratscrew.module.css';

export type RatscrewTableScreenProps = {
  view: RatscrewTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onFlip?: () => void;
  onSlap?: () => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function RatscrewTableScreen(props: RatscrewTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, RATSCREW_SFX_PACK.id);
  const slapLanded = props.fx.some((event) => event.kind === 'ratscrew.slap');

  // Races keep everyone glued to the pile; the tense cue rides the match pace.
  const racing = Boolean(view?.window);
  const tense = useMatchTension({
    expectedMs: RATSCREW_MATCH_PACE_MS,
    running: Boolean(view) && view?.status === 'playing',
  });
  useMusicMood(tense || racing ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'ratscrew',
    status: error ? 'error' : view ? (view.status === 'ended' ? 'ended' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    turnSeat: view?.turnSeat ?? null,
    centerTop: view?.center[0] ?? null,
    centerCount: view?.centerCount ?? null,
    window: view?.window?.pattern ?? null,
    challenge: view?.challenge ?? null,
    myStack: view?.players.find((p) => p.isLocal)?.stackCount ?? null,
    dealing: deal.dealing,
    canFlip: !deal.dealing && (view?.legal.flip ?? false),
    canSlap: !deal.dealing && (view?.legal.slap ?? false),
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Shuffling the stacks…" />;
  }

  return (
    <TableScreenFrame
      rootRef={rootRef}
      menu={menu}
      hud={<TableTitlePill eyebrow="Rat Screw" status={view.phaseLabel} />}
    >
      <TablePlayfield
        label="Rat Screw table"
        feltMark="♣"
        className={slapLanded ? styles.tableSlapped : undefined}
      >
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            tablePosition={relativeTablePosition(player.seat, view.localSeat, view.players.length)}
            tableSize={view.players.length}
            active={view.turnSeat === player.seat && !view.window}
            challenged={view.challenge?.target === player.seat}
            displayCount={deal.visibleCount(player.seat, player.stackCount)}
          />
        ))}

        <CenterPile view={view} />

        <AnimatePresence>
          {view.challenge && (
            <motion.div
              key={`${view.challenge.challenger}:${view.challenge.target}:${view.challenge.chancesLeft}`}
              className={styles.challengeBanner}
              initial={{ opacity: 0, y: -12, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
              role="status"
            >
              <strong>
                {nameOf(view, view.challenge.challenger)} challenges{' '}
                {view.challenge.target === view.localSeat
                  ? 'you'
                  : nameOf(view, view.challenge.target)}
              </strong>
              <span
                className={styles.challengePips}
                aria-label={`${view.challenge.chancesLeft} chances left`}
              >
                {Array.from({ length: Math.min(4, view.challenge.chancesLeft) }, (_, index) => (
                  <i key={index} className={styles.challengePip} data-spent="false" />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {view.window && (
          <div className={styles.slapBanner} role="alertdialog" aria-label="Slap window open">
            <span className={styles.slapReadyRing} aria-hidden="true" />
            <div className={styles.slapCard}>
              <span className={styles.slapWord}>{slapPatternLabel(view.window.pattern)}</span>
              <span className={styles.windowBar} aria-hidden="true">
                <i
                  className={styles.windowBarFill}
                  style={
                    {
                      animationDuration: `${Math.max(200, view.window.durationMs)}ms`,
                    } as CSSProperties
                  }
                />
              </span>
            </div>
          </div>
        )}

        <FxLayer fx={props.fx} fxKey={props.fxKey} rootRef={rootRef} />
        <BurstLayer fx={props.fx} fxKey={props.fxKey} rootRef={rootRef} view={view} />
      </TablePlayfield>

      <TableActionRail className={styles.actionRail}>
        <button
          type="button"
          className={`btn-fat ${styles.flipButton}`}
          disabled={deal.dealing || !view.legal.flip || props.busy}
          onClick={props.onFlip}
        >
          Flip
        </button>
        <button
          type="button"
          className={`btn-fat ${styles.slapButton}`}
          data-racing={Boolean(view.window)}
          disabled={deal.dealing || !view.legal.slap || props.busy}
          onClick={props.onSlap}
        >
          SLAP!
        </button>
      </TableActionRail>
    </TableScreenFrame>
  );
}

function nameOf(view: RatscrewTableView, seat: number): string {
  return view.players.find((player) => player.seat === seat)?.name ?? `seat ${seat}`;
}

/** Keeps the local stack at the bottom regardless of its authority seat id. */
function relativeTablePosition(seat: number, localSeat: number, seats: number): number {
  return (seat - localSeat + seats) % seats;
}

function Seat({
  player,
  tablePosition,
  tableSize,
  active,
  challenged,
  displayCount,
}: {
  player: RatscrewTableView['players'][number];
  tablePosition: number;
  tableSize: number;
  active: boolean;
  challenged: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  // Nobody ever sees faces in a stack — not even their own.
  const visibleCards = Math.min(displayCount, 5);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      data-table-position={tablePosition}
      data-table-size={tableSize}
      className={`${tableStyles.seat} ${styles.ratscrewSeat} ${active ? tableStyles.seatActive : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div
        data-zone={`hand:${player.seat}`}
        className={styles.playerStack}
        aria-label={
          player.isLocal
            ? `Your face-down stack, ${displayCount} cards. Faces stay hidden until flipped.`
            : `${player.name}'s face-down stack, ${displayCount} cards.`
        }
      >
        {Array.from({ length: visibleCards }, (_, index) => (
          <span
            key={index}
            className={styles.stackLayer}
            style={
              {
                '--stack-x': `${(index - 2) * 0.09}rem`,
                '--stack-y': `${(2 - index) * 0.1}rem`,
                '--stack-rotation': `${(index - (visibleCards - 1) / 2) * 1.6}deg`,
              } as CSSProperties
            }
          >
            <PlayingCard faceDown />
          </span>
        ))}
      </div>
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      <span className={styles.stackChip}>
        {challenged ? '⚡ ' : ''}
        {player.isLocal
          ? `Your stack · ${displayCount}`
          : `${displayCount} card${displayCount === 1 ? '' : 's'}`}
      </span>
    </motion.div>
  );
}

function CenterPile({ view }: { view: RatscrewTableView }) {
  return (
    <div
      data-zone="discard"
      className={`${tableStyles.discardPile} ${styles.centerPile}`}
      aria-label={`Center pile, ${view.centerCount} cards`}
    >
      <div className={styles.pileFan}>
        {view.center.length === 0 && (
          <span className={styles.emptyPile} aria-hidden="true">
            Flip here
          </span>
        )}
        {view.center.map((card, index) => (
          <span key={`${card}:${index}`} data-ratscrew-center-card>
            <PlayingCard card={card} rotation={(index - 1) * 7} />
          </span>
        ))}
        <span className={styles.pileCountChip}>{view.centerCount} on the pile</span>
      </div>
    </div>
  );
}

/** Shared cue timeline: deal flights, flips to the pile and turn rings. */
function FxLayer({
  fx,
  fxKey,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  return <TableFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} renderCue={renderRatscrewCue} />;
}

function renderRatscrewCue(cue: FxCue) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    // Every Rat Screw draw stack is private, including the local one.
    // Only an explicit flip cue reveals its card on the center pile.
    const faceDown = cue.type === 'deal' || cue.type === 'draw';
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={faceDown ? undefined : cue.card} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}

interface Burst {
  id: string;
  seat: number;
  label: string;
  tone: 'win' | 'burn' | 'comeback';
}

interface SlapImpactBurst {
  id: string;
  seat: number;
  pattern: NonNullable<RatscrewTableView['window']>['pattern'];
  cards: readonly string[];
}

type TablePoint = { x: number; y: number };

const SLAP_SPARKS = Array.from({ length: 12 }, (_, index) => index);

/**
 * Game-specific moments the shared cue timeline does not model: slap wins,
 * mis-slap burns and comeback returns pop over their seat plaque.
 */
function BurstLayer({
  fx,
  fxKey,
  rootRef,
  view,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  view: RatscrewTableView;
}) {
  const { seatBursts, slapImpact } = useMemo<{
    seatBursts: readonly Burst[];
    slapImpact: SlapImpactBurst | null;
  }>(() => {
    const out: Burst[] = [];
    let impact: SlapImpactBurst | null = null;
    for (const [index, event] of fx.entries()) {
      const payload = (event.payload ?? {}) as {
        seat?: unknown;
        pattern?: unknown;
        cards?: unknown;
      };
      const seat = typeof payload.seat === 'number' ? payload.seat : -1;
      switch (event.kind) {
        case 'ratscrew.slap':
          impact = {
            id: `slap:${index}:${String(payload.pattern)}`,
            seat,
            pattern: String(payload.pattern) as SlapImpactBurst['pattern'],
            cards: Array.isArray(payload.cards)
              ? payload.cards.filter((card): card is string => typeof card === 'string').slice(0, 3)
              : [],
          };
          break;
        case 'ratscrew.misslap':
          out.push({ id: 'misslap', seat, label: 'MIS-SLAP', tone: 'burn' });
          break;
        case 'ratscrew.comeback':
          out.push({ id: 'comeback', seat, label: 'BACK IN!', tone: 'comeback' });
          break;
        default:
          break;
      }
    }
    return { seatBursts: out.slice(-3), slapImpact: impact };
  }, [fx]);

  const [geometry, setGeometry] = useState<{
    seats: Record<number, TablePoint>;
    center: TablePoint | null;
  }>({ seats: {}, center: null });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const next: Record<number, { x: number; y: number }> = {};
    for (let seat = 0; seat < 6; seat++) {
      const anchor = root.querySelector<HTMLElement>(`[data-seat="${seat}"]`);
      if (!anchor) continue;
      const rect = anchor.getBoundingClientRect();
      next[seat] = {
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      };
    }
    const centerAnchor = root.querySelector<HTMLElement>('[data-zone="discard"]');
    const centerRect = centerAnchor?.getBoundingClientRect();
    setGeometry({
      seats: next,
      center: centerRect
        ? {
            x: centerRect.left + centerRect.width / 2 - bounds.left,
            y: centerRect.top + centerRect.height / 2 - bounds.top,
          }
        : { x: bounds.width / 2, y: bounds.height * 0.47 },
    });
  }, [rootRef, fxKey]);

  const winnerPoint = slapImpact ? geometry.seats[slapImpact.seat] : undefined;
  const centerPoint = geometry.center;
  const winner = slapImpact
    ? view.players.find((player) => player.seat === slapImpact.seat)
    : undefined;
  const winnerName = winner?.isLocal ? 'You' : (winner?.name ?? 'Player');
  const winnerCallout = winner?.isLocal ? 'YOU SLAP!' : `${winnerName.toUpperCase()} SLAPS!`;
  const cards = slapImpact?.cards ?? [];

  return (
    <div className={styles.burstLayer} aria-live="polite">
      <AnimatePresence>
        {slapImpact && centerPoint && (
          <motion.div
            key={`${fxKey}:${slapImpact.id}`}
            data-slap-impact
            className={styles.slapImpact}
            style={
              {
                left: centerPoint.x,
                top: centerPoint.y,
                '--scoop-x': `${(winnerPoint?.x ?? centerPoint.x) - centerPoint.x}px`,
                '--scoop-y': `${(winnerPoint?.y ?? centerPoint.y) - centerPoint.y}px`,
              } as CSSProperties
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            role="status"
            aria-label={`${winnerName} slapped the ${slapImpact.pattern} and won the pile`}
          >
            <span className={styles.impactCards} aria-hidden="true">
              {cards.map((card, index) => (
                <span
                  key={`${card}:${index}`}
                  data-slap-impact-card
                  className={styles.impactCard}
                  style={
                    {
                      '--impact-index': index,
                      '--impact-rotation': `${(index - 1) * 8}deg`,
                      '--scatter-rotation': `${(index - 1) * 13}deg`,
                      '--scoop-rotation': `${(index - 1) * 8 + 18}deg`,
                      '--scatter-x': `${(index - 1) * 18}px`,
                      '--scatter-y': `${Math.abs(index - 1) * 8 - 9}px`,
                    } as CSSProperties
                  }
                >
                  <PlayingCard card={card} />
                </span>
              ))}
            </span>
            <span className={styles.slapShockwave} aria-hidden="true" />
            <span
              className={`${styles.slapShockwave} ${styles.slapShockwaveEcho}`}
              aria-hidden="true"
            />
            <span className={styles.slapSparks} aria-hidden="true">
              {SLAP_SPARKS.map((index) => (
                <i
                  key={index}
                  style={
                    {
                      '--spark-angle': `${index * 30}deg`,
                      '--spark-distance': `${4.7 + (index % 3) * 0.55}rem`,
                      '--spark-delay': `${(index % 2) * 24}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>
            <svg
              className={styles.slapPalm}
              viewBox="0 0 120 150"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient id="ratscrew-palm" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff1cd" />
                  <stop offset="0.58" stopColor="#f0a75b" />
                  <stop offset="1" stopColor="#c75a2d" />
                </linearGradient>
              </defs>
              <g fill="url(#ratscrew-palm)" stroke="#71351f" strokeWidth="4" strokeLinejoin="round">
                <rect x="27" y="8" width="17" height="69" rx="8.5" />
                <rect x="46" y="1" width="17" height="76" rx="8.5" />
                <rect x="65" y="6" width="17" height="72" rx="8.5" />
                <rect x="84" y="17" width="17" height="65" rx="8.5" />
                <path d="M31 57c-8-8-17-19-24-10-8 10 9 30 19 43v18c0 22 16 37 38 37h9c22 0 37-16 37-39V68c0-11-9-19-20-19H48c-7 0-13 3-17 8Z" />
              </g>
              <path
                d="M38 93c15 8 37 10 57 1M43 112c13 6 30 7 43 2"
                fill="none"
                stroke="rgb(113 53 31 / 40%)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className={styles.slapImpactCopy}>
              <strong>{winnerCallout}</strong>
              <span>{slapPatternLabel(slapImpact.pattern)} · pile won</span>
            </span>
          </motion.div>
        )}

        {seatBursts.map((burst) => {
          const at = geometry.seats[burst.seat];
          if (!at) return null;
          return (
            <motion.span
              key={`${fxKey}:${burst.id}`}
              className={styles.seatBurst}
              style={{ left: at.x, top: at.y }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <i className={styles.burstRing} />
              <span className={styles.burstLabel} data-tone={burst.tone}>
                {burst.label}
              </span>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
