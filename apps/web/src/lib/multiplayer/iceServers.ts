/**
 * Where a peer connection looks for a path to the other side.
 *
 * ## The honest position on the default TURN relay
 *
 * STUN is enough for most players: it tells a client its public address so two
 * peers can meet directly. Some networks — symmetric NATs, a lot of corporate
 * and carrier-grade setups — refuse to make that work, and those pairs need a
 * relay to carry the traffic between them.
 *
 * parlour ships with a **free, shared, public** relay as its default. That is a
 * deliberate trade and it comes with a real caveat:
 *
 * - **Confidentiality is fine.** WebRTC data channels are DTLS-encrypted end to
 *   end, so the relay forwards ciphertext it cannot read. Under Veil it cannot
 *   read the cards either, because those are encrypted a second time by the
 *   ceremony.
 * - **Availability is not.** It is a shared free service with no capacity
 *   promise to parlour. When it is rate-limited or down, the players who need
 *   it — and only those players — cannot connect, which looks from the inside
 *   like "multiplayer is broken" rather than "the relay is busy".
 *
 * For a product whose whole claim is "there is no server", depending on
 * somebody else's server for the hard cases should be a stated default rather
 * than a buried constant. So it is configurable: set the environment variables
 * below at build time to point at your own relay, or supply servers directly
 * when constructing the transport.
 *
 * ## Configuring your own
 *
 * ```
 * NEXT_PUBLIC_PARLOUR_TURN_URLS=turns:turn.example.org:443
 * NEXT_PUBLIC_PARLOUR_TURN_USERNAME=parlour
 * NEXT_PUBLIC_PARLOUR_TURN_CREDENTIAL=…
 * NEXT_PUBLIC_PARLOUR_STUN_URLS=stun:stun.example.org:3478   # optional
 * ```
 *
 * Setting the TURN variables *replaces* the bundled relay rather than adding to
 * it, so an operator who configures their own is not silently still falling
 * back to a shared one.
 */

/** Public STUN, used when nothing else is configured. */
export const DEFAULT_STUN_URLS = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302',
] as const;

/**
 * The bundled fallback relay. Free and shared — see the caveat above. Exported
 * so the room UI can tell a player which relay a connection is leaning on.
 */
export const FALLBACK_TURN: RTCIceServer = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turns:openrelay.metered.ca:443',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

export interface IceConfig {
  stunUrls?: string;
  turnUrls?: string;
  turnUsername?: string;
  turnCredential?: string;
}

function splitUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Builds the ICE server list for a room.
 *
 * A configured TURN server needs credentials to be usable, so one supplied
 * without them is ignored rather than handed to the browser as a server that
 * will fail every allocation.
 */
export function iceServersFrom(config: IceConfig): RTCIceServer[] {
  const stun = splitUrls(config.stunUrls);
  const servers: RTCIceServer[] = [{ urls: stun.length > 0 ? stun : [...DEFAULT_STUN_URLS] }];

  const turn = splitUrls(config.turnUrls);
  if (turn.length > 0 && config.turnUsername && config.turnCredential) {
    servers.push({
      urls: turn,
      username: config.turnUsername,
      credential: config.turnCredential,
    });
    return servers;
  }

  servers.push(FALLBACK_TURN);
  return servers;
}

/**
 * True when this build is relaying through the shared public server.
 *
 * The room badge uses it to say so out loud — a table that may drop because a
 * free relay is busy should not present itself as unconditionally reliable.
 */
export function usesFallbackRelay(servers: readonly RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
    return urls.some((url) => url.includes('openrelay.metered.ca'));
  });
}

/**
 * The default list for this build, read from `NEXT_PUBLIC_*` at bundle time.
 *
 * Next inlines these, so they must be referenced as whole property accesses
 * rather than looked up dynamically.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = iceServersFrom({
  stunUrls: process.env.NEXT_PUBLIC_PARLOUR_STUN_URLS,
  turnUrls: process.env.NEXT_PUBLIC_PARLOUR_TURN_URLS,
  turnUsername: process.env.NEXT_PUBLIC_PARLOUR_TURN_USERNAME,
  turnCredential: process.env.NEXT_PUBLIC_PARLOUR_TURN_CREDENTIAL,
});
