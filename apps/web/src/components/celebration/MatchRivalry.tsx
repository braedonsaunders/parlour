'use client';

import { AvatarBadge } from '@/components/AvatarBadge';
import { scoreline, type Rivalry, type RivalStanding, type Tally } from '@/lib/match/rivalry';
import styles from '@/styles/rivalry.module.css';

/**
 * The standings strip under the podium: how today is going against these exact
 * faces, plus the all-time ledger underneath. Presentation only — every number
 * comes from `deriveRivalry`, so it reads the same for any game on the shelf.
 *
 * The headline is ALWAYS today's record. It used to be today's record or the
 * all-time one depending on how many games the run was up to, which meant the
 * same panel answered two different questions on consecutive screens and
 * looked, from the sofa, like it had forgotten the evening.
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
  const heading = rivalry.todayGames > 1 ? `Today · ${rivalry.todayGames} games` : 'Today';

  return (
    <section
      className={styles.panel}
      aria-label="Head-to-head standings"
      data-testid="match-rivalry"
    >
      <p className={styles.overline}>{heading}</p>
      {rivalry.duel ? (
        <Duel standing={rivalry.standings[0]!} youName={youName} youAvatarId={youAvatarId} />
      ) : (
        <ul
          className={styles.rows}
          style={{ ['--rivalry-count' as string]: rivalry.standings.length }}
        >
          {rivalry.standings.map((standing) => (
            <Row key={standing.key} standing={standing} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Duel({
  standing,
  youName,
  youAvatarId,
}: {
  standing: RivalStanding;
  youName: string;
  youAvatarId?: string;
}) {
  return (
    <>
      <p className={styles.verdict} data-testid="rivalry-verdict">
        {verdict(standing.today, standing.name)}
      </p>
      <div className={styles.duel}>
        <div className={styles.duelSide}>
          {youAvatarId && (
            <AvatarBadge avatarId={youAvatarId} size="var(--rivalry-duel-avatar-size, 44px)" />
          )}
          <span className={styles.duelName}>{youName}</span>
        </div>
        <span className={styles.duelScore} data-testid="rivalry-score">
          {scoreline(standing.today)}
        </span>
        <div className={styles.duelSide}>
          <AvatarBadge avatarId={standing.avatarId} size="var(--rivalry-duel-avatar-size, 44px)" />
          <span className={styles.duelName}>{standing.name}</span>
        </div>
      </div>
      <p className={styles.footnote} data-testid="rivalry-alltime">
        {`All time · ${allTimeLine(standing)}`}
      </p>
    </>
  );
}

function Row({ standing }: { standing: RivalStanding }) {
  return (
    <li className={styles.row} data-testid={`rivalry-row-${standing.key}`}>
      <AvatarBadge avatarId={standing.avatarId} size="var(--rivalry-row-avatar-size, 34px)" />
      <span className={styles.rowName}>{standing.name}</span>
      <span className={styles.rowScore}>{scoreline(standing.today)}</span>
      <span className={styles.rowNote}>all time {scoreline(standing.allTime)}</span>
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
