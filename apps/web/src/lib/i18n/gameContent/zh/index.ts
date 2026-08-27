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
import { golfZh } from './golf';
import { klondikeZh } from './klondike';
import { freecellZh } from './freecell';
import { spiderZh } from './spider';
import { pyramidZh } from './pyramid';
import { eightsZh } from './eights';
import { durakZh } from './durak';
import { palaceZh } from './palace';
import { pinochleZh } from './pinochle';
import { tripeaksZh } from './tripeaks';

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
  golf: golfZh,
  freecell: freecellZh,
  spider: spiderZh,
  pyramid: pyramidZh,
  eights: eightsZh,
  durak: durakZh,
  palace: palaceZh,
  pinochle: pinochleZh,
  tripeaks: tripeaksZh,
};
