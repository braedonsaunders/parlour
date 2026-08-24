import { beforeEach, describe, expect, it } from 'vitest';
import {
  VeilTranscript,
  entryHash,
  type SignedVeilEntry,
  type VeilRoundHeader,
} from './transcript';
import { createIdentity, resetVerifyKeyCache, signValue, type VeilIdentity } from './signing';

let seats: VeilIdentity[];
let header: VeilRoundHeader;

beforeEach(async () => {
  resetVerifyKeyCache();
  seats = [await createIdentity(), await createIdentity()];
  header = {
    roundId: 'ABCD:7:0',
    gameId: 'blitz',
    rulesHash: 'a'.repeat(64),
    seats: 2,
    keys: seats.map((identity) => identity.publicKey),
    deck: ['S1', 'S2', 'S3'],
  };
});

/** Signs an entry the way an honest peer would, so only the tampering differs. */
async function forge(
  identity: VeilIdentity,
  entry: Omit<SignedVeilEntry, 'hash' | 'signature'>,
): Promise<SignedVeilEntry> {
  const hash = await entryHash(entry);
  return { ...entry, hash, signature: await signValue(identity, 'entry', hash) };
}

describe('the signed chain', () => {
  it('links each entry to the one before it', async () => {
    const transcript = await VeilTranscript.open(header);
    const first = await transcript.append(seats[0]!, 0, 'ceremony.layer', { epoch: 0 });
    const second = await transcript.append(seats[1]!, 1, 'ceremony.layer', { epoch: 0 });
    expect(first.previous).toBe(transcript.headerDigest);
    expect(second.previous).toBe(first.hash);
    expect(transcript.headHash).toBe(second.hash);
    expect(transcript.length).toBe(2);
  });

  it('replays a chain from the wire and re-checks every link', async () => {
    const authored = await VeilTranscript.open(header);
    await authored.append(seats[0]!, 0, 'ceremony.layer', { epoch: 0 });
    await authored.append(seats[1]!, 1, 'ceremony.layer', { epoch: 0 });

    const { transcript, fault } = await VeilTranscript.replay(header, authored.all());
    expect(fault).toBeNull();
    expect(transcript.headHash).toBe(authored.headHash);
  });

  it('rejects an entry that arrives out of sequence', async () => {
    const transcript = await VeilTranscript.open(header);
    const entry = await forge(seats[0]!, {
      seq: 3,
      kind: 'ceremony.layer',
      seat: 0,
      signer: seats[0]!.publicKey,
      previous: transcript.headHash,
      payload: {},
    });
    expect((await transcript.accept(entry))?.code).toBe('bad-sequence');
  });

  it('rejects an entry that does not extend the accepted head', async () => {
    const transcript = await VeilTranscript.open(header);
    const entry = await forge(seats[0]!, {
      seq: 0,
      kind: 'ceremony.layer',
      seat: 0,
      signer: seats[0]!.publicKey,
      previous: 'b'.repeat(64),
      payload: {},
    });
    expect((await transcript.accept(entry))?.code).toBe('broken-chain');
  });

  it('rejects a payload edited after signing', async () => {
    const authored = await VeilTranscript.open(header);
    const entry = await authored.append(seats[0]!, 0, 'ceremony.layer', { epoch: 0 });

    const fresh = await VeilTranscript.open(header);
    const tampered = { ...entry, payload: { epoch: 1 } };
    expect((await fresh.accept(tampered))?.code).toBe('bad-hash');
  });

  it('rejects a seat that is not at this table', async () => {
    const transcript = await VeilTranscript.open(header);
    const entry = await forge(seats[0]!, {
      seq: 0,
      kind: 'ceremony.layer',
      seat: 5,
      signer: seats[0]!.publicKey,
      previous: transcript.headHash,
      payload: {},
    });
    expect((await transcript.accept(entry))?.code).toBe('unknown-seat');
  });

  it('rejects a seat signing with a key the header never registered', async () => {
    const stranger = await createIdentity();
    const transcript = await VeilTranscript.open(header);
    const entry = await forge(stranger, {
      seq: 0,
      kind: 'ceremony.layer',
      seat: 0,
      signer: stranger.publicKey,
      previous: transcript.headHash,
      payload: {},
    });
    expect((await transcript.accept(entry))?.code).toBe('wrong-key');
  });

  it('rejects one seat replaying another seat’s entry under its own number', async () => {
    const transcript = await VeilTranscript.open(header);
    // Seat 1 claims seat 0's slot but is forced to name seat 0's key, which it
    // cannot sign for.
    const entry = await forge(seats[1]!, {
      seq: 0,
      kind: 'ceremony.layer',
      seat: 0,
      signer: seats[0]!.publicKey,
      previous: transcript.headHash,
      payload: {},
    });
    expect((await transcript.accept(entry))?.code).toBe('bad-signature');
  });

  it('rejects a mangled signature without throwing', async () => {
    const authored = await VeilTranscript.open(header);
    const entry = await authored.append(seats[0]!, 0, 'ceremony.layer', { epoch: 0 });
    const fresh = await VeilTranscript.open(header);
    expect((await fresh.accept({ ...entry, signature: 'not base64url !!' }))?.code).toBe(
      'bad-signature',
    );
  });

  it('leaves the head untouched when an entry is rejected', async () => {
    const transcript = await VeilTranscript.open(header);
    const before = transcript.headHash;
    await transcript.accept({
      seq: 0,
      kind: 'ceremony.layer',
      seat: 0,
      signer: seats[0]!.publicKey,
      previous: before,
      payload: {},
      hash: 'c'.repeat(64),
      signature: 'x',
    });
    expect(transcript.headHash).toBe(before);
    expect(transcript.length).toBe(0);
  });

  it('binds the header, so the same entries under different rules do not verify', async () => {
    const authored = await VeilTranscript.open(header);
    await authored.append(seats[0]!, 0, 'ceremony.layer', { epoch: 0 });
    const { fault } = await VeilTranscript.replay(
      { ...header, rulesHash: 'd'.repeat(64) },
      authored.all(),
    );
    expect(fault?.code).toBe('broken-chain');
  });
});
