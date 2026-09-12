import { graphSchema, type AnyEntityDefinition } from '../definitions.js';
import { query, type QuerySpec } from '../query.js';
import { createEntityIdentityRef } from '../ref/index.js';
import { createRelatedRootReadSpec, type RelatedRootReadSpec } from '../relation-root.js';
import { parseGraphSchema } from '../schema.js';
import {
  hasRelationImage,
  selectionReferences,
  type SelectionExpression,
} from '../selection-ast.js';
import { resolveSelectionRelation } from '../selection-relations.js';

import { InMemoryDataGraphError } from './command.js';

/** Evaluate relational membership inside a read, before shaping. Never used by Commands. */
export const lowerInMemoryRelationSelection = <TEntity extends AnyEntityDefinition, TResult>(
  spec: QuerySpec<TEntity, TResult>,
  entities: readonly AnyEntityDefinition[],
  evaluate: (read: RelatedRootReadSpec) => Array<Record<string, unknown>>,
): QuerySpec<TEntity, TResult> => {
  if (!hasRelationImage(spec.selection)) return spec;
  const lower = (
    entity: AnyEntityDefinition,
    expression: SelectionExpression,
  ): SelectionExpression => {
    if (expression.kind === 'relation-image') {
      const source = resolveSelectionRelation(entity, expression, entities);
      const rows = evaluate(
        createRelatedRootReadSpec({
          mode: 'rows',
          source: query(source)
            .where(() => lower(source, expression.source.expression))
            .build(),
          sourceEntity: source,
          target: query(entity).build(),
          relationName: expression.relationName,
          relationOwner: 'source',
        }),
      );
      return selectionReferences(
        rows.map(row => {
          const ref = createEntityIdentityRef(entity, row);
          if (!ref)
            throw new TypeError(
              `Relation-image target ${entity.name} requires canonical identity.`,
            );
          return ref;
        }),
      );
    }
    if (expression.kind === 'and' || expression.kind === 'or') {
      return {
        ...expression,
        operands: expression.operands.map(operand => lower(entity, operand)),
      };
    }
    return expression.kind === 'not'
      ? { ...expression, operand: lower(entity, expression.operand) }
      : expression;
  };
  try {
    const parsed = parseGraphSchema(graphSchema.selection(spec.root, { entities }), {
      kind: 'selection',
      entityName: spec.root.name,
      expression: spec.selection,
    });
    return { ...spec, selection: lower(spec.root, parsed.expression) };
  } catch (cause) {
    throw new InMemoryDataGraphError(
      cause instanceof Error ? cause.message : 'Invalid relation-image Selection.',
      'read_failed',
      cause,
    );
  }
};
