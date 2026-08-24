import type { GameCopyBook } from '../types';
import { blitzEs } from './blitz';
import { cribbageEs } from './cribbage';
import { wildEs } from './wild';
import { ratscrewEs } from './ratscrew';
import { euchreEs } from './euchre';
import { heartsEs } from './hearts';
import { ginEs } from './gin';
import { presidentEs } from './president';
import { spadesEs } from './spades';
import { pokerEs } from './poker';
import { ohhellEs } from './ohhell';
import { scopaEs } from './scopa';
import { spiteEs } from './spite';
import { klondikeEs } from './klondike';

/**
 * Spanish game copy, one file per shelf entry.
 *
 * Split by game rather than kept in one file because that is the unit of work:
 * a game's tagline, its rules doc and its house-rule labels are one voice and
 * are written together, and two people translating two games never touch the
 * same file.
 */
export const ES_GAMES: GameCopyBook = {
  blitz: blitzEs,
  cribbage: cribbageEs,
  wild: wildEs,
  ratscrew: ratscrewEs,
  euchre: euchreEs,
  hearts: heartsEs,
  gin: ginEs,
  president: presidentEs,
  spades: spadesEs,
  poker: pokerEs,
  ohhell: ohhellEs,
  scopa: scopaEs,
  spite: spiteEs,
  klondike: klondikeEs,
};
