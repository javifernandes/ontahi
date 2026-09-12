import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  createRelatedRootReadSpec,
  entity,
  field,
  graphSchema,
  isRelatedRootReadSpec,
  query,
  safeParseGraphSchema,
  Selection,
  withSelectionFactories,
  type AnyEntityDefinition,
  type RelatedRootReadSpec,
  type RelationshipFact,
  type SelectionBuilder,
} from './index.js';

// Plan 120b experiment, not a public API. The declaration is portable data, but applying it
// currently produces a related-root READ, not a canonical Selection. Do not ship this as `.parts`.
const contextualFactory = <
  TSource extends AnyEntityDefinition,
  TKey extends keyof TSource['relations'] & string,
>(
  owner: TSource,
  relationName: TKey,
  where?: SelectionBuilder<TSource['relations'][TKey]['target']>,
) => {
  type Target = TSource['relations'][TKey]['target'];
  const relation = owner.relations[relationName];
  if (!relation) throw new Error(`Unknown relation ${owner.name}.${relationName}.`);
  const target: Target = relation.target;
  const membership = where ? Selection.where(target, where) : Selection.all(target);
  const parsed = safeParseGraphSchema(graphSchema.selection(target), membership.toAst());
  if (!parsed.success) throw new Error('Invalid target membership.');
  const descriptor = {
    version: 1,
    input: { context: { kind: 'selection', entityName: owner.name } },
    output: { kind: 'selection', entityName: target.name },
    template: { relationName, target: membership.toAst() },
  };

  return {
    get descriptor() {
      return structuredClone(descriptor);
    },
    from(source: Selection<TSource> | RelatedRootReadSpec<TSource>) {
      const sourceEntity = isRelatedRootReadSpec(source) ? source.target.root : source.root;
      if (sourceEntity.name !== owner.name) throw new Error(`Expected ${owner.name} context.`);
      return createRelatedRootReadSpec({
        mode: 'rows',
        source: isRelatedRootReadSpec(source) ? source : source.toQuery().build(),
        sourceEntity: owner,
        relationName,
        relationOwner: 'source',
        target: query(target).where(parsed.data).build(),
      });
    },
  };
};

const defineBooks = () => {
  const Node = entity('FactoryContentNode', {
    id: field.id(),
    bookId: field.string(),
    parentId: field.nullable(field.string()),
    type: field.enum(['part', 'chapter']),
    title: field.string(),
  });
  const ContentNode = Node.hasMany('children', Node, { via: 'parentId' });
  const Book = entity('FactoryBook', { id: field.id(), slug: field.string() }).hasMany(
    'contentNodes',
    ContentNode,
    { via: 'bookId' },
  );
  const parts = contextualFactory(Book, 'contentNodes', node => node.type.eq('part'));
  const chapters = contextualFactory(ContentNode, 'children', node => node.type.eq('chapter'));
  const Books = withSelectionFactories(Book, {
    slug: {
      version: 1,
      input: graphSchema.object({ slug: field.string() }),
      scalarInput: 'slug',
      template: { kind: 'predicate', fieldName: 'slug', operator: 'eq', input: 'slug' },
    },
  });
  return { Book, Books, ContentNode, parts, chapters };
};

const makeDataset = () => ({
  FactoryBook: [
    { id: 'b1', slug: 'alpha' },
    { id: 'b2', slug: 'beta' },
  ],
  FactoryContentNode: [
    { id: 'p1', bookId: 'b1', parentId: null, type: 'part', title: 'Alpha part' },
    { id: 'p2', bookId: 'b2', parentId: null, type: 'part', title: 'Beta part' },
    { id: 'c1', bookId: 'b1', parentId: 'p1', type: 'chapter', title: 'Alpha chapter' },
    { id: 'c2', bookId: 'b2', parentId: 'p2', type: 'chapter', title: 'Beta chapter' },
    { id: 'root', bookId: 'b1', parentId: null, type: 'chapter', title: 'Root chapter' },
    { id: 'nested-part', bookId: 'b1', parentId: 'p1', type: 'part', title: 'Not a chapter' },
  ],
});

describe('Plan 120b: contextual Selection factory experiment', () => {
  it('compiles a typed declaration once and derives the target from a real relation', () => {
    const { Book, ContentNode } = defineBooks();
    const build = vi.fn<SelectionBuilder<typeof ContentNode>>(node => node.type.eq('part'));
    const parts = contextualFactory(Book, 'contentNodes', build);
    expectTypeOf(parts.from(Selection.all(Book)).target.root).toEqualTypeOf<typeof ContentNode>();
    parts.from(Selection.none(Book));
    expect(build).toHaveBeenCalledTimes(1);
    expect(parts.descriptor).toEqual({
      version: 1,
      input: { context: { kind: 'selection', entityName: Book.name } },
      output: { kind: 'selection', entityName: ContentNode.name },
      template: {
        relationName: 'contentNodes',
        target: {
          kind: 'selection',
          entityName: ContentNode.name,
          expression: { kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'part' },
        },
      },
    });
    expect(JSON.parse(JSON.stringify(parts.descriptor))).toEqual(parts.descriptor);
    expect(parts.descriptor.template).not.toHaveProperty('sourceField');
    const copy = parts.descriptor;
    copy.output.entityName = 'WrongEntity';
    expect(parts.descriptor.output.entityName).toBe(ContentNode.name);
  });

  it('builds by → parts → chapters without runtime access and preserves every membership constraint', async () => {
    const { Books, parts, chapters } = defineBooks();
    const source = Books.by({ slug: 'alpha' });
    const before = source.toAst();
    const read = chapters.from(parts.from(source));
    expect(source.toAst()).toEqual(before);
    expect(read).toMatchObject({
      relationName: 'children',
      relationOwner: 'source',
      target: { selection: { fieldName: 'type', value: 'chapter' } },
      source: {
        relationName: 'contentNodes',
        target: { selection: { fieldName: 'type', value: 'part' } },
        source: { selection: { fieldName: 'slug', value: 'alpha' } },
      },
    });
    // There was no runtime or dataset available when the complete plan was constructed.
    const runtime = createInMemoryDataGraphRuntime({ dataset: makeDataset() });
    const rows = await Effect.runPromise(runtime.run(read, undefined));
    expect(rows.map(row => row.id)).toEqual(['c1']);
  });

  it('reuses the declaration for multiple and empty roots without adding an implicit root-chapter branch', async () => {
    const { Book, parts, chapters } = defineBooks();
    const runtime = createInMemoryDataGraphRuntime({ dataset: makeDataset() });
    const all = chapters.from(parts.from(Selection.all(Book)));
    const none = chapters.from(parts.from(Selection.none(Book)));
    expect((await Effect.runPromise(runtime.run(all, undefined))).map(row => row.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(await Effect.runPromise(runtime.run(none, undefined))).toEqual([]);
  });

  it('evaluates membership at execution rather than snapshotting factory members', async () => {
    const { Books, parts, chapters } = defineBooks();
    const read = chapters.from(parts.from(Books.by({ slug: 'alpha' })));
    const dataset = makeDataset();
    dataset.FactoryContentNode.push({
      id: 'late',
      bookId: 'b1',
      parentId: 'p1',
      type: 'chapter',
      title: 'Created after assembly',
    });
    const runtime = createInMemoryDataGraphRuntime({ dataset });
    expect((await Effect.runPromise(runtime.run(read, undefined))).map(row => row.id)).toEqual([
      'c1',
      'late',
    ]);
  });

  it('also handles plain TodoList → items without classifiers or custom path metadata', async () => {
    const Item = entity('FactoryTodoItem', { id: field.id(), listId: field.string() });
    const List = entity('FactoryTodoList', { id: field.id() }).hasMany('items', Item, {
      via: 'listId',
    });
    const items = contextualFactory(List, 'items');
    const source = Selection.where(List, list => list.id.eq('l1'));
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        FactoryTodoList: [{ id: 'l1' }, { id: 'l2' }],
        FactoryTodoItem: [
          { id: 'i1', listId: 'l1' },
          { id: 'i2', listId: 'l2' },
        ],
      },
    });
    expect(await Effect.runPromise(runtime.run(items.from(source), undefined))).toEqual([
      { id: 'i1', listId: 'l1' },
    ]);
    expect(items.descriptor.template.target.expression).toEqual({ kind: 'all' });
  });

  it('rejects wrong context, unknown relations and invalid target fields in the experiment', () => {
    const { Book, ContentNode, parts } = defineBooks();
    // @ts-expect-error The context is a Book Selection, not a ContentNode Selection.
    expect(() => parts.from(Selection.all(ContentNode))).toThrow('Expected FactoryBook context');
    // @ts-expect-error Relation names come from the model, not UI path hints.
    expect(() => contextualFactory(Book, 'contents')).toThrow('Unknown relation');
    expect(() =>
      // @ts-expect-error The predicate sees ContentNode fields, not Book fields.
      contextualFactory(Book, 'contentNodes', node => node.slug.eq('alpha')),
    ).toThrow();
    expect(() =>
      contextualFactory(Book, 'contentNodes', () => ({
        kind: 'predicate',
        fieldName: 'missing',
        operator: 'eq',
        value: 'part',
      })),
    ).toThrow('Invalid target membership');
  });

  it('unions shared many-to-many targets without duplicating them for each source', async () => {
    const Tag = entity('FactoryTag', { id: field.id() });
    const Item = entity('FactoryTaggedItem', { id: field.id() }).manyToMany('tags', Tag);
    const tags = contextualFactory(Item, 'tags');
    const relationships: RelationshipFact[] = ['i1', 'i2'].map(id => ({
      relation: {
        sourceEntityName: Item.name,
        targetEntityName: Tag.name,
        relationName: 'tags',
        cardinality: 'many-to-many',
      },
      source: createEntityRef(Item, { id }),
      target: createEntityRef(Tag, { id: 'shared' }),
    }));
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        FactoryTaggedItem: [{ id: 'i1' }, { id: 'i2' }],
        FactoryTag: [{ id: 'shared' }, { id: 'unrelated' }],
      },
      relationships,
    });
    expect(await Effect.runPromise(runtime.run(tags.from(Selection.all(Item)), undefined))).toEqual(
      [{ id: 'shared' }],
    );
  });

  it('keeps the current read-plan/portable-Selection gap explicit instead of publishing a false contract', () => {
    const { Book, ContentNode, parts } = defineBooks();
    const read = parts.from(Selection.all(Book));
    expect(isRelatedRootReadSpec(read)).toBe(true);
    expect(safeParseGraphSchema(graphSchema.selection(ContentNode), read).success).toBe(false);
    expect(read).not.toHaveProperty('toAst');
    expect(read).not.toHaveProperty('update');
    // A graph-native declaration can reuse this executor, but its output must first become real
    // portable membership. Query shaping, policy dispatch and wire support cannot be inferred.
  });
});
