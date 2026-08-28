import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { importGeneratedModule } from './generated-module/generated-module.test-support.js';
import {
  analyzeOntahiApplication,
  createClientEntityCodegenRunner,
  createFileSystemSourceLoader,
  parseClientEntityCodegenArguments,
  runClientEntityCodegenCli,
} from './index.mjs';

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
        '--operation-conditions-output',
        'server/generated/operation-conditions.ts',
        '--operation-conditions-only',
        '--watch',
      ]),
    ).toEqual({
      help: false,
      options: {
        graphApiPath: 'server/application.ts',
        outputPath: 'browser/generated/entities.ts',
        schemaImportPath: '../schema.js',
        operationConditionsOutputPath: 'server/generated/operation-conditions.ts',
        operationConditionsOnly: true,
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
    expect(() => createClientEntityCodegenRunner({ operationConditionsOnly: true })).toThrow(
      /requires --operation-conditions-output/,
    );
  });

  it('can generate the shared condition registry without projecting a client module', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-operation-conditions-only-'));
    const sourceDirectory = path.join(directory, 'src');
    const graphApiPath = path.join(sourceDirectory, 'graph.ts');
    const outputPath = path.join(sourceDirectory, 'generated/client-entities.ts');
    const operationConditionsOutputPath = path.join(
      sourceDirectory,
      'generated/operation-conditions.ts',
    );
    tempDirectories.push(directory);
    await mkdir(sourceDirectory, { recursive: true });

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Course, Student } from './classroom';

        export const ClassroomGraphApi = defineGraphApi({ entities: [Course, Student] });
      `,
      'utf8',
    );
    await writeFile(
      path.join(sourceDirectory, 'classroom.ts'),
      `
        import { field, graphSchema } from '@ontahi/core/data-graph';
        import { entity } from '@ontahi/core/entity';

        export const Course = entity({ name: 'Course', fields: { id: field.id() } });
        export const Student = entity({
          name: 'Student',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'classroom',
          },
          operations: ({ operation }) => ({
            transfer: operation({
              input: graphSchema.object({
                previousCourse: graphSchema.existingRef(Course),
                nextCourse: graphSchema.existingRef(Course),
              }),
              contracts: {
                pre: {
                  differentCourses: ({ previousCourse, nextCourse }) =>
                    !previousCourse.is(nextCourse),
                },
              },
              run: () => undefined,
            }),
          }),
        });
      `,
      'utf8',
    );

    const runner = createClientEntityCodegenRunner({
      rootDir: directory,
      operationConditionsOnly: true,
      operationConditionsOutputPath,
    });
    await runner.generate();

    await expect(readFile(outputPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(operationConditionsOutputPath, 'utf8')).resolves.toContain(
      'Student.transfer',
    );
  });

  it('projects entity dependencies embedded in named Value operation contracts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-client-codegen-value-contracts-'));
    const sourceDirectory = path.join(directory, 'src');
    const graphApiPath = path.join(sourceDirectory, 'graph.ts');
    const outputPath = path.join(sourceDirectory, 'generated/client-entities.ts');
    tempDirectories.push(directory);
    await mkdir(sourceDirectory, { recursive: true });

    await writeFile(
      graphApiPath,
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
      path.join(sourceDirectory, 'trip-search-input.ts'),
      `
        import { field, value } from '@ontahi/core/entity';
        import { Driver } from './driver';

        export const TripSearchInput = value('TripSearchInput', {
          driver: field.ref(Driver),
        });
      `,
      'utf8',
    );
    await writeFile(
      path.join(sourceDirectory, 'trip-list-item.ts'),
      `
        import { field, value } from '@ontahi/core/entity';
        import { Driver } from './driver';

        export const TripListItem = value('TripListItem', {
          id: field.id(),
          driver: field.ref(Driver),
        });
      `,
      'utf8',
    );
    await writeFile(
      path.join(sourceDirectory, 'trip.ts'),
      `
        import { entity, field } from '@ontahi/core/entity';
        import { TripListItem } from './trip-list-item';
        import { TripSearchInput } from './trip-search-input';

        export const Trip = entity({
          name: 'Trip',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'trips',
          },
          operations: ({ operation, self }) => ({
            available: operation({
              input: TripSearchInput,
              output: TripListItem,
              run: () => [],
            }),
            delayed: operation({
              output: TripListItem,
              run: () => [],
            }),
            search: operation({
              output: self.many(),
              run: () => [],
            }),
          }),
        });
      `,
      'utf8',
    );

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.namedDefinitions.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'entity', name: 'Trip' },
      { kind: 'entity', name: 'Driver' },
      { kind: 'value', name: 'TripSearchInput' },
      { kind: 'value', name: 'TripListItem' },
    ]);

    const runner = createClientEntityCodegenRunner({ rootDir: directory });
    await runner.generate();
    const source = await readFile(outputPath, 'utf8');
    const generated = await importGeneratedModule({ directory, source });

    expect(generated.DriverSchema).toMatchObject({
      kind: 'entity',
      name: 'Driver',
      fields: { id: { kind: 'field' }, name: { kind: 'field' } },
    });
    const input = generated.Trip.domain.available.input;
    expect(input).toMatchObject({
      kind: 'value',
      name: 'TripSearchInput',
      fields: { driver: { kind: 'field' } },
    });
    expect(input.fields.driver.target).toBe(generated.DriverSchema);
    const output = generated.Trip.domain.available.output;
    expect(output).toMatchObject({
      kind: 'value',
      name: 'TripListItem',
      fields: {
        id: { kind: 'field' },
        driver: { kind: 'field' },
      },
    });
    expect(output.fields.driver.target).toBe(generated.DriverSchema);
    expect(generated.Trip.domain.delayed.output).toBe(output);
    expect(generated.Trip.domain.delayed.input).toEqual({ kind: 'schema.void' });
    const TripList = generated.Trip.view('TripList', { id: true });
    expect(TripList.entity).toBe(generated.TripSchema);
    expect(generated.Trip.domain.search.as(TripList).view).toBe(TripList.ast);
    expect(source).not.toContain("from './trip-list-item'");
  }, 30_000);

  it('prints concise help without trying to analyze an application', async () => {
    const logger = { log: vi.fn() };

    await runClientEntityCodegenCli({ argv: ['--help'], logger });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('src/graph.ts'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('--check'));
  });
});
