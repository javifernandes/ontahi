import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  query,
  toGraphCommandRequest,
  toGraphReadRequest,
} from '../../data-graph/index.js';

import {
  createRuntimeProtocolRegistry,
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  graphCommandRuntimeProtocolFamily,
  graphReadRuntimeProtocolFamily,
} from './index.js';

const Book = entity('Book', {
  id: field.id(),
  title: field.string(),
  published: field.boolean(),
});

const registry = createRuntimeProtocolRegistry([
  graphReadRuntimeProtocolFamily,
  graphCommandRuntimeProtocolFamily,
] as const);

describe('Runtime Protocol Data Graph families', () => {
  it('wraps and canonically parses the existing Graph Read request', () => {
    const body = toGraphReadRequest(
      query(Book).where(book => book.published.eq(true)),
      'run',
    );
    const request = createRuntimeProtocolRequest({
      id: 'request-read',
      family: 'graph.read',
      body,
    });

    expect(registry.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
  });

  it('preserves Graph Command body version 2 inside envelope version 1', () => {
    const command = mutateEntity(Book).update(
      createEntityRef(Book, { id: 'book-1' }),
      { title: 'Published' },
      { if: { title: 'Draft' } },
    );
    const body = toGraphCommandRequest(command);
    const request = createRuntimeProtocolRequest({
      id: 'request-command',
      family: 'graph.command',
      body,
    });

    expect(request.version).toBe(1);
    expect(request.body.version).toBe(2);
    expect(registry.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
  });

  it.each([
    {
      family: 'graph.read',
      body: { version: 2, kind: 'graph-read' },
      familyCode: 'unsupported_version',
    },
    {
      family: 'graph.command',
      body: { version: 3, kind: 'graph-command', command: {} },
      familyCode: 'unsupported_version',
    },
  ] as const)('fails closed for an unsupported $family body version', input => {
    const result = registry.parseRequest(
      createRuntimeProtocolRequest({
        id: `request-${input.family}`,
        family: input.family,
        body: input.body,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: {
        error: {
          code: 'invalid_family_request',
          details: { familyError: { error: { code: input.familyCode } } },
        },
      },
    });
  });

  it('wraps a family response without flattening a Graph Command rejection', () => {
    const request = createRuntimeProtocolRequest({
      id: 'request-command',
      family: 'graph.command',
      body: toGraphCommandRequest(
        mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' })),
      ),
    });
    const rejection = {
      kind: 'graph-command-rejection',
      diagnostic: {
        reason: 'entity_mutation_cardinality_mismatch',
        rejection: {
          version: 1,
          code: 'entity_mutation_cardinality_mismatch',
          message: 'Entity mutation target did not resolve exactly once.',
          parameters: { entityName: 'Book', action: 'delete' },
        },
      },
    } as const;

    expect(createRuntimeProtocolResponse(request, rejection)).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'request-command',
      kind: 'response',
      family: 'graph.command',
      body: rejection,
    });
  });
});
