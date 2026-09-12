import { Effect, Stream } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  contextualSelectionFactory,
  copySelectionExpression,
  createEntityRef,
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  compileSelectionExpression,
  entity,
  field,
  graphSchema,
  lowerSelectionReferences,
  parseGraphSchema,
  safeParseGraphSchema,
  Selection,
  toGraphReadRequest,
  withSelectionFactories,
  type GraphCommandSpec,
  type RelationshipFact,
  type SelectionExpression,
} from './index.js';

const fixture = () => {
  const Node = entity('Node', {
    id: field.id(),
    bookId: field.string(),
    parentId: field.nullable(field.string()),
    type: field.enum(['part', 'chapter']),
    title: field.string(),
  });
  const Nodes = Node.hasMany('children', Node, { via: 'parentId' });
  const Book = entity('Book', { id: field.id(), slug: field.string() }).hasMany('nodes', Nodes, {
    via: 'bookId',
  });
  const parts = contextualSelectionFactory(Book, 'nodes', node => node.type.eq('part'));
  const chapters = contextualSelectionFactory(Nodes, 'children', node => node.type.eq('chapter'));
  const Books = withSelectionFactories(Book, {
    slug: {
      version: 1,
      input: graphSchema.object({ slug: field.string() }),
      scalarInput: 'slug',
      template: { kind: 'predicate', fieldName: 'slug', operator: 'eq', input: 'slug' },
    },
  });
  const dataset = {
    Book: [
      { id: 'b1', slug: 'alpha' },
      { id: 'b2', slug: 'beta' },
    ],
    Node: [
      { id: 'p1', bookId: 'b1', parentId: null, type: 'part', title: 'Part A' },
      { id: 'p2', bookId: 'b2', parentId: null, type: 'part', title: 'Part B' },
      { id: 'c1', bookId: 'b1', parentId: 'p1', type: 'chapter', title: 'Chapter A' },
      { id: 'c2', bookId: 'b2', parentId: 'p2', type: 'chapter', title: 'Chapter B' },
      { id: 'root', bookId: 'b1', parentId: null, type: 'chapter', title: 'Root' },
    ],
  };
  const entities = [Book, Nodes];
  const runtime = createInMemoryDataGraphRuntime({ entities, dataset });
  const schema = graphSchema.selection(Nodes, { entities });
  const selected = chapters.from(parts.from(Books.by({ slug: 'alpha' })));
  return {
    Book,
    Books,
    Node,
    Nodes,
    parts,
    chapters,
    selected,
    dataset,
    entities,
    runtime,
    schema,
  };
};

describe('contextual Selection factories', () => {
  it('owns reference predicate values in the source and in serialized copies', () => {
    const Owner = entity('Owner', { id: field.id() });
    const Leaf = entity('Leaf', { id: field.id(), parentId: field.string() });
    const Parent = entity('Parent', { id: field.id(), owner: field.ref(Owner) }).hasMany(
      'leaves',
      Leaf,
      { via: 'parentId' },
    );
    const owner = createEntityRef(Owner, { id: 'o1' });
    const selected = Selection.where(Parent, parent => parent.owner.eq(owner)).through('leaves');
    const snapshot = JSON.stringify(selected);
    Object.assign(owner.locator, { id: 'o2' });
    expect(JSON.stringify(selected)).toBe(snapshot);
    const ast = selected.toAst();
    if (
      ast.expression.kind !== 'relation-image' ||
      ast.expression.source.expression.kind !== 'predicate' ||
      ast.expression.source.expression.operator !== 'eq'
    )
      throw new Error('Expected reference predicate');
    const value = ast.expression.source.expression.value as typeof owner;
    Object.assign(value.locator, { id: 'o3' });
    expect(JSON.stringify(selected)).toBe(snapshot);
  });
  it('builds real typed membership with no runtime and no inherited singleton claim', () => {
    const { Book, Node, parts, selected } = fixture();
    expectTypeOf(selected.root).toEqualTypeOf<typeof Node>();
    expectTypeOf(selected).toExtend<Selection<typeof Node, undefined>>();
    const one = Selection.references(Book, [createEntityRef(Book, { id: 'b1' })], 'one');
    expect(parts.from(one).cardinality).toBeUndefined();
    expect(selected.toAst()).toEqual({
      kind: 'selection',
      entityName: 'Node',
      expression: {
        kind: 'and',
        operands: [
          {
            kind: 'relation-image',
            relationName: 'children',
            source: {
              kind: 'selection',
              entityName: 'Node',
              expression: {
                kind: 'and',
                operands: [
                  {
                    kind: 'relation-image',
                    relationName: 'nodes',
                    source: {
                      kind: 'selection',
                      entityName: 'Book',
                      expression: {
                        kind: 'predicate',
                        fieldName: 'slug',
                        operator: 'eq',
                        value: 'alpha',
                      },
                    },
                  },
                  { kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'part' },
                ],
              },
            },
          },
          { kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'chapter' },
        ],
      },
    });
  });

  it('round-trips through the Selection schema using receiver model definitions', async () => {
    const { selected, schema, runtime } = fixture();
    const ast = JSON.parse(JSON.stringify(selected));
    const restored = parseGraphSchema(schema, ast);
    expect(restored).toBeInstanceOf(Selection);
    expect(restored.build()).toEqual(selected.build());
    const rows = await Effect.runPromise(
      runtime.run(new Selection(restored.root, restored.expression).toQuery(), undefined),
    );
    expect(rows.map(row => row.id)).toEqual(['c1']);
    expect(JSON.stringify(restored)).not.toMatch(/targetField|sourceField|mapping/);
  });

  it('copies and lowers nested sources independently without erasing traversal', () => {
    const { Book, Nodes } = fixture();
    const source = Selection.references(Book, [createEntityRef(Book, { id: 'b1' })]);
    const selected = source.through('nodes');
    const copy = copySelectionExpression(selected.expression);
    if (copy.kind !== 'relation-image') throw new Error('Expected image');
    expect(copy.source).not.toBe((selected.expression as typeof copy).source);
    expect(lowerSelectionReferences(copy)).toEqual({
      kind: 'relation-image',
      relationName: 'nodes',
      source: {
        kind: 'selection',
        entityName: 'Book',
        expression: { kind: 'predicate', fieldName: 'id', operator: 'eq', value: 'b1' },
      },
    });
    expect(selected.root).toBe(Nodes);
    expect(source.expression.kind).toBe('references');
  });

  it('supports nested intersection, union and complement over target membership', async () => {
    const { Books, Node, parts, chapters, selected, runtime } = fixture();
    const second = chapters.from(parts.from(Books.by({ slug: 'beta' })));
    const ids = async (selection: Selection<typeof Node>) =>
      (await Effect.runPromise(runtime.run(selection.toQuery(), undefined))).map(row => row.id);
    expect(await ids(selected.or(second))).toEqual(['c1', 'c2']);
    expect(await ids(selected.and(second))).toEqual([]);
    expect(await ids(selected.not().and(node => node.type.eq('chapter')))).toEqual(['c2', 'root']);
    expect(await ids(chapters.from(parts.from(Selection.none(Books))))).toEqual([]);
    expect(await ids(chapters.from(parts.from(Selection.all(Books))))).toEqual(['c1', 'c2']);
  });

  it('applies read shaping last and reevaluates membership for every execution', async () => {
    const { Book, chapters, parts, dataset, runtime } = fixture();
    const selection = chapters.from(parts.from(Selection.all(Book)));
    const read = selection
      .toQuery()
      .orderBy(node => node.title.desc())
      .limit(1);
    expect((await Effect.runPromise(runtime.run(read, undefined))).map(row => row.id)).toEqual([
      'c2',
    ]);
    expect(await Effect.runPromise(runtime.count(read, undefined))).toBe(2);
    expect(
      (await Effect.runPromise(Stream.runCollect(runtime.stream(read, undefined)))).length,
    ).toBe(1);
    dataset.Node.push({ id: 'late', bookId: 'b1', parentId: 'p1', type: 'chapter', title: 'Z' });
    expect((await Effect.runPromise(runtime.get(read, undefined)))?.id).toBe('late');
  });

  it('compiles declarations once and keeps reflected descriptor edits detached', () => {
    const { Book } = fixture();
    const build = vi.fn(
      (): SelectionExpression => ({
        kind: 'predicate',
        fieldName: 'type',
        operator: 'eq',
        value: 'part',
      }),
    );
    const parts = contextualSelectionFactory(Book, 'nodes', build);
    const before = parts.from(Selection.all(Book)).toAst();
    const descriptor = parts.descriptor;
    descriptor.output.entityName = 'Changed';
    expect(parts.from(Selection.all(Book)).toAst()).toEqual(before);
    expect(build).toHaveBeenCalledTimes(1);
    expect(parts.descriptor.output).toEqual({ kind: 'selection', entityName: 'Node' });
    // @ts-expect-error Source entity must be Book.
    expect(() => parts.from(Selection.all(entity('Other', { id: field.id() })))).toThrow('context');
    // @ts-expect-error Unknown relation, even if it was used in an old UI hint.
    expect(() => contextualSelectionFactory(Book, 'contents')).toThrow('Unknown relation');
    expect(() =>
      contextualSelectionFactory(Book, 'nodes', node => {
        // @ts-expect-error The target predicate sees Node, not Book.
        return node.slug.eq('alpha');
      }),
    ).toThrow();
  });

  it.each([
    {
      source: { kind: 'selection', entityName: 'Unknown', expression: { kind: 'all' } },
      relationName: 'nodes',
    },
    {
      source: { kind: 'selection', entityName: 'Book', expression: { kind: 'all' } },
      relationName: 'missing',
    },
    {
      source: {
        kind: 'selection',
        entityName: 'Book',
        expression: { kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'part' },
      },
      relationName: 'nodes',
    },
    {
      source: { kind: 'selection', entityName: 'Book', expression: { kind: 'all' }, limit: 1 },
      relationName: 'nodes',
    },
  ])('rejects malformed source membership %j', malformed => {
    const { schema } = fixture();
    expect(
      safeParseGraphSchema(schema, {
        kind: 'selection',
        entityName: 'Node',
        expression: { kind: 'relation-image', ...malformed },
      }).success,
    ).toBe(false);
  });

  it('rejects unavailable model context, mismatched targets and unbounded recursion', async () => {
    const { selected, schema, Book, Nodes, dataset } = fixture();
    expect(safeParseGraphSchema(graphSchema.selection(Nodes), selected).success).toBe(false);
    const otherTarget = graphSchema.selection(Book, { entities: [Book, Nodes] });
    expect(
      safeParseGraphSchema(otherTarget, { ...selected.toAst(), entityName: 'Book' }).success,
    ).toBe(false);
    const cyclic: { kind: 'not'; operand?: unknown } = { kind: 'not' };
    cyclic.operand = cyclic;
    expect(
      safeParseGraphSchema(schema, { kind: 'selection', entityName: 'Node', expression: cyclic })
        .success,
    ).toBe(false);
    const runtime = createInMemoryDataGraphRuntime({ dataset });
    await expect(Effect.runPromise(runtime.run(selected.toQuery(), undefined))).rejects.toThrow(
      'Unknown Selection source entity Book',
    );
  });

  it('rejects transport and mutation before executing or changing data', async () => {
    const { selected, runtime, dataset, Nodes } = fixture();
    const before = structuredClone(dataset);
    expect(() => toGraphReadRequest(selected.toQuery(), 'run')).toThrow('protocol v1');
    expect(() => compileSelectionExpression(Nodes, selected.expression)).toThrow('relation-image');
    expect(() => selected.update({ title: 'Changed' })).toThrow('Graph Commands');
    expect(() => selected.where(node => node.type.eq('chapter')).delete()).toThrow(
      'Graph Commands',
    );
    const command: GraphCommandSpec = {
      kind: 'command',
      operation: 'delete',
      root: Nodes,
      selection: selected.expression,
    };
    await expect(Effect.runPromise(runtime.runCommand(command))).rejects.toThrow('relation-image');
    expect(dataset).toEqual(before);
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [
        {
          entity: Nodes,
          modes: ['run'],
          cardinalities: ['many'],
          scope: 'all',
          maxLimit: 25,
          fields: { id: { select: true } },
        },
      ],
      execute,
    });
    expect(
      await dispatch(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: selected.toAst(),
          orderBy: [],
          limit: 25,
        },
        { authority: undefined },
      ),
    ).toMatchObject({ kind: 'protocol-error', error: { code: 'invalid_selection' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('unions shared many-to-many targets and supports composite target identities', async () => {
    const Tag = entity('Tag', { tenant: field.string(), name: field.string() })
      .locators({ identity: ['tenant', 'name'] })
      .identity('identity');
    const Item = entity('Item', { id: field.id() }).manyToMany('tags', Tag);
    const relationships: RelationshipFact[] = ['i1', 'i2'].map(id => ({
      relation: {
        sourceEntityName: 'Item',
        targetEntityName: 'Tag',
        relationName: 'tags',
        cardinality: 'many-to-many',
      },
      source: createEntityRef(Item, { id }),
      target: createEntityRef(Tag, { tenant: 't1', name: 'shared' }),
    }));
    const runtime = createInMemoryDataGraphRuntime({
      entities: [Item, Tag],
      relationships,
      dataset: {
        Item: [{ id: 'i1' }, { id: 'i2' }],
        Tag: [
          { tenant: 't1', name: 'shared' },
          { tenant: 't2', name: 'shared' },
        ],
      },
    });
    const selection = contextualSelectionFactory(Item, 'tags').from(Selection.all(Item));
    expect(await Effect.runPromise(runtime.run(selection.toQuery(), undefined))).toEqual([
      { tenant: 't1', name: 'shared' },
    ]);
  });

  it('does not infer one target from belongs-to navigation over multiple sources', async () => {
    const List = entity('List', { id: field.id() });
    const Item = entity('Item', {
      id: field.id(),
      listId: field.nullable(field.string()),
    }).belongsTo('list', List, { via: 'listId' });
    const runtime = createInMemoryDataGraphRuntime({
      entities: [List, Item],
      dataset: {
        List: [{ id: 'l1' }, { id: 'l2' }],
        Item: [
          { id: 'i1', listId: 'l1' },
          { id: 'i2', listId: 'l1' },
          { id: 'i3', listId: 'l2' },
          { id: 'i4', listId: null },
        ],
      },
    });
    const selected = Selection.all(Item).through('list');
    expect(selected.cardinality).toBeUndefined();
    expect(await Effect.runPromise(runtime.run(selected.toQuery(), undefined))).toEqual([
      { id: 'l1' },
      { id: 'l2' },
    ]);
    const single = new Selection(List, selected.expression, undefined, 'one');
    await expect(Effect.runPromise(runtime.run(single.toQuery(), undefined))).rejects.toThrow(
      'Expected exactly one',
    );
  });

  it('rejects invalid declaration output and isolates serialized membership from later edits', () => {
    const { Book, Books, parts, schema, selected } = fixture();
    expect(() =>
      contextualSelectionFactory(Book, 'nodes', () => ({
        kind: 'predicate',
        fieldName: 'missing',
        operator: 'eq',
        value: 'part',
      })),
    ).toThrow('Unknown field');
    const original = Books.by({ slug: 'alpha' });
    const derived = parts.from(original);
    const wire = derived.toAst();
    expect(wire.expression).not.toBe(derived.expression);
    const before = JSON.stringify(selected);
    parseGraphSchema(schema, JSON.parse(before));
    expect(JSON.stringify(selected)).toBe(before);
    const tooWide = {
      kind: 'selection',
      entityName: 'Node',
      expression: { kind: 'and', operands: Array.from({ length: 1001 }, () => ({ kind: 'all' })) },
    };
    expect(safeParseGraphSchema(schema, tooWide).success).toBe(false);
  });
});
