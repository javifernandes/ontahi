import { describe, expect, it } from 'vitest';

import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  parseRuntimeProtocolRequestEnvelope,
  parseRuntimeProtocolResponse,
  runtimeProtocolError,
  isRuntimeProtocolFamilyName,
} from './envelope.js';

describe('Runtime Protocol envelope', () => {
  const graphReadBody = {
    version: 1,
    kind: 'graph-read',
    mode: 'run',
    selection: { kind: 'all', entityName: 'Book' },
    orderBy: [],
  } as const;

  it.each(['operation', 'graph.read', 'graph.command'])('accepts the family name %s', family => {
    expect(isRuntimeProtocolFamilyName(family)).toBe(true);
  });

  it('preserves independent envelope and family-body versions through JSON', () => {
    const request = createRuntimeProtocolRequest({
      id: 'request-123',
      family: 'graph.read',
      body: graphReadBody,
    });

    expect(request).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'request-123',
      kind: 'request',
      family: 'graph.read',
      body: graphReadBody,
    });
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });

  it.each([
    {
      name: 'unknown envelope version',
      mutate: (request: Record<string, unknown>) => {
        request.version = 2;
      },
      code: 'unsupported_version',
    },
    {
      name: 'unknown strict key',
      mutate: (request: Record<string, unknown>) => {
        request.requires = ['stronger-semantics'];
      },
      code: 'invalid_envelope',
    },
    {
      name: 'empty correlation id',
      mutate: (request: Record<string, unknown>) => {
        request.id = '';
      },
      code: 'invalid_envelope',
    },
    {
      name: 'non-JSON body',
      mutate: (request: Record<string, unknown>) => {
        request.body = { execute: () => undefined };
      },
      code: 'invalid_envelope',
    },
  ])('rejects an $name before family handling', ({ mutate, code }) => {
    const candidate = {
      ...createRuntimeProtocolRequest({
        id: 'request-123',
        family: 'graph.read',
        body: graphReadBody,
      }),
    };
    mutate(candidate);

    expect(parseRuntimeProtocolRequestEnvelope(candidate)).toMatchObject({
      success: false,
      error: { kind: 'protocol-error', error: { code } },
    });
  });

  it('correlates a JSON-safe response without reinterpreting its family semantics', () => {
    const request = createRuntimeProtocolRequest({
      id: 'request-123',
      family: 'graph.read',
      body: graphReadBody,
    });
    const body = { kind: 'graph-read-result', value: [{ id: 'book-1' }] } as const;
    const response = createRuntimeProtocolResponse(request, body);

    expect(response).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'request-123',
      kind: 'response',
      family: 'graph.read',
      body,
    });
    expect(parseRuntimeProtocolResponse(JSON.parse(JSON.stringify(response)), request)).toEqual({
      success: true,
      response,
    });
  });

  it.each([
    {
      name: 'request id',
      response: {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'request-other',
        kind: 'response',
        family: 'graph.read',
        body: { kind: 'graph-read-result', value: [] },
      },
    },
    {
      name: 'family',
      response: {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'request-123',
        kind: 'response',
        family: 'graph.command',
        body: { kind: 'graph-read-result', value: [] },
      },
    },
  ])('rejects a response with a mismatched $name', ({ response }) => {
    const request = createRuntimeProtocolRequest({
      id: 'request-123',
      family: 'graph.read',
      body: graphReadBody,
    });

    expect(parseRuntimeProtocolResponse(response, request)).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_response' } },
    });
  });

  it('accepts a correlated protocol error as a valid exchange response', () => {
    const request = createRuntimeProtocolRequest({
      id: 'request-123',
      family: 'graph.read',
      body: graphReadBody,
    });
    const response = runtimeProtocolError(
      'invalid_family_request',
      'The graph.read request is invalid.',
      { id: request.id, family: request.family },
    );

    expect(parseRuntimeProtocolResponse(response, request)).toEqual({
      success: true,
      response,
    });
  });

  it('rejects a protocol error that omits exchange correlation', () => {
    const request = createRuntimeProtocolRequest({
      id: 'request-123',
      family: 'graph.read',
      body: graphReadBody,
    });

    expect(
      parseRuntimeProtocolResponse(
        runtimeProtocolError('invalid_envelope', 'The request is invalid.'),
        request,
      ),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_response' } },
    });
  });
});
