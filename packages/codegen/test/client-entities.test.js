import { describe, expect, it, vi } from 'vitest';

import {
  createClientEntityCodegenRunner,
  parseClientEntityCodegenArguments,
  runClientEntityCodegenCli,
} from '../src/client-entities.mjs';

describe('conventional client entity codegen', () => {
  it('keeps the conventional paths implicit and forwards runner lifecycle arguments', () => {
    expect(parseClientEntityCodegenArguments(['--format', 'oxfmt', '--check'])).toEqual({
      help: false,
      options: { formatter: 'oxfmt' },
      runnerArguments: ['--check'],
    });
  });

  it('accepts explicit host paths without requiring a generation script', () => {
    expect(
      parseClientEntityCodegenArguments([
        '--graph',
        'server/application.ts',
        '--output',
        'browser/generated/entities.ts',
        '--schema-import',
        '../schema.js',
        '--watch',
      ]),
    ).toEqual({
      help: false,
      options: {
        graphApiPath: 'server/application.ts',
        outputPath: 'browser/generated/entities.ts',
        schemaImportPath: '../schema.js',
      },
      runnerArguments: ['--watch'],
    });
  });

  it('rejects ambiguous and unsupported CLI configuration', () => {
    expect(() => parseClientEntityCodegenArguments(['--graph'])).toThrow(
      /--graph requires a value/,
    );
    expect(() =>
      parseClientEntityCodegenArguments(['--output', 'one.ts', '--output', 'two.ts']),
    ).toThrow(/--output may only be provided once/);
    expect(() => parseClientEntityCodegenArguments(['--format', 'prettier'])).toThrow(
      /Unknown Ontahi client codegen formatter: prettier/,
    );
  });

  it('does not accept both a formatter preset and a custom formatter', () => {
    expect(() =>
      createClientEntityCodegenRunner({
        formatter: 'oxfmt',
        formatOutput: vi.fn(),
      }),
    ).toThrow(/either formatter or formatOutput/);
  });

  it('prints concise help without trying to analyze an application', async () => {
    const logger = { log: vi.fn() };

    await runClientEntityCodegenCli({ argv: ['--help'], logger });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('src/graph.ts'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('--check'));
  });
});
