import { describe, expect, it } from 'vitest';

import { withInvocationContext } from './invocation-context.js';
import {
  getCurrentSemanticExecutionContext,
  withSemanticExecutionActivity,
} from './semantic-execution.js';

describe('semantic execution context', () => {
  it('creates one runtime-owned causal family and derives distinct child activities', () => {
    withInvocationContext(
      {
        principal: { kind: 'user', subject: 'user-1' },
        origin: { channel: 'web', surface: 'command-chat', clientInstanceId: 'tab-1' },
      },
      () => {
        const root = getCurrentSemanticExecutionContext();
        expect(root).toMatchObject({
          executionId: expect.any(String),
          correlationId: expect.any(String),
          origin: { channel: 'web', surface: 'command-chat', clientInstanceId: 'tab-1' },
        });
        expect(root?.executionId).toBe(root?.correlationId);

        withSemanticExecutionActivity({ kind: 'operation', id: 'TodoList.create' }, () => {
          const operation = getCurrentSemanticExecutionContext();
          expect(operation).toMatchObject({
            correlationId: root?.correlationId,
            causationId: root?.executionId,
            parentExecutionId: root?.executionId,
            subject: { kind: 'operation', id: 'TodoList.create' },
            origin: { clientInstanceId: 'tab-1' },
          });
          expect(operation?.executionId).not.toBe(root?.executionId);
        });
      },
    );
    expect(getCurrentSemanticExecutionContext()).toBeUndefined();
  });

  it('keeps receiver-admitted client provenance separate across otherwise identical principals', () => {
    const executions = ['tab-1', 'tab-2'].map(clientInstanceId =>
      withInvocationContext(
        {
          principal: { kind: 'user', subject: 'user-1' },
          origin: { channel: 'web', clientInstanceId },
        },
        () => getCurrentSemanticExecutionContext(),
      ),
    );

    expect(executions[0]?.origin?.clientInstanceId).toBe('tab-1');
    expect(executions[1]?.origin?.clientInstanceId).toBe('tab-2');
    expect(executions[0]?.executionId).not.toBe(executions[1]?.executionId);
    expect(executions[0]?.correlationId).not.toBe(executions[1]?.correlationId);
  });
});
