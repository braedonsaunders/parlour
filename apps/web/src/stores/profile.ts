import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_AVATAR_ID } from '@/lib/avatars';

export const PROFILE_STORAGE_KEY = 'parlour.profile.v1';

export type ProfileStats = {
  games: number;
  wins: number;
  blitzes: number;
  knocks: number;
  knockWins: number;
  bestStreak: number;
  currentStreak: number;
};

export type ProfileSettings = {
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  lastHouseRulePreset: string;
};

export type MatchOutcome = {
  won: boolean;
  blitzes: number;
  knocks: number;
  knockWins: number;
};

export type ProfileState = {
  name: string;
  avatarId: string;
  stats: ProfileStats;
  settings: ProfileSettings;
  setName: (name: string) => void;
  setAvatarId: (avatarId: string) => void;
  updateSettings: (patch: Partial<ProfileSettings>) => void;
  recordResult: (outcome: MatchOutcome) => void;
  resetStats: () => void;
};

export const EMPTY_STATS: ProfileStats = {
  games: 0,
  wins: 0,
  blitzes: 0,
  knocks: 0,
  knockWins: 0,
  bestStreak: 0,
  currentStreak: 0,
};

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  reducedMotion: false,
  hapticsEnabled: true,
  lastHouseRulePreset: 'classic-pub',
};

export function applyResult(stats: ProfileStats, outcome: MatchOutcome): ProfileStats {
  const currentStreak = outcome.won ? stats.currentStreak + 1 : 0;
  return {
    games: stats.games + 1,
    wins: stats.wins + (outcome.won ? 1 : 0),
    blitzes: stats.blitzes + safeCount(outcome.blitzes),
    knocks: stats.knocks + safeCount(outcome.knocks),
    knockWins: stats.knockWins + safeCount(outcome.knockWins),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
  };
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      avatarId: DEFAULT_AVATAR_ID,
      stats: EMPTY_STATS,
      settings: DEFAULT_PROFILE_SETTINGS,

      setName: (name) => set({ name: name.slice(0, 16).trim() }),
      setAvatarId: (avatarId) => set({ avatarId }),
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      recordResult: (outcome) => set((state) => ({ stats: applyResult(state.stats, outcome) })),
      resetStats: () => set({ stats: EMPTY_STATS }),
    }),
    {
      name: PROFILE_STORAGE_KEY,
      version: 2,
      migrate: (persisted) => {
        if (typeof persisted !== 'object' || persisted === null) return persisted;
        const profile = persisted as Partial<ProfileState>;
        return {
          ...profile,
          stats: { ...EMPTY_STATS, ...(profile.stats ?? {}) },
          settings: { ...DEFAULT_PROFILE_SETTINGS, ...(profile.settings ?? {}) },
        };
      },
      partialize: (state) => ({
        name: state.name,
        avatarId: state.avatarId,
        stats: state.stats,
        settings: state.settings,
      }),
    },
  ),
);

export function winRate(stats: ProfileStats): number {
  return stats.games === 0 ? 0 : stats.wins / stats.games;
}

export function knockSuccessRate(stats: ProfileStats): number {
  return stats.knocks === 0 ? 0 : stats.knockWins / stats.knocks;
}
