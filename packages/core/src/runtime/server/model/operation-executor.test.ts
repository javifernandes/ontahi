import { Effect, Fiber } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema, type InferGraphSchemaValue } from '../../../data-graph/index.js';

import { ModelInterpretationError, type ModelProvider } from './interpretation.js';
import {
  createModelOperationExecutor,
  type ModelOperationExecutionRequest,
} from './operation-executor.js';

const Input = graphSchema.object({ goal: field.nonEmptyString({ trim: true }) });
const Output = graphSchema.object({ title: field.nonEmptyString({ trim: true }) });

const request = {
  operation: {
    id: 'TodoList.suggestNextItem',
    description: 'Suggest one useful next Todo item.',
    input: Input,
    output: Output,
  },
  input: { goal: 'Prepare dinner' },
  context: {
    list: { id: 'list-1', name: 'Dinner' },
    items: [{ id: 'item-1', title: 'Buy vegetables', completed: false }],
  },
} satisfies ModelOperationExecutionRequest<InferGraphSchemaValue<typeof Input>, typeof Output>;

describe('model-backed Operation executor', () => {
  it('supplies the semantic contract, input, context, and output schema to the provider', async () => {
    const generate = vi.fn<ModelProvider['generate']>().mockResolvedValue({
      title: '  Set the table  ',
    });
    const executor = createModelOperationExecutor({ provider: { generate } });

    await expect(Effect.runPromise(executor.execute(request))).resolves.toEqual({
      title: 'Set the table',
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0]).toMatchObject({
      instructions: expect.stringContaining('TodoList.suggestNextItem'),
      context: JSON.stringify(request.context),
      prompt: JSON.stringify(request.input),
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
      },
      signal: expect.any(AbortSignal),
    });
    expect(generate.mock.calls[0]![0].instructions).toContain(
      'Input contract: {"type":"object","properties":{"goal":{"type":"string","minLength":1}},"required":["goal"],"additionalProperties":false}',
    );
  });

  it('rejects provider output that does not satisfy the Operation output contract', async () => {
    const executor = createModelOperationExecutor({
      provider: { generate: vi.fn().mockResolvedValue({ title: '' }) },
    });

    await expect(
      Effect.runPromise(Effect.either(executor.execute(request))),
    ).resolves.toMatchObject({
      left: { reason: 'model_output_invalid', code: 'model_output_invalid' },
    });
  });

  it('preserves provider failure categories as honest Operation failures', async () => {
    const executor = createModelOperationExecutor({
      provider: {
        generate: vi
          .fn()
          .mockRejectedValue(
            new ModelInterpretationError('model_unavailable', 'Model is offline.'),
          ),
      },
    });

    await expect(
      Effect.runPromise(Effect.either(executor.execute(request))),
    ).resolves.toMatchObject({
      left: {
        reason: 'model_execution_failed',
        code: 'model_unavailable',
        message: 'Model is offline.',
      },
    });
  });

  it('propagates Effect interruption to the provider AbortSignal', async () => {
    let providerSignal: AbortSignal | undefined;
    const executor = createModelOperationExecutor({
      provider: {
        generate: ({ signal }) => {
          providerSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    const fiber = Effect.runFork(executor.execute(request));

    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(providerSignal?.aborted).toBe(true);
  });
});
