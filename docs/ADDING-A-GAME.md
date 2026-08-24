# Adding a game

The shelf used to cost about 1,400 lines of app glue per title on top of the
rules themselves — a table page, a create page, a solo transport wrapper, a view
builder, a setup store, and a new branch in each of five `gameId === '…'`
chains inside `roomSession.ts`. Nothing forced those five chains to agree, and
they had already drifted.

They are now one registry entry and one table pack. This is the whole list.

## 1. Write the rules package

`packages/game-<name>/` exporting a `GameDef` (and a `GameCatalogEntry`). This
is the part that is genuinely per-game and always will be. Copy the shape from
`packages/game-spades`.

The engine rules still apply: no `Date.now`, no `Math.random`, no DOM, no
network. ESLint fails the build on all four.

## 2. Add it to the shelf

`apps/web/src/lib/games/shelf.ts` — one line in `SHELF`, one member in
`GameId`. Every picker screen reads from here; none of them change.

## 3. Add a room registry entry — only if it has multiplayer

`apps/web/src/lib/games/roomRegistry.ts`:

```ts
defineRoomGame<MyState, MyRules>({
  gameId: 'mygame',
  def: createMyDef,
  configSchema: myConfig,
  // optional:
  veilRefusal: 'why this game cannot run a veiled room',
  seatsRefusal: { seats: 2, message: 'MyGame rooms need exactly two seats' },
  roomConfig: (config) => ({ ...config, someRoomOnlyNarrowing: 1 }),
  recycleOn: 'draw',   // the move that can exhaust the stock under Veil
});
```

Add its seat ring to `apps/web/src/lib/rooms/seatRange.ts`. That is the whole
multiplayer surface: settings validation, session construction, the engine
authority, bot turns for dropped seats, and the veil recycle rule all come from
this one object.

## 4. Add a table pack

`apps/web/src/lib/games/tablePacks/<name>.tsx`:

```tsx
export const myTablePack = defineTablePack<Snapshot, Dispatch, Transport, State, Rules>({
  id: 'mygame',        // route segment: /mygame, /mygame/table, /mygame/create
  gameId: 'mygame',    // the engine def id a room announces

  useSoloDeal() { /* read the setup store, return {create, deps} */ },
  useSoloDriver: turnBasedDriver({ round, botPaceMs }),

  renderPending, renderSolo, soloReport,
  renderRoom,   roomReport,
});
```

Then the page itself:

```tsx
export default function MyTablePage() {
  return <GameTablePage pack={myTablePack} />;
}
```

`GameTablePage` owns everything that was being copied: choosing between the solo
table and a friend room, deferring the deal by a tick so the route wipe keeps
its first frame, the bot loop, the fx timeline, error plumbing, match reporting,
history, the podium hand-off, and Play Again.

### Escape hatches, for the games that need them

- **`useSoloDriver`** — Rat Screw is real-time and has no bot turn to wait for,
  so it supplies its own driver instead of `turnBasedDriver`.
- **`useSoloEffects` / `useRoomEffects`** — Wild arms turn and match clocks;
  Rat Screw's host arms the authoritative slap-window close.
- **`destroy`** on `useSoloDeal` — for a transport holding timers.
- **`podiumDelayMs`** on a report — President's rank parade runs long.

The screens themselves stay per-game on purpose. `onBid`/`onBidNil` and
`onPass`/`onPlayCard` are the table's own vocabulary, and flattening them into a
shared prop shape would cost more than it saved.

## 5. Translate the chrome

Any new player-facing string goes in `apps/web/src/lib/i18n/messages/en.ts`.
`Messages` is derived from that file, so every other locale stops compiling
until it has the key too — a locale ships complete or not at all.
