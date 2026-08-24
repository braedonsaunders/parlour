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
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { useDealPresentation } from '@/lib/table/deal-presentation';
import { useFxAnimation, useTableAudio } from '../fx-animation';
import { TableMenu } from '../TableMenu';
import { PlayingCard } from '../PlayingCard';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, RATSCREW_SFX_PACK.id);

  // Races keep everyone glued to the pile; the tense cue rides the match pace.
  const racing = Boolean(view?.window);
  const tense = useMatchTension({
    expectedMs: RATSCREW_MATCH_PACE_MS,
    running: Boolean(view) && view?.status === 'playing',
  });
  useMusicMood(tense || racing ? 'tense' : null);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
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
        canFlip: view?.legal.flip ?? false,
        canSlap: view?.legal.slap ?? false,
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [error, view]);

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
          <strong>Shuffling the stacks…</strong>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className={tableStyles.screen} data-table-screen>
      <header className={tableStyles.hud}>
        <div className="pill-soft">
          <span className={tableStyles.eyebrow}>Rat Screw</span>
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

      <section className={tableStyles.playfield} aria-label="Rat Screw table">
        <div className={tableStyles.feltMark} aria-hidden="true">
          ♣
        </div>
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            active={view.turnSeat === player.seat && !view.window}
            challenged={view.challenge?.target === player.seat}
            displayCount={
              player.isLocal ? deal.visibleCount(player.seat, player.stackCount) : player.stackCount
            }
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
            <div className={styles.slapCard}>
              <span className={styles.slapWord}>{slapPatternLabel(view.window.pattern)}</span>
              <span className={styles.windowBar} aria-hidden="true">
                <i
                  className={styles.windowBarFill}
                  style={{
                    animationDuration: `${Math.max(200, view.window.durationMs)}ms`,
                  } as CSSProperties}
                />
              </span>
            </div>
          </div>
        )}

        <FxLayer fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat} rootRef={rootRef} />
        <BurstLayer fx={props.fx} fxKey={props.fxKey} rootRef={rootRef} />
      </section>

      <div className={`${tableStyles.actionRail} ${styles.actionRail}`}>
        <button
          type="button"
          className={`btn-fat ${styles.flipButton}`}
          disabled={!view.legal.flip || props.busy}
          onClick={props.onFlip}
        >
          Flip
        </button>
        <button
          type="button"
          className={`btn-fat ${styles.slapButton}`}
          data-racing={Boolean(view.window)}
          disabled={!view.legal.slap || props.busy}
          onClick={props.onSlap}
        >
          SLAP!
        </button>
      </div>

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

function nameOf(view: RatscrewTableView, seat: number): string {
  return view.players.find((player) => player.seat === seat)?.name ?? `seat ${seat}`;
}

function Seat({
  player,
  active,
  challenged,
  displayCount,
}: {
  player: RatscrewTableView['players'][number];
  active: boolean;
  challenged: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  // Nobody ever sees faces in a stack — not even their own.
  const visibleCards = Math.min(displayCount, 5);
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
      <div
        className={tableStyles.opponentCards}
        aria-label={`${displayCount} face-down cards`}
      >
        {Array.from({ length: visibleCards }, (_, index) => (
          <PlayingCard
            key={index}
            compact
            faceDown
            rotation={(index - (visibleCards - 1) / 2) * fanStep}
          />
        ))}
      </div>
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <div className={tableStyles.nameplate}>
        <strong>{player.name}</strong>
        {player.isBot && <small>bot</small>}
      </div>
      <span className={styles.stackChip}>
        {challenged ? '⚡ ' : ''}
        {displayCount} card{displayCount === 1 ? '' : 's'}
      </span>
    </motion.div>
  );
}

function CenterPile({ view }: { view: RatscrewTableView }) {
  return (
    <div
      data-zone="discard"
      className={`${tableStyles.pileButton} ${tableStyles.discardPile}`}
      aria-label={`Center pile, ${view.centerCount} cards`}
    >
      <div className={styles.pileFan}>
        {view.center.map((card, index) => (
          <PlayingCard key={`${card}:${index}`} card={card} rotation={(index - 1) * 7} compact />
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
      return { cues: buildFxTimeline(fx), error: null };
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
      {planned.cues.map((cue) => {
        if (
          cue.type === 'deal' ||
          cue.type === 'flip' ||
          cue.type === 'draw' ||
          cue.type === 'discard'
        ) {
          const faceDown =
            (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
            (cue.type === 'draw' && cue.to !== `hand:${localSeat}`);
          return (
            <div key={`${fxKey}:${cue.id}`} data-fx-cue={cue.id} data-card-flight className={tableStyles.flyingCard}>
              <i className={tableStyles.cardTrail} />
              <span data-flight-card className={tableStyles.flightCardVisual}>
                <PlayingCard card={faceDown ? undefined : cue.card} faceDown={faceDown} compact />
              </span>
              <i className={tableStyles.cardGlint} />
            </div>
          );
        }
        if (cue.type === 'turn') {
          return (
            <span
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              data-seat-burst={cue.seat}
              className={tableStyles.turnPop}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

interface Burst {
  id: string;
  seat: number;
  label: string;
  tone: 'win' | 'burn' | 'comeback';
}

/**
 * Game-specific moments the shared cue timeline does not model: slap wins,
 * mis-slap burns and comeback returns pop over their seat plaque.
 */
function BurstLayer({
  fx,
  fxKey,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const bursts = useMemo<readonly Burst[]>(() => {
    const out: Burst[] = [];
    for (const event of fx) {
      const payload = (event.payload ?? {}) as { seat?: unknown; pattern?: unknown };
      const seat = typeof payload.seat === 'number' ? payload.seat : -1;
      switch (event.kind) {
        case 'ratscrew.slap':
          out.push({
            id: `slap:${String(payload.pattern)}`,
            seat,
            label: 'SLAPPED IT!',
            tone: 'win',
          });
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
    return out.slice(-3);
  }, [fx]);

  const [points, setPoints] = useState<Record<number, { x: number; y: number }>>({});
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
    setPoints(next);
  }, [rootRef, fxKey]);

  return (
    <div className={styles.burstLayer} aria-live="polite">
      <AnimatePresence>
        {bursts.map((burst) => {
          const at = points[burst.seat];
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
