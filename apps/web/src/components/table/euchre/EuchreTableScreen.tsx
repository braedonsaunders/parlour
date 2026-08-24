'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { euchreCatalog, type EuchreSuit } from '@parlour/game-euchre';
import { AnimatePresence } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { EUCHRE_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { EUCHRE_MATCH_PACE_MS } from '@/lib/euchre/modes';
import { useMusicMood } from '@/stores/audio';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { buildFxTimeline } from '@/lib/table/fx-motion';
import { suitName as suitLabel, type EuchreTableView } from '@/lib/euchre/view';
import { useFxAnimation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { TableMenu } from '../TableMenu';
import { AvatarBadge } from '@/components/AvatarBadge';
import { EUCHRE_SUIT_META, EuchreFxLayer } from './fx-layer';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/euchre.module.css';

const { SUIT_GLYPH, SUIT_COLOR } = EUCHRE_SUIT_META;

const TEAM_ACCENTS: [string, string] = ['#e29349', '#4ba1ba'];
const ALL_SUITS: readonly EuchreSuit[] = ['S', 'H', 'D', 'C'];

export type EuchreTableScreenProps = {
  view: EuchreTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onOrderUp?: (alone: boolean) => void;
  onCallTrump?: (suit: EuchreSuit, alone: boolean) => void;
  onPass?: () => void;
  onDiscard?: (card: string) => void;
  onPlay?: (card: string) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function EuchreTableScreen(props: EuchreTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alonePending, setAlonePending] = useState(false);
  const clearAlone = () => setAlonePending(false);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, EUCHRE_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: EUCHRE_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
        game: 'euchre',
        status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
        error,
        localSeat: view?.localSeat ?? null,
        activeSeat: view?.activeSeat ?? null,
        stage: view?.stageLabel ?? null,
        decision: view?.decision ?? null,
        trump: view?.trump ?? null,
        scores: view?.scores ?? null,
        handNo: view?.handNo ?? null,
        tricksPlayed: view?.tricksPlayed ?? null,
        upcard: deal.dealing ? null : (view?.upcard ?? null),
        hand: view
          ? orderedHand(deal.visibleCards(view.hand, view.localSeat), euchreCatalog.handOrder, {
              trump: view.trump,
            })
          : [],
        legalCards: deal.dealing ? [] : (view?.legalCards ?? []),
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
          <strong>Dealing the first hand…</strong>
        </div>
      </main>
    );
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const partner = view.players.find((player) => player.seat === (view.localSeat + 2) % 4);

  return (
    <main
      ref={rootRef}
      className={tableStyles.screen}
      data-table-screen
      data-deal-state={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <header className={tableStyles.hud}>
        <section className={styles.hudCluster}>
          <div className="pill-soft">
            <span className={tableStyles.eyebrow}>Euchre</span>
            <strong>{view.stageLabel}</strong>
          </div>
          <TeamScores view={view} />
        </section>
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

      <section className={tableStyles.playfield} aria-label="Euchre table">
        <div className={tableStyles.feltMark} aria-hidden="true">
          E
        </div>
        {view.trump && (
          <div
            className={styles.trumpBadge}
            style={{ '--trump-color': SUIT_COLOR[view.trump] } as CSSProperties}
          >
            <i>{SUIT_GLYPH[view.trump]}</i> trump
          </div>
        )}
        {view.alone && (
          <p className={styles.partnerNote}>
            {view.caller === view.localSeat
              ? 'You are playing this hand alone'
              : partner && view.sittingOut === partner.seat
                ? `${partner.name} is playing alone`
                : 'A lone hand is running'}
          </p>
        )}
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            active={view.activeSeat === player.seat}
            displayCount={deal.visibleCount(player.seat, player.handCount)}
          />
        ))}
        <CenterTable view={view} deal={deal} />
        <LocalHand
          view={view}
          busy={localBusy}
          burying={view.decision === 'dealer-discard'}
          onPlay={props.onPlay}
          onDiscard={props.onDiscard}
          deal={deal}
        />
        {/* Shared flights paint first; named Euchre moments stay readable above them. */}
        <SharedCueLayer
          fx={props.fx}
          fxKey={props.fxKey}
          localSeat={view.localSeat}
          rootRef={rootRef}
        />
        <EuchreFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          localSeat={view.localSeat}
          rootRef={rootRef}
        />
        {view.decision && !localBusy && (
          <BidRail
            view={view}
            alonePending={alonePending}
            onAloneToggle={() => setAlonePending((value) => !value)}
            onOrderUp={(alone) => {
              clearAlone();
              props.onOrderUp?.(alone);
            }}
            onCallTrump={(suit, alone) => {
              clearAlone();
              props.onCallTrump?.(suit, alone);
            }}
            onPass={() => {
              clearAlone();
              props.onPass?.();
            }}
          />
        )}
      </section>

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

function TeamScores({ view }: { view: EuchreTableView }) {
  return (
    <section
      className={styles.teamScores}
      data-team-scores
      aria-label={`Team scores, first to ${view.targetScore}`}
    >
      <span className={styles.scoreTarget}>First to {view.targetScore}</span>
      {view.teams.map((team) => (
        <span
          key={team.team}
          className={styles.teamChip}
          data-maker={team.isMaker || undefined}
          style={{ '--team-accent': TEAM_ACCENTS[team.team] } as CSSProperties}
          aria-label={`${team.label}: ${team.score} points and ${team.tricks} trick${team.tricks === 1 ? '' : 's'}`}
        >
          <strong>{team.score}</strong>
          <small aria-hidden="true">
            {team.label
              .split('–')
              .map((side) => side.slice(0, 1))
              .join('/')}{' '}
            · {team.tricks} trick{team.tricks === 1 ? '' : 's'}
          </small>
        </span>
      ))}
    </section>
  );
}

function Seat({
  player,
  active,
  displayCount,
}: {
  player: EuchreTableView['players'][number];
  active: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const visibleCards = Math.min(displayCount, 6);
  const fanStep = visibleCards > 1 ? 22 / (visibleCards - 1) : 0;
  const style = {
    '--seat-accent': avatar.accent,
    '--seat-shade': avatar.shade,
    '--team-accent': TEAM_ACCENTS[player.team],
  } as CSSProperties;

  return (
    <div
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`]} ${active ? tableStyles.seatActive : ''} ${
        player.isSittingOut ? styles.seatSittingOut : ''
      }`}
      style={style}
      data-team={player.team}
    >
      {!player.isLocal && (
        <div className={tableStyles.opponentCards} aria-label={`${displayCount} hidden cards`}>
          {Array.from({ length: visibleCards }, (_, index) => (
            <PlayingCard
              key={index}
              faceDown
              compact
              rotation={(index - (Math.max(visibleCards, 1) - 1) / 2) * fanStep}
            />
          ))}
        </div>
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <div className={tableStyles.nameplate}>
        <strong>{player.name}</strong>
        {player.isBot && <small>bot</small>}
      </div>
      {player.isDealer && <span className={styles.dealerChip}>dealer</span>}
      {player.isSittingOut && <small className="sr-only">sitting out</small>}
    </div>
  );
}

function CenterTable({ view, deal }: { view: EuchreTableView; deal: DealPresentation }) {
  const showKitty = view.biddingRound === 1 && view.upcard !== null;
  return (
    <>
      <div className={styles.trickZone} data-zone="trick" aria-label="Current trick">
        {view.trick.map((play) => (
          <span key={play.seat} className={styles.trickCard} data-seat={play.seat}>
            <PlayingCard card={play.card} />
          </span>
        ))}
      </div>
      {showKitty && (
        <>
          <div className={styles.kitty}>
            <span className={styles.kittyStack} aria-label="Kitty">
              {[0, 1, 2].map((index) => (
                <PlayingCard key={index} faceDown compact />
              ))}
            </span>
            <span className={styles.kittyLabel}>kitty</span>
          </div>
          <div className={styles.upcard}>
            {!deal.discardReady ? (
              <PlayingCard faceDown />
            ) : (
              <PlayingCard card={view.upcard ?? undefined} rotation={-4} />
            )}
            <span className={styles.upcardLabel}>turn it up?</span>
          </div>
        </>
      )}
    </>
  );
}

function LocalHand({
  view,
  busy,
  burying,
  onPlay,
  onDiscard,
  deal,
}: {
  view: EuchreTableView;
  busy: boolean;
  burying: boolean;
  onPlay?: (card: string) => void;
  onDiscard?: (card: string) => void;
  deal: DealPresentation;
}) {
  const visibleHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    euchreCatalog.handOrder,
    { trump: view.trump },
  );
  const interactive = !busy && (burying || view.decision === 'play');
  const showLegality = !busy && view.decision === 'play';
  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleHand.map((card, index) => {
          const playable = burying || view.legalCards.includes(card);
          const disabled = !interactive || (!playable && view.decision === 'play');
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={showLegality || burying ? playable : undefined}
            >
              <PlayingCard
                card={card}
                disabled={disabled}
                onClick={burying ? () => onDiscard?.(card) : () => onPlay?.(card)}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function BidRail({
  view,
  alonePending,
  onAloneToggle,
  onOrderUp,
  onCallTrump,
  onPass,
}: {
  view: EuchreTableView;
  alonePending: boolean;
  onAloneToggle: () => void;
  onOrderUp?: (alone: boolean) => void;
  onCallTrump?: (suit: EuchreSuit, alone: boolean) => void;
  onPass?: () => void;
}) {
  const allowAlone = view.rules.goingAlone;
  const suits = useMemo(
    () =>
      ALL_SUITS.filter(
        (suit) => view.turnedDown === null || suitLabel(suit) !== suitOf(view.turnedDown as string),
      ),
    [view.turnedDown],
  );

  if (view.decision === 'order-up') {
    return (
      <div className={styles.bidRail} role="group" aria-label="Bidding decision">
        <p className={styles.bidPrompt}>The dealer turned up a card — order it up?</p>
        <button
          type="button"
          className={`btn-fat ${styles.bidAction}`}
          onClick={() => onOrderUp?.(false)}
        >
          Order it up
        </button>
        {allowAlone && (
          <button
            type="button"
            className={`${styles.aloneToggle} ${styles.bidAction}`}
            data-on={alonePending || undefined}
            onClick={onAloneToggle}
            aria-pressed={alonePending}
          >
            Go alone?
          </button>
        )}
        <button
          type="button"
          className={`btn-fat btn-fat--ghost ${styles.bidAction}`}
          onClick={onPass}
        >
          Pass
        </button>
      </div>
    );
  }

  if (view.decision === 'call-trump') {
    return (
      <div className={styles.bidRail} role="group" aria-label="Name trump">
        <p className={styles.bidPrompt}>Name trump — anything but the turned-down suit</p>
        <div className={styles.suitRow}>
          {(view.callSuits.length > 0 ? uniqueSuits(view.callSuits) : suits).map((suit) => (
            <button
              key={suit}
              type="button"
              className={styles.suitPick}
              style={{ '--suit-color': SUIT_COLOR[suit] } as CSSProperties}
              aria-label={`Call ${suitLabel(suit)}`}
              onClick={() => onCallTrump?.(suit, alonePending)}
            >
              {SUIT_GLYPH[suit]}
            </button>
          ))}
        </div>
        {allowAlone && (
          <button
            type="button"
            className={`${styles.aloneToggle} ${styles.bidAction}`}
            data-on={alonePending || undefined}
            onClick={onAloneToggle}
            aria-pressed={alonePending}
          >
            Go alone?
          </button>
        )}
        {!view.canPass && <p className={styles.bidPrompt}>Stick the dealer — you must call!</p>}
        {view.canPass && (
          <button
            type="button"
            className={`btn-fat btn-fat--ghost ${styles.bidAction}`}
            onClick={onPass}
          >
            Pass
          </button>
        )}
      </div>
    );
  }

  if (view.decision === 'dealer-discard') {
    return (
      <div className={styles.bidRail} role="status">
        <p className={styles.bidPrompt}>Pick a card from your hand to bury face down</p>
      </div>
    );
  }

  return null;
}

function SharedCueLayer({
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
  const planned = useMemo(() => buildFxTimeline(fx), [fx]);
  useFxAnimation(planned, rootRef, fxKey);
  return (
    <div className={tableStyles.fxLayer} aria-hidden="true">
      {planned
        .filter((cue) => cue.type === 'deal' || cue.type === 'flip' || cue.type === 'turn')
        .map((cue) => {
          if (cue.type === 'deal') {
            const faceDown = cue.to !== `hand:${localSeat}` && cue.to !== 'discard';
            return (
              <div
                key={`${fxKey}:${cue.id}`}
                data-fx-cue={cue.id}
                className={tableStyles.flyingCard}
              >
                <i className={tableStyles.cardTrail} />
                <span data-flight-card className={tableStyles.flightCardVisual}>
                  <PlayingCard
                    card={faceDown ? undefined : cue.card}
                    faceDown={faceDown && cue.card !== ''}
                  />
                </span>
                <i className={tableStyles.cardGlint} />
              </div>
            );
          }
          if (cue.type === 'flip') {
            return (
              <div
                key={`${fxKey}:${cue.id}`}
                data-fx-cue={cue.id}
                className={tableStyles.flyingCard}
              >
                <i className={tableStyles.cardTrail} />
                <span data-flight-card className={tableStyles.flightCardVisual}>
                  <PlayingCard card={cue.card} />
                </span>
                <i className={tableStyles.cardGlint} />
              </div>
            );
          }
          return (
            <span
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              data-seat-burst={cue.seat}
              className={tableStyles.turnPop}
            />
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function suitOf(card: string): string | null {
  const letter = card[0];
  switch (letter) {
    case 'S':
      return 'spades';
    case 'H':
      return 'hearts';
    case 'D':
      return 'diamonds';
    case 'C':
      return 'clubs';
    default:
      return null;
  }
}

function uniqueSuits(suits: readonly EuchreSuit[]): EuchreSuit[] {
  return [...new Set(suits)];
}
