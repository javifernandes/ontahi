import { describe, expect, it, vi } from 'vitest';

import { entity, field, graphSchema, Selection, value } from '../../src/data-graph/index.js';
import {
  isOperationInvocationProtocolResponse,
  parseOperationInvocationRequest,
} from '../../src/runtime/operation-invocation.js';

describe('operation invocation protocol', () => {
  it('parses invocation and permission messages', () => {
    expect(
      parseOperationInvocationRequest({
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { title: 'Ontahi' },
      }),
    ).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { title: 'Ontahi' },
      },
    });

    expect(
      parseOperationInvocationRequest({
        kind: 'check-permission',
        operationId: 'Book.rename',
        input: {},
      }),
    ).toMatchObject({ success: true });
  });

  it('parses invocation messages without an input for void operations', () => {
    expect(
      parseOperationInvocationRequest({
        kind: 'invoke',
        operationId: 'Todo.list',
      }),
    ).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: 'Todo.list',
        input: undefined,
      },
    });
  });

  it('rejects malformed transport messages', () => {
    expect(parseOperationInvocationRequest({ operationId: 'Book.rename', input: {} })).toEqual({
      success: false,
      error: {
        kind: 'protocol-error',
        error: {
          code: 'invalid_request',
          message: 'Operation invocation kind must be "invoke" or "check-permission".',
        },
      },
    });
  });

  it('recognizes protocol responses without depending on transport envelopes', () => {
    expect(
      isOperationInvocationProtocolResponse({
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: 'done' },
      }),
    ).toBe(true);
    expect(isOperationInvocationProtocolResponse({ data: { success: true } })).toBe(false);
  });
});

describe('operation invocation dispatcher', () => {
  const operation = {
    kind: 'domain-operation' as const,
    id: 'Book.rename',
    entityName: 'Book',
    name: 'rename',
    authority: 'server' as const,
    exposure: 'bridge' as const,
    input: value('RenameBookInput', { title: field.nonEmptyString() }),
    inputRefs: undefined,
    layer: 'books',
    run: vi.fn(),
  };

  it('resolves, validates, and invokes an operation', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const invokeOperation = vi.fn(async (_operation, input) => ({
      ok: true as const,
      kind: 'success' as const,
      value: input,
    }));
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => operation,
      invokeOperation,
      checkPermission: async () => ({ allowed: true }),
    });

    await expect(
      dispatcher({
        kind: 'invoke',
        operationId: operation.id,
        input: { title: 'Ontahi' },
      }),
    ).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { title: 'Ontahi' },
      },
    });
    expect(invokeOperation).toHaveBeenCalledWith(operation, { title: 'Ontahi' });
  });

  it('hydrates transported selections before invoking an operation', async () => {
    const Book = entity('Book', { id: field.id(), status: field.string() });
    const selectionOperation = {
      ...operation,
      id: 'Book.archiveMany',
      name: 'archiveMany',
      input: value('ArchiveManyInput', {
        books: graphSchema.selection(Book, { cardinality: 'many' }),
      }),
    };
    const invokeOperation = vi.fn(async (_operation, input) => ({
      ok: true as const,
      kind: 'success' as const,
      value: input,
    }));
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => selectionOperation,
      invokeOperation,
      checkPermission: async () => ({ allowed: true }),
    });

    await dispatcher({
      kind: 'invoke',
      operationId: selectionOperation.id,
      input: {
        books: {
          kind: 'selection',
          entityName: 'Book',
          expression: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'status',
            value: 'draft',
          },
        },
      },
    });

    const hydratedInput = invokeOperation.mock.calls[0]?.[1] as { books: Selection<typeof Book> };
    expect(hydratedInput.books).toBeInstanceOf(Selection);
    expect(hydratedInput.books.root).toBe(Book);
    expect(hydratedInput.books.build()).toMatchObject({ fieldName: 'status', value: 'draft' });
  });

  it('returns normalized validation issues without exposing Zod errors', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => operation,
      invokeOperation: vi.fn(),
      checkPermission: vi.fn(),
    });

    await expect(
      dispatcher({ kind: 'invoke', operationId: operation.id, input: { title: '' } }),
    ).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'input_invalid',
        executed: false,
        message: 'Input does not match the operation schema.',
        issues: [
          {
            path: 'title',
            code: 'too_small',
            message: 'Too small: expected string to have >=1 characters',
          },
        ],
      },
    });
  });

  it('normalizes unexpected validation errors as protocol unavailability', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const failure = new Error('validator unavailable');
    const reportError = vi.fn();
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => ({
        ...operation,
        input: graphSchema.transform(operation.input, () => {
          throw failure;
        }),
      }),
      invokeOperation: vi.fn(),
      checkPermission: vi.fn(),
      reportError,
    });
    const request = {
      kind: 'invoke' as const,
      operationId: operation.id,
      input: { title: 'Ontahi' },
    };

    await expect(dispatcher(request)).resolves.toEqual({
      kind: 'protocol-error',
      error: {
        code: 'invocation_unavailable',
        message: 'Operation input validation is temporarily unavailable.',
      },
    });
    expect(reportError).toHaveBeenCalledWith(failure, request);
  });

  it('uses semantic responses for unknown operations and permission checks', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => undefined,
      invokeOperation: vi.fn(),
      checkPermission: vi.fn(),
    });

    await expect(
      dispatcher({ kind: 'invoke', operationId: 'Book.missing', input: {} }),
    ).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: false, kind: 'rejected', reason: 'unknown_operation' },
    });
    await expect(
      dispatcher({ kind: 'check-permission', operationId: 'Book.missing', input: {} }),
    ).resolves.toMatchObject({
      kind: 'permission-result',
      result: { allowed: false, reason: 'unknown_operation' },
    });
  });

  it('returns denied permission results without invoking the operation', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const invokeOperation = vi.fn();
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => operation,
      invokeOperation,
      checkPermission: async () => ({
        allowed: false,
        reason: 'forbidden',
        message: 'You cannot rename this book.',
      }),
    });

    await expect(
      dispatcher({
        kind: 'check-permission',
        operationId: operation.id,
        input: { title: 'Ontahi' },
      }),
    ).resolves.toEqual({
      kind: 'permission-result',
      result: {
        allowed: false,
        reason: 'forbidden',
        message: 'You cannot rename this book.',
      },
    });
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it('preserves expected operation failures as invocation results', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => operation,
      invokeOperation: async () => ({
        ok: false,
        kind: 'failed',
        executed: true,
        failure: { reason: 'title_conflict' },
        message: 'Another book already uses this title.',
      }),
      checkPermission: async () => ({ allowed: true }),
    });

    await expect(
      dispatcher({
        kind: 'invoke',
        operationId: operation.id,
        input: { title: 'Ontahi' },
      }),
    ).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'failed',
        executed: true,
        failure: { reason: 'title_conflict' },
        message: 'Another book already uses this title.',
      },
    });
  });

  it('normalizes unexpected execution errors and reports them', async () => {
    const { createOperationInvocationDispatcher } =
      await import('../../src/runtime/server/operation-invocation.js');
    const reportError = vi.fn();
    const failure = new Error('database offline');
    const dispatcher = createOperationInvocationDispatcher({
      resolveOperation: () => operation,
      invokeOperation: async () => {
        throw failure;
      },
      checkPermission: async () => ({ allowed: true }),
      reportError,
    });
    const request = { kind: 'invoke' as const, operationId: operation.id, input: { title: 'x' } };

    await expect(dispatcher(request)).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'errored',
        executed: 'unknown',
        message: 'Operation execution is temporarily unavailable.',
      },
    });
    expect(reportError).toHaveBeenCalledWith(failure, request);
  });
});
