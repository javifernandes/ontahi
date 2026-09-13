import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeOntahiApplication,
  analyzeSpecificDomainEntityExport,
  createFileSystemSourceLoader,
  renderGeneratedClientEntityModule,
} from '../index.mjs';

import { importGeneratedModule } from './generated-module.test-support.js';

describe('classified Operation input browser projection', () => {
  it.each([
    'graphSchema.object({ nested: graphSchema.object({ chapter: graphSchema.existingRef(Chapter) }) })',
    'graphSchema.object({ chapters: graphSchema.array(graphSchema.existingRef(Chapter)) })',
    'graphSchema.object({ chapter: graphSchema.default(graphSchema.existingRef(Chapter), fallback) })',
    "value('Input', { nested: value('Nested', { chapter: graphSchema.existingRef(Chapter) }) })",
    'graphSchema.optional(graphSchema.object({ chapter: graphSchema.existingRef(Chapter) }))',
    'graphSchema.existingRef(Chapter)',
  ])('rejects variant participants outside direct input fields: %s', input => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
      const Base = entity({ name: 'Node', fields: { id: field.id(), type: field.enum(['part', 'chapter']) } });
      const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
      export const Book = entity({ name: 'Book', fields: { id: field.id() },
        domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'books' },
        operations: ({ operation }) => ({ inspect: operation({ input: ${input}, run: () => null }) }),
      });
      `,
      'Book',
    );
    expect(analysis.diagnostics).toHaveLength(1);
    expect(analysis.diagnostics[0]).toContain('inspect.input:');
    expect(analysis.diagnostics[0]).toContain('direct top-level fields');
  });

  it.each([
    [
      'graphSchema.object({ chapter: graphSchema.ref(Chapter) })',
      '',
      'require graphSchema.existingRef',
    ],
    [
      'graphSchema.object({ chapter: graphSchema.existingRef(Chapter) })',
      'contracts: { pre: {} },',
      'Portable conditions on variant inputs',
    ],
    [
      "value('Input', { chapter: graphSchema.ref(Chapter) })",
      '',
      'require graphSchema.existingRef',
    ],
    [
      "value('Input', { chapter: graphSchema.existingRef(Chapter) })",
      'contracts: { pre: {} },',
      'Portable conditions on variant inputs',
    ],
  ])('diagnoses unsupported schema composition: %s', (input, contracts, diagnostic) => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
      const Base = entity({ name: 'Node', fields: { id: field.id(), type: field.enum(['part', 'chapter']) } });
      const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
      export const Book = entity({ name: 'Book', fields: { id: field.id() },
        domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'books' },
        operations: ({ operation }) => ({ inspect: operation({ input: ${input}, ${contracts} run: () => null }) }),
      });
    `,
      'Book',
    );
    expect(analysis.diagnostics).toHaveLength(1);
    expect(analysis.diagnostics[0]).toContain(diagnostic);
  });

  it('discovers imported variants and preserves runtime reflection and canonical client input types', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-variant-inputs-'));
    try {
      await writeFile(
        path.join(directory, 'graph.ts'),
        `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { ContentNode } from './nodes';
        import { Book } from './book';
        export const Graph = defineGraphApi({ entities: { ContentNode, Book } });
      `,
      );
      await writeFile(
        path.join(directory, 'nodes.ts'),
        `
        import { entity } from '@ontahi/core/entity';
        export const ContentNode = entity({ name: 'ContentNode', fields: {
          id: field.id(), type: field.enum(['part', 'chapter']), title: field.string(),
        } });
        export const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
      `,
      );
      await writeFile(
        path.join(directory, 'book.ts'),
        `
        import { entity } from '@ontahi/core/entity';
        import { Chapter as Section } from './nodes';
        const input = graphSchema.object({
          chapter: graphSchema.existingRef(Section).resolveWith(serverOnlyLoader),
          other: graphSchema.nullable(graphSchema.existingRef(Section)),
        });
        export const Book = entity({ name: 'Book', fields: { id: field.id() },
          domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'books' },
          operations: ({ operation }) => ({ inspect: operation({ input, run: () => secretServerCode() }) }),
        });
      `,
      );
      const analysis = analyzeOntahiApplication({
        graphApiPath: path.join(directory, 'graph.ts'),
        sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
      });
      expect(analysis.diagnostics).toEqual([]);
      const source = renderGeneratedClientEntityModule({
        entities: analysis.clientEntities,
        schemaEntities: analysis.entities,
      });
      expect(source).not.toContain('serverOnlyLoader');
      expect(source).not.toContain('secretServerCode');
      expect(source).not.toContain('@ontahi/core/entity');
      expect(source).not.toContain("from './nodes'");
      const generated = await importGeneratedModule({
        directory,
        source: `${source}
        import { createEntityRef, defineGraphApi, toGraphSchemaDescriptor } from '@ontahi/core/data-graph';
        type Input = NonNullable<typeof Book.domain.inspect.__clientTypes>['input'];
        const accepted: Input = { chapter: createEntityRef(ContentNodeSchema, { id: 'c1' }), other: null };
        // @ts-expect-error variant names do not create another Ref identity namespace
        const rejected: Input = { chapter: createEntityRef('Chapter', { id: 'c1' }), other: null };
        export const descriptor = toGraphSchemaDescriptor(Book.domain.inspect.input);
        export const discovery = defineGraphApi({ entities: { ContentNode, Book } }).describe();
      `,
      });
      const input = generated.Book.domain.inspect.input;
      expect(input.fields.chapter.target).toBe(generated.ContentNodeSchema);
      expect(generated.descriptor.fields.chapter).toMatchObject({
        kind: 'entity-ref',
        entityName: 'ContentNode',
        resolution: 'existing',
        variant: {
          name: 'Chapter',
          baseEntityName: 'ContentNode',
          discriminator: { fieldName: 'type', value: 'chapter' },
        },
      });
      expect(generated.discovery.domainOperations[0].input).toEqual(generated.descriptor);
      expect(JSON.parse(JSON.stringify(generated.discovery)).domainOperations[0].input).toEqual(
        generated.descriptor,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([
    "Base.variant(dynamicName, { discriminator: { type: 'chapter' } })",
    "Base.variant('Chapter', { discriminator: computeClassification() })",
    "Base.variant('Chapter', { discriminator: { type: 'chapter', other: 'x' } })",
    "loadBase().variant('Chapter', { discriminator: { type: 'chapter' } })",
  ])('rejects opaque or unsupported declarations without executing them: %s', declaration => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
      const Base = entity({ name: 'Node', fields: { id: field.id(), type: field.enum(['part', 'chapter']) } });
      const Chapter = ${declaration};
      export const Book = entity({ name: 'Book', fields: { id: field.id() },
        domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'books' },
        operations: ({ operation }) => ({ inspect: operation({
          input: graphSchema.object({ chapter: graphSchema.existingRef(Chapter) }), run: () => null,
        }) }),
      });
    `,
      'Book',
    );
    expect(analysis.diagnostics).toHaveLength(1);
    expect(analysis.diagnostics[0]).toContain('inspect.input: Variant input');
  });
});
