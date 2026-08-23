import { Fx, type FxEvent } from '@parlour/engine';

export interface SoundCue {
  id: string;
  atMs: number;
  rate?: number;
}

/** Core table sounds. Set-piece sounds stay owned by celebration timelines. */
export function soundCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  const cues: SoundCue[] = [];
  let dealt = false;

  for (const event of fx) {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case Fx.DealCard:
        if (!dealt) {
          dealt = true;
          cues.push({ id: 'deal.riffle', atMs });
        }
        break;
      case Fx.DrawCard:
        cues.push({ id: 'card.slide', atMs });
        break;
      case Fx.DiscardCard:
        cues.push({ id: 'card.slide', atMs }, { id: 'card.snap', atMs: atMs + 150 });
        break;
      case Fx.FlipCard:
        cues.push({ id: 'card.snap', atMs });
        break;
      case Fx.ShuffleStock:
        cues.push({ id: 'deal.riffle', atMs });
        break;
      case Fx.TurnRing:
        cues.push({ id: 'turn.tick', atMs });
        break;
    }
  }

  return cues;
}
