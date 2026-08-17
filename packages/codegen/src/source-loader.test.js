import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createFileSystemSourceLoader } from './source-loader.mjs';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

it('resolves the longest normalized alias before a broader alias', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-source-alias-'));
  const broadSourcePath = path.join(directory, 'src/domain/note.ts');
  const specificSourcePath = path.join(directory, 'domain/note.ts');
  tempDirectories.push(directory);

  await mkdir(path.dirname(broadSourcePath), { recursive: true });
  await mkdir(path.dirname(specificSourcePath), { recursive: true });
  await writeFile(broadSourcePath, `export const source = 'broad';`, 'utf8');
  await writeFile(specificSourcePath, `export const source = 'specific';`, 'utf8');

  const sourceLoader = createFileSystemSourceLoader({
    rootDir: directory,
    aliases: {
      '@': 'src',
      '@/domain/': 'domain',
    },
  });

  expect(sourceLoader.resolveImportSource('/application/graph.ts', '@/domain/note')).toEqual({
    sourcePath: specificSourcePath,
    sourceText: `export const source = 'specific';`,
  });
});
