export type Avatar = {
  id: string;
  name: string;
  /** Seat accent — drives plaque frame, turn ring and life chips. */
  accent: string;
  /** Deeper companion tone for bevels and shadows. */
  shade: string;
};

export const AVATARS: readonly Avatar[] = [
  { id: 'ember', name: 'Ember', accent: '#e29349', shade: '#96471c' },
  { id: 'juniper', name: 'Juniper', accent: '#5fae7b', shade: '#2f6b48' },
  { id: 'cobalt', name: 'Cobalt', accent: '#4ba1ba', shade: '#25586e' },
  { id: 'plum', name: 'Plum', accent: '#a06bb4', shade: '#5c3a6b' },
  { id: 'marigold', name: 'Marigold', accent: '#f0c04e', shade: '#a8741c' },
  { id: 'rust', name: 'Rust', accent: '#c2593f', shade: '#7a2f1f' },
  { id: 'slate', name: 'Slate', accent: '#8ea2ad', shade: '#4a5c67' },
  { id: 'mint', name: 'Mint', accent: '#7fd1c1', shade: '#31776c' },
];

export const DEFAULT_AVATAR_ID = AVATARS[0]!.id;

export function getAvatar(id: string): Avatar {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0]!;
}
