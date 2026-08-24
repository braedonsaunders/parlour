import { Fx, type FxEvent } from '@parlour/engine';

export interface SoundCue {
  id: string;
  atMs: number;
  rate?: number;
}

/** Shared table Foley. Game packs layer their namespaced cues over this stream. */
export function parlourCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  const cues: SoundCue[] = [];
  let dealIndex = 0;
  let drawIndex = 0;

  for (const event of fx) {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case Fx.DealCard:
        cues.push({ id: 'parlour.deal.card', atMs, rate: rateAt(dealIndex++) });
        break;
      case Fx.DrawCard: {
        const source = payloadString(event, 'from');
        cues.push({
          id: source === 'discard' ? 'parlour.card.draw.discard' : 'parlour.card.draw.stock',
          atMs,
          rate: rateAt(drawIndex++),
        });
        break;
      }
      case Fx.DiscardCard:
        cues.push(
          { id: 'parlour.card.discard.flight', atMs },
          {
            id: 'parlour.card.land',
            atMs: atMs + 180,
            rate: rateAt(dealIndex + drawIndex),
          },
        );
        break;
      case Fx.FlipCard:
        cues.push({ id: 'parlour.card.flip', atMs });
        break;
      case Fx.ShuffleStock:
        cues.push({ id: 'parlour.stock.shuffle', atMs });
        break;
      case Fx.TurnRing:
        cues.push({ id: 'parlour.turn.ready', atMs });
        break;
    }
  }

  return cues;
}

/** Wild Pile owns these namespaced engine events and their authored accents. */
export function wildpileCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'wildpile.wild':
        return [{ id: 'wildpile.wild.surge', atMs }];
      case 'wildpile.reverse':
        return [{ id: 'wildpile.reverse', atMs }];
      case 'wildpile.skip':
        return [{ id: 'wildpile.skip', atMs }];
      case 'wildpile.draw-stack':
        return [{ id: 'wildpile.draw-stack', atMs }];
      case 'wildpile.color':
        return [{ id: 'wildpile.color', atMs }];
      default:
        return [];
    }
  });
}

const NATURAL_RATES = [0.97, 1.02, 0.99, 1.04] as const;

function rateAt(index: number): number {
  return NATURAL_RATES[index % NATURAL_RATES.length] ?? 1;
}

function payloadString(event: FxEvent, field: string): string | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  const value = (event.payload as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}
