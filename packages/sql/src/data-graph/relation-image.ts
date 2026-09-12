import {
  resolveRelationFields,
  getEntityIdentityLocator,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import type { SqlDialect } from './dialect.js';
import type { SqlEntityMapping } from './mapping.js';

/** A relational image is a semijoin: shared targets appear once, including under NOT/OR. */
export const compileRelationImage = (
  image: Extract<SelectionExpression, { kind: 'relation-image' }>,
  target: SqlEntityMapping,
  context: { mappings: readonly SqlEntityMapping[]; qualifier: string; nextAlias: () => string },
  dialect: SqlDialect,
  compileSource: (
    expression: SelectionExpression,
    mapping: SqlEntityMapping,
    qualifier: string,
  ) => string,
): string => {
  const sources = context.mappings.filter(
    mapping => mapping.entity.name === image.source.entityName,
  );
  if (sources.length !== 1)
    throw new TypeError(
      `Expected one SQL mapping for Selection source ${image.source.entityName}; received ${sources.length}.`,
    );
  const source = sources[0]!;
  const relation = Object.prototype.hasOwnProperty.call(source.entity.relations, image.relationName)
    ? source.entity.relations[image.relationName]
    : undefined;
  if (!relation || relation.target !== target.entity)
    throw new TypeError(
      `SQL relation ${source.entity.name}.${image.relationName} does not target the registered ${target.entity.name} definition.`,
    );
  const quote = dialect.quoteIdentifier;
  const column = (alias: string, name: string) => `${quote(alias)}.${quote(name)}`;
  const sourceAlias = context.nextAlias();
  const membership = compileSource(image.source.expression, source, sourceAlias);
  let from = `${quote(source.table)} AS ${quote(sourceAlias)}`;
  let correlation: string;
  if (relation.relationKind === 'manyToMany') {
    const mapping = relation.mapping;
    const sourceIdentity = getEntityIdentityLocator(source.entity)?.locator.fields;
    const targetIdentity = getEntityIdentityLocator(target.entity)?.locator.fields;
    if (sourceIdentity?.length !== 1 || targetIdentity?.length !== 1)
      throw new TypeError(
        `SQL many-to-many Selection ${source.entity.name}.${image.relationName} requires single-field identities; composite edge joins are not supported.`,
      );
    if (
      !mapping ||
      mapping.type !== 'many-to-many' ||
      mapping.fromTable !== source.table ||
      mapping.toTable !== target.table ||
      source.columns[sourceIdentity[0]!] !== mapping.fromColumn ||
      target.columns[targetIdentity[0]!] !== mapping.toColumn
    )
      throw new TypeError(
        `SQL many-to-many Selection ${source.entity.name}.${image.relationName} requires matching relation and Entity mappings.`,
      );
    const edges = context.nextAlias();
    from += ` JOIN ${quote(mapping.throughTable)} AS ${quote(edges)} ON ${column(edges, mapping.throughFromColumn)} = ${column(sourceAlias, mapping.fromColumn)}`;
    correlation = `${column(edges, mapping.throughToColumn)} = ${column(context.qualifier, mapping.toColumn)}`;
  } else {
    const fields = resolveRelationFields(source.entity, image.relationName, {
      entity: target.entity,
    });
    const sourceColumn = source.columns[fields.sourceField];
    const targetColumn = target.columns[fields.targetField];
    if (!sourceColumn || !targetColumn)
      throw new TypeError(
        `SQL Selection relation ${source.entity.name}.${image.relationName} has unmapped join fields.`,
      );
    correlation = `${column(sourceAlias, sourceColumn)} = ${column(context.qualifier, targetColumn)}`;
  }
  return `EXISTS (SELECT 1 FROM ${from} WHERE ${correlation} AND ${membership})`;
};
