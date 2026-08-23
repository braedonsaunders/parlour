import { getAvatar } from '@/lib/avatars';

/** Presentation identity for a seat — the engine knows numbers, people know faces. */
export interface SeatInfo {
  seat: number;
  name: string;
  avatarId: string;
}

export interface SeatView {
  seat: number;
  name: string;
  accent: string;
  shade: string;
}

const FALLBACK_NAME = 'Player';

function displayName(info: SeatInfo, seatCount: number): string {
  const name = info.name.trim();
  if (name) return name;
  const avatar = getAvatar(info.avatarId);
  return avatar ? avatar.name : `${FALLBACK_NAME} ${info.seat + 1}/${seatCount}`;
}

export function toSeatView(info: SeatInfo): SeatView {
  const avatar = getAvatar(info.avatarId);
  return {
    seat: info.seat,
    name: displayName(info, 4),
    accent: avatar.accent,
    shade: avatar.shade,
  };
}
