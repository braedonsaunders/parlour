'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocalizedGames } from '@/lib/i18n/gameContent';
import { useT } from '@/lib/i18n';
import {
  browseOpenTables,
  type OpenTableBrowser,
  type OpenTableListing,
} from '@/lib/multiplayer/RoomDirectory';

/**
 * The room browser: tables whose hosts said strangers are welcome.
 *
 * Discovery only. Nothing here can announce, answer, or seat anybody — it
 * watches the relays for rows and hands a code and a host key back to the join
 * screen, which joins by exactly the path a typed code takes. That the host key
 * comes with the row is the quiet upside of browsing over typing: a picked
 * table is host-pinned, so the squatter a four-character code cannot defend
 * against is refused before the first offer.
 */

type OpenTablesProps = {
  onPick(code: string, hostPubkey: string): void;
  /** Injected by tests; production browses the configured relays. */
  browse?: typeof browseOpenTables;
  disabled?: boolean;
};

/**
 * True when this page is running on the hermetic signalling bridge.
 *
 * The multi-context browser suite hands each page a bus that lives in the test
 * runner precisely so the suite never touches a public relay. Browsing would
 * walk straight past that and open eleven WebSockets to the internet from every
 * join screen the suite renders — slow where there is a network and hanging
 * where there is not. A bridged page has no directory to read, so it shows the
 * same thing it would if the relays answered with nothing.
 */
function useHermeticPage(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => '__PARLOUR_E2E_SIGNALING__' in window,
    () => false,
  );
}

export function OpenTables({ onPick, browse = browseOpenTables, disabled }: OpenTablesProps) {
  const t = useT();
  const games = useLocalizedGames();
  const hermetic = useHermeticPage();
  const [tables, setTables] = useState<readonly OpenTableListing[]>([]);
  const [relaysReplied, setRelaysReplied] = useState(false);
  const settled = relaysReplied || hermetic;

  const nameFor = useMemo(() => {
    // Shelf ids and room ids are not the same vocabulary — the shelf calls
    // wildpile "wild" — so the catalogue is keyed by the id a room announces.
    const byRoomId = new Map(games.map((game) => [game.gameId, game.name]));
    return (gameId: string) => byRoomId.get(gameId) ?? gameId;
  }, [games]);

  useEffect(() => {
    if (hermetic) return;
    const browser: OpenTableBrowser = browse({
      onChange: setTables,
      onSettled: () => setRelaysReplied(true),
    });
    return () => browser.close();
  }, [browse, hermetic]);

  return (
    <section className="w-full max-w-xl text-left" aria-labelledby="open-tables-heading">
      <h2
        id="open-tables-heading"
        className="text-xs font-bold uppercase tracking-[0.25em] text-dusk-200"
      >
        {t('browse.heading')}
      </h2>

      {tables.length === 0 ? (
        <p className="panel-soft mt-3 px-4 py-3 text-sm text-dusk-100/85" role="status">
          {settled ? t('browse.empty') : t('browse.searching')}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="open-tables">
          {tables.map((table) => (
            <li key={`${table.hostPubkey}:${table.code}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(table.code, table.hostPubkey)}
                data-testid="open-table"
                data-code={table.code}
                className="panel-soft flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-transform duration-150 ease-pop hover:-translate-y-0.5 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <strong className="font-display block truncate text-dusk-50">
                    {nameFor(table.gameId)}
                  </strong>
                  <span className="block truncate text-sm text-dusk-100/85">
                    {t('browse.hostedBy', { host: table.hostName })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* The exception is marked, not the rule. Every room parlour
                      deals today is veiled, so a "Veiled" pill on every row is
                      furniture — but a table announced by an older build still
                      deals in the open, and that is worth knowing before you
                      sit down with a stranger. */}
                  {table.security !== 'veil' && (
                    <span className="pill-soft text-[0.65rem] uppercase tracking-[0.2em] text-dusk-200">
                      {t('browse.openHands')}
                    </span>
                  )}
                  <span className="pill-soft text-sm font-bold text-hearth-200">
                    {t.count('browse.seatsOpen', table.seats - table.filled)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-dusk-200">{t('browse.strangersNote')}</p>
    </section>
  );
}
