// @parlour/game-spite — Spite & Malice (Skip-Bo family) rules module.
//
// Web-facing contract:
//   Moves: `build` {card, pile, rank} · `discard` {card, pile}
//          (system: drawUp, sit — flow-driven, never offered to clients)
//   State: payoffs (index 0 = face-up top) · discards[seat][pile] ·
//          centre[{cards, nextRank}] · wildRanks · stock · turn · winner
//   FX:    card.fly, card.draw, card.discard, card.flip, stock.shuffle,
//          turn.ring via phases, spite.wild {seat,pile,card,rank},
//          spite.complete {seat,pile,cards}, spite.win {seat}, spite.sit {seat}
//   Presets: classic / quick / cutthroat
export const GAME_ID = 'spite';
export * from './cards';
export { spiteConfig, type SpiteRules } from './config';
export { emptyCentre, type CentrePile, type SpiteState } from './state';
export { fitsNeed, locateCard, spiteGame, type PlaySource } from './game';
export { matchResult, payoffRemaining, progress, rankChasers } from './score';
export { spiteHowToPlay } from './howto';
export { spiteCatalog } from './catalog';
export * from './bots';
export { DEFAULT_THRESHOLDS, runBalanceGates, type GateReport } from './sim/gates';
