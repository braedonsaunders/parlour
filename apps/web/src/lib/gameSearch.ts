import type { GameCatalogEntry } from '@parlour/engine';

type SearchableGame = Pick<
  GameCatalogEntry,
  'name' | 'subtitle' | 'tagline' | 'description' | 'facts'
>;

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function filterGames<T extends SearchableGame>(
  games: readonly T[],
  query: string,
): readonly T[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return games;

  return games.filter((game) => {
    const searchText = normalizeSearchText(
      [game.name, game.subtitle, game.tagline, game.description, ...game.facts].join(' '),
    );
    return terms.every((term) => searchText.includes(term));
  });
}
