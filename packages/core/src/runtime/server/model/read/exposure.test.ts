import { describe, expect, it } from 'vitest';

import {
  field,
  safeParseUnknownGraphSchema,
  toGraphJsonSchema,
  type GraphReadPolicy,
} from '../../../../data-graph/index.js';
import { entity } from '../../entity.js';

import { createModelGraphReadExposure } from './exposure.js';

const Document = entity({
  name: 'Document',
  fields: {
    id: field.id(),
    title: field.nonEmptyString({ trim: true }),
    published: field.boolean(),
  },
});

const policy = {
  entity: Document,
  modes: ['run', 'count'],
  cardinalities: ['many'],
  maxLimit: 50,
  fields: {
    id: { select: true },
    title: { select: true, filter: ['eq'], order: true },
    published: { select: true, filter: ['eq'] },
  },
  scope: 'all',
} as const satisfies GraphReadPolicy<typeof Document>;

describe('Model graph-read exposure', () => {
  it('reflects a bounded selection and ordering schema from the read policy', () => {
    const exposure = createModelGraphReadExposure(policy, {
      mode: 'run',
      equals: ['title', 'published'],
      orderBy: ['title'],
      limit: 20,
      description: 'List documents.',
    });
    const request = {
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: {
        kind: 'selection',
        entityName: 'Document',
        expression: {
          kind: 'and',
          operands: [
            { kind: 'predicate', fieldName: 'published', operator: 'eq', value: false },
            { kind: 'predicate', fieldName: 'title', operator: 'eq', value: '  Draft  ' },
          ],
        },
      },
      orderBy: [{ fieldName: 'title', direction: 'asc' }],
      limit: 20,
    };

    expect(safeParseUnknownGraphSchema(exposure.request, request)).toMatchObject({
      success: true,
      data: {
        selection: {
          expression: {
            operands: [{ value: false }, { value: 'Draft' }],
          },
        },
      },
    });
    expect(
      safeParseUnknownGraphSchema(exposure.request, {
        ...request,
        selection: {
          kind: 'selection',
          entityName: 'Document',
          expression: { kind: 'predicate', fieldName: 'published', operator: 'eq' },
        },
      }).success,
    ).toBe(false);
  });

  it('does not admit filters or ordering omitted from the exposure', () => {
    const exposure = createModelGraphReadExposure(policy, {
      mode: 'count',
      description: 'Count documents.',
    });
    const emptyOrderingRequest = {
      version: 1,
      kind: 'graph-read',
      mode: 'count',
      selection: { kind: 'selection', entityName: 'Document', expression: { kind: 'all' } },
      orderBy: [],
    };
    expect(safeParseUnknownGraphSchema(exposure.request, emptyOrderingRequest).success).toBe(true);
    expect(
      safeParseUnknownGraphSchema(exposure.request, {
        ...emptyOrderingRequest,
        orderBy: [{ fieldName: 'title', direction: 'asc' }],
      }).success,
    ).toBe(false);
    const jsonSchema = toGraphJsonSchema(exposure.request);
    expect(jsonSchema).toMatchObject({
      properties: { orderBy: { type: 'array', maxItems: 0 } },
    });
    expect(JSON.stringify(jsonSchema)).not.toContain('"anyOf":[]');

    expect(() =>
      createModelGraphReadExposure(policy, {
        mode: 'count',
        equals: ['id'],
        description: 'Count by id.',
      }),
    ).toThrow('cannot filter id by equality outside its read policy');
    expect(() =>
      createModelGraphReadExposure(policy, {
        mode: 'run',
        orderBy: ['published'],
        description: 'Order by publication.',
      }),
    ).toThrow('cannot order by published outside its read policy');
  });

  it('keeps Model limits within the runtime policy', () => {
    expect(() =>
      createModelGraphReadExposure(policy, {
        mode: 'run',
        limit: 51,
        description: 'List too many documents.',
      }),
    ).toThrow('limit must be between 1 and 50');
    expect(() =>
      createModelGraphReadExposure(policy, {
        mode: 'count',
        limit: 1,
        description: 'Count documents.',
      }),
    ).toThrow('count exposure cannot declare a limit');
  });
});
