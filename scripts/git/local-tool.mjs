import { spawnSync } from 'node:child_process';

// Git hooks intentionally use the developer's active toolchain. Resolving these
// commands from PATH is the same trust boundary as invoking git or pnpm directly.
export const runGit = (arguments_, options = {}) => spawnSync('git', arguments_, options); // NOSONAR

export const runPnpm = (arguments_, options = {}) =>
  spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', arguments_, options); // NOSONAR
