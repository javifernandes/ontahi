import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeOntahiApplication,
  createFileSystemSourceLoader,
  renderGeneratedClientEntityModule,
} from '../index.mjs';

import { importGeneratedModule } from './generated-module.test-support.js';

const withApplication = async (files, check) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-nested-values-'));
  try {
    for (const [name, source] of Object.entries(files))
      await writeFile(path.join(directory, name), source);
    await writeFile(
      path.join(directory, 'graph.ts'),
      `import { defineGraphApi } from '@ontahi/core/data-graph';
       import { Item } from './item';
       export const Graph = defineGraphApi({ entities: { Item } });`,
    );
    const analysis = analyzeOntahiApplication({
      graphApiPath: path.join(directory, 'graph.ts'),
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });
    await check(analysis, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const itemSource = (declarations, operations) => `
  import { entity } from '@ontahi/core/entity';
  import { field, value, graphSchema } from '@ontahi/core/data-graph';
  ${declarations}
  export const Item = entity({ name: 'Item', fields: { id: field.id() },
    domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'items' },
    operations: ({ operation, self }) => ({ ${operations} }),
  });`;

const render = analysis =>
  renderGeneratedClientEntityModule({
    entities: analysis.clientEntities,
    schemaEntities: analysis.entities,
    namedDefinitions: analysis.namedDefinitions,
  });

describe('nested Value client projections', () => {
  it.each(['local', 'imported-alias'])(
    'closes %s dependencies and preserves shared identity',
    async form => {
      const definitions = `
      const State = field.enum(['open', 'closed'] as const);
      export const Subject = value('Subject', { title: field.string(), state: State });
      export const Input = value('Input', { subject: Subject });
      export const Output = value('Output', { ...Subject.fields, nested: graphSchema.array(Input) });`;
      await withApplication(
        {
          'schemas.ts': `import { field, value, graphSchema } from '@ontahi/core/data-graph'; ${definitions}`,
          'item.ts': itemSource(
            form === 'local'
              ? definitions
              : `import { Input as Request, Output as Response, Subject as Detail } from './schemas';`,
            form === 'local'
              ? 'read: operation({ input: Input, output: Output, run: () => secretServerCode() }), detail: operation({ output: Subject, run: () => null })'
              : 'read: operation({ input: Request, output: Response, run: () => secretServerCode() }), detail: operation({ output: Detail, run: () => null })',
          ),
        },
        async (analysis, directory) => {
          expect(analysis.diagnostics).toEqual([]);
          expect(analysis.clientEntities[0].operations[0].outputSchemaText).not.toContain(
            '__ontahi_schema_reference_',
          );
          const source = render(analysis);
          expect(source).not.toContain('secretServerCode');
          expect(source).not.toContain("from './schemas'");
          const generated = await importGeneratedModule({
            directory,
            source: `${source}
        import { toGraphSchemaDescriptor } from '@ontahi/core/data-graph';
        type Input = NonNullable<typeof Item.domain.read.__clientTypes>['input'];
        const accepted: Input = { subject: { title: 'Title', state: 'open' } };
        // @ts-expect-error nested enum inference must be retained
        const invalid: Input = { subject: { title: 'Title', state: 'missing' } };
        export const descriptor = toGraphSchemaDescriptor(Item.domain.read.output);
      `,
          });
          expect(generated.Item.domain.read.input.fields.subject).toBe(
            generated.Item.domain.detail.output,
          );
          expect(generated.descriptor.fields.state).toEqual({
            kind: 'scalar',
            type: 'enum',
            enumValues: ['open', 'closed'],
          });
          expect(generated.descriptor.fields.nested).toMatchObject({ kind: 'array' });
        },
      );
    },
    30_000,
  );

  it('binds receiver-dependent Values without rewriting property names or string literals', async () => {
    await withApplication(
      {
        'item.ts': itemSource(
          '',
          `
      read: operation({
        input: value('Input', { items: self.many(), self: field.string() }),
        output: value('Output', { items: graphSchema.array(self.view('self', { fields: { self: field.string() } })) }),
        run: () => null,
      }),
    `,
        ),
      },
      async (analysis, directory) => {
        expect(analysis.diagnostics).toEqual([]);
        const generated = await importGeneratedModule({
          directory,
          source: `${render(analysis)}
        import { toGraphSchemaDescriptor } from '@ontahi/core/data-graph';
        export const input = toGraphSchemaDescriptor(Item.domain.read.input);
        export const output = toGraphSchemaDescriptor(Item.domain.read.output);
      `,
        });
        expect(generated.input.fields).toHaveProperty('self');
        expect(generated.input.fields.items).toMatchObject({ entityName: 'Item' });
        expect(generated.output.fields.items).toMatchObject({ kind: 'array' });
        expect(generated.Item.domain.read.input.fields.items.entity).toBe(generated.ItemSchema);
      },
    );
  }, 30_000);

  it.each([
    ['const Secret = loadSchema();', 'Secret', 'Opaque schema call "loadSchema"'],
    ['', 'missingSchema', 'Unresolved schema dependency "missingSchema"'],
    [
      'const Subject = value("Subject", { recursive: Input });',
      'Subject',
      'Cyclic Value schema dependencies',
    ],
    [
      '',
      'graphSchema.transform(field.string(), serverNormalize)',
      'Opaque schema constructor "graphSchema.transform"',
    ],
  ])('diagnoses unsafe dependencies: %s', async (declaration, subject, message) => {
    await withApplication(
      {
        'item.ts': itemSource(
          `${declaration} const Input = value('Input', { subject: ${subject} });`,
          'read: operation({ input: Input, run: () => null })',
        ),
      },
      analysis => {
        expect(analysis.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining(`read.input: ${message}`) }),
          ]),
        );
      },
    );
  });

  it('checks nominal conflicts in Values reachable only through other Values', async () => {
    await withApplication(
      {
        'item.ts': itemSource(
          `
      const First = value('Shared', { first: field.string() });
      const Second = value('Shared', { second: field.boolean() });
      const Input = value('Input', { first: First, second: Second });
    `,
          'read: operation({ input: Input, run: () => null })',
        ),
      },
      analysis => {
        expect(analysis.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'model-name-conflict',
              message: expect.stringContaining('"Shared"'),
            }),
          ]),
        );
      },
    );
  });
});
