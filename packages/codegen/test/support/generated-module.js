import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const coreDataGraphPath = path.resolve(
  import.meta.dirname,
  '../../../core/dist/data-graph/index.js',
);
const coreDataGraphUrl = pathToFileURL(coreDataGraphPath).href;
const coreImport = "'@ontahi/core/data-graph'";

const toModuleSpecifier = ({ from, to }) => {
  const relativePath = path.relative(path.dirname(from), to).replaceAll(path.sep, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const formatDiagnostics = diagnostics =>
  ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });

const assertGeneratedModuleTypechecks = async ({ modulePath, source }) => {
  const typecheckPath = modulePath.replace(/\.mjs$/, '.mts');
  const typecheckSource = source.replaceAll(
    coreImport,
    `'${toModuleSpecifier({ from: typecheckPath, to: coreDataGraphPath })}'`,
  );

  await writeFile(typecheckPath, typecheckSource, 'utf8');
  const program = ts.createProgram({
    rootNames: [typecheckPath],
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    throw new Error(
      `Generated module failed TypeScript validation:\n${formatDiagnostics(diagnostics)}`,
    );
  }
};

export const importGeneratedModule = async ({ directory, source }) => {
  const modulePath = path.join(directory, `generated-${randomUUID()}.mjs`);
  if (!source.includes(coreImport)) {
    throw new Error('Generated module does not import @ontahi/core/data-graph.');
  }

  await assertGeneratedModuleTypechecks({ modulePath, source });
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
