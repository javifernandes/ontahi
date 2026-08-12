import {
  normalizeGraphSchemaClientInput,
  type InferGraphSchemaClientInput,
} from './client-input.js';
import type { GraphSchemaLike } from './definitions.js';
import { safeParseUnknownGraphSchema, type GraphSchemaParseResult } from './schema.js';

export type OperationInputSchema<
  TSchema extends GraphSchemaLike = GraphSchemaLike,
  TInput = InferGraphSchemaClientInput<TSchema>,
> = TSchema & {
  safeParse(draft: unknown): GraphSchemaParseResult<TInput>;
};

export const attachOperationInputSchema = <
  TSchema extends GraphSchemaLike,
  TInput = InferGraphSchemaClientInput<TSchema>,
>(
  schema: TSchema,
): OperationInputSchema<TSchema, TInput> => {
  const input = schema as OperationInputSchema<TSchema, TInput>;

  if (typeof input.safeParse === 'function') {
    return input;
  }

  Object.defineProperty(input, 'safeParse', {
    configurable: true,
    enumerable: false,
    value: (draft: unknown): GraphSchemaParseResult<TInput> => {
      try {
        const normalized = normalizeGraphSchemaClientInput(schema, draft);
        return safeParseUnknownGraphSchema(schema, normalized) as GraphSchemaParseResult<TInput>;
      } catch (error) {
        return {
          success: false,
          issues: [
            {
              code: 'invalid_operation_input',
              path: [],
              message:
                error instanceof Error
                  ? error.message
                  : 'Input does not match the operation schema.',
            },
          ],
        };
      }
    },
  });

  return input;
};
