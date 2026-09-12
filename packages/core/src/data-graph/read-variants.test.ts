import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createGraphReadDispatcher,
  createGraphReadObserver,
  createInMemoryDataGraphRuntime,
  createEntityRef,
  entity,
  field,
  isGraphReadCapabilities,
  type GraphReadPolicy,
  type GraphReadRequest,
  type SelectionExpression,
} from './index.js';

const Node = entity('Node', {
  id: field.id(),
  type: field.enum(['part', 'chapter']),
  title: field.string(),
  owner: field.string(),
});
const Chapter = Node.variant('Chapter', { discriminator: { type: 'chapter' } });
const policy: GraphReadPolicy<typeof Node, string> = {
  entity: Node,
  variants: [Chapter],
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 25,
  fields: {
    id: { select: true, filter: ['eq'] },
    type: { select: true },
    title: { select: true, filter: ['eq'], order: true },
    owner: { select: true },
  },
  scope: ({ authority }) => ({
    kind: 'predicate',
    fieldName: 'owner',
    operator: 'eq',
    value: authority,
  }),
};
const request = (
  expression: SelectionExpression = { kind: 'all' },
  mode: GraphReadRequest['mode'] = 'run',
): GraphReadRequest => ({
  kind: 'graph-read',
  version: 1,
  mode,
  selection: { kind: 'selection', entityName: 'Chapter', expression },
  orderBy: [],
});
const setup = () => {
  const runtime = createInMemoryDataGraphRuntime({
    entities: [Node],
    dataset: {
      Node: [
        { id: 'part', type: 'part', title: 'Other', owner: 'alice' },
        { id: 'intro', type: 'chapter', title: 'Intro', owner: 'alice' },
        { id: 'end', type: 'chapter', title: 'Other', owner: 'alice' },
        { id: 'private', type: 'chapter', title: 'Private', owner: 'bob' },
      ],
    },
  });
  const execute = vi.fn((query, mode) =>
    Effect.runPromise(
      mode === 'count'
        ? runtime.count(query, undefined)
        : mode === 'get'
          ? runtime.get(query, undefined)
          : runtime.run(query, undefined),
    ),
  );
  return { execute, dispatch: createGraphReadDispatcher({ policies: [policy], execute }) };
};

describe('registered variant read roots', () => {
  it('discovers classified roots without executing data reads and returns defensive metadata', async () => {
    const { execute, dispatch } = setup();
    const input = { kind: 'graph-read-capabilities', version: 1, entityName: 'Node' };
    const result = await dispatch(input, { authority: 'alice' });
    expect(result).toEqual({
      kind: 'graph-read-capabilities-result',
      entityName: 'Node',
      capabilities: { orderBy: ['title'], variants: [Chapter.descriptor] },
    });
    if (result.kind !== 'graph-read-capabilities-result') throw new Error('Expected discovery');
    result.capabilities.variants![0]!.discriminator.value = 'part';
    expect(
      await dispatch({ ...input, entityName: 'Chapter' }, { authority: 'alice' }),
    ).toMatchObject({
      entityName: 'Chapter',
      capabilities: { variants: [Chapter.descriptor] },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('intersects caller NOT/OR with classification and authority outside the caller expression', async () => {
    const { dispatch, execute } = setup();
    const result = await dispatch(
      request({
        kind: 'not',
        operand: { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Intro' },
      }),
      { authority: 'alice' },
    );
    expect(result).toEqual({
      kind: 'graph-read-result',
      value: [{ id: 'end', type: 'chapter', title: 'Other', owner: 'alice' }],
    });
    expect(execute.mock.calls[0]![0].root).toBe(Node);
    expect(
      await dispatch(
        request({ kind: 'or', operands: [{ kind: 'all' }, { kind: 'none' }] }, 'count'),
        { authority: 'alice' },
      ),
    ).toEqual({ kind: 'graph-read-result', value: 2 });
    expect(
      await dispatch(request({ kind: 'not', operand: { kind: 'all' } }), { authority: 'alice' }),
    ).toEqual({ kind: 'graph-read-result', value: [] });
  });

  it('keeps canonical base refs and exact cardinality after classification', async () => {
    const { dispatch } = setup();
    const refs = (id: string): SelectionExpression => ({
      kind: 'references',
      refs: [createEntityRef(Node, { id })],
    });
    expect(await dispatch(request(refs('part'), 'get'), { authority: 'alice' })).toEqual({
      kind: 'graph-read-result',
      value: null,
    });
    expect(
      await dispatch(
        { ...request(refs('intro'), 'get'), cardinality: 'one' },
        { authority: 'alice' },
      ),
    ).toMatchObject({ kind: 'graph-read-result', value: { id: 'intro', type: 'chapter' } });
    expect(
      await dispatch({ ...request(undefined, 'get'), cardinality: 'one' }, { authority: 'alice' }),
    ).toMatchObject({ kind: 'protocol-error', error: { code: 'cardinality_mismatch' } });
  });

  it('does not grant filter/order permissions or trust caller classification metadata', async () => {
    const { dispatch, execute } = setup();
    expect(
      await dispatch(
        request({ kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'part' }),
        { authority: 'alice' },
      ),
    ).toMatchObject({ error: { code: 'access_denied' } });
    expect(
      await dispatch(
        { ...request(), orderBy: [{ fieldName: 'id', direction: 'asc' }] },
        { authority: 'alice' },
      ),
    ).toMatchObject({ error: { code: 'access_denied' } });
    expect(execute).not.toHaveBeenCalled();
    const forged = {
      ...request(undefined, 'count'),
      variant: { ...Chapter.descriptor, discriminator: { fieldName: 'type', value: 'part' } },
    };
    expect(await dispatch(forged, { authority: 'bob' })).toEqual({
      kind: 'graph-read-result',
      value: 1,
    });
    expect(
      await dispatch(
        { ...request(), selection: { ...request().selection, entityName: 'Unknown' } },
        { authority: 'alice' },
      ),
    ).toMatchObject({ error: { code: 'access_denied' } });
  });

  it('rejects ambiguous registrations, foreign bases and fabricated variants', () => {
    const bind = (policies: readonly GraphReadPolicy<any, string>[]) =>
      createGraphReadDispatcher({ policies, execute: vi.fn() });
    expect(() => bind([{ ...policy, variants: [Chapter, Chapter] }])).toThrow('Duplicate');
    expect(() =>
      bind([
        policy,
        {
          ...policy,
          entity: entity('Chapter', { id: field.id() }),
          variants: [],
          fields: {},
          scope: 'all',
        },
      ]),
    ).toThrow('Duplicate');
    expect(() =>
      bind([{ ...policy, entity: entity('Other', { id: field.id() }), fields: {}, scope: 'all' }]),
    ).toThrow('declared on policy');
    expect(() =>
      bind([
        {
          ...policy,
          variants: [
            { kind: 'entity-variant', name: 'Chapter', base: Node, descriptor: Chapter.descriptor },
          ],
        },
      ]),
    ).toThrow('declared on policy');
    expect(isGraphReadCapabilities({ orderBy: [], variants: [{ name: 'Chapter' }] })).toBe(false);
  });

  it('retains base limits, modes and cardinalities and rejects unsupported projections', async () => {
    const { dispatch, execute } = setup();
    const context = { authority: 'alice' };
    expect(await dispatch({ ...request(), limit: 0 }, context)).toEqual({
      kind: 'graph-read-result',
      value: [],
    });
    expect(await dispatch({ ...request(), limit: 26 }, context)).toMatchObject({
      error: { code: 'access_denied' },
    });
    expect(
      await dispatch(
        { ...request(), view: Node.view('Titles', { title: true }).toJSON() },
        context,
      ),
    ).toMatchObject({ error: { code: 'invalid_projection' } });
    const limited = createGraphReadDispatcher({
      policies: [{ ...policy, modes: ['run'], cardinalities: ['many'] }],
      execute,
    });
    expect(await limited(request(undefined, 'count'), context)).toMatchObject({
      error: { code: 'access_denied' },
    });
    expect(await limited({ ...request(), cardinality: 'one' }, context)).toMatchObject({
      error: { code: 'access_denied' },
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('applies the same classified query to observation', async () => {
    let observed: unknown;
    const observe = createGraphReadObserver({
      policies: [policy],
      observe: async function* (query) {
        observed = query;
        yield [];
      },
    });
    for await (const result of observe(request(), {
      authority: 'alice',
      signal: new AbortController().signal,
    }))
      expect(result).toEqual({ kind: 'graph-read-result', value: [] });
    expect(observed).toMatchObject({
      root: { name: 'Node' },
      selection: {
        kind: 'and',
        operands: expect.arrayContaining([
          { kind: 'predicate', fieldName: 'type', operator: 'eq', value: 'chapter' },
        ]),
      },
    });
  });

  it('advertises negotiated variant navigation on metadata and read results', async () => {
    const { execute } = setup();
    const dispatch = createGraphReadDispatcher({
      policies: [policy],
      execute,
      relationSelections: true,
    });
    const context = { authority: 'alice' };
    const metadata = { version: 1, kind: 'graph-read-capabilities', entityName: 'Node' };
    expect(await dispatch(metadata, context)).toMatchObject({
      capabilities: { relationSelections: { version: 2 } },
    });
    const variant = await dispatch({ ...metadata, entityName: 'Chapter' }, context);
    if (variant.kind !== 'graph-read-capabilities-result')
      throw new Error('Expected variant metadata');
    expect(variant.capabilities.relationSelections).toEqual({ version: 2, relations: [] });
    const result = await dispatch({ ...request(), includeCapabilities: true }, context);
    if (result.kind !== 'graph-read-result') throw new Error('Expected variant read');
    expect(result.capabilities?.relationSelections).toEqual({ version: 2, relations: [] });
    expect(result.capabilities?.variants).toEqual([Chapter.descriptor]);
  });
});
