import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  Selection,
  withContextualSelections,
  type GraphReadPolicy,
  type GraphReadRequestV2,
} from './index.js';

const fixture = () => {
  const Base = entity('Node', {
    id: field.id(),
    bookId: field.string(),
    parentId: field.nullable(field.string()),
    type: field.enum(['part', 'chapter']),
    owner: field.string(),
  });
  const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
  const Node = withContextualSelections(
    Base.hasMany('children', Base, { via: 'parentId' }),
    ({ self }) => ({ chapters: self.children.as(Chapter) }),
  );
  const Part = Node.variant('Part', { discriminator: { type: 'part' } });
  const Book = withContextualSelections(
    entity('Book', { id: field.id(), owner: field.string() }).hasMany('nodes', Node, {
      via: 'bookId',
    }),
    ({ self }) => ({ parts: self.nodes.as(Part) }),
  );
  const runtime = createInMemoryDataGraphRuntime({
    entities: [Book, Node],
    dataset: {
      Book: [
        { id: 'b1', owner: 'alice' },
        { id: 'b2', owner: 'bob' },
      ],
      Node: [
        { id: 'p1', bookId: 'b1', parentId: null, type: 'part', owner: 'alice' },
        { id: 'c1', bookId: 'b1', parentId: 'p1', type: 'chapter', owner: 'alice' },
        { id: 'wrong', bookId: 'b1', parentId: 'p1', type: 'part', owner: 'alice' },
        { id: 'fake-part', bookId: 'b1', parentId: null, type: 'chapter', owner: 'alice' },
        {
          id: 'wrong-parent',
          bookId: 'b1',
          parentId: 'fake-part',
          type: 'chapter',
          owner: 'alice',
        },
        { id: 'p2', bookId: 'b2', parentId: null, type: 'part', owner: 'alice' },
        { id: 'other-book', bookId: 'b2', parentId: 'p2', type: 'chapter', owner: 'alice' },
        { id: 'private-part', bookId: 'b1', parentId: null, type: 'part', owner: 'bob' },
        {
          id: 'private-parent',
          bookId: 'b1',
          parentId: 'private-part',
          type: 'chapter',
          owner: 'alice',
        },
      ],
    },
  });
  const policies: GraphReadPolicy<any, string>[] = [
    {
      entity: Book,
      modes: ['run', 'count', 'get'],
      cardinalities: ['many', 'one'],
      maxLimit: 25,
      fields: { id: { select: true, filter: ['eq'] }, owner: { select: true } },
      selectionRelations: ['nodes'],
      scope: ({ authority }) => ({
        kind: 'predicate',
        fieldName: 'owner',
        operator: 'eq',
        value: authority,
      }),
    },
    {
      entity: Node,
      variants: [Part, Chapter],
      modes: ['run', 'count', 'get'],
      cardinalities: ['many', 'one'],
      maxLimit: 25,
      fields: {
        id: { select: true, filter: ['eq'], order: true },
        bookId: { select: true },
        parentId: { select: true },
        type: { select: true },
        owner: { select: true },
      },
      selectionRelations: ['children'],
      scope: ({ authority }) => ({
        kind: 'predicate',
        fieldName: 'owner',
        operator: 'eq',
        value: authority,
      }),
    },
  ];
  const execute = vi.fn((query, mode) =>
    Effect.runPromise(
      mode === 'count'
        ? runtime.count(query, undefined)
        : mode === 'get'
          ? runtime.get(query, undefined)
          : runtime.run(query, undefined),
    ),
  );
  const dispatch = createGraphReadDispatcher({ policies, execute, relationSelections: true });
  const request: GraphReadRequestV2 = {
    kind: 'graph-read',
    version: 2,
    mode: 'run',
    orderBy: [],
    selection: {
      kind: 'selection',
      entityName: 'Chapter',
      expression: {
        kind: 'relation-image',
        relationName: 'children',
        source: {
          kind: 'selection',
          entityName: 'Part',
          expression: {
            kind: 'relation-image',
            relationName: 'nodes',
            source: {
              kind: 'selection',
              entityName: 'Book',
              expression: { kind: 'all' },
            },
          },
        },
      },
    },
  };
  return { Base, Node, Book, Chapter, Part, runtime, policies, execute, dispatch, request };
};

describe('classified contextual Selection destinations', () => {
  it('hydrates portable classified templates and rejects a descriptor for another relation target', () => {
    const { Node } = fixture();
    const base = () =>
      entity('TemplateBook', { id: field.id() }).hasMany('nodes', Node, { via: 'bookId' });
    const descriptor = {
      kind: 'entity-variant',
      name: 'Part',
      baseEntityName: 'Node',
      discriminator: { fieldName: 'type', value: 'part' },
    } as const;
    const Book = withContextualSelections(base(), {
      parts: { relationName: 'nodes', expression: { kind: 'all' }, variant: descriptor },
    });
    const parts = Selection.all(Book).parts;
    expect(parts.variant.name).toBe('Part');
    expect(parts.variant.base).toBe(Node);
    expectTypeOf(parts).not.toHaveProperty('delete');
    parts.where(node => {
      // @ts-expect-error Hydrated templates retain the narrowed discriminator type.
      node.type.eq('chapter');
      return node.type.eq('part');
    });
    expect(
      () =>
        withContextualSelections(base(), {
          parts: {
            relationName: 'nodes',
            expression: { kind: 'all' },
            variant: { ...descriptor, baseEntityName: 'Other' },
          },
        }).contextualSelections,
    ).toThrow('must classify');
    expect(
      () =>
        withContextualSelections(base(), {
          parts: {
            relationName: 'nodes',
            expression: { kind: 'all' },
            variant: { ...descriptor, discriminator: { fieldName: 'type', value: 'unknown' } },
          },
        }).contextualSelections,
    ).toThrow('required stored enum');
  });

  it('composes typed read-only destinations and preserves classification at every hop', async () => {
    const { Book, Chapter, Part, Node, runtime } = fixture();
    const parts = Selection.where(Book, b => b.id.eq('b1')).parts;
    expect(parts.variant).toBe(Part);
    const chapters = parts.chapters;
    expect(chapters.variant).toBe(Chapter);
    expectTypeOf(chapters).not.toHaveProperty('update');
    expectTypeOf(parts).not.toHaveProperty('delete');
    chapters.where(node => {
      // @ts-expect-error Classification narrows finite values.
      node.type.eq('part');
      return node.type.eq('chapter');
    });
    expect(
      (await Effect.runPromise(runtime.run(chapters.many(), undefined))).map(row => row.id),
    ).toEqual(['c1', 'private-parent']);
    expect(
      (
        await Effect.runPromise(
          runtime.run(parts.where(node => node.id.eq('p1')).chapters.many(), undefined),
        )
      ).map(row => row.id),
    ).toEqual(['c1']);
    expect(parts.and(parts).variant).toBe(Part);
    expect(parts.not().variant).toBe(Part);
    expect(Book.contextualSelections.parts.output.entityName).toBe('Part');
    expect(Node.contextualSelections.chapters.template.target.entityName).toBe('Chapter');
    expect(chapters.toQuery().build().root).toBe(Node);
  });

  it('enforces source/target classifications and base scopes after transport without requiring discriminator grants', async () => {
    const { dispatch, request, execute, Node } = fixture();
    const result = await dispatch(JSON.parse(JSON.stringify(request)), { authority: 'alice' });
    expect(result).toMatchObject({ kind: 'graph-read-result', value: [{ id: 'c1' }] });
    expect(execute.mock.calls[0]![0].root).toBe(Node);
    expect(await dispatch({ ...request, mode: 'count' }, { authority: 'alice' })).toEqual({
      kind: 'graph-read-result',
      value: 1,
    });
    expect(
      await dispatch({ ...request, mode: 'get', cardinality: 'one' }, { authority: 'alice' }),
    ).toMatchObject({ kind: 'graph-read-result', value: { id: 'c1' } });
    expect(await dispatch({ ...request, limit: 0 }, { authority: 'alice' })).toEqual({
      kind: 'graph-read-result',
      value: [],
    });
  });

  it('does not let complement escape the final classified universe', async () => {
    const { dispatch, request } = fixture();
    const complement = {
      ...request,
      selection: {
        ...request.selection,
        expression: { kind: 'not', operand: request.selection.expression },
      },
    };
    const result = await dispatch(complement, { authority: 'alice' });
    expect(result).toMatchObject({
      kind: 'graph-read-result',
      value: [
        { id: 'fake-part' },
        { id: 'wrong-parent' },
        { id: 'other-book' },
        { id: 'private-parent' },
      ],
    });
  });

  it('rejects foreign classifiers, missing registrations and denied source hops', async () => {
    const { Book, Chapter, policies, execute, request } = fixture();
    const Other = entity('Other', { id: field.id(), type: field.enum(['chapter']) }).variant(
      'OtherChapter',
      { discriminator: { type: 'chapter' } },
    );
    expect(
      () =>
        withContextualSelections(
          entity('Wrong', { id: field.id() }).hasMany('books', Book),
          ({ self }) => ({ bad: self.books.as(Other as never) }),
        ).contextualSelections,
    ).toThrow('must classify');
    const noVariants = createGraphReadDispatcher({
      policies: policies.map(policy => ({ ...policy, variants: [] })),
      execute,
      relationSelections: true,
    });
    expect(await noVariants(request, { authority: 'alice' })).toMatchObject({
      kind: 'protocol-error',
    });
    const denied = createGraphReadDispatcher({
      policies: policies.map(policy => ({ ...policy, selectionRelations: [] })),
      execute,
      relationSelections: true,
    });
    expect(await denied(request, { authority: 'alice' })).toMatchObject({
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(Chapter.base.name).toBe('Node');
  });

  it('keeps classified hops read-only and executable when the source is runtime-bound', async () => {
    const { Book, runtime } = fixture();
    const parts = createRuntimeBoundDataGraphApi(() => runtime)
      .bindSelectionEntity(Book)
      .selection(b => b.id.eq('b1')).parts;
    expect(parts.variant.name).toBe('Part');
    expect('update' in parts).toBe(false);
    expect(parts.many().build().root.name).toBe('Node');
    expect(
      await Effect.runPromise(parts.where(node => node.id.eq('p1')).chapters.run()),
    ).toMatchObject([{ id: 'c1' }]);
    expectTypeOf<Effect.Effect.Success<ReturnType<typeof parts.chapters.run>>>().toMatchTypeOf<
      Array<{ type: 'chapter' }>
    >();
    const fromQuery = createRuntimeBoundDataGraphApi(() => runtime)
      .bindSelectionEntity(Book)
      .where(b => b.id.eq('b1')).parts;
    expect(
      await Effect.runPromise(
        fromQuery
          .where(node => node.id.eq('p1'))
          .chapters.one()
          .run(),
      ),
    ).toMatchObject({ id: 'c1' });
  });
});
