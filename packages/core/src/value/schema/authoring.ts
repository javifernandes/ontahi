import type { GraphLiteralDefinition, GraphVoidDefinition } from './definition.js';
import type { GraphSchemaPresentation } from './presentation.js';

export const graphLiteral = <const TValue extends string | number | boolean | null>(
  literalValue: TValue,
): GraphLiteralDefinition<TValue> => ({
  kind: 'schema.literal',
  value: literalValue,
});

export const graphVoid = (): GraphVoidDefinition => ({ kind: 'schema.void' });

export const describeGraphSchema = <TSchema extends object>(
  schema: TSchema,
  description: string,
): TSchema => ({ ...schema, description });

export const presentGraphSchema = <TSchema extends object>(
  schema: TSchema,
  presentation: GraphSchemaPresentation,
): TSchema => ({ ...schema, presentation });
