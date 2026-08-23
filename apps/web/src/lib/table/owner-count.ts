import { bestSuit } from '@parlour/game-blitz';

type HandOwner = {
  hand: readonly string[];
  isLocal?: boolean;
};

export function ownerCurrentCount(players: readonly HandOwner[]): number | null {
  const owner = players.find(({ isLocal }) => isLocal);
  if (!owner) return null;
  return bestSuit(owner.hand)?.value ?? 0;
}
