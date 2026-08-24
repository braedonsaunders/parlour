/**
 * Starts (or reuses) the static-export server for a measurement run.
 *
 * The perf scripts are run one after another, often for a minute each, and a
 * server started from a shell alongside them kept being reaped between runs —
 * which silently turned "the change made no difference" into "nothing was
 * measured at all". Owning the server from inside the script removes that
 * failure mode: if one is already listening it is reused, otherwise one is
 * started and torn down with the process.
 */

import { spawn } from 'node:child_process';

const PORT = Number(process.env.PERF_PORT ?? 4321);
export const BASE = process.env.PERF_BASE ?? `http://127.0.0.1:${PORT}`;

async function listening() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(500) });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function serveExport() {
  if (await listening()) return () => {};

  const child = spawn(
    process.execPath,
    [new URL('./serve-export.mjs', import.meta.url).pathname, 'out', String(PORT)],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore', detached: false },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await listening()) {
      const stop = () => child.kill();
      process.once('exit', stop);
      return stop;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`static export never came up on ${BASE} — has \`pnpm build\` been run?`);
}
