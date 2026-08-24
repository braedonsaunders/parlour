import type { GameCopyBook } from '../types';
import { blitzZh } from './blitz';
import { cribbageZh } from './cribbage';
import { wildZh } from './wild';
import { ratscrewZh } from './ratscrew';
import { euchreZh } from './euchre';
import { heartsZh } from './hearts';
import { ginZh } from './gin';
import { presidentZh } from './president';
import { spadesZh } from './spades';
import { pokerZh } from './poker';
import { ohhellZh } from './ohhell';
import { scopaZh } from './scopa';
import { spiteZh } from './spite';
import { klondikeZh } from './klondike';
import { eightsZh } from './eights';

/** Simplified Chinese game copy, one file per shelf entry. */
export const ZH_GAMES: GameCopyBook = {
  blitz: blitzZh,
  cribbage: cribbageZh,
  wild: wildZh,
  ratscrew: ratscrewZh,
  euchre: euchreZh,
  hearts: heartsZh,
  gin: ginZh,
  president: presidentZh,
  spades: spadesZh,
  poker: pokerZh,
  ohhell: ohhellZh,
  scopa: scopaZh,
  spite: spiteZh,
  klondike: klondikeZh,
  eights: eightsZh,
};
