import type { GameCopyBook } from '../types';
import { blitzPt } from './blitz';
import { cribbagePt } from './cribbage';
import { wildPt } from './wild';
import { ratscrewPt } from './ratscrew';
import { euchrePt } from './euchre';
import { heartsPt } from './hearts';
import { ginPt } from './gin';
import { presidentPt } from './president';
import { spadesPt } from './spades';
import { pokerPt } from './poker';
import { ohhellPt } from './ohhell';
import { scopaPt } from './scopa';
import { spitePt } from './spite';
import { golfPt } from './golf';
import { klondikePt } from './klondike';
import { freecellPt } from './freecell';
import { spiderPt } from './spider';
import { pyramidPt } from './pyramid';
import { eightsPt } from './eights';
import { durakPt } from './durak';
import { palacePt } from './palace';
import { pinochlePt } from './pinochle';
import { tripeaksPt } from './tripeaks';

/** Brazilian Portuguese game copy, one file per shelf entry. */
export const PT_GAMES: GameCopyBook = {
  blitz: blitzPt,
  cribbage: cribbagePt,
  wild: wildPt,
  ratscrew: ratscrewPt,
  euchre: euchrePt,
  hearts: heartsPt,
  gin: ginPt,
  president: presidentPt,
  spades: spadesPt,
  poker: pokerPt,
  ohhell: ohhellPt,
  scopa: scopaPt,
  spite: spitePt,
  klondike: klondikePt,
  golf: golfPt,
  freecell: freecellPt,
  spider: spiderPt,
  pyramid: pyramidPt,
  eights: eightsPt,
  durak: durakPt,
  palace: palacePt,
  pinochle: pinochlePt,
  tripeaks: tripeaksPt,
};
