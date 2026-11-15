import { spawnSync } from 'node:child_process';
import path from 'node:path';

const formattedExtensions = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.mts',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const gitPaths = (...arguments_) => {
  const result = spawnSync('git', arguments_, { encoding: 'buffer' });
  if (result.status !== 0) process.exit(result.status ?? 1);

  return result.stdout.toString('utf8').split('\0').filter(Boolean);
};

const stagedPaths = gitPaths('diff', '--cached', '--diff-filter=ACMR', '--name-only', '-z').filter(
  filePath => formattedExtensions.has(path.extname(filePath).toLowerCase()),
);

if (stagedPaths.length === 0) process.exit(0);

const unstagedPaths = new Set(gitPaths('diff', '--name-only', '-z'));
const partiallyStagedPaths = stagedPaths.filter(filePath => unstagedPaths.has(filePath));

if (partiallyStagedPaths.length > 0) {
  console.error(
    [
      'Cannot auto-format partially staged files without capturing unstaged edits:',
      ...partiallyStagedPaths.map(filePath => `  - ${filePath}`),
      'Stage the complete file or commit its staged and unstaged changes separately.',
    ].join('\n'),
  );
  process.exit(1);
}

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const formatted = spawnSync(packageManager, ['exec', 'oxfmt', '--write', ...stagedPaths], {
  stdio: 'inherit',
});
if (formatted.status !== 0) process.exit(formatted.status ?? 1);

const staged = spawnSync('git', ['add', '--', ...stagedPaths], { stdio: 'inherit' });
if (staged.status !== 0) process.exit(staged.status ?? 1);
