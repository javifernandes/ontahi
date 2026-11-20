import type { GraphSchemaLike } from '../../value/schema/definition.js';

export type OperationInputParseResult<TInput> =
  | { success: true; data: TInput }
  | {
      success: false;
      issues: readonly {
        code: string;
        path: readonly (string | number)[];
        message: string;
      }[];
    };

export type PortableOperationInputSchema<
  TSchema extends GraphSchemaLike = GraphSchemaLike,
  TInput = unknown,
> = TSchema & {
  safeParse(draft: unknown): OperationInputParseResult<TInput>;
};
