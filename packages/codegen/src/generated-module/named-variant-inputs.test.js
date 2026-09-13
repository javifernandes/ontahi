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

describe('named classified Operation inputs', () => {
  it.each(['inline', 'local', 'imported-alias', 'shared-server-only'])(
    'projects a %s Value without losing its participant contract',
    async form => {
      const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-named-variant-input-'));
      try {
        const definition = `value('ListThreadsForChapterInput', {
        chapter: graphSchema.existingRef(Chapter).resolveWith(serverOnlyLoader),
        comparison: graphSchema.optional(graphSchema.nullable(graphSchema.existingRef(Chapter))),
        stateFilter: graphSchema.optional(field.enum(['open', 'resolved', 'all'])),
      })`;
        await writeFile(
          path.join(directory, 'nodes.ts'),
          `
        import { entity, relation } from '@ontahi/core/entity';
        import { field } from '@ontahi/core/data-graph';
        export const ContentNode = entity({ name: 'ContentNode', fields: {
          id: field.id(), type: field.enum(['part', 'chapter']), title: field.string(),
          bookId: field.id(), parentId: field.nullable(field.id()), slug: field.string(),
        }, relations: { children: relation.hasMany(entity.ref('ContentNode'), { via: 'parentId' }) },
        selections: ({ self }) => ({ chapters: self.children.as(Chapter) }),
        });
        export const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
        export const Part = ContentNode.variant('Part', { discriminator: { type: 'part' } });
      `,
        );
        await writeFile(
          path.join(directory, 'book.ts'),
          `
        import { entity, relation } from '@ontahi/core/entity';
        import { field } from '@ontahi/core/data-graph';
        import { ContentNode, Chapter, Part } from './nodes';
        export const Book = entity({ name: 'Book', fields: { id: field.id(), slug: field.string() },
          relations: { contentNodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
          selections: ({ self }) => ({
            parts: self.contentNodes.as(Part),
            rootChapters: self.contentNodes.where(node => node.parentId.isNull()).as(Chapter),
          }),
        });
      `,
        );
        await writeFile(
          path.join(directory, 'input.ts'),
          `
        import { value, graphSchema, field } from '@ontahi/core/data-graph';
        import { Chapter } from './nodes';
        export const ChapterInput = ${definition};
      `,
        );
        const input = form === 'inline' ? definition : 'Input';
        await writeFile(
          path.join(directory, 'thread.ts'),
          `
        import { entity } from '@ontahi/core/entity';
        import { value, graphSchema, field } from '@ontahi/core/data-graph';
        import { Chapter } from './nodes';
        ${form === 'imported-alias' ? "import { ChapterInput as Input } from './input';" : ''}
        ${['local', 'shared-server-only'].includes(form) ? `const Input = ${definition};` : ''}
        export const Thread = entity({ name: 'Thread', fields: { id: field.id() },
          domainOperationDefaults: { authority: 'server', exposure: 'bridge', layer: 'threads' },
          operations: ({ operation }) => ({
            ${form === 'shared-server-only' ? "hidden: operation({ exposure: 'server-only', input: Input, run: () => secretServerCode() })," : ''}
            list: operation({ input: ${input}, run: () => secretServerCode() }),
            ${form !== 'inline' ? 'inspect: operation({ input: Input, run: () => secretServerCode() }),' : ''}
          }),
        });
      `,
        );
        await writeFile(
          path.join(directory, 'graph.ts'),
          `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { ContentNode } from './nodes';
        import { Thread } from './thread';
        import { Book } from './book';
        export const Graph = defineGraphApi({ entities: { ContentNode, Thread, Book } });
      `,
        );
        const analysis = analyzeOntahiApplication({
          graphApiPath: path.join(directory, 'graph.ts'),
          sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
        });
        expect(analysis.diagnostics).toEqual([]);
        expect(
          analysis.namedDefinitions.filter(definition => definition.kind === 'value'),
        ).toHaveLength(1);
        const source = renderGeneratedClientEntityModule({
          entities: analysis.clientEntities,
          schemaEntities: analysis.entities,
          namedDefinitions: analysis.namedDefinitions,
        });
        expect(source).not.toContain('serverOnlyLoader');
        expect(source).not.toContain('secretServerCode');
        expect(source).not.toContain("from './input'");
        expect(source).not.toContain('@ontahi/core/entity');
        const generated = await importGeneratedModule({
          directory,
          source: `${source}
        import { createEntityRef, defineGraphApi, toGraphSchemaDescriptor } from '@ontahi/core/data-graph';
        type Input = NonNullable<typeof Thread.domain.list.__clientTypes>['input'];
        const accepted: Input = { chapter: createEntityRef(ContentNodeSchema, { id: 'c1' }), stateFilter: 'open', comparison: null };
        const minimal: Input = { chapter: createEntityRef(ContentNodeSchema, { id: 'c1' }) };
        // @ts-expect-error a variant is not a second identity namespace
        const wrongEntity: Input = { chapter: createEntityRef('Chapter', { id: 'c1' }) };
        // @ts-expect-error the named input retains its required participant
        const missing: Input = { stateFilter: 'open' };
        // @ts-expect-error the filter retains its enum contract
        const wrongFilter: Input = { chapter: accepted.chapter, stateFilter: 'archived' };
        export const descriptor = toGraphSchemaDescriptor(Thread.domain.list.input);
        export const discovery = defineGraphApi({ entities: { ContentNode, Thread } }).describe();
        export const nestedChapters = Book.selection(book => book.slug.eq('my-book')).parts
          .where(part => part.slug.eq('first')).chapters;
        export const rootChapters = Book.selection(book => book.slug.eq('my-book')).rootChapters;
        // @ts-expect-error navigation retains the classified target
        if (false) rootChapters.where(chapter => chapter.type.eq('part'));
      `,
        });
        expect(generated.descriptor).toMatchObject({
          kind: 'object',
          role: 'value',
          name: 'ListThreadsForChapterInput',
          fields: {
            chapter: {
              kind: 'entity-ref',
              entityName: 'ContentNode',
              resolution: 'existing',
              variant: {
                name: 'Chapter',
                baseEntityName: 'ContentNode',
                discriminator: { fieldName: 'type', value: 'chapter' },
              },
            },
          },
        });
        expect(generated.Thread.domain.list.input.fields.chapter.target).toBe(
          generated.ContentNodeSchema,
        );
        for (const selection of [generated.rootChapters, generated.nestedChapters]) {
          expect(selection.variant.descriptor).toEqual(generated.descriptor.fields.chapter.variant);
          expect(selection.toQuery().build().root).toBe(generated.ContentNodeSchema);
        }
        for (const operation of generated.discovery.domainOperations)
          expect(operation.input).toEqual(generated.descriptor);
        if (form !== 'inline')
          expect(generated.Thread.domain.inspect.input).toBe(generated.Thread.domain.list.input);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
