import type { FxEvent } from '@parlour/engine';
import type { SoundDef } from './AudioManager';
import { blitzCuesForFx, parlourCuesForFx, wildpileCuesForFx, type SoundCue } from './cues';
import {
  cribbageCuesForFx,
  eightsCuesForFx,
  euchreCuesForFx,
  ginCuesForFx,
  heartsCuesForFx,
  golfCuesForFx,
  klondikeCuesForFx,
  freecellCuesForFx,
  spiderCuesForFx,
  pyramidCuesForFx,
  tripeaksCuesForFx,
  presidentCuesForFx,
  palaceCuesForFx,
  pinochleCuesForFx,
  durakCuesForFx,
  ratscrewCuesForFx,
  pokerCuesForFx,
  ohhellCuesForFx,
  spiteCuesForFx,
  scopaCuesForFx,
  spadesCuesForFx,
} from './game-cues';

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
  clockTick: 'parlour.clock.tick',
  timeUp: 'parlour.time.up',
  uiPress: 'parlour.ui.press',
  roomPlayerJoined: 'parlour.room.player-joined',
  roomPlayerLeft: 'parlour.room.player-left',
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
  caught: 'wildpile.caught',
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

export const HEARTS_SFX = {
  passCommit: 'hearts.pass-commit',
  trickSweep: 'hearts.trick-sweep',
  pointHeart: 'hearts.point-heart',
  queenDrop: 'hearts.queen-drop',
  heartsBroken: 'hearts.hearts-broken',
  moonShoot: 'hearts.moon-shoot',
} as const;

export const EUCHRE_SFX = {
  orderUp: 'euchre.order-up',
  trumpCalled: 'euchre.trump-called',
  pass: 'euchre.pass',
  alone: 'euchre.alone',
  dealerPickup: 'euchre.dealer-pickup',
  trickCollect: 'euchre.trick-collect',
  euchreSting: 'euchre.euchre-sting',
  marchFanfare: 'euchre.march-fanfare',
  scoreChime: 'euchre.score-chime',
} as const;

/**
 * Spades ships no new audio. Every id below points at an existing parlour
 * asset chosen for its gesture, not its former game: `validatePack` requires
 * the `spades.` namespace, and `uniqueSounds` only objects when one id claims
 * two different files, so sharing a file across packs is deliberate and safe.
 */
export const SPADES_SFX = {
  bid: 'spades.bid',
  bidNil: 'spades.bid-nil',
  bidsComplete: 'spades.bids-complete',
  trickCollect: 'spades.trick-collect',
  spadesBroken: 'spades.spades-broken',
  nilMade: 'spades.nil-made',
  nilFailed: 'spades.nil-failed',
  set: 'spades.set',
  contractMade: 'spades.contract-made',
  bagPenalty: 'spades.bag-penalty',
  scoreChime: 'spades.score-chime',
} as const;

export const POKER_SFX = {
  chipsSoft: 'poker.chips-soft',
  chipsHard: 'poker.chips-hard',
  fold: 'poker.fold',
  check: 'poker.check',
  board: 'poker.board',
  pot: 'poker.pot',
  award: 'poker.award',
  bust: 'poker.bust',
  blindsUp: 'poker.blinds-up',
} as const;

export const GOLF_SFX = {
  draw: 'golf.draw',
  move: 'golf.move',
  holeOut: 'golf.hole-out',
  win: 'golf.win',
} as const;

export const KLONDIKE_SFX = {
  draw: 'klondike.draw',
  recycle: 'klondike.recycle',
  move: 'klondike.move',
  flip: 'klondike.flip',
  foundation: 'klondike.foundation',
  win: 'klondike.win',
} as const;

export const FREECELL_SFX = {
  move: 'freecell.move',
  park: 'freecell.park',
  foundation: 'freecell.foundation',
  win: 'freecell.win',
} as const;

export const SPIDER_SFX = {
  deal: 'spider.deal',
  move: 'spider.move',
  flip: 'spider.flip',
  suitClear: 'spider.suit-clear',
  win: 'spider.win',
} as const;

export const PYRAMID_SFX = {
  draw: 'pyramid.draw',
  recycle: 'pyramid.recycle',
  pair: 'pyramid.pair',
  king: 'pyramid.king',
  holeOut: 'pyramid.hole-out',
  win: 'pyramid.win',
} as const;

export const TRIPEAKS_SFX = {
  flip: 'tripeaks.flip',
  move: 'tripeaks.move',
  recycle: 'tripeaks.recycle',
  holeOut: 'tripeaks.hole-out',
  win: 'tripeaks.win',
} as const;

export const DURAK_SFX = {
  beat: 'durak.beat',
  pickup: 'durak.pickup',
  transfer: 'durak.transfer',
} as const;

export const PALACE_SFX = {
  burn: 'palace.burn',
  flipDown: 'palace.flip-down',
  pickup: 'palace.pickup',
  out: 'palace.out',
} as const;

export const PINOCHLE_SFX = {
  bid: 'pinochle.bid',
  pass: 'pinochle.pass',
  trump: 'pinochle.trump',
  meld: 'pinochle.meld',
  trickCollect: 'pinochle.trick-collect',
  contractMade: 'pinochle.contract-made',
  set: 'pinochle.set',
  scoreChime: 'pinochle.score-chime',
} as const;

export const GIN_SFX = {
  knock: 'gin.knock',
  gin: 'gin.gin',
  bigGin: 'gin.big-gin',
  undercut: 'gin.undercut',
} as const;

export const CRIBBAGE_SFX = {
  pegMove: 'cribbage.peg-move',
  scoreRun: 'cribbage.score-run',
  scorePair: 'cribbage.score-pair',
  scoreFifteen: 'cribbage.score-fifteen',
  thirtyone: 'cribbage.thirtyone',
  goKnock: 'cribbage.go-knock',
  heels: 'cribbage.heels',
  cribSlide: 'cribbage.crib-slide',
  showReveal: 'cribbage.show-reveal',
  skunk: 'cribbage.skunk',
} as const;

export const RATSCREW_SFX = {
  slapWin: 'ratscrew.slap-win',
  mislap: 'ratscrew.mislap',
  windowOpen: 'ratscrew.window-open',
  challenge: 'ratscrew.challenge',
  scoop: 'ratscrew.scoop',
  burn: 'ratscrew.burn',
  comeback: 'ratscrew.comeback',
} as const;

/**
 * Crazy Eights ships no new audio. Every id points at an existing parlour asset
 * chosen for its gesture: `validatePack` only requires the `eights.` namespace,
 * and `uniqueSounds` objects only when one id claims two different files.
 */
export const EIGHTS_SFX = {
  wild: 'eights.wild',
  suit: 'eights.suit',
  skip: 'eights.skip',
  reverse: 'eights.reverse',
  drawStack: 'eights.draw-stack',
  out: 'eights.out',
  blocked: 'eights.blocked',
  score: 'eights.score',
} as const;

export const PRESIDENT_SFX = {
  setSlam: 'president.set-slam',
  pass: 'president.pass',
  pileClear: 'president.pile-clear',
  crown: 'president.crown',
  scum: 'president.scum',
  roleChime: 'president.role-chime',
  exchangeSwish: 'president.exchange-swish',
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
    sound(PARLOUR_SFX.turnReady, '/audio/sfx/turn-ready.mp3', 0.72, 2, 100),
    sound(PARLOUR_SFX.clockTick, '/audio/sfx/clock-tick.mp3', 0.8, 4, 120),
    sound(PARLOUR_SFX.timeUp, '/audio/sfx/cards-time-up.mp3', 0.95, 1, 800),
    sound(PARLOUR_SFX.uiPress, '/audio/sfx/ui-press.mp3', 0.5, 3, 55),
    sound(PARLOUR_SFX.roomPlayerJoined, '/audio/sfx/president-role-chime.mp3', 0.58, 1, 220),
    sound(PARLOUR_SFX.roomPlayerLeft, '/audio/sfx/president-pass.mp3', 0.42, 1, 220),
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
  cuesForFx: blitzCuesForFx,
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
    sound(WILDPILE_SFX.caught, '/audio/sfx/wild-caught.mp3', 0.78, 2, 150),
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

export const HEARTS_SFX_PACK: SfxPack = {
  id: 'hearts',
  label: 'Hearts',
  sounds: [
    sound(HEARTS_SFX.passCommit, '/audio/sfx/hearts-pass-commit.mp3', 0.78, 2, 100),
    sound(HEARTS_SFX.trickSweep, '/audio/sfx/hearts-trick-sweep.mp3', 0.78, 2, 100),
    sound(HEARTS_SFX.pointHeart, '/audio/sfx/hearts-point-heart.mp3', 0.72, 3, 80),
    sound(HEARTS_SFX.queenDrop, '/audio/sfx/hearts-queen-drop.mp3', 0.86, 1, 250),
    sound(HEARTS_SFX.heartsBroken, '/audio/sfx/hearts-hearts-broken.mp3', 0.8, 1, 250),
    sound(HEARTS_SFX.moonShoot, '/audio/sfx/hearts-moon-shoot.mp3', 0.9, 1, 800),
  ],
  cuesForFx: heartsCuesForFx,
};

export const EUCHRE_SFX_PACK: SfxPack = {
  id: 'euchre',
  label: 'Euchre',
  sounds: [
    sound(EUCHRE_SFX.orderUp, '/audio/sfx/euchre-order-up.mp3', 0.76, 2, 100),
    sound(EUCHRE_SFX.trumpCalled, '/audio/sfx/euchre-trump-called.mp3', 0.76, 2, 100),
    sound(EUCHRE_SFX.pass, '/audio/sfx/euchre-pass.mp3', 0.58, 4, 60),
    sound(EUCHRE_SFX.alone, '/audio/sfx/euchre-alone.mp3', 0.84, 1, 300),
    sound(EUCHRE_SFX.dealerPickup, '/audio/sfx/euchre-dealer-pickup.mp3', 0.74, 2, 100),
    sound(EUCHRE_SFX.trickCollect, '/audio/sfx/euchre-trick-collect.mp3', 0.76, 2, 100),
    sound(EUCHRE_SFX.euchreSting, '/audio/sfx/euchre-euchre-sting.mp3', 0.86, 1, 500),
    sound(EUCHRE_SFX.marchFanfare, '/audio/sfx/euchre-march-fanfare.mp3', 0.88, 1, 500),
    sound(EUCHRE_SFX.scoreChime, '/audio/sfx/euchre-score-chime.mp3', 0.68, 6, 50),
  ],
  cuesForFx: euchreCuesForFx,
};

export const SPADES_SFX_PACK: SfxPack = {
  id: 'spades',
  label: 'Spades',
  sounds: [
    sound(SPADES_SFX.bid, '/audio/sfx/euchre-order-up.mp3', 0.7, 4, 60),
    sound(SPADES_SFX.bidNil, '/audio/sfx/gin-knock-rap.mp3', 0.86, 1, 250),
    sound(SPADES_SFX.bidsComplete, '/audio/sfx/euchre-trump-called.mp3', 0.74, 1, 250),
    sound(SPADES_SFX.trickCollect, '/audio/sfx/euchre-trick-collect.mp3', 0.76, 2, 100),
    sound(SPADES_SFX.spadesBroken, '/audio/sfx/hearts-hearts-broken.mp3', 0.8, 1, 250),
    sound(SPADES_SFX.nilMade, '/audio/sfx/president-crown.mp3', 0.85, 1, 500),
    sound(SPADES_SFX.nilFailed, '/audio/sfx/euchre-euchre-sting.mp3', 0.86, 1, 500),
    sound(SPADES_SFX.set, '/audio/sfx/euchre-euchre-sting.mp3', 0.86, 1, 500),
    sound(SPADES_SFX.contractMade, '/audio/sfx/euchre-march-fanfare.mp3', 0.88, 1, 500),
    sound(SPADES_SFX.bagPenalty, '/audio/sfx/life-chip-loss.mp3', 0.82, 2, 150),
    sound(SPADES_SFX.scoreChime, '/audio/sfx/euchre-score-chime.mp3', 0.68, 6, 50),
  ],
  cuesForFx: spadesCuesForFx,
};

export const POKER_SFX_PACK: SfxPack = {
  id: 'poker',
  label: 'Poker',
  sounds: [
    sound(POKER_SFX.chipsSoft, '/audio/sfx/poker-chips-soft.mp3', 0.8, 4, 55),
    sound(POKER_SFX.chipsHard, '/audio/sfx/poker-chips-hard.mp3', 0.85, 3, 90),
    sound(POKER_SFX.fold, '/audio/sfx/poker-fold.mp3', 0.78, 3, 60),
    sound(POKER_SFX.check, '/audio/sfx/poker-check.mp3', 0.8, 2, 120),
    sound(POKER_SFX.board, '/audio/sfx/poker-board.mp3', 0.82, 4, 60),
    sound(POKER_SFX.pot, '/audio/sfx/poker-pot.mp3', 0.84, 2, 150),
    sound(POKER_SFX.award, '/audio/sfx/poker-award.mp3', 0.86, 1, 500),
    sound(POKER_SFX.bust, '/audio/sfx/poker-bust.mp3', 0.86, 1, 500),
    sound(POKER_SFX.blindsUp, '/audio/sfx/poker-blinds-up.mp3', 0.8, 1, 500),
  ],
  cuesForFx: pokerCuesForFx,
};

export const OHHELL_SFX = {
  trump: 'ohhell.trump',
  bid: 'ohhell.bid',
  bidsComplete: 'ohhell.bids-complete',
  trickCollect: 'ohhell.trick-collect',
  score: 'ohhell.score',
  matchScore: 'ohhell.match-score',
} as const;

export const OHHELL_SFX_PACK: SfxPack = {
  id: 'ohhell',
  label: 'Oh Hell!',
  sounds: [
    sound(OHHELL_SFX.trump, '/audio/sfx/euchre-trump-called.mp3', 0.74, 1, 250),
    sound(OHHELL_SFX.bid, '/audio/sfx/euchre-order-up.mp3', 0.7, 6, 60),
    sound(OHHELL_SFX.bidsComplete, '/audio/sfx/gin-knock-rap.mp3', 0.8, 1, 250),
    sound(OHHELL_SFX.trickCollect, '/audio/sfx/euchre-trick-collect.mp3', 0.76, 2, 100),
    sound(OHHELL_SFX.score, '/audio/sfx/euchre-score-chime.mp3', 0.68, 8, 50),
    sound(OHHELL_SFX.matchScore, '/audio/sfx/euchre-march-fanfare.mp3', 0.88, 1, 500),
  ],
  cuesForFx: ohhellCuesForFx,
};

export const SPITE_SFX = {
  wild: 'spite.wild',
  complete: 'spite.complete',
  win: 'spite.win',
  discard: 'spite.discard',
  draw: 'spite.draw',
} as const;

export const SPITE_SFX_PACK: SfxPack = {
  id: 'spite',
  label: 'Spite & Malice',
  sounds: [
    sound(SPITE_SFX.wild, '/audio/sfx/card-flip.mp3', 0.76, 3, 60),
    sound(SPITE_SFX.complete, '/audio/sfx/stock-shuffle.mp3', 0.82, 1, 400),
    sound(SPITE_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
    sound(SPITE_SFX.discard, '/audio/sfx/card-discard-flight.mp3', 0.7, 4, 45),
    sound(SPITE_SFX.draw, '/audio/sfx/card-draw-stock.mp3', 0.72, 4, 60),
  ],
  cuesForFx: spiteCuesForFx,
};

export const SCOPA_SFX = {
  capture: 'scopa.capture',
  pose: 'scopa.pose',
  scopa: 'scopa.scopa',
  sweep: 'scopa.sweep',
  score: 'scopa.score',
} as const;

export const SCOPA_SFX_PACK: SfxPack = {
  id: 'scopa',
  label: 'Scopa',
  sounds: [
    sound(SCOPA_SFX.capture, '/audio/sfx/euchre-trick-collect.mp3', 0.78, 3, 80),
    sound(SCOPA_SFX.pose, '/audio/sfx/card-discard-flight.mp3', 0.68, 4, 45),
    sound(SCOPA_SFX.scopa, '/audio/sfx/president-crown.mp3', 0.86, 1, 400),
    sound(SCOPA_SFX.sweep, '/audio/sfx/stock-shuffle.mp3', 0.76, 1, 400),
    sound(SCOPA_SFX.score, '/audio/sfx/euchre-score-chime.mp3', 0.68, 8, 50),
  ],
  cuesForFx: scopaCuesForFx,
};

export const GOLF_SFX_PACK: SfxPack = {
  id: 'golf',
  label: 'Golf',
  sounds: [
    sound(GOLF_SFX.draw, '/audio/sfx/card-draw-stock.mp3', 0.74, 3, 70),
    sound(GOLF_SFX.move, '/audio/sfx/card-discard-flight.mp3', 0.68, 4, 45),
    sound(GOLF_SFX.holeOut, '/audio/sfx/euchre-score-chime.mp3', 0.72, 1, 400),
    sound(GOLF_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: golfCuesForFx,
};

export const KLONDIKE_SFX_PACK: SfxPack = {
  id: 'klondike',
  label: 'Klondike',
  sounds: [
    sound(KLONDIKE_SFX.draw, '/audio/sfx/card-draw-stock.mp3', 0.74, 3, 70),
    sound(KLONDIKE_SFX.recycle, '/audio/sfx/stock-shuffle.mp3', 0.72, 1, 400),
    sound(KLONDIKE_SFX.move, '/audio/sfx/card-discard-flight.mp3', 0.68, 4, 45),
    sound(KLONDIKE_SFX.flip, '/audio/sfx/card-flip.mp3', 0.78, 3, 60),
    sound(KLONDIKE_SFX.foundation, '/audio/sfx/euchre-score-chime.mp3', 0.62, 4, 60),
    sound(KLONDIKE_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: klondikeCuesForFx,
};

export const GIN_SFX_PACK: SfxPack = {
  id: 'gin',
  label: 'Gin Rummy',
  sounds: [
    sound(GIN_SFX.knock, '/audio/sfx/gin-knock-rap.mp3', 0.88, 1, 300),
    sound(GIN_SFX.gin, '/audio/sfx/gin-burst.mp3', 0.88, 1, 700),
    sound(GIN_SFX.bigGin, '/audio/sfx/gin-big-gin.mp3', 0.92, 1, 900),
    sound(GIN_SFX.undercut, '/audio/sfx/gin-undercut-sting.mp3', 0.84, 1, 500),
  ],
  cuesForFx: ginCuesForFx,
};

export const CRIBBAGE_SFX_PACK: SfxPack = {
  id: 'cribbage',
  label: 'Cribbage',
  sounds: [
    sound(CRIBBAGE_SFX.pegMove, '/audio/cribbage/peg-move.mp3', 0.7, 5, 40),
    sound(CRIBBAGE_SFX.scoreRun, '/audio/cribbage/score-run.mp3', 0.72, 3, 60),
    sound(CRIBBAGE_SFX.scorePair, '/audio/cribbage/score-pair.mp3', 0.74, 3, 60),
    sound(CRIBBAGE_SFX.scoreFifteen, '/audio/cribbage/score-fifteen.mp3', 0.7, 3, 60),
    sound(CRIBBAGE_SFX.thirtyone, '/audio/cribbage/count-thirtyone.mp3', 0.82, 2, 120),
    sound(CRIBBAGE_SFX.goKnock, '/audio/cribbage/go-knock.mp3', 0.72, 2, 100),
    sound(CRIBBAGE_SFX.heels, '/audio/cribbage/heels-flourish.mp3', 0.82, 1, 300),
    sound(CRIBBAGE_SFX.cribSlide, '/audio/cribbage/crib-slide.mp3', 0.72, 2, 100),
    sound(CRIBBAGE_SFX.showReveal, '/audio/cribbage/show-reveal.mp3', 0.74, 3, 80),
    sound(CRIBBAGE_SFX.skunk, '/audio/cribbage/skunk-sting.mp3', 0.84, 1, 500),
  ],
  cuesForFx: cribbageCuesForFx,
};

export const RATSCREW_SFX_PACK: SfxPack = {
  id: 'ratscrew',
  label: 'Egyptian Ratscrew',
  sounds: [
    sound(RATSCREW_SFX.slapWin, '/audio/sfx/ratscrew/slap-win.mp3', 0.94, 2, 80),
    sound(RATSCREW_SFX.mislap, '/audio/sfx/ratscrew/mislap.mp3', 0.82, 2, 100),
    sound(RATSCREW_SFX.windowOpen, '/audio/sfx/ratscrew/window-open.mp3', 0.56, 2, 80),
    sound(RATSCREW_SFX.challenge, '/audio/sfx/ratscrew/challenge.mp3', 0.76, 2, 100),
    sound(RATSCREW_SFX.scoop, '/audio/sfx/ratscrew/scoop.mp3', 0.8, 2, 100),
    sound(RATSCREW_SFX.burn, '/audio/sfx/ratscrew/burn.mp3', 0.72, 2, 100),
    sound(RATSCREW_SFX.comeback, '/audio/sfx/ratscrew/comeback.mp3', 0.8, 1, 250),
  ],
  cuesForFx: ratscrewCuesForFx,
};

export const PRESIDENT_SFX_PACK: SfxPack = {
  id: 'president',
  label: 'President',
  sounds: [
    sound(PRESIDENT_SFX.setSlam, '/audio/sfx/president-set-slam.mp3', 0.85, 2, 100),
    sound(PRESIDENT_SFX.pass, '/audio/sfx/president-pass.mp3', 0.55, 2, 80),
    sound(PRESIDENT_SFX.pileClear, '/audio/sfx/president-pile-clear.mp3', 0.72, 2, 100),
    sound(PRESIDENT_SFX.crown, '/audio/sfx/president-crown.mp3', 0.85, 1, 600),
    sound(PRESIDENT_SFX.scum, '/audio/sfx/president-scum.mp3', 0.78, 1, 600),
    sound(PRESIDENT_SFX.roleChime, '/audio/sfx/president-role-chime.mp3', 0.68, 2, 120),
    sound(PRESIDENT_SFX.exchangeSwish, '/audio/sfx/president-exchange-swish.mp3', 0.72, 2, 100),
  ],
  cuesForFx: presidentCuesForFx,
};

export const EIGHTS_SFX_PACK: SfxPack = {
  id: 'eights',
  label: 'Crazy Eights',
  sounds: [
    sound(EIGHTS_SFX.wild, '/audio/sfx/wild-surge.mp3', 0.78, 2, 100),
    sound(EIGHTS_SFX.suit, '/audio/sfx/color-select.mp3', 0.64, 2, 100),
    sound(EIGHTS_SFX.skip, '/audio/sfx/skip-swipe.mp3', 0.72, 2, 100),
    sound(EIGHTS_SFX.reverse, '/audio/sfx/reverse-whoosh.mp3', 0.72, 2, 100),
    sound(EIGHTS_SFX.drawStack, '/audio/sfx/draw-stack.mp3', 0.78, 2, 100),
    sound(EIGHTS_SFX.out, '/audio/sfx/blitz-burst.mp3', 0.88, 1, 700),
    sound(EIGHTS_SFX.blocked, '/audio/sfx/euchre-euchre-sting.mp3', 0.82, 1, 500),
    sound(EIGHTS_SFX.score, '/audio/sfx/euchre-score-chime.mp3', 0.68, 6, 50),
  ],
  cuesForFx: eightsCuesForFx,
};

export const FREECELL_SFX_PACK: SfxPack = {
  id: 'freecell',
  label: 'FreeCell',
  sounds: [
    sound(FREECELL_SFX.move, '/audio/sfx/card-discard-flight.mp3', 0.68, 4, 45),
    sound(FREECELL_SFX.park, '/audio/sfx/freecell-park.mp3', 0.74, 4, 40),
    sound(FREECELL_SFX.foundation, '/audio/sfx/freecell-home.mp3', 0.72, 4, 50),
    sound(FREECELL_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: freecellCuesForFx,
};

export const SPIDER_SFX_PACK: SfxPack = {
  id: 'spider',
  label: 'Spider',
  sounds: [
    sound(SPIDER_SFX.deal, '/audio/sfx/spider-row-deal.mp3', 0.76, 2, 80),
    sound(SPIDER_SFX.move, '/audio/sfx/card-discard-flight.mp3', 0.68, 4, 45),
    sound(SPIDER_SFX.flip, '/audio/sfx/card-flip.mp3', 0.78, 3, 60),
    sound(SPIDER_SFX.suitClear, '/audio/sfx/spider-suit-clear.mp3', 0.86, 2, 200),
    sound(SPIDER_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: spiderCuesForFx,
};

export const PYRAMID_SFX_PACK: SfxPack = {
  id: 'pyramid',
  label: 'Pyramid',
  sounds: [
    sound(PYRAMID_SFX.draw, '/audio/sfx/card-draw-stock.mp3', 0.74, 3, 70),
    sound(PYRAMID_SFX.recycle, '/audio/sfx/stock-shuffle.mp3', 0.72, 1, 400),
    sound(PYRAMID_SFX.pair, '/audio/sfx/pyramid-pair.mp3', 0.78, 4, 40),
    sound(PYRAMID_SFX.king, '/audio/sfx/pyramid-king.mp3', 0.76, 3, 50),
    sound(PYRAMID_SFX.holeOut, '/audio/sfx/pyramid-hole-out.mp3', 0.72, 1, 400),
    sound(PYRAMID_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: pyramidCuesForFx,
};

export const TRIPEAKS_SFX_PACK: SfxPack = {
  id: 'tripeaks',
  label: 'TriPeaks',
  sounds: [
    sound(TRIPEAKS_SFX.flip, '/audio/sfx/card-draw-stock.mp3', 0.74, 3, 70),
    sound(TRIPEAKS_SFX.move, '/audio/sfx/tripeaks-play.mp3', 0.78, 4, 45),
    sound(TRIPEAKS_SFX.recycle, '/audio/sfx/stock-shuffle.mp3', 0.72, 1, 400),
    sound(TRIPEAKS_SFX.holeOut, '/audio/sfx/tripeaks-hole-out.mp3', 0.72, 1, 400),
    sound(TRIPEAKS_SFX.win, '/audio/sfx/win-celebration.mp3', 0.88, 1, 1_000),
  ],
  cuesForFx: tripeaksCuesForFx,
};

export const DURAK_SFX_PACK: SfxPack = {
  id: 'durak',
  label: 'Durak',
  sounds: [
    sound(DURAK_SFX.beat, '/audio/sfx/durak-beat.mp3', 0.82, 4, 45),
    sound(DURAK_SFX.pickup, '/audio/sfx/durak-pickup.mp3', 0.78, 2, 150),
    sound(DURAK_SFX.transfer, '/audio/sfx/durak-transfer.mp3', 0.72, 3, 80),
  ],
  cuesForFx: durakCuesForFx,
};

export const PALACE_SFX_PACK: SfxPack = {
  id: 'palace',
  label: 'Palace',
  sounds: [
    sound(PALACE_SFX.burn, '/audio/sfx/palace/burn.mp3', 0.85, 2, 100),
    sound(PALACE_SFX.flipDown, '/audio/sfx/palace/flip-down.mp3', 0.74, 3, 60),
    sound(PALACE_SFX.pickup, '/audio/sfx/palace/pickup.mp3', 0.72, 2, 100),
    sound(PALACE_SFX.out, '/audio/sfx/blitz-burst.mp3', 0.85, 1, 600),
  ],
  cuesForFx: palaceCuesForFx,
};

export const PINOCHLE_SFX_PACK: SfxPack = {
  id: 'pinochle',
  label: 'Pinochle',
  sounds: [
    sound(PINOCHLE_SFX.bid, '/audio/sfx/pinochle-bid.mp3', 0.8, 2, 120),
    sound(PINOCHLE_SFX.pass, '/audio/sfx/euchre-pass.mp3', 0.58, 4, 60),
    sound(PINOCHLE_SFX.trump, '/audio/sfx/euchre-trump-called.mp3', 0.76, 2, 100),
    sound(PINOCHLE_SFX.meld, '/audio/sfx/pinochle-meld.mp3', 0.85, 4, 90),
    sound(PINOCHLE_SFX.trickCollect, '/audio/sfx/euchre-trick-collect.mp3', 0.76, 2, 100),
    sound(PINOCHLE_SFX.contractMade, '/audio/sfx/euchre-march-fanfare.mp3', 0.88, 1, 500),
    sound(PINOCHLE_SFX.set, '/audio/sfx/pinochle-set.mp3', 0.86, 1, 500),
    sound(PINOCHLE_SFX.scoreChime, '/audio/sfx/euchre-score-chime.mp3', 0.68, 6, 50),
  ],
  cuesForFx: pinochleCuesForFx,
};

const packs = new Map<string, SfxPack>();

/**
 * The set of sound ids a pack is allowed to name, built once per pack.
 *
 * The cue check runs on every burst of effects a table plays, and it was
 * rebuilding the pack's entire manifest — the shared Foley layer concatenated
 * with the game's, de-duplicated — and a Set over it each time, for a list that
 * is fixed the moment the pack is registered. Registering or unregistering a
 * pack drops its entry, so the guard stays exactly as strict as it was.
 */
const declaredSounds = new Map<string, ReadonlySet<string>>();

for (const pack of [
  PARLOUR_SFX_PACK,
  BLITZ_SFX_PACK,
  WILDPILE_SFX_PACK,
  HEARTS_SFX_PACK,
  EUCHRE_SFX_PACK,
  SPADES_SFX_PACK,
  POKER_SFX_PACK,
  OHHELL_SFX_PACK,
  SPITE_SFX_PACK,
  SCOPA_SFX_PACK,
  GOLF_SFX_PACK,
  KLONDIKE_SFX_PACK,
  GIN_SFX_PACK,
  CRIBBAGE_SFX_PACK,
  RATSCREW_SFX_PACK,
  PRESIDENT_SFX_PACK,
  EIGHTS_SFX_PACK,
  FREECELL_SFX_PACK,
  SPIDER_SFX_PACK,
  PYRAMID_SFX_PACK,
  TRIPEAKS_SFX_PACK,
  DURAK_SFX_PACK,
  PALACE_SFX_PACK,
  PINOCHLE_SFX_PACK,
]) {
  registerSfxPack(pack);
}

/** Games/plugins call this once to contribute assets plus their fx-to-audio mapping. */
export function registerSfxPack(pack: SfxPack): void {
  validatePack(pack);
  packs.set(pack.id, pack);
  declaredSounds.delete(pack.id);
}

export function unregisterSfxPack(id: string): void {
  if (id !== PARLOUR_SFX_PACK.id) packs.delete(id);
  declaredSounds.delete(id);
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

function soundIdsForPack(packId: string): ReadonlySet<string> {
  const cached = declaredSounds.get(packId);
  if (cached) return cached;
  const ids = new Set(soundDefsForSfxPack(packId).map((definition) => definition.id));
  declaredSounds.set(packId, ids);
  return ids;
}

/** Layer shared card Foley with the selected game's namespaced event mapping. */
export function soundCuesForFx(fx: readonly FxEvent[], packId: string): SoundCue[] {
  const selected = getSfxPack(packId);
  if (!selected) throw new Error(`Unknown SFX pack: ${packId}`);

  const shared = PARLOUR_SFX_PACK.cuesForFx?.(fx) ?? [];
  const game = selected.id === PARLOUR_SFX_PACK.id ? [] : (selected.cuesForFx?.(fx) ?? []);
  const cues = [...shared, ...game];
  const available = soundIdsForPack(packId);

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
