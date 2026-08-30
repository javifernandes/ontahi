import { describe, expect, expectTypeOf, it } from 'vitest';

import { isRecord } from '../../value/object.js';

import { createRuntimeProtocolRequest } from './envelope.js';
import { createRuntimeProtocolRegistry, defineRuntimeProtocolFamily } from './registry.js';

const echoFamily = defineRuntimeProtocolFamily({
  name: 'test.echo',
  parseRequest: (value: unknown) =>
    isRecord(value) && typeof value.message === 'string'
      ? { success: true as const, request: { message: value.message.trim() } }
      : {
          success: false as const,
          error: { code: 'invalid_message', message: 'A message is required.' },
        },
});

describe('Runtime Protocol family registry', () => {
  it('delegates body parsing and returns one canonical typed family request', () => {
    const registry = createRuntimeProtocolRegistry([echoFamily] as const);
    const result = registry.parseRequest(
      createRuntimeProtocolRequest({
        id: 'request-echo',
        family: 'test.echo',
        body: { message: '  hello  ' },
      }),
    );

    expect(result).toEqual({
      success: true,
      request: {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'request-echo',
        kind: 'request',
        family: 'test.echo',
        body: { message: 'hello' },
      },
    });
    if (result.success) {
      expectTypeOf(result.request.body).toEqualTypeOf<{ message: string }>();
    }
  });

  it('rejects an unknown family before any family parser runs', () => {
    const registry = createRuntimeProtocolRegistry([echoFamily] as const);

    expect(
      registry.parseRequest(
        createRuntimeProtocolRequest({
          id: 'request-unknown',
          family: 'test.missing',
          body: { message: 'hello' },
        }),
      ),
    ).toMatchObject({
      success: false,
      error: {
        id: 'request-unknown',
        family: 'test.missing',
        error: { code: 'unknown_family' },
      },
    });
  });

  it('preserves a JSON-safe family parse error without exposing execution', () => {
    const registry = createRuntimeProtocolRegistry([echoFamily] as const);

    expect(
      registry.parseRequest(
        createRuntimeProtocolRequest({
          id: 'request-invalid',
          family: 'test.echo',
          body: { text: 'not a message' },
        }),
      ),
    ).toEqual({
      success: false,
      error: {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'request-invalid',
        kind: 'protocol-error',
        family: 'test.echo',
        error: {
          code: 'invalid_family_request',
          message: 'Runtime Protocol family test.echo rejected its request body.',
          details: {
            familyError: { code: 'invalid_message', message: 'A message is required.' },
          },
        },
      },
    });
  });

  it('rejects malformed outer envelopes before family parsing', () => {
    const registry = createRuntimeProtocolRegistry([echoFamily] as const);

    expect(registry.parseRequest(null)).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_envelope' } },
    });
  });

  it('rejects non-JSON family results without leaking non-JSON errors', () => {
    const invalidCanonicalFamily = defineRuntimeProtocolFamily({
      name: 'test.invalid-canonical',
      parseRequest: () => ({ success: true as const, request: { run: () => undefined } }),
    });
    const nonJsonErrorFamily = defineRuntimeProtocolFamily({
      name: 'test.non-json-error',
      parseRequest: () => ({ success: false as const, error: new Error('private error') }),
    });
    const registry = createRuntimeProtocolRegistry([
      invalidCanonicalFamily,
      nonJsonErrorFamily,
    ] as const);

    expect(
      registry.parseRequest(
        createRuntimeProtocolRequest({
          id: 'request-invalid-canonical',
          family: 'test.invalid-canonical',
          body: {},
        }),
      ),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_family_request' } },
    });
    expect(
      registry.parseRequest(
        createRuntimeProtocolRequest({
          id: 'request-private-error',
          family: 'test.non-json-error',
          body: {},
        }),
      ),
    ).toEqual({
      success: false,
      error: {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'request-private-error',
        kind: 'protocol-error',
        family: 'test.non-json-error',
        error: {
          code: 'invalid_family_request',
          message: 'Runtime Protocol family test.non-json-error rejected its request body.',
        },
      },
    });
  });

  it('rejects duplicate and invalid family registration eagerly', () => {
    expect(() => createRuntimeProtocolRegistry([echoFamily, echoFamily])).toThrow(
      'Duplicate Runtime Protocol family test.echo.',
    );
    expect(() =>
      defineRuntimeProtocolFamily({
        name: 'Not A Family',
        parseRequest: echoFamily.parseRequest,
      }),
    ).toThrow('Invalid Runtime Protocol family name "Not A Family".');
    expect(() =>
      createRuntimeProtocolRegistry([
        { name: 'Not A Family', parseRequest: echoFamily.parseRequest },
      ]),
    ).toThrow('Invalid Runtime Protocol family name "Not A Family".');
  });
});
