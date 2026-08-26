'use client';

import { useEffect, useMemo, type RefObject } from 'react';
import type { FxEvent } from '@parlour/engine';
import { gsap } from 'gsap';
import { PlayingCard } from '@/components/table/PlayingCard';
import { TableCardFlight, useSolitaireNarration } from '@/components/table/shell';
import { useTableAudio } from '@/components/table/fx-animation';
import { prefersCalmMotion } from '@/lib/table/calm-motion';
import styles from '@/styles/klondike.module.css';
import tableStyles from '@/styles/table.module.css';

type Flight = {
  id: string;
  card: string;
  faceDown: boolean;
  from: string;
  to: string;
  startMs: number;
  durationMs: number;
};

export function KlondikeFxLayer({
  fx,
  fxKey,
  rootRef,
  reduced,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  reduced: boolean;
}) {
  const flights = useMemo(() => planFlights(fx), [fx]);
  useTableAudio(fx, fxKey, 'klondike');
  useSolitaireNarration('klondike', fx, fxKey);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || flights.length === 0) return;
    const calm = reduced || prefersCalmMotion();
    const context = gsap.context(() => {
      if (calm) {
        for (const flight of flights) {
          const element = root.querySelector<HTMLElement>(`[data-fx-cue="${flight.id}"]`);
          if (element) gsap.set(element, { autoAlpha: 0 });
        }
        return;
      }
      const bounds = root.getBoundingClientRect();
      const timeline = gsap.timeline();
      for (const flight of flights) {
        const element = root.querySelector<HTMLElement>(`[data-fx-cue="${flight.id}"]`);
        if (!element) continue;
        const from = zoneCenter(root, bounds, flight.from);
        const to = zoneCenter(root, bounds, flight.to);
        const start = flight.startMs / 1000;
        const duration = Math.max(0.12, flight.durationMs / 1000);
        const card = element.querySelector<HTMLElement>('[data-flight-card]') ?? element;
        const peak =
          Math.min(from.y, to.y) - Math.max(24, Math.hypot(to.x - from.x, to.y - from.y) * 0.13);
        timeline
          .set(element, { x: from.x, y: from.y, autoAlpha: 1 }, start)
          .set(card, { rotate: -5, rotateY: flight.faceDown ? 0 : -12, scale: 0.9 }, start)
          .to(element, { x: to.x, duration, ease: 'power2.inOut' }, start)
          .to(element, { y: peak, duration: duration * 0.48, ease: 'power2.out' }, start)
          .to(
            element,
            { y: to.y, duration: duration * 0.52, ease: 'power2.in' },
            start + duration * 0.48,
          )
          .to(card, { rotate: 0, rotateY: 0, scale: 1, duration, ease: 'sine.inOut' }, start)
          .to(element, { autoAlpha: 0, duration: 0.08 }, start + duration);
      }
    }, root);
    return () => context.revert();
  }, [flights, fxKey, reduced, rootRef]);

  const won = fx.some((event) => event.kind === 'klondike.win');
  const recycled = fx.find((event) => event.kind === 'klondike.stock-recycle');

  return (
    <div className={tableStyles.fxLayer} aria-hidden="true">
      {flights.map((flight) => (
        <TableCardFlight key={`${fxKey}:${flight.id}`} cueId={flight.id}>
          <PlayingCard
            card={flight.faceDown ? undefined : flight.card}
            faceDown={flight.faceDown}
            compact
          />
        </TableCardFlight>
      ))}
      {recycled ? (
        <div className={styles.recycleMoment} data-fx-cue="klondike-recycle">
          Stock ready
        </div>
      ) : null}
      {won ? (
        <div className={styles.winMoment} data-fx-cue="klondike-win" aria-hidden="true">
          <span>♠</span>
          <span>♥</span>
          <strong>Cleared!</strong>
          <span>♦</span>
          <span>♣</span>
        </div>
      ) : null}
    </div>
  );
}

function planFlights(fx: readonly FxEvent[]): Flight[] {
  return fx.flatMap((event, eventIndex) => {
    const payload = record(event.payload);
    if (!payload) return [];
    if (event.kind === 'card.fly' || event.kind === 'card.draw' || event.kind === 'card.flip') {
      const card = payload.card;
      const from = payload.from;
      const to = payload.to;
      if (typeof card !== 'string' || typeof from !== 'string' || typeof to !== 'string') return [];
      return [
        {
          id: `${eventIndex}:${event.kind}`,
          card,
          faceDown: payload.faceDown === true || card === '??',
          from,
          to,
          startMs: Math.max(0, event.at ?? 0),
          durationMs: typeof payload.dur === 'number' ? payload.dur : 200,
        },
      ];
    }
    if (event.kind !== 'klondike.cards-move' || !Array.isArray(payload.cards)) return [];
    if (typeof payload.from !== 'string' || typeof payload.to !== 'string') return [];
    return payload.cards.flatMap((card, cardIndex) =>
      typeof card === 'string'
        ? [
            {
              id: `${eventIndex}:${event.kind}:${cardIndex}`,
              card,
              faceDown: false,
              from: payload.from as string,
              to: payload.to as string,
              startMs: Math.max(0, event.at ?? 0) + cardIndex * 24,
              durationMs: typeof payload.dur === 'number' ? payload.dur : 220,
            },
          ]
        : [],
    );
  });
}

function zoneCenter(root: HTMLElement, bounds: DOMRect, zone: string): { x: number; y: number } {
  const escaped =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(zone) : zone.replace(/"/g, '\\"');
  const anchor = root.querySelector<HTMLElement>(`[data-zone="${escaped}"]`);
  const face = anchor?.querySelector<HTMLElement>('[data-zone-face]') ?? anchor;
  if (!face) return { x: bounds.width / 2, y: bounds.height / 2 };
  const rect = face.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - bounds.left,
    y: rect.top + rect.height / 2 - bounds.top,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
