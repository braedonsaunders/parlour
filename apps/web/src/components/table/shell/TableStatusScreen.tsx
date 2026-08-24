import styles from '@/styles/table.module.css';

/** The screen every table shows instead of its felt when the transport fails. */
export function TableErrorScreen({ headline, message }: { headline: string; message: string }) {
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
