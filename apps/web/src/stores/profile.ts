import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_AVATAR_ID } from '@/lib/avatars';

export const PROFILE_STORAGE_KEY = 'parlour.profile.v1';

export type ProfileStats = {
  games: number;
  wins: number;
  blitzes: number;
  knockWins: number;
  bestStreak: number;
  currentStreak: number;
};

export type ProfileSettings = {
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  lastHouseRulePreset: string;
};

export type RoundOutcome = {
  won: boolean;
  blitzed?: boolean;
  wonByKnock?: boolean;
};

export type ProfileState = {
  name: string;
  avatarId: string;
  stats: ProfileStats;
  settings: ProfileSettings;
  setName: (name: string) => void;
  setAvatarId: (avatarId: string) => void;
  updateSettings: (patch: Partial<ProfileSettings>) => void;
  recordResult: (outcome: RoundOutcome) => void;
  resetStats: () => void;
};

export const EMPTY_STATS: ProfileStats = {
  games: 0,
  wins: 0,
  blitzes: 0,
  knockWins: 0,
  bestStreak: 0,
  currentStreak: 0,
};

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  reducedMotion: false,
  hapticsEnabled: true,
  lastHouseRulePreset: 'classic-pub',
};

export function applyResult(stats: ProfileStats, outcome: RoundOutcome): ProfileStats {
  const currentStreak = outcome.won ? stats.currentStreak + 1 : 0;
  return {
    games: stats.games + 1,
    wins: stats.wins + (outcome.won ? 1 : 0),
    blitzes: stats.blitzes + (outcome.blitzed ? 1 : 0),
    knockWins: stats.knockWins + (outcome.won && outcome.wonByKnock ? 1 : 0),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
  };
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
      version: 1,
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
