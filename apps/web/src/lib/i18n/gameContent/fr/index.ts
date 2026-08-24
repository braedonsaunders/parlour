import type { GameCopyBook } from '../types';
import { blitzFr } from './blitz';
import { cribbageFr } from './cribbage';
import { wildFr } from './wild';
import { ratscrewFr } from './ratscrew';
import { euchreFr } from './euchre';
import { heartsFr } from './hearts';
import { ginFr } from './gin';
import { presidentFr } from './president';
import { spadesFr } from './spades';
import { pokerFr } from './poker';
import { ohhellFr } from './ohhell';
import { scopaFr } from './scopa';
import { spiteFr } from './spite';
import { klondikeFr } from './klondike';
import { eightsFr } from './eights';

/** French game copy, one file per shelf entry. */
export const FR_GAMES: GameCopyBook = {
  blitz: blitzFr,
  cribbage: cribbageFr,
  wild: wildFr,
  ratscrew: ratscrewFr,
  euchre: euchreFr,
  hearts: heartsFr,
  gin: ginFr,
  president: presidentFr,
  spades: spadesFr,
  poker: pokerFr,
  ohhell: ohhellFr,
  scopa: scopaFr,
  spite: spiteFr,
  klondike: klondikeFr,
  eights: eightsFr,
};
