'use client';

import { Fragment, useEffect, useMemo, type ReactNode, type RefObject } from 'react';
import type { FxEvent } from '@parlour/engine';
import { useT, type MessageKey, type Translator } from '@/lib/i18n';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { useFxAnimation } from '../fx-animation';
import styles from '@/styles/table.module.css';
import { useTableAnnouncer } from './TableShell';

export type TableFxLayerProps = {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  /** Paints one planned cue. Return null for cues this table does not narrate. */
  renderCue: (cue: FxCue) => ReactNode;
  /**
   * `hidden` marks the layer decorative, for tables that narrate their moments
   * from a second, game-specific layer.
   */
  presentation?: 'live' | 'hidden';
  /**
   * Profile-level calm motion. Optional: omitted, the layer keeps honouring the
   * OS media query exactly as before.
   */
  reduced?: boolean;
  /** Extra flights a table paints outside the shared cue timeline. */
  children?: ReactNode;
};

function planFxTimeline(fx: readonly FxEvent[]): {
  cues: readonly FxCue[];
  error: string | null;
} {
  try {
    return { cues: buildFxTimeline(fx), error: null };
  } catch (caught) {
    return {
      cues: [],
      error: caught instanceof Error ? caught.message : 'Invalid table effect',
    };
  }
}

/**
 * The shared fx surface: plans the cue timeline, drives it through GSAP and
 * paints whatever the table returns for each cue. A cue the engine cannot plan
 * degrades to a skipped-animation note rather than taking the table down.
 */
export function TableFxLayer({
  fx,
  fxKey,
  rootRef,
  renderCue,
  presentation = 'live',
  reduced = false,
  children,
}: TableFxLayerProps) {
  const t = useT();
  const announce = useTableAnnouncer();
  const planned = useMemo(() => planFxTimeline(fx), [fx]);
  const narration = useMemo(() => narrateFx(planned.cues, fx, t), [fx, planned.cues, t]);

  useFxAnimation(planned.cues, rootRef, fxKey, reduced);
  useEffect(() => announce(narration), [announce, fxKey, narration]);

  return (
    <div className={styles.fxLayer} aria-hidden="true" data-presentation={presentation}>
      {planned.error && <div className={styles.fxError}>Animation skipped: {planned.error}</div>}
      {planned.cues.map((cue) => (
        <Fragment key={`${fxKey}:${cue.id}`}>{renderCue(cue)}</Fragment>
      ))}
      {children}
    </div>
  );
}

type NarrationLine = { at: number; index: number; text: string };

function narrateFx(cues: readonly FxCue[], fx: readonly FxEvent[], t: Translator): string {
  const lines: NarrationLine[] = [];
  const plannedSources = new Set(cues.map((cue) => cue.source));

  for (const cue of cues) {
    const text = narrateCue(cue, t);
    if (text) lines.push({ at: cue.startMs, index: fx.indexOf(cue.source), text });
  }

  const scores = new Set<string>();
  fx.forEach((event, index) => {
    const score = narrateScore(event, t);
    if (score && !scores.has(score.key)) {
      scores.add(score.key);
      lines.push({ at: Math.max(0, event.at ?? 0), index, text: score.text });
    }
    if (plannedSources.has(event)) return;
    const action = narrateUnplannedAction(event, t);
    if (action) lines.push({ at: Math.max(0, event.at ?? 0), index, text: action });
  });

  lines.sort((a, b) => a.at - b.at || a.index - b.index);
  return lines
    .filter((line, index) => line.text !== lines[index - 1]?.text)
    .slice(-3)
    .map((line) => line.text)
    .join(' ');
}

function narrateCue(cue: FxCue, t: Translator): string | null {
  const seat = 'seat' in cue ? t('narration.seat', { seat: cue.seat + 1 }) : null;
  switch (cue.type) {
    case 'draw':
      return t('narration.drew', { seat: seat! });
    case 'discard':
      return t('narration.discarded', { seat: seat!, card: spokenCard(cue.card, t) });
    case 'trick-play':
      return t('narration.played', { seat: seat!, card: spokenCard(cue.card, t) });
    case 'trick-collect':
      return t('narration.tookTrick', { seat: seat! });
    case 'knock':
      return t('narration.knocked', { seat: seat! });
    case 'blitz':
      return t('narration.calledBlitz', { seat: seat! });
    case 'showdown':
      return t('narration.showdown', { seat: seat! });
    case 'chip-loss':
      return t('narration.lostLife', { seat: seat!, lives: cue.livesLeft });
    case 'turn':
      return t('narration.turn', { seat: seat! });
    case 'gin-burst':
      return t(
        cue.burst === 'gin'
          ? 'narration.gin'
          : cue.burst === 'big-gin'
            ? 'narration.bigGin'
            : 'narration.undercut',
        { seat: seat! },
      );
    case 'flip': {
      const payload = payloadOf(cue.source);
      return typeof payload.seat === 'number'
        ? t('narration.played', {
            seat: t('narration.seat', { seat: payload.seat + 1 }),
            card: spokenCard(cue.card, t),
          })
        : null;
    }
    case 'deal':
    case 'transfer':
    case 'layoff':
      return null;
  }
}

function narrateScore(event: FxEvent, t: Translator): { key: string; text: string } | null {
  if (!/(?:score|standings)/.test(event.kind)) return null;
  const payload = payloadOf(event);
  if (typeof payload.total !== 'number') return null;
  if (typeof payload.team === 'number') {
    return {
      key: `team:${payload.team}:${payload.total}`,
      text: t('narration.teamScore', { team: payload.team + 1, score: payload.total }),
    };
  }
  if (typeof payload.seat === 'number') {
    const seat = t('narration.seat', { seat: payload.seat + 1 });
    return {
      key: `seat:${payload.seat}:${payload.total}`,
      text: t('narration.seatScore', { seat, score: payload.total }),
    };
  }
  return null;
}

const POKER_ACTION_KEYS: Readonly<Record<string, MessageKey>> = {
  fold: 'narration.folded',
  check: 'narration.checked',
  call: 'narration.called',
  bet: 'narration.bet',
  raise: 'narration.raised',
  'all-in': 'narration.allIn',
  blind: 'narration.postedBlind',
  ante: 'narration.postedAnte',
};

function narrateUnplannedAction(event: FxEvent, t: Translator): string | null {
  const payload = payloadOf(event);
  if (typeof payload.seat !== 'number') return null;
  const seat = t('narration.seat', { seat: payload.seat + 1 });

  if (
    event.kind === 'poker.action' ||
    event.kind === 'poker.blind' ||
    event.kind === 'poker.ante'
  ) {
    const key = typeof payload.kind === 'string' ? POKER_ACTION_KEYS[payload.kind] : undefined;
    return key ? t(key, { seat }) : null;
  }
  if (event.kind.endsWith('.pass') || event.kind.endsWith('.bid-pass')) {
    return t('narration.passed', { seat });
  }
  if (event.kind.endsWith('.trick-play') && typeof payload.card === 'string') {
    return t('narration.played', { seat, card: spokenCard(payload.card, t) });
  }
  if (event.kind === 'scopa.capture') return t('narration.captured', { seat });
  return null;
}

function payloadOf(event: FxEvent): Record<string, unknown> {
  return typeof event.payload === 'object' &&
    event.payload !== null &&
    !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : {};
}

function spokenCard(card: string, t: Translator): string {
  return card === '??' ? t('narration.card') : card;
}

/** The card-in-flight chassis: trail, the card itself, and the landing glint. */
export function TableCardFlight({ cueId, children }: { cueId: string; children: ReactNode }) {
  return (
    <div data-fx-cue={cueId} data-card-flight className={styles.flyingCard}>
      <i className={styles.cardTrail} />
      <span data-flight-card className={styles.flightCardVisual}>
        {children}
      </span>
      <i className={styles.cardGlint} />
    </div>
  );
}

/** The ring that pops over a seat when the turn reaches it. */
export function TableTurnPop({ cueId, seat }: { cueId: string; seat: number }) {
  return <span data-fx-cue={cueId} data-seat-burst={seat} className={styles.turnPop} />;
}
