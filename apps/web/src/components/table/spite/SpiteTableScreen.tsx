'use client';

import { useEffect, useRef, useState } from 'react';
import type { FxEvent, LegalMove } from '@parlour/engine';
import { AvatarBadge } from '@/components/AvatarBadge';
import { TableMenu } from '@/components/table/TableMenu';
import { HandRail, HandRailCard } from '@/components/table/HandRail';
import {
  SeatNameplate,
  TableErrorScreen,
  TableHud,
  TableLoadingScreen,
  TablePlayfield,
  TableShell,
  TableTitlePill,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useTableAudio } from '../fx-animation';
import { SPITE_SFX_PACK } from '@/lib/audio/sfx';
import {
  isTarget,
  moveForTarget,
  targetsFor,
  type SpiteCardView,
  type SpiteTableView,
  type SpiteTarget,
} from '@/lib/spite/view';
import styles from '@/styles/spite.module.css';

export interface SpiteTableScreenProps {
  view: SpiteTableView | null;
  /** The legal moves the local seat has; the table derives every target from them. */
  legal?: readonly LegalMove[];
  fx: readonly FxEvent[];
  fxKey: number | string;
  busy?: boolean;
  error?: string | null;
  onPlay?: (move: LegalMove) => void;
  onQuit?: () => void;
}

export function SpiteTableScreen({
  view,
  legal = [],
  fx,
  fxKey,
  busy = false,
  error = null,
  onPlay,
  onQuit,
}: SpiteTableScreenProps) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  useTableAudio(fx, fxKey, SPITE_SFX_PACK.id);

  const [held, setHeld] = useState<string | null>(null);

  /*
   * A held card is only held while the rules still offer it.
   *
   * A Spite turn is many plays long and every play rewrites the legal set, so
   * this is derived rather than cleared in an effect: setting state from an
   * effect on every accepted move cascades a render, and a selection that
   * outlived the move that invalidated it would offer a destination the rules
   * had already withdrawn.
   */
  const liftable = new Set(
    legal.flatMap((move) => {
      const card = (move.payload as { card?: unknown } | undefined)?.card;
      return typeof card === 'string' ? [card] : [];
    }),
  );
  const selected = held !== null && liftable.has(held) ? held : null;
  const targets = targetsFor(legal, selected);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeld(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  useGameTextSurface(() => {
    if (error) return { game: 'spite', status: 'error', error };
    if (!view) return { game: 'spite', status: 'loading', error: null };
    return {
      game: 'spite',
      status: view.status,
      winner: view.winner,
      yourTurn: view.isLocalTurn,
      held: selected,
      stock: view.stockCount,
      centre: view.centre.map((pile) => `${pile.needsLabel}<-${pile.top?.label ?? 'empty'}`),
      hand: view.hand.map((card) => card.label),
      seats: view.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        payoffLeft: seat.payoffLeft,
        hand: seat.handCount,
      })),
      error: null,
    };
  });

  if (error) {
    return <TableErrorScreen headline="The Spite table lost the thread." message={error} />;
  }
  if (!view) return <TableLoadingScreen copy="Stacking the payoff piles…" />;

  const local = view.seats.find((seat) => seat.isLocal) ?? null;
  const others = view.seats.filter((seat) => !seat.isLocal);
  const holding = selected !== null;

  const lift = (card: string) => {
    if (busy || !view.isLocalTurn || !liftable.has(card)) return;
    setHeld(selected === card ? null : card);
  };

  const drop = (target: SpiteTarget) => {
    if (selected === null) return;
    const move = moveForTarget(legal, selected, target);
    if (!move) return;
    setHeld(null);
    onPlay?.(move);
  };

  return (
    <TableShell rootRef={rootRef} className={styles.screen}>
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill eyebrow="Spite & Malice" status={view.stageLabel}>
          <span className={styles.stock}>
            stock <b>{view.stockCount}</b>
          </span>
        </TableTitlePill>
      </TableHud>

      <TablePlayfield label="Spite and Malice table" feltMark="S" className={styles.playfield}>
        <div className={styles.board} data-testid="spite-board" data-holding={holding || undefined}>
          <ol className={styles.opponents}>
            {others.map((seat) => (
              <li key={seat.seat} className={styles.seat} data-turn={seat.isTurn || undefined}>
                <div className={styles.seatHead}>
                  <AvatarBadge avatarId={seat.avatarId} size="clamp(2.2rem, 3.6vw, 3rem)" />
                  <SeatNameplate name={seat.name} isBot={seat.isBot} />
                </div>
                <div className={styles.seatPiles}>
                  <Pile
                    label={`${seat.payoffLeft} left`}
                    card={seat.payoffTop}
                    testid={`spite-payoff-${seat.seat}`}
                    tone="payoff"
                  />
                  {seat.discards.map((pile) => (
                    <Pile
                      key={pile.pile}
                      label={pile.count > 0 ? String(pile.count) : ''}
                      card={pile.top}
                      compact
                      tone="discard"
                    />
                  ))}
                  <span className={styles.handCount} aria-label={`${seat.handCount} cards in hand`}>
                    ✋ {seat.handCount}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <ul className={styles.centre} data-testid="spite-centre">
            {view.centre.map((pile) => {
              const target: SpiteTarget = { kind: 'centre', pile: pile.pile };
              const open = isTarget(targets, target);
              return (
                <li key={pile.pile}>
                  <button
                    type="button"
                    className={styles.centrePile}
                    data-legal-target={open || undefined}
                    data-testid={`spite-centre-${pile.pile}`}
                    disabled={!open}
                    onClick={() => drop(target)}
                    aria-label={
                      open
                        ? `Build onto pile ${pile.pile + 1}, which wants ${pile.needsLabel}`
                        : `Pile ${pile.pile + 1} wants ${pile.needsLabel}`
                    }
                  >
                    <SpiteCard card={pile.top} placeholder={pile.needsLabel} />
                    <span className={styles.needs}>wants {pile.needsLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {local ? (
            <div className={styles.localArea}>
              <Pile
                label={`${local.payoffLeft} left`}
                card={local.payoffTop}
                testid="spite-payoff-0"
                tone="payoff"
                liftable={local.payoffTop !== null && liftable.has(local.payoffTop.card)}
                held={selected !== null && selected === local.payoffTop?.card}
                onLift={local.payoffTop ? () => lift(local.payoffTop!.card) : undefined}
              />
              <ul className={styles.myDiscards}>
                {local.discards.map((pile) => {
                  const target: SpiteTarget = { kind: 'discard', pile: pile.pile };
                  const open = isTarget(targets, target);
                  const top = pile.top;
                  return (
                    <li key={pile.pile}>
                      <button
                        type="button"
                        className={styles.discardPile}
                        data-legal-target={open || undefined}
                        data-held={selected !== null && selected === top?.card ? '' : undefined}
                        data-testid={`spite-discard-${pile.pile}`}
                        disabled={!open && !(top && liftable.has(top.card))}
                        onClick={() => (open ? drop(target) : top ? lift(top.card) : undefined)}
                        aria-label={
                          open
                            ? `Discard here to end your turn (pile ${pile.pile + 1})`
                            : `Your discard pile ${pile.pile + 1}, ${pile.count} cards`
                        }
                      >
                        <SpiteCard card={top} placeholder="" />
                        {pile.count > 0 ? (
                          <span className={styles.pileCount}>{pile.count}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Looser than the default 0.48: these faces carry a big central
            numeral, and at the default the card in front slices it in half. */}
        <HandRail
          count={view.hand.length}
          zone={`hand:${view.localSeat}`}
          label="Your hand"
          fanStepRatio={0.82}
        >
          {view.hand.map((card, index) => (
            <HandRailCard
              key={card.card}
              cardId={card.card}
              index={index}
              count={view.hand.length}
              playable={liftable.has(card.card)}
              justDrawn={selected === card.card}
            >
              {/*
                This deck is numbers and wilds, not suits, so the shared
                PlayingCard has nothing to parse — handed one of these ids it
                renders the id. The face is drawn here instead, in a real button
                so the card keeps its tap target and its keyboard path.
              */}
              <button
                type="button"
                className={styles.handCard}
                data-held={selected === card.card ? '' : undefined}
                disabled={busy || !liftable.has(card.card)}
                onClick={() => lift(card.card)}
                aria-label={`${selected === card.card ? 'Put back' : 'Pick up'} ${
                  card.wild ? 'wild' : card.label
                }`}
              >
                <SpiteCard card={card} placeholder="" />
              </button>
            </HandRailCard>
          ))}
        </HandRail>
      </TablePlayfield>

      {view.status === 'ended' ? (
        <div className={styles.result} data-testid="spite-result" role="status">
          <h2>
            {view.winner === view.localSeat
              ? 'Payoff pile cleared — you win.'
              : `${view.seats.find((seat) => seat.seat === view.winner)?.name ?? 'Nobody'} cleared out first.`}
          </h2>
        </div>
      ) : null}

      <TableMenu open={menu.isOpen} onClose={menu.close} onQuit={menu.quit} />
      <span hidden data-fx-key={String(fxKey)} data-fx-count={fx.length} />
    </TableShell>
  );
}

/**
 * A card face, or the empty slot it would sit in.
 *
 * Drawn here rather than as a `PlayingCard`: this deck is a hundred and forty
 * four numbers and eighteen wilds, so the shared chassis — which is built out
 * of a rank and a suit glyph — has nothing to say about it. The layout is the
 * standard one anyway: an index in opposite corners so the card reads from
 * either end of a fan, and the rank large in the middle.
 */
function SpiteCard({ card, placeholder }: { card: SpiteCardView | null; placeholder: string }) {
  if (!card) {
    return (
      <span className={styles.emptySlot} aria-hidden="true">
        {placeholder}
      </span>
    );
  }

  if (card.wild) {
    return (
      <span className={styles.face} data-wild="" data-rank={card.label || undefined}>
        {/* The burst sits inside the mark so it follows it into the fan band
            rather than staying centred while the wordmark shifts off it. */}
        <span className={styles.wildMark}>
          <span className={styles.wildBurst} aria-hidden="true" />
          {card.standsFor === null ? (
            <b className={styles.wildWord}>WILD</b>
          ) : (
            <>
              <b className={styles.centreRank}>{card.standsFor}</b>
              <small className={styles.wildTag}>wild</small>
            </>
          )}
        </span>
      </span>
    );
  }

  return (
    <span className={styles.face} data-rank={card.label}>
      <i className={styles.corner} data-corner="tl" aria-hidden="true">
        {card.label}
      </i>
      <b className={styles.centreRank}>{card.label}</b>
      <i className={styles.corner} data-corner="br" aria-hidden="true">
        {card.label}
      </i>
    </span>
  );
}

function Pile({
  label,
  card,
  testid,
  tone,
  compact = false,
  liftable = false,
  held = false,
  onLift,
}: {
  label: string;
  card: SpiteCardView | null;
  testid?: string;
  tone: 'payoff' | 'discard';
  compact?: boolean;
  liftable?: boolean;
  held?: boolean;
  onLift?: () => void;
}) {
  const body = (
    <>
      <SpiteCard card={card} placeholder="" />
      {label ? <span className={styles.pileCount}>{label}</span> : null}
    </>
  );
  if (!onLift) {
    return (
      <span
        className={styles.pile}
        data-tone={tone}
        data-compact={compact || undefined}
        data-testid={testid}
      >
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={styles.pile}
      data-tone={tone}
      data-liftable={liftable || undefined}
      data-held={held || undefined}
      data-testid={testid}
      disabled={!liftable}
      onClick={onLift}
      aria-label={liftable ? `Play your payoff card ${card?.label ?? ''}` : `Payoff pile, ${label}`}
    >
      {body}
    </button>
  );
}
