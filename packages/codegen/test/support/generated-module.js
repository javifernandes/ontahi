import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const coreDataGraphUrl = pathToFileURL(
  path.resolve(import.meta.dirname, '../../../core/dist/data-graph/index.js'),
).href;

export const importGeneratedModule = async ({ directory, source }) => {
  const modulePath = path.join(directory, `generated-${randomUUID()}.mjs`);
  const coreImport = "'@ontahi/core/data-graph'";
  if (!source.includes(coreImport)) {
    throw new Error('Generated module does not import @ontahi/core/data-graph.');
  }

  const browserSafeSource = source.replaceAll(coreImport, `'${coreDataGraphUrl}'`);
  const transpiled = ts.transpileModule(browserSafeSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  await writeFile(modulePath, transpiled.outputText, 'utf8');
  return import(pathToFileURL(modulePath).href);
};
