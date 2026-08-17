import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { importGeneratedModule } from './support/generated-module.js';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

it('rejects generated modules with semantic TypeScript errors before importing them', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-generated-module-typecheck-'));
  tempDirectories.push(directory);

  await expect(
    importGeneratedModule({
      directory,
      source: `
        import { field } from '@ontahi/core/data-graph';

        const invalid: string = 42;
        export const Identifier = field.string();
      `,
    }),
  ).rejects.toThrow(/Type 'number' is not assignable to type 'string'/);
}, 15_000);
