import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomSignaling, SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomListingPublisher, OwnTableListing } from '@/lib/multiplayer/RoomDirectory';
import type { RoomSettings } from '@/lib/multiplayer/types';
import {
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from './roomSession';

/**
 * Signalling that also keeps a directory, and records every call to it.
 *
 * The room needs no peers for any of this: listing is decided entirely by the
 * host's own snapshot — capacity, seats taken, and whether the lobby is still a
 * lobby — so a stub that announces and lists is the whole world these tests
 * need.
 */
class RecordingSignaling implements RoomSignaling, RoomListingPublisher {
  readonly publicKey = 'a'.repeat(64);
  readonly listed: OwnTableListing[] = [];
  readonly unlisted: string[] = [];
  private readonly rooms = new Map<string, RoomSettings>();

  async announce(code: string, settings: RoomSettings): Promise<void> {
    this.rooms.set(code, settings);
  }

  async resolve(code: string) {
    const settings = this.rooms.get(code);
    if (!settings) throw new Error('Room not found');
    return { hostPubkey: this.publicKey, settings };
  }

  async send(): Promise<void> {}

  subscribe(_code: string, _callback: (sender: string, payload: SignalPayload) => void) {
    return { close: () => undefined };
  }

  close(): void {}

  async list(listing: OwnTableListing): Promise<void> {
    this.listed.push(listing);
  }

  async unlist(code: string): Promise<void> {
    this.unlisted.push(code);
  }

  /** The last row published, which is what a browser would be showing. */
  latest(): OwnTableListing | undefined {
    return this.listed.at(-1);
  }
}

async function hostedSpadesRoom(signaling: RecordingSignaling): Promise<MultiplayerRoomSession> {
  const session = new MultiplayerRoomSession(multiplayerProfile('Rosa', 'ember'), { signaling });
  await session.create({ gameId: 'spades', seats: 4, config: {} });
  return session;
}

/** Lets the debounced republish fall due, then drains its promise. */
async function settle(ms = 1_500): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('open-table listing', () => {
  let signaling: RecordingSignaling;
  let session: MultiplayerRoomSession | null = null;

  beforeEach(() => {
    signaling = new RecordingSignaling();
  });

  afterEach(() => {
    session?.close();
    session = null;
    clearActiveMultiplayerSession();
  });

  it('lists nothing until the host asks', async () => {
    session = await hostedSpadesRoom(signaling);
    expect(session.getSnapshot().listed).toBe(false);
    expect(signaling.listed).toEqual([]);
  });

  it('publishes the game, the capacity and who is already sitting', async () => {
    session = await hostedSpadesRoom(signaling);
    const snapshot = session.getSnapshot();
    session.setListed(true);

    expect(session.getSnapshot().listed).toBe(true);
    expect(signaling.latest()).toEqual({
      code: snapshot.room?.code,
      gameId: 'spades',
      seats: 4,
      filled: 1,
      hostName: 'Rosa',
      // Whatever tier the room actually runs, not a tier this test picked: the
      // browser draws its "veiled" mark from here, and a row that reports the
      // wrong one tells a stranger their hand is private when it is not.
      security: snapshot.settings?.security ?? 'open',
    });
  });

  it('refreshes the row as chairs fill', async () => {
    session = await hostedSpadesRoom(signaling);
    session.setListed(true);
    session.addBot(1);
    await settle();
    expect(signaling.latest()?.filled).toBe(2);
  });

  /**
   * A browser padded with tables nobody can join is the version of this feature
   * players learn to ignore, so the last chair filling takes the row down.
   */
  it('withdraws the row when the last chair fills', async () => {
    session = await hostedSpadesRoom(signaling);
    const code = session.getSnapshot().room!.code;
    session.setListed(true);
    session.addBot(1);
    session.addBot(2);
    session.addBot(3);
    await settle();
    expect(signaling.unlisted).toContain(code);
    expect(signaling.latest()?.filled).not.toBe(4);
  });

  it('takes the table down again when the host unticks the box', async () => {
    session = await hostedSpadesRoom(signaling);
    const code = session.getSnapshot().room!.code;
    session.setListed(true);
    session.setListed(false);
    expect(session.getSnapshot().listed).toBe(false);
    expect(signaling.unlisted).toEqual([code]);
  });

  it('stops advertising a table that has been dealt', async () => {
    session = await hostedSpadesRoom(signaling);
    const code = session.getSnapshot().room!.code;
    session.setListed(true);
    session.addBot(1);
    session.addBot(2);
    session.addBot(3);
    // The host's own shuffle share is hashed asynchronously, so a `start` in
    // the same turn as `create` deals before this device has mixed.
    await settle();
    await session.start();
    expect(session.getSnapshot().stage).toBe('table');
    expect(session.getSnapshot().listed).toBe(false);
    expect(signaling.unlisted).toContain(code);
  });

  it('takes the row down when the host leaves the lobby', async () => {
    session = await hostedSpadesRoom(signaling);
    const code = session.getSnapshot().room!.code;
    session.setListed(true);
    session.close();
    expect(signaling.unlisted).toContain(code);
    expect(session.getSnapshot().listed).toBe(false);
    session = null;
  });

  it('ignores a guest asking to list somebody else’s table', async () => {
    const host = await hostedSpadesRoom(signaling);
    const code = host.getSnapshot().room!.code;
    const guest = new MultiplayerRoomSession(multiplayerProfile('Ada', 'ember'), {
      signaling,
      peerConnection: () => ({}) as unknown as RTCPeerConnection,
    });
    guest.setListed(true);
    expect(guest.getSnapshot().listed).toBe(false);
    expect(signaling.listed).toEqual([]);
    expect(code).toHaveLength(4);
    host.close();
  });

  /**
   * The hermetic Playwright bridge signals fine and has no directory at all.
   * A host on that build must get a toggle that does nothing, not an error.
   */
  it('survives signalling with no directory behind it', async () => {
    const bare = new RecordingSignaling() as RoomSignaling;
    delete (bare as Partial<RoomListingPublisher>).list;
    delete (bare as Partial<RoomListingPublisher>).unlist;
    session = new MultiplayerRoomSession(multiplayerProfile('Rosa', 'ember'), {
      signaling: bare,
    });
    await session.create({ gameId: 'spades', seats: 4, config: {} });
    expect(() => session!.setListed(true)).not.toThrow();
    expect(session.getSnapshot().error).toBeNull();
  });
});
