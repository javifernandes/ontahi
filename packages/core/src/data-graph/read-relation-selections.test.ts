import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createGraphReadDispatcher,
  createGraphReadObserver,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  isGraphReadCapabilities,
  parseGraphReadRequest,
  resolveGraphReadRequest,
  Selection,
  toGraphReadRequest,
  toGraphReadRequestV2,
  type GraphReadPolicy,
  type GraphReadRequestV2,
  type SelectionExpression,
  type GraphReadDispatchExecutor,
} from './index.js';

const fixture = () => {
  const Node = entity('Node', {
    id: field.id(),
    parentId: field.nullable(field.string()),
    bookId: field.string(),
    owner: field.string(),
    type: field.string(),
  });
  const Nodes = Node.hasMany('children', Node, { via: 'parentId' });
  const Book = entity('Book', { id: field.id(), owner: field.string() }).hasMany('nodes', Nodes, {
    via: 'bookId',
  });
  const dataset = {
    Book: [
      { id: 'a', owner: 'alice' },
      { id: 'b', owner: 'bob' },
    ],
    Node: [
      { id: 'pa', parentId: null, bookId: 'a', owner: 'alice', type: 'part' },
      { id: 'pb', parentId: null, bookId: 'b', owner: 'bob', type: 'part' },
      { id: 'ca', parentId: 'pa', bookId: 'a', owner: 'alice', type: 'chapter' },
      // Visible target, but its intermediate source and Book are outside Alice's scope.
      { id: 'cb', parentId: 'pb', bookId: 'b', owner: 'alice', type: 'chapter' },
      { id: 'hidden', parentId: 'pa', bookId: 'a', owner: 'bob', type: 'chapter' },
      { id: 'root', parentId: null, bookId: 'a', owner: 'alice', type: 'chapter' },
    ],
  };
  const runtime = createInMemoryDataGraphRuntime({ entities: [Book, Nodes], dataset });
  type Authority = { owner: string };
  const bookPolicy: GraphReadPolicy<typeof Book, Authority> = {
    entity: Book,
    fields: { id: { filter: ['eq'], select: true }, owner: { select: true } },
    modes: ['run', 'count', 'get'],
    cardinalities: ['one', 'many'],
    maxLimit: 25,
    selectionRelations: ['nodes'],
    scope: ({ authority }) => Selection.where(Book, book => book.owner.eq(authority.owner)),
  };
  const nodePolicy: GraphReadPolicy<typeof Nodes, Authority> = {
    entity: Nodes,
    fields: {
      id: { select: true },
      parentId: { select: true },
      bookId: { select: true },
      owner: { select: true },
      type: { select: true, filter: ['eq'] },
    },
    modes: ['run', 'count', 'get'],
    cardinalities: ['one', 'many'],
    maxLimit: 25,
    selectionRelations: ['children'],
    scope: ({ authority }) => Selection.where(Nodes, node => node.owner.eq(authority.owner)),
  };
  const execute = vi.fn<GraphReadDispatchExecutor>((query, mode) => {
    if (mode === 'count') return Effect.runPromise(runtime.count(query, undefined));
    if (mode === 'get') return Effect.runPromise(runtime.get(query, undefined));
    return Effect.runPromise(runtime.run(query, undefined));
  });
  const policies = [bookPolicy, nodePolicy];
  const dispatch = createGraphReadDispatcher({ policies, execute, relationSelections: true });
  const parts = Selection.all(Book)
    .through('nodes')
    .and(node => node.type.eq('part'));
  const chapters = parts.through('children').and(node => node.type.eq('chapter'));
  const request = toGraphReadRequestV2(chapters.toQuery(), 'run');
  const context = { authority: { owner: 'alice' } };
  return {
    Book,
    Nodes,
    dataset,
    bookPolicy,
    nodePolicy,
    policies,
    execute,
    dispatch,
    parts,
    chapters,
    request,
    context,
  };
};

describe('Graph Read v2 relation membership authority', () => {
  it('round-trips canonical data, resolves receiver-owned entities and executes a nested self hop', async () => {
    const graph = fixture();
    expectTypeOf(graph.request).toEqualTypeOf<GraphReadRequestV2>();
    expectTypeOf<GraphReadPolicy<typeof graph.Book>['selectionRelations']>().toEqualTypeOf<
      readonly 'nodes'[] | undefined
    >();
    const parsed = parseGraphReadRequest(JSON.parse(JSON.stringify(graph.request)));
    expect(parsed).toEqual({ success: true, request: graph.request });
    const resolved = resolveGraphReadRequest(graph.request, {
      entities: [graph.Book, graph.Nodes],
    });
    expect(resolved.success && resolved.query.root).toBe(graph.Nodes);
    expect(await graph.dispatch(graph.request, graph.context)).toEqual({
      kind: 'graph-read-result',
      value: [graph.dataset.Node[2]],
    });
    expect(graph.execute).toHaveBeenCalledOnce();
    expect(graph.execute.mock.calls[0]![0].limit).toBe(25);
    expect(await graph.dispatch({ ...graph.request, mode: 'count' }, graph.context)).toEqual({
      kind: 'graph-read-result',
      value: 1,
    });
    expect(await graph.dispatch({ ...graph.request, mode: 'get' }, graph.context)).toEqual({
      kind: 'graph-read-result',
      value: graph.dataset.Node[2],
    });
  });

  it('keeps v1, default receivers and observation closed, even for forged wire data', async () => {
    const graph = fixture();
    expect(() => toGraphReadRequest(graph.chapters.toQuery(), 'run')).toThrow('v1');
    expect(await graph.dispatch({ ...graph.request, version: 1 }, graph.context)).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_selection' },
    });
    const legacy = createGraphReadDispatcher({ policies: graph.policies, execute: graph.execute });
    expect(await legacy(graph.request, graph.context)).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'unsupported_version' },
    });
    const observe = vi.fn(async function* () {
      yield [];
    });
    const observer = createGraphReadObserver({ policies: graph.policies, observe });
    const results = [];
    for await (const result of observer(graph.request, {
      ...graph.context,
      signal: new AbortController().signal,
    }))
      results.push(result);
    expect(results).toMatchObject([
      { kind: 'protocol-error', error: { code: 'unsupported_version' } },
    ]);
    expect(observe).not.toHaveBeenCalled();
    expect(graph.execute).not.toHaveBeenCalled();
  });

  it.each([
    'source-grant',
    'intermediate-grant',
    'source-mode',
    'source-filter',
    'target-filter',
    'source-policy',
    'target-policy',
  ])('denies missing %s before any execution', async missing => {
    const graph = fixture();
    const book = {
      ...graph.bookPolicy,
      ...(missing === 'source-grant'
        ? { selectionRelations: [], relations: { nodes: graph.nodePolicy } }
        : {}),
      ...(missing === 'source-mode' ? { modes: ['count'] as const } : {}),
      ...(missing === 'source-filter' ? { fields: {} } : {}),
    };
    const node = {
      ...graph.nodePolicy,
      ...(missing === 'intermediate-grant' ? { selectionRelations: [] } : {}),
      ...(missing === 'target-filter'
        ? { fields: { ...graph.nodePolicy.fields, type: { select: true as const } } }
        : {}),
    };
    const dispatch = createGraphReadDispatcher({
      relationSelections: true,
      execute: graph.execute,
      policies:
        missing === 'source-policy' ? [node] : missing === 'target-policy' ? [book] : [book, node],
    });
    const requested =
      missing === 'source-filter'
        ? toGraphReadRequestV2(
            Selection.where(graph.Book, book => book.id.eq('a'))
              .through('nodes')
              .toQuery(),
            'run',
          )
        : graph.request;
    const result = await dispatch(requested, graph.context);
    expect(result).toMatchObject({ kind: 'protocol-error' });
    if (missing !== 'source-policy')
      expect(result).toMatchObject({ error: { code: 'access_denied' } });
    expect(graph.execute).not.toHaveBeenCalled();
  });

  it('scopes every boundary outside caller NOT/OR and reevaluates authority per request', async () => {
    const graph = fixture();
    const complement = graph.chapters.not().and(node => node.type.eq('chapter'));
    expect(
      await graph.dispatch(toGraphReadRequestV2(complement.toQuery(), 'run'), graph.context),
    ).toEqual({ kind: 'graph-read-result', value: [graph.dataset.Node[3], graph.dataset.Node[5]] });
    const union = graph.chapters.or(Selection.all(graph.chapters.root));
    expect(
      await graph.dispatch(toGraphReadRequestV2(union.toQuery(), 'count'), graph.context),
    ).toEqual({ kind: 'graph-read-result', value: 4 });
    // Scope belongs outside NOT at the intermediate source too.
    const intermediateNot = graph.parts.not().through('children');
    expect(
      await graph.dispatch(toGraphReadRequestV2(intermediateNot.toQuery(), 'run'), graph.context),
    ).toEqual({ kind: 'graph-read-result', value: [] });
    expect(await graph.dispatch(graph.request, { authority: { owner: 'bob' } })).toEqual({
      kind: 'graph-read-result',
      value: [],
    });
    // Remove only Book visibility: Node targets remain visible, membership must still disappear.
    graph.dataset.Book[0]!.owner = 'bob';
    expect(await graph.dispatch(graph.request, graph.context)).toEqual({
      kind: 'graph-read-result',
      value: [],
    });
  });

  it('applies intermediate scope independently of the Book and final target', async () => {
    const graph = fixture();
    graph.dataset.Node[0]!.owner = 'bob';
    expect(await graph.dispatch(graph.request, graph.context)).toEqual({
      kind: 'graph-read-result',
      value: [],
    });
  });

  it('does not leak scope failures and resolves each policy scope once per request', async () => {
    const graph = fixture();
    const scope = vi.fn(graph.nodePolicy.scope as Exclude<typeof graph.nodePolicy.scope, 'all'>);
    const reportError = vi.fn();
    const dispatch = createGraphReadDispatcher({
      relationSelections: true,
      execute: graph.execute,
      reportError,
      policies: [graph.bookPolicy, { ...graph.nodePolicy, scope }],
    });
    await dispatch(graph.request, graph.context);
    expect(scope).toHaveBeenCalledOnce();
    graph.execute.mockClear();
    scope.mockImplementation(() => {
      throw new Error('private tenant credentials');
    });
    expect(await dispatch(graph.request, graph.context)).toEqual({
      kind: 'protocol-error',
      error: {
        code: 'execution_unavailable',
        message: 'Data graph read execution is temporarily unavailable.',
      },
    });
    expect(reportError).toHaveBeenCalledOnce();
    expect(graph.execute).not.toHaveBeenCalled();
  });

  it('advertises opted-in outgoing grants without executing data; include grants are separate', async () => {
    const graph = fixture();
    const request = { version: 1, kind: 'graph-read-capabilities', entityName: 'Book' };
    expect(await graph.dispatch(request, graph.context)).toEqual({
      kind: 'graph-read-capabilities-result',
      entityName: 'Book',
      capabilities: { orderBy: [], relationSelections: { version: 2, relations: ['nodes'] } },
    });
    const legacy = createGraphReadDispatcher({ policies: graph.policies, execute: graph.execute });
    expect(await legacy(request, graph.context)).not.toHaveProperty(
      'capabilities.relationSelections',
    );
    const includeOnly = createGraphReadDispatcher({
      relationSelections: true,
      execute: graph.execute,
      policies: [
        { ...graph.bookPolicy, selectionRelations: [], relations: { nodes: graph.nodePolicy } },
        graph.nodePolicy,
      ],
    });
    expect(await includeOnly(request, graph.context)).toHaveProperty(
      'capabilities.relationSelections.relations',
      [],
    );
    expect(graph.execute).not.toHaveBeenCalled();
    expect(
      await graph.dispatch({ ...graph.request, includeCapabilities: true }, graph.context),
    ).toHaveProperty('capabilities.relationSelections', { version: 2, relations: ['children'] });
    expect(
      isGraphReadCapabilities({
        orderBy: [],
        relationSelections: { version: 2, relations: ['nodes'] },
      }),
    ).toBe(true);
    expect(
      isGraphReadCapabilities({ orderBy: [], relationSelections: { version: 1, relations: [] } }),
    ).toBe(false);
  });

  it('rejects malformed, excessive and caller-supplied join metadata before execution', async () => {
    const graph = fixture();
    const image = Selection.all(graph.Book).through('nodes').expression;
    if (image.kind !== 'relation-image') throw new Error('Expected image');
    const badExpressions: unknown[] = [
      { ...image, relationName: 'unknown' },
      { ...image, join: { table: 'secrets' } },
      { ...image, source: { ...image.source, limit: 1 } },
      {
        ...image,
        source: {
          ...image.source,
          expression: { kind: 'predicate', fieldName: 'owner', operator: 'eq', value: 42 },
        },
      },
    ];
    let deep: SelectionExpression = image;
    for (let i = 0; i < 34; i++) deep = { kind: 'not', operand: deep };
    badExpressions.push(deep, { kind: 'and', operands: Array.from({ length: 1001 }, () => image) });
    for (const expression of badExpressions) {
      expect(
        await graph.dispatch(
          { ...graph.request, selection: { ...graph.request.selection, expression } },
          graph.context,
        ),
      ).toMatchObject({ kind: 'protocol-error', error: { code: 'invalid_selection' } });
    }
    expect(graph.execute).not.toHaveBeenCalled();
    expect(() =>
      createGraphReadDispatcher({
        execute: graph.execute,
        policies: [{ ...graph.bookPolicy, selectionRelations: ['missing'] }],
      }),
    ).toThrow('Unknown graph read Selection relation');
  });
});
