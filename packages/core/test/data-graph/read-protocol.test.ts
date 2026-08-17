import { describe, expect, it } from 'vitest';

import {
  compileResolvedQueryPlan,
  entity,
  field,
  getSelectColumnsForQuery,
  isGraphReadProtocolError,
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

const validReadRequest = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'Trip',
    expression: { kind: 'all' },
  },
  orderBy: [],
  ...overrides,
});

describe('data graph read protocol', () => {
  it('recognizes only declared structured protocol errors', () => {
    expect(
      isGraphReadProtocolError({
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Data graph read access denied.' },
      }),
    ).toBe(true);
    expect(
      isGraphReadProtocolError({
        kind: 'protocol-error',
        error: { code: 'unknown_code', message: 'Unknown code.' },
      }),
    ).toBe(false);
    expect(isGraphReadProtocolError({ kind: 'graph-read-result', value: [] })).toBe(false);
  });

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
      name: 'non-object request',
      request: null,
      code: 'invalid_request',
    },
    {
      name: 'unknown request kind',
      request: validReadRequest({ kind: 'graph-command' }),
      code: 'invalid_request',
    },
    {
      name: 'unknown read mode',
      request: validReadRequest({ mode: 'stream' }),
      code: 'invalid_request',
    },
    {
      name: 'missing Selection',
      request: validReadRequest({ selection: undefined }),
      code: 'invalid_request',
    },
    {
      name: 'non-array ordering',
      request: validReadRequest({ orderBy: {} }),
      code: 'invalid_request',
    },
    {
      name: 'malformed ordering',
      request: validReadRequest({ orderBy: [{ fieldName: 'id', direction: 'sideways' }] }),
      code: 'invalid_request',
    },
    {
      name: 'negative limit',
      request: validReadRequest({ limit: -1 }),
      code: 'invalid_request',
    },
    {
      name: 'fractional limit',
      request: validReadRequest({ limit: 1.5 }),
      code: 'invalid_request',
    },
    {
      name: 'unknown cardinality',
      request: validReadRequest({ cardinality: 'some' }),
      code: 'invalid_request',
    },
    {
      name: 'non-object View',
      request: validReadRequest({ view: 'TripList' }),
      code: 'invalid_request',
    },
    {
      name: 'non-JSON value',
      request: validReadRequest({ metadata: new Date(0) }),
      code: 'invalid_request',
    },
  ])('rejects a $name at the protocol boundary', ({ request, code }) => {
    expect(parseGraphReadRequest(request)).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code } },
    });
  });

  it('preserves optional cardinality and a recursive View while dropping unknown envelope keys', () => {
    const { Trip } = defineTripGraph();
    const view = Trip.view('TripList', { id: true }).toJSON();

    expect(
      parseGraphReadRequest(validReadRequest({ cardinality: 'one', view, ignored: 'value' })),
    ).toEqual({
      success: true,
      request: {
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        selection: {
          kind: 'selection',
          entityName: 'Trip',
          expression: { kind: 'all' },
        },
        view,
        orderBy: [],
        cardinality: 'one',
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
    {
      name: 'unknown reference locator field',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: {
          kind: 'references',
          refs: [
            {
              kind: 'entity-ref',
              entityName: 'Trip',
              locator: { missing: 'trip-1' },
            },
          ],
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

  it.each([
    {
      name: 'malformed root Selection AST',
      selection: { kind: 'invalid', entityName: 'Trip', expression: { kind: 'all' } },
    },
    {
      name: 'malformed references',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'references', refs: [{}] },
      },
    },
    {
      name: 'references for another Entity',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'Truck', locator: { id: 'truck-1' } }],
        },
      },
    },
    {
      name: 'malformed boolean operands',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'and', operands: 'all' },
      },
    },
    {
      name: 'excessive boolean operands',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'or', operands: Array.from({ length: 257 }, () => ({ kind: 'all' })) },
      },
    },
    {
      name: 'invalid nested operand',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'and', operands: [{ kind: 'mystery' }] },
      },
    },
    {
      name: 'invalid negated operand',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'not', operand: { kind: 'mystery' } },
      },
    },
    {
      name: 'non-array in values',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'predicate', operator: 'in', fieldName: 'id', values: 'trip-1' },
      },
    },
    {
      name: 'missing predicate value',
      selection: {
        kind: 'selection',
        entityName: 'Trip',
        expression: { kind: 'predicate', operator: 'eq', fieldName: 'id' },
      },
    },
  ])('rejects $name during semantic resolution', ({ selection }) => {
    const { Trip, Truck } = defineTripGraph();
    const parsed = parseGraphReadRequest(validReadRequest({ selection }));
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphReadRequest(parsed.request, { entities: [Trip, Truck] })).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code: 'invalid_selection' } },
    });
  });

  it('resolves a valid recursive boolean Selection without a projection', () => {
    const { Trip, Truck } = defineTripGraph();
    const selection = {
      kind: 'selection',
      entityName: 'Trip',
      expression: {
        kind: 'and',
        operands: [
          { kind: 'predicate', operator: 'in', fieldName: 'id', values: ['trip-1'] },
          {
            kind: 'not',
            operand: { kind: 'predicate', operator: 'isNull', fieldName: 'status' },
          },
        ],
      },
    };
    const parsed = parseGraphReadRequest(validReadRequest({ selection }));
    if (!parsed.success) throw new Error(parsed.error.error.message);

    const resolved = resolveGraphReadRequest(parsed.request, { entities: [Trip, Truck] });
    expect(resolved).toMatchObject({ success: true });
    if (!resolved.success) throw new Error(resolved.error.error.message);
    expect(resolved.query.root).toBe(Trip);
    expect(resolved.query.view).toBeUndefined();
  });

  it('rejects a Selection deeper than the protocol limit', () => {
    const { Trip } = defineTripGraph();
    const expression = Array.from({ length: 34 }).reduce<Record<string, unknown>>(
      operand => ({ kind: 'not', operand }),
      { kind: 'all' },
    );
    const parsed = parseGraphReadRequest(
      validReadRequest({
        selection: { kind: 'selection', entityName: 'Trip', expression },
      }),
    );
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphReadRequest(parsed.request, { entities: [Trip] })).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code: 'invalid_selection' } },
    });
  });

  it('rejects ordering by an unknown server field', () => {
    const { Trip } = defineTripGraph();
    const parsed = parseGraphReadRequest(
      validReadRequest({ orderBy: [{ fieldName: 'missing', direction: 'asc' }] }),
    );
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphReadRequest(parsed.request, { entities: [Trip] })).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code: 'invalid_selection' } },
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

  it('walks boolean and negated Selections before transporting them', () => {
    const { Trip } = defineTripGraph();
    const invalid = query(Trip)
      .where(trip => ({
        kind: 'and',
        operands: [
          {
            kind: 'or',
            operands: [trip.id.eq('trip-1'), trip.id.eq('trip-2')],
          },
          {
            kind: 'not',
            operand: trip.status.eq(new Date(0) as never),
          },
        ],
      }))
      .build();

    expect(() => toGraphReadRequest(invalid, 'run')).toThrow(
      'Data graph read predicate value must be JSON-safe.',
    );
  });

  it('refuses references that are not JSON-safe', () => {
    const { Trip } = defineTripGraph();
    const spec = {
      ...query(Trip).build(),
      selection: {
        kind: 'references' as const,
        refs: [
          {
            kind: 'entity-ref' as const,
            entityName: 'Trip',
            locator: { id: new Date(0) },
          },
        ],
      },
    };

    expect(() => toGraphReadRequest(spec as never, 'run')).toThrow(
      'Data graph read reference must be JSON-safe.',
    );
  });

  it('refuses a request envelope containing a non-JSON-safe ordering value', () => {
    const { Trip } = defineTripGraph();
    const spec = {
      ...query(Trip).build(),
      orderBy: [{ kind: 'order', fieldName: undefined, direction: 'asc' }],
    };

    expect(() => toGraphReadRequest(spec as never, 'run')).toThrow(
      'Data graph read request must be JSON-safe.',
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
