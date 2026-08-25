/**
 * Parlour Veil — opt-in hidden hands for friend rooms, with no game server.
 *
 * Design: apps/web/src/lib/multiplayer/veil. Engine seam: `@parlour/engine`'s
 * veil.ts (opaque handles, reveals recorded on the event log). This directory
 * is the client half: the shuffle ceremony, private dealing, the signed
 * transcript, disconnect recovery and the after-match audit.
 *
 * The honest summary, which the room UI repeats verbatim:
 *
 * - Open tier (the default) gives every peer the whole game state. A modified
 *   client can read any hand. That is fine among friends and it is not a
 *   competitive guarantee.
 * - Veil tier hides hands from every peer, including the host, with no server.
 *   It costs a shuffle ceremony, more messages per hidden card, and a real
 *   disconnect trade-off — two-seat rooms cannot recover a dropped player
 *   without handing the opponent the ability to read a live hand.
 * - Veil detects cheating at the audit rather than preventing all of it. Only a
 *   `verified` result should ever count competitively.
 */

export * from './bytes';
export * from './hash';
export * from './sra';
export * from './signing';
export * from './transcript';
export * from './ceremony';
export * from './shamir';
export * from './recovery';
export * from './audit';
export * from './session';
export * from './room';
export * from './wire';
export * from './material';
