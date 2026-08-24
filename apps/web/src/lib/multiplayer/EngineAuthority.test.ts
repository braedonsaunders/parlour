import {
  createSession,
  defineConfig,
  replaySession,
  stateHash,
  type ConfigFieldValue,
  type ConfigSchema,
  type GameDef,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { EngineAuthority } from './EngineAuthority';
import type { ReplaySnapshot, RoomSettings } from './types';

interface TestConfig {
  openingScore: number;
  doubleMoves: boolean;
  [key: string]: ConfigFieldValue;
}

type TestState = { score: number; seats: number };

const configSchema = defineConfig<TestConfig>([
  { key: 'openingScore', kind: 'int', label: 'Opening score', min: 0, max: 10, default: 1 },
  { key: 'doubleMoves', kind: 'toggle', label: 'Double moves', default: false },
]);

const game: GameDef<TestState, TestConfig> = {
  id: 'authority-test',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema,
  setup: ({ config, seats }) => ({ score: config.openingScore, seats }),
  moves: {
    score: {
      validate: () => true,
      apply: (state) => ({ ...state, score: state.score + 1 }),
    },
    clock: {
      validate: () => true,
      apply: (state, _seat, _payload, ctx) => ({
        ...state,
        score: state.score + (ctx.event.atMs ?? 0),
      }),
    },
  },
  flow: {
    start: () => ({ phase: 'play', actor: 0, round: 1 }),
    legalMoves: () => [{ id: 'score' }],
    advance: (_state, _event, seats) => ({
      phase: { phase: 'play', actor: seats > 1 ? 1 : 0, round: 1 },
    }),
    canInject: (_state, _phase, move) =>
      move === 'clock' ? true : { code: 'bad-injection', message: 'unsupported injection' },
  },
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

function settings(config: TestConfig, seats = 2): RoomSettings {
  return { gameId: game.id, seats, config };
}

function authority(
  config = configSchema.defaults(),
  seats = 2,
  seed = 11,
): EngineAuthority<TestState, TestConfig> {
  return new EngineAuthority({
    def: game,
    session: createSession(game, { seed, config, seats }),
    settings: settings(config, seats),
  });
}

function snapshot(config: TestConfig, seats = 3): ReplaySnapshot {
  const session = replaySession(game, 42, [], { config, seats });
  return {
    seed: session.seed,
    log: [...session.log],
    acceptedActions: [],
    stateHash: stateHash(session.state),
    settings: settings(config, seats),
  };
}

describe('EngineAuthority snapshots', () => {
  it('stamps and broadcasts replay-stable authority time for system injection', () => {
    let now = 1_000;
    const config = configSchema.defaults();
    const injected = new EngineAuthority({
      def: game,
      session: createSession(game, { seed: 5, config, seats: 2 }),
      settings: settings(config),
      now: () => now,
    });
    now = 1_250;

    const packet = injected.inject('clock-1', 'clock');

    expect(packet.events[0]).toMatchObject({
      move: 'clock',
      seat: null,
      injected: true,
      atMs: 250,
      ts: 1_250,
    });
    expect(injected.getSession().state.score).toBe(251);
    const replayed = replaySession(game, 5, injected.getSession().log, { config, seats: 2 });
    expect(replayed.state).toEqual(injected.getSession().state);
  });

  it('adopts a non-default host config on join', () => {
    const hostConfig: TestConfig = { openingScore: 7, doubleMoves: true };
    const guest = authority();

    guest.importSnapshot(snapshot(hostConfig));

    expect(guest.getSession().config).toEqual(hostConfig);
    expect(guest.getSession().state).toEqual({ score: 7, seats: 3 });
  });

  it('replays a resync with the adopted host config', () => {
    const hostConfig: TestConfig = { openingScore: 7, doubleMoves: true };
    const host = authority(hostConfig, 3, 42);
    const guest = authority();
    guest.importSnapshot(host.exportSnapshot());

    host.apply({ id: 'host-score', seat: 0, move: 'score' });
    guest.importSnapshot(host.exportSnapshot());

    expect(guest.getSession().config).toEqual(hostConfig);
    expect(guest.getSession().state).toEqual({ score: 8, seats: 3 });
    expect(guest.getSession().log).toHaveLength(1);
  });

  it('exports adopted settings for host migration', () => {
    const hostConfig: TestConfig = { openingScore: 7, doubleMoves: true };
    const candidate = authority();
    candidate.importSnapshot(snapshot(hostConfig));
    const successor = authority();

    const migrationSnapshot = candidate.exportSnapshot();
    successor.importSnapshot(migrationSnapshot);

    expect(migrationSnapshot.settings).toEqual(settings(hostConfig, 3));
    expect(successor.getSession().config).toEqual(hostConfig);
    expect(successor.getSession().state).toEqual({ score: 7, seats: 3 });
  });

  it('resolves omitted authoritative settings to schema defaults', () => {
    const resolvedConfig: TestConfig = { openingScore: 7, doubleMoves: false };
    const guest = authority();
    const joined = snapshot(resolvedConfig);
    joined.settings.config = { openingScore: 7 };

    guest.importSnapshot(joined);

    expect(guest.getSession().config).toEqual(resolvedConfig);
    expect(guest.exportSnapshot().settings.config).toEqual(resolvedConfig);
  });

  it('rejects tampered config and malformed settings without changing the adopted session', () => {
    const hostConfig: TestConfig = { openingScore: 7, doubleMoves: true };
    const guest = authority();
    const joined = snapshot(hostConfig);
    guest.importSnapshot(joined);
    const adoptedSession = guest.getSession();
    const adoptedSnapshot = guest.exportSnapshot();

    expect(() =>
      guest.importSnapshot({
        ...joined,
        settings: settings({ ...hostConfig, openingScore: 8 }, 3),
      }),
    ).toThrow('snapshot hash mismatch');
    expect(guest.getSession()).toBe(adoptedSession);
    expect(guest.exportSnapshot()).toEqual(adoptedSnapshot);

    expect(() =>
      guest.importSnapshot({
        ...joined,
        settings: {
          ...joined.settings,
          config: { ...hostConfig, openingScore: 99 },
        },
      }),
    ).toThrow('invalid snapshot config');
    expect(guest.getSession()).toBe(adoptedSession);
    expect(guest.exportSnapshot()).toEqual(adoptedSnapshot);
  });

  /**
   * A schema may resolve values that are not house-rule *fields* — Blitz's
   * match-layer `outMask` is the live example. Validating a snapshot against
   * `fields` alone rejected every such config and took the whole P2P sync path
   * down with it, so the contract is "whatever `defaults()` declares".
   */
  describe('configs carrying non-field schema values', () => {
    const extraSchema: ConfigSchema<TestConfig> = {
      fields: configSchema.fields,
      presets: configSchema.presets,
      defaults: () => ({ ...configSchema.defaults(), matchFlag: 0 }),
      resolve: (values) => ({
        ...configSchema.resolve(values),
        matchFlag: typeof values.matchFlag === 'number' ? values.matchFlag : 0,
      }),
    };
    const extraGame: GameDef<TestState, TestConfig> = { ...game, configSchema: extraSchema };
    const extraSettings = (config: TestConfig): RoomSettings => ({
      gameId: extraGame.id,
      seats: 2,
      config,
    });

    function extraAuthority(config: TestConfig) {
      return new EngineAuthority({
        def: extraGame,
        session: createSession(extraGame, { seed: 5, config, seats: 2 }),
        settings: extraSettings(config),
      });
    }

    it('adopts a snapshot whose config carries a non-field schema value', () => {
      const config = extraSchema.resolve({ openingScore: 4, matchFlag: 3 });
      const host = extraAuthority(config);
      const guest = extraAuthority(extraSchema.resolve({ openingScore: 4, matchFlag: 3 }));
      expect(() => guest.importSnapshot(host.exportSnapshot())).not.toThrow();
      expect(guest.exportSnapshot().settings.config).toMatchObject({ matchFlag: 3 });
    });

    it('still rejects a key the schema never declares', () => {
      const config = extraSchema.resolve({ openingScore: 4 });
      const host = extraAuthority(config);
      const guest = extraAuthority(config);
      const tampered = host.exportSnapshot();
      expect(() =>
        guest.importSnapshot({
          ...tampered,
          settings: {
            ...tampered.settings,
            config: { ...config, smuggled: 1 } as unknown as TestConfig,
          },
        }),
      ).toThrow('invalid snapshot config');
    });
  });
});
