'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { type FxCue } from '@/lib/table/fx-motion';
import { presidentCatalog } from '@parlour/game-president';
import { getAvatar } from '@/lib/avatars';
import { PRESIDENT_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { PRESIDENT_MATCH_PACE_MS } from '@/lib/president/modes';
import { isValidLocalSet, type PresidentTableView } from '@/lib/president/view';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
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
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/president.module.css';

const ROLE_LABELS: Record<string, string> = {
  president: 'President',
  vice: 'Vice President',
  'vice-scum': 'Vice Scum',
  scum: 'Scum',
  neutral: '',
};

const EMPTY_SELECTION: readonly string[] = [];

export type PresidentTableScreenProps = {
  view: PresidentTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  /** Confirms the current selection: a set during play, gifts/returns in the exchange. */
  onConfirm?: (cards: readonly string[]) => void;
  onPass?: () => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

interface RoleMoment {
  seat: number;
  role: string;
}

export function PresidentTableScreen(props: PresidentTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  // Selection rides with the fx batch it was made in: a new batch voids it
  // without an effect-driven reset.
  const [selection, setSelection] = useState<{ key: string | number; cards: readonly string[] }>({
    key: props.fxKey,
    cards: [],
  });
  const selected = selection.key === props.fxKey ? selection.cards : EMPTY_SELECTION;
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, PRESIDENT_SFX_PACK.id);

  // The match has no clock, so the tense cue rides the expected session pace
  // and releases between deals.
  const tense = useMatchTension({
    expectedMs: PRESIDENT_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  const moments = useRoleMoments(props.fx, props.fxKey);

  const requiredCount =
    view?.decision === 'give'
      ? view.giveCount
      : view?.decision === 'return'
        ? view.returnCount
        : view?.standing && view.decision === 'lead-or-follow'
          ? view.standing.cards.length
          : 0;

  const selectionValid = (() => {
    if (!view || selected.length === 0) return false;
    if (view.decision === 'give') return selected.length === view.giveCount;
    if (view.decision === 'return') return selected.length === view.returnCount;
    if (view.decision === 'lead-or-follow') return isValidLocalSet(view, selected);
    return false;
  })();

  const confirmLabel = (() => {
    if (view?.decision === 'give') return `Give ${requiredCount}`;
    if (view?.decision === 'return') return `Return ${requiredCount}`;
    return 'Play set';
  })();

  useGameTextSurface(() => ({
    game: 'president',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    dealNumber: view?.dealNumber ?? null,
    phaseLabel: view?.phaseLabel ?? null,
    decision: view?.decision ?? null,
    standingRank: view?.standing?.rank ?? null,
    pileSize: view ? view.pile.reduce((sum, set) => sum + set.cards.length, 0) : null,
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), presidentCatalog.handOrder)
      : [],
    scores: view ? Object.fromEntries(view.players.map((p) => [p.seat, p.score])) : {},
  }));

  const toggleCard = (card: string) => {
    setSelection((current) => {
      const cards = current.key === props.fxKey ? current.cards : EMPTY_SELECTION;
      if (cards.includes(card)) {
        return { key: props.fxKey, cards: cards.filter((entry) => entry !== card) };
      }
      const cap = Math.max(requiredCount, 1);
      if (cards.length >= cap) return { key: props.fxKey, cards };
      return { key: props.fxKey, cards: [...cards, card] };
    });
  };

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Cutting the deck…" />;
  }

  const compactRing = view.players.length > 4;
  const localBusy = (props.busy ?? false) || deal.dealing;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
    <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill eyebrow="President" status={view.phaseLabel} />
      </TableHud>

      <TablePlayfield
        label="President table"
        feltMark="♛"
        className={compactRing ? tableStyles.compactRing : undefined}
        seatCount={view.players.length}
      >
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            active={view.activeSeat === player.seat}
            finished={view.finishedOrder.includes(player.seat)}
            displayCount={deal.visibleCount(player.seat, player.handCount)}
          />
        ))}
        <CenterPile view={view} deal={deal} />
        <LocalHand
          view={view}
          busy={localBusy}
          selected={selected}
          onToggle={toggleCard}
          deal={deal}
        />
        <TableFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
        />
        {(view.decision === 'give' || view.decision === 'return') && !localBusy && (
          <div className={`${styles.exchangeBanner} panel-soft`} data-testid="exchange-banner">
            <strong>
              {view.decision === 'give'
                ? 'The exchange — pay tribute'
                : 'The exchange — send back your pick'}
            </strong>
            <span className={styles.exchangeHint}>
              {view.decision === 'give'
                ? 'The low seats hand their best cards up before the deal.'
                : 'Choose what the low seats get back.'}
            </span>
          </div>
        )}
        {moments.current && (
          <div className={styles.celebration} aria-live="polite" data-testid="role-moment">
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.15, 1], opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <span
                className={
                  moments.current.role === 'scum' ? styles.celebrationScum : styles.celebrationCrown
                }
                aria-hidden="true"
              >
                {moments.current.role === 'scum' ? '🪠' : '👑'}
              </span>
              <div className={styles.celebrationLabel}>
                {ROLE_LABELS[moments.current.role] ?? moments.current.role}
              </div>
            </motion.div>
          </div>
        )}
      </TablePlayfield>

      <TableActionRail>
        {view.decision === 'lead-or-follow' && (
          <>
            <button
              type="button"
              className="btn-fat"
              disabled={!selectionValid || localBusy}
              onClick={() => {
                if (selectionValid) {
                  props.onConfirm?.(selected);
                  setSelection({ key: props.fxKey, cards: [] });
                }
              }}
            >
              {confirmLabel}
              {selected.length > 0 ? ` (${selected.length})` : ''}
            </button>
            <button
              type="button"
              className="btn-fat btn-fat--ghost"
              disabled={!view.legal.pass || localBusy}
              onClick={props.onPass}
            >
              Pass
            </button>
          </>
        )}
        {(view.decision === 'give' || view.decision === 'return') && (
          <>
            <span className={styles.selectionCount}>
              Selected {selected.length}/{requiredCount}
            </span>
            <button
              type="button"
              className="btn-fat"
              disabled={!selectionValid || localBusy}
              onClick={() => {
                if (selectionValid) {
                  props.onConfirm?.(selected);
                  setSelection({ key: props.fxKey, cards: [] });
                }
              }}
            >
              {confirmLabel}
            </button>
          </>
        )}
      </TableActionRail>

      <TableMenu open={menu.isOpen} onClose={menu.close} onQuit={menu.quit} />
    </TableShell>
    </ArrivalProvider>
  );
}

function Seat({
  player,
  active,
  finished,
  displayCount,
}: {
  player: PresidentTableView['players'][number];
  active: boolean;
  finished: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`] ?? ''} ${
        active ? tableStyles.seatActive : ''
      }`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={displayCount}
          max={4}
          spread={18}
          renderCard={({ rotation }) => <PlayingCard compact faceDown rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(2.6rem, 5vw, 4.4rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      {player.role && ROLE_LABELS[player.role] && (
        <span
          className={`${styles.roleBadge} ${
            player.role === 'president'
              ? styles.roleBadgePresident
              : player.role === 'scum'
                ? styles.roleBadgeScum
                : ''
          }`}
        >
          {player.role === 'president' ? '♛' : ''} {ROLE_LABELS[player.role]}
        </span>
      )}
      <span className={styles.scoreChip} data-testid={`score-${player.seat}`}>
        {player.handCount} card{player.handCount === 1 ? '' : 's'} · {player.score} pt
        {player.score === 1 ? '' : 's'}
        {finished ? ' · out' : ''}
      </span>
    </motion.div>
  );
}

function CenterPile({ view, deal }: { view: PresidentTableView; deal: DealPresentation }) {
  const sets = deal.discardReady ? view.pile : [];
  const standing = view.standing;
  return (
    <div className={styles.pileArea} data-center-pile>
      <div className={styles.pileStack} data-zone="pile">
        {sets.length === 0 && !deal.dealing && (
          <span className={styles.emptyPileHint}>lead anything</span>
        )}
        {sets.map((set, index) => (
          <div
            key={`${set.rank}-${index}`}
            className={`${styles.pileSet} ${index === sets.length - 1 ? styles.pileSetTop : ''}`}
          >
            {set.cards.map((card, cardIndex) => (
              <PlayingCard
                key={card}
                card={card}
                rotation={
                  index === sets.length - 1
                    ? discardRotation(card, cardIndex)
                    : (cardIndex - set.cards.length / 2) * 6
                }
              />
            ))}
          </div>
        ))}
      </div>
      {standing && (
        <span className={styles.rankChip} data-testid="standing-chip">
          beat rank {standing.rank} · {standing.cards.length}
        </span>
      )}
    </div>
  );
}

function LocalHand({
  view,
  busy,
  selected,
  onToggle,
  deal,
}: {
  view: PresidentTableView;
  busy: boolean;
  selected: readonly string[];
  onToggle: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    presidentCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const exchanging = view.decision === 'give' || view.decision === 'return';
  const canPick = !busy && (exchanging || view.decision === 'lead-or-follow');
  const showLegality = !busy && view.decision === 'lead-or-follow';

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
          const playable = view.legal.playableCards.includes(card);
          const isSelected = selected.includes(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={showLegality ? playable || isSelected : undefined}
            >
              <PlayingCard
                card={card}
                disabled={!canPick}
                rotation={isSelected ? -4 : 0}
                onClick={() => canPick && onToggle(card)}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

/** Crown-and-sting bursts driven purely by engine role events. */
function useRoleMoments(fx: readonly FxEvent[], fxKey: string | number) {
  const moments = useMemo<RoleMoment[]>(
    () =>
      fx
        .filter((event) => event.kind === 'president.role')
        .map((event) => {
          const payload = event.payload as { seat?: unknown; role?: unknown };
          return {
            seat: typeof payload.seat === 'number' ? payload.seat : -1,
            role: typeof payload.role === 'string' ? payload.role : '',
          };
        })
        .filter((moment) => moment.role === 'president' || moment.role === 'scum'),
    [fx],
  );
  // The shown moment is derived from the fx batch; only advancing past the
  // first highlight needs state, and that happens in a timer, not an effect.
  const [advanced, setAdvanced] = useState<{ key: string | number; value: boolean }>({
    key: fxKey,
    value: false,
  });
  const index = advanced.key === fxKey && advanced.value ? Math.min(1, moments.length - 1) : 0;
  useEffect(() => {
    if (moments.length <= 1) return;
    const timer = window.setTimeout(() => setAdvanced({ key: fxKey, value: true }), 1100);
    return () => window.clearTimeout(timer);
  }, [fxKey, moments.length]);
  return { current: moments[index] ?? null };
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}`);
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={cue.card} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
