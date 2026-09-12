import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { entity, relation, ontahi } from '../runtime/server/index.js';

import type { InferEntityRecord } from './definitions.js';

import {
  createInMemoryDataGraphStorage,
  createInMemoryDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  field,
  graphSchema,
  Selection,
  withSelectionFactories,
  defineClientEntity,
  withContextualSelections,
} from './index.js';

const fixture = () => {
  const Chapter = entity({ name: 'Chapter', fields: { id: field.id(), partId: field.string() } });
  const Node = entity({
    name: 'Node',
    fields: { id: field.id(), bookId: field.string(), type: field.enum(['part', 'chapter']) },
    relations: { children: relation.hasMany(Chapter, { via: 'partId' }) },
    selections: ({ self }) => ({ chapters: self.children }),
  });
  const declare = vi.fn();
  const Base = entity({
    name: 'Book',
    fields: { id: field.id() },
    relations: { contentNodes: relation.hasMany(Node, { via: 'bookId' }) },
    selections: ({ self }) => {
      declare();
      return { parts: self.contentNodes.where(n => n.type.eq('part')) };
    },
  });
  const Book = withSelectionFactories(Base, {
    id: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
  });
  return { Book, Node, Chapter, declare };
};

describe('Entity contextual Selections', () => {
  it('declares typed properties and composes by → parts → chapters without a read', () => {
    const { Book, Node, Chapter, declare } = fixture();
    const source = Book.by({ id: 'b1' });
    const parts = source.parts;
    expectTypeOf(parts.root).toEqualTypeOf<typeof Node>();
    expectTypeOf(parts.chapters.root).toEqualTypeOf<typeof Chapter>();
    expect(source.and(b => b.id.eq('b1')).parts.root).toBe(Node);
    expect(source.where(b => b.id.eq('b1')).parts.root).toBe(Node);
    expect(source.and(b => b.id.eq('other')).parts.toAst().expression).toMatchObject({
      kind: 'and',
      operands: [
        {
          kind: 'relation-image',
          source: {
            expression: {
              kind: 'and',
              operands: [{ kind: 'references' }, { kind: 'predicate', value: 'other' }],
            },
          },
        },
        { kind: 'predicate', value: 'part' },
      ],
    });
    expect(parts.chapters.toAst().expression).toMatchObject({
      kind: 'relation-image',
      relationName: 'children',
    });
    expect(defineClientEntity(Book).by({ id: 'b1' }).parts.toAst()).toEqual(parts.toAst());
    expect(declare).toHaveBeenCalledTimes(1);
    expectTypeOf<InferEntityRecord<typeof Book.fields>>().not.toHaveProperty('parts');
    expectTypeOf(source).not.toHaveProperty('unknown');
    expect(
      parts.and(n => {
        expectTypeOf(n).not.toHaveProperty('unknown');
        return n.type.eq('part');
      }).root,
    ).toBe(Node);
  });

  it('discovers portable contracts and evaluates the composed membership in memory', async () => {
    const { Book, Node, Chapter } = fixture();
    const dataset = {
      Book: [{ id: 'b1' }],
      Node: [
        { id: 'p1', bookId: 'b1', type: 'part' },
        { id: 'n2', bookId: 'b1', type: 'chapter' },
      ],
      Chapter: [
        { id: 'c1', partId: 'p1' },
        { id: 'c2', partId: 'n2' },
      ],
    };
    const app = ontahi({
      entities: [Book, Node, Chapter],
      storage: createInMemoryDataGraphStorage({ dataset }),
    });
    const discovered = JSON.parse(JSON.stringify(app.graph.describe()));
    expect(
      discovered.entities.find((e: { name: string }) => e.name === 'Book').contextualSelections
        .parts,
    ).toMatchObject({
      input: { context: { kind: 'selection', entityName: 'Book' } },
      output: { kind: 'selection', entityName: 'Node' },
    });
    const descriptor = Book.contextualSelections.parts;
    descriptor.template.relationName = 'missing';
    expect(Book.contextualSelections.parts.template.relationName).toBe('contentNodes');
    const runtime = createInMemoryDataGraphRuntime({ dataset, entities: [Book, Node, Chapter] });
    expect(
      await Effect.runPromise(
        runtime.run(Book.by({ id: 'b1' }).parts.chapters.toQuery(), undefined),
      ),
    ).toEqual([{ id: 'c1', partId: 'p1' }]);
    const bound = createRuntimeBoundDataGraphApi(() => runtime)
      .bindSelectionEntity(Book)
      .selection(b => b.id.eq('b1'));
    expect(await Effect.runPromise(bound.parts.chapters.run())).toEqual([
      { id: 'c1', partId: 'p1' },
    ]);
    expect(await Effect.runPromise(bound.where(b => b.id.eq('absent')).parts.run())).toEqual([]);
  });

  it('resolves self-relations before compiling declarations, keeping the original ContentNode identity', () => {
    const fields = {
      id: field.id(),
      bookId: field.string(),
      parentId: field.nullable(field.string()),
      type: field.enum(['part', 'chapter']),
    };
    const ContentNode = entity({
      name: 'ContentNode',
      fields,
      relations: () => ({
        children: relation.hasMany(entity.ref('ContentNode', { fields }), { via: 'parentId' }),
      }),
      selections: ({ self }) => ({ chapters: self.children.where(n => n.type.eq('chapter')) }),
    });
    const Book = entity({
      name: 'Book',
      fields: { id: field.id() },
      relations: { nodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
      selections: ({ self }) => ({ parts: self.nodes.where(n => n.type.eq('part')) }),
    });
    expect(() => ContentNode.contextualSelections).toThrow('resolve entity relations');
    ontahi({
      entities: [Book, ContentNode],
      storage: createInMemoryDataGraphStorage({ dataset: {} }),
    });
    const result = Selection.all(Book).parts.chapters;
    expect(result.root).toBe(ContentNode);
    expect(result.toAst().entityName).toBe('ContentNode');
  });

  it('owns portable declarations and rejects arbitrary resolver objects', () => {
    const Target = entity({ name: 'Target', fields: { id: field.id() } });
    const Base = entity({
      name: 'Base',
      fields: { id: field.id() },
      relations: { targets: relation.hasMany(Target) },
    });
    const templates = {
      targets: { relationName: 'targets' as const, expression: { kind: 'all' as const } },
    };
    const Owner = withContextualSelections(Base, templates);
    Object.assign(templates.targets.expression, { kind: 'none' });
    expect(Selection.all(Owner).targets.toAst().expression.kind).toBe('relation-image');
    const Fake = entity({
      name: 'Fake',
      fields: { id: field.id() },
      // @ts-expect-error arbitrary callbacks are not portable contextual factories
      selections: () => ({
        invalid: { from: () => Selection.all(Target) },
      }),
    });
    expect(() => Fake.contextualSelections).toThrow('built from self relations');
  });

  it('rejects API collisions and source view modifiers without silently discarding them', () => {
    const { Book } = fixture();
    expect(() => Book.by({ id: 'b1' }).limit(1).parts).toThrow('membership');
    const Bad = entity({
      name: 'Bad',
      fields: { id: field.id() },
      relations: { books: relation.hasMany(Book) },
      selections: ({ self }) => ({ where: self.books }),
    });
    expect(() => Selection.all(Bad).where).not.toThrow();
    expect(() => Bad.contextualSelections).toThrow('conflicts');
    expect(() => withContextualSelections(Book, () => ({}))).toThrow('already declared');
  });
});
