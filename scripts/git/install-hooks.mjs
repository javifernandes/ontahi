import { runGit } from './local-tool.mjs';

const git = runGit(['rev-parse', '--is-inside-work-tree'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});

if (git.status === 0 && git.stdout.trim() === 'true') {
  const configured = runGit(['config', 'core.hooksPath', '.githooks'], {
    stdio: 'inherit',
  });

  if (configured.status !== 0) process.exit(configured.status ?? 1);
}
