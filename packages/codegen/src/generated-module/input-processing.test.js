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

const withGraph = async (
  { schema, input = 'Input', output = 'field.string()', extra = '' },
  check,
) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-input-processing-'));
  try {
    await writeFile(path.join(directory, 'input.ts'), schema);
    await writeFile(
      path.join(directory, 'item.ts'),
      `
      import { entity } from '@ontahi/core/entity';
      import { field, value, graphSchema } from '@ontahi/core/data-graph';
      import { Input as Request } from './input';
      const Input = Request;
      export const Item = entity({ name: 'Item', fields: { id: field.id() },
        domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'items' },
        operations: ({ operation, self }) => ({
          ${extra}
          run: operation({ input: ${input}, output: ${output}, run: () => serverImplementation() }),
        }),
      });`,
    );
    await writeFile(
      path.join(directory, 'graph.ts'),
      `
      import { defineGraphApi } from '@ontahi/core/data-graph';
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

const transformedSchema = `
  import { field, value, graphSchema } from '@ontahi/core/data-graph';
  export let calls = 0;
  const normalizeCount = (text: string) => { calls++; return Number(text) + 1; };
  export const Input = value('Input', {
    count: graphSchema.refine(graphSchema.transform(field.string(), normalizeCount),
      count => count > 0, { message: 'Positive after normalization', rule: 'positive' }),
  });`;

describe('Operation wire inputs with server processing', () => {
  it.each(['ref', 'existingRef'])(
    'includes %s participants in selection-mode client contracts',
    async kind => {
      await withGraph(
        {
          schema: 'export const Input = field.string();',
          input: `value('Target', { item: graphSchema.${kind}(self) })`,
        },
        async (analysis, directory) => {
          expect(analysis.diagnostics).toEqual([]);
          const source = renderGeneratedClientEntityModule({
            entities: analysis.clientEntities,
            schemaEntities: analysis.entities,
            namedDefinitions: analysis.namedDefinitions,
            operationContracts: 'selection',
          });
          const generated = await importGeneratedModule({
            directory,
            source: `${source}
          export const parsed = Item.domain.run.input.safeParse({ item: Item.refById('item-1') });
          type Result = NonNullable<typeof Item.domain.run.__clientTypes>['output'];
          const result: Result = 'done';
          // @ts-expect-error selected operations keep their output contract too
          const invalid: Result = 42;
        `,
          });
          expect(generated.parsed).toMatchObject({
            success: true,
            data: { item: { kind: 'entity-ref', entityName: 'Item', locator: { id: 'item-1' } } },
          });
        },
      );
    },
    30_000,
  );
  it.each(['Input', 'graphSchema.union([Input, value("Empty", {})])'])(
    'projects raw input without executing server callbacks: %s',
    async input => {
      await withGraph(
        {
          schema: transformedSchema,
          input,
          extra:
            'internal: operation({ exposure: "server-only", input: Input, run: () => secretServerOnly() }),',
        },
        async (analysis, directory) => {
          expect(analysis.diagnostics).toEqual([]);
          const operation = analysis.clientEntities[0].operations[0];
          expect(operation.inputSchemaProjection.serverProcessing).toEqual([
            'refinement',
            'transform',
          ]);
          const source = renderGeneratedClientEntityModule({
            entities: analysis.clientEntities,
            schemaEntities: analysis.entities,
            namedDefinitions: analysis.namedDefinitions,
          });
          expect(source).not.toMatch(/normalizeCount|secretServerOnly|serverImplementation/);
          expect(source).not.toContain("from './input'");
          const generated = await importGeneratedModule({
            directory,
            source: `${source}
          type Input = NonNullable<typeof Item.domain.run.__clientTypes>['input'];
          const accepted: Input = { count: '41' };
          ${input === 'Input' ? '// @ts-expect-error callers send raw strings, not parsed numbers\nconst transformed: Input = { count: 42 };' : ''}
          export const parsed = Item.domain.run.input.safeParse(accepted);
          export const negative = Item.domain.run.input.safeParse({ count: '-3' });
        `,
          });
          expect(generated.parsed).toMatchObject({ success: true, data: { count: '41' } });
          expect(generated.negative.success).toBe(true);
          const server = await importGeneratedModule({
            directory,
            source: `${transformedSchema}
          import { safeParseGraphSchema } from '@ontahi/core/data-graph';
          export const parsed = safeParseGraphSchema(Input, { count: '41' });
          export const negative = safeParseGraphSchema(Input, { count: '-3' });
        `,
          });
          expect(server.parsed).toMatchObject({ success: true, data: { count: 42 } });
          expect(server.negative.success).toBe(false);
          expect(server.calls).toBe(2);
        },
      );
    },
    30_000,
  );

  it('does not require server-only input/output Values to be browser-portable', async () => {
    await withGraph(
      {
        schema: transformedSchema,
        input: 'field.string()',
        extra: `internal: operation({ exposure: 'server-only',
        input: value('PrivateInput', { payload: loadPrivateSchema() }),
        output: value('PrivateOutput', { payload: graphSchema.transform(field.string(), secretTransform) }),
        run: () => null }),`,
      },
      async (analysis, directory) => {
        expect(analysis.diagnostics).toEqual([]);
        expect(analysis.namedDefinitions.map(definition => definition.name)).toContain(
          'PrivateInput',
        );
        const source = renderGeneratedClientEntityModule({
          entities: analysis.clientEntities,
          schemaEntities: analysis.entities,
          namedDefinitions: analysis.namedDefinitions,
        });
        expect(source).not.toMatch(/PrivateInput|PrivateOutput|loadPrivateSchema|secretTransform/);
        await importGeneratedModule({ directory, source });
      },
    );
  }, 30_000);

  it('reuses inline Values in a shared anonymous input schema across Operations', async () => {
    const schema = `import { field, graphSchema, value } from '@ontahi/core/data-graph';
      export const Input = graphSchema.union([
        value('Data', { count: graphSchema.transform(field.string(), Number) }), value('Empty', {}),
      ]);`;
    await withGraph(
      { schema, extra: 'inspect: operation({ input: Input, run: () => null }),' },
      async (analysis, directory) => {
        expect(analysis.diagnostics).toEqual([]);
        const source = renderGeneratedClientEntityModule({
          entities: analysis.clientEntities,
          schemaEntities: analysis.entities,
          namedDefinitions: analysis.namedDefinitions,
        });
        const generated = await importGeneratedModule({ directory, source });
        for (const index of [0, 1])
          expect(generated.Item.domain.run.input.options[index]).toBe(
            generated.Item.domain.inspect.input.options[index],
          );
      },
    );
  }, 30_000);

  it('keeps a default of the parsed type on the server, not in the wire schema', async () => {
    const schema = `import { field, graphSchema, value } from '@ontahi/core/data-graph';
      export const Input = value('Input', { count: graphSchema.default(graphSchema.transform(field.string(), Number), 42) });`;
    await withGraph({ schema }, async (analysis, directory) => {
      expect(analysis.diagnostics).toEqual([]);
      const source = renderGeneratedClientEntityModule({
        entities: analysis.clientEntities,
        schemaEntities: analysis.entities,
        namedDefinitions: analysis.namedDefinitions,
      });
      const generated = await importGeneratedModule({
        directory,
        source: `${source}
        type Input = NonNullable<typeof Item.domain.run.__clientTypes>['input'];
        const missing: Input = {};
        const given: Input = { count: '9' };
        // @ts-expect-error the parsed default type is not the caller input type
        const invalid: Input = { count: 9 };
        export const parsed = Item.domain.run.input.safeParse(missing);
      `,
      });
      expect(generated.parsed).toMatchObject({ success: true, data: {} });
      const server = await importGeneratedModule({
        directory,
        source: `${schema}
        import { safeParseGraphSchema } from '@ontahi/core/data-graph';
        export const parsed = safeParseGraphSchema(Input, {});
      `,
      });
      expect(server.parsed).toMatchObject({ success: true, data: { count: 42 } });
    });
  }, 30_000);

  it.each([
    'Input',
    'graphSchema.array(Input)',
    'graphSchema.transform(field.string(), Number)',
    'value("Deferred", { item: graphSchema.lazy("Item", () => field.string()) })',
  ])('requires a portable contract for executable outputs: %s', async output => {
    await withGraph({ schema: transformedSchema, input: 'field.string()', output }, analysis => {
      expect(analysis.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringMatching(/run.output:.*(?:[Tt]ransform|[Oo]paque)/),
          }),
        ]),
      );
    });
  });
});
