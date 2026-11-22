import { graphSchema } from '../../../data-graph/definitions.js';
import { query, type QuerySpec } from '../../../data-graph/query.js';
import {
  createRelatedRootReadSpec,
  type RelatedRootReadSpec,
} from '../../../data-graph/relation-root.js';
import { parseGraphSchema } from '../../../data-graph/schema.js';
import { resolveSelectionRelation } from '../../../data-graph/selection-relations.js';
import type { AnyEntityDefinition } from '../../../model/entity/definition.js';
import { createEntityIdentityRef } from '../../../model/entity/ref/identity.js';
import {
  hasRelationImage,
  selectionReferences,
  type SelectionExpression,
} from '../../../model/query/selection-ast.js';

import { InMemoryDataGraphError } from './command.js';

/** Evaluate relational membership inside a read, before shaping. Never used by Commands. */
export const lowerInMemoryRelationSelection = <TEntity extends AnyEntityDefinition, TResult>(
  spec: QuerySpec<TEntity, TResult>,
  entities: readonly AnyEntityDefinition[],
  evaluate: (read: RelatedRootReadSpec<any, any, any, any, any>) => Array<Record<string, unknown>>,
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
