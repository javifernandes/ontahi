import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeSpecificDomainEntityExport, renderGeneratedClientEntityModule } from '../index.mjs';

import { importGeneratedModule } from './generated-module.test-support.js';

describe('Entity contextual Selection projection', () => {
  it('generates classified contextual targets without server imports or duplicate filter declarations', async () => {
    const input = `
      export const ContentNode = entity({ name: 'ContentNode',
        fields: { id: field.id(), parentId: field.nullable(field.string()), bookId: field.string(), type: field.enum(['part', 'chapter']) },
        relations: { children: relation.hasMany(entity.ref('ContentNode'), { via: 'parentId' }) },
        selections: ({ self }) => ({ chapters: self.children.as(Chapter) })
      });
      const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
      const Part = ContentNode.variant('Part', { discriminator: { type: 'part' } });
      export const Book = entity({ name: 'Book', fields: { id: field.id() },
        relations: { nodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
        selections: ({ self }) => ({ parts: self.nodes.as(Part) })
      });
    `;
    const analyses = ['ContentNode', 'Book'].map(name =>
      analyzeSpecificDomainEntityExport(input, name),
    );
    expect(analyses.flatMap(analysis => analysis.diagnostics)).toEqual([]);
    const source = renderGeneratedClientEntityModule({
      entities: analyses.map(analysis => analysis.definition),
    });
    expect(source).not.toContain('@ontahi/core/runtime/server');
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-classified-contextual-'));
    try {
      const generated = await importGeneratedModule({
        directory,
        source: `${source}
        export const parts = Book.selection(b => b.id.eq('b1')).parts;
        export const chapters = parts.chapters;
        chapters.where(n => n.type.eq('chapter'));
        // @ts-expect-error classified target has no mutation API
        if (false) chapters.delete();
        // @ts-expect-error wrong variant discriminator
        if (false) chapters.where(n => n.type.eq('part'));
      `,
      });
      expect(generated.parts.variant.name).toBe('Part');
      expect(generated.chapters.variant.name).toBe('Chapter');
      expect(generated.chapters.toQuery().build().root).toBe(generated.ContentNode.definition);
      expect(generated.Book.definition.contextualSelections.parts.output.entityName).toBe('Part');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
  it.each([false, true])(
    'emits portable typed factories (deferred: %s)',
    async deferred => {
      const input = `
      import { entity, relation } from '@ontahi/core/runtime/server';
      import { field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';
      export const Node = entity({ name: 'Node', fields: { id: field.id(), bookId: field.string(), type: field.enum(['part', 'chapter']) } });
      const Base = entity({ name: 'Book', fields: { id: field.id() },
        relations: { nodes: relation.hasMany(${deferred ? "entity.ref('Node')" : 'Node'}, { via: 'bookId' }) },
        selections: ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) })
      });
      export const Book = withSelectionFactories(Base, { id: { version: 1, input: graphSchema.object({ id: field.id() }), scalarInput: 'id', template: { kind: 'identity', bindings: { id: 'id' } } } });
    `;
      const analyses = ['Node', 'Book'].map(name => analyzeSpecificDomainEntityExport(input, name));
      expect(analyses.flatMap(a => a.diagnostics)).toEqual([]);
      const source = renderGeneratedClientEntityModule({
        entities: analyses.map(a => a.definition),
      });
      expect(source).not.toContain('@ontahi/core/runtime/server');
      expect(source).not.toContain('self.nodes');
      const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-contextual-codegen-'));
      try {
        const generated = await importGeneratedModule({
          directory,
          source: `${source}
        Book.by({ id: 'b1' }).parts.and(n => n.type.eq('part'));
        Book.by({ id: 'b1' }).where(b => b.id.eq('b1')).parts;
        // @ts-expect-error target fields remain typed
        if (false) Book.by({ id: 'b1' }).parts.and(n => n.missing.eq('x'));
        // @ts-expect-error unknown property
        if (false) Book.by({ id: 'b1' }).missing;
      `,
        });
        expect(generated.Book.by({ id: 'b1' }).parts.toAst()).toMatchObject({
          entityName: 'Node',
          expression: {
            kind: 'and',
            operands: [
              { kind: 'relation-image', relationName: 'nodes', source: { entityName: 'Book' } },
              { kind: 'predicate', fieldName: 'type', value: 'part' },
            ],
          },
        });
        expect(generated.Book.definition.contextualSelections.parts.output.entityName).toBe('Node');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.each([
    '() => loadServerSelections()',
    '({ self }) => ({ parts: self.nodes.where(n => n.type.eq(serverSecret)) })',
    '({ self }) => ({ parts: self.nodes.where(n => execute(n)) })',
  ])('diagnoses nonportable declarations: %s', selections => {
    const result = analyzeSpecificDomainEntityExport(
      `export const Book = entity({ name: 'Book', fields: { id: field.id() }, selections: ${selections} });`,
      'Book',
    );
    expect(result.diagnostics.join(' ')).toContain('portable relation templates');
  });

  it('keeps Book → parts → chapters typed when ContentNode has a self relation', async () => {
    const input = `
      export const ContentNode = entity({ name: 'ContentNode',
        fields: { id: field.id(), parentId: field.nullable(field.string()), bookId: field.string(), type: field.enum(['part', 'chapter']) },
        relations: { children: relation.hasMany(entity.ref('ContentNode'), { via: 'parentId' }) },
        selections: ({ self }) => ({ chapters: self.children.where(n => n.type.eq('chapter')) })
      });
      export const Book = entity({ name: 'Book', fields: { id: field.id() },
        relations: { nodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
        selections: ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) })
      });
    `;
    const entities = ['ContentNode', 'Book'].map(
      name => analyzeSpecificDomainEntityExport(input, name).definition,
    );
    const source = renderGeneratedClientEntityModule({ entities });
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-contextual-self-'));
    try {
      const generated = await importGeneratedModule({
        directory,
        source: `${source}
        export const chapters = Book.selection(b => b.id.eq('b1')).parts.chapters;
        chapters.and(n => n.type.eq('chapter'));
        // @ts-expect-error target remains typed
        if (false) chapters.and(n => n.missing.eq('x'));
      `,
      });
      expect(generated.chapters.toAst().entityName).toBe('ContentNode');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
