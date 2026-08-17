import { describe, expect, it } from 'vitest';

import {
  compileResolvedQueryPlan,
  entity,
  field,
  getSelectColumnsForQuery,
  mapEntity,
  parseGraphReadRequest,
  query,
  resolveGraphReadRequest,
  toGraphReadRequest,
} from '../../src/data-graph/index.js';

const defineTripGraph = () => {
  const Truck = entity('Truck', {
    id: field.id(),
    brand: field.string(),
  });
  const Trip = entity('Trip', {
    id: field.id(),
    status: field.string(),
    truck: field.ref(Truck),
  });

  mapEntity(Trip).toTable('trips');
  mapEntity(Truck).toTable('trucks');

  return { Trip, Truck };
};

describe('data graph read protocol', () => {
  it('round-trips one shaped Query through a versioned JSON request', () => {
    const client = defineTripGraph();
    const server = defineTripGraph();
    const TripList = client.Trip.view('TripList', {
      id: true,
      truck: { brand: true },
    });
    const local = query(client.Trip)
      .where(trip => trip.status.eq('available'))
      .as(TripList)
      .orderBy(trip => trip.id.desc())
      .limit(25)
      .build();

    const transported = JSON.parse(JSON.stringify(toGraphReadRequest(local, 'run')));

    expect(transported).toEqual({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: 'status',
          value: 'available',
        },
      },
      view: TripList.toJSON(),
      orderBy: [{ fieldName: 'id', direction: 'desc' }],
      limit: 25,
    });

    const parsed = parseGraphReadRequest(transported);
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    const resolved = resolveGraphReadRequest(parsed.request, {
      entities: [server.Trip, server.Truck],
    });
    expect(resolved).toMatchObject({ success: true });
    if (!resolved.success) throw new Error(resolved.error.error.message);

    expect(resolved.query.root).toBe(server.Trip);
    expect(resolved.query.root).not.toBe(client.Trip);
    expect(compileResolvedQueryPlan(resolved.query)).toEqual(compileResolvedQueryPlan(local));
    expect(
      getSelectColumnsForQuery({
        entityDefinition: resolved.query.root,
        selectShape: resolved.query.select,
        includeShape: resolved.query.includes,
      }),
    ).toEqual(
      getSelectColumnsForQuery({
        entityDefinition: local.root,
        selectShape: local.select,
        includeShape: local.includes,
      }),
    );
  });

  it('rejects unsupported versions before interpreting the request', () => {
    expect(
      parseGraphReadRequest({
        version: 2,
        kind: 'graph-read',
        mode: 'run',
        selection: { kind: 'selection', entityName: 'Trip', expression: { kind: 'all' } },
        orderBy: [],
      }),
    ).toEqual({
      success: false,
      error: {
        kind: 'protocol-error',
        error: {
          code: 'unsupported_version',
          message: 'Unsupported data graph read protocol version: 2.',
        },
      },
    });
  });

  it.each([
    {
      name: 'unknown Entity',
      selection: { kind: 'selection', entityName: 'Missing', expression: { kind: 'all' } },
      code: 'unknown_entity',
    },
    {
      name: 'unknown field',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: 'missing',
          value: 'available',
        },
      },
      code: 'invalid_selection',
    },
    {
      name: 'unknown operator',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: {
          kind: 'predicate',
          operator: 'execute',
          fieldName: 'status',
          value: 'available',
        },
      },
      code: 'invalid_selection',
    },
  ])('rejects an $name against the server graph', ({ selection, code }) => {
    const { Trip, Truck } = defineTripGraph();
    const parsed = parseGraphReadRequest({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection,
      orderBy: [],
    });
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphReadRequest(parsed.request, { entities: [Trip, Truck] })).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code } },
    });
  });

  it('rejects a transported View that does not match the server graph', () => {
    const { Trip, Truck } = defineTripGraph();
    const view = structuredClone(Trip.view('TripList', { truck: { brand: true } }).toJSON());
    const truck = view.fields.truck;
    if (truck?.kind !== 'relation-view') throw new Error('Expected Trip.truck View relation.');
    truck.targetEntity = 'Missing';
    const parsed = parseGraphReadRequest({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: { kind: 'selection', entityName: 'Trip', expression: { kind: 'all' } },
      view,
      orderBy: [],
    });
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphReadRequest(parsed.request, { entities: [Trip, Truck] })).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code: 'invalid_projection' } },
    });
  });

  it('refuses predicate values that change meaning through JSON serialization', () => {
    const { Trip } = defineTripGraph();
    const local = query(Trip)
      .where(trip => trip.status.eq(new Date('2026-08-17T00:00:00.000Z') as never))
      .build();

    expect(() => toGraphReadRequest(local, 'run')).toThrow(
      'Data graph read predicate value must be JSON-safe.',
    );
  });

  it('does not silently transport a lower-level projection without a wire model', () => {
    const { Trip } = defineTripGraph();
    const selected = query(Trip)
      .select(trip => ({ id: trip.id }))
      .build();

    expect(() => toGraphReadRequest(selected, 'run')).toThrow(
      'Data graph read transport currently requires a View for projected Queries.',
    );
  });
});
