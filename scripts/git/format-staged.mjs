import path from 'node:path';

import { runGit, runPnpm } from './local-tool.mjs';

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
  const result = runGit(arguments_, { encoding: 'buffer' });
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

const formatted = runPnpm(['exec', 'oxfmt', '--write', ...stagedPaths], {
  stdio: 'inherit',
});
if (formatted.status !== 0) process.exit(formatted.status ?? 1);

const staged = runGit(['add', '--', ...stagedPaths], { stdio: 'inherit' });
if (staged.status !== 0) process.exit(staged.status ?? 1);
