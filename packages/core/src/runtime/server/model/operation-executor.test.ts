import { Effect, Fiber } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema, type InferGraphSchemaValue } from '../../../data-graph/index.js';
import { withInvocationContext } from '../invocation-context.js';
import { runServerOperation } from '../operation/run.js';
import { createOperationRunner } from '../operation/runner.js';
import { projectCurrentResourceEvidence } from '../resource-evidence.js';
import { withSemanticExecutionActivity } from '../semantic-execution.js';

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
  it('uses general Operation resilience for provider and structured-output failures', async () => {
    const generate = vi
      .fn<ModelProvider['generate']>()
      .mockRejectedValueOnce(new ModelInterpretationError('model_unavailable', 'Try again.'))
      .mockImplementationOnce(async providerRequest => {
        providerRequest.reportUsage?.({
          provider: 'deepseek',
          model: 'deepseek-test',
          totalTokens: 12,
        });
        return { title: '' };
      })
      .mockImplementationOnce(async providerRequest => {
        providerRequest.reportUsage?.({
          provider: 'deepseek',
          model: 'deepseek-test',
          totalTokens: 24,
        });
        return { title: 'Set the table' };
      });
    const run = modelOperation({
      provider: { generate },
      operation: request.operation,
      context: ({ goal }: InferGraphSchemaValue<typeof Input>) =>
        Effect.succeed({ currentGoal: goal }),
    });
    const suggest = createOperationRunner(
      run,
      {
        scope: request.operation.id,
        execution: {
          retry: {
            maxAttempts: 3,
            when: ['model_execution_failed', 'model_output_invalid'],
          },
        },
      },
      runServerOperation,
    );

    await withInvocationContext(
      { modelResourceLimits: { maxAttempts: 3 }, resourceEvidenceDisclosure: 'debug' },
      async () => {
        await expect(suggest(request.input)).resolves.toEqual({
          success: true,
          data: { title: 'Set the table' },
        });
        const evidence = projectCurrentResourceEvidence();
        expect(evidence).toMatchObject({ visibility: 'debug' });
        if (!evidence || evidence.visibility !== 'debug')
          throw new Error('Expected debug evidence');
        expect(
          evidence.model.attemptOutcomes?.map(
            attempt => attempt.activity?.operationAttempt?.ordinal,
          ),
        ).toEqual([1, 2, 3]);
        expect(
          new Set(
            evidence.model.attemptOutcomes?.map(
              attempt => attempt.activity?.operationAttempt?.attemptId,
            ),
          ).size,
        ).toBe(3);
        expect(
          evidence.model.attempts.map(usage => usage.activity?.operationAttempt?.ordinal),
        ).toEqual([2, 3]);
      },
    );

    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('builds an ordinary Operation run function from declarative context and instructions', async () => {
    const generate = vi.fn<ModelProvider['generate']>(async request => {
      request.reportUsage?.({
        provider: 'anthropic',
        model: 'claude-test',
        totalTokens: 42,
        activity: {
          attemptId: 'provider-forged-attempt',
          correlationId: 'provider-forged-correlation',
        },
      });
      return { title: 'Set the table' };
    });
    const reportUsage = vi.fn();
    const run = modelOperation({
      provider: { generate },
      operation: request.operation,
      instructions: 'Suggest a missing step.',
      context: ({ goal }: InferGraphSchemaValue<typeof Input>) =>
        Effect.succeed({ currentGoal: goal }),
      reportUsage,
    });

    await expect(Effect.runPromise(run(request.input))).resolves.toEqual({
      title: 'Set the table',
    });
    expect(generate.mock.calls[0]![0]).toMatchObject({
      instructions: expect.stringContaining('Suggest a missing step.'),
      context: JSON.stringify({ currentGoal: 'Prepare dinner' }),
    });
    expect(reportUsage).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-test',
      totalTokens: 42,
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

  it('does not fail a valid Operation when usage reporting throws', async () => {
    const usage = { provider: 'openai', model: 'gpt-test', totalTokens: 12 };
    const executor = createModelOperationExecutor({
      provider: {
        generate: async providerRequest => {
          providerRequest.reportUsage?.(usage);
          return { title: 'Set the table' };
        },
      },
      reportUsage: () => {
        throw new Error('Telemetry unavailable.');
      },
    });

    await expect(Effect.runPromise(executor.execute(request))).resolves.toEqual({
      title: 'Set the table',
    });
  });

  it('captures provider usage for host projection without an application reporter', async () => {
    const executor = createModelOperationExecutor({
      provider: {
        generate: async providerRequest => {
          providerRequest.reportUsage?.({
            provider: 'openai',
            model: 'gpt-test',
            totalTokens: 12,
          });
          return { title: 'Set the table' };
        },
      },
    });

    await withInvocationContext({ resourceEvidenceDisclosure: 'debug' }, async () => {
      await Effect.runPromise(executor.execute(request));
      expect(projectCurrentResourceEvidence()).toMatchObject({
        visibility: 'debug',
        model: { attempts: [{ provider: 'openai', model: 'gpt-test', totalTokens: 12 }] },
      });
    });
  });

  it('attributes each provider attempt to its causal Operation without exposing domain input', async () => {
    const reportUsage = vi.fn();
    const generate = vi.fn<ModelProvider['generate']>(async providerRequest => {
      providerRequest.reportUsage?.({ provider: 'openai', model: 'gpt-test', totalTokens: 12 });
      return { title: 'Set the table' };
    });
    const executor = createModelOperationExecutor({
      provider: { generate },
      reportUsage,
    });

    await withInvocationContext(
      {
        origin: { channel: 'web', surface: 'todo-autocomplete', clientInstanceId: 'tab-1' },
        modelResourceLimits: { maxAttempts: 2, maxOutputTokens: 256 },
      },
      () =>
        withSemanticExecutionActivity(
          { kind: 'operation', id: request.operation.id, runId: 'operation-run-1' },
          () => Effect.runPromise(executor.execute(request)),
        ),
    );

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 256 }));

    expect(reportUsage).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-test',
      totalTokens: 12,
      activity: {
        attemptId: expect.any(String),
        correlationId: expect.any(String),
        causationId: expect.any(String),
        owner: { kind: 'operation', id: request.operation.id, runId: 'operation-run-1' },
        origin: {
          channel: 'web',
          surface: 'todo-autocomplete',
          clientInstanceId: 'tab-1',
        },
        admission: { attempt: 1, maxAttempts: 2, maxOutputTokens: 256 },
      },
    });
  });

  it('reports a correlated attempt without inventing an owner or origin at the root', async () => {
    const reportUsage = vi.fn();
    const executor = createModelOperationExecutor({
      provider: {
        generate: async providerRequest => {
          providerRequest.reportUsage?.({ provider: 'ollama', model: 'local-test' });
          return { title: 'Set the table' };
        },
      },
      reportUsage,
    });

    await withInvocationContext({}, () => Effect.runPromise(executor.execute(request)));

    expect(reportUsage).toHaveBeenCalledWith({
      provider: 'ollama',
      model: 'local-test',
      activity: {
        attemptId: expect.any(String),
        correlationId: expect.any(String),
        causationId: expect.any(String),
      },
    });
  });

  it('rejects an exhausted attempt before calling or disclosing context to the provider', async () => {
    const generate = vi.fn<ModelProvider['generate']>().mockResolvedValue({
      title: 'Set the table',
    });
    const executor = createModelOperationExecutor({ provider: { generate } });

    await withInvocationContext({ modelResourceLimits: { maxAttempts: 1 } }, async () => {
      await expect(Effect.runPromise(executor.execute(request))).resolves.toEqual({
        title: 'Set the table',
      });
      await expect(
        Effect.runPromise(Effect.either(executor.execute(request))),
      ).resolves.toMatchObject({
        left: {
          reason: 'model_resource_exhausted',
          code: 'model_resource_exhausted',
          message: 'Model generation attempt limit exhausted (1).',
        },
      });
    });

    expect(generate).toHaveBeenCalledOnce();
  });

  it('counts a failed provider attempt before a successful retry without claiming complete usage', async () => {
    const generate = vi
      .fn<ModelProvider['generate']>()
      .mockRejectedValueOnce(new ModelInterpretationError('model_unavailable', 'Try again.'))
      .mockImplementationOnce(async providerRequest => {
        providerRequest.reportUsage?.({
          provider: 'openai',
          model: 'gpt-test',
          totalTokens: 12,
          durationMs: 25,
        });
        return { title: 'Set the table' };
      });
    const executor = createModelOperationExecutor({ provider: { generate } });

    await withInvocationContext(
      {
        modelResourceLimits: { maxAttempts: 3 },
        resourceEvidenceDisclosure: 'summary',
      },
      async () => {
        await expect(
          Effect.runPromise(Effect.either(executor.execute(request))),
        ).resolves.toMatchObject({
          left: { reason: 'model_execution_failed', code: 'model_unavailable' },
        });
        await expect(Effect.runPromise(executor.execute(request))).resolves.toEqual({
          title: 'Set the table',
        });
        expect(projectCurrentResourceEvidence()).toEqual({
          visibility: 'summary',
          model: { attempts: 2, reportedAttempts: 1, failedAttempts: 1 },
        });
      },
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

  it('recognizes an unwrapped provider AbortError as cancellation', async () => {
    const executor = createModelOperationExecutor({
      provider: {
        generate: vi
          .fn()
          .mockRejectedValue(new DOMException('The request was aborted.', 'AbortError')),
      },
    });

    await expect(
      Effect.runPromise(Effect.either(executor.execute(request))),
    ).resolves.toMatchObject({
      left: { reason: 'model_execution_cancelled', code: 'model_cancelled' },
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
