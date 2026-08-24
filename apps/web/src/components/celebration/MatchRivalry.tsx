'use client';

import { AvatarBadge } from '@/components/AvatarBadge';
import { scoreline, type Rivalry, type RivalStanding, type Tally } from '@/lib/match/rivalry';
import styles from '@/styles/rivalry.module.css';

/**
 * The standings strip under the podium: how the night is going against these
 * exact faces, plus the all-time ledger. Presentation only — every number comes
 * from `deriveRivalry`, so it reads the same for any game on the shelf.
 */
export function MatchRivalry({
  rivalry,
  youName = 'You',
  youAvatarId,
}: {
  rivalry: Rivalry;
  youName?: string;
  youAvatarId?: string;
}) {
  const sitting = rivalry.sittingGames > 1;
  const heading = sitting ? `This sitting · ${rivalry.sittingGames} games` : 'Where you stand';

  return (
    <section
      className={styles.panel}
      aria-label="Head-to-head standings"
      data-testid="match-rivalry"
    >
      <p className={styles.overline}>{heading}</p>
      {rivalry.duel ? (
        <Duel
          standing={rivalry.standings[0]!}
          sitting={sitting}
          youName={youName}
          youAvatarId={youAvatarId}
        />
      ) : (
        <ul className={styles.rows}>
          {rivalry.standings.map((standing) => (
            <Row key={standing.key} standing={standing} sitting={sitting} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Duel({
  standing,
  sitting,
  youName,
  youAvatarId,
}: {
  standing: RivalStanding;
  sitting: boolean;
  youName: string;
  youAvatarId?: string;
}) {
  const primary = sitting ? standing.sitting : standing.allTime;
  return (
    <>
      <p className={styles.verdict} data-testid="rivalry-verdict">
        {verdict(primary, standing.name)}
      </p>
      <div className={styles.duel}>
        <div className={styles.duelSide}>
          {youAvatarId && <AvatarBadge avatarId={youAvatarId} size={44} />}
          <span className={styles.duelName}>{youName}</span>
        </div>
        <span className={styles.duelScore} data-testid="rivalry-score">
          {scoreline(primary)}
        </span>
        <div className={styles.duelSide}>
          <AvatarBadge avatarId={standing.avatarId} size={44} />
          <span className={styles.duelName}>{standing.name}</span>
        </div>
      </div>
      <p className={styles.footnote} data-testid="rivalry-alltime">
        {sitting ? `All time · ${allTimeLine(standing)}` : allTimeLine(standing)}
      </p>
    </>
  );
}

function Row({ standing, sitting }: { standing: RivalStanding; sitting: boolean }) {
  const primary = sitting ? standing.sitting : standing.allTime;
  return (
    <li className={styles.row} data-testid={`rivalry-row-${standing.key}`}>
      <AvatarBadge avatarId={standing.avatarId} size={34} />
      <span className={styles.rowName}>{standing.name}</span>
      <span className={styles.rowScore}>{scoreline(primary)}</span>
      {sitting && <span className={styles.rowNote}>all time {scoreline(standing.allTime)}</span>}
    </li>
  );
}

/** "You lead 3–2" reads better on the winner's screen than a bare scoreline. */
function verdict(tally: Tally, rivalName: string): string {
  if (tally.wins > tally.losses) return `You lead ${tally.wins}–${tally.losses}`;
  if (tally.wins < tally.losses) return `${rivalName} leads ${tally.losses}–${tally.wins}`;
  return `All square at ${tally.wins}–${tally.losses}`;
}

function allTimeLine(standing: RivalStanding): string {
  const { allTime } = standing;
  const matches = `${allTime.games} ${allTime.games === 1 ? 'match' : 'matches'}`;
  return `${scoreline(allTime)} vs ${standing.name} · ${matches}`;
}
