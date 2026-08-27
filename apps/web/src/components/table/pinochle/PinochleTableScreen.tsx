'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import {
  computeMeld,
  pinochleCatalog,
  type MeldBreakdown,
  type PinochleSuit,
} from '@parlour/game-pinochle';
import { AnimatePresence } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { PINOCHLE_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { PINOCHLE_MATCH_PACE_MS } from '@/lib/pinochle/modes';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import type { PinochleTableView } from '@/lib/pinochle/view';
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
import { PINOCHLE_SUIT_META, PinochleFxLayer } from './fx-layer';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/pinochle.module.css';

const { SUIT_GLYPH, SUIT_COLOR } = PINOCHLE_SUIT_META;

const TEAM_ACCENTS: [string, string] = ['#e29349', '#4ba1ba'];
const ALL_SUITS: readonly PinochleSuit[] = ['S', 'H', 'D', 'C'];

const MELD_ROWS: readonly [keyof MeldBreakdown, string][] = [
  ['run', 'Trump run'],
  ['extraMarriage', 'Extra marriage'],
  ['royalMarriage', 'Royal marriage'],
  ['commonMarriage', 'Marriage'],
  ['pinochle', 'Pinochle'],
  ['acesAround', 'Aces around'],
  ['kingsAround', 'Kings around'],
  ['queensAround', 'Queens around'],
  ['jacksAround', 'Jacks around'],
  ['dix', 'Dix'],
];

export type PinochleTableScreenProps = {
  view: PinochleTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onBid?: (amount: number) => void;
  onPass?: () => void;
  onNameTrump?: (suit: PinochleSuit) => void;
  onConfirmMeld?: () => void;
  onPlay?: (card: string) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function PinochleTableScreen(props: PinochleTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, PINOCHLE_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: PINOCHLE_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    game: 'pinochle',
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
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), pinochleCatalog.handOrder, {
          trump: view.trump,
        })
      : [],
    legalCards: deal.dealing ? [] : (view?.legalCards ?? []),
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Dealing the first hand…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const auctioning = view.trump === null;
  const melding = view.trump !== null && !view.meldConfirmed.every(Boolean);

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableScreenFrame
        rootRef={rootRef}
        dealState={dealStateAttr(deal)}
        menu={menu}
        hud={
          <section className={styles.hudCluster}>
            <TableTitlePill eyebrow="Pinochle" status={view.stageLabel} />
            <TeamScores view={view} />
          </section>
        }
      >
        <TablePlayfield label="Pinochle table" feltMark="P">
          {view.trump && (
            <div
              className={styles.trumpBadge}
              style={{ '--trump-color': SUIT_COLOR[view.trump] } as CSSProperties}
            >
              <i>{SUIT_GLYPH[view.trump]}</i> trump
            </div>
          )}
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              active={view.activeSeat === player.seat}
              displayCount={deal.visibleCount(player.seat, player.handCount)}
              showAuctionStatus={auctioning}
              showMeldStatus={melding}
            />
          ))}
          <CenterTable view={view} />
          <LocalHand view={view} busy={localBusy} onPlay={props.onPlay} deal={deal} />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => {
              if (cue.type === 'deal') {
                const faceDown = cue.to !== `hand:${view.localSeat}`;
                return (
                  <TableCardFlight cueId={cue.id}>
                    <PlayingCard card={faceDown ? undefined : cue.card} faceDown={faceDown} />
                  </TableCardFlight>
                );
              }
              if (cue.type === 'trick-play') {
                const faceDown = cue.seat !== view.localSeat;
                return (
                  <TableCardFlight cueId={cue.id}>
                    <PlayingCard card={faceDown ? undefined : cue.card} faceDown={faceDown} />
                  </TableCardFlight>
                );
              }
              if (cue.type === 'trick-collect') {
                return (
                  <span
                    data-fx-cue={cue.id}
                    data-seat-burst={cue.seat}
                    className={tableStyles.turnPop}
                  >
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
          <PinochleFxLayer fx={props.fx} fxKey={props.fxKey} rootRef={rootRef} />
          {!localBusy && view.decision === 'bid' && (
            <BidRail
              key={view.bidOptions[0] ?? view.minBid}
              view={view}
              onBid={props.onBid}
              onPass={props.onPass}
            />
          )}
          {!localBusy && view.decision === 'name-trump' && (
            <TrumpRail view={view} onNameTrump={props.onNameTrump} />
          )}
          {(view.decision === 'confirm-meld' || melding) && (
            <MeldPanel
              view={view}
              confirming={view.decision === 'confirm-meld' && !localBusy}
              onConfirmMeld={props.onConfirmMeld}
            />
          )}
        </TablePlayfield>
      </TableScreenFrame>
    </ArrivalProvider>
  );
}

function TeamScores({ view }: { view: PinochleTableView }) {
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
          data-maker={team.isBidTeam || undefined}
          style={{ '--team-accent': TEAM_ACCENTS[team.team] } as CSSProperties}
          aria-label={`${team.label}: ${team.score} points`}
        >
          <strong>{team.score}</strong>
          <small aria-hidden="true">
            {team.label
              .split('–')
              .map((side) => side.slice(0, 1))
              .join('/')}
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
  showAuctionStatus,
  showMeldStatus,
}: {
  player: PinochleTableView['players'][number];
  active: boolean;
  displayCount: number;
  showAuctionStatus: boolean;
  showMeldStatus: boolean;
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
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`]} ${active ? tableStyles.seatActive : ''}`}
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
      {player.isDealer && <span className={styles.dealerChip}>dealer</span>}
      {showAuctionStatus && (
        <span
          className={styles.auctionBadge}
          data-confirmed={player.hasPassed || player.lastBid !== null || undefined}
        >
          {player.hasPassed
            ? 'passed'
            : player.lastBid !== null
              ? `bid ${player.lastBid}`
              : player.isInAuction
                ? '…'
                : ''}
        </span>
      )}
      {showMeldStatus && (
        <span className={styles.auctionBadge} data-confirmed={player.hasConfirmedMeld || undefined}>
          {player.hasConfirmedMeld ? `meld ${player.meld?.total ?? 0}` : 'melding…'}
        </span>
      )}
    </div>
  );
}

function CenterTable({ view }: { view: PinochleTableView }) {
  return (
    <div className={styles.trickZone} data-zone="trick" aria-label="Current trick">
      {view.trick.map((play) => (
        <span key={play.seat} className={styles.trickCard} data-seat={play.seat}>
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
  view: PinochleTableView;
  busy: boolean;
  onPlay?: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    pinochleCatalog.handOrder,
    { trump: view.trump },
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const interactive = !busy && view.decision === 'play';
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
          const playable = view.legalCards.includes(card);
          const disabled = !interactive || (view.decision === 'play' && !playable);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={view.decision === 'play' ? playable : undefined}
            >
              <PlayingCard card={card} disabled={disabled} onClick={() => onPlay?.(card)} />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function BidRail({
  view,
  onBid,
  onPass,
}: {
  view: PinochleTableView;
  onBid?: (amount: number) => void;
  onPass?: () => void;
}) {
  const floor = view.bidOptions[0] ?? view.minBid;
  const ceiling = view.bidOptions[view.bidOptions.length - 1] ?? view.maxBid;
  const [amount, setAmount] = useState(floor);

  return (
    <div className={styles.bidRail} role="group" aria-label="Bidding decision">
      <p className={styles.bidPrompt}>
        {view.highBid === null ? 'Open the bidding' : `Beat ${view.highBid}`}
      </p>
      <div className={styles.bidOptions}>
        <button
          type="button"
          className={styles.bidChip}
          aria-label="Lower the bid"
          onClick={() => setAmount((value) => Math.max(floor, value - 1))}
        >
          −
        </button>
        <span className={styles.bidChip} aria-live="polite" aria-label={`Bid ${amount}`}>
          {amount}
        </span>
        <button
          type="button"
          className={styles.bidChip}
          aria-label="Raise the bid"
          onClick={() => setAmount((value) => Math.min(ceiling, value + 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={`btn-fat ${styles.bidAction}`}
        onClick={() => onBid?.(amount)}
      >
        Bid {amount}
      </button>
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

function TrumpRail({
  view,
  onNameTrump,
}: {
  view: PinochleTableView;
  onNameTrump?: (suit: PinochleSuit) => void;
}) {
  const suits = view.trumpOptions.length > 0 ? view.trumpOptions : ALL_SUITS;
  return (
    <div className={styles.bidRail} role="group" aria-label="Name trump">
      <p className={styles.bidPrompt}>You won the bid at {view.highBid} — name trump</p>
      <div className={styles.suitRow}>
        {suits.map((suit) => (
          <button
            key={suit}
            type="button"
            className={styles.suitPick}
            style={{ '--suit-color': SUIT_COLOR[suit] } as CSSProperties}
            aria-label={`Name ${suit} trump`}
            onClick={() => onNameTrump?.(suit)}
          >
            {SUIT_GLYPH[suit]}
          </button>
        ))}
      </div>
    </div>
  );
}

function MeldPanel({
  view,
  confirming,
  onConfirmMeld,
}: {
  view: PinochleTableView;
  confirming: boolean;
  onConfirmMeld?: () => void;
}) {
  const trump = view.trump;
  if (!trump) return null;
  const preview = confirming ? computeMeld(view.hand, trump) : view.localMeld;
  const waitingOn = view.players.filter(
    (player) => player.seat !== view.localSeat && !player.hasConfirmedMeld,
  );

  return (
    <div className={styles.meldPanel} role="group" aria-label="Your meld">
      {preview && (
        <>
          <div className={styles.meldRows}>
            {MELD_ROWS.filter(([key]) => preview[key] > 0).map(([key, label]) => (
              <div key={key} className={styles.meldRow}>
                <span>{label}</span>
                <strong>{preview[key]}</strong>
              </div>
            ))}
          </div>
          <span className={styles.meldTotal}>{preview.total} pts</span>
        </>
      )}
      {confirming ? (
        <button
          type="button"
          className="btn-fat"
          onClick={onConfirmMeld}
          data-testid="confirm-meld"
        >
          Confirm meld
        </button>
      ) : (
        waitingOn.length > 0 && (
          <p className={styles.bidPrompt}>
            Waiting on {waitingOn.map((player) => player.name).join(', ')}
          </p>
        )
      )}
    </div>
  );
}
