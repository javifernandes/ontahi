import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  entity,
  field,
  type EntityRef,
  type InferEntityViewResult,
} from '../../src/data-graph/index.js';

const defineTripGraph = () => {
  const Company = entity('Company', {
    id: field.id(),
    name: field.string(),
  });
  const Owner = entity('Owner', {
    id: field.id(),
    name: field.string(),
    company: field.ref(Company),
  });
  const Truck = entity('Truck', {
    id: field.id(),
    brand: field.string(),
    owner: field.nullable(field.ref(Owner)),
  });
  const Driver = entity('Driver', {
    id: field.id(),
    name: field.string(),
  });
  const Country = entity('Country', {
    id: field.id(),
    code: field.string(),
  });
  const Place = entity('Place', {
    id: field.id(),
    name: field.string(),
    country: field.ref(Country),
  });
  const Trip = entity('Trip', {
    id: field.id(),
    truck: field.ref(Truck),
    driver: field.nullable(field.ref(Driver)),
  });
  const Stop = entity('Stop', {
    id: field.id(),
    trip: field.ref(Trip),
    order: field.integer(),
    place: field.ref(Place),
  });
  const TripGraph = Trip.hasMany('stops', Stop, { via: 'trip' });

  return { Company, Trip: TripGraph };
};

describe('recursive entity views', () => {
  it('builds one finite JSON-safe AST with canonical relation metadata at every depth', () => {
    const { Company, Trip } = defineTripGraph();
    const CompanySummary = Company.view('CompanySummary', { id: true, name: true });
    const TripList = Trip.view('TripList', {
      id: true,
      driver: true,
      truck: {
        id: true,
        owner: {
          id: true,
          company: CompanySummary,
        },
      },
      stops: {
        order: true,
        place: {
          name: true,
          country: { code: true },
        },
      },
    });

    expect(JSON.parse(JSON.stringify(TripList))).toEqual({
      version: 1,
      kind: 'entity-view',
      name: 'TripList',
      entity: 'Trip',
      fields: {
        id: { kind: 'field-view', field: 'id' },
        driver: { kind: 'field-view', field: 'driver' },
        truck: {
          kind: 'relation-view',
          relation: 'Trip.truck',
          direction: 'forward',
          targetEntity: 'Truck',
          cardinality: 'one',
          nullable: false,
          view: {
            kind: 'view-node',
            entity: 'Truck',
            fields: {
              id: { kind: 'field-view', field: 'id' },
              owner: {
                kind: 'relation-view',
                relation: 'Truck.owner',
                direction: 'forward',
                targetEntity: 'Owner',
                cardinality: 'one',
                nullable: true,
                view: {
                  kind: 'view-node',
                  entity: 'Owner',
                  fields: {
                    id: { kind: 'field-view', field: 'id' },
                    company: {
                      kind: 'relation-view',
                      relation: 'Owner.company',
                      direction: 'forward',
                      targetEntity: 'Company',
                      cardinality: 'one',
                      nullable: false,
                      view: {
                        kind: 'view-node',
                        entity: 'Company',
                        fields: {
                          id: { kind: 'field-view', field: 'id' },
                          name: { kind: 'field-view', field: 'name' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        stops: {
          kind: 'relation-view',
          relation: 'Trip.stops',
          direction: 'inverse',
          targetEntity: 'Stop',
          cardinality: 'many',
          nullable: false,
          view: {
            kind: 'view-node',
            entity: 'Stop',
            fields: {
              order: { kind: 'field-view', field: 'order' },
              place: {
                kind: 'relation-view',
                relation: 'Stop.place',
                direction: 'forward',
                targetEntity: 'Place',
                cardinality: 'one',
                nullable: false,
                view: {
                  kind: 'view-node',
                  entity: 'Place',
                  fields: {
                    name: { kind: 'field-view', field: 'name' },
                    country: {
                      kind: 'relation-view',
                      relation: 'Place.country',
                      direction: 'forward',
                      targetEntity: 'Country',
                      cardinality: 'one',
                      nullable: false,
                      view: {
                        kind: 'view-node',
                        entity: 'Country',
                        fields: {
                          code: { kind: 'field-view', field: 'code' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('infers leaf refs separately from explicitly traversed relations', () => {
    const { Trip } = defineTripGraph();
    const TripRefs = Trip.view('TripRefs', { id: true, driver: true });
    const TripDriver = Trip.view('TripDriver', {
      id: true,
      driver: { name: true },
      truck: { owner: { name: true } },
      stops: { order: true },
    });

    expectTypeOf<InferEntityViewResult<typeof TripRefs>>().toEqualTypeOf<{
      id: string;
      driver: EntityRef<'Driver'> | null;
    }>();
    expectTypeOf<InferEntityViewResult<typeof TripDriver>>().toEqualTypeOf<{
      id: string;
      driver: { name: string } | null;
      truck: { owner: { name: string } | null };
      stops: { order: number }[];
    }>();
  });

  it('does not hydrate a cyclic graph beyond the explicitly authored finite shape', () => {
    const { Trip } = defineTripGraph();
    const Stops = Trip.view('Stops', {
      stops: {
        trip: true,
      },
    });

    expect(JSON.parse(JSON.stringify(Stops)).fields.stops.view.fields.trip).toEqual({
      kind: 'field-view',
      field: 'trip',
    });
  });
});
