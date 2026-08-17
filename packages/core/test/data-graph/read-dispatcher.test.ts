import { describe, expect, it, vi } from 'vitest';

import {
  createGraphReadDispatcher,
  createEntityRef,
  entity,
  field,
  query,
  selection,
  Selection,
  toGraphReadRequest,
  type GraphReadPolicy,
} from '../../src/data-graph/index.js';

const defineTripGraph = () => {
  const Truck = entity('Truck', {
    id: field.id(),
    brand: field.string(),
    registration: field.string(),
  });
  const Trip = entity('Trip', {
    id: field.id(),
    status: field.string(),
    ownerId: field.string(),
    internalNotes: field.string(),
    truck: field.ref(Truck),
  });

  return { Trip, Truck };
};

type Authority = { ownerId: string };

const createTripPolicy = (
  server: ReturnType<typeof defineTripGraph>,
): GraphReadPolicy<typeof server.Trip, Authority> => ({
  entity: server.Trip,
  modes: ['run', 'count'],
  cardinalities: ['many'],
  maxLimit: 50,
  fields: {
    id: { select: true, filter: ['eq', 'in'], order: true },
    status: { select: true, filter: ['eq'] },
    ownerId: { filter: ['eq'] },
    truck: { select: true },
  },
  relations: {
    truck: {
      fields: {
        id: { select: true },
        brand: { select: true },
      },
    },
  },
  scope: ({ authority, entity: Trip }) =>
    selection(Trip, trip => trip.ownerId.eq(authority.ownerId)),
});

describe('graph read dispatcher', () => {
  it.each([
    {
      name: 'non-positive maxLimit',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({ ...policy, maxLimit: 0 }),
      message: 'Graph read policy Trip requires a positive maxLimit.',
    },
    {
      name: 'empty modes',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({ ...policy, modes: [] }),
      message: 'Graph read policy Trip requires valid read modes.',
    },
    {
      name: 'unknown mode',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({
        ...policy,
        modes: ['stream'] as never,
      }),
      message: 'Graph read policy Trip requires valid read modes.',
    },
    {
      name: 'empty cardinalities',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({ ...policy, cardinalities: [] }),
      message: 'Graph read policy Trip requires valid cardinalities.',
    },
    {
      name: 'unknown cardinality',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({
        ...policy,
        cardinalities: ['some'] as never,
      }),
      message: 'Graph read policy Trip requires valid cardinalities.',
    },
    {
      name: 'unknown field',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({
        ...policy,
        fields: { ...policy.fields, missing: { select: true as const } },
      }),
      message: 'Unknown graph read policy field Trip.missing.',
    },
    {
      name: 'unknown operator',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({
        ...policy,
        fields: { ...policy.fields, status: { filter: ['execute'] as never } },
      }),
      message: 'Unknown graph read policy operator Trip.status.execute.',
    },
    {
      name: 'unknown relation',
      alter: (policy: GraphReadPolicy<any, Authority>) => ({
        ...policy,
        relations: { ...policy.relations, missing: { fields: {} } },
      }),
      message: 'Unknown graph read policy relation Trip.missing.',
    },
  ])('rejects a policy with $name when installing the boundary', ({ alter, message }) => {
    const server = defineTripGraph();

    expect(() =>
      createGraphReadDispatcher<Authority>({
        policies: [alter(createTripPolicy(server))],
        execute: vi.fn(),
      }),
    ).toThrow(message);
  });

  it('rejects duplicate Entity policies when installing the boundary', () => {
    const server = defineTripGraph();
    const policy = createTripPolicy(server);

    expect(() =>
      createGraphReadDispatcher({
        policies: [policy, policy],
        execute: vi.fn(),
      }),
    ).toThrow('Duplicate graph read policy for Entity Trip.');
  });

  it('ignores undefined entries produced while composing optional policy maps', () => {
    const server = defineTripGraph();
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      fields: { id: undefined } as never,
      relations: { truck: undefined } as never,
      modes: ['count'],
      scope: 'all',
    };

    expect(
      createGraphReadDispatcher({
        policies: [policy],
        execute: vi.fn(),
      }),
    ).toEqual(expect.any(Function));
  });

  it('denies an Entity that exists in the domain graph but has no remote policy', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher<Authority>({
      policies: [],
      execute,
    });

    await expect(
      dispatch(toGraphReadRequest(query(client.Trip).limit(10), 'run'), {
        authority: { ownerId: 'owner-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(server.Trip.name).toBe('Trip');
    expect(execute).not.toHaveBeenCalled();
  });

  it('intersects the caller Selection with a server-derived owner scope', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const TripList = client.Trip.view('TripList', { id: true, status: true });
    const execute = vi.fn(async () => [{ id: 'trip-1', status: 'available' }]);
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });
    const request = toGraphReadRequest(
      query(client.Trip)
        .where(trip => trip.status.eq('available'))
        .as(TripList),
      'run',
    );

    await expect(dispatch(request, { authority: { ownerId: 'owner-1' } })).resolves.toEqual({
      kind: 'graph-read-result',
      value: [{ id: 'trip-1', status: 'available' }],
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        root: server.Trip,
        selection: {
          kind: 'and',
          operands: [
            {
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'status',
              value: 'available',
            },
            {
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'ownerId',
              value: 'owner-1',
            },
          ],
        },
        limit: 50,
      }),
      'run',
    );
  });

  it('permits an explicitly exposed relation View', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const TripWithTruck = client.Trip.view('TripWithTruck', {
      id: true,
      truck: { brand: true },
    });
    const execute = vi.fn(async () => []);
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });

    await expect(
      dispatch(toGraphReadRequest(query(client.Trip).as(TripWithTruck).limit(10), 'run'), {
        authority: { ownerId: 'owner-1' },
      }),
    ).resolves.toMatchObject({ kind: 'graph-read-result' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'references',
      expression: {
        kind: 'references',
        refs: [{ kind: 'entity-ref', entityName: 'Trip', locator: { id: 'trip-1' } }],
      },
    },
    {
      name: 'and',
      expression: {
        kind: 'and',
        operands: [
          { kind: 'predicate', operator: 'eq', fieldName: 'id', value: 'trip-1' },
          { kind: 'predicate', operator: 'eq', fieldName: 'status', value: 'available' },
        ],
      },
    },
    {
      name: 'or',
      expression: {
        kind: 'or',
        operands: [
          { kind: 'predicate', operator: 'eq', fieldName: 'id', value: 'trip-1' },
          { kind: 'predicate', operator: 'eq', fieldName: 'id', value: 'trip-2' },
        ],
      },
    },
    {
      name: 'not',
      expression: {
        kind: 'not',
        operand: { kind: 'predicate', operator: 'eq', fieldName: 'status', value: 'cancelled' },
      },
    },
  ])('permits an exposed $name Selection', async ({ expression }) => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn(async () => []);
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });
    const base = toGraphReadRequest(
      query(client.Trip)
        .as(client.Trip.view('TripList', { id: true }))
        .orderBy(trip => trip.id)
        .limit(10),
      'run',
    );

    await expect(
      dispatch(
        { ...base, selection: { ...base.selection, expression } },
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toMatchObject({ kind: 'graph-read-result' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('denies a reference locator that is not filterable by policy', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });
    const base = toGraphReadRequest(
      query(client.Trip)
        .as(client.Trip.view('TripList', { id: true }))
        .limit(10),
      'run',
    );

    await expect(
      dispatch(
        {
          ...base,
          selection: {
            ...base.selection,
            expression: {
              kind: 'references',
              refs: [
                {
                  kind: 'entity-ref',
                  entityName: 'Trip',
                  locator: { internalNotes: 'private' },
                },
              ],
            },
          },
        },
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('denies relation traversal when the relation has no policy node', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn();
    const policy = { ...createTripPolicy(server), relations: {} };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute });

    await expect(
      dispatch(
        toGraphReadRequest(
          query(client.Trip)
            .as(client.Trip.view('TripWithTruck', { truck: { brand: true } }))
            .limit(10),
          'run',
        ),
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('permits an unprojected read only when every Entity field is explicitly selectable', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn(async () => []);
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      fields: Object.fromEntries(
        Object.keys(server.Trip.fields).map(fieldName => [fieldName, { select: true }]),
      ) as never,
      scope: 'all',
    };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute });

    await expect(
      dispatch(toGraphReadRequest(query(client.Trip).limit(10), 'run'), {
        authority: { ownerId: 'unused' },
      }),
    ).resolves.toMatchObject({ kind: 'graph-read-result' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('permits count without requiring a projection and does not apply a row limit', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn(async () => 12);
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      modes: ['count'],
      scope: 'all',
    };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute });

    await expect(
      dispatch(toGraphReadRequest(query(client.Trip), 'count'), {
        authority: { ownerId: 'unused' },
      }),
    ).resolves.toEqual({ kind: 'graph-read-result', value: 12 });
    expect(execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ limit: expect.anything() }),
      'count',
    );
  });

  it('uses one as the implicit get cardinality', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn(async () => ({ id: 'trip-1' }));
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      modes: ['get'],
      cardinalities: ['one'],
      fields: Object.fromEntries(
        Object.keys(server.Trip.fields).map(fieldName => [fieldName, { select: true }]),
      ) as never,
      scope: 'all',
    };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute });

    await expect(
      dispatch(toGraphReadRequest(query(client.Trip).limit(1), 'get'), {
        authority: { ownerId: 'unused' },
      }),
    ).resolves.toMatchObject({ kind: 'graph-read-result' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'selected field',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .as(graph.Trip.view('InternalTrip', { internalNotes: true }))
          .limit(10),
    },
    {
      name: 'filter operator',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .where(trip => trip.status.in(['available']))
          .as(graph.Trip.view('TripList', { id: true }))
          .limit(10),
    },
    {
      name: 'ordering field',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .as(graph.Trip.view('TripList', { id: true }))
          .orderBy(trip => trip.status)
          .limit(10),
    },
    {
      name: 'relation field',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .as(graph.Trip.view('TripWithRegistration', { truck: { registration: true } }))
          .limit(10),
    },
    {
      name: 'cardinality',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .where(
            Selection.references(
              graph.Trip,
              [createEntityRef(graph.Trip, { id: 'trip-1' })],
              'one',
            ),
          )
          .as(graph.Trip.view('TripList', { id: true }))
          .limit(10),
    },
    {
      name: 'limit',
      build: (graph: ReturnType<typeof defineTripGraph>) =>
        query(graph.Trip)
          .as(graph.Trip.view('TripList', { id: true }))
          .limit(51),
    },
  ])('denies a non-exposed $name before execution', async ({ build }) => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });

    await expect(
      dispatch(toGraphReadRequest(build(client), 'run'), {
        authority: { ownerId: 'owner-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not expose executor failures', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const reportError = vi.fn();
    const failure = new Error('postgres password leaked');
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute: vi.fn(async () => {
        throw failure;
      }),
      reportError,
    });

    await expect(
      dispatch(
        toGraphReadRequest(
          query(client.Trip)
            .as(client.Trip.view('TripList', { id: true }))
            .limit(10),
          'run',
        ),
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toEqual({
      kind: 'protocol-error',
      error: {
        code: 'execution_unavailable',
        message: 'Data graph read execution is temporarily unavailable.',
      },
    });
    expect(reportError).toHaveBeenCalledWith(failure);
  });

  it('accepts a raw server-owned scope expression', async () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn(async () => []);
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      scope: ({ authority }) => ({
        kind: 'predicate',
        operator: 'eq',
        fieldName: 'ownerId',
        value: authority.ownerId,
      }),
    };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute });

    await dispatch(
      toGraphReadRequest(
        query(client.Trip)
          .as(client.Trip.view('TripList', { id: true }))
          .limit(10),
        'run',
      ),
      { authority: { ownerId: 'owner-1' } },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({ fieldName: 'ownerId', value: 'owner-1' }),
      }),
      'run',
    );
  });

  it.each([
    {
      name: 'Selection for another Entity',
      scope: (server: ReturnType<typeof defineTripGraph>) => () =>
        selection(server.Truck, truck => truck.id.eq('truck-1')) as never,
    },
    {
      name: 'invalid raw Selection',
      scope: () => () => ({
        kind: 'predicate' as const,
        operator: 'eq' as const,
        fieldName: 'missing',
        value: 'owner-1',
      }),
    },
  ])('rejects an authority scope containing a $name', async ({ scope }) => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const execute = vi.fn();
    const reportError = vi.fn();
    const policy: GraphReadPolicy<typeof server.Trip, Authority> = {
      ...createTripPolicy(server),
      scope: scope(server),
    };
    const dispatch = createGraphReadDispatcher({ policies: [policy], execute, reportError });

    await expect(
      dispatch(
        toGraphReadRequest(
          query(client.Trip)
            .as(client.Trip.view('TripList', { id: true }))
            .limit(10),
          'run',
        ),
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'execution_unavailable' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('returns parser and semantic-resolution errors without executing', async () => {
    const server = defineTripGraph();
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [createTripPolicy(server)],
      execute,
    });

    await expect(dispatch(null, { authority: { ownerId: 'owner-1' } })).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_request' },
    });
    await expect(
      dispatch(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Trip',
            expression: {
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'missing',
              value: 'value',
            },
          },
          orderBy: [],
        },
        { authority: { ownerId: 'owner-1' } },
      ),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_selection' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a policy that accidentally omits its row scope', () => {
    const server = defineTripGraph();
    const policy = { ...createTripPolicy(server), scope: undefined };

    expect(() =>
      createGraphReadDispatcher({
        policies: [policy as unknown as GraphReadPolicy<typeof server.Trip, Authority>],
        execute: vi.fn(),
      }),
    ).toThrow('Graph read policy Trip requires an authority scope or explicit "all" scope.');
  });
});
