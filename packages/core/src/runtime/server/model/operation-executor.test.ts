import { Effect, Fiber } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema, type InferGraphSchemaValue } from '../../../data-graph/index.js';

import { ModelInterpretationError, type ModelProvider } from './interpretation.js';
import {
  createModelOperationExecutor,
  modelOperation,
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
  it('builds an ordinary Operation run function from declarative context and instructions', async () => {
    const generate = vi
      .fn<ModelProvider['generate']>()
      .mockResolvedValue({ title: 'Set the table' });
    const run = modelOperation({
      provider: { generate },
      operation: request.operation,
      instructions: 'Suggest a missing step.',
      context: ({ goal }: InferGraphSchemaValue<typeof Input>) =>
        Effect.succeed({ currentGoal: goal }),
    });

    await expect(Effect.runPromise(run(request.input))).resolves.toEqual({
      title: 'Set the table',
    });
    expect(generate.mock.calls[0]![0]).toMatchObject({
      instructions: expect.stringContaining('Suggest a missing step.'),
      context: JSON.stringify({ currentGoal: 'Prepare dinner' }),
    });
  });

  it('runs declarative semantic validation with the assembled context', async () => {
    const validate = vi.fn((output: { title: string }, context: { currentGoal: string }) =>
      context.currentGoal === output.title
        ? Effect.fail('duplicate' as const)
        : Effect.succeed(output),
    );
    const run = modelOperation({
      provider: { generate: vi.fn().mockResolvedValue({ title: 'Prepare dinner' }) },
      operation: request.operation,
      context: ({ goal }: InferGraphSchemaValue<typeof Input>) =>
        Effect.succeed({ currentGoal: goal }),
      validate,
    });

    await expect(Effect.runPromise(Effect.either(run(request.input)))).resolves.toMatchObject({
      left: 'duplicate',
    });
    expect(validate).toHaveBeenCalledWith(
      { title: 'Prepare dinner' },
      { currentGoal: 'Prepare dinner' },
      request.input,
    );
  });

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

  it.each([
    ['model_cancelled', 'model_execution_cancelled'],
    ['model_output_invalid', 'model_output_invalid'],
  ] as const)('maps provider %s failures to %s', async (code, reason) => {
    const executor = createModelOperationExecutor({
      provider: {
        generate: vi
          .fn()
          .mockRejectedValue(new ModelInterpretationError(code, `Provider ${code}.`)),
      },
    });

    await expect(
      Effect.runPromise(Effect.either(executor.execute(request))),
    ).resolves.toMatchObject({ left: { reason, code } });
  });

  it('normalizes an unknown provider rejection without leaking its value', async () => {
    const executor = createModelOperationExecutor({
      provider: { generate: vi.fn().mockRejectedValue({ secret: 'opaque' }) },
    });

    await expect(
      Effect.runPromise(Effect.either(executor.execute(request))),
    ).resolves.toMatchObject({
      left: {
        reason: 'model_execution_failed',
        code: 'model_unavailable',
        message: 'Model execution failed.',
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
