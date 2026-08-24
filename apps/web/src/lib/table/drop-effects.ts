import { Fx, type FxEvent } from '@parlour/engine';

/**
 * Card-drop effects: the flourish a card throws when it lands on the pile.
 *
 * This mirrors how SFX packs work — the engine emits only `Fx.DiscardCard`, and
 * a per-game pack decides what that card should look like when it hits the
 * table. No game state is inspected here, so a pack is pure presentation and a
 * game without one simply drops cards quietly.
 */

export type DropShape =
  /** Expanding ring — weight and impact. */
  | 'shockwave'
  /** Rotating arcs — direction changed. */
  | 'swirl'
  /** Crossed slashes — someone lost a turn. */
  | 'slash'
  /** Radiating spokes in four colors — a wild landed. */
  | 'prism'
  /** Particles thrown outward — penalties and stacks. */
  | 'sparks'
  /** Two curved trails crossing — hands changed places. */
  | 'trade'
  /** A soft pulse for ordinary cards. */
  | 'ripple';

export interface DropEffect {
  /** Stable id for the React key; unique per burst. */
  id: string;
  shape: DropShape;
  /** CSS color the burst is tinted with. */
  color: string;
  /** 0–1. Drives scale, particle count and opacity. */
  intensity: number;
  /** Delay from the start of the burst, matching the card's flight. */
  atMs: number;
  /** Optional short caption stamped into the burst. */
  glyph?: string;
}

export interface DropEffectPack {
  id: string;
  label: string;
  /** Returns the flourish for a landing card, or null to stay quiet. */
  effectFor(card: string): Omit<DropEffect, 'id' | 'atMs'> | null;
}

const packs = new Map<string, DropEffectPack>();

export function registerDropEffectPack(pack: DropEffectPack): void {
  packs.set(pack.id, pack);
}

export function getDropEffectPack(id: string | null | undefined): DropEffectPack | undefined {
  return packs.get(id ?? '');
}

/** How long a burst stays on screen before it is cleared. */
export const DROP_EFFECT_MS = 900;

/**
 * Reads a burst of engine effects and returns the drops to draw. Cards landing
 * on the discard are the only trigger, so this stays in step with the card
 * flight animation the same events already drive.
 */
export function dropEffectsForFx(
  fx: readonly FxEvent[],
  packId: string | null | undefined,
): DropEffect[] {
  const pack = getDropEffectPack(packId);
  if (!pack) return [];

  return fx.flatMap((event, index): DropEffect[] => {
    if (event.kind !== Fx.DiscardCard && event.kind !== Fx.FlipCard) return [];
    if (payloadOf(event)?.passive === true) return [];
    const card = cardOf(event);
    if (!card) return [];
    const effect = pack.effectFor(card);
    if (!effect) return [];
    return [
      {
        ...effect,
        id: `${index}:${card}`,
        // Land the flourish when the card lands, not when it launches.
        atMs: Math.max(0, event.at ?? 0) + 170,
      },
    ];
  });
}

function payloadOf(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

function cardOf(event: FxEvent): string | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  const card = (event.payload as { card?: unknown }).card;
  return typeof card === 'string' && card.length > 0 ? card : null;
}
