# M4 multiplayer acceptance

The automated exit criterion for this slice is `pnpm --filter @parlour/web test` passing the
multiplayer suites. They assert that:

- room codes are four characters from the unambiguous alphabet and deep links normalize safely;
- room discovery requires a three-relay publish quorum and signaling payloads are encrypted;
- repeated action ids apply once, host loss elects the lowest live peer, and pending actions survive
  migration;
- silent links expire after 3.5 seconds, dropped humans become bots, and the same profile reclaims its
  seat on rejoin;
- emotes are allowlisted and rate limited; and
- a mismatched deterministic state hash requests and imports an authoritative replay snapshot.

The browser transport itself must additionally pass TypeScript and production Next.js build gates,
which exercise the native WebRTC and Nostr integration surfaces.
