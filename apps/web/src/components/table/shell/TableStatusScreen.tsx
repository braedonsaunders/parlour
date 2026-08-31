import { useEffect } from 'react';
import styles from '@/styles/table.module.css';

/** The screen every table shows instead of its felt when the transport fails. */
export function TableErrorScreen({ headline, message }: { headline: string; message: string }) {
  // Every table that dies passes through here, so this is the one place a
  // playtester's "the table errored" report is guaranteed to leave a trace.
  useEffect(() => {
    console.error(`[table] ${headline}`, { message, at: new Date().toISOString() });
  }, [headline, message]);
  return (
    <main className={styles.screen}>
      <div className={`${styles.statusPanel} panel-soft`} role="alert">
        <strong>{headline}</strong>
        <span>{message}</span>
      </div>
    </main>
  );
}

/** The screen every table shows before its first view arrives. */
export function TableLoadingScreen({ copy }: { copy: string }) {
  return (
    <main className={styles.screen} aria-busy="true">
      <div className={`${styles.statusPanel} panel-soft`}>
        <span className={styles.loadingPip} />
        <strong>{copy}</strong>
      </div>
    </main>
  );
}
