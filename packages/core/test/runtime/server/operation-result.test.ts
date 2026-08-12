import { describe, expect, it } from 'vitest';

import {
  readOperationSuccessValue,
  toOperationInvocationResult,
} from '../../../src/runtime/server/index.js';

describe('operation result adapter', () => {
  it('unwraps operation data payloads as semantic operation values', () => {
    expect(
      toOperationInvocationResult({
        success: true,
        data: { title: 'Programming Book' },
      }),
    ).toEqual({
      ok: true,
      kind: 'success',
      value: { title: 'Programming Book' },
    });
  });

  it('uses the success payload when no data wrapper is present', () => {
    expect(
      readOperationSuccessValue({
        success: true,
        items: [{ id: 'thread-1' }],
        nextCursor: null,
      }),
    ).toEqual({
      items: [{ id: 'thread-1' }],
      nextCursor: null,
    });
  });

  it('passes modern operation values through without wrapping them again', () => {
    expect(
      toOperationInvocationResult({
        removed: true,
      }),
    ).toEqual({
      ok: true,
      kind: 'success',
      value: { removed: true },
    });
  });

  it('maps operation failure results to executed operation failures', () => {
    const operationFailure = {
      success: false,
      reason: 'not_found',
      message: 'Book not found.',
    };

    expect(toOperationInvocationResult(operationFailure)).toEqual({
      ok: false,
      kind: 'failed',
      executed: true,
      message: 'Book not found.',
      failure: operationFailure,
    });
  });
});
