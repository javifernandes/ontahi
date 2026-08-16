import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createClientEntityCodegenRunner,
  parseClientEntityCodegenArguments,
  runClientEntityCodegenCli,
} from '../src/client-entities.mjs';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

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

  it('projects entity dependencies embedded in a named Value operation output', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-client-codegen-value-output-'));
    const sourceDirectory = path.join(directory, 'src');
    const outputPath = path.join(sourceDirectory, 'generated/client-entities.ts');
    tempDirectories.push(directory);
    await mkdir(sourceDirectory, { recursive: true });

    await writeFile(
      path.join(sourceDirectory, 'graph.ts'),
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Driver } from './driver';
        import { Trip } from './trip';

        export const TripsGraphApi = defineGraphApi({ entities: { Trip, Driver } });
      `,
      'utf8',
    );
    await writeFile(
      path.join(sourceDirectory, 'driver.ts'),
      `
        import { entity, field } from '@ontahi/core/entity';

        export const Driver = entity({
          name: 'Driver',
          fields: { id: field.id(), name: field.string() },
        });
      `,
      'utf8',
    );
    await writeFile(
      path.join(sourceDirectory, 'trip.ts'),
      `
        import { entity, field, value } from '@ontahi/core/entity';
        import { Driver } from './driver';

        const TripListItem = value('TripListItem', {
          id: field.id(),
          driver: field.ref(Driver),
        });

        export const Trip = entity({
          name: 'Trip',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'trips',
          },
          operations: ({ operation }) => ({
            available: operation({
              output: TripListItem,
              run: () => [],
            }),
          }),
        });
      `,
      'utf8',
    );

    const runner = createClientEntityCodegenRunner({ rootDir: directory });
    await runner.generate();
    const source = await readFile(outputPath, 'utf8');

    expect(source).toContain("export const DriverSchema = defineEntitySchema('Driver'");
    expect(source).toContain('driver: field.ref(DriverSchema)');
    expect(source).toContain("output: value('TripListItem'");
  });

  it('prints concise help without trying to analyze an application', async () => {
    const logger = { log: vi.fn() };

    await runClientEntityCodegenCli({ argv: ['--help'], logger });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('src/graph.ts'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('--check'));
  });
});
