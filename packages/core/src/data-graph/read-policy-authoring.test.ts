import { describe, expect, expectTypeOf, it } from 'vitest';

import { entity, field } from './definitions.js';
import type { GraphReadPolicy } from './read-dispatcher.js';
import { defineGraphReadPolicy } from './read-policy-authoring.js';
import { selectionAll } from './selection-ast.js';

const Experiment = entity('PolicyExperiment', {
  id: field.id(),
  title: field.string(),
  status: field.enum(['draft', 'published'] as const),
  createdAt: field.string(),
});

type Authority = { admin: boolean };

describe('Graph Read policy authoring', () => {
  it('lowers separate capability allowlists to a canonical Graph Read policy', () => {
    const policy = defineGraphReadPolicy<typeof Experiment, Authority>({
      entity: Experiment,
      modes: ['get', 'run', 'count'],
      cardinalities: ['one', 'many'],
      maxLimit: 100,
      allow: {
        select: ['id', 'title', 'status', 'createdAt'],
        filter: {
          id: ['eq', 'in'],
          status: ['eq', 'in'],
        },
        order: ['title', 'createdAt'],
      },
      scope: ({ authority }) => (authority.admin ? selectionAll() : { kind: 'none' }),
    });

    expectTypeOf(policy).toEqualTypeOf<GraphReadPolicy<typeof Experiment, Authority>>();
    expect(policy.fields).toEqual({
      id: { select: true, filter: ['eq', 'in'] },
      title: { select: true, order: true },
      status: { select: true, filter: ['eq', 'in'] },
      createdAt: { select: true, order: true },
    });
    expect(policy).not.toHaveProperty('allow');
  });

  it('rejects unknown Entity Fields at authoring time', () => {
    defineGraphReadPolicy({
      entity: Experiment,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 10,
      allow: {
        // @ts-expect-error Selection grants must name an Entity Field.
        select: ['missing'],
        filter: {
          // @ts-expect-error Filter grants must name an Entity Field.
          missing: ['eq'],
        },
        // @ts-expect-error Ordering grants must name an Entity Field.
        order: ['missing'],
      },
      scope: 'all',
    });
  });

  it('keeps an empty allowlist default-deny', () => {
    const policy = defineGraphReadPolicy({
      entity: Experiment,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 10,
      allow: {},
      scope: 'all',
    });

    expect(policy.fields).toEqual({});
  });
});
