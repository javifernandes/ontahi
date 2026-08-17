import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createOntahiCodegenRunner,
  createStdinCommandFormatter,
  parseCodegenRunnerArguments,
} from './runner.mjs';

const tempDirectories = [];

const createTempDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-runner-'));
  tempDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

describe('Ontahi codegen runner', () => {
  it('shares one application analysis across targets and writes their outputs', async () => {
    const directory = await createTempDirectory();
    const sourcePath = path.join(directory, 'graph.ts');
    const dependencyPath = path.join(directory, 'entity.ts');
    let analysisCount = 0;
    const targets = ['client', 'tasks'].map(name => ({
      name,
      sourcePath,
      outputPath: path.join(directory, `${name}.ts`),
    }));
    const runner = createOntahiCodegenRunner({
      targets,
      analyzeApplication: () => {
        analysisCount += 1;
        return { diagnostics: [], sourcePaths: [sourcePath, dependencyPath] };
      },
      renderTarget: ({ target }) => ({
        outputs: [
          { outputPath: target.outputPath, source: `export const name = '${target.name}';` },
        ],
      }),
    });

    await runner.generate();

    expect(analysisCount).toBe(1);
    await expect(readFile(targets[0].outputPath, 'utf8')).resolves.toBe(
      "export const name = 'client';\n",
    );
    await expect(runner.collectWatchPaths()).resolves.toEqual([dependencyPath, sourcePath]);
  });

  it('reports every stale output in check mode without overwriting it', async () => {
    const directory = await createTempDirectory();
    const outputPath = path.join(directory, 'generated.ts');
    await writeFile(outputPath, '// stale\n', 'utf8');
    const runner = createOntahiCodegenRunner({
      targets: [{ name: 'client', sourcePath: '/graph.ts', outputPath }],
      analyzeApplication: () => ({ diagnostics: [], sourcePaths: [] }),
      renderTarget: ({ target }) => ({
        outputs: [{ outputPath: target.outputPath, source: 'export {};' }],
      }),
      staleCommand: 'pnpm codegen',
    });

    await expect(runner.generate({ check: true })).rejects.toThrow(
      /Generated Ontahi artifacts are stale:[\s\S]*generated\.ts[\s\S]*pnpm codegen/,
    );
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('// stale\n');
  });

  it('stops before rendering when application diagnostics are present', async () => {
    let rendered = false;
    const runner = createOntahiCodegenRunner({
      targets: [{ name: 'client', sourcePath: '/graph.ts' }],
      analyzeApplication: () => ({
        diagnostics: [{ code: 'invalid_graph', message: 'Graph declaration is invalid.' }],
      }),
      renderTarget: () => {
        rendered = true;
        return { outputs: [] };
      },
      formatAnalysisDiagnostic: diagnostic => diagnostic.message,
    });

    await expect(runner.generate()).rejects.toThrow(/Graph declaration is invalid/);
    expect(rendered).toBe(false);
  });

  it('parses check, watch and target selection arguments', () => {
    expect(parseCodegenRunnerArguments(['--check', '--only', 'client'])).toEqual({
      check: true,
      onlyTargetName: 'client',
      watch: false,
    });
    expect(() => parseCodegenRunnerArguments(['--watch', '--check'])).toThrow(
      /Cannot use --check and --watch together/,
    );
    expect(() => parseCodegenRunnerArguments(['--only'])).toThrow(/--only requires a target name/);
  });

  it('formats generated source through an injected stdin command', async () => {
    const formatter = createStdinCommandFormatter({
      command: process.execPath,
      args: [
        '-e',
        "let source = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => source += chunk); process.stdin.on('end', () => process.stdout.write(source.toUpperCase()));",
      ],
      label: 'uppercase',
    });

    await expect(
      formatter({ outputPath: '/generated.ts', source: 'export const value = 1;' }),
    ).resolves.toBe('EXPORT CONST VALUE = 1;');
  });
});
