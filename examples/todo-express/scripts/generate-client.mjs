import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeOntahiApplication,
  createStdinCommandFormatter,
  createFileSystemSourceLoader,
  renderGeneratedClientEntityModule,
} from '@ontahi/codegen';

const root = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(root, 'src/generated/client-entities.ts');
const application = analyzeOntahiApplication({
  graphApiPath: path.join(root, 'src/graph.ts'),
  sourceLoader: createFileSystemSourceLoader({ rootDir: root }),
});

if (application.diagnostics.length > 0) {
  throw new Error(JSON.stringify(application.diagnostics, null, 2));
}

const generatedSource = renderGeneratedClientEntityModule({
  entities: application.clientEntities,
  schemaImportPath: '../todo.js',
});
const formatGeneratedSource = createStdinCommandFormatter({
  command: 'pnpm',
  args: ['exec', 'oxfmt', '--stdin-filepath', outputPath],
  cwd: root,
  label: 'oxfmt',
});
const source = await formatGeneratedSource({ outputPath, source: generatedSource });

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== source) throw new Error('Generated client entities are stale. Run pnpm codegen.');
} else {
  await writeFile(outputPath, source, 'utf8');
}
