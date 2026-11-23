import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

const referencesForbiddenNamespace = (line: string, namespace: string): boolean => {
  const namespaceRoot = namespace.endsWith('/') ? namespace.slice(0, -1) : namespace;
  return (
    line.includes(`${namespaceRoot}/`) ||
    line.includes(`${namespaceRoot}'`) ||
    line.includes(`${namespaceRoot}\"`)
  );
};

const productionTypeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return productionTypeScriptFiles(entryPath);
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
      return [entryPath];
    }),
  );
  return files.flat();
};

const findForbiddenImports = async (
  boundary: string,
  forbiddenSegments: readonly string[],
): Promise<string[]> => {
  const files = await productionTypeScriptFiles(path.join(sourceRoot, boundary));
  const violations = await Promise.all(
    files.map(async file => {
      const source = await readFile(file, 'utf8');
      return source
        .split('\n')
        .flatMap((line, index) =>
          forbiddenSegments.some(segment => referencesForbiddenNamespace(line, segment))
            ? [`${path.relative(sourceRoot, file)}:${index + 1}: ${line.trim()}`]
            : [],
        );
    }),
  );
  return violations.flat();
};

describe('Core architecture boundaries', () => {
  it.each([
    "import '@ontahi/core/data-graph';",
    "import '@ontahi/core/data-graph/query';",
    "import '../data-graph';",
    "import '../data-graph/query';",
  ])('recognizes forbidden namespace roots and subpaths in %s', source => {
    expect(referencesForbiddenNamespace(source, '/data-graph/')).toBe(true);
  });

  it.each([
    ['value', ['/model/', '/computation/', '/runtime/', '/data-graph/']],
    ['model', ['/computation/', '/runtime/', '/data-graph/']],
    ['computation', ['/runtime/', '/data-graph/']],
  ] as const)(
    '%s production modules respect the accepted dependency direction',
    async (boundary, forbidden) => {
      expect(await findForbiddenImports(boundary, forbidden)).toEqual([]);
    },
  );

  it('keeps substantial data-graph implementations explicitly allowlisted', async () => {
    const files = await productionTypeScriptFiles(path.join(sourceRoot, 'data-graph'));
    const substantialFiles = (
      await Promise.all(
        files.map(async file => {
          const lineCount = (await readFile(file, 'utf8')).split('\n').length;
          return lineCount > 100 ? path.relative(sourceRoot, file) : undefined;
        }),
      )
    ).filter((file): file is string => file !== undefined);

    expect(substantialFiles.sort()).toEqual([
      'data-graph/definitions.ts',
      'data-graph/fixtures.test-support.ts',
      'data-graph/schema-descriptor.ts',
    ]);
  });
});
