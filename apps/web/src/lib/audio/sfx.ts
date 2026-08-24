import type { FxEvent } from '@parlour/engine';
import type { SoundDef } from './AudioManager';
import { parlourCuesForFx, wildpileCuesForFx, type SoundCue } from './cues';

export type SfxPack = {
  /** Stable game/plugin id. Every owned sound id must use this as its namespace. */
  id: string;
  label: string;
  sounds: readonly SoundDef[];
  /** Maps deterministic engine fx into presentation-timed audio cues. */
  cuesForFx?: (fx: readonly FxEvent[]) => readonly SoundCue[];
};

export const PARLOUR_SFX = {
  cardDrawStock: 'parlour.card.draw.stock',
  cardDrawDiscard: 'parlour.card.draw.discard',
  cardDiscardFlight: 'parlour.card.discard.flight',
  cardLand: 'parlour.card.land',
  cardFlip: 'parlour.card.flip',
  dealCard: 'parlour.deal.card',
  stockShuffle: 'parlour.stock.shuffle',
  turnReady: 'parlour.turn.ready',
  uiPress: 'parlour.ui.press',
  matchWin: 'parlour.match.win',
  matchLose: 'parlour.match.lose',
} as const;

export const BLITZ_SFX = {
  knock: 'blitz.knock',
  fanfare: 'blitz.fanfare',
  lifeLoss: 'blitz.life.loss',
} as const;

export const WILDPILE_SFX = {
  surge: 'wildpile.wild.surge',
  reverse: 'wildpile.reverse',
  skip: 'wildpile.skip',
  drawStack: 'wildpile.draw-stack',
  color: 'wildpile.color',
  voiceReverse: 'wildpile.voice.reverse',
  voiceSkip: 'wildpile.voice.skip',
  voiceDrawTwo: 'wildpile.voice.draw-two',
  voiceDrawFour: 'wildpile.voice.draw-four',
  voiceStacked: 'wildpile.voice.stacked',
  voiceWild: 'wildpile.voice.wild',
  voiceRed: 'wildpile.voice.red',
  voiceYellow: 'wildpile.voice.yellow',
  voiceGreen: 'wildpile.voice.green',
  voiceBlue: 'wildpile.voice.blue',
  voiceLastCard: 'wildpile.voice.last-card',
} as const;

export const PARLOUR_SFX_PACK: SfxPack = {
  id: 'parlour',
  label: 'Parlour table',
  sounds: [
    sound(PARLOUR_SFX.cardDrawStock, '/audio/sfx/card-draw-stock.mp3', 0.82, 4, 35),
    sound(PARLOUR_SFX.cardDrawDiscard, '/audio/sfx/card-draw-discard.mp3', 0.82, 4, 35),
    sound(PARLOUR_SFX.cardDiscardFlight, '/audio/sfx/card-discard-flight.mp3', 0.72, 4, 35),
    sound(PARLOUR_SFX.cardLand, '/audio/sfx/card-land-table.mp3', 0.88, 5, 35),
    sound(PARLOUR_SFX.cardFlip, '/audio/sfx/card-flip.mp3', 0.82, 4, 35),
    sound(PARLOUR_SFX.dealCard, '/audio/sfx/deal-card.mp3', 0.68, 6, 45),
    sound(PARLOUR_SFX.stockShuffle, '/audio/sfx/stock-shuffle.mp3', 0.72, 1, 500),
    sound(PARLOUR_SFX.turnReady, '/audio/sfx/turn-ready.mp3', 0.54, 2, 100),
    sound(PARLOUR_SFX.uiPress, '/audio/sfx/ui-press.mp3', 0.5, 3, 55),
    sound(PARLOUR_SFX.matchWin, '/audio/sfx/win-celebration.mp3', 0.86, 1, 1_200),
    sound(PARLOUR_SFX.matchLose, '/audio/sfx/lose-sting.mp3', 0.74, 1, 1_200),
  ],
  cuesForFx: parlourCuesForFx,
};

export const BLITZ_SFX_PACK: SfxPack = {
  id: 'blitz',
  label: 'Blitz',
  sounds: [
    sound(BLITZ_SFX.knock, '/audio/sfx/knock-thud.mp3', 0.96, 1, 250),
    sound(BLITZ_SFX.fanfare, '/audio/sfx/blitz-burst.mp3', 0.92, 1, 800),
    sound(BLITZ_SFX.lifeLoss, '/audio/sfx/life-chip-loss.mp3', 0.85, 6, 35),
  ],
};

export const WILDPILE_SFX_PACK: SfxPack = {
  id: 'wildpile',
  label: 'Wild Pile',
  sounds: [
    sound(WILDPILE_SFX.surge, '/audio/sfx/wild-surge.mp3', 0.78, 2, 100),
    sound(WILDPILE_SFX.reverse, '/audio/sfx/reverse-whoosh.mp3', 0.72, 2, 100),
    sound(WILDPILE_SFX.skip, '/audio/sfx/skip-swipe.mp3', 0.72, 2, 100),
    sound(WILDPILE_SFX.drawStack, '/audio/sfx/draw-stack.mp3', 0.78, 2, 100),
    sound(WILDPILE_SFX.color, '/audio/sfx/color-select.mp3', 0.64, 2, 100),
    sound(WILDPILE_SFX.voiceReverse, '/audio/sfx/voice/reverse.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceSkip, '/audio/sfx/voice/skip.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceDrawTwo, '/audio/sfx/voice/draw-two.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceDrawFour, '/audio/sfx/voice/draw-four.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceStacked, '/audio/sfx/voice/stacked.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceWild, '/audio/sfx/voice/wild.mp3', 0.92, 1, 200),
    sound(WILDPILE_SFX.voiceRed, '/audio/sfx/voice/red.mp3', 0.9, 1, 200),
    sound(WILDPILE_SFX.voiceYellow, '/audio/sfx/voice/yellow.mp3', 0.9, 1, 200),
    sound(WILDPILE_SFX.voiceGreen, '/audio/sfx/voice/green.mp3', 0.9, 1, 200),
    sound(WILDPILE_SFX.voiceBlue, '/audio/sfx/voice/blue.mp3', 0.9, 1, 200),
    sound(WILDPILE_SFX.voiceLastCard, '/audio/sfx/voice/last-card.mp3', 0.92, 1, 200),
  ],
  cuesForFx: wildpileCuesForFx,
};

const packs = new Map<string, SfxPack>();
for (const pack of [PARLOUR_SFX_PACK, BLITZ_SFX_PACK, WILDPILE_SFX_PACK]) registerSfxPack(pack);

/** Games/plugins call this once to contribute assets plus their fx-to-audio mapping. */
export function registerSfxPack(pack: SfxPack): void {
  validatePack(pack);
  packs.set(pack.id, pack);
}

export function unregisterSfxPack(id: string): void {
  if (id !== PARLOUR_SFX_PACK.id) packs.delete(id);
}

export function getSfxPack(id: string | null | undefined): SfxPack | undefined {
  return packs.get(id ?? '');
}

export function listSfxPacks(): SfxPack[] {
  return [...packs.values()];
}

/** Shared Parlour sounds plus the selected game's own sounds, ready to preload. */
export function soundDefsForSfxPack(packId: string): SoundDef[] {
  const selected = getSfxPack(packId);
  if (!selected) throw new Error(`Unknown SFX pack: ${packId}`);
  return uniqueSounds(
    selected.id === PARLOUR_SFX_PACK.id
      ? PARLOUR_SFX_PACK.sounds
      : [...PARLOUR_SFX_PACK.sounds, ...selected.sounds],
  );
}

/** Complete built-in/registered library, used by the global preload and asset QA. */
export function allSfxSoundDefs(): SoundDef[] {
  return uniqueSounds([...packs.values()].flatMap((pack) => pack.sounds));
}

/** Layer shared card Foley with the selected game's namespaced event mapping. */
export function soundCuesForFx(fx: readonly FxEvent[], packId: string): SoundCue[] {
  const selected = getSfxPack(packId);
  if (!selected) throw new Error(`Unknown SFX pack: ${packId}`);

  const shared = PARLOUR_SFX_PACK.cuesForFx?.(fx) ?? [];
  const game = selected.id === PARLOUR_SFX_PACK.id ? [] : (selected.cuesForFx?.(fx) ?? []);
  const cues = [...shared, ...game];
  const available = new Set(soundDefsForSfxPack(packId).map((definition) => definition.id));

  for (const cue of cues) {
    if (!available.has(cue.id)) {
      throw new Error(`SFX pack ${packId} mapped an undeclared sound: ${cue.id}`);
    }
  }
  return cues;
}

function sound(
  id: string,
  src: string,
  volume: number,
  cap: number,
  minInterval: number,
): SoundDef {
  return { id, src, channel: 'sfx', volume, cap, minInterval };
}

function validatePack(pack: SfxPack): void {
  if (!/^[a-z][a-z0-9-]*$/.test(pack.id)) throw new Error(`Invalid SFX pack id: ${pack.id}`);
  const ids = new Set<string>();
  for (const definition of pack.sounds) {
    if (!definition.id.startsWith(`${pack.id}.`)) {
      throw new Error(`Sound ${definition.id} must use the ${pack.id}. namespace`);
    }
    if (ids.has(definition.id))
      throw new Error(`Duplicate sound id in ${pack.id}: ${definition.id}`);
    ids.add(definition.id);
  }
}

function uniqueSounds(sounds: readonly SoundDef[]): SoundDef[] {
  const result = new Map<string, SoundDef>();
  for (const definition of sounds) {
    const existing = result.get(definition.id);
    if (existing && existing.src !== definition.src) {
      throw new Error(`Conflicting SFX definition: ${definition.id}`);
    }
    result.set(definition.id, definition);
  }
  return [...result.values()];
}
