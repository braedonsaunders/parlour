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

`apps/web/src/lib/rooms/gameRegistry.ts`:

```ts
definePack<MyState, MyRules>({
  id: 'mygame',
  name: 'My Game',
  configSchema: myConfig,
  createDef: createMyDef,
  // optional:
  clampConfig: (config) => ({ ...config, someRoomOnlyNarrowing: 1 }),
  recyclableStock: (state, move) => (move === 'draw' ? spentDiscard(state) : null),
});
```

Friend rooms deal in the open — one replayable log for every title. Veil stays
on the engine as unused protocol; do not add a room-level privacy tier.

Add its seat ring to `apps/web/src/lib/rooms/seatRange.ts`. That is the whole
multiplayer surface: settings validation, session construction, the engine
authority, and bot turns for dropped seats all come from this one object.

## 4. Add a table pack

`apps/web/src/lib/games/tablePacks/<name>.tsx`:

```tsx
export const myTablePack = defineTablePack<Snapshot, Dispatch, Transport, State, Rules>({
  id: 'mygame', // route segment: /mygame, /mygame/table, /mygame/create
  gameId: 'mygame', // the engine def id a room announces

  useSoloDeal() {
    /* read the setup store, return {create, deps} */
  },
  useSoloDriver: turnBasedDriver({ round, botPaceMs }),

  renderPending,
  renderSolo,
  soloReport,
  renderRoom,
  roomReport,
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

## 5. The small registries

None of these is per-game logic; each is a total record that a new game has to
appear in, and most of them fail the build (or a test) until it does. Listed
because "one registry entry and one table pack" is true of the _interesting_
work and quietly untrue of these.

| File                                                    | What it answers                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/package.json`                                 | the workspace dependency on the new pack                              |
| `lib/rooms/seatRange.ts`                                | how wide the room's seat ring is                                      |
| `lib/rooms/tableRoute.ts`                               | where a joined guest lands (total record — a miss is a compile error) |
| `lib/transitions/tableWipe.ts`                          | which routes get the felt wipe on the way in                          |
| `stores/matchFlow.ts`                                   | the podium's mode-id union                                            |
| `lib/audio/sfx.ts`                                      | the game's SFX pack, plus its entry in the registration list          |
| `lib/audio/game-cues.ts`                                | which engine fx map to which sounds                                   |
| `lib/audio/assets.test.ts`                              | `REQUIRED_SOUNDS`, in registration order                              |
| `components/table/shell/table-screen-contract.test.tsx` | one case per shipped table screen                                     |
| `components/setup/setup-screen-contract.test.tsx`       | one entry per shipped setup page                                      |

A game with no bespoke audio still needs a pack: point its namespaced ids at
existing files the way Spades and Crazy Eights do. `validatePack` only requires
the namespace, and sharing a file between two ids is deliberate and safe.

## 6. Translate the chrome

Any new player-facing string goes in `apps/web/src/lib/i18n/messages/en.ts`.
`Messages` is derived from that file, so every other locale stops compiling
until it has the key too — a locale ships complete or not at all.

## 7. Translate the game's own copy

The pack keeps its English. Each language carries an _overlay_ keyed to it, in
`apps/web/src/lib/i18n/gameContent/<locale>/<game>.ts`:

```ts
export const mygameEs: GameCopy = {
  name: '…',
  subtitle: '…',
  tagline: '…',
  description: '…',
  facts: ['…', '…', '…'], // same length as the pack's
  howToPlay: { summary: '…', objective: '…', sections: [/* same order & count */] },
  modes: { classic: { name: '…', tagline: '…', description: '…', facts: [/* … */] } },
  fields: { myToggle: { label: '…', help: '…' } },
  presets: { classic: '…' },
};
```

Register it in that locale's `index.ts` and `gameContent.test.ts` does the rest:
it walks the pack and fails if any string is missing, if any array changed
length, or if a sentence was left in English. A pack edit therefore breaks the
build until the translation catches up — which is the point, because an overlay
cannot otherwise notice that the words underneath it moved.

Every field is optional at runtime, so a partial locale degrades to mixed
language rather than to blank cards.

### Rendering it

- Shelf and rules sheet: `useLocalizedGames()` / `useLocalizedGame(id)`.
- Setup-screen mode tiles: wrap the app's own list —
  `useLocalizedModes('mygame', MYGAME_MODES)` in place of `MYGAME_MODES`.
- Rule settings panel: `useLocalizedSchema('mygame', mygameConfig)`.

The app's `lib/<game>/modes.ts` duplicates the pack's catalog modes under the
same ids, so one translation covers both.
