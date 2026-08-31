import type { RuleValues } from '@parlour/engine';
import { isSeatLeftFault } from '@/lib/multiplayer/veil';
import {
  MultiplayerRoomSession,
  multiplayerSession,
  type MultiplayerGameId,
  type MultiplayerRoomSnapshot,
} from '../roomSession';
import { stepActor, WildClockActor, type ActorReport } from './actors';
import { DuelNet, type LatencyProfile } from './netsim';

/**
 * The duel harness: two full production clients — engine, authority, veil
 * ceremony with real SRA crypto, P2P transport — separated by a simulated
 * network, playing a fast game against each other the way two humans on two
 * phones would.
 *
 * No browser, no Playwright, no shared game state: each side acts only on its
 * own presented snapshot through the moves its table screen can express, and
 * everything between them travels the latency fabric in {@link DuelNet}. One
 * `seed` fixes the deal, both players' choices, and the network schedule, so
 * any failure replays exactly.
 */

export type DuelFaultKind =
  /** the guest's device dies mid-match: links go silent, heartbeats time out */
  | 'guest-crash'
  /** the guest quits cleanly, then a new session rejoins the same seat */
  | 'guest-quit-rejoin';

export interface DuelFault {
  kind: DuelFaultKind;
  /** trigger once the host has this many applied actions in its log */
  afterPlies: number;
  /** for rejoin: how long the seat stays gone before coming back */
  awayMs?: number;
}

export interface DuelOptions {
  gameId: MultiplayerGameId;
  seed: number;
  config?: RuleValues;
  signalLatency?: LatencyProfile;
  dataLatency?: LatencyProfile;
  /** actor think time between actions — small, because these games are fast */
  paceMs?: LatencyProfile;
  fault?: DuelFault;
  /** wall-clock budget for the whole duel */
  maxMs?: number;
  /** no observable progress for this long while playing = a wedged table */
  stallMs?: number;
  /** probability an actor picks uniformly instead of playing well */
  chaos?: number;
  /** veiled round's reconnect grace, forwarded to both sessions */
  reconnectGraceMs?: number;
}

export interface DuelReport {
  gameId: MultiplayerGameId;
  seed: number;
  outcome: 'completed' | 'walkover' | 'stalled' | 'budget-exhausted' | 'setup-failed';
  /** applied actions in the host log at the end */
  plies: number;
  durationMs: number;
  /** hard failures: each entry is a bug to chase */
  violations: string[];
  /** Wild turn-clock injections that fired — each one is a seat that sat a full clock */
  clockRescues: number;
  staleTaps: number;
  /** the stall diagnostic, when outcome is 'stalled' */
  diagnostic?: string;
}

const DEFAULT_PACE: LatencyProfile = { minMs: 5, maxMs: 30 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(
  assertion: () => void,
  timeoutMs: number,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await sleep(intervalMs);
    }
  }
}

/** The error a player would actually see (seat-left is suppressed by the UI). */
function visibleError(snapshot: MultiplayerRoomSnapshot): string | null {
  return isSeatLeftFault(snapshot.error) ? null : snapshot.error;
}

function describePeer(name: string, snapshot: MultiplayerRoomSnapshot): string {
  const session = snapshot.session;
  const phase = session?.phase;
  return [
    `${name}: stage=${snapshot.stage} conn=${snapshot.connection} seat=${snapshot.localSeat}`,
    `  session: status=${session?.status} log=${session?.log.length} phase=${phase?.phase} actor=${phase?.actor} actors=${JSON.stringify(phase?.actors ?? null)}`,
    `  security: ceremony=${JSON.stringify(snapshot.security.ceremony)} paused=${JSON.stringify(snapshot.security.paused)} waitingOn=${JSON.stringify(snapshot.security.waitingOn ?? null)} recovered=${JSON.stringify(snapshot.security.recoveredSeats)}`,
    `  error=${JSON.stringify(snapshot.error)} dealFault=${JSON.stringify(snapshot.dealFault)}`,
  ].join('\n');
}

/** Progress signature: when this stops changing, nothing observable is moving. */
function progressSignature(peers: readonly MultiplayerRoomSession[]): string {
  return peers
    .map((peer) => {
      const snapshot = peer.getSnapshot();
      return [
        snapshot.stage,
        snapshot.session?.log.length ?? -1,
        snapshot.session?.status ?? 'none',
        snapshot.security.ceremony.laid,
        snapshot.security.paused ? 'paused' : 'live',
        snapshot.security.waitingOn?.seat ?? '-',
        snapshot.error ?? '',
      ].join(':');
    })
    .join('|');
}

export async function runDuel(options: DuelOptions): Promise<DuelReport> {
  const started = Date.now();
  const net = new DuelNet({
    seed: options.seed,
    signal: options.signalLatency,
    data: options.dataLatency,
  });
  const pace = options.paceMs ?? DEFAULT_PACE;
  const maxMs = options.maxMs ?? 90_000;
  const stallMs = options.stallMs ?? 12_000;
  const label = (side: string) => `duel-${options.gameId}-${options.seed}-${side}`;
  const violations: string[] = [];
  const sessions: MultiplayerRoomSession[] = [];
  const report: ActorReport = { errors: [], staleTaps: 0, sent: 0 };

  const makeSession = (side: string, seat: number) => {
    const session = new MultiplayerRoomSession(
      { name: `P${seat}`, avatarId: 'ember', profileId: label(side) },
      {
        signaling: net.signaling(label(side)),
        peerConnection: net.rtcFactory(label(side)),
        seed: options.seed * 7919 + seat,
        heartbeatIntervalMs: 40,
        heartbeatTimeoutMs: 400,
        reconnectGraceMs: options.reconnectGraceMs ?? 1_500,
      },
    );
    sessions.push(session);
    return session;
  };

  const host = makeSession('host', 0);
  let guest = makeSession('guest', 1);

  const finish = (
    outcome: DuelReport['outcome'],
    clock: WildClockActor,
    diagnostic?: string,
  ): DuelReport => {
    for (const session of sessions) session.close();
    violations.push(...report.errors.map((error) => `actor: ${error}`));
    return {
      gameId: options.gameId,
      seed: options.seed,
      outcome,
      plies: host.getSnapshot().session?.log.length ?? 0,
      durationMs: Date.now() - started,
      violations,
      clockRescues: clock.rescues,
      staleTaps: report.staleTaps,
      ...(diagnostic ? { diagnostic } : {}),
    };
  };

  const clock = new WildClockActor();

  // -------------------------------------------------------------------------
  // Lobby: create, join, start — the same calls the create/join pages make.
  // -------------------------------------------------------------------------
  try {
    const room = await host.create({
      gameId: options.gameId,
      seats: 2,
      security: 'veil',
      ...(options.config ? { config: options.config } : {}),
    });
    await guest.join(room.code);
    await eventually(() => {
      if (guest.getSnapshot().localSeat !== 1) throw new Error('guest not seated');
      if (host.getSnapshot().seats.filter((seat) => seat.connected).length !== 2) {
        throw new Error('host does not see both seats');
      }
    }, 10_000);
    await host.start();
    await eventually(() => {
      if (host.getSnapshot().stage !== 'table') throw new Error('host not at table');
      if (guest.getSnapshot().stage !== 'table') throw new Error('guest not at table');
    }, 20_000);
    if (host.getSnapshot().security.tier !== 'veil') {
      violations.push(
        `the table dealt at tier "${host.getSnapshot().security.tier}" after veil was requested`,
      );
    }
  } catch (error) {
    violations.push(`setup: ${error instanceof Error ? error.message : String(error)}`);
    return finish('setup-failed', clock, describePeer('host', host.getSnapshot()));
  }

  // -------------------------------------------------------------------------
  // Play loop: both seats act on their own snapshots at their own pace.
  // -------------------------------------------------------------------------
  const drawPace = () => pace.minMs + net.rng.float() * Math.max(0, pace.maxMs - pace.minMs);
  const nextActAt = new Map<MultiplayerRoomSession, number>();
  let faultFired = false;
  let guestGone = false;
  let rejoinAt: number | null = null;
  let lastSignature = '';
  let lastProgressAt = Date.now();

  const livePeers = () => (guestGone ? [host] : [host, guest]);

  while (Date.now() - started < maxMs) {
    const now = Date.now();

    // Fault schedule.
    const fault = options.fault;
    if (fault && !faultFired && (host.getSnapshot().session?.log.length ?? 0) >= fault.afterPlies) {
      faultFired = true;
      guestGone = true;
      if (fault.kind === 'guest-crash') {
        net.crash(label('guest'));
      } else {
        guest.close();
        rejoinAt = now + (fault.awayMs ?? 500);
      }
    }
    if (rejoinAt !== null && now >= rejoinAt) {
      rejoinAt = null;
      // Same profileId: the round material restores from storage, which is the
      // "same phone reopened the app" path.
      guest = makeSession('guest', 1);
      try {
        await guest.join(host.getSnapshot().room!.code);
        guestGone = false;
      } catch (error) {
        violations.push(`rejoin: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Wild's host-side clocks.
    if (options.gameId === 'wildpile') clock.step(host, now);

    // Actors.
    for (const peer of livePeers()) {
      const due = nextActAt.get(peer) ?? 0;
      if (now < due) continue;
      stepActor(peer, options.gameId, net.rng, report, options.chaos ?? 0.15);
      nextActAt.set(peer, now + drawPace());
    }

    // A player-visible error is a finding the moment it appears.
    for (const peer of livePeers()) {
      const error = visibleError(peer.getSnapshot());
      if (error && !violations.some((known) => known.endsWith(error))) {
        violations.push(`surfaced error: ${error}`);
      }
      const fault = peer.getSnapshot().dealFault;
      if (fault && !violations.some((known) => known.endsWith(fault))) {
        violations.push(`deal fault: ${fault}`);
      }
    }

    // Done?
    const hostSession = host.getSnapshot().session;
    const hostDone = hostSession?.status === 'ended';
    const guestDone = guestGone || guest.getSnapshot().session?.status === 'ended';
    if (hostDone && guestDone) break;

    // Stalled?
    const signature = progressSignature(livePeers());
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = now;
    } else if (now - lastProgressAt > stallMs) {
      const diagnostic = [
        `stalled after ${now - lastProgressAt} ms without progress; in-flight=${net.inFlight()}`,
        describePeer('host', host.getSnapshot()),
        ...(guestGone ? [] : [describePeer('guest', guest.getSnapshot())]),
      ].join('\n');
      violations.push('the table wedged: no progress while a game was live');
      return finish('stalled', clock, diagnostic);
    }

    await sleep(4);
  }

  if (host.getSnapshot().session?.status !== 'ended') {
    violations.push('the duel ran out its wall-clock budget before the game ended');
    return finish(
      'budget-exhausted',
      clock,
      [
        describePeer('host', host.getSnapshot()),
        ...(guestGone ? [] : [describePeer('guest', guest.getSnapshot())]),
      ].join('\n'),
    );
  }

  // -------------------------------------------------------------------------
  // Endgame invariants.
  // -------------------------------------------------------------------------
  const hostFinal = multiplayerSession<unknown, never>(host.getSnapshot(), options.gameId);
  const walkover = hostFinal?.result?.reason === 'opponent-left';

  if (!guestGone) {
    try {
      await eventually(() => {
        const left = multiplayerSession<unknown, never>(host.getSnapshot(), options.gameId);
        const right = multiplayerSession<unknown, never>(guest.getSnapshot(), options.gameId);
        if (!left || !right) throw new Error('a peer lost its session at the end');
        if (left.log.length !== right.log.length) {
          throw new Error(
            `log lengths diverged: host=${left.log.length} guest=${right.log.length}`,
          );
        }
        if (left.lastAppliedHash !== right.lastAppliedHash) {
          throw new Error(
            `state hashes diverged at ply ${left.log.length}: host=${left.lastAppliedHash} guest=${right.lastAppliedHash}`,
          );
        }
        if (JSON.stringify(left.result) !== JSON.stringify(right.result)) {
          throw new Error(
            `results diverged: host=${JSON.stringify(left.result)} guest=${JSON.stringify(right.result)}`,
          );
        }
      }, 5_000);
    } catch (error) {
      violations.push(
        `convergence: ${error instanceof Error ? error.message : String(error)}\n${describePeer('host', host.getSnapshot())}\n${describePeer('guest', guest.getSnapshot())}`,
      );
    }
  } else if (options.fault?.kind === 'guest-crash' && !walkover) {
    violations.push(
      `a two-seat table lost its opponent but did not award the walkover: result=${JSON.stringify(hostFinal?.result)} paused=${JSON.stringify(host.getSnapshot().security.paused)}`,
    );
  }

  for (const peer of guestGone ? [host] : [host, guest]) {
    const error = visibleError(peer.getSnapshot());
    if (error) violations.push(`ended with a player-visible error: ${error}`);
    if (peer.getSnapshot().security.paused) {
      violations.push(`ended still paused: ${peer.getSnapshot().security.paused}`);
    }
  }

  return finish(walkover ? 'walkover' : 'completed', clock);
}
