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
