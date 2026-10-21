import { Effect } from 'effect';

import {
  safeParseUnknownGraphSchema,
  toGraphJsonSchema,
  type GraphSchemaDefinition,
  type GraphSchemaValue,
} from '../../../data-graph/index.js';
import type { JsonValue } from '../../../value/json.js';
import { createOperationFailure } from '../failures.js';
import type { OperationFailure } from '../operation/types.js';

import { ModelInterpretationError, type ModelProvider } from './interpretation.js';

export type ModelOperationContract<TOutput extends GraphSchemaDefinition> = {
  readonly id: string;
  readonly description?: string;
  readonly input: GraphSchemaDefinition;
  readonly output: TOutput;
};

export type ModelOperationExecutionRequest<TInput, TOutput extends GraphSchemaDefinition> = {
  readonly operation: ModelOperationContract<TOutput>;
  readonly input: TInput;
  readonly context: JsonValue;
  readonly instructions?: string;
};

export type ModelOperationExecutionFailure = OperationFailure<
  'model_execution_cancelled' | 'model_execution_failed' | 'model_output_invalid',
  { readonly code: string; readonly issues?: unknown }
>;

export type ModelOperationExecutor = {
  execute<TInput, TOutput extends GraphSchemaDefinition>(
    request: ModelOperationExecutionRequest<TInput, TOutput>,
  ): Effect.Effect<GraphSchemaValue<TOutput>, ModelOperationExecutionFailure>;
};

export type CreateModelOperationExecutorOptions = {
  readonly provider: ModelProvider;
  readonly instructions?: string;
};

const failureFromProvider = (cause: unknown): ModelOperationExecutionFailure => {
  const code = cause instanceof ModelInterpretationError ? cause.code : 'model_unavailable';
  const reason =
    code === 'model_cancelled'
      ? 'model_execution_cancelled'
      : code === 'model_output_invalid'
        ? 'model_output_invalid'
        : 'model_execution_failed';
  return createOperationFailure(
    reason,
    cause instanceof Error ? cause.message : 'Model execution failed.',
    { code },
  );
};

const contractInstructions = <TOutput extends GraphSchemaDefinition>(
  request: ModelOperationExecutionRequest<unknown, TOutput>,
  commonInstructions: string | undefined,
) =>
  [
    commonInstructions,
    request.instructions,
    `Execute the already selected Domain Operation ${request.operation.id}.`,
    request.operation.description,
    `Input contract: ${JSON.stringify(toGraphJsonSchema(request.operation.input))}`,
    'Return only a value satisfying the supplied output schema.',
  ]
    .filter(Boolean)
    .join('\n');

export const createModelOperationExecutor = ({
  provider,
  instructions,
}: CreateModelOperationExecutorOptions): ModelOperationExecutor => {
  const execute = (
    request: ModelOperationExecutionRequest<unknown, GraphSchemaDefinition>,
  ): Effect.Effect<unknown, ModelOperationExecutionFailure> =>
    Effect.tryPromise({
      try: signal =>
        provider.generate({
          instructions: contractInstructions(request, instructions),
          context: JSON.stringify(request.context),
          prompt: JSON.stringify(request.input),
          outputSchema: toGraphJsonSchema(request.operation.output),
          signal,
        }),
      catch: failureFromProvider,
    }).pipe(
      Effect.flatMap(value => {
        const parsed = safeParseUnknownGraphSchema(request.operation.output, value);
        return parsed.success
          ? Effect.succeed(parsed.data)
          : Effect.fail(
              createOperationFailure(
                'model_output_invalid',
                `Model output does not satisfy ${request.operation.id}.`,
                { code: 'model_output_invalid', issues: parsed.issues },
              ),
            );
      }),
    );

  return { execute: execute as ModelOperationExecutor['execute'] };
};
