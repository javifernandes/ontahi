import { describe, expect, it } from 'vitest';

import { entity, field, query, toGraphReadRequest } from '../data-graph/index.js';

import {
  graphReadApplicationHoles,
  lowerGraphReadApplication,
  openGraphReadApplication,
  substituteGraphReadApplication,
} from './graph-read-application.js';

const Document = entity('SemanticGraphReadDocument', {
  id: field.id(),
  ownerId: field.nonEmptyString({ trim: true }),
  published: field.boolean(),
});
const request = toGraphReadRequest(
  query(Document)
    .where(document => document.ownerId.eq('placeholder'))
    .where(document => document.published.eq(false))
    .limit(20),
  'run',
);

describe('Graph Read application', () => {
  it('opens a canonical request with a named predicate Hole', () => {
    const application = openGraphReadApplication(request, [Document], { ownerId: 'owner' });

    expect(application).toEqual({
      kind: 'graph-read-application',
      request: {
        ...request,
        selection: {
          ...request.selection,
          expression: {
            kind: 'and',
            operands: [
              {
                kind: 'predicate',
                operator: 'eq',
                fieldName: 'ownerId',
                value: { kind: 'hole', id: 'owner' },
              },
              {
                kind: 'predicate',
                operator: 'eq',
                fieldName: 'published',
                value: false,
              },
            ],
          },
        },
      },
    });
    expect(graphReadApplicationHoles(application)).toEqual(['owner']);
  });

  it('cannot lower while open and lowers closed terms to the unchanged protocol', () => {
    const open = openGraphReadApplication(request, [Document], { ownerId: 'owner' });
    expect(lowerGraphReadApplication(open, [Document])).toEqual({
      success: false,
      reason: 'open-application',
      holes: ['owner'],
    });

    const substitution = substituteGraphReadApplication(open, [Document], 'owner', 'reader-1');
    expect(substitution.success).toBe(true);
    if (!substitution.success) return;
    expect(lowerGraphReadApplication(substitution.application, [Document])).toEqual({
      success: true,
      request: {
        ...request,
        selection: {
          ...request.selection,
          expression: {
            kind: 'and',
            operands: [
              {
                kind: 'predicate',
                operator: 'eq',
                fieldName: 'ownerId',
                value: 'reader-1',
              },
              {
                kind: 'predicate',
                operator: 'eq',
                fieldName: 'published',
                value: false,
              },
            ],
          },
        },
      },
    });
  });

  it('validates substitution against every Selection position sharing the Hole', () => {
    const repeatedRequest = toGraphReadRequest(
      query(Document)
        .where(document => document.ownerId.eq('placeholder'))
        .where(document => document.id.eq('placeholder')),
      'run',
    );
    const open = openGraphReadApplication(repeatedRequest, [Document], {
      ownerId: 'identity',
      id: 'identity',
    });

    expect(graphReadApplicationHoles(open)).toEqual(['identity']);
    expect(substituteGraphReadApplication(open, [Document], 'identity', '')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ path: ['ownerId'] }, { path: ['id'] }],
    });
    expect(substituteGraphReadApplication(open, [Document], 'missing', 'reader-1')).toEqual({
      success: false,
      reason: 'unknown-hole',
      holeId: 'missing',
    });
  });

  it('preserves nested boolean Selection structure during substitution', () => {
    const nested = {
      ...request,
      selection: {
        ...request.selection,
        expression: {
          kind: 'not' as const,
          operand: {
            kind: 'or' as const,
            operands: [
              {
                kind: 'predicate' as const,
                operator: 'eq' as const,
                fieldName: 'ownerId',
                value: 'x',
              },
              { kind: 'all' as const },
            ],
          },
        },
      },
    };
    const open = openGraphReadApplication(nested, [Document], { ownerId: 'owner' });
    const substitution = substituteGraphReadApplication(open, [Document], 'owner', 'reader-1');

    expect(substitution).toMatchObject({
      success: true,
      application: {
        request: {
          selection: {
            expression: {
              kind: 'not',
              operand: {
                kind: 'or',
                operands: [{ value: 'reader-1' }, { kind: 'all' }],
              },
            },
          },
        },
      },
    });
  });

  it('rejects missing predicate targets and invalid closed requests', () => {
    expect(() => openGraphReadApplication(request, [Document], { title: 'title' })).toThrow(
      'Graph Read application has no value predicate for title.',
    );
    expect(() => openGraphReadApplication(request, [], { ownerId: 'owner' })).toThrow(
      'Unknown data graph Entity',
    );

    const invalid = openGraphReadApplication(request, [Document], { ownerId: 'owner' });
    const closed = substituteGraphReadApplication(invalid, [Document], 'owner', 'reader-1');
    expect(closed.success).toBe(true);
    if (!closed.success) return;
    expect(
      lowerGraphReadApplication(
        {
          ...closed.application,
          request: { ...closed.application.request, limit: -1 },
        },
        [Document],
      ),
    ).toMatchObject({
      success: false,
      reason: 'invalid-request',
      error: { error: { code: 'invalid_request' } },
    });
  });
});
